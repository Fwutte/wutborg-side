import {
  amountValue,
  bad,
  bodyJson,
  changes,
  cleanText,
  json,
  validateDrawer,
  withErrors,
} from "../_helpers.js";

export const onRequestGet = withErrors(async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT id, drawer, name, amount, unit, notes
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

  const amount = amountValue(body.amount);
  if (Number.isNaN(amount)) return bad("amount skal være et tal mellem 0 og 999");
  const unit = cleanText(body.unit, 30);
  const notes = cleanText(body.notes, 160);

  const result = await env.DB.prepare(
    `INSERT INTO freezer_items
       (drawer, name, amount, unit, notes, sort_order, updated_at)
     VALUES (
       ?1,
       ?2,
       ?3,
       ?4,
       ?5,
       COALESCE((SELECT MAX(sort_order) + 10 FROM freezer_items WHERE drawer = ?1), 10),
       datetime('now')
     )`
  )
    .bind(drawer, name, amount, unit, notes)
    .run();

  return json({
    id: Number(result.meta.last_row_id),
    drawer,
    name,
    amount,
    unit,
    notes,
  });
});

export const onRequestDelete = withErrors(async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("empty") !== "1") {
    return bad("Angiv empty=1 for at rydde tomme linjer", 400);
  }
  const result = await env.DB.prepare(
    "DELETE FROM freezer_items WHERE amount = 0"
  ).run();
  return json({ ok: true, removed: changes(result) });
});
