/** Riconoscimento del formato delle foto dai primi byte (non ci si fida del nome del file). */
export type PhotoMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** Lato della foto standard dell'app: JPG quadrato, cerchio centrato, angoli neri. */
export const PHOTO_STD_PX = 256;

export function sniffImageMime(bytes: Uint8Array): PhotoMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

/** Solo per leggere i backup legacy: il formato dichiarato dall'estensione. */
export function mimeForExtension(name: string): PhotoMime | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return null;
}

/** Tipo reale di un blob: prima i byte, poi il MIME dichiarato. */
export async function detectBlobMime(blob: Blob): Promise<string | null> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  return sniffImageMime(head) ?? (blob.type || null);
}

/** Converte una foto qualsiasi in JPG standard. Ritorna null se l'immagine è illeggibile. */
export type JpegNormalizer = (blob: Blob) => Promise<Blob | null>;

function jpegSize(bytes: Uint8Array): { w: number; h: number } | null {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { h: (bytes[i + 5]! << 8) | bytes[i + 6]!, w: (bytes[i + 7]! << 8) | bytes[i + 8]! };
    i += 2 + len;
  }
  return null;
}

/** True se il blob è già un JPG quadrato delle dimensioni standard (nessuna ricompressione). */
export async function isStandardJpeg(blob: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (sniffImageMime(bytes) !== "image/jpeg") return false;
  const s = jpegSize(bytes);
  return !!s && s.w === PHOTO_STD_PX && s.h === PHOTO_STD_PX;
}

/** Conversione via canvas (browser): ritaglio quadrato centrato, cerchio, angoli neri, JPG. */
export const browserJpegNormalizer: JpegNormalizer = async (blob) => {
  if (await isStandardJpeg(blob)) return new Blob([blob], { type: "image/jpeg" });
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const size = PHOTO_STD_PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const side = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  ctx.restore();
  bmp.close?.();
  return new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
};
