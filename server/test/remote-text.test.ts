import { describe, it, expect } from 'vitest';
import { isPublicAddress, SafeHttpsTextFetcher } from '../src/adapters/remote-text/index.js';
import { ValidationError } from '../src/platform/errors.js';

describe('isPublicAddress', () => {
  it('allows public IPv4 addresses', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('1.1.1.1')).toBe(true);
    expect(isPublicAddress('192.0.2.1')).toBe(true);
    expect(isPublicAddress('203.0.113.50')).toBe(true);
  });

  it('rejects 0.0.0.0/8', () => {
    expect(isPublicAddress('0.0.0.0')).toBe(false);
    expect(isPublicAddress('0.255.255.255')).toBe(false);
  });

  it('rejects 10.0.0.0/8 (private)', () => {
    expect(isPublicAddress('10.0.0.0')).toBe(false);
    expect(isPublicAddress('10.255.255.255')).toBe(false);
    expect(isPublicAddress('10.1.2.3')).toBe(false);
  });

  it('rejects 100.64.0.0/10 (CGN)', () => {
    expect(isPublicAddress('100.64.0.0')).toBe(false);
    expect(isPublicAddress('100.127.255.255')).toBe(false);
    expect(isPublicAddress('100.100.1.1')).toBe(false);
  });

  it('rejects 127.0.0.0/8 (loopback)', () => {
    expect(isPublicAddress('127.0.0.0')).toBe(false);
    expect(isPublicAddress('127.0.0.1')).toBe(false);
    expect(isPublicAddress('127.255.255.255')).toBe(false);
  });

  it('rejects 169.254.0.0/16 (link-local)', () => {
    expect(isPublicAddress('169.254.0.0')).toBe(false);
    expect(isPublicAddress('169.254.1.1')).toBe(false);
    expect(isPublicAddress('169.254.255.255')).toBe(false);
  });

  it('rejects 172.16.0.0/12 (private)', () => {
    expect(isPublicAddress('172.16.0.0')).toBe(false);
    expect(isPublicAddress('172.31.255.255')).toBe(false);
    expect(isPublicAddress('172.20.1.1')).toBe(false);
  });

  it('rejects 192.0.0.0/24 (documentation)', () => {
    expect(isPublicAddress('192.0.0.0')).toBe(false);
    expect(isPublicAddress('192.0.0.255')).toBe(false);
  });

  it('rejects 192.168.0.0/16 (private)', () => {
    expect(isPublicAddress('192.168.0.0')).toBe(false);
    expect(isPublicAddress('192.168.1.1')).toBe(false);
    expect(isPublicAddress('192.168.255.255')).toBe(false);
  });

  it('rejects 198.18.0.0/15 (benchmark)', () => {
    expect(isPublicAddress('198.18.0.0')).toBe(false);
    expect(isPublicAddress('198.19.255.255')).toBe(false);
    expect(isPublicAddress('198.18.1.1')).toBe(false);
  });

  it('rejects 224.0.0.0/4 and above (multicast/reserved)', () => {
    expect(isPublicAddress('224.0.0.0')).toBe(false);
    expect(isPublicAddress('239.255.255.255')).toBe(false);
    expect(isPublicAddress('255.255.255.254')).toBe(false);
  });

  it('rejects 255.255.255.255 (broadcast)', () => {
    expect(isPublicAddress('255.255.255.255')).toBe(false);
  });

  it('rejects invalid IPv4 formats', () => {
    expect(isPublicAddress('not.an.ip.address')).toBe(false);
    expect(isPublicAddress('256.1.1.1')).toBe(false);
    expect(isPublicAddress('1.1.1')).toBe(false);
    expect(isPublicAddress('1.1.1.1.1')).toBe(false);
  });
});

describe('SafeHttpsTextFetcher validation', () => {
  const fetcher = new SafeHttpsTextFetcher();

  it('rejects http:// URLs', async () => {
    try {
      await fetcher.fetchText('http://example.com');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).code).toBe('validation_error');
    }
  });

  it('rejects URLs with credentials', async () => {
    try {
      await fetcher.fetchText('https://user:pass@example.com');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects non-standard ports', async () => {
    try {
      await fetcher.fetchText('https://example.com:8443');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects loopback IPv4 literal', async () => {
    try {
      await fetcher.fetchText('https://127.0.0.1/');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toMatch(/private or reserved/i);
    }
  });

  it('rejects loopback IPv6 literal', async () => {
    try {
      await fetcher.fetchText('https://[::1]/');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toMatch(/private or reserved/i);
    }
  });

  it('rejects private IPv4 literal', async () => {
    try {
      await fetcher.fetchText('https://10.0.0.1/');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects private IPv6 literal (ULA)', async () => {
    try {
      await fetcher.fetchText('https://[fd00::1]/');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects link-local IPv6 (fe80::)', async () => {
    try {
      await fetcher.fetchText('https://[fe80::1]/');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects IPv6 multicast (ff00::)', async () => {
    try {
      await fetcher.fetchText('https://[ff02::1]/');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects IPv4-mapped IPv6 with private IPv4', async () => {
    // ::ffff:127.0.0.1 is IPv4-mapped loopback
    try {
      await fetcher.fetchText('https://[::ffff:127.0.0.1]/');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects IPv4-mapped IPv6 with private IPv4 (10.0.0.1)', async () => {
    // ::ffff:10.0.0.1 is IPv4-mapped private
    try {
      await fetcher.fetchText('https://[::ffff:10.0.0.1]/');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects invalid URLs', async () => {
    try {
      await fetcher.fetchText('not a url');
      expect.fail('Should have thrown ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain('Invalid URL');
    }
  });
});

describe('isPublicAddress — IPv6 and embedded IPv4', () => {
  it.each([
    '2606:4700:4700::1111',
    '2a00:1450:4001:82a::200e',
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    '2002:808:808::1',
  ])('allows public %s', (ip) => expect(isPublicAddress(ip)).toBe(true));

  it.each([
    '::',
    '::1',
    '0:0:0:0:0:0:0:1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1', // how new URL() normalises [::ffff:127.0.0.1]
    '::ffff:a9fe:a9fe', // 169.254.169.254 (cloud metadata)
    '::7f00:1', // IPv4-compatible
    '64:ff9b::7f00:1', // NAT64 → 127.0.0.1
    '2002:7f00:1::', // 6to4 → 127.0.0.1
    '2001:0:1234::1', // Teredo
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'febf::1',
    'fec0::1',
    'ff02::1',
    'fe80::1%lo0',
    '[::1]',
    'gibberish',
  ])('blocks %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
});

describe('SafeHttpsTextFetcher — normalised IPv6 literal hosts', () => {
  it('rejects https://[::ffff:127.0.0.1]/ (URL normalises it to hex)', async () => {
    await expect(new SafeHttpsTextFetcher().fetchText('https://[::ffff:127.0.0.1]/x.md')).rejects.toThrow(
      /private or reserved/,
    );
  });
  it('rejects https://[::ffff:a9fe:a9fe]/ (metadata endpoint)', async () => {
    await expect(new SafeHttpsTextFetcher().fetchText('https://[::ffff:a9fe:a9fe]/')).rejects.toThrow(
      /private or reserved/,
    );
  });
});
