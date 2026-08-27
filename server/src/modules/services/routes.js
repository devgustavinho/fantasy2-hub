import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireApproved, requireAdmin } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";
import { deleteFromR2 } from "../../lib/r2.js";
import { processAndSaveImage as processAndSaveImageShared } from "../../lib/media.js";

const MAX_IMAGES_PER_ITEM = 5;

// Guarda os arquivos em memória (não em disco) porque toda imagem passa pelo sharp antes de
// ser salva — normaliza formato (inclusive HEIC/HEIF de iPhone, que o navegador às vezes manda
// com um mimetype que o multer sozinho rejeitaria) e gera uma miniatura de verdade, em vez de
// guardar a foto original de 12MP direto do celular.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: MAX_IMAGES_PER_ITEM },
});
const uploadSingle = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

// Multer/sharp erros vão pro `next(err)` do Express; sem esse wrapper, cairiam no error
// handler genérico (500) em vez de virar um 400 com mensagem útil pro usuário.
function handleImagesUpload(req, res, next) {
  upload.array("images", MAX_IMAGES_PER_ITEM)(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || "Erro no upload das imagens." });
    next();
  });
}

function handlePhotoUpload(req, res, next) {
  uploadSingle.single("photo")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || "Erro no upload da foto." });
    next();
  });
}

function processAndSaveImage(buffer) {
  return processAndSaveImageShared(buffer, "services");
}

function deleteImageFile(imagePath) {
  if (!imagePath) return;
  deleteFromR2(imagePath);
}

const nowIso = () => new Date().toISOString();

// Aceita "@handle", link completo (https://instagram.com/handle) ou só o handle — sempre
// guarda só o handle puro, a URL é remontada no front na hora de exibir.
function normalizeInstagram(value) {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  return cleaned || null;
}

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  instagram: z.string().trim().max(60).optional().nullable(),
});

// `z.coerce.boolean()` usa `Boolean(valor)` — pra uma STRING (é assim que chega de
// multipart/form-data), qualquer string não-vazia vira `true`, inclusive a string `"false"`
// literal! Isso fazia todo item marcado como "não negociável" no formulário ser salvo como
// negociável (zerando o preço). Esse preprocess trata string/boolean de verdade.
const booleanInput = z.preprocess((val) => {
  if (typeof val === "string") return val === "true" || val === "1";
  return val;
}, z.boolean());

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  price: z.coerce.number().min(0).max(1_000_000).optional().default(0),
  isNegotiable: booleanInput.optional().default(false),
  // Não preenchido = item fixo em 1 unidade (comportamento padrão). Um número > 1 deixa o
  // cliente escolher a quantidade (1 até esse valor) no montador do item.
  maxQuantity: z.coerce.number().int().min(1).max(99).optional().nullable(),
  removeImageIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v ? (Array.isArray(v) ? v : [v]) : [])),
});

const groupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  selectionType: z.enum(["single", "multi"]),
  maxSelections: z.coerce.number().int().min(1).max(20).optional().nullable(),
  required: booleanInput.optional().default(false),
});

const optionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceDeltaCents: z.coerce.number().int().min(-1_000_000).max(1_000_000).optional().default(0),
});

const tagsAssignSchema = z.object({ tagIds: z.array(z.string()).max(20) });

const setWhatsappVisible = sqlite.prepare(
  "UPDATE users SET whatsapp = ?, whatsapp_visible = 1 WHERE id = ?",
);

const getServiceByUser = sqlite.prepare("SELECT * FROM condo_services WHERE user_id = ?");
const getServiceById = sqlite.prepare("SELECT * FROM condo_services WHERE id = ?");

const SERVICE_JOIN_SELECT = `
  SELECT s.id, s.name, s.description, s.instagram, s.image_path AS imagePath, s.created_at AS createdAt,
         u.id AS ownerId, u.name AS ownerName, u.whatsapp AS ownerWhatsapp,
         a.tower, a.code AS apartmentCode
  FROM condo_services s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN apartments a ON a.id = u.apartment_id
`;

const listServicesBase = sqlite.prepare(`${SERVICE_JOIN_SELECT} ORDER BY s.created_at DESC`);

