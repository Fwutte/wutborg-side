const decode = value => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)), ch => ch.charCodeAt(0));
};

// Header and cookie tokens receive the same signature and identity checks.
export async function authenticate(request, env = {}, fetchKeys = fetch) {
  try {
    const issuer = String(env.PRIVATE_PREVIEW_ISSUER || '').replace(/\/$/, '');
    const audience = String(env.PRIVATE_PREVIEW_AUDIENCE || '').trim();
    const emails = String(env.PRIVATE_PREVIEW_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !audience || !emails.length || emails.length > 10) return false;
    const cookie = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith('CF_Authorization='));
    const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookie?.slice('CF_Authorization='.length) || '';
    if (!token || token.length > 16384) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200) return false;
    if (claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(audience)) return false;
    if (!Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 30) return false;
    if (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now)) return false;
    if (typeof claims.email !== 'string' || !emails.includes(claims.email.toLowerCase()) || !claims.sub || claims.type !== 'app') return false;
    // Workers supports manual/follow, not redirect:error. Never follow key redirects.
    const response = await fetchKeys(issuer + '/cdn-cgi/access/certs', { signal: AbortSignal.timeout(5000), redirect: 'manual' });
    if (!response.ok) return false;
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 131072) { await reader.cancel(); return false; }
      chunks.push(value);
    }
    const buffer = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    const { keys } = JSON.parse(new TextDecoder().decode(buffer));
    const jwk = Array.isArray(keys) && keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])) ? claims : null;
  } catch { return false; }
}

export async function authorized(request, env = {}, fetchKeys = fetch) {
  return Boolean(await authenticate(request, env, fetchKeys));
}
