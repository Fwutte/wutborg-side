import { authenticateRequest, unauthorized } from "./_auth.js";

export const onRequest = async (context) => {
  const pathname = new URL(context.request.url).pathname;
  if (pathname.startsWith("/api/auth/")) return context.next();

  if (!context.env?.DB) {
    return new Response(
      JSON.stringify({ error: "Databaseforbindelsen DB mangler" }),
      {
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      }
    );
  }

  const auth = await authenticateRequest(context.request, context.env);
  if (!auth) return unauthorized();

  context.data.auth = auth;
  return context.next();
};
