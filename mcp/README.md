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

O token de API (`f2h_…`) **não** é o JWT da sessão do Hub. Só o hash SHA-256 fica no banco; o valor
em claro aparece uma vez na criação/rotação. Não compartilhe nem committe. Síndico/admin: validade
obrigatória de 90 dias e 2FA na criação. Limite: 5 tokens ativos por usuário.

**Segurança:** o Bearer `f2h_` só é aceito em `/mcp`. Antes do loopback REST, o servidor troca o
API token por um JWT interno de poucos minutos. Gestão dos tokens (`/api-tokens`) exige sessão JWT.

**Gate de permissão:** só conta **aprovada**; tools de staff/admin **não são registradas** para
morador; a API ainda aplica 403.

## Implementação

| Peça | Onde |
|---|---|
| HTTP Streamable (produção) | `server/src/modules/mcp/` — montado em `POST /mcp` |
| Tokens de API | `server/src/modules/apiTokens/` — `f2h_`, migração `0045` |
| stdio (dev / offline) | este pacote `mcp/` — `FANTASY2_API_URL` + `FANTASY2_TOKEN` (`f2h_` ou JWT) |

### stdio (opcional, desenvolvedores do monorepo)

```bash
cd mcp && npm install
export FANTASY2_API_URL=https://api-fantasy2.gcsolutions-devs.com.br
export FANTASY2_TOKEN='f2h_…'   # ou JWT de sessão
npm start
```

Com `f2h_`, o pacote chama `POST /mcp/session` para obter um JWT interno curto antes das tools
REST. Moradores **não** precisam deste fluxo.

## Tools por nível

### Resident (`morador` / `conselheiro`)

`whoami`, `list_my_capabilities`, `get_home_stats`, `list_topics`, `get_topic`, `create_topic`,
`vote_topic`, `comment_topic`, `list_services`, `get_service`, `list_recommendations`,
`get_recommendation`, `list_faq`, `ask_condo`, `list_tags`, `list_climate`, `get_climate`, `respond_climate`,
`list_improvements`, `create_improvement`, `list_notifications`, `mark_notifications_read`,
`update_my_profile`

### Staff (+ `sindico`)

`schedule_topic`, `close_topic`, `update_topic_status_note`, `move_improvement_status`, `list_users`,
`reset_user_password`

### Admin (+ `admin`)

`change_user_role`, `approve_user`, `reject_user`, `change_user_email`, `create_sindico`,
`list_audit_log`, `get_admin_login_stats`, `list_apartment_map`, `create_faq`,
`create_climate_survey`, `create_tag`, `delete_tag`
