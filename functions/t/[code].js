import { fetchTopicOg, serveSpaWithOg } from "../_lib/og.js";

function isValidShareCode(code) {
  return typeof code === "string" && /^[A-Za-z0-9]{1,6}$/.test(code);
}

export async function onRequestGet(context) {
  const code = context.params.code;
  let topic = null;
  if (isValidShareCode(code)) {
    try {
      topic = await fetchTopicOg(context.env, `/topics/og/by-code/${encodeURIComponent(code)}`);
    } catch {
      topic = null;
    }
  }
  return serveSpaWithOg(context, topic);
}
