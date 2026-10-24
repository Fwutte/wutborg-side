-- Optional dates and storage locations for ongoing household maintenance.
ALTER TABLE prepper_items ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE prepper_items ADD COLUMN expires_on TEXT;
ALTER TABLE prepper_items ADD COLUMN review_days INTEGER
  CHECK (review_days IS NULL OR review_days BETWEEN 1 AND 3650);
ALTER TABLE prepper_items ADD COLUMN checked_at TEXT;

UPDATE prepper_items SET review_days = 90 WHERE check_label = 'Opladet';
UPDATE prepper_items SET checked_at = updated_at WHERE is_ready = 1;
