import {
  networkState,
  sessionForRequest,
  setupKeyConfigured,
} from "../_auth.js";
import { json, withErrors } from "../_helpers.js";

export const onRequestGet = withErrors(async ({ request, env }) => {
  const network = networkState(request, env);
  const session = await sessionForRequest(request, env);
  const hasSetupKey = setupKeyConfigured(env);

  if (session) {
    return json({
      authenticated: true,
      via: "device",
      device_id: session.device_id,
      device_name: session.device_name,
      can_register: network.trusted,
      setup_key_configured: hasSetupKey,
      configured: network.configured || network.local,
      current_ip: network.ip,
    });
  }

  return json({
    authenticated: network.trusted,
    via: network.trusted ? "trusted_ip" : null,
    device_id: null,
    device_name: null,
    can_register: network.trusted,
    setup_key_configured: hasSetupKey,
    configured: network.configured || network.local,
    current_ip: network.ip,
  });
});
