import {
  bad,
  bodyJson,
  cleanText,
  json,
  withErrors,
} from "../_helpers.js";

export const onRequestGet = withErrors(async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT id, name, category, is_favorite
       FROM dishes
      WHERE id >= ?
      ORDER BY is_favorite DESC, name COLLATE NOCASE`
  )
    .bind(1)
    .all();

  const collator = new Intl.Collator("da", { sensitivity: "base" });
  results.sort(
    (a, b) =>
      Number(b.is_favorite) - Number(a.is_favorite) ||
      collator.compare(a.name, b.name)
  );

  return json(results);
});

export const onRequestPost = withErrors(async ({ request, env }) => {
  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const name = cleanText(body.name, 80);
  if (!name) return bad("name mangler");
  const category = cleanText(body.category, 80);

  const result = await env.DB.prepare(
    `INSERT INTO dishes (name, category, is_favorite)
     VALUES (?, ?, ?)`
  )
    .bind(name, category, 0)
    .run();

  return json({
    id: Number(result.meta.last_row_id),
    name,
    category,
    is_favorite: 0,
  });
});
