/**
 * Read an image File, center-crop it to a square, downscale to a small thumbnail, and
 * return a compressed data URL suitable for a profile avatar. Output is WebP (much
 * smaller) with a JPEG fallback for browsers that can't encode WebP.
 *
 * Keeping the output tiny (≤200×200) means the avatar is a few KB — it fits comfortably
 * in the staff.avatar_url TEXT column and a single JSON request, and the server rejects
 * anything over ~150 KB as a safety net.
 */
export async function fileToAvatarDataUrl(
  file: File,
  size = 200,
  quality = 0.8,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  // Center-crop to a square so the avatar always fills its circle/rounded frame.
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing isn't supported in this browser.");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

  // Prefer WebP (smaller); browsers that can't encode it return a PNG data URL, in
  // which case fall back to JPEG.
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

/* ─── Document upload prep ─────────────────────────────────────────────────
 * Unlike the avatar helper (which square-crops), documents must keep their full
 * frame and aspect ratio — a cropped ID scan is useless. Images are downscaled so
 * the longest edge is ≤ maxEdge (never upscaled) and re-encoded WebP/JPEG; PDFs pass
 * through untouched. Returns the data URL + its real MIME type for the API's
 * mime_type column (the API strips the data-URL prefix before storing).
 */
export const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const MAX_DOC_BYTES = 2 * 1024 * 1024; // mirrors the API's 2 MB decoded cap

export interface PreparedDocument {
  contentBase64: string; // full data URL; the API keeps only the base64 payload
  mimeType: string;
  fileName: string;
}

export async function prepareDocumentForUpload(
  file: File,
  maxEdge = 1600,
  quality = 0.8,
): Promise<PreparedDocument> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_DOC_BYTES) {
      throw new Error("This PDF is over 2 MB. Please upload a smaller scan.");
    }
    return { contentBase64: await readAsDataUrl(file), mimeType: "application/pdf", fileName: file.name };
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose a PDF or an image (JPEG, PNG or WebP).");
  }

  const img = await loadImage(await readAsDataUrl(file));
  // Preserve aspect ratio; only ever shrink to fit maxEdge on the longest side.
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing isn't supported in this browser.");
  ctx.drawImage(img, 0, 0, w, h);

  const webp = canvas.toDataURL("image/webp", quality);
  const isWebp = webp.startsWith("data:image/webp");
  const dataUrl = isWebp ? webp : canvas.toDataURL("image/jpeg", quality);
  const mimeType = isWebp ? "image/webp" : "image/jpeg";
  // The bytes were re-encoded, so rename the file to match the new type — this keeps the
  // extension, declared MIME and actual bytes consistent (a scan uploaded as "aadhaar.jpg"
  // becomes "aadhaar.webp"), so strict server-side signature checks never falsely reject it.
  return { contentBase64: dataUrl, mimeType, fileName: withExtension(file.name, isWebp ? "webp" : "jpg") };
}

/** Replace (or append) a filename's extension, preserving the base name. */
function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  return `${base || "document"}.${ext}`;
}

/* ─── shared helpers ─────────────────────────────────────────────────────── */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be loaded."));
    image.src = src;
  });
}
