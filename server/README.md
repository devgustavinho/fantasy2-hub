# fantasy2-hub — server

Backend em Node.js + Express puro (JavaScript ESM, sem TypeScript, sem build step — roda igual em
qualquer Node ≥ 20). Banco SQLite via `better-sqlite3`, sem ORM (SQL direto, migrations em
`migrations/*.sql`).

## Desenvolvimento local

```bash
npm install
cp .env.example .env      # ajuste JWT_SECRET, CORS_ORIGIN etc.
npm run db:migrate
npm run db:seed           # cria as 320 unidades (5 torres x 8 andares x 8 apartamentos)
npm run create-admin -- --email=admin@example.com --password=senhaSegura123 --name="Síndico"
npm run dev
```

## Convenções

- Datas: string ISO-8601 UTC (`new Date().toISOString()` / `strftime` no SQLite).
- IDs: `crypto.randomUUID()` gerado na aplicação, nunca autoincrement.
- Booleans em SQLite: quando vem de uma subquery (ex. `available`), sempre convertido para `Boolean(...)` antes de responder no JSON.
- Sessão: JWT assinado (`jsonwebtoken`) em cookie httpOnly (`fantasy2_session`), nunca em localStorage. `secure` ligado automaticamente em produção (`NODE_ENV=production`). Validade de 180 dias (`server/src/auth/jwt.js`) — é um app de condomínio, não banco, então prioriza não pedir login toda hora.
- Passkeys (WebAuthn, `src/modules/webauthn/`): `rpID`/`rpOrigin` são derivados de `CORS_ORIGIN` (`src/env.js`), não são env vars separadas. **Isso significa que passkeys ficam amarradas ao domínio do frontend no momento do cadastro** — se `CORS_ORIGIN` mudar (ex. sair do `*.pages.dev` para um domínio customizado), as passkeys já cadastradas param de funcionar e os usuários precisam recadastrar em `/perfil`. Challenges de registro/login ficam em `Map`s em memória (TTL de 2 min, uso único) — não precisam sobreviver a um restart do processo.
- Autorização: só na camada de rota (`requireAuth`, `requireStaff`, `requireAdmin` em `src/auth/guards.js`), sem lógica de permissão dentro do SQL.
- 3 cargos (`role`): `admin` (só o dono do sistema, criado exclusivamente via `scripts/create-admin.js` — nunca por API), `sindico` (criado/promovido pelo admin em `/users`) e `morador` (auto-cadastro em `/auth/register`). `admin` e `sindico` **podem opcionalmente** ter `apartment_id` também (não são mutuamente exclusivos com "morar no condomínio").
- Um apartamento só pode ter 1 morador vinculado — garantido por índice único parcial (`idx_users_apartment`, `WHERE apartment_id IS NOT NULL`), independente do cargo do usuário.
- Cada domínio tem sua própria pasta em `src/modules/<domínio>/routes.js`, exportando uma função que retorna um `express.Router()`, registrada em `src/index.js`.
- Variáveis de ambiente validadas com `zod` em `src/env.js` — processo encerra (`process.exit(1)`) se algo obrigatório faltar.

## Permissões por cargo

| Ação | morador | síndico | admin |
|---|---|---|---|
| Criar pauta, votar, comentar | ✅ | ✅ | ✅ |
| Editar título/descrição de uma pauta | só a própria | ✅ (qualquer) | ✅ (qualquer) |
| Marcar/reabrir pauta como pautada, definir "atualização da administração" | ❌ | ✅ | ✅ |
| Ver painel `/admin` (pautas por engajamento) | ❌ | ✅ | ✅ |
| Ver lista de usuários (`GET /users`) | ❌ | ✅ | ✅ |
| Resetar senha de um morador | ❌ | ✅ | ✅ |
| Resetar senha de um síndico | ❌ | ❌ | ✅ |
| Criar conta de síndico, promover/rebaixar cargo | ❌ | ❌ | ✅ |
| Resetar/alterar cargo do admin | ❌ | ❌ | ❌ (nem o próprio admin — só via `scripts/create-admin.js` no servidor) |

Reforçado em `src/auth/guards.js` (`requireAuth` < `requireStaff` < `requireAdmin`) e em checagens
específicas dentro das rotas (ex. dono da pauta em `PATCH /topics/:id/content`, escopo síndico×admin em
`PATCH /users/:id/reset-password`).

## Notificações e histórico

- `src/modules/notifications/service.js` — `notifyTopicWatchers` notifica quem criou, votou ou
  comentou numa pauta (exceto quem disparou a ação) sempre que: alguém comenta, a pauta é
  agendada/reaberta, ou a administração adiciona/edita a "atualização da administração"
  (`topics.status_note`). Só notificação dentro do site (tabela `notifications`) — sem e-mail.
- `topic_events` guarda o histórico estrutural de cada pauta (criada, editada, agendada/reaberta,
  atualização da administração) — comentários já aparecem na própria seção de comentários, não são
  duplicados no histórico.

## Adicionando uma nova migration

1. Crie `migrations/000N_nome.sql` (o runner aplica em ordem alfabética e registra em `_migrations`).
2. Rode `npm run db:migrate` localmente para validar.
3. Nunca edite uma migration já aplicada em produção — sempre crie uma nova.
