import { fetchOgJson, serveSpaWithOg } from "../_lib/og.js";

function isLikelySlug(slug) {
  return typeof slug === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{2,47}$/.test(slug);
}

export async function onRequestGet(context) {
  const slug = context.params.slug;
  let business = null;
  if (isLikelySlug(slug)) {
    try {
      business = await fetchOgJson(context.env, `/services/og/by-slug/${encodeURIComponent(slug)}`);
    } catch {
      business = null;
    }
  }
  return serveSpaWithOg(context, business);
}