// `getServiceById` (sem JOIN) serve pra achar a linha crua da tabela antes de um UPDATE/DELETE;
// pra responder pro cliente (com dono/apartamento) sempre passa por essa, com o mesmo JOIN da
// listagem — sem isso, `serializeService*` recebe uma linha sem os campos ownerId/ownerName/etc,
// e o `owner` sai como `{}` no JSON.
const getServiceWithOwnerById = sqlite.prepare(`${SERVICE_JOIN_SELECT} WHERE s.id = ?`);

const listItemsByService = sqlite.prepare(`
  SELECT id, name, description, price_cents AS priceCents, is_negotiable AS isNegotiable,
         max_quantity AS maxQuantity, created_at AS createdAt
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
  INSERT INTO condo_services (id, user_id, name, description, instagram)
  VALUES (@id, @user_id, @name, @description, @instagram)
`);

const updateService = sqlite.prepare(`
  UPDATE condo_services SET name = @name, description = @description, instagram = @instagram, updated_at = @updated_at
  WHERE id = @id
`);

const setServiceImage = sqlite.prepare(
  "UPDATE condo_services SET image_path = @image_path, updated_at = @updated_at WHERE id = @id",
);

const deleteServiceById = sqlite.prepare("DELETE FROM condo_services WHERE id = ?");

const getItemById = sqlite.prepare("SELECT * FROM condo_service_items WHERE id = ?");

const insertItem = sqlite.prepare(`
  INSERT INTO condo_service_items (id, service_id, name, description, price_cents, is_negotiable, max_quantity)
  VALUES (@id, @service_id, @name, @description, @price_cents, @is_negotiable, @max_quantity)
`);

const updateItem = sqlite.prepare(`
  UPDATE condo_service_items
  SET name = @name, description = @description, price_cents = @price_cents,
      is_negotiable = @is_negotiable, max_quantity = @max_quantity, updated_at = @updated_at
  WHERE id = @id
`);

const deleteItemById = sqlite.prepare("DELETE FROM condo_service_items WHERE id = ?");
const deleteServiceTags = sqlite.prepare("DELETE FROM service_tags WHERE service_id = ?");
const insertServiceTag = sqlite.prepare(
  "INSERT OR IGNORE INTO service_tags (service_id, tag_id) VALUES (?, ?)",
);
const getTagById = sqlite.prepare("SELECT id FROM tags WHERE id = ?");

// Configurador de item (grupos de opção + opções)
const listGroupsByItem = sqlite.prepare(`
  SELECT id, name, selection_type AS selectionType, max_selections AS maxSelections, required
  FROM condo_service_item_option_groups WHERE item_id = ? ORDER BY position ASC, created_at ASC
`);
const getGroupById = sqlite.prepare("SELECT * FROM condo_service_item_option_groups WHERE id = ?");
const countGroupsByItem = sqlite.prepare(
  "SELECT COUNT(*) AS c FROM condo_service_item_option_groups WHERE item_id = ?",
);
const insertGroup = sqlite.prepare(`
  INSERT INTO condo_service_item_option_groups (id, item_id, name, selection_type, max_selections, required, position)
  VALUES (@id, @item_id, @name, @selection_type, @max_selections, @required, @position)
`);
const updateGroup = sqlite.prepare(`
  UPDATE condo_service_item_option_groups
  SET name = @name, selection_type = @selection_type, max_selections = @max_selections, required = @required
  WHERE id = @id
`);
const deleteGroupById = sqlite.prepare("DELETE FROM condo_service_item_option_groups WHERE id = ?");

const listOptionsByGroup = sqlite.prepare(`
  SELECT id, name, price_delta_cents AS priceDeltaCents
  FROM condo_service_item_options WHERE group_id = ? ORDER BY position ASC, created_at ASC
`);
const getOptionById = sqlite.prepare("SELECT * FROM condo_service_item_options WHERE id = ?");
const countOptionsByGroup = sqlite.prepare(
  "SELECT COUNT(*) AS c FROM condo_service_item_options WHERE group_id = ?",
);
const insertOption = sqlite.prepare(`
  INSERT INTO condo_service_item_options (id, group_id, name, price_delta_cents, position)
  VALUES (@id, @group_id, @name, @price_delta_cents, @position)
`);
const updateOption = sqlite.prepare(
  "UPDATE condo_service_item_options SET name = @name, price_delta_cents = @price_delta_cents WHERE id = @id",
);
const deleteOptionById = sqlite.prepare("DELETE FROM condo_service_item_options WHERE id = ?");

