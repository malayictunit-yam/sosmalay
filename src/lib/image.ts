// Client-side image compression: keeps file <= maxBytes by iteratively
// downscaling and reducing JPEG quality. Returns a JPEG Blob.

const MAX_BYTES_DEFAULT = 2 * 1024 * 1024; // 2 MB

export async function compressImage(
  file: File | Blob,
  maxBytes: number = MAX_BYTES_DEFAULT,
): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  let { width, height } = bitmap;
  const maxDim = 2560;
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  let quality = 0.85;
  let blob = await draw(bitmap, width, height, quality);

  // Iterate: drop quality, then drop dimensions.
  while (blob.size > maxBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await draw(bitmap, width, height, quality);
  }
  while (blob.size > maxBytes && Math.max(width, height) > 800) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    quality = 0.8;
    blob = await draw(bitmap, width, height, quality);
  }
  return blob;
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

async function draw(
  source: ImageBitmap | HTMLImageElement,
  w: number,
  h: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(source, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compression failed"))),
      "image/jpeg",
      quality,
    );
  });
}