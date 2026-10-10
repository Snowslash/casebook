"""Crawler/artifact contract; optional real Pages HTTP checks, never a Vite fallback test.

Run after building: python3 scripts/check_crawl.py
Against Wrangler Pages: CASEBOOK_HTTP_ORIGIN=http://127.0.0.1:9314 python3 scripts/check_crawl.py
"""
import os
from pathlib import Path
import unittest
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, build_opener
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = os.environ.get("CASEBOOK_HTTP_ORIGIN", "")
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get(path):
    try:
        response = build_opener(NoRedirect).open(ORIGIN + path, timeout=15)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


class CrawlContract(unittest.TestCase):
    def check_robots(self, body):
        text = body.decode("utf-8")
        self.assertNotIn("<", text)
        self.assertEqual(text.splitlines(), ["User-agent: *", "Allow: /", "Sitemap: https://casebook.sangeev.me/sitemap.xml"])

    def check_sitemap(self, body):
        root = ET.fromstring(body)
        self.assertEqual(root.tag, NS + "urlset")
        self.assertEqual([loc.text for loc in root.findall(NS + "url/" + NS + "loc")], ["https://casebook.sangeev.me/"])
        self.assertIsNone(root.find(".//" + NS + "lastmod"))

    def test_source_and_built_robots(self):
        for directory in ("public", "dist"):
            with self.subTest(directory=directory):
                path = ROOT / directory / "robots.txt"
                self.assertTrue(path.is_file(), f"Missing crawler file: {path}")
                self.check_robots(path.read_bytes())

    def test_source_and_built_sitemap(self):
        for directory in ("public", "dist"):
            with self.subTest(directory=directory):
                path = ROOT / directory / "sitemap.xml"
                self.assertTrue(path.is_file(), f"Missing sitemap: {path}")
                self.check_sitemap(path.read_bytes())

    def test_explicit_not_found_without_catchall_rewrites(self):
        for directory in ("public", "dist"):
            with self.subTest(directory=directory):
                path = ROOT / directory / "404.html"
                self.assertTrue(path.is_file(), "Pages needs top-level 404.html to disable implicit SPA fallback")
                text = path.read_text()
                self.assertIn("<h1>Page not found</h1>", text)
                self.assertIn('href="/"', text)
                self.assertIn('href="/app/"', text)
                self.assertNotIn("<script", text)
                self.assertNotIn('rel="canonical"', text)
                self.assertFalse((ROOT / directory / "_redirects").exists())

    def test_built_copies_and_unchanged_app_indexing(self):
        for name in ("robots.txt", "sitemap.xml", "404.html", "_headers"):
            with self.subTest(name=name):
                self.assertTrue((ROOT / "public" / name).is_file())
                self.assertTrue((ROOT / "dist" / name).is_file())
                self.assertEqual((ROOT / "public" / name).read_bytes(), (ROOT / "dist" / name).read_bytes())
        app = (ROOT / "dist/app/index.html").read_text()
        self.assertNotIn('rel="canonical"', app)
        self.assertNotIn("noindex", app)

    @unittest.skipUnless(ORIGIN, "Set CASEBOOK_HTTP_ORIGIN to the real Pages emulator")
    def test_http_crawler_files(self):
        for path, mime, check in (("/robots.txt", "text/plain", self.check_robots), ("/sitemap.xml", "application/xml", self.check_sitemap)):
            with self.subTest(path=path):
                status, headers, body = get(path)
                self.assertEqual(status, 200)
                self.assertEqual(headers.get_content_type(), mime)
                check(body)

    @unittest.skipUnless(ORIGIN, "Set CASEBOOK_HTTP_ORIGIN to the real Pages emulator")
    def test_http_missing_paths(self):
        for path in ("/__estate_audit_nonexistent_20261010_b8f6d2__", "/app/missing", "/app/missing/", "/assets/missing.js", "/licenses/missing.txt"):
            with self.subTest(path=path):
                status, headers, body = get(path)
                self.assertEqual(status, 404)
                self.assertEqual(headers.get_content_type(), "text/html")
                self.assertEqual(body, (ROOT / "dist/404.html").read_bytes())
                self.assertIn("connect-src 'none'", headers["Content-Security-Policy"])

    @unittest.skipUnless(ORIGIN, "Set CASEBOOK_HTTP_ORIGIN to the real Pages emulator")
    def test_http_supported_routes_aliases_and_every_asset(self):
        for path, file in (("/", "index.html"), ("/app/", "app/index.html"), ("/app/?synthetic=1", "app/index.html")):
            with self.subTest(path=path):
                status, headers, body = get(path)
                self.assertEqual(status, 200)
                self.assertEqual(body, (ROOT / "dist" / file).read_bytes())
                self.assertIn("connect-src 'none'", headers["Content-Security-Policy"])
        for path, destination in (("/app", "/app/"), ("/app/index.html", "/app/"), ("/index.html", "/"), ("/app?synthetic=1", "/app/?synthetic=1")):
            with self.subTest(path=path):
                status, headers, _ = get(path)
                self.assertEqual(status, 308)
                self.assertEqual(headers["Location"].removeprefix(ORIGIN), destination)
        for file in sorted((ROOT / "dist").rglob("*")):
            if not file.is_file() or file.suffix == ".html" or file.name.startswith("_"):
                continue
            path = "/" + file.relative_to(ROOT / "dist").as_posix()
            with self.subTest(path=path):
                status, headers, body = get(path)
                self.assertEqual(status, 200)
                self.assertEqual(body, file.read_bytes())
                self.assertNotEqual(headers.get_content_type(), "text/html")


if __name__ == "__main__":
    unittest.main(verbosity=2)
