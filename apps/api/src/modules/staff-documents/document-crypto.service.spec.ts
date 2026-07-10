import { DocumentCryptoService } from "./document-crypto.service";

const KEY_HEX = "a".repeat(64); // 32 bytes

function make(env: Record<string, string | undefined>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = { get: (k: string) => env[k] } as any;
  return new DocumentCryptoService(config);
}

describe("DocumentCryptoService (enabled)", () => {
  const svc = make({ DOCUMENT_ENCRYPTION_KEY: KEY_HEX });

  it("is enabled with a valid 32-byte hex key", () => {
    expect(svc.isEnabled()).toBe(true);
  });

  it("round-trips arbitrary bytes", () => {
    const plain = Buffer.from("PDF-ish binary \x00\x01\x02 payload", "binary");
    const enc = svc.encrypt(plain);
    expect(enc.equals(plain)).toBe(false);
    expect(svc.decrypt(enc).equals(plain)).toBe(true);
  });

  it("round-trips a document number string", () => {
    expect(svc.decryptString(svc.encryptString("1234 5678 9012"))).toBe("1234 5678 9012");
  });

  it("produces a fresh IV each call (ciphertexts differ for the same input)", () => {
    const p = Buffer.from("same");
    expect(svc.encrypt(p).equals(svc.encrypt(p))).toBe(false);
  });

  it("fails authentication on a tampered ciphertext (GCM tag)", () => {
    const enc = svc.encrypt(Buffer.from("secret"));
    enc[enc.length - 1] ^= 0xff; // flip a byte
    expect(() => svc.decrypt(enc)).toThrow();
  });
});

describe("DocumentCryptoService (disabled — no key)", () => {
  const svc = make({});
  it("reports disabled and refuses to encrypt", () => {
    expect(svc.isEnabled()).toBe(false);
    expect(() => svc.encrypt(Buffer.from("x"))).toThrow();
  });
  it("also disabled for a malformed key", () => {
    expect(make({ DOCUMENT_ENCRYPTION_KEY: "too-short" }).isEnabled()).toBe(false);
  });
});

describe("DocumentCryptoService signed download tokens", () => {
  const svc = make({ DOCUMENT_ENCRYPTION_KEY: KEY_HEX });
  const docId = "11111111-1111-1111-1111-111111111111";

  it("accepts a fresh token and rejects an expired one", () => {
    const now = 1_000_000;
    const token = svc.signDownloadToken(docId, now + 60_000);
    expect(svc.verifyDownloadToken(docId, token, now)).toBe(true);
    expect(svc.verifyDownloadToken(docId, token, now + 120_000)).toBe(false); // past expiry
  });

  it("rejects a tampered signature and a wrong document id", () => {
    const now = 1_000_000;
    const token = svc.signDownloadToken(docId, now + 60_000);
    expect(svc.verifyDownloadToken(docId, token + "x", now)).toBe(false);
    expect(svc.verifyDownloadToken("22222222-2222-2222-2222-222222222222", token, now)).toBe(false);
  });

  it("rejects malformed tokens", () => {
    expect(svc.verifyDownloadToken(docId, "garbage", 0)).toBe(false);
  });
});
