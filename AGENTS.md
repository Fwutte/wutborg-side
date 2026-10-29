# Production publishing

The live Pages project includes a protected online CMS at `/oenskelandet`.
Ordinary Git/root deployments omit that application and replace its bindings.
Automatic GitHub production deployments are disabled to prevent recurrence.

For every production update use `npm run deploy` from this checkout. It builds
the public site and protected CMS together, preserves existing bindings and
online content, tests authentication and the CMS, and guards against automatic
GitHub production deployments. `npm run deploy:check` performs validation only.
Never deploy the repository root directly, re-enable automatic production
deployments, or roll back the public site alone while this workflow is in use.

Read `scripts/private-preview/README.md` before changing or deploying the CMS.
Keep email login and the exact allowlist. Never copy or commit the confidential
source project at `C:/Codex/oenskelandet` into this repository or public assets.
The authoritative content is online in D1; never overwrite it with local seeds.
