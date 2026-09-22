/**
 * Client-side skill importer for `.md` files and `.zip` archives.
 *
 * A skill is pure text, so only Markdown is ever read: every other entry
 * (scripts, binaries, configs, macOS `__MACOSX/` + `._*` resource forks,
 * dot-files) is skipped by name, never decoded. The ZIP is parsed through the
 * End-of-Central-Directory record + central directory — the local headers'
 * size fields are 0 when general-purpose bit 3 (data descriptor) is set, as in
 * archives made by macOS Finder, so they can't be trusted for sizes.
 *
 * Limits: upload ≤ 5 MB, ≤ 50 markdown entries, each entry ≤ 256 KB *after*
 * inflating (enforced while streaming, so a zip bomb is cut off early), no NUL
 * bytes. ZIP64 and encrypted entries are not supported.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_MD_ENTRIES = 50;
export const MAX_ENTRY_BYTES = 256 * 1024;

export interface ExtractedMarkdown {
  /** Path inside the archive (or the file name) — unique per archive. */
  filename: string;
  content: string;
}

export type ExtractErrorCode =
  | "uploadTooLarge"
  | "entryTooLarge"
  | "unsupportedType"
  | "binary"
  | "invalidZip"
  | "corruptZip"
  | "tooManyEntries"
  | "noMarkdown";

/**
 * A user-facing extraction failure. `code` (+ `params`) is what the UI
 * translates; `message` is English for logs/tests only — never shown, and
 * never matched on (the 256 KB check used to key off the message text).
 */
export class ExtractError extends Error {
  constructor(
    public readonly code: ExtractErrorCode,
    message: string,
    public readonly params: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

const tooLarge = (name: string) =>
  new ExtractError("entryTooLarge", `"${name}" exceeds the 256 KB limit.`, { name });

/** The part of `File` we need — lets tests pass a plain object. */
export type UploadedFile = Pick<File, "name" | "size" | "arrayBuffer">;

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

const isMarkdownName = (name: string) => name.toLowerCase().endsWith(".md");

export async function extractMarkdownFiles(file: UploadedFile): Promise<ExtractedMarkdown[]> {
  if (file.size > MAX_UPLOAD_BYTES) throw new ExtractError("uploadTooLarge", "File exceeds the 5 MB upload limit.");
  const lower = file.name.toLowerCase();
  if (isMarkdownName(lower)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_ENTRY_BYTES) throw tooLarge(file.name);
    return [{ filename: file.name, content: decodeText(bytes, file.name) }];
  }
  if (lower.endsWith(".zip")) return extractFromZip(new Uint8Array(await file.arrayBuffer()));
  throw new ExtractError("unsupportedType", "Unsupported file type. Upload a .md file or a .zip archive.");
}

function decodeText(bytes: Uint8Array, name: string): string {
  if (bytes.includes(0)) throw new ExtractError("binary", `"${name}" is binary, not Markdown.`, { name });
  return new TextDecoder().decode(bytes);
}

function findEocd(view: DataView): number {
  // EOCD is 22 bytes + an optional comment of up to 65535 bytes.
  const stop = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= stop; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) return i;
  }
  return -1;
}

/** A skippable entry: hidden files, macOS metadata, directories, non-Markdown. */
function isIgnoredEntry(path: string): boolean {
  if (path.endsWith("/")) return true;
  const parts = path.split("/");
  if (parts.includes("__MACOSX")) return true;
  if (parts.some((p) => p.startsWith("."))) return true; // .git/, ._foo.md, .hidden.md
  return !isMarkdownName(path);
}

async function extractFromZip(bytes: Uint8Array): Promise<ExtractedMarkdown[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd < 0) throw new ExtractError("invalidZip", "Not a valid .zip archive.");
  const entryCount = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);

  const results: ExtractedMarkdown[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== SIG_CENTRAL) {
      throw new ExtractError("corruptZip", "Corrupt .zip archive (central directory).");
    }
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const uncompressedSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const path = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    const encrypted = (flags & 0x1) !== 0;
    if (isIgnoredEntry(path) || encrypted) continue;
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) continue;
    if (results.length >= MAX_MD_ENTRIES) {
      throw new ExtractError("tooManyEntries", `Archive has more than ${MAX_MD_ENTRIES} Markdown files.`, {
        max: MAX_MD_ENTRIES,
      });
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) throw tooLarge(path);

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== SIG_LOCAL) {
      throw new ExtractError("corruptZip", "Corrupt .zip archive (local header).");
    }
    const dataStart =
      localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new ExtractError("corruptZip", "Corrupt .zip archive (entry data).");
    const raw = bytes.subarray(dataStart, dataEnd);

    const data = method === METHOD_STORED ? raw : await inflateCapped(raw, path);
    if (data === null) continue; // deflate unsupported/corrupt → skip rather than guess
    if (data.length > MAX_ENTRY_BYTES) throw tooLarge(path);
    results.push({ filename: path, content: decodeText(data, path) });
  }

  if (results.length === 0) throw new ExtractError("noMarkdown", "No Markdown (.md) files found in the archive.");
  return results;
}

/**
 * Inflates a raw-deflate entry, cancelling as soon as the output passes the
 * per-entry cap (the declared size can lie). Returns null when the browser has
 * no DecompressionStream or the data is corrupt.
 */
async function inflateCapped(raw: Uint8Array, path: string): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  // Not awaited: the writes resolve only as the reader drains. Errors surface on read().
  writer.write(raw as BufferSource).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_ENTRY_BYTES) {
        await reader.cancel();
        throw tooLarge(path);
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof ExtractError && err.code === "entryTooLarge") throw err;
    return null;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
