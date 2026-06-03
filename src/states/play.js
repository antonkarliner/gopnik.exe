// Main gameplay loop — text-command REPL.
// Commands: EXE @ 0xBFDF  |  Formulas: EXE @ 0x735A / 0x7241 / 0x72F9
// Combat strings: EXE @ 0x4A55 .. 0x4CF0
// Market/dealer: EXE @ 0xA4AD / 0xAA25 / 0xAB89 / 0xBCD6
// Rector: EXE @ 0x464A / 0x5128 / 0x505A

import { clearBuffer, writeAt, COLS, ROWS } from '../render.js?v=57';
import { armVictory, VICTORY_RANK, FINAL_RANK } from './victory.js?v=57';
import { rankForRep } from './ranks.js?v=57';
import { downloadSave, pickSaveFile, importSave, downloadLog } from '../save_transfer.js?v=57';

// ── Help table ────────────────────────────────────────────────────────────────
const HELP = [
  ['w',    'шататься по окрестностям'],
  ['mar',  'идти на рынок'],
  ['bmar', 'идти к барыгам'],
  ['wes',  'продать ненужные вещи (барахолка)'],
  ['x',    'спихнуть весь хлам барыгам разом'],
  ['rep',  'идти к ветеринару'],
  ['girl', 'завалиться к своей девчонке'],
  ['pr',   'идти в местный притон гопоты'],
  ['kl',   'идти в клуб'],
  ['trn',  'идти в качалку'],
  ['s',    'посмотреть в лужу на свою уродскую рожу'],
  ['sv',   'приглядеться к мудаку (активный враг)'],
  ['k',    'гасить мудака'],
  ['f',    'пальнуть из самопала (нужен ствол + патроны)'],
  ['v',    'позвать подкрепление'],
  ['run',  'свалить с драки (западло: −1 к стату, понт в ноль)'],
  ['kos',  'схавать косяк'],
  ['h',    'выпить пиво'],
  ['mh',   'набухаться до чёртиков'],
  ['name', 'сменить погоняло'],
  ['save', 'сохранить в браузер'],
  ['load', 'загрузить из браузера'],
  ['export','скачать сейв файлом (.json)'],
  ['import','загрузить сейв из файла (.json)'],
  ['bug',  'скачать лог игры для багрепорта (.txt)'],
  ['cp',   'откатиться к точке Рушеля Блаво'],
  ['reset','сбросить все статы'],
  ['e',    'выйти в меню'],
];

// ── Character classes (EXE @ 0x66E8: "Выбери кем ты будешь") ───────────────────
// Verbatim blurbs & bonuses from the class-selection screen. The chosen class
// sets the starting stat spread (CLASS_LIST[].stats, from the EXE class-init —
// see notes/findings.md) AND flavours a handful of commands:
//   Пацан     — нормальный тип        → Гёлфренд (полное лечение) + Клуб (реп)
//   Отморозок — тупой корявый мудак   → Самолечение царапин (HP regen на w)
//   Гопник    — гоп он и есть гоп      → Притон (деньги/реп/HP в pr)
//   Вор       — везучий ублюдок        → Воровство (карманы на w) + Барыги (-25%)
// Per-class starting stats are verbatim from the EXE class-init (FUN_1000_6a0d
// @ 1000:6a0d, recovered via PyGhidra — see notes/findings.md "Combat/stat
// model"). The original stores (0x389e,0x38a0,0x38a2,0x38a4); mapped to the
// port's stat roles that is (str, dex, vitality, luck) — i.e. 0x389e drives
// damage (port `str`) and 0x38a2 is the ×5-HP stat (port `vitality`). Each
// class is a balanced 12-point spread.
export const CLASS_LIST = [
  { id: 0, key: 'pacan',     name: 'Пацан',     blurb: 'нормальный тип',     bonus: 'Гёлфренд, Клуб',         stats: { str: 3, dex: 3, vitality: 3, luck: 3 } },
  { id: 1, key: 'otmorozok', name: 'Отморозок', blurb: 'тупой корявый мудак', bonus: 'Самолечение царапин',    stats: { str: 5, dex: 2, vitality: 4, luck: 1 } },
  { id: 2, key: 'gopnik',    name: 'Гопник',    blurb: 'гоп он и есть гоп',   bonus: 'Притон',                stats: { str: 4, dex: 3, vitality: 3, luck: 2 } },
  { id: 3, key: 'vor',       name: 'Вор',       blurb: 'везучий ублюдок',    bonus: 'Воровство, Барыги',     stats: { str: 3, dex: 3, vitality: 2, luck: 4 } },
];
const CLASS_BY_KEY = Object.fromEntries(CLASS_LIST.map(c => [c.key, c]));
function curClass() { return CLASS_BY_KEY[STATE.klass] || CLASS_LIST[0]; }

// Понтовость (street-cred) caps at 12 (EXE @ 0x595B: "# из 12 шансов").
const PONT_MAX = 12;
// Понт thresholds that gate locations/actions. The EXE confirms a club/backup
// понт gate existed but not the exact values, so these are tuned for feel: high
// enough that one round of beer (the притон's diminishing +3/+4) no longer
// unlocks everything — backup/club take a real cred grind to reach.
const PONT_GATE_CLUB   = 4;  // kl — войти в клуб
const PONT_GATE_BACKUP = 6;  // v  — позвать подкрепление
const PONT_GATE_BORROW = 3;  // r  — занять денег на пиво в притоне

// ── Player state ──────────────────────────────────────────────────────────────
// Здоровье = 10 + Живучесть*5 + Сила  (EXE @ 0x72F9 / FUN_1000_6a0d @ 1542)
const DEFAULT_STATE = {
  nick: 'Раздолбай',  // EXE default name @ 0x6802
  klass: 'pacan',     // character class (EXE @ 0x66E8)
  str: 3, dex: 3, vitality: 3, luck: 3, armor: 0,  // Пацан preset (see CLASS_LIST)
  hp: 28, max_hp: 28,
  money: 20,
  rep: 0, exp: 0,
  pont: 0,            // понтовость — street-cred, gates v/kl (EXE @ 0x9F0A)
  drunk: 0, high: 0,
  weapon_name: 'руки', weapon_dmg: 0,
  jacket: null,       // кожанка — понтовая броня от случайностей (EXE @ 0xa59a / 0x328a)
  jaw_guard: false,   // зубная защита боксёров (-75% jaw-break)
  has_gun: false,     // самопальный пистолет — даёт ranged-атаку f (EXE @ 0x6023)
  ammo: 0,            // патроны для самопала
  shades: false,      // затемнённые очки — уйти от ментов (EXE @ 0x5747)
  has_phone: false,   // краденый мобильник — подмога приходит быстрее (EXE @ 0xaac7)
  nakolka: false,     // зоновская наколка — наезды −50% (EXE @ 0xab24)
  silencer: false,    // глушитель на самопал — тихий выстрел, менты не слышат (EXE @ 0xac38)
  ring: null,         // фенька — кольцо из храма: HP-регенерация + самозарост переломов (EXE @ 0x9477)
  broken_jaw: false,  // сломана челюсть — нельзя пить пиво/жрать колёса (EXE @ 0x29c4 "из-за сломаной челюсти")
  broken_leg: false,  // сломана нога — хуже в драке, не убежать (EXE @ 0x3754 "не можешь убежать на сломаной ноге")
  temple_visits: 0,   // сколько раз молился в храме божьем (меняет реплики Бога)
  junk: [],           // ненужные вещи — продаются барыгам (wes/x), EXE @ 0xB00D
  district: 0,        // 0=Ельцовка, 1=ОбьГЭС, 2=Шлюз (EXE @ 0x8143 / 0x9c40)
  district_kills: 0,  // wins in the current district; boss appears at >= 5
  found: {},          // discovered locations in the *current* district (EXE @ 0x4331)
  rector_done: false, // the *final* boss (Ректор НГУ) has been beaten
  rank: null,         // awarded погоняло (boss kills) — EXE @ 0x157F2 / 0x158F3
  first_game: true,   // cleared after the university-door intro plays (EXE frag [778])
};
const STORAGE_KEY = 'gopnik.state.v3';
// Рушель Блаво «сохранение прямо здесь» (EXE @ 0x8CBA) — a paid restore point,
// kept in its own slot so the constant autosave never overwrites it.
const CHECKPOINT_KEY = 'gopnik.checkpoint.v1';

// ── Location re-discovery data (EXE @ 0x4331: "Придя в новый район, ты
// должен находить все эти места снова") ───────────────────────────────────────
// Declared up here (above loadState) so save-migration can reference it.
// Discovery / locked lines are verbatim from the EXE where available
// (Ты нашел базар @ 0x9D85, клуб/качалка ads @ same frag, больница @ 0x9EED,
// "Ты пока что неузнал где в этом районе клуб" @ 0x198B, "...качалка" @ 0x19F7).
const LOCATIONS = {
  mar:  { name: 'рынок',    found: 'Ты нашел базар.',
          locked: 'Ты незнаешь, пока ешё, где находится базар в этом районе.' },
  bmar: { name: 'барыги',   found: 'Ты вычислил, где затарились местные барыги.',
          locked: 'Ты пока незнаешь где в этом районе барыги.' },
  rep:  { name: 'больница', found: 'Ты спросил у прохожего где больница.',
          locked: 'Ты пока незнаешь где в этом районе больница.' },
  girl: { name: 'подруга',  found: 'Ты раздобыл адрес местной подруги.',
          locked: 'Ты пока незнаешь где живёт твоя подруга в этом районе.' },
  pr:   { name: 'притон',   found: 'Ты разнюхал где притон гопоты.',
          locked: 'Ты пока незнаешь где в этом районе притон.' },
  kl:   { name: 'клуб',     found: 'Ты увидел объявление "Типа заходи в наш понтовый клуб".',
          locked: 'Ты пока что неузнал где в этом районе клуб.' },
  trn:  { name: 'качалка',  found: 'На стене реклама "Жизнь тяжела. Если не хочешь сдохнуть качайся!".',
          locked: 'Ты пока незнаешь где в этом районе качалка.' },
};
const LOCATION_KEYS = Object.keys(LOCATIONS);

function calcMaxHp(s) { return 10 + s.vitality * 5 + s.str; }

// Upgrade an arbitrary saved/imported object onto the current schema. `hadSave`
// distinguishes a real save (no `found` key → unlock all, don't re-lock returning
// players) from a brand-new game ({} → discover nothing). Shared by loadState()
// and the JSON file import so both run the identical migration path.
function migrateState(base, hadSave) {
  base = (base && typeof base === 'object') ? base : {};
  const merged = { ...DEFAULT_STATE, ...base };
  if (!Array.isArray(merged.junk)) merged.junk = [];
  // Migrate pre-discovery saves: unlock everything so existing players
  // aren't suddenly locked out of their current district's locations.
  if (hadSave && (!base.found || typeof base.found !== 'object')) {
    merged.found = {};
    for (const k of Object.keys(LOCATIONS)) merged.found[k] = true;
  } else {
    merged.found = { ...(base.found || {}) };
  }
  if (!CLASS_BY_KEY[merged.klass]) merged.klass = 'pacan';  // pre-class saves
  if (typeof merged.pont !== 'number' || isNaN(merged.pont)) merged.pont = 0;
  merged.pont = Math.max(0, Math.min(PONT_MAX, merged.pont));
  if (typeof merged.ammo !== 'number' || isNaN(merged.ammo)) merged.ammo = 0;  // pre-gun saves
  merged.has_gun   = !!merged.has_gun;
  merged.shades    = !!merged.shades;
  merged.has_phone = !!merged.has_phone;   // pre-mobile saves → false
  merged.nakolka   = !!merged.nakolka;     // pre-наколка saves → false
  merged.silencer  = !!merged.silencer;    // pre-глушитель saves → false
  merged.broken_jaw = !!merged.broken_jaw; // pre-bone saves → false
  merged.broken_leg = !!merged.broken_leg;
  // Фенька — pre-temple saves have no ring; coerce anything malformed to null.
  if (!merged.ring || typeof merged.ring !== 'object' || typeof merged.ring.name !== 'string') merged.ring = null;
  if (typeof merged.temple_visits !== 'number' || isNaN(merged.temple_visits)) merged.temple_visits = 0;
  // Кожанка — pre-jacket saves have no slot; coerce anything malformed to null.
  if (!merged.jacket || typeof merged.jacket !== 'object'
      || typeof merged.jacket.armor !== 'number') merged.jacket = null;
  merged.max_hp = calcMaxHp(merged);
  merged.hp = Math.min(merged.hp, merged.max_hp);
  return merged;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
             || localStorage.getItem('gopnik.state.v2')
             || localStorage.getItem('gopnik.state.v1');
    const base = raw ? JSON.parse(raw) : {};
    return migrateState(base, !!raw);
  } catch { return { ...DEFAULT_STATE }; }
}
function persistState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}
// Snapshot the live STATE into the mage's dedicated checkpoint slot.
function writeCheckpoint(s) {
  try { localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(s)); return true; }
  catch { return false; }
}
// Read the checkpoint back through the same migration path as a normal save.
function readCheckpoint() {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch { return null; }
}
function resetState(s) {
  // Keep the character you *chose* — `reset` wipes progress, not your identity.
  // (Previously it forced klass back to DEFAULT_STATE's 'pacan', so a Вор would
  //  silently become a Пацан after reset.)
  const keepKlass = CLASS_BY_KEY[s.klass] ? s.klass : DEFAULT_STATE.klass;
  const keepNick  = s.nick || DEFAULT_STATE.nick;
  Object.assign(s, { ...DEFAULT_STATE });
  s.klass = keepKlass;
  s.nick  = keepNick;
  s.junk = [];
  s.found = {};   // fresh object (DEFAULT_STATE.found is shared) — rediscover all
  applyClassStats(s, s.klass);   // restore the class stat preset (str/dex/vit/luck + HP)
  persistState(s);
}

const STATE = loadState();

// ── New-game hooks for the class-selection screen (difficulty.js) ─────────────
export function getNick()    { return STATE.nick; }
export function getKlassId() { return curClass().id; }
// True when localStorage holds a game already in progress (past the
// university-door intro), so the title screen can offer "продолжить" instead
// of forcing a brand-new character through class selection (which wipes the
// autosave via armNewGame). `first_game` flips to false the first time
// play.enter() runs after class creation.
export function hasResumableGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
             || localStorage.getItem('gopnik.state.v2')
             || localStorage.getItem('gopnik.state.v1');
    if (!raw) return false;
    const s = JSON.parse(raw);
    return !!(s && typeof s === 'object' && s.first_game === false);
  } catch { return false; }
}
// Seed the four combat stats from a class preset and rebuild HP. Faithful to
// the EXE class-init (FUN_1000_6a0d @ 1542): set stats by class, then
// max_hp = vitality*5 + 10 + str, hp = max_hp.
function applyClassStats(s, klassKey) {
  const cls = CLASS_BY_KEY[klassKey] || CLASS_LIST[0];
  Object.assign(s, cls.stats);
  s.max_hp = calcMaxHp(s);
  s.hp = s.max_hp;
}
// Apply the class + name chosen on the "Выбери кем ты будешь" screen.
// Full state reset first so an old save can't bleed money/rep/locations/etc.
// into the newly-created character.
export function armNewGame(klassId, nick) {
  Object.assign(STATE, { ...DEFAULT_STATE });
  STATE.junk  = [];
  STATE.found = {};
  const cls = CLASS_LIST[klassId] || CLASS_LIST[0];
  STATE.klass = cls.key;
  applyClassStats(STATE, STATE.klass);   // sets str/dex/vit/luck + max_hp + hp
  const n = (nick || '').trim();
  STATE.nick = (n ? n : 'Раздолбай').slice(0, 16);
  persistState(STATE);
}

