// Class selection — "Выбери кем ты будешь" (EXE @ 0x66E8).
//
// Verbatim from the binary: four classes (0-Пацан 1-Отморозок 2-Гопник 3-Вор)
// plus "4-Чё за батва?" which toggles the bonus blurbs. After picking, the game
// asks "А зовут тебя:" with the default name "Раздолбай" (EXE @ 0x6802), then
// drops you at the university doors.

import { clearBuffer, writeAt, COLS, ROWS } from '../render.js?v=57';
import { CLASS_LIST, armNewGame, getNick, getKlassId } from './play.js?v=57';

let phase   = 'pick';  // 'pick' | 'name'
let sel     = 0;
let showExp = true;    // bonus blurbs visible (toggled by "4-Чё за батва?")
let name    = '';

export const difficulty = {
  enter() {
    phase = 'pick';
    sel = getKlassId();
    showExp = true;
    name = getNick();
  },

  update(input) {
    while (input.hasKey()) {
      const k = input.pollKey();

      if (phase === 'pick') {
        if (k.key === 'Escape') return 'intro';
        if (k.key === 'ArrowUp')   sel = (sel + CLASS_LIST.length - 1) % CLASS_LIST.length;
        if (k.key === 'ArrowDown') sel = (sel + 1) % CLASS_LIST.length;
        if (/^[0-3]$/.test(k.key)) sel = parseInt(k.key, 10);
        if (k.key === '4')         showExp = !showExp;
        if (k.key === 'Enter' || k.key === ' ') { phase = 'name'; }
        continue;
      }

      // phase === 'name'
      if (k.key === 'Escape') { phase = 'pick'; continue; }
      if (k.key === 'Enter') {
        armNewGame(sel, name);
        return 'play';
      }
      if (k.key === 'Backspace') { name = name.slice(0, -1); continue; }
      if (k.ascii && k.ascii.length === 1 && k.ascii !== '\n' && name.length < 16) {
        name += k.ascii;
      }
    }
    return null;
  },

  draw(buf) {
    clearBuffer(buf, 7, 0);
    for (let x = 0; x < COLS; x++) writeAt(buf, x, 0, ' ', 0xF, 1);
    writeAt(buf, 2, 0, ' ГОПНИК — выбери кем ты будешь ', 0xF, 1);

    writeAt(buf, 2, 2, 'Выбери кем ты будешь:', 0xE, 0);

    const COLORS = [0xB, 0x8, 0x5, 0xE];  // per-class accent (from EXE attrs)
    for (let i = 0; i < CLASS_LIST.length; i++) {
      const c = CLASS_LIST[i];
      const marker = (phase === 'pick' && i === sel) ? '>>' : '  ';
      const lit = (phase === 'pick' && i === sel);
      writeAt(buf, 2, 4 + i, `${marker} ${i}-${c.name}`, lit ? 0xF : COLORS[i], 0);
      if (showExp)
        writeAt(buf, 18, 4 + i, `- ${c.blurb}. (Бонус — ${c.bonus})`, lit ? 0xF : 0x9, 0);
    }

    writeAt(buf, 2, 9, '4-Чё за батва?  (показать/скрыть бонусы)', 0x6, 0);

    if (phase === 'name') {
      writeAt(buf, 2, 12, 'А теперь выбирай:', 0xC, 0);
      writeAt(buf, 2, 13, `Ты будешь: ${CLASS_LIST[sel].name}`, 0xA, 0);
      writeAt(buf, 2, 15, 'А зовут тебя:', 0xA, 0);
      const nx = 16;
      writeAt(buf, nx, 15, name, 0xF, 0);
      if ((Date.now() / 250 | 0) & 1) writeAt(buf, nx + name.length, 15, '_', 0xF, 0);
      writeAt(buf, 2, ROWS - 2,
        'Enter: начать путь гопника   Backspace: стереть   Esc: назад к выбору',
        0x8, 0);
    } else {
      writeAt(buf, 2, 12, 'Ты стоишь у дверей университета.', 0x9, 0);
      writeAt(buf, 2, 13, 'Отсюда ты начнёшь свой нелёгкий путь гопника.', 0x9, 0);
      writeAt(buf, 2, ROWS - 2,
        '0-3 / Up/Down: выбор   4: бонусы   Enter: дальше (имя)   Esc: назад',
        0x8, 0);
    }
  },
};
