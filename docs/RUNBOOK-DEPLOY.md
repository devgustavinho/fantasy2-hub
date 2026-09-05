# Runbook de deploy — Fantasy 2 Hub

Passo a passo de como o deploy está montado hoje. Depois de feito, o deploy do backend é
automático (GitHub Actions) e o frontend também (Cloudflare Pages via Git).

Pressupostos:
- VPS: `45.90.123.41`, compartilhada com o `getflix` (outro projeto), mas com **usuário de sistema
  dedicado** `fantasy2hub` (home `/home/fantasy2hub`) — nenhum arquivo, systemd unit ou sudoers do
  fantasy2-hub vive dentro do usuário/diretório do getflix. Node 22 em `/opt/node22/bin` (mesmo
  binário compartilhado, instalado uma vez na VPS).
- Domínio: `gcsolutions-devs.com.br`, já gerenciado (idealmente) pela Cloudflare.
- Repositório: privado, `devgustavinho/fantasy2-hub`.

> **Histórico**: o app rodou inicialmente em `/home/getflix/apps/fantasy2-hub` (usuário `getflix`
> reaproveitado, por conveniência no primeiro deploy). Foi migrado em 2026-08-27 pro usuário/diretório
> dedicado atual, pra manter os dois projetos completamente isolados (arquivos, systemd, sudoers,
> chave SSH de deploy). Só o `Node.js` em `/opt/node22/bin` continua compartilhado entre os dois.

## 1. Criar o repositório privado no GitHub

`gh` não está instalado/autenticado nesta máquina, então crie manualmente:

1. https://github.com/new → owner `devgustavinho` → nome `fantasy2-hub` → **Private** → não inicialize com README (o projeto já tem um).
2. Depois de criado, me avise ou rode você mesmo:

```bash
cd fantasy2-hub
git remote add origin git@github.com:devgustavinho/fantasy2-hub.git
git push -u origin main
```

## 2. Chave SSH para o GitHub Actions → VPS

Gere um par de chaves **dedicado** a este projeto (não reaproveite a chave do getflix):

```bash
ssh-keygen -t ed25519 -f fantasy2_deploy_key -C "fantasy2-hub-deploy" -N ""
```

- Adicione o conteúdo de `fantasy2_deploy_key.pub` no `~/.ssh/authorized_keys` do usuário `fantasy2hub` na VPS.
- Adicione o conteúdo de `fantasy2_deploy_key` (a chave privada) como secret do repositório GitHub:
  `Settings → Secrets and variables → Actions → New repository secret` → nome `FANTASY2_DEPLOY_SSH_KEY`.
- Apague os dois arquivos locais depois de configurar (`rm fantasy2_deploy_key*`).

## 3. Deploy key para a VPS puxar o repo privado

O runner do GitHub Actions faz SSH até a VPS e roda `git fetch` **de dentro da VPS** — então a VPS
também precisa de permissão de leitura no repositório privado:

1. Na VPS, como usuário `fantasy2hub`: `ssh-keygen -t ed25519 -f ~/.ssh/fantasy2_repo_key -N ""` (se ainda não tiver uma chave para isso).
2. Adicione `~/.ssh/fantasy2_repo_key.pub` em `github.com/devgustavinho/fantasy2-hub` → `Settings → Deploy keys → Add deploy key` (sem write access).
3. Configure o `~/.ssh/config` do usuário `fantasy2hub` (`/home/fantasy2hub/.ssh/config`) com um
   host alias `github.com-fantasy2` apontando pra essa chave (`IdentityFile ~/.ssh/fantasy2_repo_key`,
   `IdentitiesOnly yes`) — o remote do repo na VPS usa esse alias (`git@github.com-fantasy2:...`),
   não `git@github.com:...` direto, pra não colidir com a chave do getflix pro próprio repo dele.

## 4. Preparar o diretório na VPS

```bash
# como root (ou com sudo), uma única vez:
useradd -m -d /home/fantasy2hub -s /bin/bash fantasy2hub

ssh fantasy2hub@45.90.123.41
mkdir -p /home/fantasy2hub/fantasy2-hub
cd /home/fantasy2hub/fantasy2-hub
git clone git@github.com-fantasy2:devgustavinho/fantasy2-hub.git .
cd server
npm ci --omit=dev
cp .env.example .env
```

Edite `.env` na VPS:

