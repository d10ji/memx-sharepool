# memex

A personal archive of standalone HTML pages (study notes, practice, interview prep, and whatever
comes next) with a single homepage (`index.html`) that automatically lists every page as a
clickable catalog entry. Deployed at `https://memex.vercel.app`.

Each page is fully independent — its own URL, never embedded inside another page. The homepage
is a fixed template you never hand-edit; it reads its list from `pages.js`, which is regenerated
by `build.js` on every deploy.

## Everyday use

1. Add a new `.html` file to this folder, or edit an existing one.
2. Commit and push:

   ```bash
   git add .
   git commit -m "add/update a page"
   git push
   ```
3. Vercel re-runs `build.js`, regenerates `pages.js`, and the homepage shows the new list.
   **You never edit `index.html`.**

## Optional per-page tuning

Add any of these inside a page's `<head>` (all optional):

```html
<meta name="hub-title"  content="Card title">   <!-- overrides the page <title> on the card -->
<meta name="hub-desc"   content="Short blurb">   <!-- description shown under the title -->
<meta name="hub-order"  content="10">            <!-- sort key, lower = earlier -->
<meta name="hub-hidden" content="true">          <!-- keep this page off the homepage -->
```

With no meta tags, a page just uses its `<title>` and sorts alphabetically.

## Local preview

- Double-click `index.html` — it works offline because `pages.js` is loaded as a script.
- After adding or renaming a page locally, refresh the list with:

  ```bash
  node build.js
  ```

  (Node is only needed for local rebuilds; Vercel provides it automatically on deploy.)

## One-time deploy (Vercel)

1. Push this folder to a GitHub repo named **`memex`** (public or private both work).
2. In Vercel: **Add New… → Project → Import** the repo.
   - Set the **Project Name** to `memex` → your URL becomes `https://memex.vercel.app`.
   - Framework Preset: **Other**
   - Build Command: `node build.js` (already set in `vercel.json`)
   - Output Directory: `.` (already set in `vercel.json`)
3. Deploy. Every future `git push` redeploys and refreshes the homepage automatically.
