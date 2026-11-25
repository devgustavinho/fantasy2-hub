import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "./env.js";
import { loadSession } from "./auth/guards.js";
import { authRoutes } from "./modules/auth/routes.js";
import { apartmentsRoutes } from "./modules/apartments/routes.js";
import { topicsRoutes } from "./modules/topics/routes.js";
import { topicsOgRoutes } from "./modules/topics/ogRoutes.js";
import { usersRoutes } from "./modules/users/routes.js";
import { webauthnRoutes } from "./modules/webauthn/routes.js";
import { notificationsRoutes } from "./modules/notifications/routes.js";
import { pushRoutes } from "./modules/push/routes.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { servicesRoutes } from "./modules/services/routes.js";
import { servicesOgRoutes } from "./modules/services/ogRoutes.js";
import { tagsRoutes } from "./modules/tags/routes.js";
import { recommendationsRoutes } from "./modules/recommendations/routes.js";
import { faqRoutes } from "./modules/faq/routes.js";
import { welcomeRoutes } from "./modules/welcome/routes.js";
import { climateRoutes } from "./modules/climate/routes.js";
import { statsRoutes } from "./modules/stats/routes.js";
import { improvementsRoutes } from "./modules/improvements/routes.js";
import { ragRoutes } from "./modules/rag/routes.js";
import { docsRoutes } from "./modules/docs/routes.js";
import { horariosRoutes } from "./modules/horarios/routes.js";
import { contabilRoutes } from "./modules/contabil/routes.js";
import { mcpRoutes } from "./modules/mcp/routes.js";
import { wahaRoutes } from "./modules/waha/routes.js";

const app = express();

// Sessão vai por `Authorization: Bearer`, não cookie — não precisa de `credentials: true`
// nem de cookie-parser (cookie cross-site esbarrava no bloqueio de terceiro do Safari).
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "4mb" }));
app.use(loadSession);

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Preview OG (WhatsApp/crawlers) — público e barato; limiter separado do login.
const ogLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authLimiter, authRoutes());
app.use("/apartments", apartmentsRoutes());
app.use("/topics/og", ogLimiter, topicsOgRoutes());
app.use("/topics", topicsRoutes());
app.use("/users", usersRoutes());
app.use("/webauthn", authLimiter, webauthnRoutes());
app.use("/notifications", notificationsRoutes());
app.use("/push", pushRoutes());
app.use("/audit", auditRoutes());
app.use("/services/og", ogLimiter, servicesOgRoutes());
app.use("/services", servicesRoutes());
app.use("/tags", tagsRoutes());
app.use("/recommendations", recommendationsRoutes());
app.use("/faq", faqRoutes());
app.use("/welcome", welcomeRoutes());
app.use("/climate", climateRoutes());
app.use("/stats", statsRoutes());
app.use("/improvements", improvementsRoutes());
app.use("/rag", ragRoutes());
app.use("/docs", docsRoutes());
app.use("/horarios", horariosRoutes());
app.use("/contabil", contabilRoutes());
// MCP remoto (Streamable HTTP) — clientes como Cursor usam URL + Bearer JWT da sessão.
app.use("/mcp", mcpRoutes());
// Bot WhatsApp (WAHA) — webhook público; autenticação via X-Webhook-Secret opcional.
app.use("/waha", wahaRoutes());

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
