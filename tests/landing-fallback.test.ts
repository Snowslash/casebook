import {test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
test('initial landing keeps the privacy boundaries and real destinations without JavaScript', () => {
 const html = readFileSync('index.html', 'utf8');
 for (const text of ['never uploaded or saved', 'keep real logbook exports out of screenshots and bug reports', 'not a validated clinical or portfolio assessment', 'Anything else is turned away rather than guessed at.']) expect(html).toContain(text);
 for (const href of ['./app/', 'https://github.com/Snowslash/casebook#readme', 'https://sangeev.me/#casebook']) expect(html).toContain(`href="${href}"`);
 expect(html.match(/<h1\b/g)).toHaveLength(1);
 expect(html).not.toMatch(/<script[^>]+src="https?:/);
});
