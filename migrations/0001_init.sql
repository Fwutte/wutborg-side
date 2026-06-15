-- =====================================================================
--  Madplan – SQLite skema
--  Kør: npx wrangler d1 migrations apply madplan --local/--remote
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
--  Retter (bibliotek). Genbruges på tværs af uger, så I ikke skal
--  skrive "Spaghetti med kødsovs" hver gang.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dishes (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    category    TEXT,                       -- fx 'Pasta', 'Fisk', 'Vegetar'
    notes       TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0, -- 0/1
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
--  Madplan – én post pr. dag pr. måltid.
--  dish_id peger (valgfrit) på biblioteket; dish_name gemmes som
--  "snapshot", så planen står ved magt selv hvis en ret slettes/omdøbes.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_plan (
    id         INTEGER PRIMARY KEY,
    plan_date  TEXT    NOT NULL,                       -- 'YYYY-MM-DD'
    meal_type  TEXT    NOT NULL DEFAULT 'aftensmad',   -- 'morgenmad'|'frokost'|'aftensmad'
    dish_id    INTEGER REFERENCES dishes(id) ON DELETE SET NULL,
    dish_name  TEXT,
    cook       TEXT,                                   -- hvem laver mad
    notes      TEXT,
    is_done    INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Højst én ret pr. dag pr. måltidstype
CREATE UNIQUE INDEX IF NOT EXISTS ux_meal_slot ON meal_plan(plan_date, meal_type);
CREATE INDEX        IF NOT EXISTS ix_meal_date ON meal_plan(plan_date);

-- ---------------------------------------------------------------------
--  Indkøbsliste
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_items (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    quantity   TEXT,
    is_checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_dishes_favorite_name
    ON dishes(is_favorite DESC, name);
CREATE INDEX IF NOT EXISTS ix_shopping_checked_created
    ON shopping_items(is_checked, created_at, id);

-- ---------------------------------------------------------------------
--  Lidt startdata
-- ---------------------------------------------------------------------
INSERT INTO dishes (name, category, is_favorite) VALUES
    ('Frikadeller med kartofler og sovs', 'Klassiker', 1),
    ('Spaghetti med kødsovs',             'Pasta',     1),
    ('Kylling i karry med ris',           'Kylling',   1),
    ('Hjemmelavet pizza',                 'Fredagshygge', 1),
    ('Tacos',                             'Mexicansk', 1),
    ('Fiskefrikadeller med remoulade',    'Fisk',      0),
    ('Lasagne',                           'Pasta',     0),
    ('Laks med ovnkartofler',             'Fisk',      0),
    ('Boller i karry',                    'Klassiker', 0),
    ('Grøntsagssuppe med brød',           'Vegetar',   0);
