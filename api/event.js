// Vercel serverless route: renders an event-specific page from a Notion page's
// own content. Linked from each agenda block as /event?id=<notionPageId>.

import { fetchEventPage } from "../scripts/notion-page.mjs";

const CITY_HUE = {
  Shanghai: "#e0741f",
  Hangzhou: "#2ea1df",
  Shenzen: "#cf0a2c",
  "Hong Kong": "#a78bfa",
};
const STATUS_HUE = {
  Confirmed: "#4ade80",
  "In progress": "#2ea1df",
  Idea: "#8b949e",
};

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function chip(text, hue) {
  return `<span class="ev-chip" style="--c:${hue}">${esc(text)}</span>`;
}

function renderMeta(meta) {
  const bits = [];
  if (meta.date) bits.push(`<span class="ev-date">${esc(formatDate(meta.date))}</span>`);
  if (meta.slot) bits.push(`<span class="ev-slot">${esc(meta.slot)}</span>`);
  const chips = [];
  if (meta.city) chips.push(chip(meta.city, CITY_HUE[meta.city] || "#8b949e"));
  if (meta.status) chips.push(chip(meta.status, STATUS_HUE[meta.status] || "#8b949e"));
  for (const c of meta.contacts || []) chips.push(chip(c, "#a78bfa"));
  return `
    <div class="ev-meta">${bits.join('<span class="ev-dot">·</span>')}</div>
    ${chips.length ? `<div class="ev-chips">${chips.join("")}</div>` : ""}`;
}

function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Sonae LEX2026</title>
<style>html,body{margin:0;background:#0b1014}</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:#0b1014; --card:#121a21; --panel:#0f171d; --text:#e6edf3;
    --muted:#8b949e; --faint:#5a6675; --border:#243038; --accent:#2ea1df;
    --fd:"Fraunces","Iowan Old Style",Georgia,serif;
    --fb:"Inter Tight",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    --fm:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body { font-family: var(--fb); color: var(--text); background: var(--bg);
    -webkit-font-smoothing: antialiased; line-height: 1.6; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 26px 22px 90px; }
  .back { display: inline-flex; align-items: center; gap: 6px; font-family: var(--fm);
    font-size: 0.72rem; letter-spacing: 0.04em; color: var(--muted);
    text-decoration: none; padding: 6px 12px; border: 1px solid var(--border);
    border-radius: 999px; background: var(--panel); }
  .back:hover { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
  .ev-head { margin: 22px 0 26px; padding-bottom: 22px; border-bottom: 1px solid var(--border); }
  h1 { font-family: var(--fd); font-weight: 500; font-size: clamp(1.7rem, 1.2rem + 2vw, 2.5rem);
    line-height: 1.1; letter-spacing: -0.01em; margin: 0 0 14px; text-wrap: balance; }
  .ev-meta { font-family: var(--fm); font-size: 0.82rem; color: var(--muted);
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .ev-dot { color: var(--faint); }
  .ev-slot { color: var(--accent); }
  .ev-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
  .ev-chip { font-size: 0.72rem; font-weight: 600; padding: 3px 11px; border-radius: 999px;
    color: color-mix(in srgb, var(--c) 86%, var(--text));
    background: color-mix(in srgb, var(--c) 18%, var(--card));
    border: 1px solid color-mix(in srgb, var(--c) 38%, transparent); }
  .content { font-size: 1rem; }
  .content p { margin: 0 0 14px; }
  .content p.nb-space { margin: 0 0 8px; }
  .content h2.nb-h { font-family: var(--fd); font-weight: 600; font-size: 1.4rem; margin: 30px 0 12px; }
  .content h3.nb-h { font-family: var(--fd); font-weight: 600; font-size: 1.18rem; margin: 26px 0 10px; }
  .content h4.nb-h { font-weight: 600; font-size: 1.02rem; margin: 22px 0 8px; }
  .content a { color: var(--accent); }
  .content .nb-list { margin: 0 0 14px; padding-left: 22px; }
  .content .nb-list li { margin: 4px 0; }
  .content blockquote { margin: 0 0 16px; padding: 4px 0 4px 16px;
    border-left: 3px solid var(--accent); color: var(--muted); }
  .content .nb-callout { display: flex; gap: 10px; padding: 12px 14px; margin: 0 0 16px;
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px; }
  .content .nb-callout-i { flex: 0 0 auto; }
  .content .nb-todo { display: flex; align-items: flex-start; gap: 8px; margin: 5px 0; }
  .content .nb-code { background: #0a0e12; border: 1px solid var(--border); border-radius: 8px;
    padding: 12px 14px; overflow-x: auto; font-family: var(--fm); font-size: 0.82rem; margin: 0 0 16px; }
  .content code { font-family: var(--fm); font-size: 0.85em;
    background: color-mix(in srgb, var(--accent) 12%, var(--card)); padding: 1px 5px; border-radius: 4px; }
  .content .nb-code code { background: none; padding: 0; }
  .content .nb-hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
  .content .nb-fig { margin: 0 0 18px; }
  .content .nb-fig img { max-width: 100%; border-radius: 10px; display: block; }
  .content figcaption { font-size: 0.78rem; color: var(--muted); margin-top: 6px; }
  .content .nb-toggle { margin: 0 0 12px; }
  .content .nb-toggle summary { cursor: pointer; font-weight: 600; }
  .content .nb-toggle-body { padding: 8px 0 0 14px; }
  .empty-note { color: var(--muted); font-style: italic; }
  .err { color: #ec4899; }
</style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="/">&larr; Back to agenda</a>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  let id = "";
  try {
    const raw =
      (req.query && req.query.id) ||
      new URL(req.url, "http://x").searchParams.get("id") ||
      "";
    const m = String(raw).match(/[0-9a-fA-F]{32}/);
    id = m ? m[0] : "";
  } catch (_) {
    id = "";
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (!id) {
    return res
      .status(400)
      .send(page("Event not found", `<p class="err">Missing or invalid event id.</p>`));
  }

  try {
    const { title, meta, contentHtml } = await fetchEventPage(id);
    const body = `
      <div class="ev-head">
        <h1>${esc(title)}</h1>
        ${renderMeta(meta)}
      </div>
      <div class="content">${
        contentHtml || `<p class="empty-note">No additional details in Notion yet.</p>`
      }</div>`;
    return res.status(200).send(page(title, body));
  } catch (err) {
    return res
      .status(502)
      .send(
        page(
          "Could not load event",
          `<p class="err">This event could not be loaded from Notion.</p>`
        )
      );
  }
}
