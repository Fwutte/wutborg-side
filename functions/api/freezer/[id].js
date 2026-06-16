import {
  bad,
  bodyJson,
  changes,
  cleanText,
  json,
  positiveId,
  withErrors,
} from "../_helpers.js";

const DRAWERS = new Set(["Oksekød", "Andet", "Gris", "Kylling", "Brød", "Blandet"]);

const validateDrawer = (value) => {
  const drawer = cleanText(value, 40);
  return DRAWERS.has(drawer) ? drawer : "";
};

export const onRequestPatch = withErrors(async ({ params, request, env }) => {
  const id = positiveId(params.id);
  if (!id) return bad("Ugyldigt id");

  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const fields = [];
  const values = [];

  if (Object.hasOwn(body, "drawer")) {
    const drawer = validateDrawer(body.drawer);
    if (!drawer) return bad("Ugyldig skuffe");
    fields.push("drawer = ?");
    values.push(drawer);
  }

  if (Object.hasOwn(body, "name")) {
    const name = cleanText(body.name, 100);
    if (!name) return bad("name må ikke være tom");
    fields.push("name = ?");
    values.push(name);
  }

  if (Object.hasOwn(body, "quantity")) {
    fields.push("quantity = ?");
    values.push(cleanText(body.quantity, 40));
  }

  if (Object.hasOwn(body, "notes")) {
    fields.push("notes = ?");
    values.push(cleanText(body.notes, 160));
  }

  if (!fields.length) return bad("Ingen gyldige felter at opdatere");
  fields.push("updated_at = datetime('now')");

  const result = await env.DB.prepare(
    `UPDATE freezer_items SET ${fields.join(", ")} WHERE id = ?`
  )
    .bind(...values, id)
    .run();

  if (!changes(result)) return bad("Tingen blev ikke fundet", 404);
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
