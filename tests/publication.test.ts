import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const text = (path: string) => readFileSync(path, 'utf8');
const json = (path: string) => JSON.parse(text(path));

describe('public release artifacts', () => {
  it('licenses Casebook under MIT and distributes its notice with the static site', () => {
    expect(json('package.json').license).toBe('MIT');
    expect(json('package-lock.json').packages[''].license).toBe('MIT');
    const licence = text('LICENSE');
    expect(licence).toContain('Copyright (c) 2026 Sangeev Ravimohan');
    expect(licence).toContain('Permission is hereby granted, free of charge');
    expect(licence).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(text('public/licenses/MIT-Casebook.txt')).toBe(licence);
  });

  it('ships the licensed shared UI and preserves the separate upstream font notices', () => {
    const base = 'node_modules/@sangeev/estate-ui/';
    expect(json(`${base}package.json`).license).toBe('MIT');
    expect(text('public/licenses/MIT-estate-ui.txt')).toBe(text(`${base}LICENSE`));
    for (const name of ['OFL-Literata.txt', 'OFL-Atkinson-Hyperlegible-Next.txt']) {
      expect(text(`public/licenses/${name}`)).toBe(text(`${base}LICENSES/${name}`));
    }
  });

  it('adds response-only protections without weakening the existing browser CSP', () => {
    const [securityBlock, ...cacheBlocks] = text('public/_headers').trim().split(/\n\s*\n/);
    expect(cacheBlocks).toEqual(['/', '/app/'].map(path => `${path}\n  Cache-Control: public, max-age=0, must-revalidate, no-transform`));
    const lines = securityBlock.split('\n');
    expect(lines.shift()).toBe('/*');
    expect(lines.every(line => /^  [A-Za-z-]+: .+$/.test(line))).toBe(true);
    const headers = Object.fromEntries(lines.map(line => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
    }));
    expect(Object.keys(headers)).toHaveLength(lines.length);
    const meta = text('index.html').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)![1];
    expect(headers['content-security-policy']).toBe(`${meta}; frame-ancestors 'none'`);
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  });

  it('pins an explicit supported Node runtime for Pages rather than relying on package engines', () => {
    expect(text('.node-version').trim()).toBe('22.23.3');
    expect(json('package.json').engines.node).toBe('>=22.23.0 <23');
  });

  it('retains the locked production dependency notices in the static distribution', () => {
    const notices = text('public/licenses/THIRD-PARTY-NOTICES.txt');
    const packages = json('package-lock.json').packages as Record<string, { version: string; dev?: boolean; optional?: boolean }>;
    for (const [path, info] of Object.entries(packages)) {
      if (!path.startsWith('node_modules/') || info.dev || info.optional || path === 'node_modules/@sangeev/estate-ui') continue;
      const name = path.slice('node_modules/'.length);
      expect(notices).toContain(`${name}@${info.version}`);
      const files = readdirSync(path).filter(name => /^(license|licence|copying)(\..*)?$/i.test(name));
      if (files.length) {
        for (const file of files) expect(notices).toContain(text(`${path}/${file}`));
      } else {
        // This exact upstream release declares MIT but ships no licence file.
        expect(name).toBe('worker-f');
        expect(info.version).toBe('0.1.20');
        expect(json(`${path}/package.json`).license).toBe('MIT');
        expect(notices).toContain('worker-f declares MIT in its package metadata but includes no separate licence file.');
        expect(notices).toContain('No copyright year has been inferred.');
      }
    }
  });
});
