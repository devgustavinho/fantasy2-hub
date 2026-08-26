import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().default(3100),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_PATH: z.string().default("./data/fantasy2.db"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET deve ter pelo menos 16 caracteres"),
  CORS_ORIGIN: z.string().min(1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

// Passkeys ficam amarradas ao domínio do front no momento do cadastro — se o CORS_ORIGIN
// mudar (ex. domínio customizado no lugar do *.pages.dev), passkeys antigas param de
// funcionar e os usuários precisam recadastrar.
export const webauthn = {
  rpID: new URL(env.CORS_ORIGIN).hostname,
  rpOrigin: env.CORS_ORIGIN,
  rpName: "Fantasy 2 Hub",
};
