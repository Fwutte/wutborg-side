import {
  bad,
  bodyJson,
  cleanText,
  json,
  withErrors,
} from "../_helpers.js";

const DRAWERS = new Set(["Oksekød", "Andet", "Gris", "Kylling", "Brød", "Blandet"]);

const validateDrawer = (value) => {
  const drawer = cleanText(value, 40);
  return DRAWERS.has(drawer) ? drawer : "";
};

export const onRequestGet = withErrors(async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT id, drawer, name, quantity, notes
       FROM freezer_items
      ORDER BY
        CASE drawer
          WHEN 'Oksekød' THEN 1
          WHEN 'Andet' THEN 2
          WHEN 'Gris' THEN 3
          WHEN 'Kylling' THEN 4
          WHEN 'Brød' THEN 5
          WHEN 'Blandet' THEN 6
          ELSE 99
        END,
        sort_order,
        created_at,
        id`
  ).all();

  return json(results);
});

export const onRequestPost = withErrors(async ({ request, env }) => {
  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const drawer = validateDrawer(body.drawer);
  if (!drawer) return bad("Ugyldig skuffe");

  const name = cleanText(body.name, 100);
  if (!name) return bad("name mangler");

  const quantity = cleanText(body.quantity, 40);
  const notes = cleanText(body.notes, 160);

  const result = await env.DB.prepare(
    `INSERT INTO freezer_items
       (drawer, name, quantity, notes, sort_order, updated_at)
     VALUES (
       ?1,
       ?2,
       ?3,
       ?4,
       COALESCE((SELECT MAX(sort_order) + 10 FROM freezer_items WHERE drawer = ?1), 10),
       datetime('now')
     )`
  )
    .bind(drawer, name, quantity, notes)
    .run();

  return json({
    id: Number(result.meta.last_row_id),
    drawer,
    name,
    quantity,
    notes,
  });
});
