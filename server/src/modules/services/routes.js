import { randomUUID } from "node:crypto";
import { mkdirSync, unlink } from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireApproved, requireAdmin } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";

const UPLOADS_ROOT = path.resolve("data/uploads/services");
mkdirSync(UPLOADS_ROOT, { recursive: true });

const MAX_IMAGES_PER_ITEM = 5;

// Guarda os arquivos em memória (não em disco) porque toda imagem passa pelo sharp antes de
// ser salva — normaliza formato (inclusive HEIC/HEIF de iPhone, que o navegador às vezes manda
// com um mimetype que o multer sozinho rejeitaria) e gera uma miniatura de verdade, em vez de
// guardar a foto original de 12MP direto do celular.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_IMAGES_PER_ITEM },
});

// Multer/sharp erros vão pro `next(err)` do Express; sem esse wrapper, cairiam no error
// handler genérico (500) em vez de virar um 400 com mensagem útil pro usuário.
function handleImagesUpload(req, res, next) {
  upload.array("images", MAX_IMAGES_PER_ITEM)(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || "Erro no upload das imagens." });
    next();
  });
}

// Decodifica com o sharp (aceita JPEG/PNG/WebP/HEIC/HEIF e outros) e sempre regrava como JPEG
// de até 1200px no lado maior — isso é o que garante a "miniatura" pedida, elimina qualquer
// ambiguidade de mimetype vinda do celular, e evita guardar fotos de vários MB sem necessidade.
async function processAndSaveImage(buffer) {
  const filename = `${randomUUID()}.jpg`;
  const outPath = path.join(UPLOADS_ROOT, filename);
  await sharp(buffer)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(outPath);
  return `/uploads/services/${filename}`;
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
  removeImageIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : [])),
});

const tagsAssignSchema = z.object({ tagIds: z.array(z.string()).max(20) });

const setWhatsappVisible = sqlite.prepare(
  "UPDATE users SET whatsapp = ?, whatsapp_visible = 1 WHERE id = ?",
);

const getServiceByUser = sqlite.prepare("SELECT * FROM condo_services WHERE user_id = ?");
const getServiceById = sqlite.prepare("SELECT * FROM condo_services WHERE id = ?");

const listServicesBase = sqlite.prepare(`
  SELECT s.id, s.name, s.description, s.created_at AS createdAt,
         u.id AS ownerId, u.name AS ownerName, u.whatsapp AS ownerWhatsapp,
         a.tower, a.code AS apartmentCode
  FROM condo_services s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN apartments a ON a.id = u.apartment_id
  ORDER BY s.created_at DESC
`);

const listItemsByService = sqlite.prepare(`
  SELECT id, name, description, price_cents AS priceCents, created_at AS createdAt
  FROM condo_service_items
  WHERE service_id = ?
  ORDER BY created_at ASC
`);

const listImagesByItem = sqlite.prepare(`
  SELECT id, path FROM condo_service_item_images WHERE item_id = ? ORDER BY position ASC, created_at ASC
`);

const countImagesByItem = sqlite.prepare(
  "SELECT COUNT(*) AS c FROM condo_service_item_images WHERE item_id = ?",
);

const insertImage = sqlite.prepare(`
  INSERT INTO condo_service_item_images (id, item_id, path, position)
  VALUES (@id, @item_id, @path, @position)
`);

const getImageById = sqlite.prepare("SELECT * FROM condo_service_item_images WHERE id = ?");
const deleteImageRow = sqlite.prepare("DELETE FROM condo_service_item_images WHERE id = ?");

const listTagsByService = sqlite.prepare(`
  SELECT t.id, t.name FROM service_tags st JOIN tags t ON t.id = st.tag_id
  WHERE st.service_id = ? ORDER BY t.name ASC
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
  INSERT INTO condo_service_items (id, service_id, name, description, price_cents)
  VALUES (@id, @service_id, @name, @description, @price_cents)
`);

const updateItem = sqlite.prepare(`
  UPDATE condo_service_items
  SET name = @name, description = @description, price_cents = @price_cents, updated_at = @updated_at
  WHERE id = @id
`);

const deleteItemById = sqlite.prepare("DELETE FROM condo_service_items WHERE id = ?");
const deleteServiceTags = sqlite.prepare("DELETE FROM service_tags WHERE service_id = ?");
const insertServiceTag = sqlite.prepare(
  "INSERT OR IGNORE INTO service_tags (service_id, tag_id) VALUES (?, ?)",
);
const getTagById = sqlite.prepare("SELECT id FROM tags WHERE id = ?");

function serializeItem(row) {
  return { ...row, images: listImagesByItem.all(row.id) };
}

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
    tags: listTagsByService.all(row.id),
    items: listItemsByService.all(row.id).map(serializeItem),
  };
}

async function saveNewImages(itemId, files, startPosition) {
  let position = startPosition;
  for (const file of files) {
    const imagePath = await processAndSaveImage(file.buffer);
    insertImage.run({ id: randomUUID(), item_id: itemId, path: imagePath, position });
    position += 1;
  }
}

