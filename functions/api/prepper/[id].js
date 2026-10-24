import { bad, bodyJson, changes, json, positiveId, withErrors } from "../_helpers.js";
import { fields } from "./_fields.js";

export const onRequestPatch = withErrors(async ({ params, request, env }) => {
  const id = positiveId(params.id);
  if (!id) return bad("Ugyldigt id");
  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");
  const { values, error } = fields(body);
  if (error) return bad(error);
  const columns = Object.keys(values);
  if (!columns.length) return bad("Ingen felter at gemme");
  const result = await env.DB.prepare(
    `UPDATE prepper_items SET ${columns.map(key => `${key} = ?`).join(", ")},
       ${Object.hasOwn(values, "is_ready") ? `checked_at = ${values.is_ready ? "datetime('now')" : "NULL"},` : ""}
       updated_at = datetime('now') WHERE id = ?`
  ).bind(...Object.values(values), id).run();
  if (!changes(result)) return bad("Posten blev ikke fundet", 404);
  return json(await env.DB.prepare("SELECT * FROM prepper_items WHERE id = ?").bind(id).first());
});

export const onRequestDelete = withErrors(async ({ params, env }) => {
  const id = positiveId(params.id);
  if (!id) return bad("Ugyldigt id");
  const result = await env.DB.prepare("DELETE FROM prepper_items WHERE id = ?").bind(id).run();
  if (!changes(result)) return bad("Posten blev ikke fundet", 404);
  return json({ ok: true });
});
