/**
 * Smoke test puro (sem DB/env): node src/modules/waha/phones.selftest.js
 */
import {
  digitsOnly,
  isAllowlisted,
  phoneFromJid,
  phonesMatch,
  toChatId,
} from "./phones.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(digitsOnly("+55 (85) 99999-0000") === "5585999990000", "digitsOnly");
assert(phoneFromJid("5585999990000@c.us") === "5585999990000", "phoneFromJid");
assert(toChatId("5585999990000") === "5585999990000@c.us", "toChatId");
assert(phonesMatch("5585999990000", "85999990000"), "phonesMatch suffix");
assert(isAllowlisted("5585999990000", "85999990000, 5511999"), "allowlist");
assert(!isAllowlisted("5585111111111", "5585999990000"), "allowlist deny");

console.log("waha phones.selftest: ok");