// ── Districts (EXE @ 0x8143 / 0x9c40 — travel strings @ frag 0x125x) ───────────
// Progression Ельцовка → ОбьГЭС → Шлюз; each tougher than the last. The
// final district's boss is the real Ректор НГУ (enemy name @ frag 0x12ddf).
const DISTRICTS = [
  {
    name: 'Ельцовка',
    arrival: ['Ты приехал в Ельцовку...', 'Ото всюду доносятся крики запинываемых.'],
    enemyBonus: 0,
    trainCap: { str: 13, dex: 10, vitality: 7, luck: 7 },   // EXE @ 0x6647 — per-район cap
    gunZone: false,   // спальный район — менты патрулируют, стрелять нельзя (EXE @ 0x3754)
    victoryKind: 'fake',
    boss: () => ({
      // The twist/fake first boss — meant to be the most approachable of the three.
      // dex 6 → 75% hit (was 7/80%) so the opening showdown isn't a near-auto-hit.
      name: 'Ректор', hp: 50, max_hp: 50, str: 12, dex: 6, luck: 4, armor: 0, level: 5,
      loot: null, isBoss: true,
      intro: ['Тут заходит настоящий ректор.',
              'Мудак! ты тупой дебил, думал что я идиот?',
              'Ну тада сдохни!'],
    }),
  },
  {
    name: 'ОбьГЭС',
    arrival: ['На маршрутке ты доехал до ОбьГЭСа...', 'Здесь бродит уже более крутая гопота.'],
    enemyBonus: 3,
    trainCap: { str: 20, dex: 14, vitality: 11, luck: 11 },
    gunZone: true,    // бандитский район — из самопала пальнуть можно
    victoryKind: 'district',
    boss: () => ({
      name: 'главный отморозок ОбьГЭСа', hp: 90, max_hp: 90, str: 17, dex: 9, luck: 5, armor: 4, level: 9,
      loot: null, isBoss: true,
      intro: ['Местный авторитет ОбьГЭСа смотрит на тебя как на говно.',
              'Ты кто такой, лошара? Щас по щам отхватишь!'],
    }),
  },
  {
    name: 'Шлюз',
    arrival: ['Ты сел на автобус и попёрся на шлюз...', 'Там бродит шлюзовская шпана, а где-то — сам Ректор НГУ.'],
    enemyBonus: 6,
    trainCap: { str: 30, dex: 20, vitality: 18, luck: 18 },  // последний район — потолок высокий
    gunZone: true,    // бандитский район — из самопала пальнуть можно
    victoryKind: 'final',
    boss: () => ({
      name: 'Ректор НГУ', hp: 140, max_hp: 140, str: 23, dex: 12, luck: 6, armor: 8, level: 14,
      loot: null, isBoss: true, isFinal: true,
      intro: ['Ты пробрался в универ, в тёмный ректорский кабинет...',
              'Перед тобой — настоящий Ректор НГУ.',
              'На этот раз без подмен. Докажи, что ты круче всех!'],
    }),
  },
];
function curDistrict() { return DISTRICTS[STATE.district] || DISTRICTS[0]; }

// ── Location re-discovery helpers (data declared above loadState) ─────────────
function isFound(key) { return !!(STATE.found && STATE.found[key]); }
// Reveal one not-yet-found location while wandering; returns true if it did.
function discoverOne() {
  const undiscovered = LOCATION_KEYS.filter(k => !isFound(k));
  if (!undiscovered.length) return false;
  const key = undiscovered[roll(undiscovered.length)];
  STATE.found[key] = true;
  println(`^1${LOCATIONS[key].found}`, 0xA);
  return true;
}
// Guard a location command: if undiscovered, narrate and return true (blocked).
function blockedLocation(key) {
  if (isFound(key)) return false;
  println(`^6${LOCATIONS[key].locked}`, 0x6);
  println('^7Шатайся (^6w^7) по району, пока не наткнёшься на это место.', 0x7);
  return true;
}

// ── Enemy / encounter (session-only) ─────────────────────────────────────────
let ENCOUNTER = null; // { name, hp, max_hp, str, dex, luck, armor, level, loot, isBoss?, isFinal?, isMent? }
// When set, play.enter() narrates arrival in the new district (set on advance).
let arrivalPending = false;

// ── Combat formulas (EXE @ 0x735A / FUN_1000_3d11 @ 1000:3d11) ────────────────
// Hit% = min(90, ACC_BASE + Ловкость×5)   — the EXE clamps the roll at 0x5a=90.
// EXE ACC_BASE is 20 (= dex+4 stat ×5); the port raises it to 45 so fresh, low-dex
// characters aren't stuck in 30-round fistfights. (balance tuning)
// Flurry: a turn swings repeatedly — hit% drops 90 points (one full clamp) per
// swing, looping while it stays > 0 and the target's alive. So extra swings appear
// once ACC_BASE + dex×5 > 90, each at progressively lower accuracy.
// Урон = (Сила/2)..(Сила) + weapon_dmg.  Крит = Удача×3 %, adds +max-damage.
const ACC_BASE = 45;
function hitChance(dex)        { return ACC_BASE + dex * 5; }            // uncapped %
function pctHit(dex)          { return Math.min(90, hitChance(dex)); }
function canFlurry(dex)        { return hitChance(dex) > 90; }
function roll(n)               { return (Math.random() * n) | 0; }
function rollDmg(str, bonus)   {
  const min = Math.max(1, Math.floor(str / 2) + bonus);
  const max = str + bonus;
  return min + roll(Math.max(1, max - min + 1));
}
function applyArmor(dmg, arm)  { return Math.max(1, dmg - arm); }
// Total worn protection: base armor (зубная защита) + кожанка (EXE @ 0xa59a).
function jacketArmor()         { return STATE.jacket ? STATE.jacket.armor : 0; }
function effArmor()            { return STATE.armor + jacketArmor(); }

// ── Enemy spawn (FUN_1000_0d14 @ 1000:0d14) ──────────────────────────────────
// The EXE builds every street mook from a 10-row archetype WEIGHT TABLE, the same
// way it builds the player: each row is a 4-weight stat shape [str, dex, vit, luck]
// (port roles: str=damage, dex=accuracy, vit=×5-HP, luck=crit). The table was
// transcribed byte-for-byte from DGROUP file 0x123b2 (read in FUN_1000_0d14 as
// [0x3952*4 + 2..5]); rows 3-6 are ALSO the player class presets
// (Пацан/Отморозок/Гопник/Вор), confirming the column order. See notes/findings.md.
const ENEMY_ARCHETYPES = [
  { name: 'мелкий шкет',                w: [1, 2, 1, 2] }, // 0 — слабак
  { name: 'борзый пацанчик',            w: [2, 2, 2, 3] }, // 1 — фартовый
  { name: 'хмырь в треньке',            w: [2, 2, 2, 2] }, // 2
  { name: 'крепкий пацан',              w: [3, 3, 3, 3] }, // 3  (= Пацан preset)
  { name: 'тупой отморозок',            w: [5, 2, 4, 1] }, // 4  (= Отморозок) — бугай
  { name: 'бывалый гопник',             w: [4, 3, 3, 2] }, // 5  (= Гопник)
  { name: 'фартовый ворюга',            w: [3, 3, 2, 4] }, // 6  (= Вор) — везучий
  { name: 'здоровенный бугай',          w: [5, 3, 4, 2] }, // 7 — крепкий
  { name: 'местный авторитет',          w: [5, 5, 5, 5] }, // 8 — мини-босс (EXE forced T=8)
  { name: 'отмороженный беспредельщик', w: [5, 6, 8, 3] }, // 9 — гроза района
];
// Archetype index roll — the verbatim FUN_1000_0d14 triangular distribution: a
// uniform 1..51 roll is folded into a low-biased bucket, then shifted UP by the
// район number. So Ельцовка spawns mostly weak mooks while Шлюз leans on the
// tougher rows; авторитет/беспредельщик stay rare everywhere. (districtNum = район+1)
function rollArchetypeIndex(districtNum) {
  let t = roll(0x33) + 1;                 // 1..51
  let k = 1, viaBreak = false;
  for (; t - k >= 0; k++) {
    t -= k;
    if (k === 10) { viaBreak = true; break; }
  }
  if (!viaBreak) t = 10 - k;
  t += roll(districtNum);                  // район bias (0 in Ельцовка)
  if (t > 9) t = 9;
  if (t < 0) t = 0;
  return t;
}
// Distribute (sum(weights) + level×2) stat points across the four stats with
// probability proportional to each weight — the verbatim EXE loop @ FUN_1000_0d14.
function distributeStats(w, level) {
  const sum = w[0] + w[1] + w[2] + w[3];
  const total = sum + level * 2;
  const s = [0, 0, 0, 0];
  for (let i = 0; i < total; i++) {
    const r = roll(sum) + 1;                       // 1..sum
    if      (r <= w[0])                      s[0]++;
    else if (r <= w[0] + w[1])               s[1]++;
    else if (r <= w[0] + w[1] + w[2])        s[2]++;
    else                                     s[3]++;
  }
  return { str: s[0], dex: s[1], vit: s[2], luck: s[3] };
}
function spawnEnemy(playerLevel, districtBonus = 0) {
  const lvl  = Math.max(1, playerLevel + districtBonus + roll(3) - 1);
  const d    = Math.round(districtBonus / 3);      // enemyBonus 0/3/6 → район 0/1/2
  const arch = ENEMY_ARCHETYPES[rollArchetypeIndex(d + 1)];
  const st   = distributeStats(arch.w, lvl);
  // EXE shape is vit×5+str+10 (same as player); the port makes mooks squishier
  // than the hero (vit×2+str+5) so fights aren't a 30-round slog. (balance tuning)
  const hp   = st.vit * 2 + st.str + 5;
  // Enemy armor scales gently with the district (EXE 0x3968 grew as район²·2, but
  // that made mooks tankier than the final boss — kept linear & sub-boss). (tuning)
  const armor = d * 2 + roll(d + 1);               // d0:0 · d1:2-3 · d2:4-6
  const lootTable = [
    null, null, null,
    { name: 'кастет', dmg: 2 },
    { name: 'дубинка', dmg: 4 },
    { name: 'ножик', dmg: 6 },
  ];
  return { name: arch.name, hp, max_hp: hp, str: st.str, dex: st.dex, luck: st.luck,
           armor, level: lvl, broken_jaw: false, broken_leg: false,
           loot: lootTable[roll(lootTable.length)] };
}

// Маньяк — редкая опасная уличная встреча (verbatim диалог @ EXE 0x2c5e, обрабатывается
// в FUN_1000_3d11): мирная болтовня оборачивается ножом. Качается как беспредельщик
// (archetype 9) и роняет тесак. Не попадает под скидку «наколки» — это исключение
// («кроме … маньяков», EXE @ 0xab24).
const MANIAC_INTRO = [
  'Слышь, Вась...',
  'Какой-то мутный тип увязался за тобой: «А чё ваще? Пацан, ты из какого района?»',
  '«А ты по пинкам суди!»',
  'Эй, мудак?! Блин, это же — известный... Я МАНЬЯК!!!',
  'Рад познакомиться! Ну вот мы и встретились, мудак!',
];
function spawnManiac(playerLevel, districtBonus = 0) {
  const lvl = Math.max(2, playerLevel + districtBonus + 1);
  const d   = Math.round(districtBonus / 3);
  const st  = distributeStats(ENEMY_ARCHETYPES[9].w, lvl);  // беспредельщик shape
  const hp  = st.vit * 2 + st.str + 5;
  return { name: 'маньяк', hp, max_hp: hp, str: st.str, dex: st.dex, luck: st.luck,
           armor: d * 2 + roll(d + 1), level: lvl, isManiac: true,
           broken_jaw: false, broken_leg: false,
           loot: { name: 'тесак', dmg: 9 } };  // «тесак(урон+9) — ужасное оружие» @ 0x3c84
}

// Менты — drawn by gunfire (EXE @ 0x5747). Tougher than locals, hit hard, and
// don't count toward the district boss gate. Затемнённые очки let you slip by.
function spawnMent(playerLevel, districtBonus = 0) {
  const lvl = Math.max(2, playerLevel + districtBonus + 1);
  const hp  = 14 + lvl * 4 + roll(6);
  return { name: 'мент', hp, max_hp: hp, str: 5 + lvl, dex: 4 + lvl, luck: 3,
           armor: 2, level: lvl, broken_jaw: false, broken_leg: false,
           loot: null, isMent: true };
}
// Session-only «шухер» heat — raised by gunfire, decays while wandering. The
// higher it is, the more likely менты show up on the next `w`.
let mentHeat = 0;

// Пауза между «благодатными» встречами (маг Рушель Блаво / храм божий). После
// любой из них держим cooldown в несколько шатаний, иначе на старте маг лезет
// почти каждую минуту (см. wander-логику). Сессионный, не персистится.
let blessCooldown = 0;

// Пауза перед тем, как район-босс снова полезет после того, как он тебя завалил.
// Без неё босс с шансом ~85%/шатание re-ambush'ил игрока сразу же на 20% HP —
// death-spiral без шанса подготовиться (фидбек игрока). Сессионный, не персистится.
let bossCooldown = 0;

// ── Crowd lines (EXE @ 0x4823) ─────────────────────────────────────────────────
const CROWD = [
  '^6Зрители: Чё-тут за батва?',
  '^6Зрители: Я знаю вон того мудака, он уже нескольких запинал!',
  '^6Зрители: Чё так слабо бьёшь?! Пинай сильнее!',
  '^6Зрители: Дерьмово дерётесь придурки.',
];
let crowdTimer = 0;

// ── Per-район street colour (EXE @ 0x4823 / 0x73ee) ──────────────────────────
// Each район reads differently while wandering: the opening line of every `w`
// and the quiet-moment vignettes are drawn from the matching район's pool, so
// Ельцовка feels like a спальник, ОбьГЭС like a gritty окраина, Шлюз like the docks.
const DISTRICT_STREET = [
  { // 0 — Ельцовка (спальный район)
    openers: [
      'Бродишь дворами Ельцовки. Бельё на верёвках, лужи, битый асфальт.',
      'Шатаешься у пятиэтажек. На лавках бабки лузгают семки.',
      'Слоняешься у гаражей. Кругом пьяные рожи да ржавые «копейки».',
      'Бродя по окрестностям с самыми грязными намерениями...',
    ],
    quiet: [
      () => println('^6Где-то лают собаки, бабки на лавке перемывают кости.', 0x6),
      () => println('^6Пацанва гоняет банку по асфальту. На тебя ноль внимания.', 0x6),
      () => println('^6Из окна орёт «Владимирский централ». Романтика района.', 0x6),
    ],
  },
  { // 1 — ОбьГЭС (окраина, гаражи, стройки)
    openers: [
      'Чешешь вдоль гаражного кооператива ОбьГЭСа. Тут гопота позлее.',
      'Бредёшь мимо недостроя. Из темноты тянет дешёвым портвейном.',
      'Шатаешься у плотины. Ветер с Оби пробирает до костей.',
    ],
    quiet: [
      () => println('^6У костра в гаражах кто-то бренчит на расстроенной гитаре.', 0x6),
      () => println('^6Стая бродячих собак провожает тебя взглядом. Стрёмно.', 0x6),
      () => println('^6На стене баллончиком: «ОбьГЭС — наша зона». Романтика.', 0x6),
    ],
  },
  { // 2 — Шлюз (доки, шпана, рядом НГУ)
    openers: [
      'Идёшь по шлюзу. Баржи, ржавые краны, шлюзовская шпана по углам.',
      'Слоняешься у воды. Где-то рядом — корпуса НГУ и сам Ректор.',
      'Бредёшь доками. Каждый второй косится: чужак на районе.',
    ],
    quiet: [
      () => println('^6Шлюзовые ворота гудят, перегоняя воду. Жутковато.', 0x6),
      () => println('^6Студенты НГУ жмутся к остановке — тебя обходят за версту.', 0x6),
      () => println('^6Чайки дерутся над помойкой у причала. Полный беспредел.', 0x6),
    ],
  },
];

