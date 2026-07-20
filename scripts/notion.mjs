// Shared Notion access: fetch the LEX2026 agenda database and normalize its
// pages into the row shape the renderer expects. Used by both the static build
// (build-agenda.mjs) and the live API route (api/agenda.js).

const NOTION_VERSION = "2025-09-03";

export const DEFAULT_DATA_SOURCE_ID =
  process.env.NOTION_DATA_SOURCE_ID || "39e12e89-b5f6-801d-915a-000b36acfa5b";
export const DATABASE_URL =
  "https://app.notion.com/p/39e12e89b5f680c4b140f0dcf72f8bc3";

function plainText(richTextArr) {
  return (richTextArr || []).map((t) => t.plain_text).join("");
}

function extractRow(page) {
  const props = page.properties;
  return {
    event: plainText(props.Event?.title) || "(untitled)",
    slot: plainText(props.Slot?.rich_text),
    city: props.City?.select?.name ?? null,
    status: props.Status?.status?.name ?? null,
    contacts: (props.KeyContact?.multi_select ?? []).map((o) => o.name),
    date: props.Date?.date?.start ?? null,
    url: page.url,
  };
}

// Returns normalized agenda rows. Throws if the token is missing or Notion errors.
export async function fetchAgendaRows({
  token = process.env.NOTION_TOKEN,
  dataSourceId = DEFAULT_DATA_SOURCE_ID,
} = {}) {
  if (!token) {
    throw new Error("Missing NOTION_TOKEN environment variable.");
  }

  const pages = [];
  let cursor;
  do {
    const res = await fetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
      }
    );
    if (!res.ok) {
      throw new Error(`Notion API error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return pages.map(extractRow);
}

export function formatGeneratedAt(date = new Date()) {
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
