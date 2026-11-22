import { fetchOgJson, serveSpaWithOg } from "../_lib/og.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Redirect legado `/servicos/:id` ainda injeta OG do negócio. */
export async function onRequestGet(context) {
  const id = context.params.id;
  let business = null;
  if (UUID_RE.test(id)) {
    try {
      business = await fetchOgJson(context.env, `/services/og/${encodeURIComponent(id)}`);
    } catch {
      business = null;
    }
  }
  return serveSpaWithOg(context, business);
}
