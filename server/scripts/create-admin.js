// Cria (ou promove) uma conta admin, sem apartamento vinculado.
// Uso: node scripts/create-admin.js --email=sindico@example.com --password=senhaSegura --name="Síndico"
import { randomUUID } from "node:crypto";
import { sqlite } from "../src/db/client.js";
import { hashPassword } from "../src/auth/password.js";

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

const { email, password, name } = parseArgs();

if (!email || !password) {
  console.error('Uso: node scripts/create-admin.js --email=... --password=... --name="..."');
  process.exit(1);
}

const normalizedEmail = email.trim().toLowerCase();
const existing = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);

const passwordHash = await hashPassword(password);

if (existing) {
  sqlite
    .prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?")
    .run(passwordHash, existing.id);
  console.log(`Usuário existente promovido a admin: ${normalizedEmail}`);
} else {
  const id = randomUUID();
  sqlite
    .prepare(
      "INSERT INTO users (id, apartment_id, name, email, password_hash, role) VALUES (?, NULL, ?, ?, ?, 'admin')",
    )
    .run(id, name || "Administração", normalizedEmail, passwordHash);
  console.log(`Admin criado: ${normalizedEmail}`);
}
