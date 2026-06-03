// Intro / narrative state.
//
// After the title, the game enters a sequence of narrative + dialog
// screens. Confirmed in dosbox-x: title -> name prompt -> intro text
// -> Dean/spectator dialog -> rules -> difficulty selection.
//
// Sources from the EXE (CP866-decoded):
//   frag @ 0x81B1: "Ты приехал в Ельцовку. Отовсюду доносятся крики
//     запинываемых. Пора наконец отомстить ректору. Доказать свою
//     крутизну ты можешь, окоротив главного отморозка района."
//   frag @ 0x7E4E: dialog with Dean (Ректор)
//   frag @ 0x4823: spectator (Зрители) dialog
//   frags @ 0x712d..0x76df: the char-creation rules / tutorial that the
//     original prints in FUN_1000_5f55 ("Вначале ты должен выбрать свой
//     характер" → stat explanation → per-location пояснения). Transcribed
//     verbatim below (wrapped to 80 cols; original misspellings kept).

import { clearBuffer, writeAt, COLS, ROWS } from '../render.js?v=57';

const PAGES = [
  {
    // Verbatim from EXE @ 0x7D50 — backstory before the Dean confrontation.
    title: 'Год 2xxx от р.х.',
    lines: [
      ['Последний день ты пришел в универ.', 0x7],
      ['Ты по-страшному косил и забивал.', 0x7],
      ['Ты ещё мог сдать все задания, которые ты взял у друзей.', 0x7],
      ['Но тут...', 0x6],
    ],
  },
  {
    // Verbatim from EXE @ 0x7D50 / frag @ 0x7E4E — Dean confrontation.
    // Original misspellings kept ("опушенного", "неможешь").
    title: 'Перед универом...',
    lines: [
      ['Ректор: Ах ты урод, чёртов забивала. Вали из универа!', 0xE],
      ['Ты: А типа чё?', 0xA],
      ['Ректор: Ты отчислен мудак!!! Как ты был лохом так и останешься.', 0xE],
      ['', 0],
      ['Это слышали все и ты из пацана превратился в опушенного.', 0xC],
      ['Ты неможешь стерпеть такой наезд, однако ректор офигительно крутой.', 0x7],
      ['Ты решил доказать свою крутизну всему миру', 0x7],
      ['(в твоем понимании - Городу).', 0x7],
    ],
  },
  {
    // Verbatim from FUN_1000_5f55 (EXE @ 0x712d / 0x717a / 0x7241 / 0x72f9 /
    // 0x735a) — the stat tutorial. Misspellings ("довавляет") kept on purpose.
    title: 'Ну слушай, в чём тут батва:',
    lines: [
      ['Вначале ты должен выбрать свой характер.', 0xE],
      ['Всего навыки в сумме составляют 12. При новом уровне', 0x7],
      ['понтовости шанс прокачать навык = его очки из 12.', 0x7],
      ['', 0],
      ['Сила      - увеличивает урон, и довавляет 1 здоровья', 0xA],
      ['Ловкость  - +5% попадания; если больше 90% — бьёшь дважды', 0xA],
      ['Живучесть - 5 здоровья за очко', 0xA],
      ['Удача     - будет чаще везти по жизни', 0xA],
      ['', 0],
      ['Здоровье = 10 + Живучесть*5 + Сила', 0xB],
      ['Урон = (Сила/2)мин - (Сила)макс', 0xB],
      ['Точность = (20 + Ловкость*5)%   Броня уменьшает урон врага', 0xB],
    ],
  },
  {
    // Verbatim from FUN_1000_5f55 (EXE @ 0x735a / 0x76df) — what each location
    // is for. "Придя в новый район, ты должен находить все эти места снова."
    title: 'А че от мест толку та?',
    lines: [
      ['Заходя в разные места, узнаёшь, чего полезного из них взять.', 0x7],
      ['Придя в новый район, эти места надо находить снова.', 0x7],
      ['', 0],
      ['Базар    - шмотки и еда. Можно воровать кошельки (Удача)', 0xA],
      ['Больница - лечить переломы и царапины', 0xA],
      ['Подруга  - пожить пару дней как человек — поправить здоровье', 0xA],
      ['Притон   - реальные пацаны; зови братву, следи за понтом', 0xA],
      ['Клуб     - играй на бабло (Удача); гопота не любит проигрывать', 0xA],
      ['Качалка  - повысить свои бойцовские навыки', 0xA],
      ['Барыги   - купить/продать; спихнуть награбленый хлам', 0xA],
      ['', 0],
      ['Введи `help` если не помнишь чё за буквы.', 0xE],
    ],
  },
];

let page = 0;

export const intro = {
  enter() { page = 0; },

  update(input) {
    while (input.hasKey()) {
      const k = input.pollKey();
      if (k.key === 'Escape') return 'title';
      if (k.key !== 'Enter') continue;
      page++;
      if (page >= PAGES.length) return 'difficulty';
    }
    return null;
  },

  draw(buf) {
    clearBuffer(buf, 7, 0);
    const p = PAGES[Math.min(page, PAGES.length - 1)];

    // Top header bar.
    for (let x = 0; x < COLS; x++) writeAt(buf, x, 0, ' ', 0xF, 1);
    writeAt(buf, 2, 0, ` ГОПНИК — ${p.title}`, 0xF, 1);

    // Body
    for (let i = 0; i < p.lines.length; i++) {
      const [text, color] = p.lines[i];
      writeAt(buf, 4, 3 + i, text, color, 0);
    }

    // Footer
    writeAt(buf, 2, ROWS - 2,
      `[${page + 1}/${PAGES.length}]  Enter -> continue   Esc -> title`,
      0x8, 0);
  },
};
