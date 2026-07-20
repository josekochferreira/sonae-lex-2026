// Pure rendering logic shared by the live Notion build (build-agenda.mjs)
// and local preview tooling. Takes normalized rows, returns an HTML fragment
// (no <html>/<head>/<body> wrapper) that callers embed as they see fit.

// Each category / city is a single hue. Backgrounds, ink and rails are derived
// from it at render time via CSS color-mix(), so the same hue reads correctly
// in both light and dark themes without per-theme color tables.
const CITY_HUE = {
  Shanghai: "#d19626",
  Hangzhou: "#3f86c9",
  Shenzen: "#d1514a",
  "Hong Kong": "#b1557f",
};

const CATEGORY = {
  visit: { label: "Site visit", hue: "#0e8f6b" },
  session: { label: "Briefing", hue: "#3a6ea5" },
  meal: { label: "Meal", hue: "#c07a2c" },
  transfer: { label: "Transfer", hue: "#647686" },
  hotel: { label: "Hotel", hue: "#9c7b46" },
  leisure: { label: "Leisure", hue: "#7b6aa6" },
  other: { label: "Other / TBD", hue: "#6f7480" },
};

const SH = 6; // timeline start hour
const EH = 24; // timeline end hour
const PX_PER_MIN = 1.15;
const TIMELINE_HEIGHT = (EH - SH) * 60 * PX_PER_MIN;
const HEADER_HEIGHT = 70;

function categorize(title) {
  const t = (title || "").toLowerCase();
  if (!title || title === "(untitled)") return "other";
  if (/arrival|move|transfer|train|maglev|airport|flight/.test(t))
    return "transfer";
  if (/hotel|check-in/.test(t)) return "hotel";
  if (/breakfast|lunch|dinner|\bmeal\b/.test(t)) return "meal";
  if (/leisure|free time|free evening/.test(t)) return "leisure";
  if (/session|welcome|briefing/.test(t)) return "session";
  return "visit";
}

function cityHue(name) {
  return CITY_HUE[name] || "#6f7480";
}

function parseSlot(slot) {
  if (!slot) return null;
  const s = slot.trim();
  let m = s.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (m) {
    return {
      start: Number(m[1]) * 60 + Number(m[2]),
      end: Number(m[3]) * 60 + Number(m[4]),
    };
  }
  m = s.match(/^(\d{1,2}):(\d{2})\s*-\s*$/);
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    return { start, end: EH * 60, openEnded: true };
  }
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    return { start, end: start + 60, defaultDuration: true };
  }
  return null;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDayHeading(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    date: d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

function formatRange(dates) {
  if (!dates.length) return "";
  const opts = { month: "short", day: "numeric", timeZone: "UTC" };
  const first = new Date(`${dates[0]}T00:00:00Z`);
  const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  const year = last.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });
  const a = first.toLocaleDateString("en-US", opts);
  const b = last.toLocaleDateString("en-US", opts);
  return `${a} – ${b} · ${year}`.toUpperCase();
}

function minToLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function renderLegend() {
  const cats = Object.entries(CATEGORY)
    .map(
      ([, v]) =>
        `<span class="leg-item"><span class="leg-dot" style="background:${v.hue}"></span>${escapeHtml(
          v.label
        )}</span>`
    )
    .join("");
  const cities = Object.entries(CITY_HUE)
    .map(
      ([name, hue]) =>
        `<span class="leg-item"><span class="leg-dot round" style="background:${hue}"></span>${escapeHtml(
          name
        )}</span>`
    )
    .join("");
  return `
    <div class="legend">
      <div class="leg-group">
        <span class="leg-title">Type</span>
        ${cats}
      </div>
      <div class="leg-group">
        <span class="leg-title">Status</span>
        <span class="leg-item"><span class="leg-rail solid"></span>Confirmed</span>
        <span class="leg-item"><span class="leg-rail dashed"></span>Idea</span>
      </div>
      <div class="leg-group">
        <span class="leg-title">City</span>
        ${cities}
      </div>
    </div>`;
}

