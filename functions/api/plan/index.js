import { bad, isDate, json, withErrors } from "../_helpers.js";

export const onRequestGet = withErrors(async ({ request, env }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!isDate(from) || !isDate(to)) return bad("from/to skal være YYYY-MM-DD");
  if (from > to) return bad("from skal ligge før eller på to");

  const { results } = await env.DB.prepare(
    `SELECT plan_date, meal_type, dish_id, dish_name, cook, notes, is_done
       FROM meal_plan
      WHERE plan_date BETWEEN ? AND ?
      ORDER BY plan_date, meal_type`
  )
    .bind(from, to)
    .all();

  return json(results);
});
