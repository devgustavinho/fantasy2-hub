import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { sqlite } from "../../db/client.js";
import { webauthn } from "../../env.js";
import { requireAuth } from "../../auth/guards.js";
import { establishSession } from "../../auth/twoFactor.js";

const CHALLENGE_TTL_MS = 2 * 60 * 1000;

// challenges são de uso único e efêmero — Map em memória é suficiente (mesmo processo Node
// serve tanto a geração quanto a verificação; sem necessidade de persistir em disco).
const registrationChallenges = new Map(); // userId -> { challenge, expiresAt }
const loginChallenges = new Map(); // email -> { challenge, expiresAt }

function takeChallenge(store, key) {
  const entry = store.get(key);
  store.delete(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

const getCredentialsByUser = sqlite.prepare(
  "SELECT id, credential_id, transports, device_name, created_at FROM webauthn_credentials WHERE user_id = ?",
);
const getUserByEmail = sqlite.prepare("SELECT * FROM users WHERE email = ?");
const getCredentialByCredentialId = sqlite.prepare(
  "SELECT * FROM webauthn_credentials WHERE credential_id = ?",
);
const insertCredential = sqlite.prepare(`
  INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, device_name, transports)
  VALUES (@id, @user_id, @credential_id, @public_key, @counter, @device_name, @transports)
`);
const updateCounter = sqlite.prepare("UPDATE webauthn_credentials SET counter = ? WHERE id = ?");
const deleteCredential = sqlite.prepare(
  "DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?",
);

function toCredentialDescriptor(row) {
  return { id: row.credential_id, transports: row.transports ? JSON.parse(row.transports) : undefined };
}

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email() });
const registerVerifySchema = z.object({
  response: z.record(z.any()),
  deviceName: z.string().trim().max(120).optional(),
});
const loginVerifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  response: z.record(z.any()),
});

export function webauthnRoutes() {
  const router = Router();

  router.post("/register/options", requireAuth, async (req, res) => {
    const existing = getCredentialsByUser.all(req.user.id).map(toCredentialDescriptor);

    const options = await generateRegistrationOptions({
      rpName: webauthn.rpName,
      rpID: webauthn.rpID,
      userName: req.user.email,
      userDisplayName: req.user.name,
      userID: Buffer.from(req.user.id),
      attestationType: "none",
      excludeCredentials: existing,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
    });

    registrationChallenges.set(req.user.id, {
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    res.json(options);
  });

  router.post("/register/verify", requireAuth, async (req, res) => {
    const parsed = registerVerifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos." });

    const expectedChallenge = takeChallenge(registrationChallenges, req.user.id);
    if (!expectedChallenge) {
      return res.status(400).json({ message: "Cadastro expirado, tente novamente." });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: parsed.data.response,
        expectedChallenge,
        expectedOrigin: webauthn.rpOrigin,
        expectedRPID: webauthn.rpID,
      });
    } catch (err) {
      return res.status(400).json({ message: `Não foi possível verificar: ${err.message}` });
    }

    if (!verification.verified) {
      return res.status(400).json({ message: "Não foi possível verificar a passkey." });
    }

    const { credential } = verification.registrationInfo;
    const id = randomUUID();
    insertCredential.run({
      id,
      user_id: req.user.id,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      device_name: parsed.data.deviceName || null,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
    });

    res.status(201).json({ credential: { id, deviceName: parsed.data.deviceName || null } });
  });

  router.post("/login/options", async (req, res) => {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Informe o e-mail." });

    const user = getUserByEmail.get(parsed.data.email);
    const allowCredentials = user
      ? getCredentialsByUser.all(user.id).map(toCredentialDescriptor)
      : [];

    if (!user || allowCredentials.length === 0) {
      return res.status(404).json({ message: "Nenhuma passkey cadastrada para este e-mail." });
    }

    const options = await generateAuthenticationOptions({
      rpID: webauthn.rpID,
      allowCredentials,
      userVerification: "preferred",
    });

    loginChallenges.set(parsed.data.email, {
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    res.json(options);
  });

  router.post("/login/verify", async (req, res) => {
    const parsed = loginVerifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Dados inválidos." });

    const { email, response } = parsed.data;
    const expectedChallenge = takeChallenge(loginChallenges, email);
    if (!expectedChallenge) {
      return res.status(400).json({ message: "Login expirado, tente novamente." });
    }

    const user = getUserByEmail.get(email);
    const credentialRow = response.id ? getCredentialByCredentialId.get(response.id) : null;
    if (!user || !credentialRow || credentialRow.user_id !== user.id) {
      return res.status(401).json({ message: "Passkey não reconhecida." });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: webauthn.rpOrigin,
        expectedRPID: webauthn.rpID,
        credential: {
          id: credentialRow.credential_id,
          publicKey: new Uint8Array(Buffer.from(credentialRow.public_key, "base64")),
          counter: credentialRow.counter,
          transports: credentialRow.transports ? JSON.parse(credentialRow.transports) : undefined,
        },
      });
    } catch (err) {
      return res.status(400).json({ message: `Não foi possível verificar: ${err.message}` });
    }

    if (!verification.verified) {
      return res.status(401).json({ message: "Não foi possível autenticar com a passkey." });
    }

    updateCounter.run(verification.authenticationInfo.newCounter, credentialRow.id);
    res.json(await establishSession(res, user));
  });

  router.get("/credentials", requireAuth, (req, res) => {
    const credentials = getCredentialsByUser.all(req.user.id).map((row) => ({
      id: row.id,
      deviceName: row.device_name,
      createdAt: row.created_at,
    }));
    res.json({ credentials });
  });

  router.delete("/credentials/:id", requireAuth, (req, res) => {
    const result = deleteCredential.run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ message: "Passkey não encontrada." });
    res.status(204).end();
  });

  return router;
}
