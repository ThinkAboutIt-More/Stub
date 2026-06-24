# Watchlist proxy, deploy notes

This is a Cloudflare Worker that holds the Anthropic API key server-side so it never sits in the app's public client code. The app calls this Worker; the Worker calls Anthropic.

## Who does what

**Claude Code does all of this:**
1. `npm install -g wrangler` (if not installed)
2. From this `watchlist-proxy/` folder: `wrangler deploy`
3. `wrangler secret put ANTHROPIC_API_KEY` and set the key value
4. Take the deployed URL (looks like `https://watchlist-proxy.<your-subdomain>.workers.dev`) and wire the app to call it.
5. In `stub.jsx`, point all Anthropic calls at the Worker URL instead of `https://api.anthropic.com/v1/messages`, and send NO `x-api-key` header (the Worker adds it). The request body stays the same: `{ model, max_tokens, messages, system? }`.

**The one thing that needs you (Ary), because it's your account:**
- A Cloudflare account (free) must exist, and you must provide a Cloudflare API token with Workers edit permissions.
- You also provide the Anthropic key value when Claude Code runs the `secret put` step (or hand the key to Claude Code to paste).

## How the app calls it

```js
// before (key exposed in client, do not do this):
// fetch("https://api.anthropic.com/v1/messages", { headers: { "x-api-key": KEY, ... }})

// after (key hidden in the Worker):
const res = await fetch("https://watchlist-proxy.<your-subdomain>.workers.dev", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model: "claude-haiku-4-5",      // or claude-sonnet-4-6 for reasoning
    max_tokens: 1000,
    messages: [{ role: "user", content: "..." }]
  })
});
const data = await res.json();
```

## Guardrails already built in
- Only requests from the Watchlist origin are accepted.
- Only `claude-haiku-4-5` and `claude-sonnet-4-6` are allowed.
- `max_tokens` is capped at 2000.
- Still set a low monthly spend cap on the Anthropic account as the final backstop.

## Note on origin protection
The origin allowlist stops casual browser abuse but a determined attacker can spoof the Origin header from a non-browser client. The real backstop is the Anthropic spend cap. If this ever matters more, add Cloudflare rate limiting (free tier covers light personal use).
