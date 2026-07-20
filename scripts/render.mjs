// Pure rendering logic shared by the live Notion build (build-agenda.mjs)
// and local preview tooling. Takes normalized rows, returns an HTML fragment
// (no <html>/<head>/<body> wrapper) that callers embed as they see fit.

const CITY_COLORS = {
  Shanghai: { bg: "#e0a339", fg: "#ffffff" },
  Hangzhou: { bg: "#4b8bd4", fg: "#ffffff" },
  Shenzen: { bg: "#d4534b", fg: "#ffffff" },
  "Hong Kong": { bg: "#c9a227", fg: "#2b2b2b" },
};

const CATEGORY = {
  visit: { label: "Site visit", bg: "#1d8f6b", fg: "#ffffff" },
  meal: { label: "Meal", bg: "#a9631a", fg: "#ffffff" },
  transfer: { label: "Transfer", bg: "#5f6672", fg: "#ffffff" },
  hotel: { label: "Hotel / check-in", bg: "#94764f", fg: "#ffffff" },
  other: { label: "Other / TBD", bg: "#4a4f78", fg: "#ffffff" },
};

const SH = 6; // timeline start hour
const EH = 24; // timeline end hour
const PX_PER_MIN = 1.1;
const TIMELINE_HEIGHT = (EH - SH) * 60 * PX_PER_MIN;

function categorize(title) {
  const t = (title || "").toLowerCase();
  if (!title || title === "(untitled)") return "other";
  if (/arrival|move|transfer|train|maglev|airport|flight/.test(t))
    return "transfer";
  if (/hotel|check-in/.test(t)) return "hotel";
  if (/lunch|dinner|meal/.test(t)) return "meal";
  return "visit";
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

function minToLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function renderLegend() {
  const cats = Object.entries(CATEGORY)
    .map(
      ([, v]) =>
        `<span class="leg-item"><span class="leg-dot" style="background:${v.bg}"></span>${escapeHtml(
          v.label
        )}</span>`
    )
    .join("");
  const cities = Object.entries(CITY_COLORS)
    .map(
      ([name, v]) =>
        `<span class="leg-item"><span class="leg-dot" style="background:${v.bg}"></span>${escapeHtml(
          name
        )}</span>`
    )
    .join("");
  return `
    <div class="legend">
      ${cats}
      <span class="leg-sep"></span>
      <span class="leg-item"><span class="leg-swatch solid"></span>Confirmed</span>
      <span class="leg-item"><span class="leg-swatch dashed"></span>Idea / in progress</span>
      <span class="leg-sep"></span>
      ${cities}
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
        .map((c) => {
          const color = CITY_COLORS[c] || { bg: "#888", fg: "#fff" };
          return `<span class="city-chip" style="background:${color.bg};color:${color.fg}">${escapeHtml(
            c
          )}</span>`;
        })
        .join('<span class="transit-arrow">&rarr;</span>')}</div>`
    : "";

  return `
    <div class="day-header">
      <div class="day-name">${weekday}</div>
      <div class="day-date">${dateLabel}</div>
      ${cityLine}
    </div>`;
}

function renderBlock(row, slot) {
  const cat = CATEGORY[categorize(row.event)];
  const top = Math.max(0, Math.round((slot.start - SH * 60) * PX_PER_MIN));
  const rawHeight = (slot.end - slot.start) * PX_PER_MIN;
  const height = Math.max(Math.round(rawHeight), 26);
  const solid = row.status === "Confirmed";
  const timeLabel = slot.openEnded
    ? `${minToLabel(slot.start)} &rarr;`
    : `${minToLabel(slot.start)}-${minToLabel(slot.end)}`;

  const cityDot = row.city
    ? `<span class="block-city-dot" style="background:${(CITY_COLORS[row.city] || {}).bg || "#888"}" title="${escapeHtml(
        row.city
      )}"></span>`
    : "";

  const contacts = row.contacts.length
    ? `<div class="block-contacts">${row.contacts
        .map((c) => escapeHtml(c))
        .join(", ")}</div>`
    : "";

  return `
        <a class="block ${solid ? "confirmed" : "tbc"}" href="${escapeHtml(
    row.url
  )}" target="_blank" rel="noopener"
           style="top:${top}px;height:${height}px;background:${cat.bg};color:${cat.fg};border-color:${cat.bg}">
          <div class="bt">${cityDot}${timeLabel} &mdash; ${escapeHtml(row.event)}</div>
          ${height > 44 ? contacts : ""}
        </a>`;
}

function renderDayColumn(date, events) {
  const scheduled = [];
  const unscheduled = [];
  for (const row of events) {
    const slot = parseSlot(row.slot);
    if (slot) scheduled.push({ row, slot });
    else unscheduled.push(row);
  }
  scheduled.sort((a, b) => a.slot.start - b.slot.start);

  const blocksHtml = scheduled
    .map(({ row, slot }) => renderBlock(row, slot))
    .join("\n");

  const unscheduledHtml = unscheduled.length
    ? `<div class="unscheduled">
        <div class="unscheduled-label">Unscheduled</div>
        ${unscheduled
          .map((row) => {
            const cat = CATEGORY[categorize(row.event)];
            return `<a class="chip" href="${escapeHtml(row.url)}" target="_blank" rel="noopener" style="background:${cat.bg};color:${cat.fg}">${escapeHtml(
              row.event
            )}</a>`;
          })
          .join("")}
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
    out += `<div class="hour-line ${h % 2 === 0 ? "major" : "minor"}" style="top:${top}px"></div>`;
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
    )}:00</div>`;
  }
  return `<div class="time-axis" style="height:${TIMELINE_HEIGHT}px">${out}</div>`;
}

