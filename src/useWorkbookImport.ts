import { useCallback, useEffect, useRef, useState } from 'react';
import { type ImportedLogbook } from './logbook';
import { MAX_FILE_BYTES } from './workbookGuard';

type ImportState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; book: ImportedLogbook }
  | { status: 'error'; error: string };

type ImportReply = { ok: boolean; result?: ImportedLogbook; error?: string };

// Owns only the in-memory import and its disposable worker. Filters, navigation,
// chart choices and the file input stay with the presenting component.
export function useWorkbookImport() {
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const generation = useRef(0);
  const job = useRef<{ worker: Worker; timer: ReturnType<typeof setTimeout> } | null>(null);

  const dispose = useCallback(() => {
    // Invalidate pending reads as well as queued replies, including after timeout
    // or successful completion. Termination alone is not a stale-result guard.
    generation.current++;
    if (job.current) {
      const { worker, timer } = job.current;
      job.current = null;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => dispose, [dispose]);

  const clear = useCallback(() => {
    dispose();
    setState({ status: 'idle' });
  }, [dispose]);

  const openFile = useCallback(async (file: File) => {
    dispose();
    const token = generation.current;
    const finish = (next: ImportState) => {
      if (token !== generation.current) return;
      dispose();
      setState(next);
    };
    // Replacement always drops the previous book, even if preflight fails.
    if (file.name.toLowerCase().endsWith('.zip')) {
      finish({ status: 'error', error: 'Extract the ZIP, open the workbook in Excel, remove its opening password and save an unencrypted .xlsx copy to import. Keep the unencrypted copy secure.' });
      return;
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      finish({ status: 'error', error: 'Choose a native .xlsx export. .xls and CSV are not supported in this slice.' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      finish({ status: 'error', error: 'File exceeds the 5 MiB limit. Nothing was imported.' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const bytes = await file.arrayBuffer();
      if (token !== generation.current) return;
      const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
      // The existing 10-second budget begins with parsing, not the file read.
      const timer = setTimeout(() => finish({ status: 'error', error: 'Import exceeded 10 seconds and was stopped. No data was retained.' }), 10_000);
      job.current = { worker, timer };
      worker.onmessage = (event: MessageEvent<ImportReply>) => {
        if (event.data.ok && event.data.result) finish({ status: 'ready', book: event.data.result });
        else finish({ status: 'error', error: event.data.error ?? 'Could not read this workbook.' });
      };
      worker.onerror = () => finish({ status: 'error', error: 'Could not read this workbook. Import stopped.' });
      worker.postMessage(bytes, [bytes]);
    } catch {
      // Covers file reads, worker creation and transfer; never expose raw errors.
      finish({ status: 'error', error: 'Could not read this file. Nothing was imported.' });
    }
  }, [dispose]);

  return { state, openFile, clear };
}
