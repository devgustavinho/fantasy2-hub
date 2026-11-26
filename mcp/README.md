# Fantasy 2 Hub — MCP

O Fantasy 2 Hub expõe um **MCP remoto** na API de produção. Moradores e staff conectam o
Cursor (ou outro cliente MCP) **sem clonar este repositório**.

| Cargo | Nível MCP | Tools |
|---|---|---|
| `morador`, `conselheiro` | resident | leitura/escrita do dia a dia (pautas, serviços, FAQ, clima, melhorias, horários, docs, contabil leitura, perfil…) — **sem** admin |
| `conselheiro` (+ tag) | resident + parecer | mesmas de morador **+** `put_contabil_parecer` |
| `sindico` | staff | resident + agenda de pautas, usuários (lista/get/reset senha), horários write, contabil delete, reindex RAG, mover melhorias |
| `admin` | admin | staff + cargos, aprovações, auditoria, FAQ/clima/tags/welcome/RAG embeds admin, mapa de aptos, logins 24h |

`conselheiro` sem staff: mesmas tools de `morador` + parecer contábil.

## Para moradores (recomendado)

1. Entre em [fantasy2-hub.pages.dev](https://fantasy2-hub.pages.dev) → **Perfil → Avançado**.
2. Em **Conectar MCP**, clique em **Gerar token de API** (valor `f2h_…` aparece **só uma vez**).
3. Escolha o cliente (**Claude**, **Cursor** ou **Antigravity**) e copie URL + snippet.
4. Preferível: exporte `FANTASY2_TOKEN` e use `Bearer ${env:FANTASY2_TOKEN}` na config.
5. Cole na config do cliente e reconecte.

**Avançado** também guarda **Dispositivos** (biometria/passkeys). A maioria dos moradores não precisa abrir.

Endpoint de produção:

```text
https://api-fantasy2.gcsolutions-devs.com.br/mcp
```

Exemplo `~/.cursor/mcp.json` (recomendado com variável de ambiente):

```json
{
  "mcpServers": {
    "fantasy2-hub": {
      "url": "https://api-fantasy2.gcsolutions-devs.com.br/mcp",
      "headers": {
        "Authorization": "Bearer ${env:FANTASY2_TOKEN}"
      }
    }
  }
}
```

### Tokens de API (`f2h_`)

- Formato: `f2h_` + 32 bytes aleatórios (base64url). Só o **SHA-256** e um prefixo curto ficam no SQLite.
- O valor completo aparece **uma vez** na criação/rotação.
- **Síndico/admin:** validade **obrigatória**, máximo **90 dias**; 2FA exigido **só na criação** (uso no `/mcp` sem 2FA).
- **Morador/conselheiro:** expiração **opcional**; se informada, teto de **365 dias**.
- Limite: 5 tokens ativos por usuário. Listar não devolve o valor; dá para rotacionar e revogar.
- Token expirado ou revogado → **401** claro (`api_token_expired` / `api_token_revoked`).

JWT de sessão no `/mcp` ainda funciona **temporariamente**, com aviso de depreciação — migre para `f2h_`.

**Segurança:** o Bearer `f2h_` só é aceito em `/mcp`. Antes do loopback REST, o servidor troca o
API token por um JWT interno de poucos minutos — e esse JWT **só vale em conexão loopback**
(127.0.0.1); fora disso → 401. Gestão dos tokens (`/api-tokens`) exige sessão JWT — **não** há tools MCP para gerir tokens.

**Gate de permissão:** só conta **aprovada**; tools de staff/admin **não são registradas** para
morador; a API ainda aplica 403. Wi‑Fi: `get_area_wifi` chama a mesma rota da API; `get_horarios` **omite** senhas.

## Implementação

| Peça | Onde |
|---|---|
| HTTP Streamable (produção) | `server/src/modules/mcp/` — montado em `POST /mcp` |
| Tokens de API | `server/src/modules/apiTokens/` — `f2h_`, migração `0045` |
| Paridade MCP↔API | `server/src/modules/mcp/parity.js` + `parity.selftest.js` (CI) |
| stdio (dev / offline) | este pacote `mcp/` — `FANTASY2_API_URL` + `FANTASY2_TOKEN` (`f2h_` ou JWT) |

### stdio (opcional, desenvolvedores do monorepo)

```bash
cd mcp && npm install
export FANTASY2_API_URL=https://api-fantasy2.gcsolutions-devs.com.br
export FANTASY2_TOKEN='f2h_…'   # preferível; JWT de sessão ainda funciona (legado)
npm start
```

Com `f2h_`, o pacote faz **proxy stdio → HTTP** para `POST /mcp` (não troca por JWT REST).
Com JWT de sessão, registra tools locais que chamam a API REST. Moradores **não** precisam
deste fluxo. Mantenha `mcp/src/tools.js` em paridade com `server/src/modules/mcp/tools.js`.

## Tools por nível

### Resident (`morador` / base)

`whoami`, `list_my_capabilities`, `get_home_stats`,
`list_topics`, `get_topic`, `get_topic_by_code`, `create_topic`, `update_topic_content`, `delete_topic`,
`vote_topic`, `comment_topic`, `edit_topic_comment`,
`list_services`, `get_service`, `get_service_by_slug`, `get_my_service`, `create_service`,
`update_my_service`, `delete_my_service`, `set_my_service_tags`,
`add_my_service_item`, `update_my_service_item`, `delete_my_service_item`, `set_my_service_item_option_groups`,
`list_recommendations`, `get_recommendation`, `create_recommendation`, `update_recommendation`,
`delete_recommendation`, `rate_recommendation`, `comment_recommendation`, `delete_recommendation_comment`,
`list_faq`, `ask_condo`, `get_rag_status`, `list_tags`,
`list_climate`, `get_climate`, `respond_climate`,
`list_improvements`, `create_improvement`, `delete_improvement`,
`list_notifications`, `mark_notifications_read`, `mark_notification_read`,
`update_my_profile`, `get_family_member`, `invite_family_member`, `set_active_role`,
`get_horarios`, `get_horarios_status`, `get_area_wifi`,
`list_docs`, `get_welcome`, `list_balancetes`, `get_balancete`

### Conselheiro (+ `put_contabil_parecer`)

`put_contabil_parecer`

### Staff (+ `sindico`)

`schedule_topic`, `close_topic`, `update_topic_status_note`, `move_improvement_status`,
`list_users`, `get_user`, `reset_user_password`,
`update_common_area`, `update_mudanca_windows`, `add_mudanca_blocked_day`,
`remove_mudanca_blocked_day`, `update_convivencia`,
`delete_balancete`, `reindex_rag`

### Admin (+ `admin`)

`change_user_role`, `approve_user`, `reject_user`, `change_user_email`, `create_sindico`,
`list_audit_log`, `list_audit_actors`, `get_admin_login_stats`, `list_apartment_map`,
`create_faq`, `update_faq`, `delete_faq`,
`create_climate_survey`, `update_climate_survey`, `delete_climate_survey`,
`create_tag`, `delete_tag`, `set_service_tags`,
`get_welcome_qr`, `update_welcome`,
`get_rag_settings`, `list_rag_embeds`, `create_rag_embed`, `delete_rag_embed`

### Fora do MCP (proposital)

Login/registro/2FA/senha, webauthn, push, waha, gestão de `/api-tokens`, `PUT/DELETE /rag/settings`
(API key), uploads multipart (PDF contábil, fotos), stream PDF do manual, beacon `POST /stats/visit`, OG HTML.
