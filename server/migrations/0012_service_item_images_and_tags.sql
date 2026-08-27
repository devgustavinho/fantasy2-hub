CREATE TABLE condo_service_item_images (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES condo_service_items(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_condo_service_item_images_item ON condo_service_item_images(item_id);

INSERT INTO condo_service_item_images (id, item_id, path, position)
SELECT lower(hex(randomblob(16))), id, image_path, 0
FROM condo_service_items
WHERE image_path IS NOT NULL;

ALTER TABLE condo_service_items DROP COLUMN image_path;

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE service_tags (
  service_id TEXT NOT NULL REFERENCES condo_services(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, tag_id)
);
CREATE INDEX idx_service_tags_tag ON service_tags(tag_id);
