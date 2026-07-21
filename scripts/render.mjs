// Pure rendering logic shared by the live Notion build (build-agenda.mjs)
// and local preview tooling. Takes normalized rows, returns an HTML fragment
// (no <html>/<head>/<body> wrapper) that callers embed as they see fit.

// Each category / city is a single hue. Backgrounds, ink and rails are derived
// from it at render time via CSS color-mix(), so the same hue reads correctly
// in both light and dark themes without per-theme color tables.
// Palette adopted from the China trip website template: bright blue primary
// with vivid orange / purple / green / pink / red categoricals on a dark ground.
const CITY_HUE = {
  Shanghai: "#e0741f",
  Hangzhou: "#2ea1df",
  Shenzen: "#cf0a2c",
  "Hong Kong": "#a78bfa",
};

const CATEGORY = {
  visit: { label: "Site visit", hue: "#2ea1df" },
  session: { label: "Briefing", hue: "#a78bfa" },
  meal: { label: "Meal", hue: "#fb923c" },
  transfer: { label: "Transfer", hue: "#5a6675" },
  hotel: { label: "Hotel", hue: "#4ade80" },
  leisure: { label: "Leisure", hue: "#ec4899" },
  other: { label: "Other / TBD", hue: "#8b949e" },
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
  return CITY_HUE[name] || "#8b949e";
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
  const unscheduledRows = [];
  for (const row of events) {
    const slot = parseSlot(row.slot);
    if (slot) scheduled.push({ row, slot });
    else unscheduledRows.push(row);
  }
  scheduled.sort((a, b) =>
    a.slot.start - b.slot.start || a.slot.end - b.slot.end
  );

  const blocksHtml = assignLanes(scheduled)
    .map(({ row, slot, lane }) => renderBlock(row, slot, lane))
    .join("\n");

  // Header city sequence still considers unscheduled rows so a city that only
  // appears on a slotless item is not lost from the day's route.
  const orderedForHeader = [...scheduled.map((s) => s.row), ...unscheduledRows];

  return `
    <div class="day-col">
      ${renderDayHeader(date, orderedForHeader)}
      <div class="timeline-col" style="height:${TIMELINE_HEIGHT}px">
        ${hourLines()}
        ${blocksHtml}
      </div>
    </div>`;
}

