// Vercel serverless function: on POST, triggers a fresh production build by
// pinging the Vercel Deploy Hook. The hook URL is read from an environment
// variable so it never appears in the (public) client bundle or repo.
//
// Setup: add VERCEL_DEPLOY_HOOK_URL in the Vercel project's Environment
// Variables (Settings → Environment Variables). Get the URL from
// Settings → Git → Deploy Hooks.
//
// This runs only on the Vercel deployment. On GitHub Pages (pure static) the
// endpoint is absent and the client falls back to a plain reload.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hook) {
    return res
      .status(503)
      .json({ error: "Refresh not configured (missing VERCEL_DEPLOY_HOOK_URL)" });
  }

  try {
    const r = await fetch(hook, { method: "POST" });
    if (!r.ok) throw new Error(`deploy hook responded ${r.status}`);
    return res.status(202).json({ triggered: true });
  } catch (err) {
    return res.status(502).json({ error: "Failed to trigger rebuild" });
  }
}
