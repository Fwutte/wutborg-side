import {
  bad,
  bodyJson,
  cleanText,
  json,
  withErrors,
} from "../_helpers.js";

export const onRequestGet = withErrors(async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT id, name, quantity, is_checked
       FROM shopping_items
      WHERE id >= ?
      ORDER BY is_checked, created_at, id`
  )
    .bind(1)
    .all();

  return json(results);
});

export const onRequestPost = withErrors(async ({ request, env }) => {
  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const name = cleanText(body.name, 80);
  if (!name) return bad("name mangler");
  const quantity = cleanText(body.quantity, 60);

  const result = await env.DB.prepare(
    `INSERT INTO shopping_items (name, quantity, is_checked)
     VALUES (?, ?, ?)`
  )
    .bind(name, quantity, 0)
    .run();

  return json({
    id: Number(result.meta.last_row_id),
    name,
    quantity,
    is_checked: 0,
  });
});

export const onRequestDelete = withErrors(async ({ env }) => {
  await env.DB.prepare(
    "DELETE FROM shopping_items WHERE is_checked = ?"
  )
    .bind(1)
    .run();

  return json({ ok: true });
});