// ── Shop data ─────────────────────────────────────────────────────────────────
// Market items (mar / базар — EXE @ 0xA4AD / 0xA4CF)
const MARKET_ITEMS = [
  { name: 'Хотдог',              price: 8,  desc: 'HP +4',   buy: s => { s.hp = Math.min(s.hp+4, s.max_hp); } },
  { name: 'Пиво',                price: 5,  desc: 'HP +3',   buy: s => { s.hp = Math.min(s.hp+3, s.max_hp); s.drunk = Math.min(s.drunk+1, 10); } },
  { name: 'Косяк',               price: 10, desc: 'кайф +3 (расслабон)', buy: s => { s.high = Math.min(s.high+3, 10); } },
  // Офигенный косяк — «Очко прокачки» (EXE @ 0xab24): разовый +1 к самому
  // слабому боевому стату, мимо потолка качалки. Возвращает текст для лога.
  { name: 'Офигенный косяк',     price: 35, desc: 'кайф +3, очко прокачки (+1 к слабейшему стату)',
    minDist: 1,   // дорогая «прокачка» заводится только с ОбьГЭСа и дальше
    buy: s => {
      s.high = Math.min(s.high + 3, 10);
      const stats = ['str', 'dex', 'vitality', 'luck'];
      let lo = stats[0];
      for (const k of stats) if (s[k] < s[lo]) lo = k;
      s[lo] += 1;
      s.max_hp = calcMaxHp(s);
      return `^DОчко прокачки! ${STAT_NOUN[lo]} +1.`;
    } },
  // Per-район food variety — new items unlock as you reach tougher districts.
  { name: 'Шаурма',        price: 15, desc: 'HP +8',            minDist: 1,
    buy: s => { s.hp = Math.min(s.hp + 8, s.max_hp); } },
  { name: 'Беляш горячий', price: 12, desc: 'HP +6',            minDist: 2,
    buy: s => { s.hp = Math.min(s.hp + 6, s.max_hp); } },
  { name: 'Водка',         price: 18, desc: 'HP +2, хмель +4',  minDist: 2,
    buy: s => { s.hp = Math.min(s.hp + 2, s.max_hp); s.drunk = Math.min(s.drunk + 4, 10); } },
];
// Stat → именительный падеж для лога (Офигенный косяк / прокачка).
const STAT_NOUN = { str: 'Сила', dex: 'Ловкость', vitality: 'Живучесть', luck: 'Удача' };
// Verbatim stat-up lines from the shared blessing/level-up helper FUN_1000_2526
// (EXE: "Сила +1 / Ловкость +1 / Живучесть +1 / Удача +1", понт line @ 0x3d60).
const STAT_UP   = { str: 'Сила +1', dex: 'Ловкость +1', vitality: 'Живучесть +1', luck: 'Удача +1' };

// Dealer items (bmar — EXE @ 0xAB89 / 0xBCD6)
// `minDist` = первый район, где барыга этим торгует. В EXE ассортимент барыг
// растёт от района к району: в спальной Ельцовке только мелочёвка, тяжёлый
// арсенал (тесак, ствол, наколка) появляется ближе к ОбьГЭСу и Шлюзу.
const DEALER_ITEMS = [
  { name: 'Кастет',                price: 15, desc: 'урон+2',           dmg: 2, minDist: 0 },
  { name: 'Дубинка',               price: 25, desc: 'урон+4',           dmg: 4, minDist: 0 },
  { name: 'Ножик',                 price: 40, desc: 'урон+6',           dmg: 6, minDist: 1 },
  { name: 'Тесак',                 price: 70, desc: 'урон+9',           dmg: 9, minDist: 2 },
  { name: 'Понтовые бутсы',        price: 20, desc: 'урон+2',           dmg: 2, minDist: 0 },
  { name: 'Понтовёйшие бутсы',     price: 45, desc: 'урон+3, понт+1',   dmg: 3, pont: 1, minDist: 1 },
  { name: 'Зубная защита боксёров',price: 30, desc: 'броня+2, −75% перелом челюсти', armor: 2, jaw: true, minDist: 0 },
  // Кожанка — понтовая броня от случайностей (EXE @ 0xa59a / 0xa661). Two tiers;
  // a better кожанка replaces the worn one. Носить понтовые шмотки → понтовость.
  { name: 'Реальная кожанка',      price: 50, desc: 'защита от случайностей+2, понт+2', jacket: { armor: 2, pont: 2 }, minDist: 0 },
  { name: 'Ваще крутая кожанка',   price: 95, desc: 'броня+4, понт+3',                  jacket: { armor: 4, pont: 3 }, minDist: 1 },
  { name: 'Краденый мобильник',    price: 60, desc: 'подмога (v) приходит быстрее',   phone: true, minDist: 1 },
  // Зоновская наколка (EXE @ 0xab24): «Шансы, что наедут −50% (кроме бандитов,
  // ментов и маньяков)» — реже встречаешь рядовую гопоту на w. На ментов и
  // боссов не действует.
  { name: 'Зоновская наколка',     price: 90, desc: 'наезды −50% (кроме ментов и боссов)', nakolka: true, minDist: 2 },
  { name: 'Самопальный пистолет',  price: 120,desc: 'ствол для f (+3 патрона)',      gun: true, minDist: 1 },
  { name: 'Патроны (3 шт)',        price: 18, desc: '+3 патрона к самопалу',         ammo: 3, minDist: 1 },
  // Глушитель (EXE @ 0xac38): тихий выстрел — менты не слетаются на пальбу.
  { name: 'Глушитель',             price: 30, desc: 'тихий выстрел — менты не слышат (нужен ствол)', silencer: true, minDist: 1 },
  { name: 'Затемнённые очки',      price: 25, desc: 'уйти от ментов',                shades: true, minDist: 0 },
];

// Resale value of carryable gear (dealer buy price). Sells at half. EXE @ 0xB01D..
const WEAPON_VALUE = {
  'кастет': 15, 'дубинка': 25, 'ножик': 40, 'тесак': 70,
  'понтовые бутсы': 20, 'понтовёйшие бутсы': 45,
  // Кожанки тоже толкаются барыгам (EXE @ 0xb0b2 "Ты продал кожанку за #").
  'реальная кожанка': 50, 'ваще крутая кожанка': 95,
};
function weaponValue(name) { return WEAPON_VALUE[(name || '').toLowerCase()] || 0; }
function sellPrice(price)  { return Math.max(1, Math.floor(price / 2)); }
// Stash the currently-equipped weapon into junk when a better one replaces it.
function stashOldWeapon() {
  const v = weaponValue(STATE.weapon_name);
  if (STATE.weapon_dmg > 0 && v > 0)
    STATE.junk.push({ name: STATE.weapon_name, dmg: STATE.weapon_dmg, armor: 0, price: v });
}
// Stash the worn кожанка into junk when a better one replaces it.
function stashOldJacket() {
  if (!STATE.jacket) return;
  const v = weaponValue(STATE.jacket.name);
  if (v > 0) STATE.junk.push({ name: STATE.jacket.name, dmg: 0, armor: STATE.jacket.armor, price: v });
}
// Add a picked-up-but-unneeded weapon to junk (if it has any resale value).
function addJunk(name, dmg) {
  const v = weaponValue(name);
  if (v > 0) STATE.junk.push({ name, dmg, armor: 0, price: v });
}

// Gym options (trn — EXE @ 0x7241 / 0x72BA)
const GYM_ITEMS = [
  { name: 'Сила',        price: 3,  desc: '+1 сила, +1 макс HP',             stat: 'str',      noun: 'силу',     train: s => { s.str+=1; s.max_hp=calcMaxHp(s); } },
  { name: 'Ловкость',    price: 4,  desc: '+1 ловкость (+5% точность)',       stat: 'dex',      noun: 'ловкость', train: s => { s.dex+=1; } },
  { name: 'Живучесть',   price: 5,  desc: '+1 живучесть (+5 макс HP)',        stat: 'vitality', noun: 'пресс',    train: s => { s.vitality+=1; s.max_hp=calcMaxHp(s); } },
  { name: 'Удача',       price: 5,  desc: '+1 удача (больше везёт)',          stat: 'luck',     noun: 'удачу',    train: s => { s.luck+=1; } },
];

// ── REPL state ────────────────────────────────────────────────────────────────
let log   = [];
let input = '';
// modes: 'cmd' | 'name' | 'shop_market' | 'shop_dealer' | 'shop_gym' | 'shop_sell'
let mode  = 'cmd';
const LOG_LIMIT = 300;
const LOG_VIEW_ROWS = ROWS - 6;
let logTop = 0;
let logReview = false;
let denThefts = 0;
// When set, update() returns this state name on its next tick (used to
// hand off to the victory end-game screen after the boss dies mid-round).
let pendingState = null;

function maxLogTop() {
  return Math.max(0, log.length - LOG_VIEW_ROWS);
}
function isLogAtBottom() {
  return logTop >= maxLogTop();
}
function scrollLogToBottom() {
  logTop = maxLogTop();
  logReview = false;
}
function scrollLogBy(delta) {
  logTop = Math.max(0, Math.min(maxLogTop(), logTop + delta));
  logReview = !isLogAtBottom();
}
function scrollLogToTop() {
  logTop = 0;
  logReview = log.length > LOG_VIEW_ROWS;
}
function resetTransientState({ clearArrival = true } = {}) {
  input = '';
  mode = 'cmd';
  ENCOUNTER = null;
  pendingState = null;
  if (clearArrival) arrivalPending = false;
  mentHeat = 0;
  crowdTimer = 0;
  blessCooldown = 0;
  bossCooldown = 0;
  denThefts = 0;
  scrollLogToBottom();
}

// Visible width available for a log line (it's drawn from x=2, leaving a
// 2-col margin on each side of the 80-col grid — same budget the old
// draw-time slice used).
const WRAP_WIDTH = COLS - 4;

// Is `^c` a color escape? Mirrors render.js writeAt(): hex digit, or the
// ASCII-offset color range the original decoder used.
function isColorEsc(c) {
  if ('0123456789ABCDEFabcdef'.indexOf(c) >= 0) return true;
  const cc = c.charCodeAt(0);
  return (cc >= 0x21 && cc <= 0x2F) || (cc >= 0x3A && cc <= 0x3F);
}

// Word-wrap a `^N`-escaped string to `width` *visible* columns. Escapes count
// as zero width, and the active color is carried onto each continuation line
// (each wrapped line is drawn by its own writeAt() call, which would otherwise
// reset the foreground to the println color argument). Breaks on spaces when
// possible, hard-breaks an over-long run otherwise.
function wrapColored(text, width) {
  const lines = [];
  let line = '';          // chars (incl. escapes) on the current visual line
  let vis = 0;            // visible columns used on the current line
  let active = '';        // latest color escape seen (current color)
  let spaceIdx = -1;      // index in `line` of the last space (break point)
  let visBeforeSpace = 0; // visible columns before that space
  let colorAtSpace = '';  // active color at that space

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '^' && i + 1 < text.length && isColorEsc(text[i + 1])) {
      const esc = c + text[i + 1];
      line += esc;
      active = esc;
      i++;
      continue;
    }
    if (c === '\n') {
      lines.push(line);
      line = active; vis = 0; spaceIdx = -1;
      continue;
    }
    if (vis >= width) {
      if (spaceIdx >= 0) {
        const tail = line.slice(spaceIdx + 1);
        lines.push(line.slice(0, spaceIdx));
        line = colorAtSpace + tail;
        vis = vis - visBeforeSpace - 1;   // drop everything up to & incl. the space
      } else {
        lines.push(line);
        line = active; vis = 0;
      }
      spaceIdx = -1;
    }
    if (c === ' ') { spaceIdx = line.length; visBeforeSpace = vis; colorAtSpace = active; }
    line += c;
    vis++;
  }
  lines.push(line);
  return lines;
}

function println(text, color = 0x7) {
  const follow = !logReview || isLogAtBottom();
  for (const part of wrapColored(String(text), WRAP_WIDTH)) {
    log.push({ text: part, color });
    while (log.length > LOG_LIMIT) {
      log.shift();
      if (logTop > 0) logTop -= 1;
    }
  }
  if (follow) scrollLogToBottom();
}

// Per-район price scale (EXE: дороже в крутых районах). Базовые цены — для
// Ельцовки; ОбьГЭС +15%, Шлюз +30%. Еда (рынок), качалка и барыги растут вместе.
const DISTRICT_PRICE_MUL = [1, 1.15, 1.3];
function districtMul()  { return DISTRICT_PRICE_MUL[STATE.district] || 1; }
function scaledPrice(p) { return Math.max(1, Math.round(p * districtMul())); }
// Russian plural for «рубль»: 1→рубль, 2-4→рубля, 0/5-20→рублей (mod-10/mod-100 rule).
function rubli(n) {
  const m100 = Math.abs(n) % 100, m10 = m100 % 10;
  if (m100 >= 11 && m100 <= 14) return 'рублей';
  if (m10 === 1) return 'рубль';
  if (m10 >= 2 && m10 <= 4) return 'рубля';
  return 'рублей';
}
function repairCost(missingHp) {
  return Math.min(scaledPrice(30), scaledPrice(5 + Math.ceil(missingHp / 6)));
}
function spendForUse(cost, label) {
  if (STATE.money < cost) {
    println(`^CНа ${label} не хватает: надо ${cost}р, есть ${STATE.money}р.`, 0xC);
    return false;
  }
  STATE.money -= cost;
  return true;
}
// Вор bonus (EXE @ 0x805C "Бонус - Воровство, Барыги"): -25% at the dealers,
// applied on top of the per-район scale.
function dealerPrice(p) {
  const base = scaledPrice(p);
  return STATE.klass === 'vor' ? Math.max(1, Math.ceil(base * 0.75)) : base;
}
// Per-район available stock: a catalogue's items unlock as you move districts
// (EXE: ассортимент барыг/рынка отличается по районам). Items with no minDist
// are available everywhere.
function inStock(items)  { return items.filter(it => (it.minDist || 0) <= STATE.district); }
// How many catalogue items are still locked behind later районы (for the hint).
function lockedCount(items) { return items.length - inStock(items).length; }

// Show a numbered shop menu in the log. `priceFn` lets a shop (the dealers)
// display class-adjusted prices.
function openShopMenu(items, title, priceFn) {
  println(title, 0xE);
  items.forEach((item, i) => {
    const p = priceFn ? priceFn(item.price) : item.price;
    const price = `${p}р`.padStart(4);
    println(`  ${i+1}. ${item.name.padEnd(24)} ${price}  ${item.desc}`, 0xB);
  });
  println(`  У тебя: ${STATE.money}р`, 0x7);
  println('  [0] уйти', 0x7);
}

