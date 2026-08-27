import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "./env.js";
import { loadSession } from "./auth/guards.js";
import { authRoutes } from "./modules/auth/routes.js";
import { apartmentsRoutes } from "./modules/apartments/routes.js";
import { topicsRoutes } from "./modules/topics/routes.js";
import { usersRoutes } from "./modules/users/routes.js";
import { webauthnRoutes } from "./modules/webauthn/routes.js";
import { notificationsRoutes } from "./modules/notifications/routes.js";
import { pushRoutes } from "./modules/push/routes.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { servicesRoutes } from "./modules/services/routes.js";
import { tagsRoutes } from "./modules/tags/routes.js";
import { recommendationsRoutes } from "./modules/recommendations/routes.js";
import { faqRoutes } from "./modules/faq/routes.js";

const app = express();

// Sessão vai por `Authorization: Bearer`, não cookie — não precisa de `credentials: true`
// nem de cookie-parser (cookie cross-site esbarrava no bloqueio de terceiro do Safari).
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());
app.use(loadSession);

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authLimiter, authRoutes());
app.use("/apartments", apartmentsRoutes());
app.use("/topics", topicsRoutes());
app.use("/users", usersRoutes());
app.use("/webauthn", authLimiter, webauthnRoutes());
app.use("/notifications", notificationsRoutes());
app.use("/push", pushRoutes());
app.use("/audit", auditRoutes());
app.use("/services", servicesRoutes());
app.use("/tags", tagsRoutes());
app.use("/recommendations", recommendationsRoutes());
app.use("/faq", faqRoutes());

app.use((_req, res) => {
  res.status(404).json({ message: "Não encontrado." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Erro interno do servidor." });
});

app.listen(env.PORT, env.HOST, () => {
  console.log(`fantasy2-hub API ouvindo em http://${env.HOST}:${env.PORT}`);
});
