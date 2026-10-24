import { bad, bodyJson, json, withErrors } from "../_helpers.js";
import { fields } from "./_fields.js";

export const onRequestGet = withErrors(async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT id, category, name, amount, target_amount, unit, check_label, is_ready, notes,
            location, expires_on, review_days, checked_at
       FROM prepper_items ORDER BY sort_order, id`
  ).all();
  return json(results);
});

export const onRequestPost = withErrors(async ({ request, env }) => {
  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");
  const { values, error } = fields(body, true);
  if (error) return bad(error);
  const columns = Object.keys(values);
  const result = await env.DB.prepare(
    `INSERT INTO prepper_items (${columns.join(", ")}, checked_at, sort_order)
     VALUES (${columns.map(() => "?").join(", ")},
       ${values.is_ready ? "datetime('now')" : "NULL"},
       COALESCE((SELECT MAX(sort_order) + 10 FROM prepper_items), 10))`
  ).bind(...Object.values(values)).run();
  const item = await env.DB.prepare("SELECT * FROM prepper_items WHERE id = ?")
    .bind(Number(result.meta.last_row_id)).first();
  return json(item, 201);
});