// ── Bone breaks (EXE @ 0x29c4 / 0x3754 / FUN_1000_1348) ────────────────────────
// A crit in the original is «Двойной урон!!!» (double damage) and may break the
// target's челюсть (jaw) or ногу (leg). Broken челюсть blocks beer/pills/eating;
// broken нога hampers the flurry (the EXE also blocks fleeing). Bones persist
// until healed at the больница (`r`), the храм, or the фенька's 5% self-heal.
// «висок» (temple shot) is the no-fracture crit variant.
function breakEnemyBone(e) {
  const part = roll(3);
  if (part === 0) {
    if (e.broken_jaw) return '^2Двойной урон!!! ';
    e.broken_jaw = true;
    return '^2Двойной урон!!! Ты сломал врагу челюсть! ';   // EXE «Враг: А! козёл!»
  }
  if (part === 1) {
    if (e.broken_leg) return '^2Двойной урон!!! ';
    e.broken_leg = true;
    return '^2Двойной урон!!! Ты сломал врагу ногу! ';      // EXE «Враг: Ну что за урод!»
  }
  return '^2Двойной урон!!! Точно в висок! ';
}
function breakPlayerBone() {
  const part = roll(3);
  if (part === 0) {
    // Зубная защита боксёров — −75% что сломают челюсть (EXE @ 0x6563).
    if (STATE.jaw_guard && roll(4) < 3) { println('^2Защита боксёра спасла твои кривые клыки.', 0xA); return; }
    if (STATE.broken_jaw) { println('^4Враг добил по уже сломанной челюсти!', 0xC); return; }
    STATE.broken_jaw = true;
    println('^4Враг сломал тебе челюсть!', 0xC);
  } else if (part === 1) {
    if (STATE.broken_leg) { println('^4Враг добил по сломанной ноге!', 0xC); return; }
    STATE.broken_leg = true;
    println('^4Враг сломал тебе ногу!', 0xC);
  } else {
    println('^4Удар в висок — в глазах потемнело!', 0xC);
  }
}

// ── Fight round ───────────────────────────────────────────────────────────────
// Both sides use the EXE flurry (FUN_1000_3d11): accuracy starts (stat+4)·5%,
// drops 18 points (−90% to-hit) per swing, looping while it stays > 0 and the
// target is alive. Each landed hit can crit at Удача×3 % for «Двойной урон!!!»
// (double damage) + a possible bone break; damage is then reduced by the target's
// armor. A broken нога drops the loser out of the flurry (no follow-up swing).
function fightRound() {
  const e = ENCOUNTER;

  // ── Player's turn ──
  let pAcc = hitChance(STATE.dex);     // to-hit %, capped 90; −90 per extra swing
  let pSwing = 0;
  do {
    pSwing++;
    if (pSwing === 2) println('^BЛовкость прёт — бьёшь ещё раз!', 0xB);
    if (roll(100) < Math.min(90, pAcc)) {
      let dmg = rollDmg(STATE.str, STATE.weapon_dmg);
      let prefix = '';
      if (roll(100) < STATE.luck * 3) {                  // крит = Удача×3 % (EXE)
        dmg *= 2;                                        // EXE «Двойной урон!!!»
        prefix = breakEnemyBone(e);                      // ломает врагу кость
      }
      dmg = Math.max(0, dmg - (e.armor || 0));           // enemy armor (EXE 0x3968)
      e.hp -= dmg;
      println(`${prefix}^2Ты пнул ${e.name} на ${dmg}з. У него осталось ${Math.max(0, e.hp)}`, 0xF);
      if (e.hp <= 0) { enemyDead(); return true; }
    } else {
      println('^4Ты промазал.', 0xC);
    }
    if (STATE.broken_leg) break;   // на сломаной ноге серию не сделать
    pAcc -= 90;
  } while (pAcc > 0);

  // ── Enemy's turn ──
  println(`^4${e.name}: Получи гнида!!`, 0xC);
  let eAcc = hitChance(e.dex);
  do {
    if (roll(100) < Math.min(90, eAcc)) {
      let dmg = rollDmg(e.str, 0);
      const crit = roll(100) < (e.luck || 0) * 3;
      if (crit) dmg *= 2;                                // EXE «Двойной урон!!!»
      dmg = applyArmor(dmg, effArmor());                 // player armor + кожанка
      STATE.hp -= dmg;
      println(`${crit ? '^4Двойной урон!!! ' : ''}^4Он пнул тебя на ${dmg}з. У тебя осталось ${Math.max(0, STATE.hp)}`, 0xC);
      if (crit) breakPlayerBone();                       // крит ломает тебе кость
      if (STATE.hp <= 0) { playerDead(); return true; }
    } else {
      println('^2Враг промазал.', 0xA);
    }
    if (e.broken_leg) break;   // хромой враг серию не добивает
    eAcc -= 90;
  } while (eAcc > 0);

  crowdTimer++;
  if (crowdTimer % 3 === 0) println(CROWD[roll(CROWD.length)], 0x6);

  persistState(STATE);
  return false;
}

// ── Ranged attack — самопальный пистолет (EXE @ 0x6023) ────────────────────────
// One loud, heavy hit with no enemy counter-attack that round. Spends a патрон
// and raises «шухер» heat so менты may turn up while you next wander.
function gunFire() {
  const e = ENCOUNTER;
  const dmg = 8 + roll(8) + Math.floor(STATE.luck / 2);
  e.hp -= dmg;
  STATE.ammo -= 1;
  if (STATE.silencer) {
    println(`^EПфф! Тихий выстрел из самопала на ${dmg}з. У него осталось ${Math.max(0, e.hp)}`, 0xE);
  } else {
    println(`^EБАХ! Ты пальнул из самопала на ${dmg}з. У него осталось ${Math.max(0, e.hp)}`, 0xE);
  }
  println(`^7Патронов осталось: ${STATE.ammo}`, 0x7);
  if (!STATE.silencer) mentHeat += 2;  // громкий выстрел — менты могут нагрянуть
  if (e.hp <= 0) { enemyDead(); return; }
  println('^6Враг очканул от ствола и отскочил — в этот раз не достал тебя.', 0x6);
  persistState(STATE);
}

function enemyDead() {
  const e = ENCOUNTER;
  const xp   = e.level * 5 + roll(5);
  const cash = roll(e.level * 3 + 3);
  STATE.exp += xp;
  STATE.rep += 1;

  if (e.isBoss) {
    if (cash > 0) { STATE.money += cash; }
    const d = STATE.district;
    if (e.isFinal) {
      // Real Ректор НГУ down — true ending (EXE @ 0x158F3).
      STATE.rector_done = true;
      STATE.rank = FINAL_RANK;
      ENCOUNTER = null;
      armVictory(STATE.nick, 'final');
      pendingState = 'victory';
      persistState(STATE);
      return;
    }
    // District boss down — advance to the next district (EXE @ 0x9B7F).
    if (d === 0) STATE.rank = VICTORY_RANK; // Проректор СУНЦа twist award
    STATE.district = d + 1;
    STATE.district_kills = 0;
    STATE.found = {};   // new district — rediscover every location (EXE @ 0x4331)
    ENCOUNTER = null;
    arrivalPending = true;
    armVictory(STATE.nick, DISTRICTS[d].victoryKind, DISTRICTS[d + 1].name);
    pendingState = 'victory';
    persistState(STATE);
    return;
  } else if (e.isMent) {
    // Менты — не местная гопота, к боссу не приближают, но платят беспределом.
    println('^2Ты завалил мента! Полный беспредел!', 0xA);
    println(`^6За отпин мусора ты получаешь ${xp} качков опыта.`, 0x6);
  } else {
    STATE.district_kills += 1;
    println(`^2${e.name} сдох.`, 0xA);
    println(`^6За отпин врага ты получаешь ${xp} качков опыта.`, 0x6);
  }

  if (cash > 0) { STATE.money += cash; println(`^1Нашарил у него ${cash}р.`, 0xF); }

  if (e.loot) {
    if (e.loot.dmg > STATE.weapon_dmg) {
      stashOldWeapon();
      println(`^1Ты нашел ${e.loot.name} (урон+${e.loot.dmg})!`, 0xF);
      STATE.weapon_name = e.loot.name; STATE.weapon_dmg = e.loot.dmg;
    } else {
      addJunk(e.loot.name, e.loot.dmg);
      println(`^6У него был ${e.loot.name} — в хлам тебе. Загони барыгам (wes/x).`, 0x6);
    }
  }

  ENCOUNTER = null;
  persistState(STATE);
}

function playerDead() {
  const e = ENCOUNTER;
  if (e?.isBoss) {
    // EXE @ 0x505A
    println('^4Ты сдох. Ректор тебя замочил. Ты так и не доказал свою крутизну.', 0xC);
    println('^1Тебе повезло знакомые пацаны отвезли тебя в больницу.', 0xA);
    bossCooldown = 4;  // breather — не давать боссу re-ambush'ить сразу же
  } else if (e?.isMent) {
    println('^4Менты тебя приняли. Ночь в обезьяннике, потом отпустили.', 0xC);
    mentHeat = 0;  // отсиделся — шухер улёгся
  } else {
    println('^4Тебя запинали в хлам. Очнулся у мусорки.', 0xC);
  }
  // Кожанка — «защита от случайностей»: цепляешь меньше при провале (EXE @ 0xa59a).
  const lossFrac = Math.max(0.2, 0.5 - 0.05 * jacketArmor());
  const lost = Math.floor(STATE.money * lossFrac);
  if (lost > 0) {
    STATE.money = Math.max(0, STATE.money - lost);
    println(`^4Лишился ${lost}р.${STATE.jacket ? ' (кожанка спасла часть бабла)' : ''}`, 0xC);
  }
  STATE.hp = Math.max(1, Math.floor(STATE.max_hp * 0.2));
  ENCOUNTER = null;
  persistState(STATE);
}

// ── Shop purchase handlers ─────────────────────────────────────────────────────
function handleMarketPurchase(idx) {
  if (idx === 0) { mode = 'cmd'; println('^7Ушёл с рынка.', 0x7); return; }
  const item = inStock(MARKET_ITEMS)[idx - 1];
  if (!item) { println('^CНет такого.', 0xC); return; }
  const cost = scaledPrice(item.price);
  if (STATE.money < cost) { println(`^CДенег нет: нужно ${cost}р, есть ${STATE.money}р.`, 0xC); return; }
  STATE.money -= cost;
  const extra = item.buy(STATE);
  println(`^1Купил ${item.name}. -${cost}р. Деньги: ${STATE.money}р`, 0xA);
  if (extra) println(extra, 0xD);
  // Show updated HP/high if relevant
  println(`^AHP: ${STATE.hp}/${STATE.max_hp}`, 0xA);
}

function handleDealerPurchase(idx) {
  if (idx === 0) { mode = 'cmd'; println('^7Ушёл от барыг.', 0x7); return; }
  const item = inStock(DEALER_ITEMS)[idx - 1];
  if (!item) { println('^CНет такого.', 0xC); return; }
  const cost = dealerPrice(item.price);
  if (STATE.money < cost) { println(`^CНадо ${cost}р, есть ${STATE.money}р.`, 0xC); return; }
  const disc = STATE.klass === 'vor' ? ' ^B(по знакомству)' : '';

  // Самопал / патроны / очки (EXE @ 0x6023 / 0x5747)
  if (item.gun) {
    if (STATE.has_gun) { println('^6Ствол у тебя уже есть. Бери патроны.', 0x6); return; }
    STATE.money -= cost; STATE.has_gun = true; STATE.ammo += 3;
    println(`^1Купил ${item.name}. Теперь есть ствол — стреляй командой ^6f^1. Патронов: ${STATE.ammo}. -${cost}р.${disc}`, 0xA);
    println(`^7Деньги: ${STATE.money}р`, 0x7);
    return;
  }
  if (item.ammo !== undefined) {
    if (!STATE.has_gun) { println('^6Сначала купи ствол — патроны без него ни к чему.', 0x6); return; }
    STATE.money -= cost; STATE.ammo += item.ammo;
    println(`^1Купил ${item.name}. Патронов: ${STATE.ammo}. -${cost}р.${disc}`, 0xA);
    println(`^7Деньги: ${STATE.money}р`, 0x7);
    return;
  }
  if (item.shades) {
    if (STATE.shades) { println('^6Очки у тебя уже есть.', 0x6); return; }
    STATE.money -= cost; STATE.shades = true;
    println(`^1Купил ${item.name}. Теперь менты тебя не узнают. -${cost}р.${disc}`, 0xA);
    println(`^7Деньги: ${STATE.money}р`, 0x7);
    return;
  }
  if (item.phone) {
    if (STATE.has_phone) { println('^6Мобила у тебя уже есть.', 0x6); return; }
    STATE.money -= cost; STATE.has_phone = true;
    println(`^1Купил ${item.name}. Подмога (^6v^1) теперь прибегает быстрее. -${cost}р.${disc}`, 0xA);
    println(`^7Деньги: ${STATE.money}р`, 0x7);
    return;
  }
  // Зоновская наколка (EXE @ 0xab24) — реже наезжают рядовые гопники на w.
  if (item.nakolka) {
    if (STATE.nakolka) { println('^6Наколка у тебя уже есть — блатная синька на месте.', 0x6); return; }
    STATE.money -= cost; STATE.nakolka = true;
    println(`^1Барыга наколол тебе зоновскую наколку. Теперь рядовая гопота реже наезжает. -${cost}р.${disc}`, 0xA);
    println('^6На ментов, боссов и беспредел она не действует.', 0x6);
    println(`^7Деньги: ${STATE.money}р`, 0x7);
    return;
  }
  // Глушитель (EXE @ 0xac38) — выстрел тихий, менты не слетаются.
  if (item.silencer) {
    if (!STATE.has_gun) { println('^6Сначала купи ствол — глушитель навинчивать не на что.', 0x6); return; }
    if (STATE.silencer) { println('^6Глушитель уже стоит на стволе.', 0x6); return; }
    STATE.money -= cost; STATE.silencer = true;
    println(`^1Навинтил глушитель. Теперь стреляешь (^6f^1) тихо — менты не сбегаются. -${cost}р.${disc}`, 0xA);
    println(`^7Деньги: ${STATE.money}р`, 0x7);
    return;
  }

  // Кожанка — понтовая броня (EXE @ 0xa59a / 0xa661). Tiered: only a stronger
  // кожанка replaces the worn one. Носишь понтовое → понтовость растёт (0x3d60).
  if (item.jacket) {
    if (STATE.jacket && STATE.jacket.armor >= item.jacket.armor) {
      println('^6Утебя есть кожанка круче.', 0x6);   // EXE @ 0xa8d8
      return;
    }
    stashOldJacket();
    STATE.money -= cost;
    STATE.jacket = { name: item.name, armor: item.jacket.armor };
    println(`^1Накинул: ${item.name} (защита+${item.jacket.armor}). -${cost}р.${disc}`, 0xA);
    if (item.jacket.pont) {
      STATE.pont = Math.min(PONT_MAX, STATE.pont + item.jacket.pont);
      println(`^1Понтовость увеличивается: +${item.jacket.pont}. Теперь ${STATE.pont}/${PONT_MAX}.`, 0xD);
    }
    println(`^7Деньги: ${STATE.money}р`, 0x7);
    return;
  }

  // Weapon upgrade
  if (item.dmg !== undefined && item.armor === undefined) {
    if (item.dmg <= STATE.weapon_dmg) {
      println(`^6У тебя уже есть ${STATE.weapon_name} (урон+${STATE.weapon_dmg}) — круче. Не берёшь.`, 0x6);
      return;
    }
    stashOldWeapon();
    STATE.money -= cost;
    STATE.weapon_name = item.name; STATE.weapon_dmg = item.dmg;
    println(`^1Купил ${item.name} (урон+${item.dmg}). -${cost}р.${disc}`, 0xA);
    if (item.pont) {
      STATE.pont = Math.min(PONT_MAX, STATE.pont + item.pont);
      println(`^1Понтовость увеличивается: +${item.pont}. Теперь ${STATE.pont}/${PONT_MAX}.`, 0xD);
    }
  }
  // Armor / gear
  if (item.armor !== undefined && item.dmg === undefined) {
    STATE.money -= cost;
    STATE.armor += item.armor;
    if (item.jaw) STATE.jaw_guard = true;
    println(`^1Купил ${item.name}. Броня теперь ${STATE.armor}. -${cost}р.${disc}`, 0xA);
  }
  // Items with both dmg and armor
  if (item.armor !== undefined && item.dmg !== undefined) {
    if (item.dmg > STATE.weapon_dmg) {
      stashOldWeapon();
      STATE.money -= cost;
      STATE.weapon_name = item.name; STATE.weapon_dmg = item.dmg;
      STATE.armor += item.armor;
      if (item.jaw) STATE.jaw_guard = true;
      println(`^1Купил ${item.name}. -${cost}р.${disc}`, 0xA);
    } else {
      println(`^6У тебя уже лучшее оружие.`, 0x6);
    }
  }
  println(`^7Деньги: ${STATE.money}р`, 0x7);
}

