# Runbook de deploy — Fantasy 2 Hub

Este é um passo a passo manual. Eu (assistente) não tenho acesso SSH à VPS nesta sessão, então
cada bloco abaixo é para você rodar. Depois de feito, o deploy do backend passa a ser automático
(GitHub Actions) e o frontend também (Cloudflare Pages via Git).

Pressupostos:
- VPS: a mesma do `getflix` (`45.90.123.41`), reaproveitando o usuário de sistema `getflix` que já
  existe lá (tem Node 22 em `/opt/node22/bin`, já sabe fazer `git fetch`/deploy).
- Domínio: `gcsolutions-devs.com.br`, já gerenciado (idealmente) pela Cloudflare.
- Repositório: privado, `devgustavinho/fantasy2-hub`.

Se preferir um usuário de sistema dedicado (`fantasy2` em vez de reaproveitar `getflix`), troque os
caminhos abaixo — a lógica é a mesma, só muda o `$APP_DIR` e o `User=` do systemd.

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

- Adicione o conteúdo de `fantasy2_deploy_key.pub` no `~/.ssh/authorized_keys` do usuário `getflix` na VPS.
- Adicione o conteúdo de `fantasy2_deploy_key` (a chave privada) como secret do repositório GitHub:
  `Settings → Secrets and variables → Actions → New repository secret` → nome `FANTASY2_DEPLOY_SSH_KEY`.
- Apague os dois arquivos locais depois de configurar (`rm fantasy2_deploy_key*`).

## 3. Deploy key para a VPS puxar o repo privado

O runner do GitHub Actions faz SSH até a VPS e roda `git fetch` **de dentro da VPS** — então a VPS
também precisa de permissão de leitura no repositório privado:

1. Na VPS, como usuário `getflix`: `ssh-keygen -t ed25519 -f ~/.ssh/fantasy2_repo_key -N ""` (se ainda não tiver uma chave para isso).
2. Adicione `~/.ssh/fantasy2_repo_key.pub` em `github.com/devgustavinho/fantasy2-hub` → `Settings → Deploy keys → Add deploy key` (sem write access).
3. Configure o `~/.ssh/config` da VPS para usar essa chave ao acessar `github.com` (ou clone via `GIT_SSH_COMMAND`).

## 4. Preparar o diretório na VPS

```bash
ssh getflix@45.90.123.41
mkdir -p /home/getflix/apps/fantasy2-hub
cd /home/getflix/apps/fantasy2-hub
git clone git@github.com:devgustavinho/fantasy2-hub.git .
cd server
npm ci --omit=dev
cp .env.example .env
```

Edite `.env` na VPS:

```
NODE_ENV=production
PORT=3100
HOST=127.0.0.1
DATABASE_PATH=/home/getflix/apps/fantasy2-hub/server/data/fantasy2.db
JWT_SECRET=<gere com: openssl rand -hex 32>
CORS_ORIGIN=https://fantasy2.gcsolutions-devs.com.br
```

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
User=getflix
WorkingDirectory=/home/getflix/apps/fantasy2-hub/server
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
getflix ALL=(ALL) NOPASSWD: /bin/systemctl restart fantasy2-hub, /bin/systemctl is-active fantasy2-hub
```

## 6. nginx para a API (feito — status: ✅ concluído nesta VPS)

A VPS já tinha um padrão pronto para o getflix: restringir a porta 80 só a IPs da Cloudflare
(`geo $is_cloudflare` em `/etc/nginx/conf.d/cloudflare-geo.conf`) e deixar o TLS público por conta do
proxy da Cloudflare (modo "Flexible"/"Full"), sem certbot na origem. Segui o mesmo padrão em vez de
gerar um certificado próprio, para manter consistência com o getflix:

```nginx
# /etc/nginx/sites-available/api-fantasy2.gcsolutions-devs.com.br
server {
    listen 80;
    listen [::]:80;
    server_name api-fantasy2.gcsolutions-devs.com.br;

    if ($is_cloudflare = 0) {
        return 403;
    }

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

```bash
sudo ln -s /etc/nginx/sites-available/api-fantasy2.gcsolutions-devs.com.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Importante**: como a origem só aceita tráfego de IPs da Cloudflare e não tem certificado próprio, o
registro DNS abaixo **precisa** estar com o proxy da Cloudflare ligado (nuvem laranja) — se ficar "DNS
only" (cinza), ninguém consegue acessar a API.

## 7. DNS (Cloudflare)

- `api-fantasy2.gcsolutions-devs.com.br` → registro `A` apontando para `45.90.123.41`, com proxy da
  Cloudflare **ligado** (nuvem laranja, obrigatório — ver nota acima), igual ao getflix. SSL/TLS mode
  do domínio deve estar como "Flexible" ou "Full" (não "Full (strict)", já que a origem não tem certificado próprio).
- `fantasy2.gcsolutions-devs.com.br` → configurado depois, na etapa do Cloudflare Pages (passo 9), que
  te dará o CNAME exato a criar em "Custom domains".

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
- [x] `FANTASY2_DEPLOY_SSH_KEY` configurado no GitHub e na VPS (`/home/getflix/.ssh/authorized_keys`)
- [x] Deploy key de leitura do repo configurada na VPS (`github.com-fantasy2` no `~/.ssh/config`)
- [x] VPS: `.env` preenchido, migrations + seed rodados, admin criado (`gustavocarneiro.zr@gmail.com`)
- [x] systemd `fantasy2-hub` ativo e respondendo em `/health` (porta 3100)
- [x] sudoers configurado para restart sem senha (deploy automático)
- [x] nginx servindo `api-fantasy2.gcsolutions-devs.com.br` → `127.0.0.1:3100` (padrão Cloudflare-only do getflix)
- [ ] DNS da API apontando pra VPS (proxy Cloudflare ligado) — **pendente, depende da sua conta Cloudflare**
- [ ] Cloudflare Pages conectado, build passando, domínio `fantasy2.gcsolutions-devs.com.br` ativo — **pendente**
- [ ] Testar cadastro real de um apartamento ponta a ponta em produção — depende dos itens acima
