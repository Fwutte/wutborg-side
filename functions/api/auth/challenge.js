import { randomToken } from "../_auth.js";
import { bad, bodyJson, json, withErrors } from "../_helpers.js";

export const onRequestPost = withErrors(async ({ request, env }) => {
  const body = await bodyJson(request);
  const deviceId =
    body && typeof body.device_id === "string" ? body.device_id : "";
  if (!deviceId || deviceId.length > 64) return bad("device_id mangler");

  const device = await env.DB.prepare(
    `SELECT id
       FROM auth_devices
      WHERE id = ? AND revoked_at IS NULL`
  )
    .bind(deviceId)
    .first();
  if (!device) return bad("Enheden er ikke godkendt", 404);

  const challengeId = crypto.randomUUID();
  const challenge = randomToken();

  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenges WHERE device_id = ?").bind(
      deviceId
    ),
    env.DB.prepare(
      `INSERT INTO auth_challenges (id, device_id, challenge, expires_at)
       VALUES (?, ?, ?, datetime('now', '+5 minutes'))`
    ).bind(challengeId, deviceId, challenge),
  ]);

  return json({
    challenge_id: challengeId,
    challenge,
  });
});