function handleGymTrain(idx) {
  if (idx === 0) { mode = 'cmd'; println('^7Ушёл из качалки.', 0x7); return; }
  const item = GYM_ITEMS[idx - 1];
  if (!item) { println('^CНет такого.', 0xC); return; }
  // Per-district training cap (EXE @ 0x6647). You can't pump a stat past the
  // район's ceiling — gotta beat the local boss and move on first.
  const cap = curDistrict().trainCap[item.stat];
  if (STATE[item.stat] >= cap) {
    println(`^CТы максимально прокачал ${item.noun} для своего уровня!`, 0xC);
    if (STATE.district < DISTRICTS.length - 1) println('^6Качай дальше в следующем районе.', 0x6);
    else                                       println('^6Ты на пике — иди мочи Ректора НГУ.', 0x6);
    return;
  }
  const cost = scaledPrice(item.price);
  if (STATE.money < cost) { println(`^CНадо ${cost}р, есть ${STATE.money}р.`, 0xC); return; }
  STATE.money -= cost;
  item.train(STATE);
  persistState(STATE);
  println(`^2${item.name} +1. (теперь: Сил ${STATE.str} Лов ${STATE.dex} Жив ${STATE.vitality} Уд ${STATE.luck})`, 0xA);
  println(`^2Макс. HP: ${STATE.max_hp}  Урон: ${Math.max(1,Math.floor(STATE.str/2)+STATE.weapon_dmg)}-${STATE.str+STATE.weapon_dmg}`, 0xA);
}

// ── Sell / junk handlers (wes / x — EXE @ 0xB00D / 0xAF9F) ──────────────────────
function openSellMenu() {
  if (!STATE.junk.length) { println('^6Хлама нет — всё при тебе.', 0x6); mode = 'cmd'; return; }
  println('^E== Барахолка (продажа) ==', 0xE);
  STATE.junk.forEach((it, i) => {
    const sp = `${sellPrice(it.price)}р`.padStart(4);
    const tag = it.armor ? `(броня+${it.armor})` : `(урон+${it.dmg})`;
    println(`  ${i+1}. ${it.name.padEnd(20)} ${sp}  ${tag}`, 0xB);
  });
  println('  [0] уйти', 0x7);
}

function handleSell(idx) {
  if (idx === 0) { mode = 'cmd'; println('^7Ушёл от барыг.', 0x7); return; }
  const it = STATE.junk[idx - 1];
  if (!it) { println('^CНет такого.', 0xC); return; }
  const sp = sellPrice(it.price);
  STATE.money += sp;
  STATE.junk.splice(idx - 1, 1);
  // EXE @ 0xB01D: "Ты продал кастет за #."
  println(`^2Ты продал ${it.name} за ${sp}р. Деньги: ${STATE.money}р`, 0xA);
  if (!STATE.junk.length) { println('^6Весь хлам распродан.', 0x6); mode = 'cmd'; }
  else openSellMenu();
}

// ── Притон (the gopnik den — EXE @ 0x9F0A) ─────────────────────────────────────
// An in-place sub-REPL. Sub-commands raise/spend понтовость (street-cred),
// which gates calling backup (`v`) and entering the club (`kl`).
function denMenu() {
  println('^EВ притоне можно:', 0xE);
  println('  ^6p ^7 - угостить пацанов пивом (+понт, 5р)', 0x7);
  println('  ^6r ^7 - занять денег на пиво (−2 понт)', 0x7);
  println('  ^6hp^7 - подлечиться у пацанов', 0x7);
  println('  ^6a ^7 - разузнать, где что в районе', 0x7);
  println('  ^6d ^7 - пойти на дело (воровать деньги)', 0x7);
  println('  ^6s ^7 - спросить про свою понтовость', 0x7);
  println(`  ^7Понтовость: ${STATE.pont}/${PONT_MAX}    [0] свалить`, 0x7);
}

function handleDen(raw) {
  const cmd = raw.trim().toLowerCase();
  if (!cmd) return;
  if (cmd === '0' || cmd === 'e' || cmd === 'exit') {
    mode = 'cmd'; denThefts = 0; println('^7Свалил из притона.', 0x7); return;
  }
  switch (cmd) {
    case 'p': {  // угостить пацанов пивом
      if (STATE.money >= 5) {
        STATE.money -= 5;
        // Diminishing street-cred: a round of beer buys less the more понта ты
        // уже наел, so maxing out is a real grind, not 2-3 rounds (was a flat
        // +5/+7). Гопник keeps the Притон bonus (+1).
        const headroom = PONT_MAX - STATE.pont;
        let gain = Math.max(1, Math.ceil(headroom / 4));  // 12→3, 9→3, 6→2, 4→1…
        if (STATE.klass === 'gopnik') gain += 1;
        const before = STATE.pont;
        STATE.pont = Math.min(PONT_MAX, STATE.pont + gain);
        const realGain = STATE.pont - before;
        if (realGain > 0) {
          println(`^2Ты угостил пацанов пивом. Понтовость улутшилась на ${realGain}.`, 0xA);
        } else {
          println('^6Ты и так в полном понте — некуда расти.', 0x6);
        }
        println(`^7Понтовость: ${STATE.pont}/${PONT_MAX}   Деньги: ${STATE.money}р`, 0x7);
      } else {
        println('^6А нет у тебя пива.', 0x6);
      }
      break;
    }
    case 'r': {  // занять денег на пиво
      if (STATE.pont >= PONT_GATE_BORROW) {
        const got = 2 + roll(3);
        STATE.money += got;
        STATE.pont -= 2;
        println(`^2Ты занял ${got} рубля на пиво. Понтовость уменьшилась на 2.`, 0xA);
        println(`^7Понтовость: ${STATE.pont}/${PONT_MAX}   Деньги: ${STATE.money}р`, 0x7);
      } else {
        println('^6Ты уже всю мелочь выгреб!', 0x6);
      }
      break;
    }
    case 'hp':  // подлечиться у пацанов
      if (STATE.hp < STATE.max_hp) {
        STATE.hp = Math.min(STATE.max_hp, STATE.hp + 6);
        println(`^2Пацаны налили, ты передохнул. HP: ${STATE.hp}/${STATE.max_hp}`, 0xA);
      } else {
        println('^6Ты и так в порядке.', 0x6);
      }
      break;
    case 'a': {  // разузнать, где что в районе (EXE @ 0x9FB0)
      const reveal = ['trn', 'bmar'].filter(k => !isFound(k));
      if (reveal.length) {
        for (const k of reveal) STATE.found[k] = true;
        println('^2Ты узнал где находится качалка и где находятся барыги.', 0xA);
      } else {
        println('^6Тут ты уже всё разнюхал.', 0x6);
      }
      break;
    }
    case 'd': {  // пойти на дело — воровать (EXE @ 0x9FF0 / 0x3754 «менты накроют»)
      println('^2Ты пришел воровать деньги...', 0xA);
      const slick = roll(10) + (STATE.klass === 'vor' ? 3 : 0) + Math.floor(STATE.luck / 2);
      const heat = denThefts * 2;
      if (heat > 0) println(`^6После прошлых дел шухер выше: риск +${heat}.`, 0x6);
      if (slick < 4 + heat) {
        println('^4Шухер менты! Пора валить!', 0xC);
        const lost = Math.min(STATE.money, 3 + roll(5) + denThefts * 3);
        STATE.money -= lost;
        STATE.pont = Math.max(0, STATE.pont - 1);
        println(`^4Менты тебя тряхнули. −${lost}р, понтовость −1.`, 0xC);
      } else {
        const got = 5 + roll(10) + (STATE.klass === 'vor' ? roll(6) : 0);
        STATE.money += got;
        denThefts += 1;
        println('^2Ты смылся от ментов.', 0xA);
        println(`^2Ты наваровал денег: +${got}р. Деньги: ${STATE.money}р`, 0xA);
      }
      break;
    }
    case 's':  // спросить про понтовость
      println(`^4Твоя понтовость сейчас = ${STATE.pont}/${PONT_MAX}.`, 0xC);
      // Подмога (`v`) включается только с PONT_GATE_BACKUP (см. кейс 'v').
      if (STATE.pont >= PONT_GATE_BACKUP) {
        println('^7Да если чё мы за тебя впрягёмся.', 0x7);
      } else {
        println('^6Да кто за такого мутного впрягаться будет? Поднимай понт.', 0x6);
      }
      break;
    default:
      println('^CЧё? Тут так не говорят. (p / r / hp / a / d / s, 0 — свалить)', 0xC);
      return;
  }
  persistState(STATE);
}

// ── Клуб — sub-REPL (EXE @ 0xA130 / kl fragments [1079-1089]) ───────────────────
function klMenu() {
  const discoCost  = scaledPrice(15);
  const tricksCost = scaledPrice(22);
  println('^EВ клубе можно:', 0xE);
  println(`  ^6t ^7— потусоваться на дискотеке (Ловкость +1, ${discoCost}р)`, 0x7);
  println(`  ^6m ^7— разузнать приемы мухлёжников (Удача +1, ${tricksCost}р)`, 0x7);
  println('  ^6k ^7— сыграть в карты (k <ставка>, минимум 5р)', 0x7);
  println(`  ^7Деньги: ${STATE.money}р    [0] свалить`, 0x7);
}

function handleKl(raw) {
  const parts = raw.trim().toLowerCase().split(/\s+/);
  const cmd = parts[0];
  if (!cmd) return;
  if (cmd === '0' || cmd === 'e' || cmd === 'exit') {
    mode = 'cmd'; println('^7Свалил из клуба.', 0x7); return;
  }

  const discoCost  = scaledPrice(15);
  const tricksCost = scaledPrice(22);
  const cap        = curDistrict().trainCap;

  switch (cmd) {
    case 't': {  // дискотека — Ловкость +1 (verbatim [1088])
      if (STATE.money < discoCost) { println(`^4Не хватает денег — надо ${discoCost}р.`, 0xC); break; }
      if (STATE.dex >= cap.dex)    { println('^6Ловкость уже на потолке для этого района. Иди в клуб покруче.', 0x6); break; }
      STATE.money -= discoCost;
      STATE.dex += 1;
      println('^2Ты прокачиваешь ловкость.', 0xA);  // verbatim [1088]
      println(`^2Ловкость +1. Теперь ${STATE.dex}. Деньги: ${STATE.money}р`, 0xA);
      break;
    }
    case 'm': {  // мухлёжники — Удача +1 (verbatim [1089])
      if (STATE.money < tricksCost) { println(`^4Не хватает денег — надо ${tricksCost}р.`, 0xC); break; }
      if (STATE.luck >= cap.luck)   { println('^6Местные жулики уже ничему тебя не научат.', 0x6); break; }
      STATE.money -= tricksCost;
      STATE.luck += 1;
      println('^2Ты прокачиваешь удачу.', 0xA);  // verbatim [1089]
      println(`^2Удача +1. Теперь ${STATE.luck}. Деньги: ${STATE.money}р`, 0xA);
      break;
    }
    case 'k': {  // карты (EXE @ 0xA130 / [1083-1087])
      const stakeRaw = parseInt(parts[1], 10);
      const stake    = Math.max(5, isNaN(stakeRaw) ? 10 : stakeRaw);
      if (STATE.money < stake) {
        println(`^4Не хватает денег — надо ${stake}р.`, 0xC);  // verbatim [1087]
        break;
      }
      STATE.money -= stake;
      println(`^7Ты поставил ${stake} рублей.`, 0x7);  // verbatim [1083]
      const r = roll(100);
      const winChance = 50 + STATE.luck * 2;  // luck nudges odds up to +36%
      if (r < 3) {
        // Редкий исход — мухлёж (verbatim [1086])
        const won = stake * 2;
        STATE.money += won;
        const xp = 2 + roll(4);
        STATE.exp += xp;
        println(`^2Ты выиграл ${won} рублей.`, 0xA);  // verbatim [1084]
        println('^4Козёл! Да ты мухлевал!', 0xC);     // verbatim [1086]
        println(`^6Ты получаешь ${xp} качков опыта за победу в игре.`, 0x6);  // verbatim [1086]
        println('^6Уноси ноги, пока не отобрали деньги другие кандидаты.', 0x6);  // verbatim [1086]
        persistState(STATE);
        mode = 'cmd'; return;
      } else if (r < winChance) {
        STATE.money += stake * 2;
        println(`^2Ты выиграл ${stake} рублей.`, 0xA);  // verbatim [1084]
        println(`^7Деньги: ${STATE.money}р`, 0x7);
      } else {
        println(`^4Ты проиграл ${stake} рублей.`, 0xC);  // verbatim [1085]
        println(`^7Деньги: ${STATE.money}р`, 0x7);
      }
      break;
    }
    default:
      println('^CЧё? Тут так не говорят. (t / m / k <ставка>  или  0 — свалить)', 0xC);
      return;
  }
  persistState(STATE);
}

// ── Побег с драки — `run` (EXE @ 0x4ca0, verbatim) ────────────────────────────
// The mirror image of the blessing: instead of +1 to a random stat, fleeing the
// fight costs −1 to a random stat (the EXE stores «Сила -1 / Ловкость -1 /
// Живучесть -1 / Удача -1» as a parallel pick-one message table) plus your
// понтовость crashes («Такого конявого непустят в местный притон!»). You cannot
// run from the Ректор («Бейся до конца трусливый урод!») nor on a broken leg
// («Ты не можешь убежать на сломаной ноге»).
function fleeCombat() {
  const e = ENCOUNTER;
  if (e.isFinal) {                       // Ректор не отпускает (verbatim @ 0x4ca0)
    println('^4Ректор: Кудa? Стоять! Бейся до конца трусливый урод!', 0xC);
    return;
  }
  if (e.isBoss) {                        // район-босс: тоже не сбежать
    println('^4Куда?! Стоять, трус! От главного отморозка района так просто не уйдёшь.', 0xC);
    return;
  }
  if (STATE.broken_leg) {                // сломана нога (verbatim @ 0x4cb7)
    println('^4Ты не можешь убежать на сломаной ноге.', 0xC);
    return;
  }
  println('^4Враг: Трусливый засранец!', 0xC);   // verbatim @ 0x4cd6
  // −1 к случайному стату (зеркало castBlessing; verbatim строки таблицы EXE).
  const penalties = [
    { line: '^4Сила -1',      stat: 'str' },
    { line: '^4Ловкость -1',  stat: 'dex' },
    { line: '^4Живучесть -1', stat: 'vitality' },
    { line: '^4Удача -1',     stat: 'luck' },
  ];
  const p = penalties[roll(penalties.length)];
  STATE[p.stat] = Math.max(1, STATE[p.stat] - 1);
  STATE.max_hp = calcMaxHp(STATE);
  STATE.hp = Math.min(STATE.hp, STATE.max_hp);
  println(p.line, 0xC);
  if (STATE.pont > 0) {
    STATE.pont = 0;                      // позорный побег обнуляет понтовость
    println('^4Такого конявого непустят в местный притон!', 0xC);  // verbatim @ 0x4ccf
  }
  ENCOUNTER = null;
  println('^6Ты позорно свалил с драки.', 0x6);
  persistState(STATE);
}

