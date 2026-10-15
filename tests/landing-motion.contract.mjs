// Small, browser-free lifecycle regression against the local landing implementation.
// DOM, time and React scheduling are controlled; CSS/real focus remain browser acceptance.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.env.MOTION_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['src/landing/ProjectPage.tsx'];
function setup(file) {
  let reduced = false, nextTimer = 0, now = 0, focused;
  const timers = new Map();
  class Element {
    listeners = new Map(); attrs = new Map(); open = false;
    style = { setProperty() {} };
    addEventListener(type, fn, options) { const list = this.listeners.get(type) || []; list.push({fn, once: options?.once}); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(x => x.fn !== fn)); }
    emit(type, extras = {}) { const event = {target: this, animationName: '', pseudoElement: '', preventDefault() {}, ...extras}; for (const item of [...(this.listeners.get(type) || [])]) { if (item.once) this.removeEventListener(type, item.fn); item.fn(event); } }
    setAttribute(k, v) { this.attrs.set(k,v); }
    removeAttribute(k) { this.attrs.delete(k); }
    hasAttribute(k) { return this.attrs.has(k); }
    getAttribute(k) { return this.attrs.get(k); }
    getBoundingClientRect() { return {left: 0, top: 0, width: 100, height: 200}; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    focus() { focused = this; }
    querySelector(s) { return this.children?.[s] || null; }
    closest() { return {querySelector: () => ({textContent: 'Original caption'})}; }
  }
  const dialog = new Element(), figure = new Element(), image = new Element(), button = new Element(), closeButton = new Element();
  Object.assign(image, {width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, alt: 'Original alt'});
  image.setAttribute('src', 'original.png');
  button.children = {img: image};
  dialog.children = {figure, img: image, '.held-caption': {}, '.put-down': closeButton};
  const window = {matchMedia: () => ({matches: reduced}), setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, {fn, at: now + ms}); return id; }, clearTimeout(id) {timers.delete(id);} };
  const context = {window, document: {querySelector: () => dialog, querySelectorAll: () => [button]}, console};
  let api, cleanup = () => {}, render = () => {};
  if (file.endsWith('.tsx')) {
    let refs = [], cursor = 0, state = null, deps, effect;
    const react = {useRef: value => refs[cursor++] ||= {current: value}, useState: () => [state, value => {state = value;}], useLayoutEffect(fn, next) { if (!deps || next.some((x,i) => x !== deps[i])) {effect = fn; deps = next;} }};
    context.exports = {};
    context.require = name => name === 'react' ? react : {};
    const source = readFileSync(path.join(root, file), 'utf8') + '\nexports.motionHook = useHeldShot;';
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React}}).outputText, context);
    render = () => { cursor = 0; api = context.exports.motionHook([image]); refs[0].current = dialog; refs[1].current = [button]; if (effect) {const run = effect; effect = null; cleanup(); cleanup = run() || (() => {});} };
    render();
    dialog.addEventListener('close', () => api.onClosed());
  } else vm.runInNewContext(readFileSync(path.join(root,file),'utf8'), context);
  return {dialog, figure, timers, open() { if (api) {api.pickUp(0); render();} else button.emit('click'); }, close() {if (api) api.putDown(); else closeButton.emit('click'); render();}, nativeClose() {dialog.close(); render();}, unmount() {cleanup();}, reduced(value) {reduced = value;}, end(target, animationName, pseudoElement = '') {dialog.emit('animationend', {target, animationName, pseudoElement});}, advance(ms) {now += ms; for (const [id,t] of [...timers]) if (t.at <= now) {timers.delete(id); t.fn();} render();}, focused: () => focused};
}
for (const file of files) {
  test(`${file}: backdrop and unrelated events cannot finish lift/drop`, () => {
    const h = setup(file); h.open();
    h.end(h.dialog, 'print-fade', '::backdrop');
    assert.ok(h.dialog.hasAttribute('data-lifting'), '300ms backdrop must not cancel 480ms figure lift');
    h.end(h.figure, 'unrelated'); h.end(h.dialog, 'print-lift'); h.end(h.figure, 'print-lift', '::before');
    assert.ok(h.dialog.hasAttribute('data-lifting'));
    h.end(h.figure, 'print-lift'); assert.ok(!h.dialog.hasAttribute('data-lifting')); assert.equal(h.timers.size, 0);
    h.close(); h.end(h.dialog, 'print-lift'); h.end(h.figure, 'print-fade'); assert.ok(h.dialog.open);
    h.end(h.figure, 'print-lift'); assert.ok(!h.dialog.open); assert.equal(h.timers.size, 0);
  });
  test(`${file}: interrupted lift, repeated close, fallback, reopen`, () => {
    const h = setup(file); h.open(); h.close();
    assert.ok(!h.dialog.hasAttribute('data-lifting')); assert.ok(h.dialog.hasAttribute('data-dropping')); assert.equal(h.timers.size, 1);
    h.close(); assert.equal(h.timers.size, 1);
    h.advance(360); assert.ok(!h.dialog.open); assert.equal(h.timers.size, 0);
    h.open(); h.advance(240); assert.ok(h.dialog.hasAttribute('data-lifting'), 'old lift timer must not affect new opening');
    h.advance(360); assert.ok(!h.dialog.hasAttribute('data-lifting')); assert.equal(h.timers.size, 0);
    h.end(h.figure, 'print-lift'); assert.ok(h.dialog.open);
  });
  test(`${file}: external close and reduced-motion reopening clear pending work`, () => {
    const h = setup(file); h.open(); h.nativeClose(); assert.equal(h.timers.size, 0);
    h.reduced(true); h.open(); assert.ok(!h.dialog.hasAttribute('data-lifting')); assert.ok(!h.dialog.hasAttribute('data-dropping')); assert.equal(h.timers.size, 0);
    h.advance(1000); assert.ok(h.dialog.open); h.close(); assert.ok(!h.dialog.open);
    h.reduced(false); h.open(); h.reduced(true); h.close(); assert.equal(h.timers.size, 0);
  });
  test(`${file}: cancelled callbacks and queued close events cannot affect a reopened dialog`, () => {
    const h = setup(file); h.open();
    const oldLift = [...h.timers.values()][0].fn;
    h.close(); const oldDrop = [...h.timers.values()].at(-1).fn;
    h.nativeClose(); h.open();
    oldLift(); oldDrop(); h.dialog.emit('close');
    assert.ok(h.dialog.open); assert.ok(h.dialog.hasAttribute('data-lifting'));
    h.end(h.figure, 'print-lift');
    assert.equal(h.timers.size, 0); assert.equal(h.dialog.listeners.get('animationend').length, 0);
    h.close(); h.advance(360);
    assert.equal(h.timers.size, 0); assert.equal(h.dialog.listeners.get('animationend').length, 0);
  });
  test(`${file}: reopening the same print before the queued native close event opens a new cycle`, () => {
    const h = setup(file); h.open();
    // Native dialog.close() removes open synchronously but queues its close event.
    h.dialog.open = false;
    h.open();
    assert.ok(h.dialog.open, 'same-index reopening must not be discarded as unchanged state');
    h.dialog.emit('close');
    assert.ok(h.dialog.open, 'the old close event must not close the new cycle');
    h.end(h.figure, 'print-lift'); assert.equal(h.timers.size, 0);
  });
  if (file.endsWith('.tsx')) test(`${file}: unmount cancels pending work`, () => {
    const h = setup(file); h.open(); h.unmount(); assert.equal(h.timers.size, 0); assert.ok(!h.dialog.open);
  });
}
