import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Git builds contain only the public site. Never let one replace the combined CMS deployment.
export async function protectProductionDeployments() {
  const credentials = await fs.readFile('C:/Users/lotte/AppData/Roaming/xdg.config/.wrangler/config/default.toml', 'utf8');
  const token = credentials.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
  if (!token) throw new Error('Existing Wrangler authorization is unavailable.');
  const endpoint = 'https://api.cloudflare.com/client/v4/accounts/98a6d302d1e0fdbc93ac71aeb0d6606c/pages/projects/wutborg-side';
  async function call(method = 'GET', body) {
    const response = await fetch(endpoint, {
      method,
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('Production deployment guard failed (HTTP ' + response.status + ').');
    return data.result;
  }
  const before = await call();
  assert.equal(before.name, 'wutborg-side');
  assert.equal(before.source?.type, 'github');
  assert.equal(before.source.config.repo_name, 'wutborg-side');
  const config = { ...before.source.config, production_deployments_enabled: false };
  if (before.source.config.production_deployments_enabled !== false) {
    await call('PATCH', { source: { type: before.source.type, config } });
  }
  const after = await call();
  assert.equal(after.source.config.production_deployments_enabled, false);
  for (const [key, value] of Object.entries(before.source.config)) {
    if (key !== 'production_deployments_enabled') assert.deepEqual(after.source.config[key], value, 'Unrelated source setting changed: ' + key);
  }
  assert.deepEqual(after.deployment_configs, before.deployment_configs, 'Production bindings changed');
  assert.deepEqual(after.build_config, before.build_config, 'Build settings changed');
  console.log(JSON.stringify({ automaticProductionDeployments: false, previewSettingsPreserved: true, bindingsPreserved: true }));
}
