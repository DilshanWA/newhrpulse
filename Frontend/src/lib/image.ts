/**
 * Prepares a profile picture in the browser: centre-crops to a square, scales to
 * `size` px and re-encodes as JPEG. Uploads stay small (~30–80 KB) and phone photos
 * are sent upright, since browsers apply EXIF rotation when decoding.
 */
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export async function squareAvatar(file: File, size = 512): Promise<Blob> {
  if (!AVATAR_ACCEPT.split(",").includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is larger than 15 MB. Choose a smaller one.");

  const img = await load(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (side < 64) throw new Error("That image is too small. Use one at least 64 × 64 pixels.");

  const out = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process the image.");
  ctx.fillStyle = "#fff"; // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process the image."))), "image/jpeg", 0.88),
  );
}

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the image."));
    r.readAsDataURL(b);
  });
