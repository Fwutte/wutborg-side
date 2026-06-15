import {
  base64UrlToBytes,
  createSession,
  loginMessage,
  responseWithSession,
} from "../_auth.js";
import { bad, bodyJson, withErrors } from "../_helpers.js";

const encoder = new TextEncoder();

export const onRequestPost = withErrors(async ({ request, env }) => {
  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const deviceId =
    typeof body.device_id === "string" ? body.device_id : "";
  const challengeId =
    typeof body.challenge_id === "string" ? body.challenge_id : "";
  const signature = base64UrlToBytes(body.signature);
  if (!deviceId || !challengeId || !signature) {
    return bad("Loginoplysninger mangler");
  }

  const device = await env.DB.prepare(
    `SELECT id, name, public_key_jwk
       FROM auth_devices
      WHERE id = ? AND revoked_at IS NULL`
  )
    .bind(deviceId)
    .first();
  if (!device) return bad("Enheden er ikke godkendt", 404);

  const challenge = await env.DB.prepare(
    `DELETE FROM auth_challenges
      WHERE id = ?
        AND device_id = ?
        AND expires_at > datetime('now')
      RETURNING challenge`
  )
    .bind(challengeId, deviceId)
    .first();
  if (!challenge) return bad("Engangskoden er udløbet", 401);

  let publicKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "jwk",
      JSON.parse(device.public_key_jwk),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch {
    return bad("Enhedens public key er ugyldig", 500);
  }

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    encoder.encode(loginMessage(deviceId, challengeId, challenge.challenge))
  );
  if (!valid) return bad("Enhedens signatur kunne ikke godkendes", 401);

  const token = await createSession(env, deviceId);
  return responseWithSession(
    request,
    { ok: true, device_id: deviceId, device_name: device.name },
    token
  );
});
