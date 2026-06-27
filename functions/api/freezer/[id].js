import {
  amountValue,
  bad,
  bodyJson,
  changes,
  cleanText,
  json,
  positiveId,
  quantityLabel,
  validateDrawer,
  withErrors,
} from "../_helpers.js";

export const onRequestPatch = withErrors(async ({ params, request, env }) => {
  const id = positiveId(params.id);
  if (!id) return bad("Ugyldigt id");

  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const existing = await env.DB.prepare(
    `SELECT drawer, name, amount, unit, notes
       FROM freezer_items
      WHERE id = ?`
  )
    .bind(id)
    .first();

  if (!existing) return bad("Tingen blev ikke fundet", 404);

  const drawer = Object.hasOwn(body, "drawer")
    ? validateDrawer(body.drawer)
    : existing.drawer;
  if (!drawer) return bad("Ugyldig skuffe");

  const name = Object.hasOwn(body, "name")
    ? cleanText(body.name, 100)
    : existing.name;
  if (!name) return bad("name må ikke være tom");

  const amount = Object.hasOwn(body, "amount")
    ? amountValue(body.amount)
    : existing.amount;
  if (Number.isNaN(amount)) return bad("amount skal være et tal mellem 0 og 999");

  const unit = Object.hasOwn(body, "unit")
    ? cleanText(body.unit, 30)
    : existing.unit || "";
  const notes = Object.hasOwn(body, "notes")
    ? cleanText(body.notes, 160)
    : existing.notes || "";
  const quantity = quantityLabel(amount, unit);

  await env.DB.prepare(
    `UPDATE freezer_items
        SET drawer = ?,
            name = ?,
            amount = ?,
            unit = ?,
            notes = ?,
            updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(drawer, name, amount, unit, notes, id)
    .run();

  return json({ ok: true });
});

export const onRequestDelete = withErrors(async ({ params, env }) => {
  const id = positiveId(params.id);
  if (!id) return bad("Ugyldigt id");

  const result = await env.DB.prepare(
    "DELETE FROM freezer_items WHERE id = ?"
  )
    .bind(id)
    .run();

  if (!changes(result)) return bad("Tingen blev ikke fundet", 404);
  return json({ ok: true });
});
