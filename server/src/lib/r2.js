import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env.js";

// R2 é compatível com a API do S3 — mesmo SDK, só muda o endpoint (`region: "auto"` é exigido
// pelo SDK mas ignorado pela R2).
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const PUBLIC_URL = env.R2_PUBLIC_URL.replace(/\/+$/, "");

export async function uploadToR2(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key, Body: body, ContentType: contentType }),
  );
  return `${PUBLIC_URL}/${key}`;
}

// Aceita tanto a chave (`services/xxx.jpg`) quanto a URL pública inteira — assim quem chama não
// precisa se preocupar em extrair a chave de volta da URL guardada no banco. Best-effort: erro
// só vai pro log, igual ao antigo `unlink` local — não faz sentido derrubar a resposta da rota
// por causa de uma falha ao apagar um arquivo que já cumpriu sua função.
export function deleteFromR2(keyOrUrl) {
  const key = keyOrUrl.startsWith(PUBLIC_URL) ? keyOrUrl.slice(PUBLIC_URL.length + 1) : keyOrUrl;
  s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })).catch((err) => {
    console.error(`Falha ao apagar objeto do R2 (${key}):`, err.message);
  });
}
