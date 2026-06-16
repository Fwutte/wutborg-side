import {
  bad,
  bodyJson,
  cleanText,
  json,
  withErrors,
} from "../_helpers.js";

const DRAWERS = new Set(["Oksekød", "Andet", "Gris", "Kylling", "Brød", "Blandet"]);

const validateDrawer = (value) => {
  const drawer = cleanText(value, 40);
  return DRAWERS.has(drawer) ? drawer : "";
};

const amountValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(String(value).replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 && amount <= 999
    ? Math.round(amount * 100) / 100
    : NaN;
};

const formatAmount = (amount) => {
  if (amount === null || amount === undefined || amount === "") return "";
  return String(Number(amount)).replace(".", ",");
};

const quantityLabel = (amount, unit, fallback = "") => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return fallback;
  }
  const label = formatAmount(amount);
  return unit ? `${label} ${unit}` : label;
};

export const onRequestGet = withErrors(async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT id, drawer, name, quantity, amount, unit, notes
       FROM freezer_items
      ORDER BY
        CASE drawer
          WHEN 'Oksekød' THEN 1
          WHEN 'Andet' THEN 2
          WHEN 'Gris' THEN 3
          WHEN 'Kylling' THEN 4
          WHEN 'Brød' THEN 5
          WHEN 'Blandet' THEN 6
          ELSE 99
        END,
        sort_order,
        created_at,
        id`
  ).all();

  return json(results);
});

export const onRequestPost = withErrors(async ({ request, env }) => {
  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const drawer = validateDrawer(body.drawer);
  if (!drawer) return bad("Ugyldig skuffe");

  const name = cleanText(body.name, 100);
  if (!name) return bad("name mangler");

  const amount = amountValue(body.amount);
  if (Number.isNaN(amount)) return bad("amount skal være et tal mellem 0 og 999");
  const unit = cleanText(body.unit, 30);
  const quantity = quantityLabel(amount, unit, cleanText(body.quantity, 40));
  const notes = cleanText(body.notes, 160);

  const result = await env.DB.prepare(
    `INSERT INTO freezer_items
       (drawer, name, quantity, amount, unit, notes, sort_order, updated_at)
     VALUES (
       ?1,
       ?2,
       ?3,
       ?4,
       ?5,
       ?6,
       COALESCE((SELECT MAX(sort_order) + 10 FROM freezer_items WHERE drawer = ?1), 10),
       datetime('now')
     )`
  )
    .bind(drawer, name, quantity, amount, unit, notes)
    .run();

  return json({
    id: Number(result.meta.last_row_id),
    drawer,
    name,
    quantity,
    amount,
    unit,
    notes,
  });
});
