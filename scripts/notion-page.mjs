// Fetches a single Notion page (properties + block content) and renders the
// block content to HTML. Used by the /api/event route to build an
// event-specific page from the Notion page's own content.

const NOTION_VERSION = "2022-06-28";

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plain(richTextArr) {
  return (richTextArr || []).map((t) => t.plain_text).join("");
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
  });
  if (!res.ok) {
    throw new Error(`Notion ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Recursively fetch a block's children, attaching nested children as `_children`.
async function fetchChildren(blockId, token, depth = 0) {
  if (depth > 4) return [];
  const blocks = [];
  let cursor;
  do {
    const url =
      `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100` +
      (cursor ? `&start_cursor=${cursor}` : "");
    const data = await fetchJson(url, token);
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  for (const b of blocks) {
    if (b.has_children) b._children = await fetchChildren(b.id, token, depth + 1);
  }
  return blocks;
}

function renderRichText(arr) {
  return (arr || [])
    .map((t) => {
      let text = esc(t.plain_text);
      const a = t.annotations || {};
      if (a.code) text = `<code>${text}</code>`;
      if (a.bold) text = `<strong>${text}</strong>`;
      if (a.italic) text = `<em>${text}</em>`;
      if (a.strikethrough) text = `<s>${text}</s>`;
      if (a.underline) text = `<u>${text}</u>`;
      if (t.href)
        text = `<a href="${esc(t.href)}" target="_blank" rel="noopener">${text}</a>`;
      return text;
    })
    .join("");
}

function renderOne(b) {
  const t = b.type;
  const d = b[t] || {};
  const kids = b._children ? renderBlocks(b._children) : "";
  switch (t) {
    case "paragraph": {
      const rt = renderRichText(d.rich_text);
      return rt ? `<p>${rt}${kids}</p>` : `<p class="nb-space"></p>`;
    }
    case "heading_1":
      return `<h2 class="nb-h">${renderRichText(d.rich_text)}</h2>`;
    case "heading_2":
      return `<h3 class="nb-h">${renderRichText(d.rich_text)}</h3>`;
    case "heading_3":
      return `<h4 class="nb-h">${renderRichText(d.rich_text)}</h4>`;
    case "to_do":
      return `<div class="nb-todo"><input type="checkbox" disabled ${
        d.checked ? "checked" : ""
      }/> <span>${renderRichText(d.rich_text)}</span></div>${kids}`;
    case "quote":
      return `<blockquote>${renderRichText(d.rich_text)}${kids}</blockquote>`;
    case "callout": {
      const icon = d.icon && d.icon.emoji ? `${esc(d.icon.emoji)} ` : "";
      return `<div class="nb-callout"><span class="nb-callout-i">${icon}</span><div>${renderRichText(
        d.rich_text
      )}${kids}</div></div>`;
    }
    case "code":
      return `<pre class="nb-code"><code>${esc(plain(d.rich_text))}</code></pre>`;
    case "divider":
      return `<hr class="nb-hr"/>`;
    case "image": {
      const src = d.type === "external" ? d.external.url : d.file && d.file.url;
      const cap = renderRichText(d.caption);
      return src
        ? `<figure class="nb-fig"><img src="${esc(
            src
          )}" alt="" loading="lazy"/>${
            cap ? `<figcaption>${cap}</figcaption>` : ""
          }</figure>`
        : "";
    }
    case "toggle":
      return `<details class="nb-toggle"><summary>${renderRichText(
        d.rich_text
      )}</summary><div class="nb-toggle-body">${kids}</div></details>`;
    case "bookmark":
    case "embed":
    case "link_preview": {
      const u = d.url;
      return u
        ? `<p><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></p>`
        : "";
    }
    case "child_page":
      return `<p class="nb-childpage">📄 ${esc(d.title || "Subpage")}</p>`;
    default: {
      const rt = d.rich_text ? renderRichText(d.rich_text) : "";
      return rt ? `<p>${rt}${kids}</p>` : kids;
    }
  }
}

// Render a flat block list, grouping consecutive list items into <ul>/<ol>.
function renderBlocks(blocks) {
  let html = "";
  let listTag = null;
  let buf = [];
  const flush = () => {
    if (listTag) {
      html += `<${listTag} class="nb-list">${buf.join("")}</${listTag}>`;
      listTag = null;
      buf = [];
    }
  };
  for (const b of blocks || []) {
    const t = b.type;
    if (t === "bulleted_list_item" || t === "numbered_list_item") {
      const tag = t === "bulleted_list_item" ? "ul" : "ol";
      if (listTag && listTag !== tag) flush();
      listTag = tag;
      const inner =
        renderRichText(b[t].rich_text) +
        (b._children ? renderBlocks(b._children) : "");
      buf.push(`<li>${inner}</li>`);
      continue;
    }
    flush();
    html += renderOne(b);
  }
  flush();
  return html;
}

// Fetch a page's agenda metadata + rendered body content.
export async function fetchEventPage(id, { token = process.env.NOTION_TOKEN } = {}) {
  if (!token) throw new Error("Missing NOTION_TOKEN environment variable.");

  const page = await fetchJson(`https://api.notion.com/v1/pages/${id}`, token);
  const props = page.properties || {};
  const title = plain(props.Event && props.Event.title) || "(untitled)";
  const meta = {
    slot: plain(props.Slot && props.Slot.rich_text),
    city: (props.City && props.City.select && props.City.select.name) || null,
    status:
      (props.Status && props.Status.status && props.Status.status.name) || null,
    contacts: ((props.KeyContact && props.KeyContact.multi_select) || []).map(
      (o) => o.name
    ),
    date: (props.Date && props.Date.date && props.Date.date.start) || null,
    url: page.url || "",
  };

  const blocks = await fetchChildren(id, token, 0);
  const contentHtml = renderBlocks(blocks);
  return { title, meta, contentHtml };
}
