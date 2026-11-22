import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAuth, requireApproved } from "../../auth/guards.js";
import { userIsAdmin } from "../../auth/roles.js";
import { recordAudit } from "../audit/service.js";
import { deleteFromR2 } from "../../lib/r2.js";
import { processAndSaveImage as processAndSaveImageShared } from "../../lib/media.js";
import { ingestService, removeDocument, scheduleIngest } from "../rag/ingest.js";
import { FULFILLMENT_MODES, parseFulfillmentModes, serializeFulfillmentModes } from "./fulfillment.js";
import {
  allocateUniqueSlug,
  ensureServiceSlugs,
  isValidSlug,
  normalizeSlugInput,
  slugValidationMessage,
  suggestSlugFromName,
} from "./slug.js";

ensureServiceSlugs();

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

const fulfillmentModesSchema = z
  .preprocess((val) => {
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return val.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    return val;
  }, z.array(z.enum(FULFILLMENT_MODES)).min(1).max(4))
  .optional();

const slugField = z
  .string()
  .trim()
  .min(3)
  .max(48)
  .optional()
  .nullable();

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  instagram: z.string().trim().max(60).optional().nullable(),
  fulfillmentModes: fulfillmentModesSchema,
  slug: slugField,
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

const tagsAssignSchema = z.object({ tagIds: z.array(z.string()).max(20) });

// Configurador do item inteiro (grupos + opções) de uma vez só — substitui tudo que o item
// tinha antes. Existe pra permitir editar tudo localmente no front (sem uma chamada de rede
// por grupo/opção) e mandar de uma vez só no fim, em vez do fluxo antigo de "salva, espera
// salvar, prossegue" pra cada grupo/opção.
const optionInGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceDeltaCents: z.coerce.number().int().min(-1_000_000).max(1_000_000).optional().default(0),
});
const groupBulkSchema = z.object({
  name: z.string().trim().min(1).max(80),
  selectionType: z.enum(["single", "multi"]),
  maxSelections: z.coerce.number().int().min(1).max(20).optional().nullable(),
  required: z.boolean().optional().default(false),
  options: z.array(optionInGroupSchema).max(50).optional().default([]),
});
const groupsBulkSchema = z.object({ groups: z.array(groupBulkSchema).max(20) });

const setWhatsappVisible = sqlite.prepare(
  "UPDATE users SET whatsapp = ?, whatsapp_visible = 1 WHERE id = ?",
);

const getUserForOwnership = sqlite.prepare("SELECT id, name FROM users WHERE id = ?");
const getServiceByUser = sqlite.prepare("SELECT * FROM condo_services WHERE user_id = ?");
const getServiceById = sqlite.prepare("SELECT * FROM condo_services WHERE id = ?");

const SERVICE_JOIN_SELECT = `
  SELECT s.id, s.name, s.description, s.instagram, s.image_path AS imagePath,
         s.fulfillment_modes AS fulfillmentModesRaw, s.slug,
         s.created_at AS createdAt,
         u.id AS ownerId, u.name AS ownerName, u.whatsapp AS ownerWhatsapp,
         u.whatsapp_visible AS ownerWhatsappVisible,
         a.tower, a.code AS apartmentCode
  FROM condo_services s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN apartments a ON a.id = u.apartment_id
`;

const getServiceIdBySlug = sqlite.prepare(
  "SELECT id, slug FROM condo_services WHERE slug = ? COLLATE NOCASE",
);

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
  INSERT INTO condo_services (id, user_id, name, description, instagram, fulfillment_modes, slug)
  VALUES (@id, @user_id, @name, @description, @instagram, @fulfillment_modes, @slug)
`);

const updateService = sqlite.prepare(`
  UPDATE condo_services
  SET name = @name, description = @description, instagram = @instagram,
      fulfillment_modes = @fulfillment_modes, slug = @slug, updated_at = @updated_at
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
const insertGroup = sqlite.prepare(`
  INSERT INTO condo_service_item_option_groups (id, item_id, name, selection_type, max_selections, required, position)
  VALUES (@id, @item_id, @name, @selection_type, @max_selections, @required, @position)
`);
const deleteGroupsByItem = sqlite.prepare("DELETE FROM condo_service_item_option_groups WHERE item_id = ?");

const listOptionsByGroup = sqlite.prepare(`
  SELECT id, name, price_delta_cents AS priceDeltaCents
  FROM condo_service_item_options WHERE group_id = ? ORDER BY position ASC, created_at ASC
`);
const insertOption = sqlite.prepare(`
  INSERT INTO condo_service_item_options (id, group_id, name, price_delta_cents, position)
  VALUES (@id, @group_id, @name, @price_delta_cents, @position)
`);

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
function publicOwnerWhatsapp(row) {
  // Pedidos / "Pedir no WhatsApp" só com número preenchido e visível — mesmo padrão do perfil.
  return row.ownerWhatsapp && row.ownerWhatsappVisible ? row.ownerWhatsapp : null;
}

