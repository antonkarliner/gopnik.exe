// Victory / district-transition end-game state.
//
// Reached when the player kills a district boss. There are three flavours:
//
//   'fake'    — the first boss ("Ректор") in Ельцовка. Comedic EXE twist:
//               he turns out to be the vice-rector of the SUNTS, not the
//               real rector of NGU. Player is awarded VICTORY_RANK and sent
//               on to the next district.
//   'district'— a mid-district boss elsewhere; "ты самый крутой в этом
//               районе — отправляйся в следующий".  Player advances.
//   'final'   — the real Ректор НГУ in the last district (Шлюз). True
//               ending; player is crowned FINAL_RANK and returns to title.
//
// Verbatim sources from the EXE (CP866-decoded):
//   @ 0x5128: "Ты замочил самого ректора!!! ТЫ САМЫЙ КРУТОЙ!!!  Вновь сила
//             торжествует над интелектом. После этого сразу началась
//             анархия и полный беспредел."
//   @ 0x51E6: "А результат: ... о чёрт! да это ж не ректор был."
//   @ 0x5236: "Это был проректор СУНЦа!"
//   @ 0x9B7F: "Ты доказал, что ты самый крутой в этом районе — отправляйся
//             в следующий"
//   @ 0x157F2: rank "Пацан, который завалил Проректора СУНЦа"
//   @ 0x158F3: rank "Пацан, который всех опрокинул"

import { clearBuffer, writeAt, COLS, ROWS } from '../render.js?v=55';

// Ranks awarded by the end-game transitions (not the rep ladder).
export const VICTORY_RANK = 'Пацан, который завалил Проректора СУНЦа';
export const FINAL_RANK   = 'Пацан, который всех опрокинул';

// Page sets keyed by transition kind. Each page: { title, lines: [[text,color]] }.
const PAGE_SETS = {
  fake: [
    {
      title: 'ПОБЕДА',
      lines: [
        ['Ты замочил самого ректора!!!', 0xF],
        ['ТЫ САМЫЙ КРУТОЙ!!!', 0xE],
        ['', 0],
        ['Вновь сила торжествует над интелектом.', 0xA],
        ['После этого сразу началась анархия', 0xA],
        ['и полный беспредел.', 0xA],
      ],
    },
    {
      title: 'А результат:',
      lines: [
        ['Ты замочил самого ректора!!!', 0x7],
        ['', 0],
        ['о чёрт! да это ж не ректор был.', 0xE],
        ['Это был проректор СУНЦа!', 0xC],
        ['', 0],
        ['Ну ничё — ты всё равно доказал, что ты', 0xA],
        ['самый крутой в этом районе.', 0xA],
      ],
    },
    {
      title: 'Новое погоняло',
      lines: [
        [VICTORY_RANK, 0xB],
        ['', 0],
        ['Ты доказал, что ты самый крутой в этом', 0x7],
        ['районе — отправляйся в следующий.', 0x7],
        ['', 0],
        ['Там бродит уже более крутая гопота, а', 0x7],
        ['где-то ждёт настоящий Ректор НГУ.', 0x7],
      ],
    },
  ],

  district: [
    {
      title: 'Район зачищен',
      lines: [
        ['Главного отморозка района ты уложил.', 0xF],
        ['', 0],
        ['Ты доказал, что ты самый крутой в этом', 0xA],
        ['районе — отправляйся в следующий.', 0xA],
        ['', 0],
        ['Там гопота ещё злее. Готовься.', 0x7],
      ],
    },
  ],

  final: [
    {
      title: 'НАСТОЯЩАЯ ПОБЕДА',
      lines: [
        ['Ты замочил самого Ректора НГУ!!!', 0xF],
        ['На этот раз — без подмен, настоящего.', 0xE],
        ['', 0],
        ['ТЫ САМЫЙ КРУТОЙ!!!', 0xE],
        ['Вновь сила торжествует над интелектом.', 0xA],
      ],
    },
    {
      title: 'Новое погоняло',
      lines: [
        [FINAL_RANK, 0xB],
        ['', 0],
        ['Весь город под тобой. Каждый отморозок', 0x7],
        ['от шлюза до Ельцовки знает твоё погоняло.', 0x7],
        ['', 0],
        ['Беспредел окончательно победил интелект.', 0xA],
        ['КОНЕЦ.', 0xE],
      ],
    },
  ],
};

// Set by play.js right before it hands control over.
let nick = 'Сабж';
let kind = 'fake';
let nextDistrict = '';
export function armVictory(playerNick, transitionKind = 'fake', nextDistrictName = '') {
  nick = playerNick || 'Сабж';
  kind = PAGE_SETS[transitionKind] ? transitionKind : 'fake';
  nextDistrict = nextDistrictName || '';
}

let page = 0;

// Where to go once the pages are exhausted: back into play for the next
// district, or all the way to the title screen for the true ending.
function exitState() { return kind === 'final' ? 'title' : 'play'; }

export const victory = {
  enter() { page = 0; },

  update(input) {
    while (input.hasKey()) {
      const k = input.pollKey();
      if (k.key === 'Escape') return exitState();
      page++;
      if (page >= PAGE_SETS[kind].length) return exitState();
    }
    return null;
  },

  draw(buf) {
    clearBuffer(buf, 7, 0);
    const pages = PAGE_SETS[kind];
    const p = pages[Math.min(page, pages.length - 1)];

    // Top header bar.
    for (let x = 0; x < COLS; x++) writeAt(buf, x, 0, ' ', 0xF, 1);
    writeAt(buf, 2, 0, ` ГОПНИК — ${p.title}`, 0xF, 1);

    // Who pulled it off.
    writeAt(buf, 4, 2, `${nick}:`, 0x6, 0);

    // Body
    for (let i = 0; i < p.lines.length; i++) {
      const [text, color] = p.lines[i];
      writeAt(buf, 4, 4 + i, text, color, 0);
    }

    // Footer
    const more = kind === 'final'
      ? 'Enter -> в меню'
      : (page + 1 >= pages.length && nextDistrict
          ? `Enter -> едем в ${nextDistrict}`
          : 'Enter -> дальше');
    writeAt(buf, 2, ROWS - 2,
      `[${page + 1}/${pages.length}]  ${more}   Esc -> пропустить`,
      0x8, 0);
  },
};
