import { clearSession } from "../_auth.js";
import { withErrors } from "../_helpers.js";

export const onRequestPost = withErrors(async ({ request, env }) =>
  clearSession(request, env)
);
