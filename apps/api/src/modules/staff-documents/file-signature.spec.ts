import { sniffMime, validateSignature, extensionOf, fileNameForMime } from "./file-signature";

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0]); // %PDF-1.4
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("file-signature: sniffMime", () => {
  it("detects each supported type by magic bytes", () => {
    expect(sniffMime(PDF)).toBe("application/pdf");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(WEBP)).toBe("image/webp");
  });
  it("returns null for empty / too-short / unknown bytes", () => {
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
    expect(sniffMime(Buffer.from([1, 2, 3]))).toBeNull();
    expect(sniffMime(Buffer.from("hello world!!", "utf8"))).toBeNull();
  });
});

describe("file-signature: validateSignature", () => {
  it("accepts bytes matching the declared MIME + extension", () => {
    expect(validateSignature(PDF, "application/pdf", "aadhaar.pdf").ok).toBe(true);
    expect(validateSignature(PNG, "image/png", "photo.PNG").ok).toBe(true);
    expect(validateSignature(JPEG, "image/jpeg", "scan.jpeg").ok).toBe(true);
  });

  it("REJECTS a crafted .png that actually carries PDF bytes (magic-byte spoof)", () => {
    const r = validateSignature(PDF, "image/png", "evil.png");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("mime_mismatch");
    expect(r.detectedMime).toBe("application/pdf");
  });

  it("rejects a real PNG whose extension says .pdf", () => {
    const r = validateSignature(PNG, "image/png", "mislabelled.pdf");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("extension_mismatch");
  });

  it("rejects empty and unknown content", () => {
    expect(validateSignature(Buffer.alloc(0), "application/pdf", "x.pdf").reason).toBe("empty");
    expect(validateSignature(Buffer.from("plain text long enough", "utf8"), "application/pdf", "x.pdf").reason).toBe("unknown_type");
  });

  it("allows a missing/blank extension as long as the bytes match", () => {
    expect(validateSignature(PDF, "application/pdf", "noext").ok).toBe(true);
  });
});

describe("file-signature: extensionOf", () => {
  it("lowercases and handles no-dot names", () => {
    expect(extensionOf("A.PDF")).toBe("pdf");
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf("a.b.JPG")).toBe("jpg");
  });
});

describe("file-signature: fileNameForMime", () => {
  it("rewrites the extension to match the detected type (e.g. a re-encoded scan.jpg -> scan.webp)", () => {
    expect(fileNameForMime("scan.jpg", "image/webp")).toBe("scan.webp");
    expect(fileNameForMime("aadhaar.png", "application/pdf")).toBe("aadhaar.pdf");
    expect(fileNameForMime("photo", "image/jpeg")).toBe("photo.jpg");
  });
  it("preserves multi-dot base names and only swaps the final extension", () => {
    expect(fileNameForMime("a.b.c.jpeg", "image/webp")).toBe("a.b.c.webp");
  });
  it("falls back to a placeholder base for empty / dot-only names", () => {
    expect(fileNameForMime("", "image/png")).toBe("document.png");
    expect(fileNameForMime(".gitignore", "image/webp")).toBe("document.webp");
    expect(fileNameForMime("   ", "application/pdf")).toBe("document.pdf");
  });
});