function renderDayHeader(date, events) {
  const { weekday, date: dateLabel } = formatDayHeading(date);

  const citySeq = [];
  for (const e of events) {
    if (e.city && citySeq[citySeq.length - 1] !== e.city) citySeq.push(e.city);
  }
  const cityLine = citySeq.length
    ? `<div class="day-cities">${citySeq
        .map(
          (c) =>
            `<span class="city-chip" style="--c:${cityHue(c)}">${escapeHtml(c)}</span>`
        )
        .join('<span class="transit-arrow">&rarr;</span>')}</div>`
    : `<div class="day-cities day-cities-empty">&mdash;</div>`;

  return `
    <div class="day-header">
      <div class="day-head-top">
        <span class="day-name">${weekday}</span>
        <span class="day-date">${dateLabel}</span>
      </div>
      ${cityLine}
    </div>`;
}

// Split a day's timed events into side-by-side lanes wherever they overlap,
// so concurrent items render next to each other instead of stacking.
function assignLanes(items) {
  const out = items.map((it) => ({ ...it, lane: { index: 0, count: 1 } }));
  let i = 0;
  while (i < out.length) {
    let clusterEnd = out[i].slot.end;
    let j = i + 1;
    const cluster = [out[i]];
    while (j < out.length && out[j].slot.start < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, out[j].slot.end);
      cluster.push(out[j]);
      j++;
    }
    const laneEnds = [];
    for (const it of cluster) {
      let placed = false;
      for (let l = 0; l < laneEnds.length; l++) {
        if (laneEnds[l] <= it.slot.start) {
          it.lane.index = l;
          laneEnds[l] = it.slot.end;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.lane.index = laneEnds.length;
        laneEnds.push(it.slot.end);
      }
    }
    for (const it of cluster) it.lane.count = laneEnds.length;
    i = j;
  }
  return out;
}

function renderBlock(row, slot, lane = { index: 0, count: 1 }) {
  const cat = CATEGORY[categorize(row.event)];
  const top = Math.max(0, Math.round((slot.start - SH * 60) * PX_PER_MIN));
  const rawHeight = (slot.end - slot.start) * PX_PER_MIN;
  const height = Math.max(Math.round(rawHeight), 30);
  const solid = row.status === "Confirmed";
  const laneW = 100 / lane.count;
  const laneLeft = lane.index * laneW;
  const timeLabel = slot.openEnded
    ? `${minToLabel(slot.start)} &rarr;`
    : `${minToLabel(slot.start)}&ndash;${minToLabel(slot.end)}`;

  const contacts = row.contacts.length
    ? `<div class="b-contacts">${row.contacts.map((c) => escapeHtml(c)).join(", ")}</div>`
    : "";

  const tall = height > 46;

  return `
        <div class="block ${solid ? "confirmed" : "tbc"}"
           style="top:${top}px;height:${height}px;left:calc(${laneLeft}% + 3px);width:calc(${laneW}% - 6px);--c:${cat.hue}">
          <span class="b-time">${timeLabel}</span>
          <span class="b-title">${escapeHtml(row.event)}</span>
          ${tall ? contacts : ""}
        </div>`;
}

function renderDayColumn(date, events) {
  const scheduled = [];
  const unscheduled = [];
  for (const row of events) {
    const slot = parseSlot(row.slot);
    if (slot) scheduled.push({ row, slot });
    else unscheduled.push(row);
  }
  scheduled.sort((a, b) =>
    a.slot.start - b.slot.start || a.slot.end - b.slot.end
  );

  const blocksHtml = assignLanes(scheduled)
    .map(({ row, slot, lane }) => renderBlock(row, slot, lane))
    .join("\n");

  const unscheduledHtml = unscheduled.length
    ? `<div class="unscheduled">
        <div class="unscheduled-label">Unscheduled</div>
        <div class="unscheduled-chips">${unscheduled
          .map((row) => {
            const cat = CATEGORY[categorize(row.event)];
            return `<span class="chip" style="--c:${cat.hue}">${escapeHtml(
              row.event
            )}</span>`;
          })
          .join("")}</div>
      </div>`
    : "";

  const orderedForHeader = [...scheduled.map((s) => s.row), ...unscheduled];

  return `
    <div class="day-col">
      ${renderDayHeader(date, orderedForHeader)}
      <div class="timeline-col" style="height:${TIMELINE_HEIGHT}px">
        ${hourLines()}
        ${blocksHtml}
      </div>
      ${unscheduledHtml}
    </div>`;
}

function hourLines() {
  let out = "";
  for (let h = SH; h <= EH; h++) {
    const top = Math.round((h - SH) * 60 * PX_PER_MIN);
    out += `<div class="hour-line ${
      h % 2 === 0 ? "major" : "minor"
    }" style="top:${top}px"></div>`;
  }
  return out;
}

