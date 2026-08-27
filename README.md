# Fantasy 2 Hub

Hub do condomínio Fantasy 2. Primeiro módulo: pautas de assembleia — condôminos cadastram pautas,
votam a favor/contra, comentam, e a administração marca quando uma pauta foi levada a uma assembleia.

## Estrutura

- `/` — frontend (Vite + React + TypeScript + Tailwind + shadcn/ui), hospedado no Cloudflare Pages.
- `/server` — backend (Node + Express puro, JavaScript ESM, sem build step). Roda numa VPS que
  também hospeda o `getflix` (projeto separado), mas com usuário de sistema, diretório e systemd
  próprios (`fantasy2hub`, `/home/fantasy2hub`) — nenhum arquivo é compartilhado entre os dois.

## Desenvolvimento local

```bash
# backend
cd server
npm install
cp .env.example .env
node src/db/migrate.js
node src/db/seed-apartments.js
npm run dev

# frontend (em outro terminal, na raiz do repo)
npm install
npm run dev
```

Veja `server/README.md` para convenções do backend e `docs/RUNBOOK-DEPLOY.md` para o passo a passo
de deploy na VPS + Cloudflare Pages.
