import { Router } from "express";
import { z } from "zod";
import {
  requireApproved,
  requireAuth,
  requireJwtSession,
} from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
  rotateApiToken,
} from "./service.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // ISO-8601; validação fina (passado / inválido) fica no service.
  expiresAt: z.string().trim().min(1).optional().nullable(),
});

function sendServiceError(res, error) {
  const body = { message: error.message };
  if (error.code) body.code = error.code;
  return res.status(error.status || 400).json(body);
}

export function apiTokensRoutes() {
  const router = Router();

  // Gestão de tokens: somente sessão JWT (nunca API token).
  router.use(requireAuth, requireApproved, requireJwtSession);

  router.get("/", (req, res) => {
    res.json({ tokens: listApiTokens(req.user.id) });
  });

  router.post("/", (req, res) => {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe um nome válido para o token." });
    }

    const result = createApiToken({
      user: req.user,
      name: parsed.data.name,
      expiresAt: parsed.data.expiresAt ?? null,
    });
    if (result.error) return sendServiceError(res, result.error);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "api_tokens.create",
      entityType: "api_token",
      entityId: result.token.id,
      details: {
        name: result.token.name,
        prefix: result.token.prefix,
        expiresAt: result.token.expiresAt,
        scopes: result.token.scopes,
      },
    });

    // `value` só nesta resposta — o cliente deve guardar; não há como recuperar depois.
    res.status(201).json({ token: result.token, value: result.value });
  });

  router.delete("/:id", (req, res) => {
    const result = revokeApiToken({ userId: req.user.id, tokenId: req.params.id });
    if (result.error) return sendServiceError(res, result.error);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "api_tokens.revoke",
      entityType: "api_token",
      entityId: result.token.id,
      details: { name: result.token.name, prefix: result.token.prefix },
    });

    res.json({ token: result.token });
  });

  router.post("/:id/rotate", (req, res) => {
    const expiresAt =
      typeof req.body?.expiresAt === "string" && req.body.expiresAt.trim()
        ? req.body.expiresAt.trim()
        : null;
    const result = rotateApiToken({
      user: req.user,
      tokenId: req.params.id,
      expiresAt,
    });
    if (result.error) return sendServiceError(res, result.error);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "api_tokens.rotate",
      entityType: "api_token",
      entityId: result.token.id,
      details: {
        name: result.token.name,
        prefix: result.token.prefix,
        revokedId: result.revokedId,
        expiresAt: result.token.expiresAt,
      },
    });

    res.status(201).json({ token: result.token, value: result.value });
  });

  return router;
}
