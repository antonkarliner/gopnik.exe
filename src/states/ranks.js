// Reputation rank ladder (погоняло), verbatim from the EXE.
//
// The original stores ~37 rank strings at consecutive offsets
// 0x12FA3..0x157F2 (file 77811..87795), an array indexed by the player's
// reputation. They climb from "Полное ЧМО" up to "Самый Крутой Реальный
// Пацан". Two further ranks are *awarded* on boss kills rather than by rep:
//   @ 0x157F2 (88050): "Пацан, который завалил Проректора СУНЦа"
//   @ 0x158F3 (88307): "Пацан, который всех опрокинул"
// Those two live in victory.js (VICTORY_RANK / FINAL_RANK) since they're
// granted by the end-game transitions, not the rep ladder.

export const RANKS = [
  'Полное ЧМО',
  'Частично не ЧМО',
  'Чё-то не понятное',
  'Чё-то отдалённо похожее на не ЧМО',
  'Вроде не ЧМО',
  'Не ЧМО',
  'Совсем не ЧМО',
  'Похожий на Чувака',
  'Нормальный Чувак',
  'Да нормальный такой Чувак',
  'Довольно понтовый Чувак',
  'Понтовый Чувак',
  'Вполне понтовый Чувак',
  'Очень понтовый Чувак',
  'Чувак отдалённо похожий на Пацана',
  'Похожий на Пацана',
  'Сильно похожий на Пацана',
  'Вроде Пацан',
  'Пацан покруче',
  'Понтоватый Пацан',
  'Понтовый Пацан',
  'Очень понтовый Пацан',
  'Крутой Пацан',
  'Очень крутой Пацан',
  'Пацан метящий в реальные',
  'Почти реальный Пацан',
  'Довольно реальный Пацан',
  'Реальный Пацан',
  'Пацан немного более реальный',
  'Пацан ещё реальнее',
  'Очень реальный Пацан',
  'Офигенно реальный Пацан',
  'Да типа ваще реальный Пацан',
  'Смотри не лопни от реальности, Реальный Пацан',
  'Крутой Реальный Пацан',
  'Очень крутой Реальный Пацан',
  'Самый Крутой Реальный Пацан',
];

// Map a reputation value onto a ladder rung (clamped to the top rung).
export function rankForRep(rep) {
  const i = Math.max(0, Math.min(RANKS.length - 1, rep | 0));
  return RANKS[i];
}
