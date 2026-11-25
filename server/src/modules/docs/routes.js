import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { requireAuth, requireApproved } from "../../auth/guards.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANUAL_PDF = join(__dirname, "..", "..", "..", "assets", "docs", "manual-do-proprietario.pdf");
const MANUAL_FILENAME = "Manual-do-Proprietario-Fantasy-2.pdf";

/**
 * Documentos estáticos do condomínio (PDF no disco do server).
 * Acesso: morador aprovado (mesmo nível de FAQ/Horários).
 */
export function docsRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/manual-do-proprietario", (req, res) => {
    if (!existsSync(MANUAL_PDF)) {
      return res.status(404).json({ message: "Manual do Proprietário não encontrado no servidor." });
    }

    const { size } = statSync(MANUAL_PDF);
    const download = req.query.download === "1" || req.query.download === "true";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(size));
    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${MANUAL_FILENAME}"`,
    );
    res.setHeader("Cache-Control", "private, max-age=3600");
    createReadStream(MANUAL_PDF).pipe(res);
  });

  router.get("/", (_req, res) => {
    res.json({
      documents: [
        {
          id: "manual-do-proprietario",
          title: "Manual do Proprietário",
          description: "Guia de uso e conservação do imóvel Fantasy 2 (FAN Construções).",
          contentType: "application/pdf",
          path: "/docs/manual-do-proprietario",
        },
      ],
    });
  });

  return router;
}

export { MANUAL_PDF };