function renderTimeAxis() {
  let out = "";
  for (let h = SH; h <= EH; h++) {
    const top = Math.round((h - SH) * 60 * PX_PER_MIN);
    out += `<div class="time-label" style="top:${top}px">${String(h).padStart(
      2,
      "0"
    )}<span class="tl-min">:00</span></div>`;
  }
  return `<div class="time-axis" style="height:${TIMELINE_HEIGHT}px">${out}</div>`;
}

// The refreshable part of the page (legend + calendar). Returned on its own by
// the live API route so the client can swap it in without a full reload.
export function renderContent(rows) {
  const rowsByDate = {};
  for (const row of rows) {
    if (!row.date) continue;
    (rowsByDate[row.date] ||= []).push(row);
  }
  const dates = Object.keys(rowsByDate).sort();
  const columnsHtml = dates
    .map((d) => renderDayColumn(d, rowsByDate[d]))
    .join("\n");

  return `${renderLegend()}
  <div class="cal">
    <div class="cal-scroll">
      <div class="cal-grid">
        ${renderTimeAxis()}
        <div class="days-area">
          ${columnsHtml}
        </div>
      </div>
    </div>
  </div>`;
}

export function renderBody(rows, { generatedAt, databaseUrl } = {}) {
  const dates = [...new Set(rows.filter((r) => r.date).map((r) => r.date))].sort();
  const rangeLabel = formatRange(dates);

  return `
<style>
  * { box-sizing: border-box; }
  .agenda-root {
    --bg: #eef0f3;
    --card-bg: #ffffff;
    --panel: #f7f8fa;
    --text: #161a20;
    --muted: #626a76;
    --faint: #9aa2ae;
    --border: #e2e5ea;
    --divider: #edeff2;
    --accent: #146a72;
    --font-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ui-serif, serif;
    --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif;
    font-family: var(--font-body);
    color: var(--text);
    background: var(--bg);
    padding: 22px 26px 56px;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  @media (prefers-color-scheme: dark) {
    .agenda-root {
      --bg: #101318;
      --card-bg: #191d24;
      --panel: #14171d;
      --text: #eceef2;
      --muted: #9aa2b0;
      --faint: #6a7280;
      --border: #292e37;
      --divider: #22262e;
      --accent: #64c2cb;
    }
  }
  :root[data-theme="dark"] .agenda-root {
    --bg: #101318; --card-bg: #191d24; --panel: #14171d; --text: #eceef2;
    --muted: #9aa2b0; --faint: #6a7280; --border: #292e37; --divider: #22262e; --accent: #64c2cb;
  }
  :root[data-theme="light"] .agenda-root {
    --bg: #eef0f3; --card-bg: #ffffff; --panel: #f7f8fa; --text: #161a20;
    --muted: #626a76; --faint: #9aa2ae; --border: #e2e5ea; --divider: #edeff2; --accent: #146a72;
  }

  /* ---------- masthead ---------- */
  .masthead {
    position: relative;
    max-width: 1180px; margin: 0 auto 16px;
    display: grid; grid-template-columns: auto 1fr auto; align-items: center;
    column-gap: 16px; row-gap: 1px;
  }
  .refresh-btn {
    grid-column: 3; grid-row: 1 / span 3; align-self: center; justify-self: end;
    display: inline-flex; align-items: center; justify-content: center;
    width: 38px; height: 38px; border-radius: 50%;
    border: 1px solid var(--border); background: var(--card-bg); color: var(--muted);
    cursor: pointer; padding: 0;
    box-shadow: 0 1px 2px rgba(15,20,30,0.05);
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }
  .refresh-btn:hover { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
  .refresh-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .refresh-btn svg { width: 17px; height: 17px; }
  .refresh-btn.spinning svg { animation: rf-spin 0.8s linear infinite; }
  .refresh-btn.spinning { color: var(--accent); cursor: default; }
  @keyframes rf-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .refresh-btn.spinning svg { animation: none; } }
  .brandmark {
    grid-row: 1 / span 3; align-self: center;
    display: inline-block; background: #ffffff; border-radius: 9px;
    padding: 6px 12px 7px;
    box-shadow: 0 1px 2px rgba(15,20,30,0.08), 0 6px 18px -12px rgba(15,20,30,0.35);
    font-family: ui-rounded, "SF Pro Rounded", "Segoe UI", var(--font-body);
    font-size: 1.18rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1;
    user-select: none;
  }
  .brandmark .bm-a { color: #0a1a9b; }
  .brandmark .bm-b { color: #2f80e4; }
  .mh-eyebrow {
    font-size: 0.64rem; font-weight: 600; letter-spacing: 0.15em;
    color: var(--accent); font-variant-numeric: tabular-nums;
  }
  .agenda-root h1 {
    font-family: var(--font-display); font-weight: 600;
    font-size: clamp(1.35rem, 1.05rem + 1.2vw, 1.8rem);
    line-height: 1.1; letter-spacing: -0.01em; margin: 0; text-wrap: balance;
  }
  .subtitle { color: var(--muted); font-size: 0.78rem; margin: 0; line-height: 1.4; }

  /* ---------- legend ---------- */
  .legend {
    max-width: 1180px; margin: 0 auto 16px;
    display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: flex-start;
    padding: 12px 16px; background: var(--panel);
    border: 1px solid var(--border); border-radius: 12px;
    font-size: 0.72rem; color: var(--muted);
  }
  .leg-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
  .leg-title {
    font-size: 0.62rem; font-weight: 700; letter-spacing: 0.09em;
    text-transform: uppercase; color: var(--faint); margin-right: 2px;
  }
  .leg-item { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
  .leg-dot { width: 9px; height: 9px; border-radius: 2.5px; display: inline-block; }
  .leg-dot.round { border-radius: 50%; }
  .leg-rail { width: 3px; height: 13px; border-radius: 2px; background: var(--muted); display: inline-block; }
  .leg-rail.dashed {
    width: 0; height: 13px; border-left: 3px dashed var(--muted); border-radius: 0; background: none;
  }

  /* ---------- calendar card ---------- */
  .cal {
    max-width: 1180px; margin: 0 auto;
    background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 14px; overflow: hidden;
    box-shadow: 0 1px 2px rgba(15,20,30,0.04), 0 12px 30px -18px rgba(15,20,30,0.28);
  }
  .cal-scroll { overflow-x: auto; }
  .cal-grid { display: flex; min-width: 720px; }

  .time-axis {
    flex: 0 0 auto; width: 50px; position: relative;
    margin-top: ${HEADER_HEIGHT}px; border-right: 1px solid var(--divider);
  }
  .time-label {
    position: absolute; right: 8px; top: 0; font-size: 10.5px; font-weight: 600;
    color: var(--faint); transform: translateY(-50%); white-space: nowrap;
    font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
  }
  .tl-min { color: color-mix(in srgb, var(--faint) 60%, transparent); font-weight: 500; }

  .days-area { display: flex; flex: 1 1 auto; }
  .day-col { display: flex; flex-direction: column; min-width: 150px; flex: 1 1 0; }
  .day-col + .day-col { border-left: 1px solid var(--divider); }

  .day-header {
    height: ${HEADER_HEIGHT}px; padding: 10px 12px 8px;
    border-bottom: 1px solid var(--border); background: var(--panel);
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .day-head-top { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
  .day-name { font-family: var(--font-display); font-size: 0.92rem; font-weight: 600; letter-spacing: -0.01em; }
  .day-date { font-size: 0.7rem; font-weight: 600; color: var(--faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .day-cities { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; }
  .day-cities-empty { color: var(--faint); font-size: 0.7rem; }
  .city-chip {
    font-size: 0.62rem; font-weight: 600; padding: 1px 7px; border-radius: 999px;
    color: color-mix(in srgb, var(--c) 76%, var(--text));
    background: color-mix(in srgb, var(--c) 16%, var(--card-bg));
  }
  .transit-arrow { color: var(--faint); font-size: 0.6rem; }

  .timeline-col { position: relative; flex: 0 0 auto; }
  .hour-line { position: absolute; left: 0; right: 0; border-top: 1px solid var(--divider); pointer-events: none; }
  .hour-line.major { border-top-color: var(--border); }
  .hour-line.minor { border-top-style: dotted; }

  /* ---------- event blocks ---------- */
  .block {
    position: absolute; overflow: hidden;
    padding: 4px 8px 4px 9px; border-radius: 7px; text-decoration: none;
    background: color-mix(in srgb, var(--c) 13%, var(--card-bg));
    border-left: 3px solid var(--c);
    color: color-mix(in srgb, var(--c) 72%, var(--text));
    transition: transform 0.13s ease, box-shadow 0.13s ease, background 0.13s ease;
  }
  .block.tbc {
    border-left-style: dashed;
    background: color-mix(in srgb, var(--c) 8%, var(--card-bg));
  }
  .block:hover {
    transform: translateY(-1px);
    background: color-mix(in srgb, var(--c) 18%, var(--card-bg));
    box-shadow: 0 6px 16px -8px color-mix(in srgb, var(--c) 60%, transparent);
    z-index: 5;
  }
  .b-time {
    display: block; font-size: 0.62rem; font-weight: 600; line-height: 1.2;
    font-variant-numeric: tabular-nums; letter-spacing: 0.01em;
    color: color-mix(in srgb, var(--c) 58%, var(--muted));
  }
  .b-title {
    display: block; font-size: 0.72rem; font-weight: 600; line-height: 1.22;
    margin-top: 1px; overflow: hidden;
  }
  .b-contacts {
    font-size: 0.6rem; font-weight: 500; margin-top: 3px; line-height: 1.2;
    color: color-mix(in srgb, var(--c) 40%, var(--muted));
  }

  /* ---------- unscheduled ---------- */
  .unscheduled { padding: 9px 10px 11px; border-top: 1px solid var(--divider); background: var(--panel); }
  .unscheduled-label {
    font-size: 0.6rem; font-weight: 700; color: var(--faint);
    text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 6px;
  }
  .unscheduled-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip {
    display: inline-block; font-size: 0.68rem; font-weight: 600;
    padding: 2px 9px; border-radius: 999px; text-decoration: none;
    color: color-mix(in srgb, var(--c) 74%, var(--text));
    background: color-mix(in srgb, var(--c) 13%, var(--card-bg));
    border: 1px solid color-mix(in srgb, var(--c) 26%, transparent);
    transition: background 0.13s ease;
  }
  .chip:hover { background: color-mix(in srgb, var(--c) 22%, var(--card-bg)); }

  .agenda-footer {
    max-width: 1180px; margin: 20px auto 0; color: var(--faint);
    font-size: 0.72rem; text-align: center;
  }
  .agenda-footer a { color: var(--accent); text-decoration: none; }

  @media (prefers-reduced-motion: reduce) {
    .block, .chip { transition: none; }
    .block:hover { transform: none; }
  }
</style>
<div class="agenda-root">
  <header class="masthead">
    <div class="brandmark" role="img" aria-label="Sonae"><span class="bm-a">S</span><span class="bm-b">o</span><span class="bm-a">n</span><span class="bm-b">a</span><span class="bm-a">e</span></div>
    <div class="mh-eyebrow">${escapeHtml(rangeLabel)}</div>
    <h1>Sonae LEX2026 &mdash; China Trip Agenda</h1>
    <p class="subtitle" id="mh-subtitle">Last updated ${escapeHtml(generatedAt || "")}.</p>
    <button class="refresh-btn" id="refresh-btn" type="button" title="Refresh from Notion" aria-label="Refresh agenda from Notion">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>
      </svg>
    </button>
  </header>
  <script>
    (function () {
      var btn = document.getElementById("refresh-btn");
      var sub = document.getElementById("mh-subtitle");
      var content = document.getElementById("agenda-content");
      if (!btn) return;
      btn.addEventListener("click", function () {
        if (btn.classList.contains("spinning")) return;
        btn.classList.add("spinning");
        fetch("/api/agenda", { headers: { accept: "application/json" }, cache: "no-store" })
          .then(function (r) {
            if (!r.ok) throw new Error("live refresh unavailable");
            return r.json();
          })
          .then(function (data) {
            if (content && data.content) content.innerHTML = data.content;
            if (sub && data.generatedAt) sub.textContent = "Last updated " + data.generatedAt + ".";
            btn.classList.remove("spinning");
          })
          .catch(function () {
            // No live endpoint here (e.g. static preview / GitHub Pages): reload.
            location.reload();
          });
      });
    })();
  </script>
  <div id="agenda-content">
  ${renderContent(rows)}
  </div>
  <div class="agenda-footer">Generated automatically from Notion &middot; auto-refreshes on a schedule; use the button to pull the latest now.</div>
</div>`;
}
