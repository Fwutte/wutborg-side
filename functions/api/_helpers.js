export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export const bad = (message, status = 400) => json({ error: message }, status);

export const isDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export const MEALS = new Set(["morgenmad", "frokost", "aftensmad"]);

export const bodyJson = async (request) => {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body : null;
};

export const cleanText = (value, maxLength) =>
  String(value ?? "").trim().slice(0, maxLength);

export const positiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const flag = (value) => {
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  return null;
};

export const changes = (result) => Number(result?.meta?.changes ?? 0);

export const withErrors = (handler) => async (context) => {
  try {
    if (!context.env?.DB) return bad("Databaseforbindelsen DB mangler", 500);
    return await handler(context);
  } catch (error) {
    console.error("Madplan API-fejl", error);
    return bad("Der opstod en databasefejl", 500);
  }
};

/* ---------------- fryser-hjælpere ---------------- */
/* Centraliseret, så freezer/index.js og freezer/[id].js deler én kilde. */
export const FREEZER_DRAWERS = [
  "Oksekød",
  "Andet",
  "Gris",
  "Kylling",
  "Brød",
  "Blandet",
];

export const validateDrawer = (value) => {
  const drawer = cleanText(value, 40);
  return FREEZER_DRAWERS.includes(drawer) ? drawer : "";
};

export const amountValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(String(value).replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 && amount <= 999
    ? Math.round(amount * 100) / 100
    : NaN;
};

