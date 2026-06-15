import {
  bad,
  bodyJson,
  cleanText,
  flag,
  isDate,
  json,
  MEALS,
  positiveId,
  withErrors,
} from "../_helpers.js";

export const onRequestPut = withErrors(async ({ params, request, env }) => {
  const date = params.date;
  if (!isDate(date)) return bad("Ugyldig dato");

  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const mealType = body.meal_type || "aftensmad";
  if (!MEALS.has(mealType)) return bad("Ugyldig meal_type");

  const dishName = cleanText(body.dish_name, 120);
  if (!dishName) return bad("dish_name mangler");

  const dishId = body.dish_id == null ? null : positiveId(body.dish_id);
  if (body.dish_id != null && dishId == null) return bad("Ugyldig dish_id");

  const isDone = body.is_done == null ? 0 : flag(body.is_done);
  if (isDone == null) return bad("is_done skal være 0 eller 1");

  await env.DB.prepare(
    `INSERT INTO meal_plan
       (plan_date, meal_type, dish_id, dish_name, cook, notes, is_done, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
     ON CONFLICT(plan_date, meal_type) DO UPDATE SET
       dish_id = ?3,
       dish_name = ?4,
       cook = ?5,
       notes = ?6,
       is_done = ?7,
       updated_at = datetime('now')`
  )
    .bind(
      date,
      mealType,
      dishId,
      dishName,
      cleanText(body.cook, 60),
      cleanText(body.notes, 200),
      isDone
    )
    .run();

  return json({ ok: true });
});

export const onRequestDelete = withErrors(async ({ params, request, env }) => {
  const date = params.date;
  if (!isDate(date)) return bad("Ugyldig dato");

  const mealType =
    new URL(request.url).searchParams.get("meal_type") || "aftensmad";
  if (!MEALS.has(mealType)) return bad("Ugyldig meal_type");

  await env.DB.prepare(
    "DELETE FROM meal_plan WHERE plan_date = ? AND meal_type = ?"
  )
    .bind(date, mealType)
    .run();

  return json({ ok: true });
});
