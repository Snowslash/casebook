import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(path, 'utf8');

describe('landing and explorer route contract', () => {
  it('pins the approved archive and opts both routes into Projects navigation', () => {
    const pin = 'file:vendor/sangeev-estate-ui-2.0.0-alpha.7.tgz';
    expect(text('.gitignore')).toContain(`!/${pin.slice('file:'.length)}`);
    expect(JSON.parse(text('package.json')).dependencies['@sangeev/estate-ui']).toBe(pin);
    const lock = JSON.parse(text('package-lock.json'));
    expect(lock.packages[''].dependencies['@sangeev/estate-ui']).toBe(pin);
    expect(lock.packages['node_modules/@sangeev/estate-ui'].version).toBe('2.0.0-alpha.7');
    for (const path of ['src/App.tsx', 'src/landing/ProjectPage.tsx']) {
      expect(text(path)).toMatch(/<PublicEstateHeader[^>]*navigation="projects"/);
    }
  });
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
    expect(text('src/landing/LandingPage.tsx')).toContain('<ProjectPage project={project} />');
    const page = text('src/landing/ProjectPage.tsx');
    const project = text('src/landing/project.ts');
    const source = page + project;
    expect(page).toMatch(/<PublicEstateHeader[^>]*current=\{project\.key as EstatePage\}[\s\S]*<EstateShell variant="landing"/);
    for (const component of ['EstatePageTitle', 'EstateSectionTitle']) expect(page).toContain(component);
    expect(project).toContain("key: 'casebook'");
    expect(project).toContain("href: './app/'");
    expect(project).toContain('https://github.com/Snowslash/casebook');
    expect(page).toContain('https://sangeev.me/#${project.key}');
    expect(source).not.toMatch(/import .*App|importWorkbook|localStorage|fetch\(/);
    expect(text('src/landing/main.tsx')).toContain('initialiseEstateTheme()');
    expect(text('src/landing/styles.css')).toContain('@sangeev/estate-ui/contract.css');
  });

  it('keeps the example download at a valid root URL when the app moves', () => {
    expect(text('src/App.tsx')).toContain('href="/synthetic-logbook.xlsx"');
  });
});