function serializeServiceSummary(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instagram: row.instagram,
    imagePath: row.imagePath,
    fulfillmentModes: parseFulfillmentModes(row.fulfillmentModesRaw),
    slug: row.slug,
    createdAt: row.createdAt,
    owner: {
      id: row.ownerId,
      name: row.ownerName,
      whatsapp: publicOwnerWhatsapp(row),
      tower: row.tower,
      apartmentCode: row.apartmentCode,
    },
    tags: listTagsByService.all(row.id),
  };
}

const FOOD_TAG_NAME = "Comida";

function hasFoodTag(service) {
  return service.tags.some((t) => t.name.localeCompare(FOOD_TAG_NAME, "pt", { sensitivity: "accent" }) === 0);
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

export function servicesRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (req, res) => {
    const tagFilter = typeof req.query.tags === "string" ? req.query.tags.split(",").filter(Boolean) : [];
    const modeFilter =
      typeof req.query.modes === "string" ? req.query.modes.split(",").filter((m) => FULFILLMENT_MODES.includes(m)) : [];
    const segment = typeof req.query.segment === "string" ? req.query.segment : "all";
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

    let services = listServicesBase.all().map(serializeServiceSummary);
    if (tagFilter.length > 0) {
      services = services.filter((s) => s.tags.some((t) => tagFilter.includes(t.id)));
    }
    if (modeFilter.length > 0) {
      services = services.filter((s) => modeFilter.some((m) => s.fulfillmentModes.includes(m)));
    }
    if (segment === "food") {
      services = services.filter(hasFoodTag);
    } else if (segment === "services") {
      services = services.filter((s) => !hasFoodTag(s));
    }
    if (q) {
      services = services.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q)) ||
          s.owner.name.toLowerCase().includes(q),
      );
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

  router.get("/by-slug/:slug", (req, res) => {
    const slug = normalizeSlugInput(req.params.slug);
    if (!isValidSlug(slug)) {
      return res.status(400).json({ message: "Link curto inválido." });
    }
    const row = getServiceIdBySlug.get(slug);
    if (!row) return res.status(404).json({ message: "Negócio não encontrado." });
    res.json({ serviceId: row.id, slug: row.slug });
  });

  // Link dedicado do negócio — mostra os itens (com fotos, preço/"a negociar" e as opções de
  // configuração de cada um). Antes disso, a listagem pública não mostra nenhum item.
  router.get("/:id", (req, res) => {
    const service = getServiceWithOwnerById.get(req.params.id);
    if (!service) return res.status(404).json({ message: "Negócio não encontrado." });
    res.json({ service: serializeServiceDetail(service) });
  });

  // WhatsApp obrigatório (atendimento/carrinho); Instagram opcional.
  // Foto também é opcional aqui — antes só dava pra anexar depois de já ter criado o serviço
  // (a tela de edição só aparece depois do cadastro), o que fazia parecer que a opção nem
  // existia. `handlePhotoUpload` faz o multipart virar `req.body` (strings) + `req.file`.
  //
  // `userId` no corpo é opcional e só um admin pode usá-lo — deixa o admin cadastrar o serviço
  // em nome de um morador que não tem prática/tempo de fazer sozinho. Depois de criado, o dono
  // (o morador, não o admin) já enxerga e edita normalmente em "Meu serviço" — a rota não muda,
  // é só `condo_services.user_id` apontando pra outra pessoa.
  router.post("/", handlePhotoUpload, async (req, res) => {
    let ownerId = req.user.id;
    if (req.body.userId && req.body.userId !== req.user.id) {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Só o administrador pode cadastrar serviço para outro morador." });
      }
      const targetUser = getUserForOwnership.get(req.body.userId);
      if (!targetUser) return res.status(404).json({ message: "Morador não encontrado." });
      ownerId = targetUser.id;
    }

    if (getServiceByUser.get(ownerId)) {
      return res.status(409).json({
        message: ownerId === req.user.id ? "Você já tem um negócio cadastrado." : "Esse morador já tem um negócio cadastrado.",
      });
    }

    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha ao menos o nome do negócio." });
    }

    const requestedSlug = normalizeSlugInput(parsed.data.slug || "") || suggestSlugFromName(parsed.data.name);
    const slugError = slugValidationMessage(requestedSlug);
    if (slugError) return res.status(400).json({ message: slugError });
    const slug = allocateUniqueSlug(requestedSlug);
    if (!slug) return res.status(409).json({ message: "Esse link curto já está em uso. Escolha outro." });

    const whatsapp = (parsed.data.whatsapp || "").trim() || (ownerId === req.user.id ? req.user.whatsapp : null);
    if (!whatsapp) {
      return res.status(400).json({
        message: "Cadastre um WhatsApp pra oferecer atendimento e receber pedidos.",
      });
    }
    setWhatsappVisible.run(whatsapp, ownerId);

    // Insert antes da foto — se o upload (sharp/R2) falhar, faz rollback do serviço pra não
    // deixar órfão com UNIQUE(user_id) e o morador preso em 409 "já tem negócio" sem resposta
    // útil. Sem try/catch, rejeição async no Express 4 derruba o processo (visto em create com
    // foto no fluxo de "Meu negócio"; o cadastro admin não manda foto).
    const id = randomUUID();
    const fulfillmentModes = serializeFulfillmentModes(
      parsed.data.fulfillmentModes ?? ["door", "pickup", "lobby"],
    );
    try {
      insertService.run({
        id,
        user_id: ownerId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        instagram: normalizeInstagram(parsed.data.instagram),
        fulfillment_modes: fulfillmentModes,
        slug,
      });

      if (req.file) {
        const imagePath = await processAndSaveImage(req.file.buffer);
        setServiceImage.run({ id, image_path: imagePath, updated_at: nowIso() });
      }
    } catch (err) {
      console.error("[services.create] falha ao processar foto:", err?.message || err);
      if (getServiceById.get(id)) deleteServiceById.run(id);
      return res.status(400).json({
        message: req.file
          ? "Não foi possível processar a foto enviada. Tente outra imagem ou cadastre sem foto."
          : "Não foi possível cadastrar o negócio. Tente de novo.",
      });
    }

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.create",
      entityType: "service",
      entityId: id,
      details: { name: parsed.data.name, ...(ownerId !== req.user.id ? { forUserId: ownerId } : {}) },
    });

    scheduleIngest(`service/${id}`, () => ingestService(id));
    res.status(201).json({ service: { ...serializeServiceDetail(getServiceWithOwnerById.get(id)) } });
  });

  router.patch("/mine", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Cadastre seu negócio primeiro." });

    const parsed = serviceSchema
      .pick({
        name: true,
        description: true,
        whatsapp: true,
        instagram: true,
        fulfillmentModes: true,
        slug: true,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Preencha o nome do negócio." });
    }

    const requestedSlug =
      normalizeSlugInput(parsed.data.slug || "") ||
      service.slug ||
      suggestSlugFromName(parsed.data.name);
    const slugError = slugValidationMessage(requestedSlug);
    if (slugError) return res.status(400).json({ message: slugError });
    const taken = getServiceIdBySlug.get(requestedSlug);
    if (taken && taken.id !== service.id) {
      return res.status(409).json({ message: "Esse link curto já está em uso. Escolha outro." });
    }

    const whatsapp = (parsed.data.whatsapp || "").trim() || req.user.whatsapp;
    if (!whatsapp) {
      return res.status(400).json({
        message: "Cadastre um WhatsApp pra oferecer atendimento e receber pedidos.",
      });
    }
    setWhatsappVisible.run(whatsapp, req.user.id);

    updateService.run({
      id: service.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      instagram: normalizeInstagram(parsed.data.instagram),
      fulfillment_modes: serializeFulfillmentModes(
        parsed.data.fulfillmentModes ?? parseFulfillmentModes(service.fulfillment_modes),
      ),
      slug: requestedSlug,
      updated_at: nowIso(),
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.edit",
      entityType: "service",
      entityId: service.id,
    });

    scheduleIngest(`service/${service.id}`, () => ingestService(service.id));
    res.json({
      service: {
        ...serializeServiceDetail(getServiceWithOwnerById.get(service.id)),
        whatsapp,
      },
    });
  });

  router.delete("/mine", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um negócio cadastrado." });

    if (service.image_path) deleteImageFile(service.image_path);
    for (const item of listItemsByService.all(service.id)) {
      for (const image of listImagesByItem.all(item.id)) {
        deleteImageFile(image.path);
      }
    }
    deleteServiceById.run(service.id);
    removeDocument("service", service.id);

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
    if (!service) return res.status(404).json({ message: "Cadastre seu negócio primeiro." });
    if (!req.file) return res.status(400).json({ message: "Envie uma foto." });

    const oldPath = service.image_path;
    let imagePath;
    try {
      imagePath = await processAndSaveImage(req.file.buffer);
    } catch (err) {
      console.error("[services.photo_set] falha ao processar foto:", err?.message || err);
      return res.status(400).json({ message: "Não foi possível processar a foto enviada." });
    }
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
    if (!service) return res.status(404).json({ message: "Você não tem um negócio cadastrado." });

    if (service.image_path) {
      deleteImageFile(service.image_path);
      setServiceImage.run({ id: service.id, image_path: null, updated_at: nowIso() });
    }
    res.status(204).end();
  });

  function applyServiceTags(service, tagIds, actor) {
    for (const tagId of tagIds) {
      if (!getTagById.get(tagId)) return { error: "Tag inexistente." };
    }

    const applyTags = sqlite.transaction((ids) => {
      deleteServiceTags.run(service.id);
      for (const tagId of ids) insertServiceTag.run(service.id, tagId);
    });
    applyTags(tagIds);

    recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "services.tags_set",
      entityType: "service",
      entityId: service.id,
      details: { tagIds },
    });

    scheduleIngest(`service/${service.id}`, () => ingestService(service.id));
    return { tags: listTagsByService.all(service.id) };
  }

  // Dono do negócio ou admin: atribui tags existentes (vocabulário continua só no admin).
  router.put("/mine/tags", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Cadastre seu negócio primeiro." });

    const parsed = tagsAssignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Lista de tags inválida." });

    const result = applyServiceTags(service, parsed.data.tagIds, req.user);
    if (result.error) return res.status(400).json({ message: result.error });
    res.json({ tags: result.tags });
  });

  router.put("/:id/tags", (req, res) => {
    const service = getServiceById.get(req.params.id);
    if (!service) return res.status(404).json({ message: "Negócio não encontrado." });

    const isOwner = service.user_id === req.user.id;
    if (!isOwner && !userIsAdmin(req.user)) {
      return res.status(403).json({ message: "Só o dono ou o administrador pode alterar as tags." });
    }

    const parsed = tagsAssignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Lista de tags inválida." });

    const result = applyServiceTags(service, parsed.data.tagIds, req.user);
    if (result.error) return res.status(400).json({ message: result.error });
    res.json({ tags: result.tags });
  });

  router.post("/mine/items", handleImagesUpload, async (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Cadastre seu negócio antes de adicionar itens." });

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

    scheduleIngest(`service/${service.id}`, () => ingestService(service.id));
    res.status(201).json({ itemId: id, items: listItemsByService.all(service.id).map(serializeItem) });
  });

  router.patch("/mine/items/:itemId", handleImagesUpload, async (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um negócio cadastrado." });

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

    scheduleIngest(`service/${service.id}`, () => ingestService(service.id));
    res.json({ items: listItemsByService.all(service.id).map(serializeItem) });
  });

  router.delete("/mine/items/:itemId", (req, res) => {
    const service = getServiceByUser.get(req.user.id);
    if (!service) return res.status(404).json({ message: "Você não tem um negócio cadastrado." });

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

    scheduleIngest(`service/${service.id}`, () => ingestService(service.id));
    res.status(204).end();
  });

  // --- Grupos de opção (configurador de item) ---

  // Substitui TODOS os grupos/opções do item de uma vez (apaga tudo e recria) — pensado pra
  // um front que edita o configurador inteiro localmente (sem chamada de rede por grupo/opção)
  // e só sincroniza no fim. Seguro porque nada mais referencia group_id/option_id de forma
  // persistente (o carrinho do checkout é montado no front na hora, não fica salvo).
  router.put("/mine/items/:itemId/option-groups", (req, res) => {
    const item = getOwnedItem(req.user.id, req.params.itemId);
    if (!item) return res.status(404).json({ message: "Item não encontrado." });

    const parsed = groupsBulkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Configuração de opções inválida." });
    }

    for (const group of parsed.data.groups) {
      if (group.selectionType === "multi" && !group.maxSelections) {
        return res.status(400).json({ message: `Informe o máximo de opções pro grupo "${group.name}".` });
      }
    }

    const replaceAll = sqlite.transaction((groups) => {
      deleteGroupsByItem.run(item.id);
      groups.forEach((group, groupPosition) => {
        const groupId = randomUUID();
        insertGroup.run({
          id: groupId,
          item_id: item.id,
          name: group.name,
          selection_type: group.selectionType,
          max_selections: group.selectionType === "multi" ? group.maxSelections : null,
          required: group.required ? 1 : 0,
          position: groupPosition,
        });
        group.options.forEach((option, optionPosition) => {
          insertOption.run({
            id: randomUUID(),
            group_id: groupId,
            name: option.name,
            // Item "a combinar" não tem preço-base pra somar/subtrair em cima.
            price_delta_cents: item.is_negotiable ? 0 : option.priceDeltaCents,
            position: optionPosition,
          });
        });
      });
    });
    replaceAll(parsed.data.groups);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "services.item_option_groups_replace",
      entityType: "service_item",
      entityId: item.id,
      details: { groupCount: parsed.data.groups.length },
    });

    res.json({ item: serializeItem(getItemById.get(item.id)) });
  });

  return router;
}
