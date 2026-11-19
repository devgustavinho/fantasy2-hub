import { randomBytes } from "node:crypto";
import { sqlite } from "../../db/client.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 12;

const codeExists = sqlite.prepare("SELECT 1 AS ok FROM topics WHERE share_code = ? LIMIT 1");
const listMissing = sqlite.prepare("SELECT id FROM topics WHERE share_code IS NULL");
const setCode = sqlite.prepare("UPDATE topics SET share_code = ? WHERE id = ? AND share_code IS NULL");

export function generateShareCode(length = CODE_LENGTH) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function allocateShareCode() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = generateShareCode();
    if (!codeExists.get(code)) return code;
  }
  throw new Error("Não foi possível gerar um código curto único para a pauta.");
}

export function isValidShareCode(code) {
  return typeof code === "string" && /^[A-Za-z0-9]{1,6}$/.test(code);
}

/** Preenche share_code em pautas antigas (migration deixa NULL). Idempotente. */
export function ensureTopicShareCodes() {
  const missing = listMissing.all();
  if (missing.length === 0) return 0;
  const fill = sqlite.transaction((rows) => {
    for (const row of rows) {
      setCode.run(allocateShareCode(), row.id);
    }
  });
  fill(missing);
  return missing.length;
}
