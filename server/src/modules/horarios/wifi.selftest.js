import assert from "node:assert/strict";
import { buildWifiUri, escapeWifiField } from "./wifi.js";

assert.equal(escapeWifiField(`a;b:c,d"e\\f`), `a\\;b\\:c\\,d\\"e\\\\f`);
assert.equal(
  buildWifiUri({ ssid: "Fantasy2", password: "segredo", security: "WPA" }),
  "WIFI:T:WPA;S:Fantasy2;P:segredo;;",
);
assert.equal(
  buildWifiUri({ ssid: "Open", password: "", security: "nopass" }),
  "WIFI:T:nopass;S:Open;;",
);
assert.equal(
  buildWifiUri({ ssid: "A;B", password: "p:1", security: "WPA" }),
  "WIFI:T:WPA;S:A\\;B;P:p\\:1;;",
);

console.log("wifi uri selftest ok");
