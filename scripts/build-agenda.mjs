import { writeFile, mkdir } from "node:fs/promises";
import { renderBody } from "./render.mjs";
import { fetchAgendaRows, formatGeneratedAt, DATABASE_URL } from "./notion.mjs";

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
  let rows;
  try {
    rows = await fetchAgendaRows();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const body = renderBody(rows, {
    generatedAt: formatGeneratedAt(),
    databaseUrl: DATABASE_URL,
  });
  const html = wrapDocument(body);

  await mkdir("public", { recursive: true });
  await writeFile("public/index.html", html, "utf8");
  console.log(`Wrote public/index.html with ${rows.length} agenda items.`);
}

main();
