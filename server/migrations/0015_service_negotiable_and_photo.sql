ALTER TABLE condo_service_items ADD COLUMN is_negotiable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE condo_services ADD COLUMN image_path TEXT;
