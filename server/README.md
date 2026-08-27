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
- Sessão: JWT assinado (`jsonwebtoken`), devolvido no corpo da resposta de login e mandado de volta pelo front via header `Authorization: Bearer` (guardado em `localStorage`) — **não é cookie**. Validade de 180 dias (`server/src/auth/jwt.js`) — é um app de condomínio, não banco, então prioriza não pedir login toda hora. Foi cookie httpOnly `SameSite=None` no início, mas front (Cloudflare Pages) e API (VPS) são domínios diferentes, e o Safari bloqueia cookie de terceiro por padrão mesmo com `SameSite=None; Secure` certinho — só usuário de iPhone reclamava de tela travada em "Carregando...". Bearer token não é cookie, não é afetado por nenhuma dessas regras de first/third-party. Trade-off aceito: o token fica legível por JS (`localStorage`) em vez de `httpOnly`.
- Passkeys (WebAuthn, `src/modules/webauthn/`): `rpID`/`rpOrigin` são derivados de `CORS_ORIGIN` (`src/env.js`), não são env vars separadas. **Isso significa que passkeys ficam amarradas ao domínio do frontend no momento do cadastro** — se `CORS_ORIGIN` mudar (ex. sair do `*.pages.dev` para um domínio customizado), as passkeys já cadastradas param de funcionar e os usuários precisam recadastrar em `/perfil`. Challenges de registro/login ficam em `Map`s em memória (TTL de 2 min, uso único) — não precisam sobreviver a um restart do processo.
- Autorização: só na camada de rota (`requireAuth`, `requireApproved`, `requireStaff`, `requireAdmin` em `src/auth/guards.js`), sem lógica de permissão dentro do SQL.
- 3 cargos (`role`): `admin`, `sindico` e `morador`. O primeiro admin é criado via `scripts/create-admin.js` no servidor (nunca por API), mas **a partir daí qualquer admin pode promover outro usuário a admin** pela tela de Usuários — não é mais um cargo único fixo. Únicas travas continuam: ninguém altera o próprio cargo, e não dá pra rebaixar o último admin restante (`server/src/modules/users/routes.js`). `admin` e `sindico` **podem opcionalmente** ter `apartment_id` também (não são mutuamente exclusivos com "morar no condomínio").
- Cadastro (`approval_status`: `pending`/`approved`/`rejected`): todo `POST /auth/register` nasce `pending` e só um admin aprova/recusa (`PATCH /users/:id/approve|reject`). Recusar libera o apartamento (`apartment_id = NULL`) automaticamente. Login sempre libera uma sessão de verdade (`establishSession`), mesmo pendente/recusado — é o `requireApproved` na camada de rota, não o login, que bloqueia as funcionalidades reais; o front mostra uma tela de status (`ApprovalGate`/`PendingApproval`) em vez do app enquanto não aprovado. Isso é proposital: deixa o cadastro pendente logado o bastante pra, por exemplo, ativar notificação push e escolher ser avisado quando for aprovado. Ao registrar, todos os admins recebem notificação (in-app + push) via `notifyAdmins`; ao aprovar, o próprio usuário recebe uma via `notifyUser`.
- 2FA obrigatório pra admin (`src/auth/twoFactor.js`, TOTP via `otplib`, compatível com Google Authenticator): todo login de uma conta `admin` passa por `establishSession`, que só libera o token de sessão depois do código de 6 dígitos — na primeira vez, força o cadastro do 2FA (mostra QR code) antes de liberar. Vale tanto pra login por senha quanto por passkey.
- Um apartamento tem no máximo 2 usuários vinculados: 1 titular (`household_role = 'owner'`, o que se cadastrou pelo `/register`) e 1 familiar convidado por ele (`household_role = 'family'`) — garantido por índice único composto (`idx_users_apartment_household` em `(apartment_id, household_role)`, `WHERE apartment_id IS NOT NULL`). Ver seção "Família" abaixo.
- Cada domínio tem sua própria pasta em `src/modules/<domínio>/routes.js`, exportando uma função que retorna um `express.Router()`, registrada em `src/index.js`.
- Variáveis de ambiente validadas com `zod` em `src/env.js` — processo encerra (`process.exit(1)`) se algo obrigatório faltar.