function serializeGroup(row) {
  return {
    id: row.id,
    name: row.name,
    selectionType: row.selectionType,
    maxSelections: row.maxSelections ?? null,
    required: Boolean(row.required),
    options: listOptionsByGroup.all(row.id),
  };
}

function serializeItem(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    isNegotiable: Boolean(row.isNegotiable),
    maxQuantity: row.maxQuantity ?? null,
    createdAt: row.createdAt,
    images: listImagesByItem.all(row.id),
    optionGroups: listGroupsByItem.all(row.id).map(serializeGroup),
  };
}

// Listagem pública (`GET /services`) não traz os itens — só o suficiente pra escolher o
// serviço; os itens (e as opções de cada um) só vêm no detalhe (`GET /services/:id`), que tem
// seu próprio link dedicado no front.
function serializeServiceSummary(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instagram: row.instagram,
    imagePath: row.imagePath,
    createdAt: row.createdAt,
    owner: {
      id: row.ownerId,
      name: row.ownerName,
      whatsapp: row.ownerWhatsapp,
      tower: row.tower,
      apartmentCode: row.apartmentCode,
    },
    tags: listTagsByService.all(row.id),
  };
}

function serializeServiceDetail(row) {
  return { ...serializeServiceSummary(row), items: listItemsByService.all(row.id).map(serializeItem) };
}

async function saveNewImages(itemId, files, startPosition) {
  let position = startPosition;
  for (const file of files) {
    const imagePath = await processAndSaveImage(file.buffer);
    insertImage.run({ id: randomUUID(), item_id: itemId, path: imagePath, position });
    position += 1;
  }
}

function getOwnedItem(userId, itemId) {
  const service = getServiceByUser.get(userId);
  if (!service) return null;
  const item = getItemById.get(itemId);
  if (!item || item.service_id !== service.id) return null;
  return item;
}

function getOwnedGroup(userId, itemId, groupId) {
  const item = getOwnedItem(userId, itemId);
  if (!item) return null;
  const group = getGroupById.get(groupId);
  if (!group || group.item_id !== item.id) return null;
  return group;
}

