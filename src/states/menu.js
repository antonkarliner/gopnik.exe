// Help / command menu reconstructed from EXE fragment at 0xBFDF.
// The original is text-command driven (you type 'w', 'mar', 'bmar' etc.
// at a prompt); this screen shows the recovered help text verbatim.

import { clearBuffer, writeAt, COLS, ROWS } from '../render.js?v=55';

const CMDS = [
  // [cmd, description (Russian, CP866-decoded from EXE)]
  ['w',     'шататься по окрестностям - искать на свою жопу приключения'],
  ['mar',   'идти на рынок'],
  ['bmar',  'идти на большой рынок (Барыги)'],
  ['wes',   'веселье - сходить в клуб'],
  ['rep',   'репутация (посмотреть статы)'],
  ['kos',   'кости / казино'],
  ['trn',   'тренировка / качалка'],
  ['girl',  'к подруге'],
  ['fight', 'провоцировать драку'],
  ['save',  'сохранить игру'],
  ['load',  'загрузить игру'],
];

export const menu = {
  enter() {},

  update(input) {
    while (input.hasKey()) {
      const k = input.pollKey();
      if (k.key === 'Escape') return 'title';
    }
    return null;
  },

  draw(buf) {
    clearBuffer(buf, 7, 0);

    // Header bar.
    for (let x = 0; x < COLS; x++) writeAt(buf, x, 0, ' ', 0xF, 1);
    writeAt(buf, 2, 0, ' Команды (из EXE @ 0xBFDF) ', 0xF, 1);

    writeAt(buf, 2, 2, 'Набери одну из команд:', 0xE, 0);
    for (let i = 0; i < CMDS.length; i++) {
      const [cmd, desc] = CMDS[i];
      writeAt(buf, 4, 4 + i, cmd.padEnd(7, ' '), 0xB, 0);
      writeAt(buf, 4 + 8, 4 + i, '- ' + desc, 0x7, 0);
    }

    writeAt(buf, 2, ROWS - 3, 'Найденные локации:', 0xE, 0);
    writeAt(buf, 4, ROWS - 2,
      'Качалка / Барыги / Рынок / Клуб / Подруга / Бог / Ректор / Ельцовка',
      0xA, 0);
    writeAt(buf, 2, ROWS - 1, 'Esc -> title', 0x8, 0);
  },
};