## Permissões por cargo

| Ação | morador | síndico | admin |
|---|---|---|---|
| Criar pauta, votar, comentar | ✅ (exceto votar, se `household_role='family'`) | ✅ | ✅ |
| Editar título/descrição de uma pauta | só a própria | ✅ (qualquer) | ✅ (qualquer) |
| Marcar/reabrir pauta como pautada, definir "atualização da administração" | ❌ | ✅ | ✅ |
| Ver painel `/admin` (pautas por engajamento) | ❌ | ✅ | ✅ |
| Ver lista de usuários (`GET /users`) | ❌ | ✅ | ✅ |
| Resetar senha de um morador | ❌ | ✅ | ✅ |
| Resetar senha de um síndico | ❌ | ❌ | ✅ |
| Criar conta de síndico | ❌ | ❌ | ✅ |
| Promover/rebaixar cargo (incl. promover a admin) | ❌ | ❌ | ✅ (exceto o próprio cargo e o último admin) |
| Aprovar/recusar cadastro pendente | ❌ | ❌ | ✅ |
| Editar o próprio comentário | ✅ | ✅ | ✅ |
| Editar comentário de outra pessoa | ❌ | ✅ | ✅ |
| Excluir a própria pauta | ✅ | ✅ | ✅ |
| Excluir pauta de outra pessoa (com motivo ≥ 10 caracteres) | ❌ | ❌ | ✅ |
| Ver página de auditoria (`/admin/auditoria`) | ❌ | ❌ | ✅ |
| Cadastrar/gerenciar o próprio serviço no `/servicos` | ✅ | ✅ | ✅ |
| Criar/excluir tag e atribuir a um serviço (`/admin/tags`) | ❌ | ❌ | ✅ |

Reforçado em `src/auth/guards.js` (`requireAuth` < `requireApproved` < `requireStaff` < `requireAdmin`)
e em checagens específicas dentro das rotas (ex. dono da pauta em `PATCH /topics/:id/content` e
`DELETE /topics/:id`, escopo síndico×admin em `PATCH /users/:id/reset-password`).

## Notificações e histórico

- `src/modules/notifications/service.js` — `notifyTopicWatchers` notifica quem criou, votou ou
  comentou numa pauta (exceto quem disparou a ação) sempre que: alguém comenta, a pauta é
  agendada/reaberta, ou a administração adiciona/edita a "atualização da administração"
  (`topics.status_note`). Só notificação dentro do site (tabela `notifications`) — sem e-mail.
- `topic_events` guarda o histórico estrutural de cada pauta (criada, editada, agendada/reaberta,
  atualização da administração) — comentários já aparecem na própria seção de comentários, não são
  duplicados no histórico.
- Excluir uma pauta apaga em cascata `votes`/`comments`/`topic_events`/`notifications` daquele
  `topic_id` numa transação (SQLite não cascateia sozinho — `server/src/modules/topics/routes.js`,
  `deleteTopicCascade`). Se quem excluiu não era o dono, o dono recebe uma notificação com o motivo
  (`notifyUser`, `topic_id` fica `null` porque a pauta já não existe mais).

## Auditoria

`server/src/modules/audit/service.js` → `recordAudit(...)`, tabela `audit_log`, exposta em
`GET /audit` (só admin) — **paginada** (`?page=&pageSize=`, default 50/página) e filtrável por pessoa
(`?actorUserId=`; `GET /audit/actors` lista quem já apareceu no log, pro front montar o filtro).
Registra ações administrativas/de segurança e de conteúdo — login, cadastro, 2FA ativado,
criar/promover/aprovar/recusar/resetar senha de usuário, criar/editar/excluir/agendar/votar/comentar
pauta (incl. edição de comentário), criar/editar/excluir serviço e item de serviço. **Não** registra
ações puramente de UI (marcar notificação como lida, inscrição de push) — não têm valor de auditoria
real. Se um novo tipo de ação precisar de auditoria, chame `recordAudit` no mesmo lugar onde a ação
acontece (não tem trigger automático no banco).

