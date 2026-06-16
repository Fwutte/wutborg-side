import { registrationAccess } from "../../_auth.js";
import { bad, changes, json, withErrors } from "../../_helpers.js";

export const onRequestDelete = withErrors(
  async ({ params, request, env }) => {
    if (!(await registrationAccess(request, env)).allowed) {
      return bad(
        "Enheder kan kun administreres med godkendt IP eller opsætningskode",
        403
      );
    }

    const id = typeof params.id === "string" ? params.id : "";
    if (!id || id.length > 64) return bad("Ugyldigt enheds-id");

    const result = await env.DB.prepare(
      `UPDATE auth_devices
          SET revoked_at = datetime('now')
        WHERE id = ? AND revoked_at IS NULL`
    )
      .bind(id)
      .run();

    if (!changes(result)) return bad("Enheden blev ikke fundet", 404);

    await env.DB.batch([
      env.DB.prepare("DELETE FROM auth_sessions WHERE device_id = ?").bind(id),
      env.DB.prepare("DELETE FROM auth_challenges WHERE device_id = ?").bind(
        id
      ),
    ]);

    return json({ ok: true });
  }
);
