// Watchlist, Anthropic API proxy (Cloudflare Worker)
// ---------------------------------------------------------------
// Purpose: keep the Anthropic API key OUT of the app's client code.
// The app calls this Worker. The Worker holds the key as a secret
// and forwards the request to Anthropic. The key is never in the
// browser, so no one can view-source and steal it.
//
// What it does:
//   - only accepts POST from the Watchlist origin (blocks casual abuse)
//   - injects the Anthropic key from a Worker secret
//   - restricts to known models and caps max_tokens (cost guardrail)
//   - forwards to https://api.anthropic.com/v1/messages
//   - handles CORS so the browser app can call it
//
// Deploy is handled by Claude Code via wrangler. See wrangler.toml.
// ---------------------------------------------------------------

const ALLOWED_ORIGINS = [
  "https://thinkaboutit-more.github.io", // the live app
  "http://localhost:8000",               // local testing, safe to remove
  "http://127.0.0.1:8000",
];

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ALLOWED_MODELS = ["claude-haiku-4-5", "claude-sonnet-4-6"];
const MAX_OUTPUT_TOKENS = 2000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(allowOrigin) });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, allowOrigin);
    }

    // only the app may call this
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: "Forbidden origin" }, 403, allowOrigin);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "Server is missing ANTHROPIC_API_KEY secret" }, 500, allowOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, allowOrigin);
    }

    // cost guardrails: force a known model and cap output length
    if (!ALLOWED_MODELS.includes(body.model)) {
      body.model = "claude-haiku-4-5";
    }
    body.max_tokens = Math.min(body.max_tokens || 1000, MAX_OUTPUT_TOKENS);

    let upstream;
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return json({ error: "Upstream request failed", detail: String(e) }, 502, allowOrigin);
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors(allowOrigin), "content-type": "application/json" },
    });
  },
};

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors(origin), "content-type": "application/json" },
  });
}
