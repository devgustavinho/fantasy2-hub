/**
 * Selftest de paridade MCP ↔ API.
 * Rode: node src/modules/mcp/parity.selftest.js
 *
 * Lista rotas Express montadas em index.js e falha se alguma não estiver
 * coberta por tool MCP nem na allowlist de exclusões.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_COVERAGE, MCP_EXCLUSIONS, allCatalogKeys } from "./parity.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "..");
const INDEX = join(SRC, "index.js");
const MODULES = join(SRC, "modules");

const ROUTE_RE = /\brouter\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
// Aceita middleware entre o prefixo e a factory: app.use("/auth", authLimiter, authRoutes())
const MOUNT_RE = /app\.use\(\s*["'`]([^"'`]+)["'`]((?:\s*,\s*[\w.]+(?:\(\))?)+)\s*\)/g;

/** Map mount prefix → arquivo de rotas (heurística pelo nome da factory). */
function discoverMounts() {
  const indexSrc = readFileSync(INDEX, "utf8");
  const mounts = [];
  for (const m of indexSrc.matchAll(MOUNT_RE)) {
    const args = m[2].split(",").map((s) => s.trim()).filter(Boolean);
    const factoryCall = args.find((a) => /\w+\(\)$/.test(a));
    if (!factoryCall) continue;
    const factory = factoryCall.replace(/\(\)$/, "");
    if (!/Routes$/.test(factory)) continue;
    mounts.push({ prefix: m[1].replace(/\/+$/, "") || "", factory });
  }
  return mounts;
}

function findRoutesFile(factoryName) {
  // topicsOgRoutes → topics/ogRoutes.js ; horariosRoutes → horarios/routes.js
  const base = factoryName.replace(/Routes$/, "");
  const candidates = [];

  if (/Og$/i.test(base)) {
    const mod = base.replace(/Og$/i, "");
    candidates.push(join(MODULES, mod.toLowerCase(), "ogRoutes.js"));
    candidates.push(join(MODULES, kebab(mod), "ogRoutes.js"));
  }

  const kebabName = kebab(base);
  candidates.push(join(MODULES, kebabName, "routes.js"));
  // camelCase folder names used in repo (apiTokens, etc.)
  candidates.push(join(MODULES, base, "routes.js"));
  candidates.push(join(MODULES, lowerFirst(base), "routes.js"));

  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* try next */
    }
  }

  // fallback: search modules for export function <factory>
  for (const dir of readdirSync(MODULES, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of ["routes.js", "ogRoutes.js"]) {
      const path = join(MODULES, dir.name, file);
      try {
        const src = readFileSync(path, "utf8");
        if (src.includes(`export function ${factoryName}`)) return path;
      } catch {
        /* skip */
      }
    }
  }
  return null;
}

function kebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function lowerFirst(s) {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function joinPath(prefix, routePath) {
  if (routePath === "/") return prefix || "/";
  const full = `${prefix}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
  return full.replace(/\/{2,}/g, "/");
}

function discoverExpressRoutes() {
  const mounts = discoverMounts();
  const routes = [];
  const missingFiles = [];

  for (const { prefix, factory } of mounts) {
    const file = findRoutesFile(factory);
    if (!file) {
      missingFiles.push(factory);
      continue;
    }
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(ROUTE_RE)) {
      const method = m[1].toUpperCase();
      const path = joinPath(prefix, m[2]);
      routes.push({ method, path, key: `${method} ${path}`, factory, file });
    }
  }

  return { routes, missingFiles, mounts };
}

const { routes, missingFiles, mounts } = discoverExpressRoutes();

assert.ok(mounts.length >= 20, `esperava vários mounts em index.js, achou ${mounts.length}`);
assert.equal(
  missingFiles.length,
  0,
  `não achei arquivo de rotas para: ${missingFiles.join(", ")}`,
);

const catalog = allCatalogKeys();
const uncovered = [];
const seen = new Set();

for (const r of routes) {
  if (seen.has(r.key)) continue;
  seen.add(r.key);
  if (!catalog.has(r.key)) uncovered.push(r.key);
}

assert.equal(
  uncovered.length,
  0,
  `Rotas sem tool MCP nem exclusão:\n${uncovered.map((k) => `  - ${k}`).join("\n")}\n` +
    `Adicione em MCP_COVERAGE (parity.js) ou MCP_EXCLUSIONS.`,
);

// Catálogo não deve ter chaves órfãs óbvias (aviso soft → assert)
const routeKeys = new Set(routes.map((r) => r.key));
const orphans = [...catalog].filter((k) => !routeKeys.has(k));
assert.equal(
  orphans.length,
  0,
  `Entradas no catálogo sem rota Express correspondente:\n${orphans.map((k) => `  - ${k}`).join("\n")}`,
);

// Tools referenciadas na cobertura devem existir no tools.js (pelo nome em registerTool)
const toolsSrc = readFileSync(join(__dirname, "tools.js"), "utf8");
const toolNames = new Set();
for (const m of toolsSrc.matchAll(/\b(?:tool|add)\(\s*(?:server,\s*)?["'`]([a-z0-9_]+)["'`]/g)) {
  toolNames.add(m[1]);
}
// also catch add("name") after tool(...)
for (const m of toolsSrc.matchAll(/\badd\(\s*["'`]([a-z0-9_]+)["'`]/g)) {
  toolNames.add(m[1]);
}

const missingTools = [];
for (const [route, tools] of Object.entries(MCP_COVERAGE)) {
  const list = Array.isArray(tools) ? tools : [tools];
  for (const t of list) {
    if (!toolNames.has(t)) missingTools.push(`${route} → ${t}`);
  }
}
assert.equal(
  missingTools.length,
  0,
  `Tools citadas em MCP_COVERAGE ausentes em tools.js:\n${missingTools.map((k) => `  - ${k}`).join("\n")}`,
);

// Exclusões com motivo não-vazio
for (const [key, reason] of Object.entries(MCP_EXCLUSIONS)) {
  assert.ok(String(reason).trim().length > 3, `exclusão sem motivo: ${key}`);
}

console.log(
  `mcp parity selftest ok — ${seen.size} rotas, ${Object.keys(MCP_COVERAGE).length} cobertas, ${Object.keys(MCP_EXCLUSIONS).length} excluídas`,
);
