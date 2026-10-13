import { createPublicKey, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { adbGeneratePublicKey, rsaParsePrivateKey } from '@yume-chan/adb';
import { NodeCredentialStore, derOid, pemToPkcs8, publicKeyLine, selfSignedCertificate } from './credentials.js';

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('credentials', () => {
  it('generates once, persists PEM + adbkey.pub, iterates the same key back', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tvlm-key-'));
    dirs.push(dir);
    const store = new NodeCredentialStore(join(dir, 'adbkey'), []);
    expect((await collect(store.iterateKeys())).length).toBe(0);
    const k = await store.ensure();
    expect(k.buffer.byteLength).toBeGreaterThan(1000);
    const [n] = rsaParsePrivateKey(k.buffer);
    expect(n.toString(2).length).toBe(2048);
    const again = await collect(store.iterateKeys());
    expect(again.length).toBe(1);
    expect(Buffer.from(again[0]!.buffer).equals(Buffer.from(k.buffer))).toBe(true);
    const pub = await readFile(join(dir, 'adbkey.pub'), 'utf8');
    expect(pub).toBe(publicKeyLine(k.buffer, k.name));
    expect(Buffer.from(pub.split(' ')[0]!, 'base64').equals(Buffer.from(adbGeneratePublicKey(k.buffer)))).toBe(true);
    // a second `ensure` does not regenerate
    const k2 = await store.ensure();
    expect(Buffer.from(k2.buffer).equals(Buffer.from(k.buffer))).toBe(true);
  });

  it("reads Google adb's PKCS#1 adbkey too", () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pkcs1 = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
    expect(pkcs1).toContain('RSA PRIVATE KEY');
    const der = pemToPkcs8(pkcs1);
    const [n] = rsaParsePrivateKey(der);
    const jwkN = createPublicKey(privateKey).export({ format: 'jwk' }).n!;
    expect(n).toBe(BigInt('0x' + Buffer.from(jwkN, 'base64url').toString('hex')));
  });

  it('builds a self-signed X.509 that Node parses and verifies', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = selfSignedCertificate(privateKey);
    const cert = new X509Certificate(pem);
    expect(cert.subject).toBe('CN=adb');
    expect(cert.issuer).toBe('CN=adb');
    expect(cert.ca).toBe(true);
    expect(cert.verify(cert.publicKey)).toBe(true);
    expect(cert.checkPrivateKey(privateKey)).toBe(true);
    expect(new Date(cert.validTo).getTime() - new Date(cert.validFrom).getTime()).toBeGreaterThan(9 * 365 * 86400_000);
    const pem2 = selfSignedCertificate(privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, { cn: 'tvlm' });
    expect(new X509Certificate(pem2).subject).toBe('CN=tvlm');
  });

  it('encodes OIDs like the RFC', () => {
    expect(Buffer.from(derOid('1.2.840.113549.1.1.11')).toString('hex')).toBe('06092a864886f70d01010b');
    expect(Buffer.from(derOid('2.5.4.3')).toString('hex')).toBe('0603550403');
  });
});
