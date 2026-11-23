/**
 * Self-test leve da lógica de visitas (sem subir o Express).
 * Rode: node src/modules/stats/routes.selftest.js
 */
import Database from "better-sqlite3";
import assert from "node:assert/strict";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE hub_visits (
    visitor_id TEXT PRIMARY KEY,
    user_id TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
`);

const insert = db.prepare(`
  INSERT INTO hub_visits (visitor_id, user_id, first_seen_at, last_seen_at)
  VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
`);
const touch = db.prepare(`
  UPDATE hub_visits
  SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      user_id = COALESCE(?, user_id)
  WHERE visitor_id = ?
`);
const count24h = db.prepare(`
  SELECT COUNT(*) AS c FROM hub_visits
  WHERE last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')
`);
const countAnon = db.prepare(`
  SELECT COUNT(*) AS c FROM hub_visits
  WHERE last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')
    AND user_id IS NULL
`);

insert.run("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", null);
insert.run("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "user-1");
touch.run("user-2", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

assert.equal(count24h.get().c, 2, "duas pessoas distintas");
assert.equal(countAnon.get().c, 0, "ambas ligadas a conta após touch");

insert.run("cccccccc-cccc-4ccc-8ccc-cccccccccccc", null);
assert.equal(count24h.get().c, 3);
assert.equal(countAnon.get().c, 1);

// visita antiga não conta
db.prepare(`
  INSERT INTO hub_visits (visitor_id, user_id, first_seen_at, last_seen_at)
  VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', null, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')
`).run();
assert.equal(count24h.get().c, 3, "visita antiga fora da janela");

console.log("stats visit selftest ok");
