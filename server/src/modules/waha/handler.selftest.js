/**
 * Smoke puro (sem DB/WAHA): node src/modules/waha/handler.selftest.js
 *
 * Garante a regra de gating: reply só em `message`, nunca em `message.any` / fromMe.
 */
function shouldReply(eventName, fromMe) {
  if (fromMe) return false;
  if (eventName === "message.any") return false;
  return eventName === "message";
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(shouldReply("message", false) === true, "message inbound → reply");
assert(shouldReply("message", true) === false, "message fromMe → no reply");
assert(shouldReply("message.any", false) === false, "message.any inbound → store only");
assert(shouldReply("message.any", true) === false, "message.any fromMe → store only");
assert(shouldReply("session.status", false) === false, "other event → no reply");

console.log("waha handler.selftest: ok");
