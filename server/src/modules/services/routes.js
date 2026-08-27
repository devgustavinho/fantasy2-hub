import { randomUUID } from "node:crypto";
import { mkdirSync, unlink } from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireApproved } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";

const UPLOADS_ROOT = path.resolve("data/uploads/services");
mkdirSync(UPLOADS_ROOT, { recursive: true });

const ALLOWED_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_ROOT),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${ALLOWED_MIME[file.mimetype] ?? ""}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      return cb(new Error("Formato de imagem inválido (use JPG, PNG ou WebP)."));
    }
    cb(null, true);
  },
});

// Multer/fileFilter erros vão pro `next(err)` do Express; sem esse wrapper, cairiam no
// error handler genérico (500) em vez de virar um 400 com mensagem útil pro usuário.
function handleImageUpload(req, res, next) {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || "Erro no upload da imagem." });
    next();
  });
}

function deleteImageFile(imagePath) {
  if (!imagePath) return;
  const filename = imagePath.split("/").pop();
  unlink(path.join(UPLOADS_ROOT, filename), () => {});
}

const nowIso = () => new Date().toISOString();

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  whatsapp: z.string().trim().min(8, "Informe um número de WhatsApp válido.").max(30),
});

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  price: z.coerce.number().min(0).max(1_000_000),
});

const setWhatsappVisible = sqlite.prepare(
  "UPDATE users SET whatsapp = ?, whatsapp_visible = 1 WHERE id = ?",
);

const getServiceByUser = sqlite.prepare("SELECT * FROM condo_services WHERE user_id = ?");
const getServiceById = sqlite.prepare("SELECT * FROM condo_services WHERE id = ?");

const listServices = sqlite.prepare(`
  SELECT s.id, s.name, s.description, s.created_at AS createdAt,
         u.id AS ownerId, u.name AS ownerName, u.whatsapp AS ownerWhatsapp,
         a.tower, a.code AS apartmentCode
  FROM condo_services s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN apartments a ON a.id = u.apartment_id
  ORDER BY s.created_at DESC
`);

const listItemsByService = sqlite.prepare(`
  SELECT id, name, description, price_cents AS priceCents, image_path AS imagePath,
         created_at AS createdAt
  FROM condo_service_items
  WHERE service_id = ?
  ORDER BY created_at ASC
`);

const insertService = sqlite.prepare(`
  INSERT INTO condo_services (id, user_id, name, description)
  VALUES (@id, @user_id, @name, @description)
`);

const updateService = sqlite.prepare(`
  UPDATE condo_services SET name = @name, description = @description, updated_at = @updated_at
  WHERE id = @id
`);

const deleteServiceById = sqlite.prepare("DELETE FROM condo_services WHERE id = ?");

const getItemById = sqlite.prepare("SELECT * FROM condo_service_items WHERE id = ?");

const insertItem = sqlite.prepare(`
  INSERT INTO condo_service_items (id, service_id, name, description, price_cents, image_path)
  VALUES (@id, @service_id, @name, @description, @price_cents, @image_path)
`);

const updateItem = sqlite.prepare(`
  UPDATE condo_service_items
  SET name = @name, description = @description, price_cents = @price_cents,
      image_path = @image_path, updated_at = @updated_at
  WHERE id = @id
`);

const deleteItemById = sqlite.prepare("DELETE FROM condo_service_items WHERE id = ?");

function serializeService(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    owner: {
      id: row.ownerId,
      name: row.ownerName,
      whatsapp: row.ownerWhatsapp,
      tower: row.tower,
      apartmentCode: row.apartmentCode,
    },
    items: listItemsByService.all(row.id),
  };
}

export function servicesRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (_req, res) => {
    res.json({ services: listServices.all().map(serializeService) });
  });

  router.get("/mine", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.json({ service: null });
    res.json({
      service: {
        id: service.id,
        name: service.name,
        description: service.description,
        items: listItemsByService.all(service.id),
      },
    });
  });

  router.post("/", (req, res) => {
    if (getServiceByUser.get(req.user.id)) {
      return res.status(409).json({ message: "Você já tem um serviço cadastrado." });
    }

    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha nome do serviço e um WhatsApp válido." });
    }

    setWhatsappVisible.run(parsed.data.whatsapp, req.user.id);

    const id = randomUUID();
    insertService.run({
      id,
      user_id: req.user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.create",
      entityType: "service",
      entityId: id,
      details: { name: parsed.data.name },
    });

    const created = getServiceById.get(id);
    res.status(201).json({ service: { id: created.id, name: created.name, description: created.description, items: [] } });
  });

  router.patch("/mine", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Cadastre seu serviço primeiro." });

    const parsed = serviceSchema.pick({ name: true, description: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha o nome do serviço." });
    }

    updateService.run({
      id: service.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      updated_at: nowIso(),
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.edit",
      entityType: "service",
      entityId: service.id,
    });

    const updated = getServiceById.get(service.id);
    res.json({
      service: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        items: listItemsByService.all(updated.id),
      },
    });
  });

  router.delete("/mine", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um serviço cadastrado." });

    for (const item of listItemsByService.all(service.id)) {
      deleteImageFile(item.imagePath);
    }
    deleteServiceById.run(service.id);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.delete",
      entityType: "service",
      entityId: service.id,
      details: { name: service.name },
    });

    res.status(204).end();
  });

  router.post("/mine/items", handleImageUpload, (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Cadastre seu serviço antes de adicionar itens." });

    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha nome e preço do item." });
    }

    const id = randomUUID();
    insertItem.run({
      id,
      service_id: service.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price_cents: Math.round(parsed.data.price * 100),
      image_path: req.file ? `/uploads/services/${req.file.filename}` : null,
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_create",
      entityType: "service_item",
      entityId: id,
      details: { serviceId: service.id, name: parsed.data.name },
    });

    res.status(201).json({ items: listItemsByService.all(service.id) });
  });

  router.patch("/mine/items/:itemId", handleImageUpload, (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um serviço cadastrado." });

    const item = getItemById.get(req.params.itemId);
    if (!item || item.service_id !== service.id) {
      return res.status(404).json({ message: "Item não encontrado." });
    }

    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha nome e preço do item." });
    }

    let imagePath = item.image_path;
    if (req.file) {
      deleteImageFile(item.image_path);
      imagePath = `/uploads/services/${req.file.filename}`;
    }

    updateItem.run({
      id: item.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price_cents: Math.round(parsed.data.price * 100),
      image_path: imagePath,
      updated_at: nowIso(),
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_edit",
      entityType: "service_item",
      entityId: item.id,
    });

    res.json({ items: listItemsByService.all(service.id) });
  });

  router.delete("/mine/items/:itemId", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um serviço cadastrado." });

    const item = getItemById.get(req.params.itemId);
    if (!item || item.service_id !== service.id) {
      return res.status(404).json({ message: "Item não encontrado." });
    }

    deleteImageFile(item.image_path);
    deleteItemById.run(item.id);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_delete",
      entityType: "service_item",
      entityId: item.id,
      details: { serviceId: service.id, name: item.name },
    });

    res.status(204).end();
  });

  return router;
}
