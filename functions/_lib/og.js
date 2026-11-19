/**
 * Injeta meta OG/Twitter no HTML da SPA (Cloudflare Pages + HTMLRewriter).
 * API_URL: env da Pages (fallback produção).
 */

export const DEFAULT_API_URL = "https://api-fantasy2.gcsolutions-devs.com.br";
export const DEFAULT_APP_NAME = "Fantasy 2 Hub";

export function apiBase(env) {
  const raw = (env && (env.API_URL || env.VITE_API_URL)) || DEFAULT_API_URL;
  return String(raw).replace(/\/+$/, "");
}

export function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function fetchTopicOg(env, path) {
  const url = `${apiBase(env)}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 120, cacheEverything: true },
  });
  if (!res.ok) return null;
  return res.json();
}

export function buildMetaHtml({ title, description, url, image }) {
  const t = escapeAttr(title);
  const d = escapeAttr(description);
  const u = escapeAttr(url);
  const img = escapeAttr(image);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta property="og:site_name" content="${escapeAttr(DEFAULT_APP_NAME)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ].join("");
}

/** Remove title padrão e injeta OG no <head>. */
export function injectOg(htmlResponse, meta) {
  const tags = buildMetaHtml(meta);
  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.remove();
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.remove();
      },
    })
    .on("head", {
      element(el) {
        el.append(tags, { html: true });
      },
    })
    .transform(htmlResponse);
}

export async function serveSpaWithOg(context, topic) {
  const { request, env } = context;
  const origin = new URL(request.url).origin;
  const assetRes = await env.ASSETS.fetch(new URL("/index.html", request.url));

  if (!topic) {
    return assetRes;
  }

  const description =
    topic.description?.trim() ||
    `Vote na pauta do condomínio no ${DEFAULT_APP_NAME}.`;

  return injectOg(assetRes, {
    title: topic.title,
    description,
    url: request.url.split("?")[0],
    image: `${origin}/logo.png`,
  });
}