// ── Благославление — общий эффект для мага и Бога (EXE @ 0x92D2) ───────────────
// Bumps понтовость and one random combat stat, printing the verbatim EXE lines.
// Divine/magic boost — it bypasses the gym's per-район cap (paid/rare, so fine).
function castBlessing(pontGain) {
  const before = STATE.pont;
  STATE.pont = Math.min(PONT_MAX, STATE.pont + pontGain);
  const realGain = STATE.pont - before;
  println(`^1Да увеличится твоя понтовость! Был ты ${before} а стал ${STATE.pont}.`, 0xF);
  // Verbatim FUN_1000_2526 понт line (@ 0x3d60).
  println(`^1Понтовость увеличивается: +${realGain}`, 0xF);
  const blessings = [
    { line: '^1Да увеличиться твоя сила!',        stat: 'str' },
    { line: '^1Да уменьшиться твоя корявость!',    stat: 'dex' },
    { line: '^1Да возрастут твой силы жизненные!', stat: 'vitality' },
    { line: '^1Да снизойдет на тебя удача!',       stat: 'luck' },
  ];
  const b = blessings[roll(blessings.length)];
  STATE[b.stat] += 1;
  STATE.max_hp = calcMaxHp(STATE);
  println(b.line, 0xF);
  // Verbatim FUN_1000_2526 stat-up line ("Сила +1", etc.).
  println(`^1${STAT_UP[b.stat]}`, 0xF);
}

// ── Храм божий — бесплатное благословление + фенька (EXE @ 0x9000 / 0x9477) ─────
// A rare wandering encounter; you pray and Бог grants a blessing. On the first
// real visit (no ring yet) he hands you a «фенька» — a passive ring giving
// HP-regen on `w` + a chance to self-heal fractures. Repeat visits change his
// lines ("А ты опять... упорный мудак!"). All quoted lines verbatim from the EXE.
const RING_NAMES = [
  'Кольцо «Помоги господи»',
  '«Мега Кольцо»',
  'Кольцо «Господи помилуй»',
];
function templeVisit() {
  println('^FТы наткнулся на храм божий.', 0xF);
  if (STATE.temple_visits === 0) {
    println('^7Надо типа помолиться господу Богу, блин, нашему... Как делают новые русские.', 0x7);
    println('^2"Господи, Братан, прости грешника"... — начал было ты.', 0xA);
    println('^1Бог: "Ну.. Ладна, насылаю на тебя, типа, моё благославление."', 0xF);
  } else {
    println('^1Бог: "А ты опять. Да блин, упорный мудак!"', 0xF);
    println('^2"Господи, Братан, прости грешника опять"...', 0xA);
    println('^1Бог: "Ну ладно, насылаю на тебя благославление снова."', 0xF);
  }
  castBlessing(1 + roll(2));   // +1..2 понт (бесплатно, поскромнее мага)
  if (!STATE.ring) {
    const name = RING_NAMES[roll(RING_NAMES.length)];
    STATE.ring = { name };
    println('^1Дарю тебе феньку!', 0xF);
    println(`^1${name} — восст. жизни +3, 5% самозарост переломов.`, 0xF);
  } else {
    println('^7Фенька у тебя уже есть — носи, не теряй.', 0x7);
  }
  STATE.temple_visits += 1;
  persistState(STATE);
}

// ── Рушель Блаво — маг и экстрасенс (EXE @ 0x8CBA / 0x92D2 / 0x9477) ────────────
// A rare wandering encounter. In the original (FUN_1000_7538 @ 0x7538) Рушель
// Блаво is purely a **paid save-point**: he `getch`-confirms and charges
// district×50₽ to "поставить точку отката (сохранение) прямо здесь". The blessing
// /понтовость bump belongs to the храм (templeVisit), not the mage — so the port
// no longer offers it here. The price lives module-side for the sub-prompt.
let magicSaveCost = 0;
function offerMagic() {
  // EXE: стоимость = район(1-based)×50 (0x7538: [0x3692]*0x32). Порт: район 0-based.
  magicSaveCost = (STATE.district + 1) * 50;
  mode = 'magic';
  println('^FТы встретил великого мага и экстрасенса - Рушеля Блаво.', 0xF);
  // EXE @ 0x7538 — verbatim, with the literal '#' resolved to the price.
  println(`^7За ${magicSaveCost} рублей он может поставить точку отката (сохранение) прямо здесь.`, 0x7);
  println('^6y^7/^6s^7 — поставить точку отката   ^60^7/^6n^7 — отказаться', 0x7);
}

function handleMagic(raw) {
  const cmd = raw.trim().toLowerCase();
  if (!cmd) return;
  if (cmd === 'n' || cmd === '0' || cmd === 'e' || cmd === 'exit' || cmd === 'нет') {
    println('^6Нехотите как хотите - мое дело предложить.', 0x6);
    mode = 'cmd'; return;
  }
  if (cmd === 'y' || cmd === 's' || cmd === 'sv' || cmd === 'save' || cmd === '1' || cmd === 'да') {
    if (STATE.money < magicSaveCost) { println('^6Парень, все стоит бабок!', 0x6); return; }
    STATE.money -= magicSaveCost;
    persistState(STATE);
    if (writeCheckpoint(STATE)) {
      println('^1Рушель Блаво поставил точку отката прямо здесь. Сохранено!', 0xF);  // EXE «Сохранено!»
      println('^7Сюда можно откатиться командой ^6cp^7.', 0x7);
    } else {
      println('^CЧёт магия не сработала — сохранить не вышло.', 0xC);
      STATE.money += magicSaveCost;   // не берём денег за неудачу
    }
    println(`^7(Деньги: ${STATE.money}р)`, 0x7);
    mode = 'cmd';
    return;
  }
  println('^CЧё? (^6y^C/^6s^C — точка отката, ^60^C — отказаться)', 0xC);
}

// ── Больница / ветеринар (EXE @ 0xB245 sub-menu) ──────────────────────────────
// Faithful to the original two-service vet: `h` залатает раны (HP/царапины),
// `r` починит переломы (broken bones), `w` to leave. Prices are shown up front;
// picking the letter is the commit (the EXE has no separate y/n).
function fractureCost() { return scaledPrice(7); }   // EXE «7 рублей починят переломы»
function vetMenu() {
  const hpCost = STATE.hp < STATE.max_hp ? repairCost(STATE.max_hp - STATE.hp) : 0;
  const hasBreaks = STATE.broken_jaw || STATE.broken_leg;
  if (STATE.hp < STATE.max_hp) println(`^7  ^2h^7 - за ^6${hpCost}^7 ${rubli(hpCost)} тебя залатают (HP ${STATE.hp}/${STATE.max_hp})`, 0x7);
  if (hasBreaks) {
    const which = [STATE.broken_jaw && 'челюсть', STATE.broken_leg && 'нога'].filter(Boolean).join(' + ');
    println(`^7  ^2r^7 - за ^6${fractureCost()}^7 рублей починят переломы (${which})`, 0x7);
  }
  println('^7  ^2w^7 - свалить', 0x7);
}
function handleVet(raw) {
  const cmd = raw.trim().toLowerCase();
  if (!cmd) return;
  if (cmd === 'w' || cmd === '0' || cmd === 'e' || cmd === 'exit') {
    println('^7Ушёл от ветеринара.', 0x7);
    mode = 'cmd'; return;
  }
  if (cmd === 'h') {
    if (STATE.hp >= STATE.max_hp) { println('^0Дoк: вали отсюда — ты здоров.', 0x7); return; }
    const cost = repairCost(STATE.max_hp - STATE.hp);
    if (STATE.money < cost) { println(`^4Блин халявщик, медицина не бесплатная — нужно ${cost}р, есть ${STATE.money}р.`, 0xC); return; }
    const docQuips = [
      'Щас гайки подтянем и будешь как новый!',                  // verbatim [1051]
      'Так чё тут у нас? Ага, пара швов и всё будет в порядке.', // verbatim [1051]
      'Не волнуйся — всё зарастёт как на собаке.',               // verbatim [1042]
    ];
    println(`^0Дoк: ${docQuips[roll(docQuips.length)]}`, 0x7);
    if (roll(4) === 0) {
      println('^6— Эй, Дoк, а зачем тебе паяльник?', 0x6);       // verbatim [1051]
      println('^0Дoк: Молчи, животное!', 0x7);                   // verbatim [1052]
    }
    STATE.money -= cost;
    STATE.hp = STATE.max_hp;
    println(`^2Тебя залатали. Здоровья ${STATE.hp}/${STATE.max_hp}    −${cost}р`, 0xA);  // verbatim [1053]
    persistState(STATE);
    if (STATE.hp >= STATE.max_hp && !STATE.broken_jaw && !STATE.broken_leg) { mode = 'cmd'; return; }
    vetMenu();
    return;
  }
  if (cmd === 'r') {
    if (!STATE.broken_jaw && !STATE.broken_leg) { println('^0Дoк: да нет у тебя переломов, чё пришёл.', 0x7); return; }
    const cost = fractureCost();
    if (STATE.money < cost) { println(`^4Блин халявщик, медицина не бесплатная — нужно ${cost}р, есть ${STATE.money}р.`, 0xC); return; }
    STATE.money -= cost;
    STATE.broken_jaw = false;
    STATE.broken_leg = false;
    println(`^2Твои переломы залечены.    −${cost}р`, 0xA);  // verbatim @ 0xb353
    persistState(STATE);
    if (STATE.hp >= STATE.max_hp) { mode = 'cmd'; return; }
    vetMenu();
    return;
  }
  println('^CЧё? (^6h^C — залатать, ^6r^C — переломы, ^6w^C — уйти)', 0xC);
}