```
NODE_ENV=production
PORT=3100
HOST=127.0.0.1
DATABASE_PATH=/home/fantasy2hub/fantasy2-hub/server/data/fantasy2.db
JWT_SECRET=<gere com: openssl rand -hex 32>
CORS_ORIGIN=https://fantasy2.gcsolutions-devs.com.br
VAPID_PUBLIC_KEY=<gere com: npx web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<idem>
VAPID_SUBJECT=mailto:seu-email@example.com
R2_ACCOUNT_ID=<Cloudflare dashboard > R2 > Overview>
R2_ACCESS_KEY_ID=<R2 > Manage R2 API Tokens > Create, permissão Object Read & Write>
R2_SECRET_ACCESS_KEY=<idem>
R2_BUCKET_NAME=fantasy2-hub-public
R2_PUBLIC_URL=<Public Development URL do bucket, ativado nas Settings do bucket>
RESEND_API_KEY=<resend.com/api-keys>
EMAIL_FROM=Fantasy 2 Hub <nao-responda@gcsolutions-devs.com.br>
```

⚠️ `EMAIL_FROM` só funciona depois de verificar o domínio `gcsolutions-devs.com.br` no Resend
(dashboard → Domains → Add Domain) e adicionar os registros DNS (SPF/DKIM, às vezes DMARC) que o
Resend gerar no painel do Registro.br — mesmo lugar onde já está o registro `A` da API (ver seção
7). Sem o domínio verificado, o Resend rejeita o envio (fica só logado no servidor, não derruba a
rota do reset de senha).

⚠️ Toda vez que uma env var nova se tornar **obrigatória** em `src/env.js` (como aconteceu com as
`VAPID_*` — feature de push — e depois com as `R2_*` — fotos de serviço migradas pra Cloudflare R2),
o deploy automático quebra no passo de migration (o processo sai com `process.exit(1)` antes de
chegar no `systemctl restart`) até você adicionar a variável no `.env` da VPS. É uma falha segura (o
serviço antigo continua rodando), mas o deploy fica "parado no meio" — depois de adicionar a env var,
complete manualmente via SSH: `node --env-file=.env src/db/migrate.js && node --env-file=.env
src/db/seed-apartments.js && node --env-file=.env scripts/migrate-uploads-to-r2.js && sudo systemctl
restart fantasy2-hub`.

Rode as migrations, o seed e crie o primeiro admin:

```bash
node --env-file=.env src/db/migrate.js
node --env-file=.env src/db/seed-apartments.js
node --env-file=.env scripts/create-admin.js --email=sindico@gcsolutions-devs.com.br --password="<senha-forte>" --name="Síndico"
```

## 5. Serviço systemd

Crie `/etc/systemd/system/fantasy2-hub.service`:

```ini
[Unit]
Description=Fantasy 2 Hub API
After=network.target

[Service]
Type=simple
User=fantasy2hub
WorkingDirectory=/home/fantasy2hub/fantasy2-hub/server
ExecStart=/opt/node22/bin/node --env-file=.env src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fantasy2-hub
sudo systemctl status fantasy2-hub
curl -f http://127.0.0.1:3100/health
```

Como o deploy automático roda `sudo -n systemctl restart fantasy2-hub` sem senha, adicione ao sudoers
(`sudo visudo -f /etc/sudoers.d/fantasy2-hub`):

```
fantasy2hub ALL=(ALL) NOPASSWD: /bin/systemctl restart fantasy2-hub, /bin/systemctl is-active fantasy2-hub
```

## 6. nginx + certbot para a API (feito — status: ✅ concluído nesta VPS)

`gcsolutions-devs.com.br` **não está na Cloudflare** (diferente do `getflix2.com.br`), então o padrão
"restringir a IPs da Cloudflare" do getflix não se aplica aqui. Em vez disso, segui o mesmo padrão já
usado por `n8n.gcsolutions-devs.com.br` nesta mesma VPS: nginx comum + certificado Let's Encrypt via
certbot direto na origem.

```nginx
# /etc/nginx/sites-available/api-fantasy2.gcsolutions-devs.com.br (antes do certbot rodar)
server {
    listen 80;
    listen [::]:80;
    server_name api-fantasy2.gcsolutions-devs.com.br;

    limit_req zone=fantasy2_api burst=30 nodelay;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

(zona de rate limit `fantasy2_api` adicionada em `/etc/nginx/conf.d/rate-limit-zones.conf`, mesmo padrão do `getflix_api`)

Depois que o DNS abaixo estiver resolvendo para a VPS:

```bash
sudo certbot --nginx -d api-fantasy2.gcsolutions-devs.com.br
```

Isso reescreve o arquivo automaticamente (bloco 443 com o certificado + redirect 80→443), igual ao
`n8n.gcsolutions-devs.com.br.conf` existente.

## 7. DNS (feito — status: ✅ concluído)

`gcsolutions-devs.com.br` ficou onde já estava (não precisou migrar pra Cloudflare). Registro `A` de
`api-fantasy2.gcsolutions-devs.com.br` → `45.90.123.41` adicionado no Registro.br, sem proxy/CDN na
frente (acesso direto à VPS). Certificado emitido via certbot no passo 6.

O frontend usa por enquanto a URL padrão gratuita do Cloudflare Pages
(`https://fantasy2-hub.pages.dev`) em vez de um domínio customizado — como `gcsolutions-devs.com.br`
não está na Cloudflare, apontar um domínio próprio para o Pages não é trivial. Isso pode ser revisitado
no futuro se quiser um domínio customizado para o front.

