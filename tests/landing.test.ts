import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(path, 'utf8');

describe('landing and explorer route contract', () => {
  it('keeps distinct root landing and nested explorer entrypoints with the same CSP', () => {
    expect(existsSync('app/index.html')).toBe(true);
    const landing = text('index.html');
    const app = text('app/index.html');
    expect(landing).toContain('src="/src/landing/main.tsx"');
    expect(app).toContain('src="/src/main.tsx"');
    const policy = (html: string) => html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    expect(policy(app)).toBe(policy(landing));
    expect(landing).toContain('href="./app/"');
    expect(landing).toContain('https://casebook.sangeev.me/');
  });

  it('composes the landing from the pinned package without importing explorer state', () => {
    expect(existsSync('src/landing/LandingPage.tsx')).toBe(true);
    const source = text('src/landing/LandingPage.tsx');
    expect(source).toMatch(/<PublicEstateHeader[^>]*current="casebook"[\s\S]*<EstateShell variant="landing"/);
    for (const component of ['EstateBoundary', 'EstateEvidenceFrame', 'EstatePageTitle', 'EstateSectionTitle', 'GitHubMark']) expect(source).toContain(component);
    expect(source).toContain('href="./app/"');
    expect(source).toContain('https://github.com/Snowslash/casebook');
    expect(source).toContain('https://sangeev.me/#projects');
    expect(source).not.toMatch(/import .*App|importWorkbook|localStorage|fetch\(/);
    expect(text('src/landing/main.tsx')).toContain('initialiseEstateTheme()');
    expect(text('src/landing/styles.css')).toContain('@sangeev/estate-ui/contract.css');
  });

  it('keeps the example download at a valid root URL when the app moves', () => {
    expect(text('src/App.tsx')).toContain('href="/synthetic-logbook.xlsx"');
  });
});
