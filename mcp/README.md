# Fantasy 2 Hub — MCP

O Fantasy 2 Hub expõe um **MCP remoto** na API de produção. Moradores e staff conectam o
Cursor (ou outro cliente MCP) **sem clonar este repositório**.

| Cargo | Nível MCP | Tools |
|---|---|---|
| `morador`, `conselheiro` | resident | leitura/escrita do dia a dia (pautas, serviços, FAQ, clima, melhorias, perfil…) — **sem** admin |
| `sindico` | staff | resident + agenda de pautas, usuários (lista/reset senha), mover melhorias |
| `admin` | admin | staff + cargos, aprovações, auditoria, FAQ/clima/tags admin, mapa de aptos, logins 24h |

`conselheiro` é só tag: mesmas tools de `morador`.

## Para moradores (recomendado)

1. Entre em [fantasy2-hub.pages.dev](https://fantasy2-hub.pages.dev) → **Perfil → Avançado**.
2. Em **Conectar MCP**, escolha o cliente (**Claude**, **Cursor** ou **Antigravity**) e copie URL + JWT / snippet.
3. Cole na config do cliente e reconecte.

**Avançado** também guarda **Dispositivos** (biometria/passkeys). A maioria dos moradores não precisa abrir.

Endpoint de produção:

```text
https://api-fantasy2.gcsolutions-devs.com.br/mcp
```

Exemplo `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "fantasy2-hub": {
      "url": "https://api-fantasy2.gcsolutions-devs.com.br/mcp",
      "headers": {
        "Authorization": "Bearer cole-o-jwt-da-sessao-aqui"
      }
    }
  }
}
```

O JWT é o mesmo da sessão do Hub (`localStorage.fantasy2_token` após login; admin precisa do 2FA).
Não compartilhe nem committe o token. Preferível: `Bearer ${env:FANTASY2_TOKEN}` e a variável no
ambiente do Cursor.

**Gate de permissão:** só conta **aprovada**; tools de staff/admin **não são registradas** para
morador; a API ainda aplica 403.

## Implementação

| Peça | Onde |
|---|---|
| HTTP Streamable (produção) | `server/src/modules/mcp/` — montado em `POST /mcp` |
| stdio (dev / offline) | este pacote `mcp/` — chama a API via `FANTASY2_API_URL` + `FANTASY2_TOKEN` |

### stdio (opcional, desenvolvedores do monorepo)

```bash
cd mcp && npm install
export FANTASY2_API_URL=https://api-fantasy2.gcsolutions-devs.com.br
export FANTASY2_TOKEN='eyJ…'
npm start
```

Moradores **não** precisam deste fluxo.

## Tools por nível

### Resident (`morador` / `conselheiro`)

`whoami`, `list_my_capabilities`, `get_home_stats`, `list_topics`, `get_topic`, `create_topic`,
`vote_topic`, `comment_topic`, `list_services`, `get_service`, `list_recommendations`,
`get_recommendation`, `list_faq`, `list_tags`, `list_climate`, `get_climate`, `respond_climate`,
`list_improvements`, `create_improvement`, `list_notifications`, `mark_notifications_read`,
`update_my_profile`

### Staff (+ `sindico`)

`schedule_topic`, `close_topic`, `update_topic_status_note`, `move_improvement_status`, `list_users`,
`reset_user_password`

### Admin (+ `admin`)

`change_user_role`, `approve_user`, `reject_user`, `change_user_email`, `create_sindico`,
`list_audit_log`, `get_admin_login_stats`, `list_apartment_map`, `create_faq`,
`create_climate_survey`, `create_tag`, `delete_tag`