// Rightmost calendar column collecting every dated-but-slotless event,
// grouped and ordered by city (trip order), each item tagged with its day.
function renderUnscheduledColumn(items) {
  if (!items.length) return "";

  const groups = new Map();
  for (const entry of items) {
    const key = entry.row.city && CITY_HUE[entry.row.city] ? entry.row.city : "__none__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const cityOrder = [...Object.keys(CITY_HUE), "__none__"];
  const groupsHtml = cityOrder
    .filter((c) => groups.has(c))
    .map((c) => {
      const rows = groups.get(c).sort((a, b) =>
        a.date < b.date
          ? -1
          : a.date > b.date
          ? 1
          : a.row.event.localeCompare(b.row.event)
      );
      const cityLabel =
        c === "__none__"
          ? `<span class="unsched-city-label">No city</span>`
          : `<span class="city-chip" style="--c:${cityHue(c)}">${escapeHtml(c)}</span>`;
      const itemsHtml = rows
        .map(({ row, date }) => {
          const cat = CATEGORY[categorize(row.event)];
          const { date: dateLabel } = formatDayHeading(date);
          return `<div class="unsched-item" style="--c:${cat.hue}">
            <span class="ui-title">${escapeHtml(row.event)}</span>
            <span class="ui-day">${escapeHtml(dateLabel)}</span>
          </div>`;
        })
        .join("");
      return `<div class="unsched-group">
          <div class="unsched-city">${cityLabel}</div>
          <div class="unsched-items">${itemsHtml}</div>
        </div>`;
    })
    .join("");

  return `
    <div class="day-col unsched-col">
      <div class="day-header">
        <div class="day-head-top">
          <span class="day-name">Unscheduled</span>
          <span class="day-date">${items.length}</span>
        </div>
        <div class="day-cities day-cities-empty">by city</div>
      </div>
      <div class="unsched-body">
        ${groupsHtml}
      </div>
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

  const unscheduled = [];
  for (const d of dates) {
    for (const row of rowsByDate[d]) {
      if (!parseSlot(row.slot)) unscheduled.push({ row, date: d });
    }
  }

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
          ${renderUnscheduledColumn(unscheduled)}
        </div>
      </div>
    </div>
  </div>`;
}

export function renderBody(rows, { generatedAt, databaseUrl } = {}) {
  const dates = [...new Set(rows.filter((r) => r.date).map((r) => r.date))].sort();
  const rangeLabel = formatRange(dates);

  return `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  .agenda-root {
    --bg: #0b1014;
    --card-bg: #121a21;
    --panel: #0f171d;
    --text: #e6edf3;
    --muted: #8b949e;
    --faint: #5a6675;
    --border: #243038;
    --divider: #1a232c;
    --accent: #2ea1df;
    --font-display: "Fraunces", "Iowan Old Style", Georgia, serif;
    --font-body: "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
    color-scheme: dark;
    font-family: var(--font-body);
    color: var(--text);
    background: var(--bg);
    min-height: 100vh;
    padding: 22px 26px 56px;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
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
    border: 1px solid var(--border); background: var(--panel); color: var(--muted);
    cursor: pointer; padding: 0;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }
  .refresh-btn:hover { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
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
    box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 6px 20px -8px rgba(0,0,0,0.6);
    font-family: ui-rounded, "SF Pro Rounded", "Segoe UI", var(--font-body);
    font-size: 1.18rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1;
    user-select: none;
  }
  .brandmark .bm-a { color: #0a1a9b; }
  .brandmark .bm-b { color: #2f80e4; }
  .mh-eyebrow {
    font-family: var(--font-mono);
    font-size: 0.64rem; font-weight: 500; letter-spacing: 0.18em;
    color: var(--accent);
  }
  .agenda-root h1 {
    font-family: var(--font-display); font-weight: 500;
    font-size: clamp(1.4rem, 1.05rem + 1.4vw, 1.95rem);
    line-height: 1.08; letter-spacing: -0.005em; margin: 2px 0 0; text-wrap: balance;
  }
  .subtitle { color: var(--muted); font-size: 0.76rem; margin: 3px 0 0; line-height: 1.4; font-family: var(--font-mono); }

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
    font-family: var(--font-mono);
    font-size: 0.6rem; font-weight: 600; letter-spacing: 0.11em;
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
    box-shadow: 0 24px 60px -30px rgba(0,0,0,0.75);
  }
  .cal-scroll { overflow-x: auto; }
  .cal-grid { display: flex; min-width: 720px; }

  .time-axis {
    flex: 0 0 auto; width: 50px; position: relative;
    margin-top: ${HEADER_HEIGHT}px; border-right: 1px solid var(--divider);
  }
  .time-label {
    position: absolute; right: 8px; top: 0; font-family: var(--font-mono);
    font-size: 10px; font-weight: 500;
    color: var(--faint); transform: translateY(-50%); white-space: nowrap;
    letter-spacing: 0.01em;
  }
  .tl-min { color: color-mix(in srgb, var(--faint) 55%, transparent); font-weight: 400; }

  .days-area { display: flex; flex: 1 1 auto; }
  .day-col { display: flex; flex-direction: column; min-width: 150px; flex: 1 1 0; }
  .day-col + .day-col { border-left: 1px solid var(--divider); }

  .day-header {
    height: ${HEADER_HEIGHT}px; padding: 10px 12px 8px;
    border-bottom: 1px solid var(--border); background: var(--panel);
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .day-head-top { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
  .day-name { font-family: var(--font-display); font-size: 0.96rem; font-weight: 500; letter-spacing: -0.005em; }
  .day-date { font-family: var(--font-mono); font-size: 0.68rem; font-weight: 500; color: var(--faint); white-space: nowrap; }
  .day-cities { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; }
  .day-cities-empty { color: var(--faint); font-size: 0.7rem; }
  .city-chip {
    font-size: 0.62rem; font-weight: 600; padding: 1px 7px; border-radius: 999px;
    color: color-mix(in srgb, var(--c) 82%, var(--text));
    background: color-mix(in srgb, var(--c) 22%, var(--card-bg));
  }
  .transit-arrow { color: var(--faint); font-size: 0.6rem; }

  .timeline-col { position: relative; flex: 0 0 auto; }
  .hour-line { position: absolute; left: 0; right: 0; border-top: 1px solid var(--divider); pointer-events: none; }
  .hour-line.major { border-top-color: var(--border); }
  .hour-line.minor { border-top-style: dotted; opacity: 0.6; }

  /* ---------- event blocks ---------- */
  .block {
    position: absolute; overflow: hidden;
    padding: 4px 8px 4px 9px; border-radius: 7px; text-decoration: none;
    background: color-mix(in srgb, var(--c) 22%, var(--card-bg));
    border-left: 3px solid var(--c);
    color: color-mix(in srgb, var(--c) 82%, var(--text));
    transition: transform 0.13s ease, box-shadow 0.13s ease, background 0.13s ease;
  }
  .block.tbc {
    border-left-style: dashed;
    background: color-mix(in srgb, var(--c) 12%, var(--card-bg));
  }
  .block:hover {
    transform: translateY(-1px);
    background: color-mix(in srgb, var(--c) 30%, var(--card-bg));
    box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--c) 70%, transparent);
    z-index: 5;
  }
  .b-time {
    display: block; font-family: var(--font-mono);
    font-size: 0.6rem; font-weight: 500; line-height: 1.2; letter-spacing: 0.01em;
    color: color-mix(in srgb, var(--c) 72%, var(--muted));
  }
  .b-title {
    display: block; font-size: 0.72rem; font-weight: 600; line-height: 1.22;
    margin-top: 1px; overflow: hidden;
    color: color-mix(in srgb, var(--c) 84%, var(--text));
  }
  .b-contacts {
    font-size: 0.6rem; font-weight: 500; margin-top: 3px; line-height: 1.2;
    color: color-mix(in srgb, var(--c) 55%, var(--muted));
  }

  /* ---------- unscheduled column (right) ---------- */
  .unsched-col { min-width: 178px; }
  .unsched-body {
    flex: 1 1 auto; padding: 11px 10px 12px;
    background: color-mix(in srgb, var(--accent) 4%, var(--card-bg));
    display: flex; flex-direction: column; gap: 13px;
  }
  .unsched-group { display: flex; flex-direction: column; gap: 6px; }
  .unsched-city-label {
    font-family: var(--font-mono); font-size: 0.58rem; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint);
  }
  .unsched-items { display: flex; flex-direction: column; gap: 5px; }
  .unsched-item {
    border-left: 3px solid var(--c); border-radius: 6px; padding: 5px 8px;
    background: color-mix(in srgb, var(--c) 15%, var(--card-bg));
    display: flex; flex-direction: column; gap: 1px;
  }
  .ui-title {
    font-size: 0.71rem; font-weight: 600; line-height: 1.22;
    color: color-mix(in srgb, var(--c) 84%, var(--text));
  }
  .ui-day { font-family: var(--font-mono); font-size: 0.58rem; color: var(--faint); }

  .agenda-footer {
    max-width: 1180px; margin: 20px auto 0; color: var(--faint);
    font-size: 0.7rem; text-align: center; font-family: var(--font-mono);
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
            // Look these up at click time — the script tag is parsed before
            // #agenda-content exists, so resolving them earlier returns null.
            var content = document.getElementById("agenda-content");
            var sub = document.getElementById("mh-subtitle");
            if (content && data.content) content.innerHTML = data.content;
            if (sub && data.generatedAt) sub.textContent = "Last updated " + data.generatedAt + ".";
            btn.classList.remove("spinning");
          })
          .catch(function () {
            // No live endpoint here (e.g. static preview / GitHub Pages): reload.
            btn.classList.remove("spinning");
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
