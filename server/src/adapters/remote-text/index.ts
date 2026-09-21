/**
 * remote-text adapter — SSRF-safe fetcher for importing skill markdown from a
 * user-supplied URL (POST /skills/import).
 *
 * Guards:
 * - https only, no credentials, default port only.
 * - Every address the host resolves to must be public (`isPublicAddress`). The
 *   check runs inside the socket's `lookup` hook, i.e. on the exact address we
 *   connect to — a DNS-rebinding answer can't slip in between check and connect.
 *   IP-literal hosts never hit `lookup`, so they are checked up front.
 * - Redirects are never auto-followed: at most 3, each re-validated.
 * - One total deadline (not just socket idle), 2xx only, `text/*` only,
 *   256 KiB body cap (the stream is destroyed on overflow), no NUL bytes.
 *
 * Disallowed URL/address → ValidationError; network/timeout/HTTP/size failure →
 * ExternalServiceError. Swappable in tests via ContainerOverrides.remoteText.
 */
import * as https from 'node:https';
import type { IncomingMessage } from 'node:http';
import * as dns from 'node:dns';
import * as net from 'node:net';
import { ValidationError, ExternalServiceError } from '../../platform/errors.js';

export interface RemoteTextFetcher {
  fetchText(url: string): Promise<{ text: string; finalUrl: string }>;
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 256 * 1024;

function isPublicV4(b: number[]): boolean {
  const [a, c] = [b[0]!, b[1]!];
  if (a === 0 || a === 10 || a === 127) return false; // this-net, private, loopback
  if (a === 100 && c >= 64 && c < 128) return false; // CGNAT
  if (a === 169 && c === 254) return false; // link-local (cloud metadata)
  if (a === 172 && c >= 16 && c < 32) return false; // private
  if (a === 192 && c === 0 && b[2] === 0) return false; // IETF protocol assignments
  if (a === 192 && c === 168) return false; // private
  if (a === 198 && (c === 18 || c === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** Parses an IPv6 address (optionally with a trailing dotted IPv4) into 16 bytes. */
function parseV6(ip: string): number[] | null {
  const addr = ip.split('%')[0]!; // drop zone id
  let tail: number[] = [];
  let head = addr;
  const lastColon = addr.lastIndexOf(':');
  const maybeV4 = addr.slice(lastColon + 1);
  if (maybeV4.includes('.')) {
    if (!net.isIPv4(maybeV4)) return null;
    tail = maybeV4.split('.').map(Number);
    // Replace the dotted quad with two placeholder groups, overwritten below.
    head = addr.slice(0, lastColon + 1) + '0:0';
  }
  const halves = head.split('::');
  if (halves.length > 2) return null;
  const toGroups = (s: string) => (s === '' ? [] : s.split(':'));
  const left = toGroups(halves[0]!);
  const right = halves.length === 2 ? toGroups(halves[1]!) : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right];
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push(v >> 8, v & 0xff);
  }
  if (tail.length === 4) bytes.splice(12, 4, ...tail);
  return bytes.length === 16 ? bytes : null;
}

function isPublicV6(b: number[]): boolean {
  const zeroPrefix = (n: number) => b.slice(0, n).every((x) => x === 0);
  const v4At = (i: number) => b.slice(i, i + 4);
  // ::/96 covers :: , ::1 and deprecated IPv4-compatible ::a.b.c.d — none are fetchable.
  if (zeroPrefix(12)) return false;
  // IPv4-mapped ::ffff:a.b.c.d → judge the embedded IPv4.
  if (zeroPrefix(10) && b[10] === 0xff && b[11] === 0xff) return isPublicV4(v4At(12));
  // NAT64 64:ff9b::/96 and 64:ff9b:1::/48 → embedded IPv4 in the low 32 bits.
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return isPublicV4(v4At(12));
  // 6to4 2002::/16 → embedded IPv4 in bytes 2..5.
  if (b[0] === 0x20 && b[1] === 0x02) return isPublicV4(v4At(2));
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return false; // Teredo
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false; // docs
  if (b[0] === 0x01 && b.slice(1, 8).every((x) => x === 0)) return false; // discard 100::/64
  if ((b[0]! & 0xfe) === 0xfc) return false; // fc00::/7 unique-local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return false; // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0xc0) return false; // fec0::/10 site-local
  if (b[0] === 0xff) return false; // multicast
  return true;
}

/** True only for a syntactically valid, publicly routable IPv4 or IPv6 address. */
export function isPublicAddress(ip: string): boolean {
  const bare = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;
  const family = net.isIP(bare.split('%')[0]!);
  if (family === 4) return isPublicV4(bare.split('.').map(Number));
  if (family === 6) {
    const bytes = parseV6(bare);
    return bytes !== null && isPublicV6(bytes);
  }
  return false;
}

function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('Invalid URL');
  }
  if (url.protocol !== 'https:') throw new ValidationError('Only https: URLs are allowed');
  if (url.username || url.password) throw new ValidationError('URLs with credentials are not allowed');
  if (url.port && url.port !== '443') throw new ValidationError(`Port ${url.port} is not allowed`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isPublicAddress(host)) {
    throw new ValidationError('URL points to a private or reserved address');
  }
  return url;
}

