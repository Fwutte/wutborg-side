-- Gør frysermængder redigerbare som rigtige felter.

PRAGMA foreign_keys = ON;

ALTER TABLE freezer_items ADD COLUMN amount REAL;
ALTER TABLE freezer_items ADD COLUMN unit TEXT NOT NULL DEFAULT '';

UPDATE freezer_items
   SET amount = CASE
        WHEN drawer = 'Oksekød' AND name = 'hakket oksekød' THEN 14
        WHEN drawer = 'Oksekød' AND name = 'kødboller' THEN 0.25
        WHEN drawer = 'Andet' AND name = 'chili con carne grøntsager' THEN 0.5
        WHEN drawer = 'Andet' AND name = 'stenbiderrogn' THEN 5
        WHEN drawer = 'Gris' AND name = 'chorizo (fødselsdag)' THEN 10
        WHEN drawer = 'Gris' AND name = 'pepperoni' THEN 10
        WHEN drawer = 'Kylling' AND name = 'andelår' THEN 4
        WHEN drawer = 'Blandet' AND name = 'Smør' THEN 6
        WHEN drawer = 'Blandet' AND name = 'bakkedal' THEN 4
        WHEN quantity LIKE '1 x%' THEN 1
        WHEN quantity LIKE '2 x%' THEN 2
        WHEN quantity LIKE '3 x%' THEN 3
        WHEN quantity LIKE '4 x%' THEN 4
        WHEN quantity LIKE '5 x%' THEN 5
        WHEN quantity LIKE '6 x%' THEN 6
        WHEN quantity LIKE '10 x%' THEN 10
        WHEN quantity = '1' THEN 1
        WHEN quantity = '1 ps' THEN 1
        WHEN quantity = '' OR quantity IS NULL THEN 1
        ELSE 1
       END,
       unit = CASE
        WHEN drawer = 'Oksekød' AND name = 'hakket oksekød' THEN '500g'
        WHEN drawer = 'Oksekød' AND name = 'kødboller' THEN 'pose'
        WHEN drawer = 'Andet' AND name = 'majs' THEN 'ps'
        WHEN drawer = 'Andet' AND name = 'stenbiderrogn' THEN '100g'
        WHEN drawer = 'Gris' AND name = 'flæskesteg' THEN '500g'
        WHEN drawer = 'Gris' AND name = 'chorizo (fødselsdag)' THEN 'stk.'
        ELSE ''
       END
 WHERE amount IS NULL;
