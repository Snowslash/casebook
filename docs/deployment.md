# Cloudflare Pages

This is a static Vite application. Connect the GitHub repository to **Cloudflare Pages**, not a Worker deployment, with these settings:

The multi-page build emits `dist/index.html` for the project page and `dist/app/index.html` for the explorer. Publish the whole `dist` directory. The synthetic workbook stays at `/synthetic-logbook.xlsx`, so its download works from the nested app route. No host rewrite or new deployment project is needed for the route split.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm ci --include=dev --ignore-scripts && npm run build` |
| Build output directory | `dist` |
| Environment variable | `SKIP_DEPENDENCY_INSTALL=1` |
| Node runtime | `.node-version` selects `22.23.3`; remove conflicting dashboard overrides |

The explicit install uses the committed lockfile without running dependency lifecycle scripts. It includes the build tools even if a host sets `NODE_ENV=production`. No application secrets, database, backend or private npm registry are required. Do not enable Web Analytics, Browser Insights, Rocket Loader or other script injection for this app.

`public/_headers` is copied to `dist/_headers` for Pages. It preserves the app's existing CSP, adds response-only frame protection and sets MIME-sniffing, referrer and browser-permission restrictions. Ordinary Vite preview does **not** apply this file; the browser suite separately exercises the policy as HTTP headers. Once deployed, verify the actual response headers, assets and synthetic import/filter/reset/clear flow on the Pages URL and custom domain. Local checks are not proof of a Cloudflare deployment.
