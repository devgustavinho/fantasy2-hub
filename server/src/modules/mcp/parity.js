/**
 * Catálogo de cobertura MCP ↔ rotas Express.
 *
 * - COVERAGE: rota coberta por uma ou mais tools MCP
 * - EXCLUSIONS: rota intencionalmente fora do MCP (com motivo)
 *
 * O selftest `parity.selftest.js` falha se uma rota montada em index.js
 * não estiver em nenhum dos dois.
 */

/** @type {Record<string, string | string[]>} key = "METHOD /path" */
export const MCP_COVERAGE = {
  // auth (conta)
  "GET /auth/me": "whoami",
  "PATCH /auth/me": "update_my_profile",
  "GET /auth/family-member": "get_family_member",
  "POST /auth/family-member": "invite_family_member",
  "POST /auth/active-role": "set_active_role",

  // apartments
  "GET /apartments/map": "list_apartment_map",

  // topics
  "GET /topics": "list_topics",
  "POST /topics": "create_topic",
  "GET /topics/by-code/:code": "get_topic_by_code",
  "GET /topics/:id": "get_topic",
  "POST /topics/:id/close": "close_topic",
  "PATCH /topics/:id": "schedule_topic",
  "PATCH /topics/:id/content": "update_topic_content",
  "PATCH /topics/:id/status-note": "update_topic_status_note",
  "DELETE /topics/:id": "delete_topic",
  "POST /topics/:id/vote": "vote_topic",
  "POST /topics/:id/comments": "comment_topic",
  "PATCH /topics/:id/comments/:commentId": "edit_topic_comment",

  // users
  "GET /users": "list_users",
  "GET /users/:id": "get_user",
  "POST /users": "create_sindico",
  "PATCH /users/:id/role": "change_user_role",
  "PATCH /users/:id/approve": "approve_user",
  "PATCH /users/:id/reject": "reject_user",
  "PATCH /users/:id/email": "change_user_email",
  "PATCH /users/:id/reset-password": "reset_user_password",

  // notifications
  "GET /notifications": "list_notifications",
  "POST /notifications/read-all": "mark_notifications_read",
  "POST /notifications/:id/read": "mark_notification_read",

  // audit
  "GET /audit": "list_audit_log",
  "GET /audit/actors": "list_audit_actors",

  // services
  "GET /services": "list_services",
  "GET /services/mine": "get_my_service",
  "GET /services/by-slug/:slug": "get_service_by_slug",
  "GET /services/:id": "get_service",
  "POST /services": "create_service",
  "PATCH /services/mine": "update_my_service",
  "DELETE /services/mine": "delete_my_service",
  "PUT /services/mine/tags": "set_my_service_tags",
  "PUT /services/:id/tags": "set_service_tags",
  "POST /services/mine/items": "add_my_service_item",
  "PATCH /services/mine/items/:itemId": "update_my_service_item",
  "DELETE /services/mine/items/:itemId": "delete_my_service_item",
  "PUT /services/mine/items/:itemId/option-groups": "set_my_service_item_option_groups",

  // tags
  "GET /tags": "list_tags",
  "POST /tags": "create_tag",
  "DELETE /tags/:id": "delete_tag",

  // recommendations
  "GET /recommendations": "list_recommendations",
  "GET /recommendations/:id": "get_recommendation",
  "POST /recommendations": "create_recommendation",
  "PATCH /recommendations/:id": "update_recommendation",
  "DELETE /recommendations/:id": "delete_recommendation",
  "PUT /recommendations/:id/rating": "rate_recommendation",
  "POST /recommendations/:id/comments": "comment_recommendation",
  "DELETE /recommendations/:id/comments/:commentId": "delete_recommendation_comment",

  // faq
  "GET /faq": "list_faq",
  "POST /faq": "create_faq",
  "PATCH /faq/:id": "update_faq",
  "DELETE /faq/:id": "delete_faq",

  // welcome
  "GET /welcome": "get_welcome",
  "GET /welcome/qr": "get_welcome_qr",
  "PUT /welcome": "update_welcome",

  // group invite links (WhatsApp)
  "GET /group-links": "get_group_links",
  "GET /group-links/all": "get_group_links_all",
  "PUT /group-links": "update_group_links",

  // climate
  "GET /climate": "list_climate",
  "POST /climate": "create_climate_survey",
  "GET /climate/:id": "get_climate",
  "PATCH /climate/:id": "update_climate_survey",
  "DELETE /climate/:id": "delete_climate_survey",
  "POST /climate/:id/responses": "respond_climate",

  // stats
  "GET /stats/home": "get_home_stats",
  "GET /stats/admin/logins": "get_admin_login_stats",

  // improvements
  "GET /improvements": "list_improvements",
  "POST /improvements": "create_improvement",
  "PATCH /improvements/:id/status": "move_improvement_status",
  "DELETE /improvements/:id": "delete_improvement",

  // rag
  "GET /rag/status": "get_rag_status",
  "GET /rag/settings": "get_rag_settings",
  "GET /rag/embeds": "list_rag_embeds",
  "POST /rag/embeds": "create_rag_embed",
  "DELETE /rag/embeds/:id": "delete_rag_embed",
  "POST /rag/ask": "ask_condo",
  "POST /rag/reindex": "reindex_rag",

  // docs
  "GET /docs": "list_docs",

  // horarios
  "GET /horarios": "get_horarios",
  "GET /horarios/status": "get_horarios_status",
  "GET /horarios/areas/:id/wifi": "get_area_wifi",
  "PATCH /horarios/areas/:id": "update_common_area",
  "PUT /horarios/mudanca": "update_mudanca_windows",
  "POST /horarios/mudanca/blocked": "add_mudanca_blocked_day",
  "DELETE /horarios/mudanca/blocked/:id": "remove_mudanca_blocked_day",
  "PUT /horarios/convivencia": "update_convivencia",

  // contabil
  "GET /contabil": "list_balancetes",
  "GET /contabil/:id": "get_balancete",
  "DELETE /contabil/:id": "delete_balancete",
  "PUT /contabil/:id/parecer": "put_contabil_parecer",
};

