/**
 * Self-test das regras de membership de cargos.
 * Rode: node src/auth/roles.selftest.js
 */
import assert from "node:assert/strict";
import {
  canRemoveMorador,
  normalizeRoleMembership,
  rolesRequireMorador,
} from "./roleMembership.js";

{
  assert.deepEqual(normalizeRoleMembership(["admin"]), ["admin", "morador"]);
  assert.deepEqual(normalizeRoleMembership(["conselheiro"]), ["conselheiro", "morador"]);
  assert.deepEqual(normalizeRoleMembership(["admin", "conselheiro"]), [
    "admin",
    "conselheiro",
    "morador",
  ]);
  assert.deepEqual(normalizeRoleMembership(["admin", "morador"]), ["admin", "morador"]);
}

{
  // Síndico profissional: sem morador.
  assert.deepEqual(normalizeRoleMembership(["sindico"]), ["sindico"]);
  // Síndico morador.
  assert.deepEqual(normalizeRoleMembership(["sindico", "morador"]), ["sindico", "morador"]);
  // Síndico + admin implica morador.
  assert.deepEqual(normalizeRoleMembership(["sindico", "admin"]), [
    "admin",
    "sindico",
    "morador",
  ]);
}

{
  assert.equal(rolesRequireMorador(["admin"]), true);
  assert.equal(rolesRequireMorador(["conselheiro", "morador"]), true);
  assert.equal(rolesRequireMorador(["sindico"]), false);
  assert.equal(rolesRequireMorador(["sindico", "morador"]), false);
  assert.equal(canRemoveMorador(["sindico", "morador"]), true);
  assert.equal(canRemoveMorador(["admin", "morador"]), false);
  assert.equal(canRemoveMorador(["conselheiro", "sindico", "morador"]), false);
}

{
  assert.deepEqual(normalizeRoleMembership([]), []);
  assert.deepEqual(normalizeRoleMembership(["nope", "morador"]), ["morador"]);
}

console.log("roles.selftest: ok");
