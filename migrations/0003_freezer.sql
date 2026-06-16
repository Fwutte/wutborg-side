-- Fryseroversigt med seks skuffer.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS freezer_items (
    id         INTEGER PRIMARY KEY,
    drawer     TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    quantity   TEXT,
    notes      TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_freezer_drawer_sort
    ON freezer_items(drawer, sort_order, created_at, id);

WITH seed(drawer, name, quantity, sort_order) AS (
    VALUES
        ('Oksekød', 'hakket oksekød', '14 x 500g', 10),
        ('Oksekød', 'kødboller', '1/4 pose', 20),
        ('Oksekød', 'Kødsovs', '', 30),

        ('Andet', 'fastelavnsbolle', '1', 10),
        ('Andet', 'chili con carne grøntsager', '1/2', 20),
        ('Andet', 'majs', '1 ps', 30),
        ('Andet', 'Ærter', '', 40),
        ('Andet', 'Blåbær', '', 50),
        ('Andet', 'pølsehorn', '6 x', 60),
        ('Andet', 'Tomat tarpanede', '', 70),
        ('Andet', 'Thai boks', '1 x', 80),
        ('Andet', 'Frisk estragon', '', 90),
        ('Andet', 'ramsløgspesto', '3 x', 100),
        ('Andet', 'smoothie bær, rød', '1 x', 110),
        ('Andet', 'stenbiderrogn', '5 x 100g', 120),
        ('Andet', 'fiskefrikadelle', '3 x', 130),
        ('Andet', 'revet ost', '3 x', 140),
        ('Andet', 'Pizza sauce', '', 150),

        ('Gris', 'flæskesteg', '1 x 500g', 10),
        ('Gris', 'medister', '1 x', 20),
        ('Gris', 'chorizo (fødselsdag)', '1 x 10 stk.', 30),
        ('Gris', 'Rød pesto', '', 40),
        ('Gris', 'mørbrad', '1 x', 50),
        ('Gris', 'Bag selv leverpostej', '', 60),
        ('Gris', 'røget filet', '1 x', 70),
        ('Gris', 'pepperoni', '10 x', 80),

        ('Kylling', 'andelår', '4 x', 10),

        ('Brød', 'rugklapper', '3 x', 10),
        ('Brød', 'yoghurt boller', '3 x', 20),
        ('Brød', 'pitabrød', '2 x', 30),
        ('Brød', 'bamseboller', '3 x', 40),
        ('Brød', 'Hjemmebagte boller', '', 50),
        ('Brød', 'Hvidløgsbrød', '', 60),

        ('Blandet', 'Smør', '6 x', 10),
        ('Blandet', 'bakkedal', '4 x', 20)
)
INSERT INTO freezer_items (drawer, name, quantity, sort_order)
SELECT drawer, name, quantity, sort_order
FROM seed
WHERE NOT EXISTS (SELECT 1 FROM freezer_items);
