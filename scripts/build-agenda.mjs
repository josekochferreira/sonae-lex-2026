import { writeFile, mkdir } from "node:fs/promises";
import { renderBody } from "./render.mjs";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
// Defaults to the known LEX2026-agenda-db data source; override via env if it ever changes.
const DATA_SOURCE_ID =
  process.env.NOTION_DATA_SOURCE_ID || "39e12e89-b5f6-801d-915a-000b36acfa5b";
const NOTION_VERSION = "2025-09-03";
const DATABASE_URL = "https://app.notion.com/p/39e12e89b5f680c4b140f0dcf72f8bc3";

if (!NOTION_TOKEN) {
  console.error(
    "Missing NOTION_TOKEN environment variable. See README.md for setup instructions."
  );
  process.exit(1);
}

async function queryDataSource() {
  const rows = [];
  let cursor;
  do {
    const res = await fetch(
      `https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
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
    rows.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return rows;
}

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

function wrapDocument(bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sonae LEX2026 - China Trip Agenda</title>
</head>
<body style="margin:0">
${bodyHtml}
</body>
</html>
`;
}

async function main() {
  const pages = await queryDataSource();
  const rows = pages.map(extractRow);

  const generatedAt =
    new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const body = renderBody(rows, { generatedAt, databaseUrl: DATABASE_URL });
  const html = wrapDocument(body);

  await mkdir("public", { recursive: true });
  await writeFile("public/index.html", html, "utf8");
  console.log(
    `Wrote public/index.html with ${rows.length} agenda items.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
