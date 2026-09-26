import { describe, it, expect } from "vitest";
import { extractMarkdownFiles, ExtractError, MAX_ENTRY_BYTES, type UploadedFile } from "./file-extractor";

interface ZipEntry {
  path: string;
  content: string | Uint8Array;
  /** Store deflated (method 8) instead of stored (method 0). */
  deflate?: boolean;
  /** Mimic macOS Finder: bit 3 set, zero sizes in the local header. */
  dataDescriptor?: boolean;
  /** Override the uncompressed size written to the central directory (a lying header). */
  declaredSize?: number;
}

const enc = (s: string | Uint8Array) => (typeof s === "string" ? new TextEncoder().encode(s) : s);

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  writer.write(data as BufferSource);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concat(chunks);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Builds a spec-conformant ZIP (CRCs left 0 — the extractor doesn't verify them). */
async function buildZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc(e.path);
    const plain = enc(e.content);
    const data = e.deflate ? await deflateRaw(plain) : plain;
    const method = e.deflate ? 8 : 0;
    const flags = e.dataDescriptor ? 0x8 : 0;

    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, e.dataDescriptor ? 0 : data.length, true);
    lv.setUint32(22, e.dataDescriptor ? 0 : plain.length, true);
    lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    const descriptor = new Uint8Array(e.dataDescriptor ? 16 : 0);
    if (e.dataDescriptor) {
      const dv = new DataView(descriptor.buffer);
      dv.setUint32(0, 0x08074b50, true);
      dv.setUint32(8, data.length, true);
      dv.setUint32(12, plain.length, true);
    }
    local.push(lh, data, descriptor);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, e.declaredSize ?? plain.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    central.push(ch);

    offset += lh.length + data.length + descriptor.length;
  }
  const cd = concat(central);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cd.length, true);
  ev.setUint32(16, offset, true);
  return concat([...local, cd, eocd]);
}

/** jsdom's File has no arrayBuffer(), so tests pass the minimal shape the extractor reads. */
function upload(name: string, bytes: Uint8Array | string): UploadedFile {
  const b = enc(bytes);
  return { name, size: b.length, arrayBuffer: async () => b.slice().buffer };
}

const zipUpload = async (entries: ZipEntry[]) => upload("skills.zip", await buildZip(entries));
const names = (r: { filename: string }[]) => r.map((x) => x.filename);

describe("extractMarkdownFiles", () => {
  it("reads a single .md file", async () => {
    const r = await extractMarkdownFiles(upload("rule.md", "# Rule\nBe strict."));
    expect(r).toEqual([{ filename: "rule.md", content: "# Rule\nBe strict." }]);
  });

  it.each(["run.sh", "tool.py", "index.js", "notes.txt"])("rejects a single %s upload", async (name) => {
    await expect(extractMarkdownFiles(upload(name, "echo pwned"))).rejects.toThrow(/Unsupported file type/);
  });

  it("rejects uploads over 5 MB before reading them", async () => {
    const big: UploadedFile = { name: "big.zip", size: 6 * 1024 * 1024, arrayBuffer: async () => { throw new Error("read"); } };
    await expect(extractMarkdownFiles(big)).rejects.toThrow(/5 MB/);
  });

  it("extracts only Markdown from an archive, keeping paths", async () => {
    const r = await extractMarkdownFiles(
      await zipUpload([
        { path: "a/README.md", content: "# A" },
        { path: "b/README.md", content: "# B" },
        { path: "install.sh", content: "rm -rf /" },
        { path: "hook.py", content: "import os" },
        { path: "a/", content: "" },
      ]),
    );
    expect(names(r)).toEqual(["a/README.md", "b/README.md"]);
    expect(r[1]!.content).toBe("# B");
  });

  it("skips macOS metadata and hidden files", async () => {
    const r = await extractMarkdownFiles(
      await zipUpload([
        { path: "rule.md", content: "# ok" },
        { path: "__MACOSX/._rule.md", content: "\u0000junk" },
        { path: "._rule.md", content: "junk" },
        { path: ".github/evil.md", content: "# hidden" },
      ]),
    );
    expect(names(r)).toEqual(["rule.md"]);
  });

  it("inflates deflated entries", async () => {
    const r = await extractMarkdownFiles(await zipUpload([{ path: "d.md", content: "# Deflated\n".repeat(50), deflate: true }]));
    expect(r[0]!.content).toBe("# Deflated\n".repeat(50));
  });

  it("handles data-descriptor archives (macOS Finder) with zero local sizes", async () => {
    const r = await extractMarkdownFiles(
      await zipUpload([
        { path: "one.md", content: "# One", deflate: true, dataDescriptor: true },
        { path: "two.md", content: "# Two", dataDescriptor: true },
      ]),
    );
    expect(r.map((x) => x.content)).toEqual(["# One", "# Two"]);
  });

  it("rejects an entry whose declared size is over the cap", async () => {
    await expect(
      extractMarkdownFiles(await zipUpload([{ path: "big.md", content: "x".repeat(MAX_ENTRY_BYTES + 1) }])),
    ).rejects.toThrow(/256 KB/);
  });

  it("stops inflating a zip bomb that lies about its size", async () => {
    const bomb = { path: "bomb.md", content: "a".repeat(MAX_ENTRY_BYTES * 4), deflate: true, declaredSize: 10 };
    // The cap is recognised by its typed code, not by matching the message text.
    await expect(extractMarkdownFiles(await zipUpload([bomb]))).rejects.toMatchObject({
      code: "entryTooLarge",
      params: { name: "bomb.md" },
    });
  });

  it("rejects Markdown with NUL bytes", async () => {
    await expect(
      extractMarkdownFiles(await zipUpload([{ path: "bin.md", content: new Uint8Array([35, 0, 1]) }])),
    ).rejects.toThrow(/binary/);
  });

  it("errors when an archive has no Markdown", async () => {
    await expect(extractMarkdownFiles(await zipUpload([{ path: "run.sh", content: "x" }]))).rejects.toThrow(
      /No Markdown/,
    );
  });

  it("errors on a non-zip payload with a .zip name", async () => {
    await expect(extractMarkdownFiles(upload("fake.zip", "not a zip"))).rejects.toThrow(/Not a valid/);
  });

  it("throws typed ExtractErrors with a code the UI can translate", async () => {
    const cases: Array<[Promise<unknown>, string]> = [
      [extractMarkdownFiles(upload("run.sh", "x")), "unsupportedType"],
      [extractMarkdownFiles(upload("fake.zip", "not a zip")), "invalidZip"],
      [extractMarkdownFiles(await zipUpload([{ path: "run.sh", content: "x" }])), "noMarkdown"],
    ];
    for (const [p, code] of cases) {
      const err = await p.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ExtractError);
      expect((err as ExtractError).code).toBe(code);
    }
  });
});
