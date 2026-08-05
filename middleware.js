// Site-wide password gate (Vercel Edge Middleware). Runs before every request
// and, until a valid auth cookie is present, serves a password screen instead
// of the agenda / API / event pages.
//
// Password: from the SITE_PASSWORD env var, defaulting to "sonae". The cookie
// stores a SHA-256 token (never the password itself). To keep the password out
// of this (public) repo, set SITE_PASSWORD in the Vercel project settings.

import { next } from "@vercel/edge";

const COOKIE = "lex_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function tokenFor(pw) {
  const data = new TextEncoder().encode(`sonae-lex2026::${pw}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function loginPage(error) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sonae LEX2026 — Enter password</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0b1014;--card:#121a21;--panel:#0f171d;--text:#e6edf3;--muted:#8b949e;--border:#243038;--accent:#2ea1df;
    --fd:"Fraunces",Georgia,serif;--fb:"Inter Tight",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    --fm:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;color-scheme:dark;}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:var(--bg);color:var(--text);font-family:var(--fb);padding:24px;-webkit-font-smoothing:antialiased}
  .box{width:100%;max-width:360px;background:var(--card);border:1px solid var(--border);border-radius:16px;
    padding:26px 24px;box-shadow:0 24px 60px -30px rgba(0,0,0,.8);display:flex;flex-direction:column;gap:12px}
  .brand{align-self:flex-start;background:#fff;border-radius:9px;padding:6px 12px 7px;line-height:1;
    font-family:ui-rounded,"SF Pro Rounded","Segoe UI",var(--fb);font-weight:700;font-size:1.1rem;
    letter-spacing:-.02em;margin-bottom:4px;user-select:none}
  .brand .a{color:#0a1a9b}.brand .b{color:#2f80e4}
  h1{font-family:var(--fd);font-weight:500;font-size:1.4rem;margin:0;letter-spacing:-.01em}
  .sub{color:var(--muted);font-size:.85rem;margin:0 0 4px}
  input{width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--border);
    background:var(--panel);color:var(--text);font-family:var(--fb);font-size:1rem}
  input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
  button{width:100%;padding:11px;border:0;border-radius:10px;background:var(--accent);color:#04121a;
    font-weight:700;font-size:.95rem;cursor:pointer;font-family:var(--fb)}
  button:hover{filter:brightness(1.06)}
  .err{color:#ec4899;font-size:.8rem;font-family:var(--fm)}
</style>
</head>
<body>
  <form method="POST" class="box">
    <div class="brand" aria-label="Sonae"><span class="a">S</span><span class="b">o</span><span class="a">n</span><span class="b">a</span><span class="a">e</span></div>
    <h1>China Trip Agenda</h1>
    <p class="sub">Enter the password to continue.</p>
    <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" aria-label="Password" />
    ${error ? '<div class="err">Incorrect password — try again.</div>' : ""}
    <button type="submit">Enter</button>
  </form>
</body>
</html>`;
}

function htmlResponse(body, status) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export default async function middleware(request) {
  const pw =
    (typeof process !== "undefined" &&
      process.env &&
      process.env.SITE_PASSWORD) ||
    "sonae";
  const token = await tokenFor(pw);

  const cookieHeader = request.headers.get("cookie") || "";
  const authed = cookieHeader
    .split(/;\s*/)
    .some((c) => c === `${COOKIE}=${token}`);
  if (authed) return next();

  if (request.method === "POST") {
    let entered = "";
    try {
      const form = await request.formData();
      entered = String(form.get("password") || "");
    } catch (_) {
      entered = "";
    }
    if (entered && (await tokenFor(entered)) === token) {
      const origin = new URL(request.url).origin;
      const res = new Response(null, {
        status: 303,
        headers: { Location: `${origin}/` },
      });
      res.headers.append(
        "Set-Cookie",
        `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`
      );
      return res;
    }
    return htmlResponse(loginPage(true), 401);
  }

  return htmlResponse(loginPage(false), 401);
}