// ── Command handler ───────────────────────────────────────────────────────────
function runCommand(cmd) {
  cmd = cmd.trim().toLowerCase();
  if (!cmd) return null;
  println(`\\> ${cmd}`, 0xF);

  switch (cmd) {
    case 'help':
      {
        const helpStart = Math.max(0, log.length - 1);
        println('Команды:', 0xE);
        for (const [c, d] of HELP) println(`  ${c.padEnd(6)}  ${d.slice(0, COLS - 12)}`, 0xB);
        println('^7В каждом районе места (рынок/качалка/клуб...) надо сперва найти — шатайся (w).', 0x7);
        logTop = Math.min(helpStart, maxLogTop());
        logReview = log.length > LOG_VIEW_ROWS;
      }
      break;

    case 'w': {
      const street = DISTRICT_STREET[STATE.district] || DISTRICT_STREET[0];
      println(`^6${street.openers[roll(street.openers.length)]}`, 0x6);

      if (ENCOUNTER) { println('^4Ты уже нашел мудака. Разберись сначала с ним!', 0xC); break; }

      // Отморозок — самолечение царапин (EXE @ 0x7FEB).
      if (STATE.klass === 'otmorozok' && STATE.hp < STATE.max_hp) {
        STATE.hp = Math.min(STATE.hp + 2, STATE.max_hp);
        println(`^2Царапины затягиваются сами собой. HP: ${STATE.hp}/${STATE.max_hp}`, 0xA);
      }

      // Фенька — пассивная регенерация жизни на ходу (EXE @ 0x9477 "Восст. жизни").
      if (STATE.ring && STATE.hp < STATE.max_hp) {
        STATE.hp = Math.min(STATE.hp + 3, STATE.max_hp);
        println(`^2Фенька тихо лечит: +3 HP. (${STATE.hp}/${STATE.max_hp})`, 0xA);
      }
      // Фенька — 5% самозарост переломов на ходу (EXE @ 0x9477 "5% - самозарост переломов").
      if (STATE.ring && (STATE.broken_jaw || STATE.broken_leg) && roll(20) === 0) {
        if (STATE.broken_jaw) { STATE.broken_jaw = false; println('^2Фенька: челюсть сама собой срослась!', 0xA); }
        else { STATE.broken_leg = false; println('^2Фенька: нога сама собой зажила!', 0xA); }
      }

      // Coin on the ground (EXE @ 0xA097)
      if (roll(10) === 0) {
        const coins = 1 + roll(4);
        STATE.money += coins;
        println(`^1Опа бабки! ${coins}р на пиво!`, 0xA);
      }

      // Вор — воровство: чистит карманы прохожих чаще (EXE @ 0x805C).
      if (STATE.klass === 'vor' && roll(3) === 0) {
        const loot = 2 + roll(5);
        STATE.money += loot;
        println(`^1Ты ловко обчистил чей-то карман: +${loot}р.`, 0xA);
      }

      // Stumble onto an undiscovered location (~45%/wander, EXE @ 0x9D85).
      if (roll(100) < 45) discoverOne();

      const dist = curDistrict();
      const rawPlayerLevel = Math.max(1, 1 + Math.floor(STATE.exp / 20));
      const enemyLevelCap = [8, 14, 22][STATE.district] || 22;
      const normalEnemyLevel = Math.min(rawPlayerLevel, enemyLevelCap);

      // Менты, привлечённые стрельбой (EXE @ 0x5747). Очки дают уйти от них.
      if (mentHeat > 0) {
        if (roll(10) < Math.min(7, mentHeat)) {
          mentHeat = Math.max(0, mentHeat - 2);
          if (STATE.shades) {
            println('^2Ты надел затемнённые очки — менты тебя не приметили.', 0xA);
          } else {
            ENCOUNTER = spawnMent(rawPlayerLevel, dist.enemyBonus);
            println('^4Из-за угла нарисовались менты! «Стоять, гопота!»', 0xC);
            println('^7Напиши ^6sv^7 чтобы приглядеться, ^6k^7 чтобы гасить.', 0x7);
            break;
          }
        } else {
          mentHeat = Math.max(0, mentHeat - 1);  // шухер постепенно улёгся
        }
      }

      // Маньяк — опасная встреча (verbatim @ EXE 0x2c5e). В оригинале это высокий
      // архетип из district-scaled пула (FUN_1000_0d14: индекс = треуг.rand+район),
      // поэтому в первом районе он почти не выпадает, а в крутых — чаще. Раньше
      // порт кидал flat ~6% с первого хода, отсюда «маньяк слишком рано».
      // «Наколка» на него не действует — это исключение (EXE @ 0xab24).
      const maniacOdds = [40, 20, 12][STATE.district] ?? 12;   // d0 ~2.5% · d1 5% · d2 ~8%
      const maniacReady = STATE.district > 0 || STATE.district_kills >= 3;  // не лезет к свежему уровню
      if (maniacReady && roll(maniacOdds) === 0) {
        ENCOUNTER = spawnManiac(rawPlayerLevel, dist.enemyBonus);
        for (const line of MANIAC_INTRO) println(`^4${line}`, 0xC);
        println('^7Напиши ^6sv^7 приглядеться, ^6k^7 гасить (а лучше ^6f^7 из ствола), ^6run^7 свалить.', 0x7);
        break;
      }

      // District boss — a *recurring opportunity* once you've cleared 5 locals
      // here, never a hard lock (EXE FUN_1000_3d11: the район boss becomes an
      // ongoing chance past a kill threshold, not a forced wander). Two fairness
      // guards on top (player feedback — got re-ambushed at 20% HP with no way to
      // flee a boss):
      //   • bossCooldown — a few-wander breather after the boss downs you, so you
      //     can heal/regroup instead of being re-jumped the very next `w`.
      //   • HP gate — the boss won't jump you while you're badly hurt; it "waits"
      //     and you're told to patch up first. You still can't flee mid-fight, so
      //     engaging it must be on your terms.
      // Ramp softened from 40%+15%/kill(cap90) to 35%+8%/kill(cap70): reliably
      // findable for progression, but no longer near-guaranteed every wander.
      if (bossCooldown > 0) bossCooldown -= 1;
      const bossPct = Math.min(70, 35 + 8 * (STATE.district_kills - 5));
      if (!STATE.rector_done && STATE.district_kills >= 5 && bossCooldown === 0
          && roll(100) < bossPct) {
        if (STATE.hp < STATE.max_hp * 0.5) {
          println('^6Ты приметил главного отморозка района — но лезть к нему в таком состоянии гиблое дело.', 0x6);
          println('^7Подлечись (^6rep^7 / больница, пиво ^6h^7) и возвращайся — никуда он не денется.', 0x7);
          persistState(STATE);
          break;
        }
        ENCOUNTER = dist.boss();
        // EXE @ 0x464A — boss intro lines are district-specific.
        for (const line of ENCOUNTER.intro) println(`^4${line}`, 0xC);
        println('^7Напиши ^6sv^7 чтобы приглядеться, ^6k^7 чтобы гасить.', 0x7);
        break;
      }

      // Рушель Блаво (маг, EXE @ 0x8CBA) и храм божий (EXE @ 0x9000) — платное и
      // бесплатное благословление. Обе встречи редкие и не выпадают подряд:
      // после любой из них держим паузу blessCooldown шатаний, иначе на старте
      // маг лезет почти каждую минуту.
      if (blessCooldown > 0) {
        blessCooldown -= 1;
      } else if (roll(20) === 0) {        // маг ~5% (когда не на кулдауне)
        blessCooldown = 8; offerMagic(); break;
      } else if (roll(18) === 0) {        // храм ещё реже
        blessCooldown = 8; templeVisit(); break;
      }

      // Normal enemy ~60%, scaled by the current district. Зоновская наколка
      // halves the наезд rate (EXE @ 0xab24) — but never affects менты/боссов.
      const spawnChance = STATE.nakolka ? 3 : 6;
      if (roll(10) < spawnChance) {
        ENCOUNTER = spawnEnemy(normalEnemyLevel, dist.enemyBonus);
        println(`^4Ты встретил: ${ENCOUNTER.name} (уровень ${ENCOUNTER.level}).`, 0xC);
        const left = Math.max(0, 5 - STATE.district_kills);
        if (left > 0) println(`^6До главного отморозка ${dist.name}: отпинай ещё ${left}.`, 0x6);
        println('^7Напиши ^6sv^7 приглядеться, ^6k^7 гасить, ^6run^7 свалить (западло).', 0x7);
      } else {
        // Спокойный ход — мелкая уличная зарисовка вместо пустоты (voice @ EXE 0x4823).
        // Район-зависимые виньетки + общие лёгкие эффекты (мелочь / протрезветь /
        // выветрить кайф) — без баланс-сдвигов.
        const flavour = [
          () => println('^7Обошёл всё — никого стоящего.', 0x7),
          ...street.quiet,
          () => { const c = 1 + roll(2); STATE.money += c; println(`^1Поднял ${c}р мелочи у ларька.`, 0xA); },
          () => { if (STATE.drunk > 0) { STATE.drunk -= 1; println('^7Проветрился на ходу — хмель чуть отпустил.', 0x7); } else println('^7Тишина да серые пятиэтажки.', 0x7); },
          () => { if (STATE.high > 0) { STATE.high -= 1; println('^7Кайф потихоньку выветривается.', 0x7); } else println('^7Ветер гоняет пакет по двору.', 0x7); },
          () => { if (STATE.money > 0) { STATE.money -= 1; println('^6Подкинул бабке у подъезда рубль на хлеб.', 0x6); } else println('^7Карманы пусты, как и двор.', 0x7); },
        ];
        flavour[roll(flavour.length)]();
        persistState(STATE);
      }
      break;
    }

    case 'sv':
      if (!ENCOUNTER) { println('^6Чё машешь копытами? Ищи мудака.', 0x6); break; }
      {
        const e = ENCOUNTER;
        const eAcc = pctHit(e.dex);
        const eMin = Math.max(1, Math.floor(e.str / 2));
        println(`^F${e.name}${e.isBoss ? ' — БОСС' : ''} (уровень ${e.level})`, 0xF);
        println(`^2Здоровье ${e.hp}/${e.max_hp}`, 0xA);
        println(`^2Урон ${eMin}-${e.str}    Точность ${eAcc}%${canFlurry(e.dex) && !e.broken_leg ? '  (серия ударов!)' : ''}`, 0xA);
        println(`^2Крит ${(e.luck || 0) * 3}%${e.armor ? `    Броня ${e.armor}` : ''}`, 0xA);
        // Сломанные кости врага (EXE FUN_1000_1348 «Сломана челюсть / Сломана нога»).
        if (e.broken_jaw) println('^4Сломана челюсть', 0xC);
        if (e.broken_leg) println('^4Сломана нога', 0xC);
      }
      break;

    case 'k':
      if (!ENCOUNTER) { println('^6Чё машешь копытами? Ищи мудака которого будешь пинать!', 0x6); break; }
      fightRound();
      break;

    case 'f':
      // Ranged самопал (EXE @ 0x6023). Только в бандитских районах — иначе
      // «менты накроют» (EXE @ 0x3754).
      if (!ENCOUNTER) { println('^6Не в кого стрелять.', 0x6); break; }
      if (!STATE.has_gun) { println('^6У тебя нет ствола. Спроси у барыг (^6bmar^6).', 0x6); break; }
      if (!curDistrict().gunZone) { println('^4Нельзя тут стрелять! Менты накроют!', 0xC); break; }
      if (STATE.ammo <= 0) { println('^4Патроны кончились. Купи у барыг (^6bmar^4).', 0xC); break; }
      gunFire();
      break;

    case 'v':
      if (!ENCOUNTER) { println('^7Подкрепление не нужно — тут никого нет.', 0x7); break; }
      // Backup is gated by понтовость (EXE @ 0x35E0): no cred → nobody shows up.
      if (STATE.pont < PONT_GATE_BACKUP) {
        println('^4Ни кто не хочет за тебя впрягаться.', 0xC);
        println('^6Сначала надо скорешиться с местной гопотой (притон, ^6pr^6).', 0x6);
        break;
      }
      const backupPont = STATE.pont;
      STATE.pont = Math.max(0, STATE.pont - 1);  // calling in a favour spends cred
      // Краденый мобильник — подмога приходит быстрее/надёжнее (EXE @ 0xaac7).
      if (STATE.has_phone) println('^DТы свистнул пацанам по мобиле — летят быстрее.', 0xD);
      if (roll(PONT_MAX) < Math.min(PONT_MAX, backupPont + 1 + (STATE.has_phone ? 4 : 0))) {
        println('^2Подошли пацаны - Ща начнется!', 0xA);
        const dmg = 4 + STATE.district * 3 + roll(3 + backupPont) + (STATE.has_phone ? 3 : 0);
        ENCOUNTER.hp -= dmg;
        println(`^2Врага отпинали на ${dmg}з. У него осталось ${Math.max(0, ENCOUNTER.hp)}`, 0xA);
        if (ENCOUNTER.hp <= 0) { enemyDead(); break; }
      } else {
        println('^2Твою подмогу отпинали.', 0xA);
        println('^4Подмоге надоело столько парится из-за мало понтового мудака.', 0xC);
      }
      break;

    case 'run':
      // Свалить с драки (EXE @ 0x4ca0). Нельзя от босса/Ректора и на сломаной ноге.
      if (!ENCOUNTER) { println('^6Не от кого бежать — никого тут нет.', 0x6); break; }
      fleeCombat();
      break;

    case 'mar':
      if (blockedLocation('mar')) break;
      mode = 'shop_market';
      // EXE @ 0xA48E
      println('^6А можно чё-то купить?', 0x6);
      openShopMenu(inStock(MARKET_ITEMS), `^E== Рынок (${curDistrict().name}) ==`, scaledPrice);
      if (lockedCount(MARKET_ITEMS)) println('^8Кое-что подвезут только в районах покруче.', 0x8);
      break;

    case 'bmar':
      if (blockedLocation('bmar')) break;
      mode = 'shop_dealer';
      // EXE @ 0xAA25
      println('^6Ты пришел к барыгам.', 0x6);
      println('^7Тут можно купить кое-что, спихнуть хлам (^6x^7) и продать ненужное (^6wes^7).', 0x7);
      if (STATE.klass === 'vor') println('^BБарыги — свои люди. Тебе скидка.', 0xB);
      openShopMenu(inStock(DEALER_ITEMS), `^E== Барыги (${curDistrict().name}) ==`, dealerPrice);
      if (lockedCount(DEALER_ITEMS)) println('^8Серьёзный арсенал барыги держат для районов покруче.', 0x8);
      break;

    case 'wes':
      // EXE @ 0xB00D — itemised resale of junk gear
      println('^6Продать вещи.', 0x6);
      mode = 'shop_sell';
      openSellMenu();
      break;

    case 'x': {
      // EXE @ 0xAF9F — dump all junk for a lump sum
      if (!STATE.junk.length) { println('^6Хлама нет — нечего толкать.', 0x6); break; }
      let total = 0;
      for (const it of STATE.junk) total += sellPrice(it.price);
      const n = STATE.junk.length;
      STATE.junk = [];
      STATE.money += total;
      println(`^1Барыги дали тебе денег за хлам. +${total}р (${n} шт). Деньги: ${STATE.money}р`, 0xA);
      break;
    }

    case 'trn': {
      if (blockedLocation('trn')) break;
      mode = 'shop_gym';
      // EXE @ 0xBD44
      println('^6Качалка. Там можно повысить свои бойцовские навыки.', 0x6);
      openShopMenu(GYM_ITEMS, `^E== Качалка (${curDistrict().name}) ==`, scaledPrice);
      const cap = curDistrict().trainCap;
      println(`^8Потолок ${curDistrict().name}: Сил ${STATE.str}/${cap.str} Лов ${STATE.dex}/${cap.dex} Жив ${STATE.vitality}/${cap.vitality} Уд ${STATE.luck}/${cap.luck}`, 0x8);
      break;
    }

    case 'rep': {
      if (blockedLocation('rep')) break;
      println('^6Ты пришел на ремот, к ветеринару.', 0x6);  // verbatim [1042]
      if (STATE.hp >= STATE.max_hp && !STATE.broken_jaw && !STATE.broken_leg) {
        println('^0Дoк: вали отсюда — ты здоров.', 0x7);  // verbatim [1047]
        break;
      }
      if (STATE.hp < Math.floor(STATE.max_hp / 2))
        println('^0Ого! Да тебя не иначе как грузовик откатал!', 0x7);  // verbatim [1049]
      mode = 'vet';
      vetMenu();
      break;
    }

    case 'girl': {
      if (blockedLocation('girl')) break;
      // Phone intro flavor (verbatim [943]) — occasional pre-arrival line
      if (STATE.has_phone && roll(2) === 0)
        println('^5Твоя пассия: «Привет, это я. Зайдёшь ко мне сегодня?»', 0xD);
      println('^2Ты пришел к своей подруге.', 0xA);  // verbatim [1055]
      const girlCost = scaledPrice(12);
      if (STATE.money < girlCost) {
        println('^6Ну не пойдёшь же как придурок без ничего.', 0x6);  // verbatim [1055]
        break;
      }
      // Club discovery: she takes you there if kl not yet found (verbatim [1055])
      if (!isFound('kl')) {
        println('^2Она вытащила тебя в клуб и теперь ты знаешь где он находиться.', 0xA);
        STATE.found.kl = true;
      }
      STATE.money -= girlCost;
      println(`^6Ты купил ей чё-то, потратив ${girlCost} рублей.`, 0x6);  // verbatim [1055]
      if (STATE.klass === 'pacan') {
        // Пацан bonus — Гёлфренд (EXE @ 0x7FB3): полное восстановление.
        STATE.hp = STATE.max_hp;
        println('^2Подруга рада тебе и зацеловала до полного здоровья.', 0xA);
      } else {
        STATE.hp = Math.min(STATE.hp + 8, STATE.max_hp);
        println('^2Ты расслабился, отдохнул и снова можешь творить свои гоповские дела.', 0xA);  // verbatim [1055]
      }
      println(`^2HP: ${STATE.hp}/${STATE.max_hp}`, 0xA);
      break;
    }

    case 'pr': {
      if (blockedLocation('pr')) break;
      const dens = ['общагу №5', 'общагу ВКИ', 'гоповский притон', 'притон отморозков'];
      println(`^6Ты пришел в притон — ${dens[roll(dens.length)]}.`, 0x6);
      if (STATE.klass === 'gopnik') println('^BСвои в доску! В притоне тебе всегда рады.', 0xB);
      denThefts = 0;
      mode = 'den';
      denMenu();
      break;
    }

    case 'kl':
      if (blockedLocation('kl')) break;
      // Club is gated by понтовость (EXE @ 0xA130): a nobody won't get in.
      if (STATE.pont < PONT_GATE_CLUB) {
        println('^4Тебя мудака такого туда не пустят — поднимай понтовость.', 0xC);
        println('^6Тебе не стоит пока туда соваться. Зайди в притон (^6pr^6).', 0x6);
        break;
      }
      println('^6Ты пришел в клуб.', 0x6);  // verbatim [1079]
      println('^7Громко орёт музыка, рожи такие же лохи как ты.', 0x7);
      // Пацан bonus — Клуб (EXE @ 0x7FB3): легче заводит нужные знакомства.
      if (roll(STATE.klass === 'pacan' ? 2 : 3) === 0) {
        STATE.rep += 1; println('^1Познакомился с нужными пацанами. Реп +1.', 0xA);
      }
      mode = 'kl';
      klMenu();
      break;

    case 's': {
      const acc    = pctHit(STATE.dex);
      const dMin   = Math.max(1, Math.floor(STATE.str/2) + STATE.weapon_dmg);
      const dMax   = STATE.str + STATE.weapon_dmg;
      println(`^7Ты, ${STATE.nick} (${curClass().name}). Уродская рожа смотрит в лужу.`, 0x7);
      println(`^2HP: ${STATE.hp}/${STATE.max_hp}   Сила: ${STATE.str}   Ловкость: ${STATE.dex}`, 0xA);
      println(`^2Живучесть: ${STATE.vitality}   Удача: ${STATE.luck}   Броня: ${effArmor()}${jacketArmor()?` (вкл. кожанку +${jacketArmor()})`:''}`, 0xA);
      println(`^2Урон: ${dMin}-${dMax}  Точность: ${acc}%${canFlurry(STATE.dex)&&!STATE.broken_leg?' ^B(серия!)':''}  ^2Крит: ${STATE.luck*3}%`, 0xA);
      if (STATE.broken_jaw || STATE.broken_leg) {
        const bones = [];
        if (STATE.broken_jaw) bones.push('сломана челюсть (нельзя пить/жрать колёса)');
        if (STATE.broken_leg) bones.push('сломана нога (нет серии ударов, не убежать)');
        println(`^4Переломы: ${bones.join(', ')} — лечись в больнице (rep ▸ r).`, 0xC);
      }
      println(`^6Деньги: ${STATE.money}р  Реп: ${STATE.rep}  Опыт: ${STATE.exp}  Понт: ${STATE.pont}/${PONT_MAX}`, 0x6);
      println(`^6Оружие: ${STATE.weapon_name}${STATE.weapon_dmg>0?` (урон+${STATE.weapon_dmg})`:''}${STATE.jaw_guard?' + зубная защита':''}`, 0x6);
      if (STATE.jacket) println(`^6Прикид: ${STATE.jacket.name} (защита+${STATE.jacket.armor})`, 0x6);
      if (STATE.ring) println(`^6Фенька: ${STATE.ring.name} (+3 HP на ходу, 5% самозарост переломов)`, 0x6);
      if (STATE.has_gun || STATE.shades || STATE.has_phone || STATE.nakolka || STATE.silencer) {
        const gear = [];
        if (STATE.has_gun)   gear.push(`самопал (патронов: ${STATE.ammo}, стреляй f)${STATE.silencer ? ' + глушитель' : ''}`);
        if (STATE.shades)    gear.push('затемнённые очки');
        if (STATE.has_phone) gear.push('краденый мобильник');
        if (STATE.nakolka)   gear.push('зоновская наколка (наезды −50%)');
        println(`^6Снаряга: ${gear.join(', ')}`, 0x6);
      }
      if (!curDistrict().gunZone) println('^8Тут стрелять нельзя — менты накроют.', 0x8);
      println(`^7Район: ${curDistrict().name} (${STATE.district+1}/${DISTRICTS.length})  Зачищено: ${STATE.district_kills}`, 0x7);
      {
        const known = LOCATION_KEYS.filter(isFound).map(k => k);
        const unknown = LOCATION_KEYS.filter(k => !isFound(k));
        println(`^2Известные места: ${known.length ? known.join(' ') : '— (шатайся, ищи: w)'}`, 0xA);
        if (unknown.length) println(`^6Ещё не найдено: ${unknown.join(' ')}`, 0x6);
      }
      println(`^BПогоняло: ${STATE.rank || rankForRep(STATE.rep)}  |  Класс: ${curClass().name} (бонус: ${curClass().bonus})`, 0xB);
      if (STATE.junk.length) println(`^CХлам (продай wes/x): ${STATE.junk.map(j=>j.name).join(', ')}`, 0xC);
      if (ENCOUNTER) println(`^4[Враг: ${ENCOUNTER.name} — HP ${ENCOUNTER.hp}/${ENCOUNTER.max_hp}]`, 0xC);
      if (STATE.rector_done) println('^FРектор НГУ повержен. Весь город под тобой!', 0xF);
      break;
    }

    case 'kos':
      {
      // Сломана челюсть — не схавать колёса (EXE @ 0x6653 / 0x2579).
      if (STATE.broken_jaw) { println('^4Ты не схавать колёса из-за сломаной челюсти.', 0xC); break; }
      const cost = scaledPrice(10);
      if (!spendForUse(cost, 'косяк')) break;
      STATE.high = Math.min(STATE.high + 2, 10);
      println(`^DКосяк. −${cost}р. High: ${STATE.high}. Всё замедлилось.`, 0xD);
      }
      break;

    case 'h':
      {
      // Сломана челюсть — пива не выпить (EXE @ 0x29c4 "из-за сломаной челюсти").
      if (STATE.broken_jaw) { println('^4Ты не можешь пить пиво из-за сломаной челюсти.', 0xC); break; }
      const cost = scaledPrice(5);
      if (!spendForUse(cost, 'пиво')) break;
      STATE.hp = Math.min(STATE.hp + 3, STATE.max_hp);
      STATE.drunk = Math.min(STATE.drunk + 1, 10);
      println(`^AПиво. −${cost}р. HP +3. HP: ${STATE.hp}/${STATE.max_hp}`, 0xA);
      }
      break;

    case 'mh':
      {
      // Сломана челюсть — не набухаться (EXE @ 0x29c4).
      if (STATE.broken_jaw) { println('^4Ты не можешь пить пиво из-за сломаной челюсти.', 0xC); break; }
      const cost = scaledPrice(20);
      if (!spendForUse(cost, 'бухло')) break;
      STATE.drunk = Math.min(STATE.drunk + 5, 10);
      STATE.hp = Math.min(STATE.hp + 2, STATE.max_hp);
      println(`^DНабухался до чёртиков. −${cost}р. Не помнишь как тут оказался.`, 0xD);
      }
      break;

    case 'name':
      println('^ESменить погоняло. Введи новое и нажми Enter.', 0xE);
      mode = 'name';
      break;

    case 'save':  persistState(STATE); println('^8Сохранено.', 0x8); break;
    case 'load':
      Object.assign(STATE, loadState());
      resetTransientState();
      println(`^8Загружено. ${STATE.nick}, HP ${STATE.hp}/${STATE.max_hp}.`, 0x8);
      break;
    case 'export':
      persistState(STATE);
      try { downloadSave(STATE, STATE.nick); println('^8Сейв скачан файлом (.json). Перенеси его на другое устройство.', 0x8); }
      catch (e) { println(`^CНе вышло скачать сейв: ${e.message || e}`, 0xC); }
      break;
    case 'import':
      // File picker is async; apply the result on resolve and re-persist.
      pickSaveFile()
        .then(text => {
          const incoming = importSave(text);                 // throws on bad file
          Object.assign(STATE, migrateState(incoming, true)); // same path as load
          resetTransientState();
          persistState(STATE);
          println(`^8Сейв загружен из файла. ${STATE.nick}, HP ${STATE.hp}/${STATE.max_hp}, ${STATE.money}р.`, 0x8);
        })
        .catch(e => println(`^CИмпорт не удался: ${e.message || e}`, 0xC));
      println('^7Выбери .json-файл сейва в открывшемся окне...', 0x7);
      break;
    case 'bug':
      try { downloadLog(log, STATE, STATE.nick); println('^8Лог игры скачан (.txt). Приложи его к багрепорту.', 0x8); }
      catch (e) { println(`^CНе вышло скачать лог: ${e.message || e}`, 0xC); }
      break;
    case 'cp': {
      const cp = readCheckpoint();
      if (!cp) { println('^7Точки отката от Рушеля Блаво нет. Найди мага (w) и заплати за неё.', 0x7); break; }
      Object.assign(STATE, cp);
      resetTransientState();
      persistState(STATE);
      println(`^8Откат к точке Рушеля Блаво. ${STATE.nick}, HP ${STATE.hp}/${STATE.max_hp}, ${STATE.money}р.`, 0x8);
      break;
    }
    case 'reset':
      resetState(STATE);
      log = [];
      resetTransientState();
      STATE.first_game = false;
      persistState(STATE);
      println(`^CПолный сброс. ${STATE.nick} (${curClass().name}) снова в Ельцовке.`, 0xC);
      println('^E* Ельцовка *', 0xE);
      println(`^6Ещё не разведано мест: ${LOCATION_KEYS.length}. Шатайся (^6w^6), чтобы найти.`, 0x6);
      println('^7Введи команду. `help` — полный список.', 0x7);
      break;
    case 'e':
    case 'exit':
      persistState(STATE);
      println('^8Выход в меню. Прогресс сохранён.', 0x8);
      return 'title';

    default:
      println(`^CНеизвестная команда: "${cmd}"  (введи help)`, 0xC);
  }

  persistState(STATE);
  return null;
}

