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
  if (Object.hasOwn(body, "category")) {
    fields.push("category = ?");
    values.push(cleanText(body.category, 80));
  }
  if (Object.hasOwn(body, "notes")) {
    fields.push("notes = ?");
    values.push(cleanText(body.notes, 200));
  }
  if (Object.hasOwn(body, "is_favorite")) {
    const isFavorite = flag(body.is_favorite);
    if (isFavorite == null) return bad("is_favorite skal være 0 eller 1");
    fields.push("is_favorite = ?");
    values.push(isFavorite);
  }

  if (!fields.length) return bad("Ingen gyldige felter at opdatere");

  const result = await env.DB.prepare(
    `UPDATE dishes SET ${fields.join(", ")} WHERE id = ?`
  )
    .bind(...values, id)
    .run();

  if (!changes(result)) return bad("Retten blev ikke fundet", 404);
  return json({ ok: true });
});

export const onRequestDelete = withErrors(async ({ params, env }) => {
  const id = positiveId(params.id);
  if (!id) return bad("Ugyldigt id");

  const result = await env.DB.prepare("DELETE FROM dishes WHERE id = ?")
    .bind(id)
    .run();

  if (!changes(result)) return bad("Retten blev ikke fundet", 404);
  return json({ ok: true });
});