export function servicesRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (req, res) => {
    const tagFilter = typeof req.query.tags === "string" ? req.query.tags.split(",").filter(Boolean) : [];

    let services = listServicesBase.all().map(serializeService);
    if (tagFilter.length > 0) {
      services = services.filter((s) => s.tags.some((t) => tagFilter.includes(t.id)));
    }

    res.json({ services });
  });

  router.get("/mine", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.json({ service: null });
    res.json({
      service: {
        id: service.id,
        name: service.name,
        description: service.description,
        tags: listTagsByService.all(service.id),
        items: listItemsByService.all(service.id).map(serializeItem),
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
    res.status(201).json({
      service: { id: created.id, name: created.name, description: created.description, tags: [], items: [] },
    });
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
        tags: listTagsByService.all(updated.id),
        items: listItemsByService.all(updated.id).map(serializeItem),
      },
    });
  });

  router.delete("/mine", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um serviço cadastrado." });

    for (const item of listItemsByService.all(service.id)) {
      for (const image of listImagesByItem.all(item.id)) {
        deleteImageFile(image.path);
      }
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

  // Admin-only: define o conjunto de tags de um serviço (substitui tudo). As tags em si são
  // um vocabulário controlado pela administração (`/tags`) — quem anuncia o serviço não
  // escolhe as próprias tags, pra manter a taxonomia consistente entre os moradores.
  router.put("/:id/tags", requireAdmin, (req, res) => {
    const service = getServiceById.get(req.params.id);
    if (!service) return res.status(404).json({ message: "Serviço não encontrado." });

    const parsed = tagsAssignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Lista de tags inválida." });

    for (const tagId of parsed.data.tagIds) {
      if (!getTagById.get(tagId)) return res.status(400).json({ message: "Tag inexistente." });
    }

    const applyTags = sqlite.transaction((tagIds) => {
      deleteServiceTags.run(service.id);
      for (const tagId of tagIds) insertServiceTag.run(service.id, tagId);
    });
    applyTags(parsed.data.tagIds);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.tags_set",
      entityType: "service",
      entityId: service.id,
      details: { tagIds: parsed.data.tagIds },
    });

    res.json({ tags: listTagsByService.all(service.id) });
  });

  router.post("/mine/items", handleImagesUpload, async (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Cadastre seu serviço antes de adicionar itens." });

    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha nome e preço do item." });
    }

    const files = req.files ?? [];
    if (files.length > MAX_IMAGES_PER_ITEM) {
      return res.status(400).json({ message: `Envie no máximo ${MAX_IMAGES_PER_ITEM} fotos por item.` });
    }

    const id = randomUUID();
    try {
      insertItem.run({
        id,
        service_id: service.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        price_cents: Math.round(parsed.data.price * 100),
      });
      await saveNewImages(id, files, 0);
    } catch (err) {
      for (const image of listImagesByItem.all(id)) deleteImageFile(image.path);
      deleteItemById.run(id);
      return res.status(400).json({ message: "Não foi possível processar uma das imagens enviadas." });
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_create",
      entityType: "service_item",
      entityId: id,
      details: { serviceId: service.id, name: parsed.data.name },
    });

    res.status(201).json({ items: listItemsByService.all(service.id).map(serializeItem) });
  });

  router.patch("/mine/items/:itemId", handleImagesUpload, async (req, res) => {
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

    const files = req.files ?? [];
    const currentCount = countImagesByItem.get(item.id).c;
    const keptCount = currentCount - parsed.data.removeImageIds.length;
    if (keptCount + files.length > MAX_IMAGES_PER_ITEM) {
      return res.status(400).json({ message: `Envie no máximo ${MAX_IMAGES_PER_ITEM} fotos por item.` });
    }

    for (const imageId of parsed.data.removeImageIds) {
      const image = getImageById.get(imageId);
      if (!image || image.item_id !== item.id) continue;
      deleteImageFile(image.path);
      deleteImageRow.run(imageId);
    }

    updateItem.run({
      id: item.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price_cents: Math.round(parsed.data.price * 100),
      updated_at: nowIso(),
    });

    try {
      await saveNewImages(item.id, files, countImagesByItem.get(item.id).c);
    } catch (err) {
      return res.status(400).json({ message: "Não foi possível processar uma das imagens enviadas." });
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_edit",
      entityType: "service_item",
      entityId: item.id,
    });

    res.json({ items: listItemsByService.all(service.id).map(serializeItem) });
  });

  router.delete("/mine/items/:itemId", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um serviço cadastrado." });

    const item = getItemById.get(req.params.itemId);
    if (!item || item.service_id !== service.id) {
      return res.status(404).json({ message: "Item não encontrado." });
    }

    for (const image of listImagesByItem.all(item.id)) {
      deleteImageFile(image.path);
    }
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
