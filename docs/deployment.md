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

## Crawler files and missing routes

The app has no client-side path router: `/` is the landing page and `/app/` is the explorer. Its `#source-rows` link is an in-document fragment; filters and imported rows are in memory, not URL paths. Pages retains its native 308 aliases from `/index.html` to `/` and from `/app` or `/app/index.html` to `/app/`, preserving query strings. No wildcard rewrite is needed or supported.

`public/robots.txt` and `public/sitemap.xml` are copied unchanged into `dist`. The sitemap lists only `https://casebook.sangeev.me/` as a minimal discovery entry. This does not change app indexing policy: there is no new app canonical, noindex or crawler exclusion.

The top-level `public/404.html`, copied to `dist/404.html`, disables Pages' implicit SPA homepage fallback. Unknown root paths, unknown `/app/` descendants and missing assets now receive the static not-found document with HTTP 404. Existing bundled assets, the synthetic example and licence files remain ordinary file routes. The two application entrypoints, theme package and `_headers` are unchanged.

After building, run `npm run test:crawl` for source/artifact checks. For actual Pages semantics, run a locally available Wrangler (no deployment) and then set `CASEBOOK_HTTP_ORIGIN=http://127.0.0.1:9314 npm run test:crawl`. Vite preview alone is not a route-status check: it does not model Pages' implicit SPA fallback or `_headers`. The HTTP checks verify MIME types, parsed XML, missing paths, redirects, distinct entrypoint bytes and every emitted asset. Keep the emulator bound to loopback and use a compatibility date supported by its cached runtime via CLI only.

## Keep Cloudflare JavaScript Detections out of the HTML

Only the two canonical HTML routes, `/` and `/app/`, receive `Cache-Control: public, max-age=0, must-revalidate, no-transform`. This preserves the existing revalidation policy while asking intermediaries not to transform the document. Cloudflare [documents that `no-transform` suppresses JavaScript Detections injection](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/#if-your-origin-sends-a-no-transform-header); the detection result is then missing for those requests. It is not an exemption from other security checks or a general guarantee against all provider script injection.

No zone-wide bot setting or CSP relaxation is required. Do not allow inline scripts just to silence Cloudflare console errors. Scripts, workers, stylesheets, fonts, images, the synthetic workbook and licence files do not receive this cache override. `no-transform` can also prevent intermediary compression/transformation, which is why it is limited to the small HTML documents rather than the assets.

After publishing, check both canonical routes on the custom domain and the immutable Pages deployment: the header must be present, HTML must match the reviewed build without `/cdn-cgi/challenge-platform/scripts/jsd/main.js`, and fresh synthetic browser journeys must have no CSP/runtime errors. Confirm assets have no `no-transform` override. A passing local header fixture does not prove that the provider honours the directive.
