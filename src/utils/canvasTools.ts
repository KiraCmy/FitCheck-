import type { RoomPhoto } from '../types/studio';
import { MAX_ROOM_IMAGE_SIDE } from '../types/studio';
import { chooseNearestAspectRatio, computeResizedDimensions } from './sceneMath';

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for canvas processing.'));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read uploaded image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read uploaded image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Optimizes an uploaded room photo client-side using HTML <canvas> so its longest side
 * never exceeds 1400px, without upscaling smaller images.
 */
export async function optimizeRoomImageFile(
  file: File,
  maxSide: number = MAX_ROOM_IMAGE_SIDE
): Promise<RoomPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload a valid image file (JPG, PNG, or WebP).');
  }
  const sourceDataUrl = await readFileAsDataUrl(file);
  return optimizeRoomImageFromSource(sourceDataUrl, file.name, maxSide);
}

/**
 * Runs any image source URL or data URL through the same proportional <canvas> optimization pipeline.
 */
export async function optimizeRoomImageFromSource(
  sourceUrl: string,
  name: string,
  maxSide: number = MAX_ROOM_IMAGE_SIDE
): Promise<RoomPhoto> {
  const img = await loadImageElement(sourceUrl);
  const originalWidth = img.naturalWidth || img.width;
  const originalHeight = img.naturalHeight || img.height;

  const { width, height, wasResized } = computeResizedDimensions(
    originalWidth,
    originalHeight,
    maxSide
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser canvas 2D context is unavailable.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const mimeType = 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, 0.86);
  const aspectRatio = chooseNearestAspectRatio(width, height);

  return {
    id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    dataUrl,
    mimeType,
    originalWidth,
    originalHeight,
    resizedWidth: width,
    resizedHeight: height,
    wasResized,
    aspectRatio,
  };
}

/**
 * Converts a same-origin studio product photo URL into a compact JPEG data URL
 * so serverless deployments (e.g., Vercel) do not depend on local filesystem reads.
 */
export async function imageUrlToDataUrl(url: string, maxSide = 900): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith('data:image/')) return url;
  try {
    const img = await loadImageElement(url);
    const { width, height } = computeResizedDimensions(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      maxSide
    );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return undefined;
  }
}

/**
 * Resizes a custom uploaded product photo to keep payload size brisk while preserving crispness.
 */
export async function optimizeProductImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid product image file.');
  }
  const sourceDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(sourceDataUrl);
  const { width, height } = computeResizedDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    1200
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return sourceDataUrl;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

/**
 * Converts any image URL or data URL into a genuine PNG Blob via <canvas> and triggers download.
 */
export async function downloadImageAsPng(imageUrl: string, filenameBase: string): Promise<void> {
  const safeBase =
    filenameBase
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'roomcheck-render';
  const filename = `${safeBase}.png`;

  // Use same-origin proxy for remote URLs to avoid canvas CORS tainting
  const fetchSrc =
    imageUrl.startsWith('http://') || imageUrl.startsWith('https://')
      ? `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
      : imageUrl;

  const img = await loadImageElement(fetchSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable for PNG export.');
  }
  ctx.drawImage(img, 0, 0);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Failed to encode PNG image.'));
    }, 'image/png');
  });

  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
}
