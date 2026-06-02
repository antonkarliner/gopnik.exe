// JSON save export / import — portable, lossless backups on top of the
// per-device localStorage autosave. No cloud, no backend: the player downloads
// a .json file and can upload it on another machine/browser. Restores funnel
// through play.js's loadState() migration path so old/partial saves upgrade.
//
// Pure (de)serialization lives in exportSave/importSave so it's unit-testable
// with `node --check`; the DOM helpers (downloadSave/pickSaveFile) are split out.

export const SAVE_FORMAT  = 'gopnik.save';
export const SAVE_VERSION = 'v3';

// Wrap the live STATE in a small, sanity-checkable envelope and pretty-print it.
export function exportSave(state) {
  return JSON.stringify({
    format:  SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  }, null, 2);
}

// Parse a save file's text → inner state object. Throws (with a Russian,
// player-facing message) on anything that isn't a GOPNIK save.
export function importSave(text) {
  let obj;
  try { obj = JSON.parse(text); }
  catch { throw new Error('файл не читается (не JSON).'); }
  if (!obj || typeof obj !== 'object' || obj.format !== SAVE_FORMAT
      || !obj.state || typeof obj.state !== 'object') {
    throw new Error('это не сейв ГОПНИКа.');
  }
  return obj.state;
}

// Trigger a browser download of the serialized save (Blob + temporary anchor).
export function downloadSave(state, nick) {
  const text = exportSave(state);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safe = (nick || 'gopnik').replace(/[\/\\?%*:|"<>\s]+/g, '_').slice(0, 20) || 'gopnik';
  const blob = new Blob([text], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `gopnik-save-${safe}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open a file picker and resolve with the chosen file's text. Rejects if the
// dialog is dismissed. Must be called from a real user gesture (button click).
export function pickSaveFile() {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) { reject(new Error('файл не выбран.')); return; }
      f.text().then(resolve).catch(() => reject(new Error('не удалось прочитать файл.')));
    });
    // Some browsers fire no event if the dialog is cancelled; that's fine —
    // the promise just stays pending until the next attempt.
    inp.click();
  });
}
