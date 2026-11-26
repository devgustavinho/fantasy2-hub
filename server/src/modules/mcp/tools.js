import { z } from "zod";
import { isAdmin, isConselheiro, isStaff, permissionTier } from "./roles.js";
import { errorResult, textResult } from "./client.js";

function tool(server, name, description, schema, handler) {
  server.registerTool(
    name,
    { description, inputSchema: schema },
    async (args) => {
      try {
        return textResult(await handler(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

function qs(params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

/** Remove senha de Wi‑Fi do bundle de horários (use get_area_wifi). */
function stripWifiPasswords(bundle) {
  if (!bundle || typeof bundle !== "object") return bundle;
  const areas = Array.isArray(bundle.areas)
    ? bundle.areas.map((a) => {
        if (!a || typeof a !== "object") return a;
        const { wifiPassword, ...rest } = a;
        return rest;
      })
    : bundle.areas;
  return { ...bundle, areas };
}

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const fulfillmentMode = z.enum(["door", "pickup", "lobby", "online"]);

/**
 * Registers MCP tools based on the authenticated user's role.
 * Returns the list of tool names that were registered.
 */
export function registerToolsForUser(server, api, user) {
  const registered = [];
  const add = (...names) => registered.push(...names);

  // —— Always (authenticated + approved) ————————————————
  tool(server, "whoami", "Retorna o usuário autenticado e o nível de permissão do MCP.", {}, async () => ({
    user,
    permissionTier: permissionTier(user),
    note:
      (user.roles ?? [user.role]).includes("conselheiro") && !isStaff(user)
        ? "conselheiro: pareceres contábeis; sem poderes de síndico/admin no MCP."
        : undefined,
  }));
  add("whoami");

  tool(server, "list_my_capabilities", "Lista as tools MCP disponíveis para os seus cargos.", {}, async () => ({
    role: user.role,
    roles: user.roles ?? [user.role],
    permissionTier: permissionTier(user),
    tools: registered.slice(),
  }));
  add("list_my_capabilities");

  tool(
    server,
    "get_home_stats",
    "Estatísticas da home (pautas ativas e visitas distintas ao hub nas últimas 24h).",
    {},
    async () => api.get("/stats/home"),
  );
  add("get_home_stats");

  tool(
    server,
    "list_topics",
    "Lista pautas. status: open | scheduled | closed | history (scheduled+closed). sort: vote_balance | oldest | newest | most_comments | least_comments.",
    {
      status: z
        .enum(["open", "scheduled", "closed", "history"])
        .optional()
        .describe("Filtro de status"),
      sort: z
        .enum(["vote_balance", "oldest", "newest", "most_comments", "least_comments"])
        .optional()
        .describe("Ordenação"),
    },
    async ({ status, sort }) => api.get(`/topics${qs({ status, sort })}`),
  );
  add("list_topics");

  tool(
    server,
    "get_topic",
    "Detalhe de uma pauta com comentários e eventos.",
    { id: z.string().min(1).describe("ID da pauta") },
    async ({ id }) => api.get(`/topics/${id}`),
  );
  add("get_topic");

  tool(
    server,
    "get_topic_by_code",
    "Busca pauta pelo código curto de compartilhamento.",
    { code: z.string().min(1) },
    async ({ code }) => api.get(`/topics/by-code/${encodeURIComponent(code)}`),
  );
  add("get_topic_by_code");

  tool(
    server,
    "create_topic",
    "Cria uma nova pauta em aberto.",
    {
      title: z.string().min(4).max(160),
      description: z.string().min(4).max(4000),
    },
    async (body) => api.post("/topics", body),
  );
  add("create_topic");

  tool(
    server,
    "update_topic_content",
    "Edita título/descrição da pauta (autor ou staff).",
    {
      id: z.string().min(1),
      title: z.string().min(4).max(160),
      description: z.string().min(4).max(4000),
    },
    async ({ id, title, description }) => api.patch(`/topics/${id}/content`, { title, description }),
  );
  add("update_topic_content");

  tool(
    server,
    "delete_topic",
    "Exclui pauta (autor; admin precisa de reason ≥ 10 caracteres).",
    {
      id: z.string().min(1),
      reason: z.string().min(10).optional().describe("Obrigatório se admin excluir pauta de outro"),
    },
    async ({ id, reason }) => {
      await api.delete(`/topics/${id}`, reason ? { reason } : undefined);
      return { ok: true };
    },
  );
  add("delete_topic");

  tool(
    server,
    "vote_topic",
    "Vota a favor ou contra numa pauta (1 voto por apartamento).",
    {
      id: z.string().min(1),
      value: z.enum(["favor", "contra"]),
    },
    async ({ id, value }) => api.post(`/topics/${id}/vote`, { value }),
  );
  add("vote_topic");

  tool(
    server,
    "comment_topic",
    "Comenta numa pauta.",
    {
      id: z.string().min(1),
      body: z.string().min(1).max(2000),
    },
    async ({ id, body }) => api.post(`/topics/${id}/comments`, { body }),
  );
  add("comment_topic");

  tool(
    server,
    "edit_topic_comment",
    "Edita um comentário próprio numa pauta.",
    {
      id: z.string().min(1),
      commentId: z.string().min(1),
      body: z.string().min(1).max(2000),
    },
    async ({ id, commentId, body }) => api.patch(`/topics/${id}/comments/${commentId}`, { body }),
  );
  add("edit_topic_comment");

  tool(server, "list_services", "Lista serviços anunciados no condomínio.", {}, async () =>
    api.get("/services"),
  );
  add("list_services");

  tool(
    server,
    "get_service",
    "Detalhe de um serviço.",
    { id: z.string().min(1) },
    async ({ id }) => api.get(`/services/${id}`),
  );
  add("get_service");

  tool(
    server,
    "get_service_by_slug",
    "Resolve o ID de um negócio pelo link curto (slug).",
    { slug: z.string().min(1) },
    async ({ slug }) => api.get(`/services/by-slug/${encodeURIComponent(slug)}`),
  );
  add("get_service_by_slug");

  tool(server, "get_my_service", "Retorna o negócio do usuário autenticado (ou null).", {}, async () =>
    api.get("/services/mine"),
  );
  add("get_my_service");

  tool(
    server,
    "create_service",
    "Cadastra o negócio do morador (JSON; foto só pelo Hub).",
    {
      name: z.string().min(2).max(120),
      description: z.string().max(1000).nullable().optional(),
      whatsapp: z.string().max(30).nullable().optional(),
      instagram: z.string().max(60).nullable().optional(),
      fulfillmentModes: z.array(fulfillmentMode).optional(),
      slug: z.string().max(80).optional(),
      userId: z.string().optional().describe("Só admin: cadastrar em nome de outro morador"),
    },
    async (body) => api.post("/services", body),
  );
  add("create_service");

  tool(
    server,
    "update_my_service",
    "Atualiza o próprio negócio.",
    {
      name: z.string().min(2).max(120),
      description: z.string().max(1000).nullable().optional(),
      whatsapp: z.string().max(30).nullable().optional(),
      instagram: z.string().max(60).nullable().optional(),
      fulfillmentModes: z.array(fulfillmentMode).optional(),
      slug: z.string().max(80).optional(),
    },
    async (body) => api.patch("/services/mine", body),
  );
  add("update_my_service");

  tool(server, "delete_my_service", "Remove o próprio negócio.", {}, async () => {
    await api.delete("/services/mine");
    return { ok: true };
  });
  add("delete_my_service");

  tool(
    server,
    "set_my_service_tags",
    "Define as tags do próprio negócio (IDs do vocabulário curado).",
    { tagIds: z.array(z.string()).max(20) },
    async (body) => api.put("/services/mine/tags", body),
  );
  add("set_my_service_tags");

  tool(
    server,
    "add_my_service_item",
    "Adiciona item ao próprio negócio (sem fotos — use o Hub para imagens).",
    {
      name: z.string().min(1).max(120),
      description: z.string().max(1000).nullable().optional(),
      price: z.number().min(0).max(1_000_000).optional(),
      isNegotiable: z.boolean().optional(),
      maxQuantity: z.number().int().min(1).max(99).nullable().optional(),
    },
    async (body) => api.post("/services/mine/items", body),
  );
  add("add_my_service_item");

  tool(
    server,
    "update_my_service_item",
    "Atualiza item do próprio negócio.",
    {
      itemId: z.string().min(1),
      name: z.string().min(1).max(120),
      description: z.string().max(1000).nullable().optional(),
      price: z.number().min(0).max(1_000_000).optional(),
      isNegotiable: z.boolean().optional(),
      maxQuantity: z.number().int().min(1).max(99).nullable().optional(),
      removeImageIds: z.array(z.string()).optional(),
    },
    async ({ itemId, ...body }) => api.patch(`/services/mine/items/${itemId}`, body),
  );
  add("update_my_service_item");

  tool(
    server,
    "delete_my_service_item",
    "Remove item do próprio negócio.",
    { itemId: z.string().min(1) },
    async ({ itemId }) => {
      await api.delete(`/services/mine/items/${itemId}`);
      return { ok: true };
    },
  );
  add("delete_my_service_item");

  tool(
    server,
    "set_my_service_item_option_groups",
    "Substitui os grupos de opção de um item do próprio negócio.",
    {
      itemId: z.string().min(1),
      groups: z
        .array(
          z.object({
            name: z.string().min(1).max(80),
            selectionType: z.enum(["single", "multi"]),
            maxSelections: z.number().int().min(1).max(20).nullable().optional(),
            required: z.boolean().optional(),
            options: z
              .array(
                z.object({
                  name: z.string().min(1).max(80),
                  priceDeltaCents: z.number().int().optional(),
                }),
              )
              .optional(),
          }),
        )
        .max(20),
    },
    async ({ itemId, groups }) => api.put(`/services/mine/items/${itemId}/option-groups`, { groups }),
  );
  add("set_my_service_item_option_groups");

  tool(server, "list_recommendations", "Lista recomendações de moradores.", {}, async () =>
    api.get("/recommendations"),
  );
  add("list_recommendations");

  tool(
    server,
    "get_recommendation",
    "Detalhe de uma recomendação.",
    { id: z.string().min(1) },
    async ({ id }) => api.get(`/recommendations/${id}`),
  );
  add("get_recommendation");

  tool(
    server,
    "create_recommendation",
    "Cadastra uma recomendação (WhatsApp ou Instagram obrigatório).",
    {
      name: z.string().min(2).max(120),
      description: z.string().max(1000).nullable().optional(),
      whatsapp: z.string().max(30).nullable().optional(),
      instagram: z.string().max(60).nullable().optional(),
      tagIds: z.array(z.string()).max(20).optional(),
    },
    async (body) => api.post("/recommendations", body),
  );
  add("create_recommendation");

  tool(
    server,
    "update_recommendation",
    "Edita recomendação própria.",
    {
      id: z.string().min(1),
      name: z.string().min(2).max(120),
      description: z.string().max(1000).nullable().optional(),
      whatsapp: z.string().max(30).nullable().optional(),
      instagram: z.string().max(60).nullable().optional(),
      tagIds: z.array(z.string()).max(20).optional(),
    },
    async ({ id, ...body }) => api.patch(`/recommendations/${id}`, body),
  );
  add("update_recommendation");

  tool(
    server,
    "delete_recommendation",
    "Exclui recomendação (autor ou staff).",
    { id: z.string().min(1) },
    async ({ id }) => {
      await api.delete(`/recommendations/${id}`);
      return { ok: true };
    },
  );
  add("delete_recommendation");

  tool(
    server,
    "rate_recommendation",
    "Avalia uma recomendação (1 a 5 estrelas).",
    {
      id: z.string().min(1),
      stars: z.number().int().min(1).max(5),
    },
    async ({ id, stars }) => api.put(`/recommendations/${id}/rating`, { stars }),
  );
  add("rate_recommendation");

  tool(
    server,
    "comment_recommendation",
    "Comenta numa recomendação (texto; mídia só pelo Hub).",
    {
      id: z.string().min(1),
      body: z.string().min(1).max(2000),
    },
    async ({ id, body }) => api.post(`/recommendations/${id}/comments`, { body }),
  );
  add("comment_recommendation");

  tool(
    server,
    "delete_recommendation_comment",
    "Exclui comentário de recomendação (autor ou staff).",
    {
      id: z.string().min(1),
      commentId: z.string().min(1),
    },
    async ({ id, commentId }) => {
      await api.delete(`/recommendations/${id}/comments/${commentId}`);
      return { ok: true };
    },
  );
  add("delete_recommendation_comment");

  tool(server, "list_faq", "Lista entradas do FAQ.", {}, async () => api.get("/faq"));
  add("list_faq");

  tool(
    server,
    "ask_condo",
    "Pergunta ao conhecimento do condomínio (FAQ, boas-vindas, horários/convivência/áreas/mudança, serviços, recomendações, pautas, embeds e Manual do Proprietário). Sem senhas de Wi‑Fi no índice. Limite: 5 perguntas / usuário / 24h.",
    {
      question: z.string().min(3).max(500).describe("Pergunta em português"),
    },
    async ({ question }) => api.post("/rag/ask", { question }),
  );
  add("ask_condo");

  tool(server, "get_rag_status", "Status do índice RAG (morador: available; staff: contagens).", {}, async () =>
    api.get("/rag/status"),
  );
  add("get_rag_status");

  tool(server, "list_tags", "Lista tags curadas (serviços/recomendações).", {}, async () =>
    api.get("/tags"),
  );
  add("list_tags");

  tool(server, "list_climate", "Lista pesquisas de clima organizacional.", {}, async () =>
    api.get("/climate"),
  );
  add("list_climate");

  tool(
    server,
    "get_climate",
    "Detalhe de uma pesquisa de clima.",
    { id: z.string().min(1) },
    async ({ id }) => api.get(`/climate/${id}`),
  );
  add("get_climate");

  tool(
    server,
    "respond_climate",
    "Responde a uma pesquisa de clima (1 resposta por apartamento).",
    {
      id: z.string().min(1),
      answers: z
        .array(
          z.object({
            questionId: z.string().uuid(),
            optionId: z.string().uuid(),
          }),
        )
        .min(1),
      comment: z.string().max(2000).optional(),
    },
    async ({ id, answers, comment }) =>
      api.post(`/climate/${id}/responses`, { answers, comment }),
  );
  add("respond_climate");

  tool(server, "list_improvements", "Lista sugestões do quadro de melhorias.", {}, async () =>
    api.get("/improvements"),
  );
  add("list_improvements");

  tool(
    server,
    "create_improvement",
    "Sugere uma melhoria no Portal.",
    {
      title: z.string().min(4).max(160),
      description: z.string().min(4).max(2000),
    },
    async (body) => api.post("/improvements", body),
  );
  add("create_improvement");

  tool(
    server,
    "delete_improvement",
    "Exclui melhoria (autor só se status=new; staff qualquer).",
    { id: z.string().min(1) },
    async ({ id }) => {
      await api.delete(`/improvements/${id}`);
      return { ok: true };
    },
  );
  add("delete_improvement");

  tool(server, "list_notifications", "Lista notificações do usuário.", {}, async () =>
    api.get("/notifications"),
  );
  add("list_notifications");

  tool(server, "mark_notifications_read", "Marca todas as notificações como lidas.", {}, async () =>
    api.post("/notifications/read-all"),
  );
  add("mark_notifications_read");

  tool(
    server,
    "mark_notification_read",
    "Marca uma notificação como lida.",
    { id: z.string().min(1) },
    async ({ id }) => {
      await api.post(`/notifications/${id}/read`);
      return { ok: true };
    },
  );
  add("mark_notification_read");

  tool(
    server,
    "update_my_profile",
    "Atualiza WhatsApp / visibilidade do perfil.",
    {
      whatsapp: z.string().nullable().optional(),
      whatsappVisible: z.boolean().optional(),
    },
    async (body) => api.patch("/auth/me", body),
  );
  add("update_my_profile");

  tool(server, "get_family_member", "Retorna o familiar do apartamento (titular) ou null.", {}, async () =>
    api.get("/auth/family-member"),
  );
  add("get_family_member");

  tool(
    server,
    "invite_family_member",
    "Convida o familiar do apartamento (só titular; 1 por apto).",
    {
      name: z.string().min(2).max(120),
      email: z.string().email(),
      password: z.string().min(8).max(200),
    },
    async (body) => api.post("/auth/family-member", body),
  );
  add("invite_family_member");

  tool(
    server,
    "set_active_role",
    "Troca o cargo/visão ativa entre os cargos que o usuário já possui.",
    {
      role: z.enum(["admin", "sindico", "conselheiro", "morador"]),
    },
    async (body) => api.post("/auth/active-role", body),
  );
  add("set_active_role");

  // —— Horários (resident+) ————————————————
  tool(
    server,
    "get_horarios",
    "Horários de áreas comuns, janelas de mudança e convivência/silêncio. Senhas de Wi‑Fi omitidas — use get_area_wifi.",
    {},
    async () => stripWifiPasswords(await api.get("/horarios")),
  );
  add("get_horarios");

  tool(
    server,
    "get_horarios_status",
    "Status agora: mudança permitida?, silêncio?, amanhã.",
    {},
    async () => api.get("/horarios/status"),
  );
  add("get_horarios_status");

  tool(
    server,
    "get_area_wifi",
    "Credenciais + QR do Wi‑Fi de uma área comum (só se a API permitir e a área tiver Wi‑Fi).",
    { id: z.string().min(1).describe("ID da área comum") },
    async ({ id }) => api.get(`/horarios/areas/${id}/wifi`),
  );
  add("get_area_wifi");

  // —— Docs / welcome / contabil (leitura) ————————————————
  tool(server, "list_docs", "Lista documentos do condomínio (ex.: Manual do Proprietário).", {}, async () =>
    api.get("/docs"),
  );
  add("list_docs");

  tool(server, "get_welcome", "Página de boas-vindas (texto do elevador).", {}, async () =>
    api.get("/welcome"),
  );
  add("get_welcome");

  tool(
    server,
    "get_group_links",
    "Links de convite WhatsApp: grupo geral + grupo da torre do morador.",
    {},
    async () => api.get("/group-links"),
  );
  add("get_group_links");

  tool(server, "list_balancetes", "Lista balancetes contábeis.", {}, async () => api.get("/contabil"));
  add("list_balancetes");

  tool(
    server,
    "get_balancete",
    "Detalhe de um balancete (pareceres conforme permissão).",
    { id: z.string().min(1) },
    async ({ id }) => api.get(`/contabil/${id}`),
  );
  add("get_balancete");

  // —— Conselheiro ————————————————
  if (isConselheiro(user)) {
    tool(
      server,
      "put_contabil_parecer",
      "Salva/finaliza parecer do conselheiro num balancete.",
      {
        id: z.string().min(1),
        decision: z.enum(["aprovado", "aprovado_ressalvas", "reprovado"]),
        observacoes: z
          .array(
            z.object({
              tipo: z.enum(["ressalva", "conferido", "pendencia"]),
              body: z.string().min(1).max(2000),
            }),
          )
          .max(20)
          .optional(),
        finalize: z.boolean().optional(),
      },
      async ({ id, decision, observacoes, finalize }) =>
        api.put(`/contabil/${id}/parecer`, {
          decision,
          observacoes: observacoes ?? [],
          finalize: Boolean(finalize),
        }),
    );
    add("put_contabil_parecer");
  }

  // —— Staff (admin + síndico) ————————————————
  if (isStaff(user)) {
    tool(
      server,
      "schedule_topic",
      "Marca pauta como pautada (assemblyDate ISO date ou null para reabrir).",
      {
        id: z.string().min(1),
        assemblyDate: z.string().nullable().describe("YYYY-MM-DD ou null"),
      },
      async ({ id, assemblyDate }) => api.patch(`/topics/${id}`, { assemblyDate }),
    );
    add("schedule_topic");

    tool(
      server,
      "close_topic",
      "Fecha uma pauta. kind: debated (debatida) | not_scheduled (não pautada). reason: motivo livre.",
      {
        id: z.string().min(1),
        kind: z.enum(["debated", "not_scheduled"]),
        reason: z.string().min(4).max(2000),
      },
      async ({ id, kind, reason }) => api.post(`/topics/${id}/close`, { kind, reason }),
    );
    add("close_topic");

    tool(
      server,
      "update_topic_status_note",
      "Atualiza a nota de status oficial da pauta.",
      {
        id: z.string().min(1),
        note: z.string().max(500).nullable(),
      },
      async ({ id, note }) => api.patch(`/topics/${id}/status-note`, { note }),
    );
    add("update_topic_status_note");

    tool(
      server,
      "move_improvement_status",
      "Move um card do quadro de melhorias entre status (new | reviewing | in_progress | done).",
      {
        id: z.string().min(1),
        status: z.enum(["new", "reviewing", "in_progress", "done"]),
      },
      async ({ id, status }) => api.patch(`/improvements/${id}/status`, { status }),
    );
    add("move_improvement_status");

    tool(
      server,
      "list_users",
      "Lista usuários (paginado). Staff: síndico vê lista; admin gerencia cargos.",
      {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        tower: z.number().int().min(1).max(5).optional(),
        apartment: z.string().optional(),
        approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
      },
      async (params) => api.get(`/users${qs(params)}`),
    );
    add("list_users");

    tool(
      server,
      "get_user",
      "Detalhe de um usuário (staff).",
      { id: z.string().min(1) },
      async ({ id }) => api.get(`/users/${id}`),
    );
    add("get_user");

    tool(
      server,
      "reset_user_password",
      "Envia e-mail de redefinição de senha (síndico só para morador/conselheiro).",
      { id: z.string().min(1) },
      async ({ id }) => {
        await api.patch(`/users/${id}/reset-password`);
        return { ok: true };
      },
    );
    add("reset_user_password");

    tool(
      server,
      "update_common_area",
      "Atualiza horários/notas/Wi‑Fi de uma área comum.",
      {
        id: z.string().min(1),
        is24h: z.boolean(),
        opensAt: z.string().nullable().optional(),
        closesAt: z.string().nullable().optional(),
        assemblyRef: z.string().max(200).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        wifiSsid: z.string().max(64).nullable().optional(),
        wifiPassword: z.string().max(128).nullable().optional(),
        wifiSecurity: z.enum(["WPA", "WEP", "nopass"]).optional(),
      },
      async ({ id, ...body }) => api.patch(`/horarios/areas/${id}`, body),
    );
    add("update_common_area");

    tool(
      server,
      "update_mudanca_windows",
      "Define janelas de mudança (dias 0=dom … 6=sáb + HH:MM).",
      {
        windows: z
          .array(
            z.object({
              days: z.array(z.number().int().min(0).max(6)).min(1),
              opensAt: hm,
              closesAt: hm,
            }),
          )
          .min(1),
        assemblyRef: z.string().max(200).nullable().optional(),
      },
      async (body) => api.put("/horarios/mudanca", body),
    );
    add("update_mudanca_windows");

    tool(
      server,
      "add_mudanca_blocked_day",
      "Bloqueia um dia para mudança (YYYY-MM-DD + motivo).",
      {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().min(2).max(200),
        source: z.enum(["national", "fortaleza", "custom"]).optional(),
      },
      async (body) => api.post("/horarios/mudanca/blocked", body),
    );
    add("add_mudanca_blocked_day");

    tool(
      server,
      "remove_mudanca_blocked_day",
      "Remove bloqueio de mudança.",
      { id: z.string().min(1) },
      async ({ id }) => {
        await api.delete(`/horarios/mudanca/blocked/${id}`);
        return { ok: true };
      },
    );
    add("remove_mudanca_blocked_day");

    tool(
      server,
      "update_convivencia",
      "Define horário de silêncio (noiseUntil HH:MM — barulho permitido até esse horário).",
      {
        noiseUntil: hm,
        assemblyRef: z.string().max(200).nullable().optional(),
      },
      async (body) => api.put("/horarios/convivencia", body),
    );
    add("update_convivencia");

    tool(
      server,
      "delete_balancete",
      "Remove um balancete (staff).",
      { id: z.string().min(1) },
      async ({ id }) => {
        await api.delete(`/contabil/${id}`);
        return { ok: true };
      },
    );
    add("delete_balancete");

    tool(
      server,
      "reindex_rag",
      "Reindexa o corpus RAG (staff). force=true ignora hash.",
      { force: z.boolean().optional() },
      async ({ force }) => api.post("/rag/reindex", { force: Boolean(force) }),
    );
    add("reindex_rag");
  }

  // —— Admin only ————————————————
  if (isAdmin(user)) {
    tool(
      server,
      "change_user_role",
      "Altera os cargos de um usuário (um ou mais: admin, sindico, conselheiro, morador). Admin e conselheiro implicam morador. Síndico pode ficar sem morador (profissional); só admin remove morador do síndico.",
      {
        id: z.string().min(1),
        roles: z.array(z.enum(["admin", "sindico", "conselheiro", "morador"])).min(1),
      },
      async ({ id, roles }) => api.patch(`/users/${id}/role`, { roles }),
    );
    add("change_user_role");

    tool(
      server,
      "approve_user",
      "Aprova um cadastro pendente.",
      { id: z.string().min(1) },
      async ({ id }) => api.patch(`/users/${id}/approve`),
    );
    add("approve_user");

    tool(
      server,
      "reject_user",
      "Recusa um cadastro pendente (motivo opcional).",
      {
        id: z.string().min(1),
        reason: z.string().max(500).optional(),
      },
      async ({ id, reason }) => api.patch(`/users/${id}/reject`, { reason }),
    );
    add("reject_user");

    tool(
      server,
      "change_user_email",
      "Altera o e-mail de um morador.",
      {
        id: z.string().min(1),
        email: z.string().email(),
      },
      async ({ id, email }) => api.patch(`/users/${id}/email`, { email }),
    );
    add("change_user_email");

    tool(
      server,
      "create_sindico",
      "Cria conta de síndico (opcionalmente vinculada a um apartamento).",
      {
        name: z.string().min(2).max(120),
        email: z.string().email(),
        password: z.string().min(8).max(200),
        apartmentId: z.string().nullable().optional(),
      },
      async (body) => api.post("/users", body),
    );
    add("create_sindico");

    tool(
      server,
      "list_audit_log",
      "Lista o log de auditoria administrativa.",
      {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        actorUserId: z.string().optional(),
      },
      async (params) => api.get(`/audit${qs(params)}`),
    );
    add("list_audit_log");

    tool(server, "list_audit_actors", "Lista atores distintos do log de auditoria.", {}, async () =>
      api.get("/audit/actors"),
    );
    add("list_audit_actors");

    tool(
      server,
      "get_admin_login_stats",
      "Contador de visitas distintas ao hub nas últimas 24h (inclui anônimos) + lista de contas ligadas (visão admin).",
      {},
      async () => api.get("/stats/admin/logins"),
    );
    add("get_admin_login_stats");

    tool(
      server,
      "list_apartment_map",
      "Mapa de apartamentos com ocupantes (admin).",
      { tower: z.number().int().min(1).max(5).optional() },
      async ({ tower }) => api.get(`/apartments/map${qs({ tower })}`),
    );
    add("list_apartment_map");

    tool(
      server,
      "create_faq",
      "Cria entrada no FAQ.",
      {
        question: z.string().min(2).max(200),
        body: z.string().min(1).max(20000).describe("Resposta em markdown/texto"),
      },
      async (payload) => api.post("/faq", payload),
    );
    add("create_faq");

    tool(
      server,
      "update_faq",
      "Edita entrada do FAQ.",
      {
        id: z.string().min(1),
        question: z.string().min(2).max(200),
        body: z.string().min(1).max(20000),
      },
      async ({ id, question, body }) => api.patch(`/faq/${id}`, { question, body }),
    );
    add("update_faq");

    tool(
      server,
      "delete_faq",
      "Remove entrada do FAQ.",
      { id: z.string().min(1) },
      async ({ id }) => {
        await api.delete(`/faq/${id}`);
        return { ok: true };
      },
    );
    add("delete_faq");

    tool(
      server,
      "create_climate_survey",
      "Cria pesquisa de clima organizacional.",
      {
        title: z.string().min(4).max(160),
        description: z.string().max(2000).optional(),
        allowComments: z.boolean(),
        questions: z
          .array(
            z.object({
              prompt: z.string().min(2),
              options: z.array(z.string().min(1)).min(2),
            }),
          )
          .min(1)
          .max(30),
      },
      async (body) => api.post("/climate", body),
    );
    add("create_climate_survey");

    tool(
      server,
      "update_climate_survey",
      "Abre ou encerra pesquisa de clima (status open|closed).",
      {
        id: z.string().min(1),
        status: z.enum(["open", "closed"]),
      },
      async ({ id, status }) => api.patch(`/climate/${id}`, { status }),
    );
    add("update_climate_survey");

    tool(
      server,
      "delete_climate_survey",
      "Remove pesquisa de clima.",
      { id: z.string().min(1) },
      async ({ id }) => {
        await api.delete(`/climate/${id}`);
        return { ok: true };
      },
    );
    add("delete_climate_survey");

    tool(
      server,
      "create_tag",
      "Cria tag curada (serviços/recomendações).",
      { name: z.string().min(2).max(40) },
      async (body) => api.post("/tags", body),
    );
    add("create_tag");

    tool(
      server,
      "delete_tag",
      "Remove uma tag.",
      { id: z.string().min(1) },
      async ({ id }) => {
        await api.delete(`/tags/${id}`);
        return { ok: true };
      },
    );
    add("delete_tag");

    tool(
      server,
      "set_service_tags",
      "Define tags de um negócio (admin ou dono).",
      {
        id: z.string().min(1),
        tagIds: z.array(z.string()).max(20),
      },
      async ({ id, tagIds }) => api.put(`/services/${id}/tags`, { tagIds }),
    );
    add("set_service_tags");

    tool(server, "get_welcome_qr", "QR Code da página pública de boas-vindas (admin).", {}, async () =>
      api.get("/welcome/qr"),
    );
    add("get_welcome_qr");

    tool(
      server,
      "update_welcome",
      "Atualiza título/corpo da página de boas-vindas.",
      {
        title: z.string().min(2).max(120),
        body: z.string().min(1).max(50000),
      },
      async (payload) => api.put("/welcome", payload),
    );
    add("update_welcome");

    tool(
      server,
      "get_group_links_all",
      "Todos os links de convite WhatsApp (geral + torres 1–5).",
      {},
      async () => api.get("/group-links/all"),
    );
    add("get_group_links_all");

    tool(
      server,
      "update_group_links",
      "Atualiza links de convite WhatsApp (geral e/ou torres). URL https ou vazio para limpar.",
      {
        generalUrl: z.string().nullable().optional(),
        tower1Url: z.string().nullable().optional(),
        tower2Url: z.string().nullable().optional(),
        tower3Url: z.string().nullable().optional(),
        tower4Url: z.string().nullable().optional(),
        tower5Url: z.string().nullable().optional(),
      },
      async (payload) => api.put("/group-links", payload),
    );
    add("update_group_links");

    tool(
      server,
      "get_rag_settings",
      "Metadados do provedor RAG (nunca devolve a API key).",
      {},
      async () => api.get("/rag/settings"),
    );
    add("get_rag_settings");

    tool(server, "list_rag_embeds", "Lista embeds externos do RAG (sem corpo).", {}, async () =>
      api.get("/rag/embeds"),
    );
    add("list_rag_embeds");

    tool(
      server,
      "create_rag_embed",
      "Cria embed externo de texto no RAG (title + body).",
      {
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(500_000),
      },
      async (payload) => api.post("/rag/embeds", payload),
    );
    add("create_rag_embed");

    tool(
      server,
      "delete_rag_embed",
      "Remove embed externo do RAG.",
      { id: z.string().min(1) },
      async ({ id }) => {
        await api.delete(`/rag/embeds/${id}`);
        return { ok: true };
      },
    );
    add("delete_rag_embed");
  }

  return registered;
}
