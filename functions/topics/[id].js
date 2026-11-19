import { fetchTopicOg, serveSpaWithOg } from "../_lib/og.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function onRequestGet(context) {
  const id = context.params.id;
  let topic = null;
  if (UUID_RE.test(id)) {
    try {
      topic = await fetchTopicOg(context.env, `/topics/og/${encodeURIComponent(id)}`);
    } catch {
      topic = null;
    }
  }
  return serveSpaWithOg(context, topic);
}
