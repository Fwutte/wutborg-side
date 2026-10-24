import { cleanText, flag, isDate } from "../_helpers.js";

export const CATEGORIES = ["Vand", "Mad", "Strøm og lys", "Varme", "Hygiejne", "Sundhed", "Praktisk"];

export function quantity(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return NaN;
  const text = String(value).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN;
  const number = Number(text);
  return Number.isFinite(number) && number <= 1000000 ? number : NaN;
}

// PATCH writes only supplied columns, so changing a quantity on one device
// cannot undo a readiness check made on another device.
export function fields(body, creating = false) {
  const values = {};
  const supplied = key => creating || Object.hasOwn(body, key);
  if (supplied("name")) {
    values.name = cleanText(body.name, 100);
    if (!values.name) return { error: "Skriv et navn" };
  }
  if (supplied("category")) {
    values.category = cleanText(body.category, 40);
    if (!CATEGORIES.includes(values.category)) return { error: "Vælg en gyldig kategori" };
  }
  for (const key of ["amount", "target_amount"]) {
    if (!supplied(key)) continue;
    values[key] = quantity(body[key]);
    if (Number.isNaN(values[key])) return { error: "Mængden skal være mellem 0 og 1.000.000 med højst to decimaler" };
  }
  for (const [key, length, fallback] of [["unit", 30, ""], ["notes", 500, ""], ["location", 100, ""], ["check_label", 40, "Klargjort"]]) {
    if (supplied(key)) values[key] = cleanText(body[key], length) || fallback;
  }
  if (supplied("expires_on")) {
    const date = body.expires_on;
    values.expires_on = date == null || date === "" ? null : date;
    if (values.expires_on !== null && !isDate(values.expires_on)) return { error: "Vælg en gyldig dato" };
  }
  if (supplied("review_days")) {
    const days = body.review_days;
    values.review_days = days == null || days === "" ? null : days;
    if (values.review_days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      return { error: "Kontrolintervallet skal være et helt antal dage fra 1 til 3650" };
    }
  }
  if (supplied("is_ready")) {
    values.is_ready = creating && body.is_ready === undefined ? 0 : flag(body.is_ready);
    if (values.is_ready === null) return { error: "Ugyldig klar-status" };
  }
  return { values };
}