## Serviços do condomínio

`src/modules/services/routes.js` (`/services`) — moradores anunciam um serviço/produto próprio
(ex. "Doces da Maria") com itens (nome, descrição, preço, até 5 fotos). Um usuário só pode ter
**um** serviço (`condo_services.user_id` é `UNIQUE`); os itens ficam em `condo_service_items`,
apagados em cascata (`ON DELETE CASCADE`) quando o serviço é excluído.

- **`GET /services` (listagem pública) não traz os itens** — só o suficiente pra escolher o
  serviço (nome, dono, foto, tags). Os itens só aparecem no link dedicado do serviço,
  `GET /services/:id` (front: `/servicos/:id`) — é lá que o cliente monta o pedido.
- Foto do serviço (`condo_services.image_path`, opcional, 1 só) é separada das fotos de item —
  `POST/DELETE /services/mine/photo`, mesmo pipeline de processamento (sharp + R2) dos itens.
- Preço do item pode ser fixo (`price_cents`, aceita centavos) ou **"a negociar"**
  (`is_negotiable = 1` — nesse caso `price_cents` fica em 0 e o front sempre mostra "A combinar").
- Item pode ser "multiplicável": `max_quantity` (`NULL` = fixo em 1 unidade, o padrão; um número
  > 1 deixa o cliente escolher a quantidade de 1 até esse valor no montador). Multiplica o preço
  já somado das opções escolhidas (preço unitário × quantidade), não afeta itens "a negociar".
  ⚠️ **`isNegotiable`/`required` chegam via `multipart/form-data` como STRING** — `z.coerce.boolean()`
  usa `Boolean(valor)`, e `Boolean("false")` é `true` (JS trata qualquer string não-vazia como
  verdadeira)! Por isso existe `booleanInput` (um `z.preprocess` que só considera `"true"`/`"1"`
  como verdadeiro) — NUNCA use `z.coerce.boolean()` direto num campo que pode vir de FormData.
- **Configurador de item** (`condo_service_item_option_groups` + `condo_service_item_options`):
  cada item pode ter grupos de opção configuráveis pelo dono (ex. "Toppings" com até 3 escolhas,
  "Cobertura" com 1 entre 2, "Sabor" obrigatório) — cada grupo tem `selectionType`
  (`single`/`multi`), `maxSelections` (só pra `multi`) e `required`. Cada opção pode somar/subtrair
  do preço do item (`price_delta_cents`) — **exceto se o item for "a negociar"**, onde todo delta é
  forçado pra `0` na hora de salvar (não tem preço-base pra ajustar). CRUD só do dono do serviço,
  aninhado em `/services/mine/items/:itemId/groups[/:groupId/options[/:optionId]]`.
- No front (`ServiceDetail.tsx`), clicar num item abre um "montador" (galeria de fotos, descrição,
  os grupos de opção como rádio/checkbox, total ao vivo) — "Adicionar ao pedido" bota numa lista
  local (carrinho, só em memória, sem persistir no banco). "Finalizar pedido no WhatsApp" monta um
  texto com todos os itens + opções escolhidas + subtotais + total e abre um link `wa.me` pro
  WhatsApp do dono — nada disso passa pelo backend, é só formatação de texto + link.

- Redes sociais do serviço: WhatsApp (`users.whatsapp`, compartilhado com o perfil) e Instagram
  (`condo_services.instagram`, só um handle normalizado — aceita `@handle`, link completo ou só o
  handle, tudo vira o mesmo formato salvo). **Ambos opcionais**, independentes um do outro — um
  serviço pode divulgar só um dos dois. Se o WhatsApp for preenchido (na criação ou depois, editando
  o serviço), marca `whatsapp_visible = 1` automaticamente — é assim que os outros moradores
  conseguem falar com o dono. Preencher o Instagram não mexe no WhatsApp do perfil.
