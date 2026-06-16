import { json } from "./_helpers.js";

const COOKIE_NAME = "madplan_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

const bytesToBase64Url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

export const base64UrlToBytes = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

export const randomToken = (size = 32) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

const tokenHash = async (token) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

const cookieValue = (request) => {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return value.join("=");
  }
  return "";
};

const configuredIps = (env) =>
  String(env.MADPLAN_TRUSTED_IPS || "")
    .split(/[\s,;]+/)
    .map((ip) => ip.trim())
    .filter(Boolean);

export const setupKeyConfigured = (env) =>
  String(env.MADPLAN_SETUP_KEY || "").trim().length >= 16;

const digestText = async (value) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(`madplan:${value}`))
  );

const timingSafeEqual = (left, right) => {
  if (left.byteLength !== right.byteLength) return false;

  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
};

export const setupKeyValid = async (env, value) => {
  const configuredKey = String(env.MADPLAN_SETUP_KEY || "").trim();
  const suppliedKey = String(value || "").trim();
  if (configuredKey.length < 16 || !suppliedKey) return false;

  const [configuredDigest, suppliedDigest] = await Promise.all([
    digestText(configuredKey),
    digestText(suppliedKey),
  ]);

  return timingSafeEqual(configuredDigest, suppliedDigest);
};

export const networkState = (request, env) => {
  const url = new URL(request.url);
  const cloudflareIp = request.headers.get("CF-Connecting-IP");
  const local =
    !cloudflareIp &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]");
  const ip = cloudflareIp || request.headers.get("x-real-ip") || "";
  const allowedIps = configuredIps(env);

  return {
    ip,
    local,
    configured: allowedIps.length > 0 || setupKeyConfigured(env),
    trusted: local || (Boolean(ip) && allowedIps.includes(ip)),
  };
};

export const setupKeyFromRequest = (request) =>
  request.headers.get("x-madplan-setup-key") || "";

export const registrationAccess = async (request, env, setupKey = "") => {
  const network = networkState(request, env);
  if (network.trusted) return { allowed: true, via: "trusted_ip", network };
  if (await setupKeyValid(env, setupKey || setupKeyFromRequest(request))) {
    return { allowed: true, via: "setup_key", network };
  }
  return { allowed: false, via: null, network };
};

export const sessionForRequest = async (request, env) => {
  const token = cookieValue(request);
  if (!token || token.length > 128) return null;

  const hash = await tokenHash(token);
  return env.DB.prepare(
    `SELECT d.id AS device_id, d.name AS device_name
       FROM auth_sessions s
       JOIN auth_devices d ON d.id = s.device_id
      WHERE s.token_hash = ?
        AND s.expires_at > datetime('now')
        AND d.revoked_at IS NULL`
  )
    .bind(hash)
    .first();
};

export const authenticateRequest = async (request, env) => {
  const network = networkState(request, env);
  if (network.trusted) {
    return { via: "trusted_ip", device_id: null, device_name: null };
  }

  const session = await sessionForRequest(request, env);
  return session
    ? {
        via: "device",
        device_id: session.device_id,
        device_name: session.device_name,
      }
    : null;
};

export const createSession = async (env, deviceId) => {
  const token = randomToken();
  const hash = await tokenHash(token);

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM auth_sessions WHERE expires_at <= datetime('now')"
    ),
    env.DB.prepare("DELETE FROM auth_sessions WHERE device_id = ?").bind(
      deviceId
    ),
    env.DB.prepare(
      `INSERT INTO auth_sessions (token_hash, device_id, expires_at)
       VALUES (?, ?, datetime('now', '+30 days'))`
    ).bind(hash, deviceId),
    env.DB.prepare(
      `UPDATE auth_devices
          SET last_used_at = datetime('now')
        WHERE id = ?`
    ).bind(deviceId),
  ]);

  return token;
};

export const responseWithSession = (request, data, token, status = 200) => {
  const response = json(data, status);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append(
    "set-cookie",
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; SameSite=Strict${secure}`
  );
  return response;
};

export const clearSession = async (request, env) => {
  const token = cookieValue(request);
  if (token && token.length <= 128) {
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(await tokenHash(token))
      .run();
  }

  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const response = json({ ok: true });
  response.headers.append(
    "set-cookie",
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`
  );
  return response;
};

export const unauthorized = () =>
  json(
    {
      error: "Denne enhed er ikke godkendt",
      code: "AUTH_REQUIRED",
    },
    401
  );

export const loginMessage = (deviceId, challengeId, challenge) =>
  `MADPLAN-AUTH-V1\n${deviceId}\n${challengeId}\n${challenge}`;
