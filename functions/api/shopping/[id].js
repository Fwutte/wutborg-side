import {
  bad,
  bodyJson,
  changes,
  cleanText,
  flag,
  json,
  positiveId,
  withErrors,
} from "../_helpers.js";

export const onRequestPatch = withErrors(async ({ params, request, env }) => {
  const id = positiveId(params.id);
  if (!id) return bad("Ugyldigt id");

  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const fields = [];
  const values = [];

  if (Object.hasOwn(body, "name")) {
    const name = cleanText(body.name, 80);
    if (!name) return bad("name må ikke være tom");
    fields.push("name = ?");
    values.push(name);
  }
  if (Object.hasOwn(body, "quantity")) {
    fields.push("quantity = ?");
    values.push(cleanText(body.quantity, 60));
  }
  if (Object.hasOwn(body, "is_checked")) {
    const isChecked = flag(body.is_checked);
    if (isChecked == null) return bad("is_checked skal være 0 eller 1");
    fields.push("is_checked = ?");
    values.push(isChecked);
  }

  if (!fields.length) return bad("Ingen gyldige felter at opdatere");

  const result = await env.DB.prepare(
    `UPDATE shopping_items SET ${fields.join(", ")} WHERE id = ?`
  )
    .bind(...values, id)
    .run();

  if (!changes(result)) return bad("Varen blev ikke fundet", 404);
  return json({ ok: true });
});

export const onRequestDelete = withErrors(async ({ params, env }) => {
  const id = positiveId(params.id);
  if (!id) return bad("Ugyldigt id");

  const result = await env.DB.prepare(
    "DELETE FROM shopping_items WHERE id = ?"
  )
    .bind(id)
    .run();

  if (!changes(result)) return bad("Varen blev ikke fundet", 404);
  return json({ ok: true });
});
