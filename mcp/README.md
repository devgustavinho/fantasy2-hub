# Fantasy 2 Hub — MCP server

Servidor [MCP](https://modelcontextprotocol.io) (stdio) que expõe a API do Fantasy 2 Hub
como tools, **filtradas pelo cargo** do usuário autenticado.

| Cargo | Nível MCP | Tools |
|---|---|---|
| `morador`, `conselheiro` | resident | leitura/escrita do dia a dia (pautas, serviços, FAQ, clima, melhorias, perfil…) — **sem** admin |
| `sindico` | staff | resident + agenda de pautas, usuários (lista/reset senha), mover melhorias |
| `admin` | admin | staff + cargos, aprovações, auditoria, FAQ/clima/tags admin, mapa de aptos, logins 24h |

`conselheiro` é só tag: mesmas tools de `morador`.

## Pré-requisitos

1. Conta **aprovada** no Hub.
2. Token JWT de sessão (`Authorization: Bearer`), o mesmo que o front guarda em `localStorage`
   (`fantasy2_token`) após login (admin precisa concluir o 2FA).
3. Node.js ≥ 20.

## Variáveis de ambiente

| Env | Obrigatória | Descrição |
|---|---|---|
| `FANTASY2_TOKEN` | sim | JWT de sessão |
| `FANTASY2_API_URL` | não | Base da API (default `http://127.0.0.1:3100`). Produção: `https://api-fantasy2.gcsolutions-devs.com.br` |

## Instalação

```bash
cd mcp
npm install
```

## Rodar (smoke)

```bash
export FANTASY2_API_URL=http://127.0.0.1:3100
export FANTASY2_TOKEN='eyJ…'   # token pós-login
node src/index.js
# stderr: fantasy2-hub MCP: voce@… role=morador tier=resident tools=N …
# fica à espera de JSON-RPC no stdin (cliente MCP)
```

## No app (recomendado)

Em produção ([fantasy2-hub.pages.dev](https://fantasy2-hub.pages.dev)) → **Perfil → Conectar MCP**:
snippet Cursor pronto, URLs de API/app, dicas de caminho e botão para copiar o JWT da sessão.

## Cursor / Claude Desktop

Exemplo de entrada em MCP settings (stdio):

```json
{
  "mcpServers": {
    "fantasy2-hub": {
      "command": "node",
      "args": ["/caminho/absoluto/fantasy2-hub/mcp/src/index.js"],
      "env": {
        "FANTASY2_API_URL": "https://api-fantasy2.gcsolutions-devs.com.br",
        "FANTASY2_TOKEN": "cole-o-jwt-aqui"
      }
    }
  }
}
```

Ou, a partir da pasta `mcp` após `npm install`:

```json
{
  "command": "npm",
  "args": ["--prefix", "/caminho/absoluto/fantasy2-hub/mcp", "start"],
  "env": {
    "FANTASY2_API_URL": "https://api-fantasy2.gcsolutions-devs.com.br",
    "FANTASY2_TOKEN": "cole-o-jwt-aqui"
  }
}
```

**Segurança:** o token equivale a estar logado. Não commite tokens; use secret store / env local.
Admin tokens exigem 2FA no login. Tools de staff/admin **não são registradas** para morador —
mesmo que o modelo peça, a lista `tools/list` não as inclui; a API também rejeita com 403.

## Tools por nível

### Resident (`morador` / `conselheiro`)

`whoami`, `list_my_capabilities`, `get_home_stats`, `list_topics`, `get_topic`, `create_topic`,
`vote_topic`, `comment_topic`, `list_services`, `get_service`, `list_recommendations`,
`get_recommendation`, `list_faq`, `list_tags`, `list_climate`, `get_climate`, `respond_climate`,
`list_improvements`, `create_improvement`, `list_notifications`, `mark_notifications_read`,
`update_my_profile`

### Staff (+ `sindico`)

`schedule_topic`, `update_topic_status_note`, `move_improvement_status`, `list_users`,
`reset_user_password`

### Admin (+ `admin`)

`change_user_role`, `approve_user`, `reject_user`, `change_user_email`, `create_sindico`,
`list_audit_log`, `get_admin_login_stats`, `list_apartment_map`, `create_faq`,
`create_climate_survey`, `create_tag`, `delete_tag`