export function renderBody(rows, { generatedAt, databaseUrl } = {}) {
  const rowsByDate = {};
  for (const row of rows) {
    if (!row.date) continue;
    (rowsByDate[row.date] ||= []).push(row);
  }
  const dates = Object.keys(rowsByDate).sort();

  const columnsHtml = dates
    .map((d) => renderDayColumn(d, rowsByDate[d]))
    .join("\n");

  return `
<style>
  * { box-sizing: border-box; }
  .agenda-root {
    --bg: #eef0f4;
    --card-bg: #ffffff;
    --text: #171a21;
    --muted: #5b6270;
    --border: #d8dce3;
    --accent: #1c5f6b;
    --font-display: ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif;
    --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-family: var(--font-body);
    color: var(--text);
    background: var(--bg);
    padding: 24px 20px 60px;
  }
  @media (prefers-color-scheme: dark) {
    .agenda-root {
      --bg: #14161c;
      --card-bg: #1c1f27;
      --text: #eef0f4;
      --muted: #9aa1b0;
      --border: #2c303b;
      --accent: #6fb8c4;
    }
  }
  :root[data-theme="dark"] .agenda-root {
    --bg: #14161c; --card-bg: #1c1f27; --text: #eef0f4; --muted: #9aa1b0; --border: #2c303b; --accent: #6fb8c4;
  }
  :root[data-theme="light"] .agenda-root {
    --bg: #eef0f4; --card-bg: #ffffff; --text: #171a21; --muted: #5b6270; --border: #d8dce3; --accent: #1c5f6b;
  }
  .agenda-root h1 {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.65rem;
    letter-spacing: 0.01em;
    margin: 0 0 4px;
    text-wrap: balance;
  }
  .agenda-root .subtitle { color: var(--muted); font-size: 0.85rem; margin: 0 0 18px; }
  .agenda-root .subtitle a { color: var(--accent); }
  .legend {
    display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center;
    margin-bottom: 16px; font-size: 0.75rem; color: var(--muted);
  }
  .leg-item { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
  .leg-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .leg-swatch { width: 16px; height: 10px; border-radius: 3px; display: inline-block; border: 1.5px solid var(--muted); }
  .leg-swatch.dashed { border-style: dashed; }
  .leg-sep { width: 1px; height: 14px; background: var(--border); }
  .cal-outer { display: flex; gap: 0; overflow-x: auto; padding-bottom: 8px; }
  .time-axis { flex: 0 0 auto; width: 46px; position: relative; margin-top: 76px; }
  .time-label { position: absolute; right: 6px; font-size: 10px; color: var(--muted); transform: translateY(-50%); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .days-area { display: flex; gap: 6px; flex: 1 1 auto; }
  .day-col { display: flex; flex-direction: column; min-width: 160px; flex: 1 1 0; }
  .day-header {
    height: 76px; padding: 8px 8px 6px; border-radius: 8px 8px 0 0;
    border: 1px solid var(--border); border-bottom: 2px solid var(--accent);
    background: var(--card-bg);
  }
  .day-name { font-family: var(--font-display); font-size: 0.88rem; font-weight: 600; }
  .day-date { font-size: 0.72rem; color: var(--muted); margin-top: 1px; font-variant-numeric: tabular-nums; }
  .day-cities { margin-top: 6px; font-size: 0.65rem; display: flex; align-items: center; flex-wrap: wrap; gap: 2px; }
  .city-chip { padding: 1px 6px; border-radius: 999px; font-weight: 600; }
  .transit-arrow { color: var(--muted); padding: 0 2px; }
  .timeline-col {
    position: relative; border: 1px solid var(--border); border-top: none;
    background: var(--card-bg); flex: 0 0 auto;
  }
  .hour-line { position: absolute; left: 0; right: 0; border-top: 1px solid var(--border); }
  .hour-line.major { border-top-color: var(--muted); opacity: 0.4; }
  .hour-line.minor { opacity: 0.5; }
  .block {
    position: absolute; left: 3px; right: 3px; border-radius: 5px; padding: 3px 6px;
    text-decoration: none; overflow: hidden; border-width: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  }
  .block.confirmed { border-style: solid; }
  .block.tbc { border-style: dashed; opacity: 0.92; }
  .block:hover { filter: brightness(1.08); }
  .bt { font-size: 0.68rem; font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums; }
  .block-city-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  .block-contacts { font-size: 0.6rem; opacity: 0.85; margin-top: 2px; }
  .unscheduled { border: 1px solid var(--border); border-top: none; border-radius: 0 0 8px 8px; padding: 6px 8px 8px; background: var(--card-bg); }
  .unscheduled-label { font-size: 0.62rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  .chip { display: inline-block; font-size: 0.68rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; margin: 2px 3px 0 0; text-decoration: none; }
  .agenda-footer { margin-top: 24px; color: var(--muted); font-size: 0.72rem; text-align: center; }
  .agenda-footer a { color: var(--accent); }
</style>
<div class="agenda-root">
  <h1>Sonae LEX2026 &mdash; China Trip Agenda</h1>
  <p class="subtitle">Live view of the <a href="${escapeHtml(
    databaseUrl || ""
  )}" target="_blank" rel="noopener">LEX2026-agenda-db</a> Notion database. Last built ${escapeHtml(
    generatedAt || ""
  )}.</p>
  ${renderLegend()}
  <div class="cal-outer">
    ${renderTimeAxis()}
    <div class="days-area">
      ${columnsHtml}
    </div>
  </div>
  <div class="agenda-footer">Generated automatically from Notion &middot; rebuilds on a schedule via GitHub Actions.</div>
</div>`;
}