## ⚠️ Nota importante: cookie cross-site

Como o front (`fantasy2-hub.pages.dev`) e a API (`api-fantasy2.gcsolutions-devs.com.br`) são **sites
diferentes** (eTLD+1 distintos), o cookie de sessão precisa de `SameSite=None; Secure` para ser aceito
em requisições cross-site — já ajustado em `server/src/auth/jwt.js` (`sessionCookieOptions`). Se um dia
o front passar a usar um subdomínio de `gcsolutions-devs.com.br` (mesmo site da API), isso deixa de ser
estritamente necessário, mas `SameSite=None` continua funcionando normalmente mesmo same-site — não
precisa reverter.

## 8. Secrets do GitHub Actions

`Settings → Secrets and variables → Actions`:

- `FANTASY2_DEPLOY_SSH_KEY` — chave privada do passo 2.

Depois disso, todo push em `main` que toque em `server/**` dispara `.github/workflows/deploy-server.yml`
automaticamente (SSH → git reset --hard → npm ci → migrate → seed → restart → healthcheck).

## 9. Cloudflare Pages (frontend)

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Autorize o acesso ao repositório privado `devgustavinho/fantasy2-hub` (instale o app do Cloudflare no GitHub, se pedido).
3. Configuração de build:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Variável de ambiente (Production e Preview): `VITE_API_URL=https://api-fantasy2.gcsolutions-devs.com.br`
5. Depois do primeiro deploy, vá em **Custom domains** → adicione `fantasy2.gcsolutions-devs.com.br`
   e siga o CNAME que o Cloudflare Pages indicar.

Não é necessário nenhum workflow do GitHub Actions para o frontend — o Cloudflare Pages já observa
o repositório e builda automaticamente a cada push em `main` (preview builds em outras branches/PRs).

## Checklist final

- [x] Repo privado criado e código enviado
- [x] Usuário de sistema dedicado `fantasy2hub` (home `/home/fantasy2hub`), sem nenhuma dependência
      do usuário `getflix`
- [x] `FANTASY2_DEPLOY_SSH_KEY` configurado no GitHub e na VPS (`/home/fantasy2hub/.ssh/authorized_keys`)
- [x] Deploy key de leitura do repo configurada na VPS (`github.com-fantasy2` no
      `/home/fantasy2hub/.ssh/config`)
- [x] VPS: `.env` preenchido, migrations + seed rodados, admin criado (`gustavocarneiro.zr@gmail.com`)
- [x] systemd `fantasy2-hub` ativo (`User=fantasy2hub`) e respondendo em `/health` (porta 3100)
- [x] sudoers configurado para `fantasy2hub` restartar o serviço sem senha (deploy automático)
- [x] nginx servindo `api-fantasy2.gcsolutions-devs.com.br` → `127.0.0.1:3100` (padrão certbot direto, igual ao n8n — domínio não está na Cloudflare)
- [x] DNS: registro `A` de `api-fantasy2.gcsolutions-devs.com.br` → `45.90.123.41` (Registro.br)
- [x] Certificado TLS emitido via `certbot --nginx -d api-fantasy2.gcsolutions-devs.com.br`
- [x] Cloudflare Pages conectado (`https://fantasy2-hub.pages.dev`), build correto (output `dist`)
- [x] `VITE_API_URL` e `CORS_ORIGIN` configurados para o par pages.dev ↔ api-fantasy2
- [x] Cookie de sessão ajustado para `SameSite=None` (necessário por serem sites diferentes)
- [x] Testado ponta a ponta em produção: cadastro de apartamento, login, criar pauta, votar,
      comentar, marcar/reabrir como pautada (admin) — tudo funcionando
- [ ] Domínio customizado do frontend (`fantasy2.gcsolutions-devs.com.br`) — opcional, fica para
      quando/se quiser investir em mover esse domínio (ou um subdomínio dele) para a Cloudflare
