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
- Sessão: JWT assinado (`jsonwebtoken`) em cookie httpOnly (`fantasy2_session`), nunca em localStorage. `secure` ligado automaticamente em produção (`NODE_ENV=production`).
- Autorização: só na camada de rota (`requireAuth`, `requireAdmin` em `src/auth/guards.js`), sem lógica de permissão dentro do SQL.
- Um apartamento só pode ter 1 morador — garantido por índice único parcial (`idx_users_apartment`, `WHERE apartment_id IS NOT NULL`). Contas admin têm `apartment_id = NULL` e não contam nesse limite.
- Cada domínio tem sua própria pasta em `src/modules/<domínio>/routes.js`, exportando uma função que retorna um `express.Router()`, registrada em `src/index.js`.
- Variáveis de ambiente validadas com `zod` em `src/env.js` — processo encerra (`process.exit(1)`) se algo obrigatório faltar.

## Adicionando uma nova migration

1. Crie `migrations/000N_nome.sql` (o runner aplica em ordem alfabética e registra em `_migrations`).
2. Rode `npm run db:migrate` localmente para validar.
3. Nunca edite uma migration já aplicada em produção — sempre crie uma nova.