export function servicesRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (req, res) => {
    const tagFilter = typeof req.query.tags === "string" ? req.query.tags.split(",").filter(Boolean) : [];

    let services = listServicesBase.all().map(serializeServiceSummary);
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
        ...serializeServiceDetail(getServiceWithOwnerById.get(service.id)),
        whatsapp: req.user.whatsapp,
      },
    });
  });

  // Link dedicado do serviço — mostra os itens (com fotos, preço/"a negociar" e as opções de
  // configuração de cada um). Antes disso, a listagem pública não mostra nenhum item.
  router.get("/:id", (req, res) => {
    const service = getServiceWithOwnerById.get(req.params.id);
    if (!service) return res.status(404).json({ message: "Serviço não encontrado." });
    res.json({ service: serializeServiceDetail(service) });
  });

  // WhatsApp e Instagram são opcionais: um serviço pode divulgar só um dos dois (ou os dois).
  // Foto também é opcional aqui — antes só dava pra anexar depois de já ter criado o serviço
  // (a tela de edição só aparece depois do cadastro), o que fazia parecer que a opção nem
  // existia. `handlePhotoUpload` faz o multipart virar `req.body` (strings) + `req.file`.
  router.post("/", handlePhotoUpload, async (req, res) => {
    if (getServiceByUser.get(req.user.id)) {
      return res.status(409).json({ message: "Você já tem um serviço cadastrado." });
    }

    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha ao menos o nome do serviço." });
    }

    if (parsed.data.whatsapp) {
      setWhatsappVisible.run(parsed.data.whatsapp, req.user.id);
    }

    const id = randomUUID();
    insertService.run({
      id,
      user_id: req.user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      instagram: normalizeInstagram(parsed.data.instagram),
    });

    if (req.file) {
      const imagePath = await processAndSaveImage(req.file.buffer);
      setServiceImage.run({ id, image_path: imagePath, updated_at: nowIso() });
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.create",
      entityType: "service",
      entityId: id,
      details: { name: parsed.data.name },
    });

    res.status(201).json({ service: { ...serializeServiceDetail(getServiceWithOwnerById.get(id)) } });
  });

  router.patch("/mine", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Cadastre seu serviço primeiro." });

    const parsed = serviceSchema.pick({ name: true, description: true, whatsapp: true, instagram: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha o nome do serviço." });
    }

    if (parsed.data.whatsapp) {
      setWhatsappVisible.run(parsed.data.whatsapp, req.user.id);
    }

    updateService.run({
      id: service.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      instagram: normalizeInstagram(parsed.data.instagram),
      updated_at: nowIso(),
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.edit",
      entityType: "service",
      entityId: service.id,
    });

    res.json({
      service: {
        ...serializeServiceDetail(getServiceWithOwnerById.get(service.id)),
        whatsapp: parsed.data.whatsapp || req.user.whatsapp,
      },
    });
  });

  router.delete("/mine", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um serviço cadastrado." });

    if (service.image_path) deleteImageFile(service.image_path);
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

  // Foto do serviço (opcional, 1 só) — separada das fotos de item.
  router.post("/mine/photo", handlePhotoUpload, async (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Cadastre seu serviço primeiro." });
    if (!req.file) return res.status(400).json({ message: "Envie uma foto." });

    const oldPath = service.image_path;
    const imagePath = await processAndSaveImage(req.file.buffer);
    setServiceImage.run({ id: service.id, image_path: imagePath, updated_at: nowIso() });
    if (oldPath) deleteImageFile(oldPath);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.photo_set",
      entityType: "service",
      entityId: service.id,
    });

    res.json({ imagePath });
  });

  router.delete("/mine/photo", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um serviço cadastrado." });

    if (service.image_path) {
      deleteImageFile(service.image_path);
      setServiceImage.run({ id: service.id, image_path: null, updated_at: nowIso() });
    }
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
      return res.status(400).json({ message: "Preencha nome do item." });
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
        price_cents: parsed.data.isNegotiable ? 0 : Math.round(parsed.data.price * 100),
        is_negotiable: parsed.data.isNegotiable ? 1 : 0,
        max_quantity: parsed.data.maxQuantity ?? null,
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
      return res.status(400).json({ message: "Preencha nome do item." });
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
      price_cents: parsed.data.isNegotiable ? 0 : Math.round(parsed.data.price * 100),
      is_negotiable: parsed.data.isNegotiable ? 1 : 0,
      max_quantity: parsed.data.maxQuantity ?? null,
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

  // --- Grupos de opção (configurador de item) ---

  router.post("/mine/items/:itemId/groups", (req, res) => {
    const item = getOwnedItem(req.user.id, req.params.itemId);
    if (!item) return res.status(404).json({ message: "Item não encontrado." });

    const parsed = groupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Preencha nome e tipo de seleção do grupo." });
    if (parsed.data.selectionType === "multi" && !parsed.data.maxSelections) {
      return res.status(400).json({ message: "Informe quantas opções o cliente pode escolher no máximo." });
    }

    const id = randomUUID();
    insertGroup.run({
      id,
      item_id: item.id,
      name: parsed.data.name,
      selection_type: parsed.data.selectionType,
      max_selections: parsed.data.selectionType === "multi" ? parsed.data.maxSelections : null,
      required: parsed.data.required ? 1 : 0,
      position: countGroupsByItem.get(item.id).c,
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_group_create",
      entityType: "service_item_option_group",
      entityId: id,
      details: { itemId: item.id, name: parsed.data.name },
    });

    res.status(201).json({ item: serializeItem(getItemById.get(item.id)) });
  });

  router.patch("/mine/items/:itemId/groups/:groupId", (req, res) => {
    const group = getOwnedGroup(req.user.id, req.params.itemId, req.params.groupId);
    if (!group) return res.status(404).json({ message: "Grupo não encontrado." });

    const parsed = groupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Preencha nome e tipo de seleção do grupo." });
    if (parsed.data.selectionType === "multi" && !parsed.data.maxSelections) {
      return res.status(400).json({ message: "Informe quantas opções o cliente pode escolher no máximo." });
    }

    updateGroup.run({
      id: group.id,
      name: parsed.data.name,
      selection_type: parsed.data.selectionType,
      max_selections: parsed.data.selectionType === "multi" ? parsed.data.maxSelections : null,
      required: parsed.data.required ? 1 : 0,
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_group_edit",
      entityType: "service_item_option_group",
      entityId: group.id,
    });

    res.json({ item: serializeItem(getItemById.get(group.item_id)) });
  });

  router.delete("/mine/items/:itemId/groups/:groupId", (req, res) => {
    const group = getOwnedGroup(req.user.id, req.params.itemId, req.params.groupId);
    if (!group) return res.status(404).json({ message: "Grupo não encontrado." });

    deleteGroupById.run(group.id);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_group_delete",
      entityType: "service_item_option_group",
      entityId: group.id,
      details: { name: group.name },
    });

    res.json({ item: serializeItem(getItemById.get(group.item_id)) });
  });

  // --- Opções dentro de um grupo ---

  router.post("/mine/items/:itemId/groups/:groupId/options", (req, res) => {
    const item = getOwnedItem(req.user.id, req.params.itemId);
    const group = getOwnedGroup(req.user.id, req.params.itemId, req.params.groupId);
    if (!item || !group) return res.status(404).json({ message: "Grupo não encontrado." });

    const parsed = optionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Preencha o nome da opção." });

    // Item "a combinar" não tem preço-base pra somar/subtrair em cima — a opção existe (ex.
    // escolher um sabor), só nunca pode alterar valor.
    const priceDeltaCents = item.is_negotiable ? 0 : parsed.data.priceDeltaCents;

    const id = randomUUID();
    insertOption.run({
      id,
      group_id: group.id,
      name: parsed.data.name,
      price_delta_cents: priceDeltaCents,
      position: countOptionsByGroup.get(group.id).c,
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_option_create",
      entityType: "service_item_option",
      entityId: id,
      details: { groupId: group.id, name: parsed.data.name },
    });

    res.status(201).json({ item: serializeItem(getItemById.get(item.id)) });
  });

  router.patch("/mine/items/:itemId/groups/:groupId/options/:optionId", (req, res) => {
    const item = getOwnedItem(req.user.id, req.params.itemId);
    const group = getOwnedGroup(req.user.id, req.params.itemId, req.params.groupId);
    if (!item || !group) return res.status(404).json({ message: "Grupo não encontrado." });

    const option = getOptionById.get(req.params.optionId);
    if (!option || option.group_id !== group.id) return res.status(404).json({ message: "Opção não encontrada." });

    const parsed = optionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Preencha o nome da opção." });

    const priceDeltaCents = item.is_negotiable ? 0 : parsed.data.priceDeltaCents;

    updateOption.run({ id: option.id, name: parsed.data.name, price_delta_cents: priceDeltaCents });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_option_edit",
      entityType: "service_item_option",
      entityId: option.id,
    });

    res.json({ item: serializeItem(getItemById.get(item.id)) });
  });

  router.delete("/mine/items/:itemId/groups/:groupId/options/:optionId", (req, res) => {
    const item = getOwnedItem(req.user.id, req.params.itemId);
    const group = getOwnedGroup(req.user.id, req.params.itemId, req.params.groupId);
    if (!item || !group) return res.status(404).json({ message: "Grupo não encontrado." });

    const option = getOptionById.get(req.params.optionId);
    if (!option || option.group_id !== group.id) return res.status(404).json({ message: "Opção não encontrada." });

    deleteOptionById.run(option.id);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_option_delete",
      entityType: "service_item_option",
      entityId: option.id,
      details: { name: option.name },
    });

    res.json({ item: serializeItem(getItemById.get(item.id)) });
  });

  return router;
}