/** `lookup` hook for the socket: resolves, then refuses unless every address is public. */
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || !list.every((a) => isPublicAddress(a.address))) {
      const e: NodeJS.ErrnoException = new Error('Host resolves to a private or reserved address');
      e.code = 'EPRIVATEADDR';
      return callback(e, '', 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

export class SafeHttpsTextFetcher implements RemoteTextFetcher {
  async fetchText(raw: string): Promise<{ text: string; finalUrl: string }> {
    const deadline = Date.now() + TIMEOUT_MS;
    let url = assertAllowedUrl(raw);
    for (let hop = 0; ; hop++) {
      const res = await this.request(url, deadline);
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.destroy();
        const location = res.headers.location;
        if (!location) throw new ExternalServiceError(`Redirect without Location (HTTP ${status})`);
        if (hop >= MAX_REDIRECTS) throw new ValidationError(`Too many redirects (max ${MAX_REDIRECTS})`);
        url = assertAllowedUrl(new URL(location, url).toString());
        continue;
      }
      if (status < 200 || status >= 300) {
        res.destroy();
        throw new ExternalServiceError(`Remote server returned HTTP ${status}`);
      }
      const contentType = String(res.headers['content-type'] ?? '');
      if (contentType && !contentType.toLowerCase().startsWith('text/')) {
        res.destroy();
        throw new ExternalServiceError(`Unsupported Content-Type ${contentType.split(';')[0]} (expected text/*)`);
      }
      return { text: await this.readBody(res, deadline), finalUrl: url.toString() };
    }
  }

  private request(url: URL, deadline: number): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const req = https.request(url, { lookup: guardedLookup, headers: { accept: 'text/*' } }, resolve);
      const timer = setTimeout(() => req.destroy(new Error('timeout')), Math.max(0, deadline - Date.now()));
      req.on('response', () => clearTimeout(timer));
      req.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          err.code === 'EPRIVATEADDR'
            ? new ValidationError('Host resolves to a private or reserved address')
            : new ExternalServiceError(err.message === 'timeout' ? `Timed out after ${TIMEOUT_MS}ms` : 'Could not fetch the URL'),
        );
      });
      req.end();
    });
  }

  private readBody(res: IncomingMessage, deadline: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        res.destroy();
        reject(err);
      };
      const timer = setTimeout(
        () => fail(new ExternalServiceError(`Timed out after ${TIMEOUT_MS}ms`)),
        Math.max(0, deadline - Date.now()),
      );
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) return fail(new ExternalServiceError('Response exceeds 256 KiB'));
        chunks.push(chunk);
      });
      res.on('error', () => fail(new ExternalServiceError('Response stream failed')));
      res.on('end', () => {
        if (settled) return;
        const data = Buffer.concat(chunks);
        if (data.includes(0)) return fail(new ExternalServiceError('Response is binary, not text'));
        settled = true;
        clearTimeout(timer);
        resolve(data.toString('utf-8'));
      });
    });
  }
}
