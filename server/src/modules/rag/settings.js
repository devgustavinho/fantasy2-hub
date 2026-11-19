import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sqlite } from "../../db/client.js";
import { env } from "../../env.js";

const PROVIDERS = new Set(["openai"]);

const getRow = sqlite.prepare(`
  SELECT provider, api_key_cipher AS apiKeyCipher,
         updated_at AS updatedAt, updated_by AS updatedBy
  FROM rag_settings WHERE id = 1
`);

const upsert = sqlite.prepare(`
  UPDATE rag_settings
  SET provider = @provider,
      api_key_cipher = @api_key_cipher,
      updated_at = @updated_at,
      updated_by = @updated_by
  WHERE id = 1
`);

const clearKey = sqlite.prepare(`
  UPDATE rag_settings
  SET api_key_cipher = NULL,
      updated_at = @updated_at,
      updated_by = @updated_by
  WHERE id = 1
`);

const nowIso = () => new Date().toISOString();

function deriveKey() {
  return createHash("sha256").update(`fantasy2-rag-settings:${env.JWT_SECRET}`).digest();
}

/** Cifra a API key em repouso (AES-256-GCM). */
export function encryptApiKey(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptApiKey(cipherText) {
  if (!cipherText) return null;
  const buf = Buffer.from(cipherText, "base64");
  if (buf.length < 12 + 16 + 1) return null;
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function isValidProvider(provider) {
  return PROVIDERS.has(provider);
}

/** Metadados públicos — nunca inclui a chave. */
export function getRagSettingsPublic() {
  const row = getRow.get();
  if (!row) {
    return {
      provider: "openai",
      configured: Boolean(env.OPENAI_API_KEY?.trim()),
      source: env.OPENAI_API_KEY?.trim() ? "env" : null,
      updatedAt: null,
    };
  }
  const fromDb = Boolean(row.apiKeyCipher);
  const fromEnv = Boolean(env.OPENAI_API_KEY?.trim());
  return {
    provider: row.provider || "openai",
    configured: fromDb || fromEnv,
    source: fromDb ? "admin" : fromEnv ? "env" : null,
    updatedAt: row.updatedAt,
  };
}

/** Chave efetiva pra chamadas OpenAI: DB (admin) > env. */
export function resolveApiKey() {
  const row = getRow.get();
  if (row?.apiKeyCipher) {
    try {
      const key = decryptApiKey(row.apiKeyCipher)?.trim();
      if (key) return key;
    } catch (err) {
      console.error("[rag] falha ao decifrar api key:", err?.message || err);
    }
  }
  return env.OPENAI_API_KEY?.trim() || null;
}

export function saveRagSettings({ provider, apiKey, actorUserId }) {
  if (!isValidProvider(provider)) {
    const err = new Error("Provedor inválido.");
    err.status = 400;
    throw err;
  }
  const trimmed = String(apiKey || "").trim();
  if (trimmed.length < 16) {
    const err = new Error("Informe uma API key válida.");
    err.status = 400;
    throw err;
  }

  upsert.run({
    provider,
    api_key_cipher: encryptApiKey(trimmed),
    updated_at: nowIso(),
    updated_by: actorUserId,
  });

  return getRagSettingsPublic();
}

export function clearRagApiKey({ actorUserId }) {
  clearKey.run({
    updated_at: nowIso(),
    updated_by: actorUserId,
  });
  return getRagSettingsPublic();
}