/**
 * Rotas Express montadas que NÃO devem ter tool MCP.
 * Motivo curto — aparece no selftest se alguém remover por engano.
 * @type {Record<string, string>}
 */
export const MCP_EXCLUSIONS = {
  // Auth sensível / sessão
  "POST /auth/register": "login/registro — fora do MCP",
  "POST /auth/login": "login/registro — fora do MCP",
  "POST /auth/logout": "login/registro — fora do MCP",
  "POST /auth/forgot-password": "senha — fora do MCP",
  "POST /auth/reset-password": "senha — fora do MCP",
  "POST /auth/2fa/setup/confirm": "2FA — fora do MCP",
  "POST /auth/2fa/verify": "2FA — fora do MCP",
  "POST /auth/2fa/setup/start": "2FA — fora do MCP",
  "POST /auth/2fa/setup/confirm-session": "2FA — fora do MCP",

  // Cadastro público
  "GET /apartments": "lista pública de aptos pro cadastro — fora do MCP",

  // WebAuthn / passkeys
  "POST /webauthn/register/options": "webauthn — fora do MCP",
  "POST /webauthn/register/verify": "webauthn — fora do MCP",
  "POST /webauthn/login/options": "webauthn — fora do MCP",
  "POST /webauthn/login/verify": "webauthn — fora do MCP",
  "GET /webauthn/credentials": "webauthn — fora do MCP",
  "DELETE /webauthn/credentials/:id": "webauthn — fora do MCP",

  // Push
  "GET /push/vapid-public-key": "push — fora do MCP",
  "POST /push/subscribe": "push — fora do MCP",
  "DELETE /push/subscribe": "push — fora do MCP",

  // Stats beacon
  "POST /stats/visit": "beacon de visita — fora do MCP",

  // Open Graph (HTML pra crawlers)
  "GET /topics/og/by-code/:code": "OG HTML — fora do MCP",
  "GET /topics/og/:id": "OG HTML — fora do MCP",
  "GET /services/og/by-slug/:slug": "OG HTML — fora do MCP",
  "GET /services/og/:id": "OG HTML — fora do MCP",

  // Uploads multipart / binários
  "POST /faq/images": "upload multipart de imagem — use o Hub",
  "POST /welcome/images": "upload multipart de imagem — use o Hub",
  "POST /services/mine/photo": "upload multipart de foto — use o Hub",
  "DELETE /services/mine/photo": "gestão de foto via Hub (multipart)",
  "POST /contabil": "upload multipart de PDF — use o Hub",
  "GET /docs/manual-do-proprietario": "stream PDF binário — use list_docs + Hub /documentos",

  // RAG settings com API key — nunca via MCP
  "PUT /rag/settings": "não expor API key via MCP",
  "DELETE /rag/settings": "não expor limpeza de API key via MCP",

  // API tokens — só sessão JWT no browser
  "GET /api-tokens": "gestão de tokens só com sessão JWT",
  "POST /api-tokens": "gestão de tokens só com sessão JWT",
  "DELETE /api-tokens/:id": "gestão de tokens só com sessão JWT",
  "POST /api-tokens/:id/rotate": "gestão de tokens só com sessão JWT",

  // MCP endpoint e WAHA
  "POST /mcp": "endpoint MCP em si",
  "GET /mcp": "endpoint MCP em si",
  "DELETE /mcp": "endpoint MCP em si",
  "POST /mcp/session": "bootstrap de sessão MCP — fora das tools",
  "POST /waha/webhook": "waha — fora do MCP",
  "GET /waha/health": "waha — fora do MCP",
};

/** Junta cobertura + exclusões (chave METHOD path). */
export function allCatalogKeys() {
  return new Set([...Object.keys(MCP_COVERAGE), ...Object.keys(MCP_EXCLUSIONS)]);
}
