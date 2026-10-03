import { importWorkbook } from './logbook';
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ ok: true, result: await importWorkbook(new Uint8Array(event.data)) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Could not read this workbook.' });
  }
};
