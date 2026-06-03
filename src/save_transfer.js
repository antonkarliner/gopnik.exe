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

// Slugify a nick into a filesystem-safe filename fragment.
function safeNick(nick) {
  return (nick || 'gopnik').replace(/[\/\\?%*:|"<>\s]+/g, '_').slice(0, 20) || 'gopnik';
}

// Trigger a browser download of arbitrary text (Blob + temporary anchor).
function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Trigger a browser download of the serialized save.
export function downloadSave(state, nick) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  downloadText(`gopnik-save-${safeNick(nick)}-${date}.json`, exportSave(state));
}

// ── Debug log export ──────────────────────────────────────────────────────────
// Strip `^N` color escapes so the downloaded log is plain, readable text. Mirrors
// the isColorEsc rule used by render.js / play.js (hex digit or the ASCII-offset
// punctuation range the original decoder accepted).
function isColorEsc(c) {
  if ('0123456789ABCDEFabcdef'.indexOf(c) >= 0) return true;
  const cc = c.charCodeAt(0);
  return (cc >= 0x21 && cc <= 0x2F) || (cc >= 0x3A && cc <= 0x3F);
}
function stripEscapes(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '^' && i + 1 < text.length && isColorEsc(text[i + 1])) { i++; continue; }
    out += text[i];
  }
  return out;
}

// Download a human-readable debug log: a STATE snapshot + the wrapped REPL log
// lines (color escapes stripped). Intended for bug reports — the "баг" button.
export function downloadLog(logLines, state, nick) {
  const out = [];
  out.push('GOPNIK.EXE — веб-порт — debug log');
  out.push(`time: ${new Date().toISOString()}`);
  if (typeof navigator !== 'undefined') out.push(`UA:   ${navigator.userAgent}`);
  out.push('');
  out.push('--- STATE ---');
  out.push(JSON.stringify(state, null, 2));
  out.push('');
  out.push('--- LOG ---');
  for (const entry of (logLines || [])) {
    out.push(stripEscapes(typeof entry === 'string' ? entry : (entry && entry.text) || ''));
  }
  const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '').replace(/-/g, '');
  downloadText(`gopnik-log-${safeNick(nick)}-${date}.txt`, out.join('\n'), 'text/plain');
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
