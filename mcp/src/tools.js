import { z } from "zod";
import { isAdmin, isStaff, permissionTier } from "./roles.js";
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
    "Estatísticas da home (pautas ativas e logins 24h).",
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

  tool(server, "list_faq", "Lista entradas do FAQ.", {}, async () => api.get("/faq"));
  add("list_faq");

  tool(
    server,
    "ask_condo",
    "Pergunta ao conhecimento do condomínio (FAQ, boas-vindas, serviços, recomendações, pautas e embeds). Responde só com base no índice RAG; inclui citações. Limite: 5 perguntas por usuário a cada 24 horas.",
    {
      question: z.string().min(3).max(500).describe("Pergunta em português"),
    },
    async ({ question }) => api.post("/rag/ask", { question }),
  );
  add("ask_condo");

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
    "update_my_profile",
    "Atualiza WhatsApp / visibilidade do perfil.",
    {
      whatsapp: z.string().nullable().optional(),
      whatsappVisible: z.boolean().optional(),
    },
    async (body) => api.patch("/auth/me", body),
  );
  add("update_my_profile");

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
      "reset_user_password",
      "Envia e-mail de redefinição de senha (síndico só para morador/conselheiro).",
      { id: z.string().min(1) },
      async ({ id }) => {
        await api.patch(`/users/${id}/reset-password`);
        return { ok: true };
      },
    );
    add("reset_user_password");
  }

  // —— Admin only ————————————————
  if (isAdmin(user)) {
    tool(
      server,
      "change_user_role",
      "Altera os cargos de um usuário (um ou mais: admin, sindico, conselheiro, morador).",
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
      },
      async (params) => api.get(`/audit${qs(params)}`),
    );
    add("list_audit_log");

    tool(
      server,
      "get_admin_login_stats",
      "Contador e lista de logins nas últimas 24h (visão admin).",
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
  }

  // Fix list_my_capabilities to include tools registered after it was defined
  // Re-register is hard; instead update via closure — registered array grows, so
  // list_my_capabilities already closes over `registered` and reads it at call time. OK.

  return registered;
}
