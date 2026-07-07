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

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be loaded."));
    image.src = dataUrl;
  });

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
