-- Det forældede quantity-tekstfelt er erstattet af amount/unit (migration 0004).
-- quantity blev kun bevaret som et afledt mærkat; nu er amount/unit den eneste kilde.

PRAGMA foreign_keys = ON;

-- Backfill evt. manglende amount ud fra quantity som sikkerhedsnet,
-- før kolonnen fjernes (rækker med amount NULL får 1 som standard).
UPDATE freezer_items
   SET amount = 1
 WHERE amount IS NULL;

-- SQLite understøtter ikke DROP COLUMN før v3.35; D1 kører en ny nok version,
-- men for maksimal kompatibilitet genskabes tabellen uden quantity.
CREATE TABLE IF NOT EXISTS freezer_items_new (
    id         INTEGER PRIMARY KEY,
    drawer     TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    amount     REAL,
    unit       TEXT    NOT NULL DEFAULT '',
    notes      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO freezer_items_new (id, drawer, name, amount, unit, notes, sort_order, created_at, updated_at)
SELECT id, drawer, name, amount, unit, notes, sort_order, created_at, updated_at
  FROM freezer_items;

DROP TABLE freezer_items;
ALTER TABLE freezer_items_new RENAME TO freezer_items;

CREATE INDEX IF NOT EXISTS ix_freezer_drawer_sort
    ON freezer_items(drawer, sort_order, created_at, id);