// ── State object ──────────────────────────────────────────────────────────────
export const play = {
  enter() {
    log = [];
    resetTransientState({ clearArrival: false });
    const dist = curDistrict();
    if (STATE.first_game) {
      STATE.first_game = false;
      persistState(STATE);
      println('^1Ты стоишь у дверей университета.', 0xB);           // verbatim [778]
      println('^1Отсюда ты начнешь свой нелёгкий путь гопника.', 0xB); // verbatim [778]
      for (const line of dist.arrival) println(`^1${line}`, 0xB);
      println(`^E* ${dist.name} *`, 0xE);
    } else if (arrivalPending) {
      arrivalPending = false;
      for (const line of dist.arrival) println(`^1${line}`, 0xB);
      println(`^E* новый район: ${dist.name} *`, 0xE);
      println('^7Все местные точки придётся искать заново — шатайся (^6w^7).', 0x7);
    } else {
      println(`^E* ${dist.name} — добро пожаловать *`, 0xE);
    }
    const left = LOCATION_KEYS.filter(k => !isFound(k));
    if (left.length) println(`^6Ещё не разведано мест: ${left.length}. Шатайся (^6w^7), чтобы найти.`, 0x6);
    println('^7Введи команду. `help` — полный список.', 0x7);
  },

  update(inputQ) {
    while (inputQ.hasKey()) {
      const k = inputQ.pollKey();

      if (k.key === 'PageUp')   { scrollLogBy(-10); continue; }
      if (k.key === 'PageDown') { scrollLogBy(10); continue; }
      if (k.key === 'Home')     { scrollLogToTop(); continue; }
      if (k.key === 'End')      { scrollLogToBottom(); continue; }

      if (logReview) scrollLogToBottom();

      if (k.key === 'Escape') {
        if (mode !== 'cmd') {
          if (mode === 'den') denThefts = 0;
          mode = 'cmd';
          println('^7Отмена.', 0x7);
          continue;
        }
        persistState(STATE); return 'title';
      }

      if (k.key === 'Enter') {
        if (mode === 'name') {
          const trimmed = input.trim();
          if (trimmed) { STATE.nick = trimmed.slice(0, 16); persistState(STATE); println(`^AТеперь тебя зовут "${STATE.nick}".`, 0xA); }
          else           println('^8Пустое погоняло — оставлено как было.', 0x8);
          mode = 'cmd'; input = '';

        } else if (mode.startsWith('shop')) {
          const idx = parseInt(input.trim(), 10);
          if (!isNaN(idx)) {
            if      (mode === 'shop_market') handleMarketPurchase(idx);
            else if (mode === 'shop_dealer') handleDealerPurchase(idx);
            else if (mode === 'shop_sell')   handleSell(idx);
            else                             handleGymTrain(idx);
            persistState(STATE);
          } else {
            println('^CВведи номер. Команды доступны после выхода: 0 или Esc.', 0xC);
          }
          input = '';

        } else if (mode === 'den') {
          handleDen(input); input = '';

        } else if (mode === 'kl') {
          handleKl(input); input = '';

        } else if (mode === 'magic') {
          handleMagic(input); input = '';

        } else if (mode === 'vet') {
          handleVet(input); input = '';

        } else {
          const result = runCommand(input); input = '';
          if (result) return result;
        }

        // A command (e.g. `k` finishing off the boss) may have armed an
        // end-game transition. Hand off immediately.
        if (pendingState) { const s = pendingState; pendingState = null; return s; }

      } else if (k.key === 'Backspace') {
        input = input.slice(0, -1);

      } else if (k.ascii && k.ascii.length === 1) {
        const isName  = mode === 'name';
        const isShop  = mode.startsWith('shop');
        const allowCh = isName
          ? (k.ascii !== '\n' && input.length < 16)
          : isShop
            ? /[0-9]/.test(k.ascii)
            : (/[a-zA-Z0-9_ ]/.test(k.ascii) && input.length < 60);
        if (allowCh) input += k.ascii;
      }
    }
    return null;
  },

  draw(buf) {
    clearBuffer(buf, 7, 0);

    // Header
    for (let x = 0; x < COLS; x++) writeAt(buf, x, 0, ' ', 0xF, 1);
    writeAt(buf, 2, 0, ` ГОПНИК — ${curDistrict().name} `, 0xF, 1);
    const stat = `HP:${STATE.hp}/${STATE.max_hp} Сил:${STATE.str} Лов:${STATE.dex} ${STATE.money}р Реп:${STATE.rep}`;
    writeAt(buf, COLS - 1 - stat.length, 0, stat, 0xE, 1);

    // Active encounter row
    if (ENCOUNTER) {
      const ei = `[ ${ENCOUNTER.isBoss?'БОСС ':''}${ENCOUNTER.name}  HP ${ENCOUNTER.hp}/${ENCOUNTER.max_hp} ]`;
      writeAt(buf, 2, 1, ei.slice(0, COLS - 4), 0xC, 0);
    }

    // Log
    const visibleLog = log.slice(logTop, logTop + LOG_VIEW_ROWS);
    for (let i = 0; i < visibleLog.length; i++) {
      const { text, color } = visibleLog[i];
      // Lines are already wrapped to WRAP_WIDTH visible cols in println(); a
      // raw string-length slice here would mis-cut lines that contain ^N escapes.
      writeAt(buf, 2, 2 + i, text, color, 0);
    }

    // Prompt
    const py = ROWS - 3;
    let promptLabel = '\\>';
    if (mode === 'name')       promptLabel = 'имя>';
    else if (mode === 'den')   promptLabel = 'притон>';
    else if (mode === 'kl')    promptLabel = 'клуб>';
    else if (mode === 'magic') promptLabel = 'маг>';
    else if (mode === 'vet')   promptLabel = 'док>';
    else if (mode.startsWith('shop')) promptLabel = '#>';
    writeAt(buf, 2, py, promptLabel, 0xF, 0);
    const inputX = 2 + promptLabel.length + 1;
    writeAt(buf, inputX, py, input, 0xF, 0);
    if ((Date.now() / 250 | 0) & 1) writeAt(buf, inputX + input.length, py, '_', 0xF, 0);

    // Footer hint
    let hint = 'команда + Enter          Esc: меню (автосохр)';
    if (mode === 'name')       hint = 'новое погоняло (до 16 символов) + Enter  |  Esc: отмена';
    else if (mode === 'den')   hint = 'p / r / hp / a / d / s + Enter  |  0: свалить  |  Esc: выйти';
    else if (mode === 'kl')    hint = 't: дискотека  m: мухлёж  k <ставка>: карты  |  0: свалить  |  Esc: выйти';
    else if (mode === 'magic') hint = 'y/s: поставить точку отката  |  0/n: отказ  |  Esc: уйти';
    else if (mode === 'vet')   hint = 'h: залатать раны  |  r: вправить переломы  |  w/0: уйти  |  Esc: уйти';
    else if (mode.startsWith('shop')) hint = 'номер + Enter  |  0: выйти к командам  |  Esc: отмена';
    if (logReview) {
      const from = log.length ? logTop + 1 : 0;
      const to = Math.min(log.length, logTop + LOG_VIEW_ROWS);
      hint = `scroll ${from}-${to}/${log.length}  PgUp/PgDn/Home/End  |  ввод: к низу`;
    } else if (log.length > LOG_VIEW_ROWS) {
      const tail = '  |  PgUp: история';
      hint = (hint.length + tail.length <= COLS - 4) ? `${hint}${tail}` : hint;
    }
    writeAt(buf, 2, ROWS - 1, hint, 0x8, 0);
  },
};
