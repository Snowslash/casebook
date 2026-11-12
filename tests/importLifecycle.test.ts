// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { type ImportedLogbook } from '../src/logbook';
import { MAX_FILE_BYTES } from '../src/workbookGuard';

// Medium integration: real React owner and DOM; only file completion and the
// browser Worker boundary are controlled. Parser/privacy and real workers are
// covered separately by the workbook and Chromium suites.
class ControlledWorker {
  static instances: ControlledWorker[] = [];
  static constructionError = false;
  static transferError = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  transferred?: ArrayBuffer;
  terminate = vi.fn();
  postMessage = vi.fn((bytes: ArrayBuffer, transfer: Transferable[]) => {
    if (ControlledWorker.transferError) throw new Error('SYNTHETIC_PRIVATE_TRANSFER_DETAIL');
    this.transferred = structuredClone(bytes, { transfer });
  });
  constructor(public url: URL, public options: WorkerOptions) {
    if (ControlledWorker.constructionError) throw new Error('SYNTHETIC_PRIVATE_CONSTRUCTOR_DETAIL');
    ControlledWorker.instances.push(this);
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function workbook(sheet: string): ImportedLogbook {
  return { sheet, headings: [], ignoredColumns: 0, dateTimeCount: 0, rows: [{
    sourceRow: 2, date: '2026-02-17', dateRaw: '2026-02-17', dateIssue: null,
    operation: 'Synthetic procedure', supervision: 'Performed', hospital: 'Synthetic hospital',
    cepod: null, validation: null, duplicate: false, unknownRole: false,
  }] };
}
function file(name = 'synthetic.xlsx', pending?: ReturnType<typeof deferred<ArrayBuffer>>, size?: number) {
  const bytes = new Uint8Array(readFileSync('public/synthetic-logbook.xlsx')).buffer;
  const value = new File([bytes], name);
  const read = vi.fn(() => pending?.promise ?? Promise.resolve(bytes));
  Object.defineProperty(value, 'arrayBuffer', { value: read });
  if (size !== undefined) Object.defineProperty(value, 'size', { value: size });
  return { value, bytes, read };
}
let root: Root | null;
let container: HTMLDivElement;
async function mount(strict = false) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(strict ? createElement(StrictMode, null, createElement(App)) : createElement(App)));
}
async function unmount() {
  await act(async () => root?.unmount());
  root = null;
}
async function choose(value: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [value] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
async function clear() {
  const button = [...container.querySelectorAll('button')].find(element => element.textContent === 'Clear file')!;
  await act(async () => button.click());
}
async function reply(worker: ControlledWorker, result: ImportedLogbook) {
  await act(async () => worker.onmessage!({ data: { ok: true, result } } as MessageEvent));
}
const worker = () => ControlledWorker.instances.at(-1)!;
const loading = () => container.querySelector('.loading')?.textContent;
const alert = () => container.querySelector('[role="alert"]')?.textContent;
const preview = () => container.querySelector('.preview-summary')?.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', ControlledWorker);
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ media, matches: false, addEventListener() {}, removeEventListener() {} })));
  ControlledWorker.instances = [];
  ControlledWorker.constructionError = false;
  ControlledWorker.transferError = false;
});
afterEach(async () => {
  await unmount();
  container?.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('workbook import owner lifecycle', () => {
  it('moves idle → loading → ready with transferable bytes and a disposable module worker', async () => {
    await mount();
    expect(loading()).toBeUndefined();
    expect(alert()).toBeUndefined();
    expect(preview()).toBeUndefined();
    const input = file();
    await choose(input.value);
    expect(loading()).toContain('Reading workbook locally');
    expect(worker().url.pathname).toContain('import.worker.ts');
    expect(worker().options).toEqual({ type: 'module' });
    expect(worker().postMessage).toHaveBeenCalledWith(input.bytes, [input.bytes]);
    expect(input.bytes.byteLength).toBe(0); // Real structured-clone transfer, not a copied payload.
    expect(worker().transferred!.byteLength).toBeGreaterThan(0);
    await reply(worker(), workbook('Synthetic A'));
    expect(preview()).toContain('Synthetic A');
    expect(loading()).toBeUndefined();
    expect(worker().terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the prior ready workbook immediately when replacement reading starts', async () => {
    await mount();
    await choose(file().value);
    await reply(worker(), workbook('Synthetic A'));
    const pending = deferred<ArrayBuffer>();
    await choose(file('replacement.xlsx', pending).value);
    expect(preview()).toBeUndefined();
    expect(loading()).toContain('Reading workbook locally');
    expect(alert()).toBeUndefined();
    await act(async () => pending.resolve(new ArrayBuffer(8)));
    await reply(worker(), workbook('Synthetic B'));
    expect(preview()).toContain('Synthetic B');
    expect(preview()).not.toContain('Synthetic A');
  });

  it('ignores out-of-order worker replies without terminating or finishing the replacement', async () => {
    await mount();
    await choose(file().value);
    const previous = worker();
    const lateMessage = previous.onmessage!;
    const lateError = previous.onerror!;
    await choose(file('replacement.xlsx').value);
    const current = worker();
    expect(previous.terminate).toHaveBeenCalledTimes(1);
    await act(async () => {
      lateMessage({ data: { ok: true, result: workbook('STALE') } } as MessageEvent);
      lateError();
    });
    expect(preview()).toBeUndefined();
    expect(loading()).toContain('Reading workbook locally');
    expect(current.terminate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    await reply(current, workbook('CURRENT'));
    await act(async () => lateMessage({ data: { ok: true, result: workbook('STALE') } } as MessageEvent));
    expect(preview()).toContain('CURRENT');
    expect(preview()).not.toContain('STALE');
    expect(alert()).toBeUndefined();
  });

  it.each(['resolve', 'reject'] as const)('suppresses an old file read that %ss after the replacement is ready', async completion => {
    await mount();
    const pending = deferred<ArrayBuffer>();
    await choose(file('old.xlsx', pending).value);
    await choose(file('new.xlsx').value);
    await reply(worker(), workbook('CURRENT'));
    await act(async () => completion === 'resolve' ? pending.resolve(new ArrayBuffer(8)) : pending.reject(new Error('SYNTHETIC_PRIVATE_READ_DETAIL')));
    expect(ControlledWorker.instances).toHaveLength(1);
    expect(preview()).toContain('CURRENT');
    expect(alert()).toBeUndefined();
  });

  it('retains no previous workbook after a worker rejects a replacement, then allows recovery', async () => {
    await mount();
    await choose(file().value);
    await reply(worker(), workbook('Synthetic A'));
    await choose(file('replacement.xlsx').value);
    await act(async () => worker().onmessage!({ data: { ok: false, error: 'Exactly one visible worksheet required.' } } as MessageEvent));
    expect(preview()).toBeUndefined();
    expect(alert()).toBe('Exactly one visible worksheet required.');
    expect(loading()).toBeUndefined();
    expect(worker().terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await choose(file('recovery.xlsx').value);
    expect(alert()).toBeUndefined();
    await reply(worker(), workbook('Recovered'));
    expect(preview()).toContain('Recovered');
  });

  it.each([
    ['synthetic.ZIP', undefined, 'Extract the ZIP'],
    ['synthetic.xls', undefined, 'Choose a native .xlsx'],
    ['synthetic.csv', undefined, 'Choose a native .xlsx'],
    ['large.xlsx', MAX_FILE_BYTES + 1, '5 MiB limit'],
  ] as [string, number | undefined, string][])('rejects %s before reading bytes, clearing any ready workbook', async (name, size, message) => {
    await mount();
    await choose(file().value);
    await reply(worker(), workbook('Synthetic A'));
    const invalid = file(name, undefined, size);
    await choose(invalid.value);
    expect(invalid.read).not.toHaveBeenCalled();
    expect(ControlledWorker.instances).toHaveLength(1);
    expect(preview()).toBeUndefined();
    expect(loading()).toBeUndefined();
    expect(alert()).toContain(message);
  });

  it('accepts an uppercase XLSX suffix at the exact file-size limit', async () => {
    await mount();
    await choose(file('synthetic.XLSX', undefined, MAX_FILE_BYTES).value);
    expect(loading()).toContain('Reading workbook locally');
    await reply(worker(), workbook('At the limit'));
    expect(preview()).toContain('At the limit');
  });

  it('surfaces a content-free file-read failure with no worker or retained book', async () => {
    await mount();
    const pending = deferred<ArrayBuffer>();
    await choose(file('synthetic.xlsx', pending).value);
    await act(async () => pending.reject(new Error('SYNTHETIC_PRIVATE_READ_DETAIL')));
    expect(alert()).toBe('Could not read this file. Nothing was imported.');
    expect(loading()).toBeUndefined();
    expect(preview()).toBeUndefined();
    expect(ControlledWorker.instances).toHaveLength(0);
  });

  it('surfaces a content-free worker-construction failure', async () => {
    await mount();
    ControlledWorker.constructionError = true;
    await choose(file().value);
    expect(alert()).toBe('Could not read this file. Nothing was imported.');
    expect(loading()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposes the worker and timer when transfer fails', async () => {
    await mount();
    ControlledWorker.transferError = true;
    await choose(file().value);
    expect(alert()).toBe('Could not read this file. Nothing was imported.');
    expect(worker().terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(alert()).toBe('Could not read this file. Nothing was imported.');
  });

  it('surfaces a worker runtime failure without retaining data or its timer', async () => {
    await mount();
    await choose(file().value);
    await act(async () => worker().onerror!());
    expect(alert()).toBe('Could not read this workbook. Import stopped.');
    expect(preview()).toBeUndefined();
    expect(loading()).toBeUndefined();
    expect(worker().terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the fallback diagnostic for a failed or incomplete worker reply', async () => {
    await mount();
    await choose(file().value);
    await act(async () => worker().onmessage!({ data: { ok: true } } as MessageEvent));
    expect(alert()).toBe('Could not read this workbook.');
    expect(preview()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out at 10 seconds and ignores a captured late success after disposal', async () => {
    await mount();
    await choose(file().value);
    const lateMessage = worker().onmessage!;
    await act(async () => vi.advanceTimersByTime(9_999));
    expect(loading()).toContain('Reading workbook locally');
    await act(async () => vi.advanceTimersByTime(1));
    expect(alert()).toBe('Import exceeded 10 seconds and was stopped. No data was retained.');
    expect(worker().terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => lateMessage({ data: { ok: true, result: workbook('STALE') } } as MessageEvent));
    expect(preview()).toBeUndefined();
    expect(alert()).toContain('Import exceeded 10 seconds');
  });

  it('cancels an in-flight worker on Clear without resurrection from queued callbacks', async () => {
    await mount();
    await choose(file().value);
    const lateMessage = worker().onmessage!;
    await clear();
    expect(worker().terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => lateMessage({ data: { ok: true, result: workbook('STALE') } } as MessageEvent));
    expect(preview()).toBeUndefined();
    expect(alert()).toBeUndefined();
    expect(loading()).toBeUndefined();
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.value).toBe('');
  });

  it('cancels during file reading before any worker can start', async () => {
    await mount();
    const pending = deferred<ArrayBuffer>();
    await choose(file('synthetic.xlsx', pending).value);
    await clear();
    await act(async () => pending.resolve(new ArrayBuffer(8)));
    expect(ControlledWorker.instances).toHaveLength(0);
    expect(preview()).toBeUndefined();
    expect(loading()).toBeUndefined();
  });

  it('disposes the active worker and timer on owner unmount', async () => {
    await mount();
    await choose(file().value);
    const lateMessage = worker().onmessage!;
    await unmount();
    expect(worker().terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => lateMessage({ data: { ok: true, result: workbook('STALE') } } as MessageEvent));
    expect(container.textContent).toBe('');
    expect(worker().terminate).toHaveBeenCalledTimes(1);
  });

  it('invalidates a pending file read on owner unmount, before worker creation', async () => {
    await mount();
    const pending = deferred<ArrayBuffer>();
    await choose(file('synthetic.xlsx', pending).value);
    await unmount();
    await act(async () => pending.resolve(new ArrayBuffer(8)));
    expect(ControlledWorker.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still imports after the StrictMode setup/cleanup probe, then disposes on unmount', async () => {
    await mount(true);
    await choose(file().value);
    await reply(worker(), workbook('Strict owner'));
    expect(preview()).toContain('Strict owner');
    await choose(file('replacement.xlsx').value);
    await unmount();
    expect(worker().terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
