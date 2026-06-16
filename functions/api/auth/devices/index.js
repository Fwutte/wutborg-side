import { registrationAccess } from "../../_auth.js";
import { bad, json, withErrors } from "../../_helpers.js";

export const onRequestGet = withErrors(async ({ request, env }) => {
  if (!(await registrationAccess(request, env)).allowed) {
    return bad(
      "Enheder kan kun administreres med godkendt IP eller opsætningskode",
      403
    );
  }

  const { results } = await env.DB.prepare(
    `SELECT id, name, created_at, last_used_at
       FROM auth_devices
      WHERE revoked_at IS NULL
      ORDER BY created_at DESC`
  ).all();

  return json(results);
});
