// Vercel serverless function: returns the agenda's live content, rendered from
// current Notion data, as JSON { content, generatedAt }. The refresh button
// fetches this and swaps it into the page — no rebuild, instant update.
//
// Uses the same NOTION_TOKEN env var the build uses, so no extra setup is
// needed beyond what already makes builds work.

import { fetchAgendaRows, formatGeneratedAt } from "../scripts/notion.mjs";
import { renderContent } from "../scripts/render.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rows = await fetchAgendaRows();
    // Never cache — the button exists to fetch the very latest from Notion.
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      content: renderContent(rows),
      generatedAt: formatGeneratedAt(),
      count: rows.length,
    });
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Could not load agenda from Notion" });
  }
}
