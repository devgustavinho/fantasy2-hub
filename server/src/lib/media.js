import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { uploadToR2 } from "./r2.js";

// Decodifica com o sharp (aceita JPEG/PNG/WebP/HEIC/HEIF e outros) e sempre regrava como JPEG
// de até 1200px no lado maior — garante uma "miniatura" de verdade, elimina qualquer
// ambiguidade de mimetype vinda do celular, e evita guardar fotos de vários MB sem necessidade.
// Sobe direto pro bucket público da Cloudflare R2 (nada fica no disco da VPS).
export async function processAndSaveImage(buffer, folder) {
  const key = `${folder}/${randomUUID()}.jpg`;
  const processed = await sharp(buffer)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return uploadToR2(key, processed, "image/jpeg");
}

const VIDEO_EXTENSION_BY_MIMETYPE = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

// Vídeo não passa por processamento nenhum (sem ffmpeg disponível no servidor) — só valida o
// mimetype contra uma lista de formatos que os navegadores/celulares tocam nativamente e sobe
// o arquivo original direto pro R2.
export async function saveVideo(buffer, mimetype, folder) {
  const extension = VIDEO_EXTENSION_BY_MIMETYPE[mimetype];
  if (!extension) throw new Error("Formato de vídeo não suportado.");
  const key = `${folder}/${randomUUID()}.${extension}`;
  return uploadToR2(key, buffer, mimetype);
}
