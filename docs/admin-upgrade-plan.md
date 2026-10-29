# Administration upgrade — 2026-10-28

Authorized scope: clearer publication/page context (1), movable content blocks and modern editor (3), shared opening hours/closures/prices/visit information (4), media metadata/usage/safe cleanup/own-copy import (5), page creation/templates/URLs/redirects (6).

Keep existing Access/email restrictions, private assets, content/history, and free-usage caps. Do not implement unrelated autosave, backup or hosting redesign. Do not copy confidential source/content into this repository.

Implementation lives in protected packaging extensions. Preserve the original source and old content through a backwards-compatible model wrapper. Test in isolated Workers/D1/R2, then visually in a local admin session; publish through `npm run deploy` only.

- [x] Model: blocks, shared information, page aliases, safe validation and rendering.
- [x] Admin: publication diff/context, block editor, shared forms, page manager.
- [x] Media: metadata, references, reversible trash, controlled original-source import.
- [x] Migration: preserve old content/identities and update only through revision checks/history.
- [x] Integration/security tests and mobile/browser verification.
- [x] Deploy and verify live content revision and protected endpoints.

Implementation: `model-v2.mjs`, `admin-upgrade.js/css`, `content-presentation.mjs`, `media-library.mjs`; assembled in `prepare-private-preview.mjs`, no confidential content copied to repo. Tiptap dependencies are pinned under `scripts/private-preview/editor/`; the editor bundle is served through the protected application. `publish.mjs` requires the upgrade checks alongside the existing CMS checks.

Final pre-deployment validation passed with live revision 5: existing text/media/links preserved; upgraded state is 547,230 bytes, below the unchanged limit. `migrate-online-model.mjs` runs a dry-run before deployment and applies an idempotent, history-preserving CAS upgrade afterward; `public_json`, published revision and publication date stay unchanged. CMS tests expanded to 96, upgrade tests to 84, presentation checks 940. Final browser checks covered actual Tiptap editing/bold, moving blocks, contact template/menu, rename/save, shared publication review, file rename/alt/trash/restore. No console errors. Diff comparison ignores HTML entity/attribute normalization and internal shared fallback metadata.

Completed deployment: `https://156c28fc.wutborg-side.pages.dev`. Publication passed 940 presentation checks, Workers login checks, 96 CMS checks, 84 upgrade checks and 45 live protection/homepage checks. Online model upgraded to version 2, state revision 6; published revision 5 and the published rendering were explicitly preserved, with pre-upgrade state retained in history. Local test preview stopped. Original remote media remain unchanged until the administrator chooses the own-copy import and publishes that draft.

Browser verification used isolated Miniflare/D1/R2 on port 8318 with a read-only copy of live revision 5; all UI writes affected only test data. `preview-admin.mjs --live-content` refreshes existing Wrangler authorization and reads the current content for isolated testing. Production publishing preserves the existing rendered content while upgrading the administration model and retaining the prior state in history.
