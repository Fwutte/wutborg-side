import {
  createSession,
  registrationAccess,
  responseWithSession,
} from "../_auth.js";
import {
  bad,
  bodyJson,
  cleanText,
  withErrors,
} from "../_helpers.js";

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const validPublicKey = (key) =>
  key &&
  typeof key === "object" &&
  key.kty === "EC" &&
  key.crv === "P-256" &&
  typeof key.x === "string" &&
  typeof key.y === "string";

export const onRequestPost = withErrors(async ({ request, env }) => {
  const body = await bodyJson(request);
  if (!body) return bad("Body skal være gyldig JSON");

  const access = await registrationAccess(request, env, body.setup_key);
  if (!access.allowed) {
    return bad(
      "Nye enheder kræver enten godkendt IP eller korrekt opsætningskode",
      403
    );
  }

  const deviceId = body.device_id;
  const name = cleanText(body.name, 60);
  if (!isUuid(deviceId)) return bad("Ugyldigt device_id");
  if (!name) return bad("Enhedsnavn mangler");
  if (!validPublicKey(body.public_key)) return bad("Ugyldig public key");

  try {
    await crypto.subtle.importKey(
      "jwk",
      body.public_key,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch {
    return bad("Public key kunne ikke læses");
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM auth_devices WHERE id = ?"
  )
    .bind(deviceId)
    .first();
  if (existing) return bad("Enheden er allerede registreret", 409);

  await env.DB.prepare(
    `INSERT INTO auth_devices (id, name, public_key_jwk)
     VALUES (?, ?, ?)`
  )
    .bind(deviceId, name, JSON.stringify(body.public_key))
    .run();

  const token = await createSession(env, deviceId);
  return responseWithSession(
    request,
    { ok: true, device_id: deviceId, device_name: name },
    token,
    201
  );
});