- Fotos de item (até 5, `condo_service_item_images`, ordenadas por `position`): upload via
  `multipart/form-data` (`multer`, `memoryStorage`), **sempre processadas pelo `sharp`** antes de
  salvar — decodifica qualquer formato de entrada (JPEG/PNG/WebP/**HEIC/HEIF**, o formato que
  iPhones usam por padrão e que alguns navegadores reportam com mimetype inconsistente), corrige
  orientação EXIF, redimensiona pro lado maior ter no máximo 1200px e regrava sempre como
  `.jpg`. Isso é o que garante a "miniatura" de verdade (em vez de guardar a foto original de
  10+MP direto do celular) e evita qualquer bug de formato/mimetype no upload. O arquivo processado
  vai direto pro bucket `fantasy2-hub-public` da Cloudflare R2 (`src/lib/r2.js`, `@aws-sdk/client-s3`
  — R2 é compatível com a API do S3, só muda o endpoint) — nada fica no disco da VPS. `path` na
  tabela `condo_service_item_images` guarda a URL pública completa (`R2_PUBLIC_URL/services/<uuid>.jpg`),
  não mais um caminho relativo. Apagar a foto, editar o item ou excluir o item/serviço apaga o
  objeto do bucket também (best-effort, só loga em caso de falha).
- Todo mundo aprovado (`requireApproved`) pode ver a lista pública e cadastrar o próprio serviço — não
  tem restrição por cargo.
- Auditado: `services.create/edit/delete`, `services.photo_set`, `services.item_create/edit/delete`,
  `services.item_group_create/edit/delete`, `services.item_option_create/edit/delete`,
  `services.tags_set`.

## Família (1 titular + 1 familiar por apartamento)

`household_role` (`owner`/`family`) em `users`, ortogonal ao `role` (admin/sindico/morador) — um
familiar continua `role: 'morador'`, só muda o `household_role`. Endpoints em
`src/modules/auth/routes.js`:

- `GET /auth/family-member` — o titular vê o familiar que convidou (ou `null`).
- `POST /auth/family-member` — só o titular (`household_role === 'owner'` com `apartment_id`) pode
  convidar, e só 1 por apartamento (índice único + checagem na rota). A conta do familiar já nasce
  `approval_status: 'approved'` — o titular já é um morador verificado e está pessoalmente
  respondendo por quem convida, não passa pela fila de aprovação do admin de novo.
- Familiar tem login, WhatsApp e permissões normais de leitura/comentário, **mas não vota**:
  `POST /topics/:id/vote` responde 403 pra `household_role === 'family'` — é assim que "um voto por
  apartamento" é garantido (o titular sempre pode votar, o familiar nunca pode).
- `GET /apartments` (pública, usada no cadastro) precisa considerar que um apartamento agora pode
  ter até 2 linhas em `users` — a query usa `NOT EXISTS` em vez de `LEFT JOIN` direto, senão um
  apartamento com titular+familiar apareceria duplicado na lista.
- `GET /apartments/map?tower=` (admin) — mapa de apartamentos por torre pra administração não se
  perder em meio a centenas de usuários: cada unidade com seus moradores (titular e familiar, se
  houver). Página em `/admin/apartamentos`.

## Tags de serviço

`src/modules/tags/routes.js` (`/tags`) — vocabulário controlado de tags (`tags` + `service_tags`),
criado e atribuído **só por admin** (`POST /tags`, `DELETE /tags/:id`, `PUT /services/:id/tags`) —
quem anuncia o serviço não escolhe as próprias tags, pra manter a taxonomia consistente. Qualquer
usuário aprovado pode listar as tags (`GET /tags`) e filtrar `GET /services?tags=id1,id2` (serviço
aparece se tiver **qualquer uma** das tags informadas). Página de administração em `/admin/tags`.
Auditado: `tags.create`, `tags.delete`.

## Adicionando uma nova migration

1. Crie `migrations/000N_nome.sql` (o runner aplica em ordem alfabética e registra em `_migrations`).
2. Rode `npm run db:migrate` localmente para validar.
3. Nunca edite uma migration já aplicada em produção — sempre crie uma nova.
