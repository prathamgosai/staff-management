/**
 * Read an image File, center-crop it to a square, downscale it, and return a
 * compressed JPEG data URL suitable for storing as a profile avatar.
 *
 * Keeping the output small (square, max ~512px, JPEG) means the avatar fits
 * comfortably in the staff.avatar_url TEXT column and in a single JSON request.
 */
export async function fileToAvatarDataUrl(
  file: File,
  size = 512,
  quality = 0.82,
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

  return canvas.toDataURL("image/jpeg", quality);
}
