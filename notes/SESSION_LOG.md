# Session 37 — Понтовость balance: diminishing beer + raised gates (`?v=54`)

Player feedback: понт grew too fast (2-3 beers maxed it; one beer unlocked
everything gated). Both port values, no RE grounding, so free to tune. All in
`src/states/play.js`.

- **Diminishing beer (`p` in притон).** Was a flat +5/+7. Now
  `gain = max(1, ceil((PONT_MAX - pont)/4))` (+1 for Гопник's Притон bonus), so
  each round buys less the higher your понт. Maxing: **35р / 7 rounds** for a
  normal char (was 15р / 3), **20р / 4** for Гопник. Reports the clamped
  realGain; «полном понте — некуда расти» at the cap.
- **Raised gate thresholds** (named constants by `PONT_MAX`): club `kl` 2→
  `PONT_GATE_CLUB=4`, backup `v` 3→`PONT_GATE_BACKUP=6`, borrow `r` 2→
  `PONT_GATE_BORROW=3`. The притон `s` "впрягёмся" line now tracks
  `PONT_GATE_BACKUP`. Key effect: the first beer (0→3) no longer unlocks club
  *and* backup — backup now needs **2 beers** (понт 6), club 2 (1 for Гопник).
  EXE confirms a club/backup понт gate existed but not the values.

Verified: module loads clean; simulated the exact beer arithmetic + gate checks
— normal char unlocks club/backup after 2 beers, borrow after 1; Гопник club
after 1, backup after 2.

Cache-bust bumped `?v=53` → `?v=54` across all modules + index.html.

---

# Session 36 — «баг» button: download game log for bug reports (`?v=53`)

Added a debug-log download so players can attach the in-game log to bug
reports.

- **`src/save_transfer.js`** — new `downloadLog(logLines, state, nick)` that
  builds a plain-text file: a header (ISO timestamp + `navigator.userAgent`),
  a pretty-printed `STATE` JSON dump, then the REPL log lines with `^N` color
  escapes stripped (`isColorEsc`/`stripEscapes`, mirroring render.js/play.js).
  Refactored the Blob+anchor download into a shared `downloadText()` helper
  (now reused by `downloadSave`) + a `safeNick()` filename slug. File name:
  `gopnik-log-<nick>-<YYYYMMDDhhmmss>.txt`, MIME `text/plain`.
- **`src/states/play.js`** — new `bug` REPL command (in the HELP table and the
  command switch) → `downloadLog(log, STATE, STATE.nick)`.
- **`index.html`** — added a `🐞 баг` button to `#savebar` (`data-cmd="bug"`).
  The existing main.js savebar handler types the `data-cmd` into the input
  queue (play-state only), so it dispatches the same `bug` command.

Verified in preview: drove boot→title→intro→difficulty→play, ran `bug` via the
REPL, captured the Blob — correct filename/MIME, header+STATE+stripped log
content; success line «Лог игры скачан (.txt)» prints.

Cache-bust bumped `?v=52` → `?v=53` across all modules + index.html.

---

# Session 35 — UX fixes: log word-wrap, понтовость copy, Косяк label (`?v=52`)

Three player-reported polish issues (all in `src/states/play.js`):

1. **Long log lines overflowed / were truncated.** The REPL log only did a
   draw-time `text.slice(0, COLS-4)` — a raw *string-length* slice that
   mis-cut any line containing `^N` color escapes, and combat crit lines
   (e.g. «Двойной урон!!! Точно в висок! Ты пнул бывалый гопник на 6з. У
   него осталось N») ran past the bezel. Added `wrapColored(text, width)` +
   `isColorEsc()` helpers; `println()` now word-wraps to `WRAP_WIDTH = COLS-4`
   *visible* columns (escapes count as zero width), breaking on spaces and
   carrying the active color onto each continuation line (each wrapped line
   is its own `writeAt()` call, which would otherwise reset fg to the
   `println` color arg). Removed the now-redundant draw-time slice.
   Verified: 300+ combat rounds, max rendered width ≤79; unit-tested the
   wrap fn — continuation lines start with the carried `^2`, all ≤76 vis.
2. **«Да если чё мы за тебя впрягаемся» at понт 0 was contradictory** —
   backup (`v`) is gated at `pont >= 3`, so the притон `s` line now branches:
   ≥3 → «…впрягёмся», <3 → «Да кто за такого мутного впрягаться будет?
   Поднимай понт.»
3. **Косяк shop label was cryptic English «High +3»** → «кайф +3 (расслабон)»
   (and Офигенный косяк → «кайф +3, очко прокачки …»). `high` is a cosmetic
   buzz state in the port (no combat effect), so the label is honest flavor.

Cache-bust bumped `?v=51` → `?v=52` across all modules + index.html.

---

# Session 34 — RE-grounded gameplay fixes: bones, mage, maniac, vet, reset, flee, boss-gate (`?v=51`)

Player-reported issues from a live playthrough, each **grounded against the
original binary via static RE** (disasm + Ghidra decomp + extracted strings)
before fixing — no DOSBox playthrough needed (computer-use was offline).

## Grounding results (original vs. port)

- **Broken bones were real mechanics, not flavor.** The original (`FUN_1000_29c4`,
  `FUN_1000_1348`, strings @ `0x29c4`/`0x3754`/`0x6653`) has a full system: a crit
  is «Двойной урон!!!» (double damage) **and** breaks челюсть or ногу. Broken jaw
  blocks beer/pills/eating; broken leg blocks fleeing; `sv` shows the enemy's
  breaks; cures are больница / храм / фенька (5% self-heal) / зубная защита (−75%).
  The port had flattened all this to one cosmetic print line.
- **Рушель Блаво is a paid save-point, not a blessing vendor.** `FUN_1000_7538`
  `getch`-confirms and charges **district×50₽** (`[0x3692]*0x32`) to write a save.
  The понт/stat blessing is the *храм* (`FUN_1000_7c67`) + helper `FUN_1000_2526`.
  The port had conflated the two and made the mage a cheap, too-frequent blessing.
- **Maniac is a district-scaled archetype** (`FUN_1000_0d14`: index = triangular
  `rand(51)` + district `[0x3692]`), so it's rare early by construction. The port
  rolled a flat ~6% from turn 1.
- **больница is a sub-menu** (strings @ `0xB245`): `h` = за N₽ залатают (HP/царапины),
  `r` = за 7₽ починят переломы, `w` = leave. Price shown up front, letter = commit;
  no separate y/n. The port collapsed it into one instant no-price full-heal.
- **`reset`** is a port-only command; forcing klass→pacan was just a bug.

## Fixes (all in `src/states/play.js`)

- **#5 Bones restored.** New `broken_jaw`/`broken_leg` on STATE + every enemy.
  `breakEnemyBone`/`breakPlayerBone` helpers; crits now double damage + break a
  bone (jaw-guard −75%, ring 5% self-heal on wander). Jaw blocks `h`/`mh`/`kos`;
  leg drops you out of the flurry (the EXE's flee-block has no port equivalent —
  the port has no flee command). Shown on `sv` (enemy) and `s` (player).
- **#3 Mage = save-point only.** Stripped the blessing; cost now `(district+1)*50`;
  `y`/`s` both set the откат point («Сохранено!»). Blessing stays with the храм.
- **#4 Maniac gated.** Odds `[40,20,12]` by district and suppressed at district 0
  until `district_kills >= 3` (no maniac at a fresh lvl-1 char).
- **#2 Vet sub-menu.** `rep` opens an `h`/`r`/`w` menu with prices; `r` clears
  fractures («Твои переломы залечены»).
- **#6 Reset** preserves chosen class + nick, re-applies the class stat preset.
- **`run`/flee command added (1:1).** Grounded on the verbatim string cluster @
  file `0x4c98–0x4d10`. `run` escapes combat but it's западло: the enemy spits
  «Враг: Трусливый засранец!», **one random stat drops −1** (the EXE stores «Сила
  -1 / Ловкость -1 / Живучесть -1 / Удача -1» as a pick-one table mirroring the
  blessing's pick-one +1), and понтовость crashes to 0 («Такого конявого непустят
  в местный притон!»). Blocked vs the final Ректор (verbatim «Кудa? Стоять! Бейся
  до конца трусливый урод!»), vs district bosses (generic), and on a broken leg
  (verbatim «Ты не можешь убежать на сломаной ноге»).
- **District-boss gate de-forced.** The old port code forced the boss at
  `district_kills >= 7` (100% every wander = wander-lock). The EXE
  (`FUN_1000_3d11`) makes the boss a *recurring chance* past a kill threshold
  (`[0x3696]` flips once `kills_this_district > 2`, then gated by понтовость
  `[0x38cb] >= district*10+10`) — never a hard force. Replaced with a **ramping
  probability**: `min(90, 40 + 15*(kills-5))` → 40/55/70/85/90% at 5–9 kills,
  capped 90%, always escapable per-wander.

## Verification (preview-eval drive, crafted saves)

Jaw blocks beer/pills ✓ · `s` shows Переломы ✓ · vet `h`/`r`/`w` menu + fracture
heal ✓ · beer works after heal ✓ · mage shows save-point-only @ 50₽, «Сохранено!» ✓
· maniac **skipped** at d0/0-kills, **fires** at d0/3-kills ✓ · reset keeps Вор ✓ ·
crit «Двойной урон!!! Ты сломал врагу челюсть!» + `sv` shows enemy break ✓.
Flee: normal `run` drops one random stat (Ловкость 5→4) + понт 5→0 + taunt + escape ✓
· broken-leg block (no flee, понт intact) ✓ · district-boss block ✓ · final Ректор
verbatim block ✓. Boss-gate: at 9 kills, RNG 0.95 → no boss / RNG 0.85 → boss
(proves 90% cap, not a lock); Monte-Carlo ramp 41/55/70/85/90% @ 5–9, 91% @ 20 ✓.
Restored the player's real save afterward (test data had overwritten it).

---

# Session 33 — GitHub publication prep

Prepared the directory for initial GitHub publication:

- Added root `.gitignore` for local Python venvs, cache files, editor junk,
  `.env` files, Claude local settings, temporary backups, and Ghidra lock files.
- Added `README.md` with project summary, current status, local run command,
  development checks, repository map, and publication/licensing note.
- Added `.Codex/launch.json` to match the documented Codex Preview layout
  while keeping the existing `.claude/launch.json`.
- Initialized the directory as a Git repository so the publish set can be
  inspected before the first commit.
- Ran a basic secret-pattern scan; matches were benign prose/code tokens only.
- Verified all JS files with `node --check`.
- Started the local static server and confirmed `index.html`, `src/main.js?v=46`,
  and `assets/screens_raw.json` are served with HTTP 200.
- Confirmed key reverse-engineering assets are present:
  `GOPNIK.EXE`, CP866 font, extracted screens/strings, disassembly, Ghidra
  notes, and source modules.
- Ran `git add --dry-run .`; ignored local files stayed out and the expected
  source/docs/assets/tooling files are in the first-commit set.

## What's next

1. Decide whether `GOPNIK.EXE` should be redistributed publicly or supplied by
   users locally.
2. Review `git status`, then create the first commit.
3. Optionally add a project license once redistribution terms are settled.

---

# Session 32 — end-to-end browser run + save-overwrite bug fix (`?v=46`)

## End-to-end walkthrough (preview eval drive)

Drove the full game flow via `mcp__Claude_Preview__preview_eval`:

| Step | Result |
|---|---|
| Title screen | ГОПНИК logo, "Нажми какую-нибудь кнопку", no console errors ✓ |
| Intro p1 | Verbatim backstory ("Последний день ты пришел в универ...") ✓ |
| Intro p2 | Dean confrontation, "опушенного" misspelling preserved ✓ |
| Intro p3 | Stat formulas, "довавляет" misspelling preserved ✓ |
| Intro p4 | Location guide, [4/4] ✓ |
| Difficulty | All 4 classes, first-game university lines in preview area ✓ |
| Name entry | Default "Раздолбай", cursor blink ✓ |
| Play REPL | HP:28/28 Сил:3 Лов:3 20р Реп:0 — Пацан stats correct ✓ |
| `s` status | All fields correct, Зачищено:0, 7 undiscovered locations ✓ |
| `w` quiet | Ельцовка street flavor ("Шатаешься у пятиэтажек...") ✓ |
| `w` combat | Enemy spawned, `k` fight loop: hit/miss/crit/"сломал челюсть"/loot ✓ |
| `w` → Блаво | Рушель Блаво encounter, `y` blessing: Ловкость +1, −15р, verbatim lines ✓ |
| `mar` locked | "Ты незнаешь, пока ещё, где находится Базар" ✓ |
| `pr` | Притон sub-REPL (p/r/hp/a/d/s), `a` intel discovered `bmar` ✓ |
| `bmar` | 6-item Ельцовка stock, base prices, locked-items hint ✓ |
| `trn` | 4 stats, per-district caps shown, Сила +1 training worked ✓ |
| `save` | "Сохранено." ✓ |
| Esc → title | Returns to title correctly ✓ |

## Bug found and fixed: `armNewGame` save overwrite

**Symptom:** After Esc from play → going through difficulty again → re-entering play,
the player's trained stats (Сил:4, Лов:4, HP:29) were reset to class defaults (Сил:3,
Лов:3, HP:28) BUT the old save's money/rep/found-locations were preserved — a
corrupted hybrid state. `load` confirmed the save itself had been overwritten.

**Root cause:** `armNewGame(klassId, nick)` only called `applyClassStats()` (which resets
str/dex/vit/luck+HP) but left money, rep, exp, found, etc. intact in STATE, then called
`persistState(STATE)` — writing the hybrid state to localStorage.

**Fix (`play.js` line 213, `?v=46`):** Full state reset before applying class+nick:

```javascript
export function armNewGame(klassId, nick) {
  Object.assign(STATE, { ...DEFAULT_STATE });   // full wipe
  STATE.junk  = [];
  STATE.found = {};
  const cls = CLASS_LIST[klassId] || CLASS_LIST[0];
  STATE.klass = cls.key;
  applyClassStats(STATE, STATE.klass);
  const n = (nick || '').trim();
  STATE.nick = (n ? n : 'Раздолбай').slice(0, 16);
  persistState(STATE);
}
```

**Verified:** Injected str:6/dex:5/money:500/rep:8 into localStorage, went through
difficulty selecting Гопник, confirmed save wrote clean Гопник stats (str:4 dex:3
money:20 rep:0) and university-door first-game lines appeared. ✓

## What's next

1. Hand-play a longer session through Ельцовка boss fight.
2. Test `rep` / `girl` / `kl` location commands once discovered.

---

# Session 31 — testing rare outcomes + first-game-start lines (`?v=42`)

## Part 1 — Verified rare outcomes (preview eval, Math.random patched to 0)

**паяльник joke** (`rep` with HP < half):
```
rep (HP 5/28)  → "Ого! Да тебя не иначе как грузовик откатал!"
               → "Дoк: Щас гайки подтянем и будешь как новый!"
               → "— Эй, Дoк, а зачем тебе паяльник?"
               → "Дoк: Молчи, животное!"
               → "Здоровья 28/28    −5р" ✓
```

**мухлёж card cheat** (`kl` → `k 20` with roll(100)=0 < 3):
```
kl k 20        → "Ты поставил 20 рублей."
               → "Ты выиграл 40 рублей."
               → "Козёл! Да ты мухлевал!"
               → "Ты получаешь 2 качков опыта за победу в игре."
               → "Уноси ноги, пока не отобрали деньги другие кандидаты."
               → exits kl mode → back to cmd ✓
```

## Part 2 — First-game-start lines (`play.js`)

Added `first_game: true` flag to `DEFAULT_STATE` (cleared and persisted on first `enter()`).

On first game start, `enter()` now shows verbatim lines from EXE frag [778] before
the normal Ельцовка arrival:

```
Ты стоишь у дверей университета.        [778]
Отсюда ты начнешь свой нелёгкий путь гопника.  [778]
Ты приехал в Ельцовку...                [Ельцовка arrival]
Ото всюду доносятся крики запинываемых.
* Ельцовка *
```

On subsequent entries (title → play with an existing save), only
`* Ельцовка — добро пожаловать *` shows — university lines don't repeat. ✓

`resetState` (via `reset` command) spreads DEFAULT_STATE, so `first_game` resets to
`true` there too — a full reset re-shows the intro lines correctly.

## Verified

```
fresh start     → university lines + arrival ✓
return to play  → "добро пожаловать" only ✓
no console errors; node --check clean; 20/20 stamps at ?v=42.
```

## What's next

1. Hand-play a full browser run end-to-end.

---

# Session 30 — richer per-location encounters: rep / girl / kl (`?v=41`)

Three location commands that were previously flat stubs are now populated from
verbatim `assets/screens_raw.json` fragments.

## `rep` — ветеринар (vet)

- Arrival line verbatim [1042]: "Ты пришел на ремот, к ветеринару."
- At full HP: "Дoк: вали отсюда — ты здоров." [1047] — no charge.
- Below half HP: "Ого! Да тебя не иначе как грузовик откатал!" [1049] before heal.
- Random doc quip from pool [1051, 1042]: "Щас гайки подтянем…" /
  "Пара швов…" / "Не волнуйся — всё зарастёт как на собаке."
- Rare (25%) паяльник joke [1051/1052]: "— Эй, Дoк, а зачем тебе паяльник?" /
  "Дoк: Молчи, животное!"
- Heal line verbatim [1053]: "Здоровья N/N  −5р"

## `girl` — подруга

- Phone intro flavor [943] (~50% chance when has_phone):
  "Твоя пассия: «Привет, это я. Зайдёшь ко мне сегодня?»"
- Visit now costs `scaledPrice(12)` руб (verbatim 12р from [1055], scaled per район).
- If broke: "Ну не пойдёшь же как придурок без ничего." [1055] — no entry.
- Club discovery [1055]: if `kl` not yet found, "Она вытащила тебя в клуб и
  теперь ты знаешь где он находиться." → marks `found.kl = true`.
- Cost line verbatim [1055]: "Ты купил ей чё-то, потратив N рублей."
- Heal line verbatim [1055]: "Ты расслабился, отдохнул и снова можешь творить
  свои гоповские дела." (non-Пацан); Пацан still gets full heal + own line.

## `kl` — клуб sub-REPL (new)

The old single-line `kl` (just a rep roll) is now a full sub-menu (mode=`'kl'`,
prompt `клуб>`) mirroring the EXE's 3-option club [1079-1089]:

- `t` — потусоваться на дискотеке: `scaledPrice(15)р` → Ловкость +1, capped
  at `curDistrict().trainCap.dex`. Verbatim line [1088]: "Ты прокачиваешь ловкость."
- `m` — разузнать приемы мухлёжников: `scaledPrice(22)р` → Удача +1, capped
  at `trainCap.luck`. Verbatim line [1089]: "Ты прокачиваешь удачу."
- `k [stake]` — карты [1083-1087]: stake ≥ 5р; win chance 50%+luck×2%;
  rare (~3%) "Козёл! Да ты мухлевал!" → ×2 win + XP + kicked out [1086].
  All lines verbatim from EXE.
- `0` / Esc — свалить из клуба.
- The entry rep-gain roll (Пацан bonus: 1-in-2 vs 1-in-3) fires on arrival
  before entering the sub-mode, same as before.
- Footer hint: "t: дискотека  m: мухлёж  k <ставка>: карты  |  0: свалить"

## Verified (preview eval, no console errors)

```
rep (full HP)      → "Дoк: вали отсюда — ты здоров." (no charge) ✓
rep (HP 5/28)      → "Ого! Да тебя не иначе как грузовик откатал!" + quip +
                     "Здоровья 28/28  −5р" ✓
girl (kl unknown,  → phone flavor + "Она вытащила тебя в клуб..." + cost 14р
  has_phone, 200р)   (ОбьГЭС ×1.15) + full heal (Пацан) ✓
girl (broke 5р)    → "Ну не пойдёшь же как придурок без ничего." ✓
kl entry           → sub-menu with scaled prices 17р/25р (ОбьГЭС) ✓
kl t               → "Ты прокачиваешь ловкость." Лов 3→4, −17р ✓
kl m               → "Ты прокачиваешь удачу." Уд 3→4, −25р ✓
kl k 20            → "Ты поставил 20 рублей." → "Ты выиграл 20 рублей." ✓
kl 0               → back to play mode ✓
No console errors; node --check clean; 20/20 stamps at ?v=41.
```

## What's next

1. (Optional) Test the rare паяльник joke and card "мухлёж" outcome manually.
2. (Optional) Verbatim "Ты стоишь у дверей университета / нелёгкий путь гопника"
   lines shown on first game start (currently only on district advance).
3. (Optional) Hand-play a full browser run end-to-end.

---

# Session 29 — verbatim Dean intro banter + per-район market food (`?v=40`)

Two "What's next" items from Session 28 tackled:

## Part 1 — verbatim Dean intro banter (`intro.js`)

Cross-referenced the EXE at `0x7D50` (the full intro sequence before char-class
selection) against what was in the port. Found and fixed several divergences:

- **Page 1 title**: "Год 200x" → "Год 2xxx от р.х." (verbatim EXE header string).
- **Page 1 lines replaced**: the old invented "Ты приехал в Ельцовку / Отовсюду
  доносятся крики" block (which actually belongs to the *gameplay* start, not the
  intro) was replaced with the verbatim EXE backstory that precedes the Dean encounter:
  "Последний день ты пришел в универ. / Ты по-страшному косил и забивал. /
  Ты ещё мог сдать все задания, которые ты взял у друзей. / Но тут..."
- **Dean's first line fixed** (verbatim from EXE): "Ректор: Что ты тут делаешь,
  отчисленый. Иди отсюда мудак!" → "Ректор: Ах ты урод, чёртов забивала. Вали
  из универа!"
- **"Да отчислен" → "Ты отчислен"** (verbatim).
- **"опущенного" → "опушенного"** — original EXE misspelling preserved.
- **Two missing lines added** (verbatim EXE @ 0x7D50):
  "Ты неможешь стерпеть такой наезд, однако ректор офигительно крутой." and
  "Ты решил доказать свою крутизну всему миру (в твоем понимании - Городу)."
- Pages 3 & 4 (stat rules / location guide) unchanged — already verbatim from Session 28.
- Still 4 pages total.

## Part 2 — per-район market food variety (`play.js`)

Added three new food items to `MARKET_ITEMS`, each locked behind a `minDist`:

- **Шаурма** (15р base, HP+8, `minDist: 1`) — ОбьГЭС+ industrial/gritty feel.
- **Беляш горячий** (12р base, HP+6, `minDist: 2`) — Шлюз dockside food counter.
- **Водка** (18р base, HP+2 + хмель+4, `minDist: 2`) — тяжёлый район, тяжёлый напиток.

Per-район pricing (`DISTRICT_PRICE_MUL`) applies as usual. The "районов покруче"
hint now correctly fires when only Ельцовка items are available.

## Verified (preview eval)

```
d=0 (Ельцовка): Хотдог/Пиво/Косяк only + hint.
d=1 (ОбьГЭС):   + Офигенный косяк + Шаурма (scaled) + hint.
d=2 (Шлюз):     all 7 items (Беляш/Водка appear), no hint.
intro page 1: "Год 2xxx от р.х." — 4 backstory lines.
intro page 2: verbatim Dean confrontation incl. both missing lines.
No console errors.
```
`node --check` clean on all 13 modules; 20/20 stamps at `?v=40`.

## What's next

1. (Optional) Hand-play a full browser run end-to-end.
2. (Optional) Verbatim "Ты стоишь у дверей университета / нелёгкий путь гопника"
   lines shown on first game start (currently only on district advance).

---

# Session 28 — verbatim char-creation rules in intro + per-район shop variety (`?v=39`)

Knocked out the two remaining "What's next" chunks from Session 27: (2) wired the
verbatim `FUN_1000_5f55` rules/tutorial text + the `FUN_1000_2526` "Понтовость
увеличивается" stat-up lines into the port, and (3) made the shops differ by район.

## Part 2 — verbatim rules + blessing lines (`intro.js`, `play.js`)

- **Char-creation rules wired into the intro.** Replaced the old made-up "А теперь
  правила:" page with **two verbatim pages** transcribed from `FUN_1000_5f55`
  (screen frags @ 0x712d / 0x717a / 0x7241 / 0x72f9 / 0x735a / 0x76df): a stat
  tutorial ("Вначале ты должен выбрать свой характер", навыки×12, Сила/Ловкость/
  Живучесть/Удача, the Здоровье/Урон/Точность formulas) + a per-location пояснение
  page (Базар/Больница/Подруга/Притон/Клуб/Качалка/Барыги). Original misspellings
  kept ("довавляет"). Wrapped to 80 cols; intro is now 4 pages.
- **Verbatim `FUN_1000_2526` stat-up lines.** `castBlessing()` (храм + маг) now
  prints the verbatim "^1Понтовость увеличивается: +N" (@ 0x3d60) and "^1Сила +1 /
  Ловкость +1 / Живучесть +1 / Удача +1" lines instead of the old parenthetical
  "(Сила +1.)". Added a `STAT_UP` label map next to `STAT_NOUN`.

## Part 3 — per-район shop stock & pricing (`play.js`)

- **Per-район stock.** Added `minDist` to every `DEALER_ITEMS` entry (+ the premium
  «Офигенный косяк» on the рынок). `inStock()` filters a catalogue by район, so
  Ельцовка baryga sells only the basics (кастет/дубинка/бутсы/зубная защита/
  реальная кожанка/очки), ножик+мобильник+ствол+патроны+глушитель+крутая кожанка+
  понтовёйшие бутсы unlock at ОбьГЭС, and тесак+наколка only at Шлюз. A `^8`-grey
  hint ("…для районов покруче") shows while anything's still locked.
- **Per-район pricing.** New `DISTRICT_PRICE_MUL = [1, 1.15, 1.3]` → `scaledPrice()`
  (рынок + качалка) and `dealerPrice()` (= scaled, then the Вор −25% on top).
  Replaced the old `buyPrice`. Shop handlers now index into the **filtered** stock
  and charge the scaled cost; the "(по знакомству)" tag keys off the Вор class.
  Shop titles show the район name.
- No new STATE fields / no save migration — stock & pricing are derived from
  `STATE.district`. Bumped `?v=38 → ?v=39` across all 20 stamps + `index.html`.

## Verified (preview eval, single-eval drives; no console errors)

```
intro: all 4 pages dumped — verbatim rules render, no truncation, [4/4]→difficulty.
bmar @ Ельцовка (d0): 6-item basic stock at base prices + "…районов покруче" hint.
bmar @ Шлюз   (d2): full 15-item arsenal at +30% (Кастет 15→20, Тесак 70→91), no hint.
buy #4 @ d2: Тесак bought for scaled 91р (9999→9908), weapon=Тесак dmg9 — index→filtered ok.
w→храм (scripted RNG): blessing prints "Понтовость увеличивается: +2" + "Живучесть +1".
```
`node --check` clean on all 13 modules; 20/20 stamps at `?v=39`. Dev save cleared.

## What's next

1. (Optional) Hand-play a full browser run to sanity-check the район feel end-to-end.
2. (Optional) Per-район market food variety / district-specific flavour items.
3. (Optional) Wire the remaining `FUN_1000_5f55` Dean-intro banter verbatim if any
   fragments are still un-ported.

---

# Session 27 — exact enemy weight table + seg-1000 function map + richer encounters (`?v=38`)

Tackled both open "What's next" chunks: (1) labelled the remaining seg-1000 game-logic
functions and transcribed the exact enemy weight table, then (2) used that to make the
port's spawns byte-faithful and add richer per-район encounters.

## Part 1 — RE: weight table transcribed + functions labelled (docs)

- **Enemy archetype weight table — TRANSCRIBED.** The table read in `FUN_1000_0d14`
  as `[0x3952*4 + 2..5]` lives at **DGROUP file 0x123b2** (base `0x123b0` + 2 bytes
  padding): **10 rows × 4 bytes**. The spawn math (`HP = w2×5 + w0 + 10`, dmg
  `[w0/2..w0]`) plus the fact that **rows 3–6 are byte-identical to the player class
  presets** prove the column order is `[str, dex, vit, luck]`. Full table + the
  triangular район-biased type roll documented in `notes/findings.md`.
- **seg-1000 function map labelled.** Ghidra's decomp is string-sparse, so I
  fingerprinted each function by **disassembling it (Capstone) and decoding the CP866
  string immediates it loads**. Mapped all 15 seg-1000 functions: `FUN_1000_3d11` =
  wander+combat+special encounters (incl. маньяк), `1a03` = status screen, `5f55` =
  char-creation/rules, `7c67` = Храм божий, `7538` = Рушель Блаво save, `29c4` = drink
  handler, `1348` = enemy inspect, `2526` = blessing/stat-up helper, `074b`/`0aec` =
  win/lose & "ТЫ СУПЕР ГОПНИК" screens, `02c2` = title, etc. Table in `findings.md`
  → "Function map"; CLAUDE.md key-functions list updated.

## Part 2 — gameplay: faithful spawns + richer per-район encounters (`play.js`)

- **`ENEMY_ARCHETYPES` now uses the verbatim 10-row EXE table** (was 7 hand-tuned
  rows) with street-appropriate names, and **`rollArchetypeIndex` ports the EXE's
  triangular район-biased type roll** (FUN_1000_0d14). Net: Ельцовка spawns mostly
  weak mooks, Шлюз leans on tougher rows, авторитет/беспредельщик stay rare. Kept the
  Session-26 balance tuning (squishier mook HP `vit×2+str+5`, linear armor).
- **Маньяк — new rare (~6%) street encounter** (verbatim dialog @ EXE 0x2c5e): idle
  chatter → "Я МАНЬЯК!!!" → a dangerous беспредельщик-shaped foe that drops the
  тесак (урон+9, "ужасное оружие" @ 0x3c84). Not reduced by зоновская наколка (the
  EXE "кроме … маньяков" exception).
- **Per-район street colour** (`DISTRICT_STREET`): each район's `w` opener and quiet-
  moment vignettes are drawn from its own pool — Ельцовка спальник / ОбьГЭС окраина-
  гаражи / Шлюз доки-НГУ. (Was one generic Ельцовка-flavoured set.)
- No new STATE fields / no save migration — archetypes & maniac are session-only
  spawn data. Bumped `?v=37 → ?v=38` across all 20 stamps + `index.html`.

## Verified (preview eval, single-eval drives; no console errors)

```
load: no console errors; __gopnik reachable.
w (Math.random=0)   → маньяк: full verbatim arc renders, status bar "[ маньяк HP 31/31 ]".
w (Math.random=0.5) → "Ты встретил: крепкий пацан (уровень 1)"  (= row 3 [3,3,3,3],
                       matches hand-traced triangular fold) + Ельцовка opener.
full drive→spawn→kill (1 eval): крепкий пацан → crit "сломал челюсть" → "сдох" →
                       +5 опыта, rep+1, district_kills 1, loot "Ты нашел кастет (урон+2)".
```
`node --check` clean on all modules; 20/20 stamps at `?v=38`. Archetype distribution
also Monte-Carlo'd in Python (Ельцовка skews low, Шлюз high). The маньяк тесак drop
reuses the same `enemyDead` loot path verified live via the кастет drop. Dev save cleared.

## What's next

1. (Optional) Hand-play a full browser run to sanity-check the new район encounter feel.
2. (Optional) Wire the labelled `FUN_1000_5f55` char-creation rules text verbatim into
   the port's intro, and the `FUN_1000_2526` "Понтовость увеличивается" lines.
3. Per-район shop stock / pricing variety (the dealer menus differ by район in the EXE).

---

# Session 26 — PyGhidra headless dump unblocked (123 functions + decompilation)

Cleared the long-standing "Ghidra interactive" TODO blocker. Ghidra 12.1 dropped
the bundled Jython, so the old `tools/ghidra_dump.py` analyzeHeadless post-script
could never run — the dump files (`ghidra_{functions,decomp,strings}.txt`) had
**never been generated**. Configured PyGhidra and regenerated them. This is
infra/docs, not a gameplay change — no `?v=` bump, no module edits.

## What changed

- **New venv `.venv-ghidra`** (py3.13 — JPype has no py3.14 wheel, so the repo's
  main py3.14 `.venv` can't be reused) with Ghidra's bundled
  `pyghidra-3.1.0` wheel + JPype 1.5.2. Installed cleanly.
- **New `tools/pyghidra_dump.py`** — a PyGhidra driver replacing the Jython
  post-script. `pyghidra.open_program(..., analyze=True)` imports GOPNIK.EXE into
  a throwaway tmp project, auto-analyzes (~10s), and writes the three dumps.
  Fixed a latent bug carried from the old script (`getReferencesTo` is on the
  ReferenceManager, not the FunctionManager). Old `ghidra_dump.py` kept but marked
  SUPERSEDED.
- **Regenerated `notes/ghidra_functions.txt` + `ghidra_decomp.txt`**: **123
  functions** (vs the 8 the Capstone tracer reached through the LARGE-model far
  calls), each with C decompilation < 4 KB.
- **Docs**: rewrote CLAUDE.md "Ghidra" section with the working JDK-21 + PyGhidra
  command and the key-function map; updated `notes/findings.md` (#1 + tooling).

## Key functions identified (Ghidra bases the load segment at `1000`)

```
entry          1000:ab59  sz=17143  — Borland startup → user main
FUN_1000_6a0d  1000:6a0d  sz=2527   — user main() (allocs the 256B input buffers)
FUN_1f16_031a  1f16:031a  INT16h, 60 callers — getch (ungetch buf @ [0x3ec9])
FUN_1f16_0614  1f16:0614  INT10h, 15 callers — conio BIOS video wrapper
1f78:* / 1f16:* INT21h — DOS file-IO layer (.sav open/read/write/close)
```

## Caveats / notes

- `ghidra_strings.txt` is **sparse** (1 entry): Ghidra's 16-bit auto-analysis
  doesn't define the seg-0 `mov dx,imm` strings as data. Not a loss — string
  content already lives in `assets/strings_raw.json` (547) / `screens_raw.json`
  (1,930) from the Python extractors. The valuable output here is the function
  graph + decompilation.
- This unblocks (but doesn't itself complete) the optional labeling work. The two
  things the Ghidra pass was originally for — the `^N` decoder and the `.sav`
  format — are already resolved (Session 25) / decided-against (JSON, Session 24),
  so this is now reference material for the per-location-encounters chunk.

## Part 2 — formula faithfulness audit (first use of the dump)

Used `ghidra_decomp.txt` to recover the original combat/stat model and reconcile
`src/states/play.js` against it (see notes/findings.md "Combat & stat model").

- **Recovered model**: stat globals `0x389e`=dmg-stat (port `str`), `0x38a0`=dex,
  `0x38a2`=×5-HP stat (port `vitality`), `0x38a4`=luck; `max_hp = vit×5+10+str`;
  unarmed dmg `[str/2+1 .. str]`; hit% `= min(90, dex×5+20)`; flurry `−18`/swing;
  crit `= luck×3`%; enemy HP `= str×5+vit+10`. The old `Точность = (…)%7` in
  findings.md was a **misread** — corrected (no modulo).
- **Naming caveat resolved**: the EXE's ×5-HP and damage stats look "swapped" vs the
  port's labels, but mapping **by role** (not Russian name) the port's `calcMaxHp`
  and `rollDmg` are already faithful — no swap needed.
- **Fixed** (`play.js`, `?v=29`):
  - Per-class **stat presets** (Пацан 3/3/3/3 · Отморозок 5/2/4/1 · Гопник 4/3/3/2 ·
    Вор 3/3/2/4) seeded in `armNewGame` via new `applyClassStats`; `DEFAULT_STATE`
    reset to the Пацан preset. (Was: every class identical `5/5/2/2`, stats not
    affected by class — only command flavour.)
  - Accuracy clamp `95→90` (the EXE `0x5a` cap); new `canFlurry()` derives the
    double-hit from the *uncapped* accuracy so the cap change doesn't kill it.
- **Verified** (preview eval, no console errors): import play.js, `armNewGame` each
  class → persisted stats/HP exactly match the EXE presets:
  Пацан 3/3/3/3 hp28 · Отморозок 5/2/4/1 hp35 · Гопник 4/3/3/2 hp29 · Вор 3/3/2/4 hp23.
  `node --check` clean; 21/21 stamps at `?v=29`. Test save backed up + restored.
- **Flagged, deferred** (rebalance all session 11–25 content — need an explicit
  go-ahead): crit model (10%×2 → luck×3%+maxdmg), full flurry loop, and the
  enemy stat model (level-scaled → point-distributed `str×5+vit+10`).

## Part 3 — the deferred combat trio, now faithful (`?v=30`)

Tackled all three items Part 2 had flagged, from the `FUN_1000_3d11` (combat) and
`FUN_1000_0d14` (enemy spawn) decompilation:

- **Crit = Удача×3 %** (was fixed 10% ×2): a crit adds +max-damage and a fracture
  message; wired on both the player and enemy turns. Удача now matters in a fight.
- **Full flurry loop** (was a single extra hit): each turn swings while accuracy
  stays `> 0`, dropping `−18` per swing (start `stat+4`), capped 90% to-hit. Both
  sides. `fightRound` rewritten as two `do…while` loops.
- **Enemy stat model** (was `8+lvl×4+roll(6)` HP): new `distributeStats` ports the
  EXE loop — distribute `sum(weights)+lvl×2` points across str/dex/vit/luck by
  per-archetype weights; HP `= vit×5+str+10`; added district-scaled enemy **armor**
  (`≈район²·2`) and **luck**. `ENEMY_NAMES` is now 7 archetypes with weight shapes;
  bosses/менты gained `luck`+`armor`. The exact EXE 10-row weight table wasn't
  transcribed (data table) — archetype weights are hand-tuned to the same mechanic.
- `sv`/`s` displays updated: flurry hint via `canFlurry`, plus Крит% / Броня.

**Verified** (preview eval driving the live `play` state, no console errors):
spawned enemies obey `HP = vit×5+str+10` (e.g. крепкий бугай 24 = 2×5+4+10);
forced fights show crits ("Ты сломал врагу челюсть! …на 4з", "Враг сломал тебе
челюсть!"), flurry loops, armor, and clean kills/deaths. `node --check` clean;
21/21 stamps at `?v=30`. No new STATE fields → existing saves load unchanged.

⚠️ **Balance shifted** — enemies are now statted in parallel with the player
(comparable HP/damage) rather than level-scaled. Worth a full playthrough to
re-tune archetype weights / district bonuses if early fights feel too swingy.

## Part 4 — balance playthrough pass (Monte Carlo) → tuning (`?v=37`)

Drove the real `fightRound`/`spawnEnemy` via a **temporary `__balance` export**
(added, used, then removed — final tree has no hook) for ~150–600 fights/scenario.

- **Finding 1 — fights were ~30 rounds.** The faithful combat path computed
  accuracy as `(dex+4)×5` *inline*, so the Part-2 `pctHit` edits only changed the
  display, not combat. Fresh accuracy was still 35%. Unified everything behind
  **`ACC_BASE` (20→45)** + `hitChance()`; flurry now drops 90 pts/swing. → fresh
  fights ~8–12 rounds, geared ~3–5.
- **Finding 2 — enemies too tanky.** Cut generated **enemy HP** to `vit×2+str+5`
  (player keeps `vit×5+str+10`).
- **Finding 3 — d2 mook armor (14) > final boss (8)** and could zero player damage.
  Re-scaled **enemy armor** to `район×2 + roll(район+1)` (0 / 2–3 / 4–6).
- Class presets/crit/flurry/HP formula otherwise unchanged from Part 3.

**Final curve** (measured): fresh L1 `pacan 90% · otmorozok 98% · gopnik 97% ·
vor 77%`, ~8–12 rounds, wins cost ~40% HP; geared mid/late mooks 2–5 rounds;
bosses **91–97% when prepared, 0% undergeared**, rushing a later район at L1 = 0%.
Вор is the deliberate combat-weak / economy-strong class.

- **Verified**: real `play`-state drive post-removal — spawn → fight → kill → XP,
  no console errors; `node --check` clean; 21/21 stamps `?v=37`; no `__balance`
  left in the tree. (Heads-up: the sims write `localStorage` each round; I cleared
  the dev save afterward so the next launch starts fresh.)

## What's next

1. **Richer per-location encounters** from `assets/screens_raw.json` — now with
   `ghidra_decomp.txt` to cross-check original encounter/stat formulas.
2. (Optional) Walk the decompilation to label the remaining encounter functions,
   and transcribe the exact enemy weight table at `[0x3952*4+2..5]`.
3. (Optional) Hand-play a full run in the browser to sanity-check feel vs the
   Monte Carlo numbers.

---

# Session 25 — `^N` special-escape decoder resolved (Phase 2 done)

Closes the long-deferred Phase 2 (the only open item left on the Session 23/24
remaining-work plan): the non-hex `^`-escapes in the original game data
(`^< ^, ^/ ^! ^? ^= ^) ^" ^&`) now decode to the right colors, **without
DOSBox** — they turned out to be a single arithmetic rule, not a new feature.

## The finding (no DOSBox needed after all)

Mining `assets/screens_raw.json`:

- The real selectors are `! " & ) , / < = ?`. The previously-listed `^#` was a
  **false lead** — `#` only appears as the *token* after a selector (`^/#`,
  `^?#`), a runtime **price placeholder**, never as an escape char itself.
- All `^9 / ^u / ^_ / ^f`-type hits live in binary/code regions (text mis-read
  from code) — ignored as noise.
- The smoking gun: the dealer/gear menu (frags @ 0xA4E2..0xA661) prints each
  item's price `#` with a **different** selector per line (`/ ? ) E " &`) — a
  per-row rainbow, the same trick the title art (@ 0x18D0) uses with `^0`..`^7`.
- The only rule consistent with the hex digits, the `:`..`?` punctuation **and**
  that rainbow is the DOS decoder computing the color arithmetically:
  `color = (charCode(N) - 0x30) & 0x0F`. So `/`→15, `?`→15, `,`→12, `=`→13,
  `!`→1, `)`→9, `&`→6, `"`→2, `<`→12; `:`..`?` → 10..15.

## What changed

- **`src/render.js#writeAt`**: kept the hex `^0`-`^F` path untouched (the port's
  *own* UI strings use `^A`-`^F` = 10-15, DOSBox-verified, `^0`→7), and **added**
  a branch for punctuation selectors `0x21-0x2F` / `0x3A-0x3F` → `(cc-0x30)&0xF`.
  The selector char is consumed; the highlighted token (price/number/hotkey) is
  rendered in that bright color, just like the original. The port never emits
  these punctuation escapes, so existing port UI is byte-for-byte unaffected;
  the branch only matters when an original-data fragment is rendered.
- **`notes/findings.md`**: rewrote the "Color escape encoding" section with the
  resolved `(char-'0')&0xF` table, the evidence, and the A-F divergence caveat.
- **Bumped to `?v=28`** across all 21 import stamps + `index.html`.

## Verified (preview eval, no console errors)

```
writeAt color decode (first non-space cell fg):
  ^F→15  ^C→12 (hex path intact)
  ^/#→#/15  ^?#→#/15  ^,15→1/12  ^=30→3/13  ^!p→p/1
  ^<A→A/12  ^)Z→Z/9  ^&Z→Z/6  ^"Z→Z/2          ✓ (all match the table)
real frag '^63^7 - ^/#^7 руб. Затемнённые очки' →
  "3 - # руб. Затемнённые очки", '3':6 '#':15, no '^' leakage ✓
node --check src/render.js clean; no console errors.
```

## What's next

1. **Richer per-location encounters** from `assets/screens_raw.json` (catalogued
   fragments → per-район vignettes/fights). High-value, fully testable locally.
2. **Real `.sav` format reversal** — drive dosbox-x (computer-use), capture
   `places.sav` / `save_r*.sav`, diff at known states. Strongest 1:1 signal but
   needs interactive DOS driving.

---

# Session 24 — JSON save export / import (download + upload)

Phase 3 of the remaining-work plan. localStorage saves (`gopnik.state.v3` +
`gopnik.checkpoint.v1`) are per-device; this adds a lossless **JSON file**
download/upload so a save can move between machines/browsers. No cloud, no
Supabase, no backend — a plain `.json` file. (The old binary DOS `.sav`
interchange idea was dropped: the port's STATE has diverged too far from the
2003 binary to round-trip losslessly, and it serves almost no user.)

## What changed

- **New module `src/save_transfer.js`**: `exportSave(state)` wraps STATE in
  `{ format:'gopnik.save', version:'v3', savedAt, state }` (pretty JSON);
  `importSave(text)` parses + validates the envelope and returns the inner state
  (throws verbatim RU messages on non-JSON / non-GOPNIK files). DOM helpers
  `downloadSave(state, nick)` (Blob + anchor, filename
  `gopnik-save-<nick>-<YYYYMMDD>.json`) and `pickSaveFile()` (file input →
  Promise<text>).
- **`src/states/play.js`**: extracted the save-schema upgrade out of `loadState`
  into a reusable `migrateState(base, hadSave)` (loadState now calls it), so the
  import path runs the **identical** migration as a normal load. New `export` /
  `import` commands (+ `HELP` rows); `import` is async (file picker), applies via
  `Object.assign(STATE, migrateState(incoming, true))`, clears
  ENCOUNTER/mode/arrivalPending, re-persists.
- **`index.html`**: a `.savebar` with «⬇ Скачать сейв» / «⬆ Загрузить сейв»
  buttons (mobile-friendly). **`src/main.js`** wires them to inject the matching
  REPL command into the input queue, but only while `current === 'play'`.
  **`styles.css`**: `.savebar` button styling matching the bezel theme.
- **Bumped to `?v=27`** across all import stamps + `index.html` (now 21 — the new
  `save_transfer.js` import in play.js adds one).

## Verified (preview eval, no console errors)

```
exportSave/importSave round-trip: nick "Тестер"/money 777 preserved;
  foreign JSON → "это не сейв ГОПНИКа.", garbage → "файл не читается (не JSON)." ✓
export command (download stubbed): filename gopnik-save-Раздолбай-20260530.json,
  no error, log line printed ✓
import command: opens picker, prints a json-mentioning prompt, no sync error ✓
savebar export button (current==='play'): injects 7 input events (export+Enter) ✓
No console errors; test saves cleared from localStorage.
```

## What's next

1. **Phase 2 — `^N` special-escape decoder** (`^< ^, ^/ ^# ^! ^? ^=`): still
   open. The recorded RE lead (`mov al,0x5E` @ image `0xF2C3`) is a **false
   positive** — that's the keyboard/Ctrl-Break ISR ("^C" emitter), not the string
   decoder. The real `^`-scanner is still unlocated. Context shows the specials
   are highlight markers before prices/hotkeys (e.g. `^,15`, `^=30`, `^/#`,
   `^!p`); confirming exact effect needs a DOSBox-X visual check. Needs: locate
   the decoder in disasm + a stable DOSBox session.

---

# Session 23 — richer wander flavour (quiet-branch street vignettes)

Phase 1 of the remaining-work plan: the `w` "nothing happened" branch in
`src/states/play.js` was a single line ("Обошёл всё — никого стоящего."). It now
picks from an 8-entry `flavour` table of in-voice street vignettes — most are pure
narration (dogs, бабки, "Владимирский централ"), a few have light side-effects
(pick up 1–2р of мелочь, sober up a point of `drunk`/`high`, drop a rouble to a
бабка) with no balance impact. State persists after the vignette. No new STATE
fields, no save migration.

- **Bumped to `?v=26`** across all 20 module-import stamps + `index.html`.
- **Verified** (preview eval, no console errors): forced the quiet branch via a
  stubbed `Math.random`; distinct vignettes render in the bitmap font
  ("Обошёл всё…", "Подкинул бабке у подъезда рубль на хлеб."). Test save cleared.

## What's next

1. **Phase 2 — `^N` special-escape decoder** (`^< ^, ^/ ^# ^! ^? ^=`): reverse via
   `notes/disasm.txt` (decoder hints @ image `0x00F2C3` / `0x005B8A`) + DOSBox-X
   visual check, implement in `render.js#writeAt`, document in `notes/findings.md`.
2. **Phase 3 — JSON save export/import**: download/upload the live STATE as JSON
   (new `src/save_transfer.js` + `play.js` commands + `index.html` controls),
   routed through the existing `loadState()` migration path. localStorage stays
   the per-device default.

---

# Session 22 — hand-drawn bitmap glyphs for « » — … (100% bitmap screen)

Implements item #2 from the Session 21 "What's next" list: drop the web-font
`fillText` fallback so every on-screen character is a crisp VGA bitmap.

## Background

`assets/screens_raw.json` / `strings_raw.json` contain **zero** of `« » — …`
(verified by grep) — the original DOS game data used straight ASCII quotes and
hyphens, which all exist in CP866. The typographic chars were introduced by the
port's own UI/log strings (`«`/`»` pairs ×17, 138× `—`, 2× `…` across `src/`).
Since there's no authentic VGA bitmap to copy for them, Session 21 left them on
the `ctx.fillText` web-font path — the one place the screen wasn't pure bitmap.
Chose to hand-draw them rather than sweep ~138 em-dashes back to ASCII (keeps
the nicer typography; smaller, contained diff).

## What changed

- **New `SYNTH_GLYPHS` table in `src/render.js`** — cell-local `[x,y,w,h]`
  fillRect lists hand-drawn in the same 8×16 / 9-wide-cell pixel idiom as the
  bitmap font:
  - `—` em dash: a 1px rule across the **full 9-col cell width** at row 7, so
    consecutive em dashes join into a continuous line.
  - `…` ellipsis: three 2×2 dots on the baseline (rows 13–14).
  - `«` / `»` guillemets: two 1px chevrons each (rows 5–9), `»` the mirror of `«`.
- **Pass 2 of `Renderer.draw` checks `SYNTH_GLYPHS`** right before the
  `fillText` fallback, drawing the rects in the current `PALETTE[fg]` color
  (so they recolor like any glyph). `fillText` is now dead for all current
  content — kept only as a last-resort safety net.
- Header comment updated to reflect the new path. **Bumped to `?v=25`** across
  all 20 import stamps + `index.html`.

## Verified (preview eval pixel-sampling + screenshot, no console errors)

```
renderer.draw a buffer with "«»—…A" at fg=15, then getImageData per 9×16 cell:
  «  → 10 lit px   (10 chevron rects)        ✓
  »  → 10 lit px   (mirror)                  ✓
  —  →  9 lit px   (full-width row-7 rule)   ✓
  …  → 12 lit px   (three 2×2 dots)          ✓
  A  → 39 lit px   (real CP866 bitmap glyph) ✓
```
Counts match the hand-drawn designs exactly, proving they take the SYNTH path
(not the font-dependent fillText path). Title screen still renders cleanly;
no console errors. `node --check src/render.js` clean.

## What's next

1. **Real .sav format reversal** — drive dosbox-x (needs computer-use), capture
   places.sav / save_r*.sav; make the checkpoint/save interchangeable with DOS.
2. Richer per-location encounters from `assets/screens_raw.json`.

---

# Session 21 — authentic CP866 8x16 VGA bitmap font

Implements the long-deferred "Embed a CP866 8x16 BIOS bitmap font for
pixel-perfect chars" chunk (on the resume list since Session 5). The other
top item — real `.sav` reversal — needs interactive dosbox-x driving via
computer-use, which was unavailable this session, so the font was taken next.

## What changed

- **Embedded the authentic FreeDOS CPIDOS CP866 8x16 VGA font** (from
  `viler-int10h/vga-text-mode-fonts`, `FONTS/SYSTEM/FREEDOS/CPIDOS30/CP866.F16`)
  — the codepage GOPNIK.EXE rendered under on a 2003 Russian-DOS PC. Raw 4096-byte
  font saved to `assets/cp866.f16` (256 glyphs × 16 rows, MSB-left).
- **New tool `tools/make_font.py`** → generates `src/font_cp866.js` (auto-gen,
  do-not-edit): the glyph bytes base64-encoded into a `Uint8Array`, plus a
  `CP866_BY_CHAR` Unicode-char → glyph-index map for every printable CP866 code
  (0x20..0xFF, 223 entries; built via `bytes([b]).decode('cp866')`).
- **`src/render.js` now blits real bitmap glyphs** instead of `ctx.fillText`:
  - Per-foreground-color glyph **atlases** built lazily (`buildGlyphAtlas`,
    16×16 grid of 9×16 cells, transparent bg) and cached in `Renderer.atlases`.
  - Draw pass 2 looks up the cell char in `CP866_BY_CHAR`; if found, `drawImage`
    from the atlas (fast, GPU-blit). Box-drawing primitives + `fillText` remain
    only as fallback for the handful of typographic chars CP866 lacks (« » — …).
  - **VGA 9th-column replication** baked into the atlas for line-draw codes
    0xC0..0xDF, so horizontal box rules join seamlessly across cells.
- **Bumped to `?v=24`** across all imports + `index.html` (now 20 stamps — the
  new `font_cp866.js` import in `render.js` adds one).

## Verified (preview screenshots + console, no JS/console errors)

- **Title screen**: ГОПНИК box-art logo + "Версия 1.025" / "Нажми какую-нибудь
  кнопку" / "by V.P.U." all render as crisp authentic VGA bitmap glyphs;
  11 color atlases built for the rainbow logo. (screenshot)
- **Play REPL** (forced Рушель Блаво encounter): header "ГОПНИК - Ельцовка /
  HP:25/25 Сил:5 Лов:5 …", log lines, and the verbatim mage offer incl.
  «благославление» (guillemets via fallback) + "За 10 рублей … сохранение
  прямо здесь." all render in the bitmap font. (screenshot)
- No errors. (Driving note: the preview tab backgrounds rAF to a full pause, so
  the play screen was rendered by aliasing `title.draw`→`play.draw` for the
  capture; reloaded afterward to restore the live app.)

## What's next

1. **Real .sav format reversal** — drive dosbox-x (needs computer-use), capture
   places.sav / save_r*.sav; make the checkpoint/save interchangeable with DOS.
2. Hand-draw bitmap glyphs for « » — … so the screen is 100% bitmap (drop the
   `fillText` fallback), or normalise the port's text back to ASCII quotes/dashes
   as the original used.
3. Richer per-location encounters from `assets/screens_raw.json`.

---

# Session 20 — Рушель Блаво: платное сохранение прямо здесь (checkpoint)

Implements item #1 from the Session 19 "What's next" list (EXE @ 0x8CBA) — the
*other* half of the Рушель Блаво encounter: "За # рублей он может сделать
сохранение прямо здесь." (verbatim string confirmed in `assets/screens_raw.json`,
adjacent to the "Ты встретил великого мага и экстрасенса - Рушеля Блаво." intro).

## What changed

- **Рушель Блаво now offers a second paid service — a checkpoint save.** The
  magic sub-prompt (`mode='magic'`) lists both:
  - `y` — благословление (existing, `15 + district*10` руб),
  - `s` — **сохранение прямо здесь** (`10 + district*5` руб = 10/15/20 by район,
    deliberately cheaper than the blessing).
  The offer prints the verbatim EXE line with the literal `#` resolved to the
  live price.
- **Dedicated checkpoint slot** `localStorage['gopnik.checkpoint.v1']`, separate
  from the constantly-overwritten autosave (`gopnik.state.v3`). Paying writes a
  snapshot via the new `writeCheckpoint(s)`; on success: "Рушель Блаво сделал
  тебе сохранение прямо здесь." + a hint that `cp` rolls back here. If the write
  throws, the fee is refunded ("Чёт магия не сработала…"). Too broke → the
  verbatim "Парень, все стоит бабок!" (stays in `маг>`, no charge).
- **New top-level command `cp`** — откатиться к сохранёнке Рушеля Блаво
  (`readCheckpoint()` → `Object.assign(STATE, cp)`, clears ENCOUNTER/mode/
  arrivalPending, re-persists). No checkpoint → "Сохрана от Рушеля Блаво нет.
  Найди мага (w) и заплати за сохранение." Added to `HELP`.
- **No main-save migration** — the checkpoint lives in its own key, so existing
  `gopnik.state.v3` saves load unchanged.
- `draw()` magic footer hint updated to mention `s`. **Bumped to `?v=23`** across
  all module imports + `index.html` (19 stamps).

## Verified (preview eval + buffer dump, no JS/console errors)

```
fresh game, Ельцовка, 20р, Math.random stubbed → roll(12)===0:
  w → "Ты встретил … Рушеля Блаво." + both offer lines incl.
      "За 10 рублей он может сделать сохранение прямо здесь.", prompt маг> ✓
  s → money 21→11 (got +1р on the wander), checkpoint written,
      "Рушель Блаво сделал тебе сохранение прямо здесь." + "(Деньги: 11р)" ✓
  mh → live drunk 0→5;  cp → "Откат к сохранёнке … HP 25/25, 11р",
      live drunk restored 5→0, money 11 (checkpoint state intact) ✓
  (no checkpoint) cp → "Сохрана от Рушеля Блаво нет. Найди мага (w)…" ✓
```
Test saves + checkpoint cleared from localStorage afterward.

## What's next

1. **Real .sav format reversal** — drive dosbox-x, capture places.sav /
   save_r*.sav; make the checkpoint/save interchangeable with the DOS version
   (strongest 1:1 signal).
2. **CP866 bitmap font** — pixel-perfect glyphs.
3. Richer per-location encounters from `assets/screens_raw.json`.

---

# Session 19 — Храм божий (Бог) + фенька (passive ring)

Implements item #1 from the Session 18 "What's next" list (EXE @ 0x9000 /
0x9477) — the *other* half of the magic-region: the free **Храм божий**
blessing encounter and its «фенька» reward.

## What changed

- **New passive item slot `STATE.ring`** (фенька) — `{name}` or `null`, plus
  `STATE.temple_visits` (int). A ring gives, verbatim from the EXE ("Восст.
  жизни −3, 5% — самозарост переломов"):
  - **+3 HP regen** on every `w` (like the Отморозок self-heal; narrated
    "Фенька тихо лечит: +3 HP").
  - **5% самозарост переломов** — in `fightRound`, a 5% (`roll(20)===0`) chance
    to negate an incoming jaw/leg break ("Фенька сработала — перелом сам
    зарос!"), checked before the existing jaw-guard/armor blocks.
  Three name variants (verbatim @ 0x9477): Кольцо «Помоги господи» / «Мега
  Кольцо» / Кольцо «Господи помилуй».
- **New rare wandering encounter — Храм божий** (`templeVisit`, `roll(14)===0`
  in `w`, right after the Рушель-Блаво roll). **Free** blessing: you pray and
  Бог casts a благославление (понт +1..2 + a random stat +1, via the new shared
  `castBlessing` helper). On the first visit (no ring yet) he hands you a
  random фенька ("Дарю тебе феньку!"). Repeat visits switch to the verbatim
  "А ты опять… упорный мудак!" lines and skip the ring ("Фенька у тебя уже
  есть — носи, не теряй."). All God/prayer lines verbatim from the EXE.
- **Refactor**: extracted `castBlessing(pontGain)` (понтовость bump + one random
  stat, verbatim @ 0x92D2 lines) and reused it in both `handleMagic` (Рушель
  Блаво, +2..3 понт, paid) and `templeVisit` (Бог, +1..2 понт, free). The
  blessing bypasses the gym per-район cap (rare/divine — consistent with the
  mage).
- **`s` status** gains a "Фенька: <ring> (+3 HP на ходу, 5% самозарост
  переломов)" line.
- **Save migration**: pre-temple saves coerce `ring`→`null`, `temple_visits`→0;
  old saves load unchanged.
- **Bumped to `?v=22`** across all module imports + `index.html` (19 stamps).

## Verified (preview eval + screenshot, no JS/console errors)

```
Ельцовка, hp 15/28, no ring (Math.random stubbed so the temple roll fires):
  w → "Ты наткнулся на храм божий." (first-visit prayer) → понт 0→1,
      "Да увеличиться твоя сила!" (Сила 8→9, max_hp 28→29),
      "Дарю тебе феньку! Кольцо «Помоги господи» …" ✓
  w (quiet) → "Фенька тихо лечит: +3 HP. (18/29)" ✓
  w (temple again) → "Бог: «А ты опять…»" → понт 1→2, стат +1,
      "Фенька у тебя уже есть — носи, не теряй." (no dup ring) ✓
  s → "Фенька: Кольцо «Помоги господи» (+3 HP на ходу, 5% самозарост …)" ✓
  w (mage roll) → Рушель Блаво; y → blessing via shared castBlessing,
      понт 2→5, Живучесть +1, money 51→36 (refactor intact) ✓
```
Test saves cleared from localStorage afterward.

## What's next

1. **Рушель Блаво paid save point** (the other half of @ 0x8CBA: "За # рублей
   он может сделать сохранение прямо здесь") — best paired with a real `.sav`.
2. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
3. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 18 — Рушель Блаво (маг и экстрасенс) — платное благословление

Implements item #1 from the Session 17 "What's next" list (EXE @ 0x8CBA /
0x92D2 / 0x9477). The strings at the named offsets actually span two distinct
encounters: **Рушель Блаво** the "великий маг и экстрасенс" (a paid
save/blessing guy, @ 0x8CBA) and a separate **Бог / Храм божий** blessing
(@ 0x90xx). The понтовость-blessing lines (@ 0x92D2 / 0x9477) belong to God,
but the game reuses them; this session wires them onto Рушель Блаво as the
session note described ("Рушель Блаво … blessings that bump понтовость").

## What changed

- **Rare wandering encounter — Рушель Блаво** (`offerMagic`, `roll(12)===0` in
  `w`, placed after the менты block and before the boss block so it competes
  with normal spawns). Verbatim intro "Ты встретил великого мага и экстрасенса
  - Рушеля Блаво." Opens an in-place sub-prompt (`mode='magic'`, prompt `маг>`),
  like the притон/den.
- **Платное благословление**: for `15 + district*10` руб (15/25/35 by район):
  - `y` — pay → **понтовость +2..3** ("Да увеличится твоя понтовость! Был ты X
    а стал Y") **plus one random stat +1** drawn from the four verbatim God
    lines (@ 0x92D2): сила / «корявость» (=dex) / «силы жизненные» (=vitality) /
    удача. `max_hp` recalculated. Closes with "А теперь вали отсюда и никогда
    здесь не появляйся!" and returns to `cmd`. The blessing **bypasses the gym
    per-район cap** — intentional: it's a rare paid divine boost.
  - `0`/`n` — decline → "Нехотите как хотите - мое дело предложить." (verbatim).
  - `y` when broke → "Парень, все стоит бабок!" (verbatim), stays in `маг>` so
    you can still decline. No charge.
- **No new persistent STATE / no save migration** — понт + the four stats
  already persist; `magicCost` is a session-only module var for the prompt.
- `update()` routes `mode==='magic'` to `handleMagic`; `draw()` adds the `маг>`
  prompt label + footer hint. Esc cancels via the existing generic handler.
- **Bumped to `?v=21`** across all module imports + `index.html` (19 stamps).

## Verified (preview eval + screenshot, no JS/console errors)

```
Ельцовка, 100р, pont 1, str 8:
  w (Math.random stubbed low → roll(12)===0) → "Ты встретил великого мага…
     За 15 рублей…", prompt маг> ✓
  y → "Да увеличится твоя понтовость! Был ты 1 а стал 4." + "Да увеличиться
     твоя сила!" (Сила 8→9), money 101→86, max_hp 28→29, back to \> ✓
  w (forced) again → 0 → "Нехотите как хотите - мое дело предложить.",
     no charge, pont stays 4 ✓
  money set to 5; w (forced) → y → "Парень, все стоит бабок!", stays in маг>,
     no charge ✓
```
Test saves cleared from localStorage afterward.

## What's next

1. **Бог / Храм божий** as its own rare encounter (EXE @ 0x90xx): the praying
   flavour ("Господи, Братан, прости грешника") + a «фенька» reward — a ring
   (Кольцо "Помоги господи" / "Мега Кольцо" / "Господи помилуй": "Восст. жизни
   −3, 5% — самозарост переломов") = a passive HP-regen / fracture-self-heal
   item. Would need a new item slot + save migration.
2. **Рушель Блаво paid save point** (the *other* half of @ 0x8CBA: "За #
   рублей он может сделать сохранение прямо здесь") — once the real `.sav`
   format exists.
3. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
4. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 17 — зоновская наколка + глушитель (+ fix: `f` swallowed by fullscreen)

Implements item #1 from the Session 16 "What's next" list (EXE @ 0xab24:
"Сделать типа зоновскую наколку(Шансы, что наедут −50% (кроме бандитов,
ментов и маньяков))" / @ 0xac38: "Глушитель.").

## What changed

- **Зоновская наколка** — new dealer item (`bmar`, 90р, `nakolka:true`). New
  flag `STATE.nakolka`. While wandering (`w`), the **normal-enemy spawn rate is
  halved** (`roll(10) < (nakolka ? 3 : 6)`). Placed *after* the менты- and
  boss-spawn blocks, so the наколка never reduces менты or boss appearances —
  matching the EXE's "кроме … ментов …". Idempotent buy ("Наколка у тебя уже
  есть — блатная синька на месте."). Shown in the `s` "Снаряга:" line.
- **Глушитель** — new dealer item (`bmar`, 30р, `silencer:true`). New flag
  `STATE.silencer`. Requires a gun first ("Сначала купи ствол — глушитель
  навинчивать не на что."), idempotent otherwise ("Глушитель уже стоит на
  стволе."). With a silencer, `gunFire()` narrates "Пфф! Тихий выстрел…"
  instead of "БАХ!" and **adds no `mentHeat`** (`if (!STATE.silencer)
  mentHeat += 2`), so менты don't get drawn by the shot. Shown in `s` appended
  to the самопал gear entry ("самопал (…) + глушитель").
- **Prices from the EXE**: the leading menu bytes ARE the original prices
  (Косяк 14, Кастет 23, Самопал 86, наколка **98**, глушитель **19**) — naколka
  is the priciest single item, глушитель the cheapest. Kept the port's round
  scale (наколка 90р, глушитель 30р) while preserving that ordering relative to
  each other.
- **Bug fix (pre-existing, Session 13)** — the global `f`/`F`=fullscreen
  shortcut in `main.js` spliced **every** `f` keypress out of the queue before
  the play REPL saw it, so the `f` (самопал) command — the *only* trigger for
  the silencer — was unreachable, and any name/command containing `f` was
  mangled. Now gated: fullscreen-on-`f` is skipped while `current` is `play` or
  `difficulty` (the text-input states). Fullscreen still works from
  boot/title/intro/victory.
- **Save migration**: pre-наколка/глушитель saves coerce `nakolka`/`silencer`
  to `false`; old saves load unchanged.
- **Bumped to `?v=20`** across all module imports + `index.html` (19 stamps;
  bumped twice this session — once for play.js, once after the main.js fix).

## Verified (preview eval + screenshot, no JS/console errors)

```
Ельцовка, 300р, gun, found all:
  bmar → menu lists "11. Зоновская наколка 90р" + "14. Глушитель 30р" ✓
  11   → money 300→210, "Барыга наколол тебе зоновскую наколку…" ✓
  14   → money 210→180, "Навинтил глушитель…" ✓
  re-14→ "Глушитель уже стоит на стволе."; re-11 → "Наколка у тебя уже есть…" ✓
  s    → "Снаряга: самопал (патронов: 5, стреляй f) + глушитель,
          зоновская наколка (наезды −50%)" ✓
ОбьГЭС (gunZone), nakolka+silencer, gun:
  w ×16 → only ~1 spawn (наколка halving visible) ✓
  f     → "Пфф! Тихий выстрел из самопала на 9з…", ammo 9→8 (no mentHeat) ✓
gun-less save: bmar; 14 → "Сначала купи ствол…", money unchanged (100р) ✓
```
Test saves cleared from localStorage afterward.

## What's next

1. **Magic-man encounter** (Рушель Блаво — EXE @ 0x92d2 / 0x9477: blessings
   that bump понтовость) during `w`.
2. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
3. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 16 — краденый мобильник + офигенный косяк (buyable items)

Implements item #1 from the Session 15 "What's next" list (EXE @ 0xaab9:
"Краденый мобильник(Подмога быстрее приходит)" / "Офигенный косяк(Очко
прокачки)").

## What changed

- **Офигенный косяк** — new market item (`mar`, 35р). High +3 *and* a one-off
  "Очко прокачки": +1 to the player's **weakest** combat stat (str/dex/
  vitality/luck), bypassing the gym's per-район cap. `MARKET_ITEMS[].buy` now
  may **return a log string**; `handleMarketPurchase` prints it ("Очко
  прокачки! <Стат> +1."). `STAT_NOUN` maps stat→именительный for the message.
- **Краденый мобильник** — new dealer item (`bmar`, 60р, `phone:true`). New
  flag `STATE.has_phone`. Idempotent buy ("Мобила у тебя уже есть."). With a
  phone, **подмога (`v`) приходит надёжнее**: the success roll gets +3 to the
  effective понт, and the call narrates "Ты свистнул пацанам по мобиле — летят
  быстрее." Shown in the `s` "Снаряга:" line alongside ствол/очки.
- **Save migration**: pre-mobile saves coerce `has_phone` to `false`; old
  saves load unchanged.
- **Bumped to `?v=18`** across all module imports + `index.html` (19 stamps).

## Verified (preview eval, no JS/console errors)

```
seed pacan str8/dex5/vit2/luck2, 200р, found={mar,bmar}:
  mar → menu now lists "4. Офигенный косяк 35р High +3, очко прокачки…" ✓
  4   → money 200→165, high 0→3, vitality(=lowest 2)→3, max_hp 25→33,
        "Очко прокачки! Живучесть +1." ✓
  bmar→ "10. Краденый мобильник 60р подмога (v) приходит быстрее" ✓
  10  → money 165→105, has_phone=true; re-buy 10 → "Мобила у тебя уже есть." ✓
  s   → "Снаряга: краденый мобильник" ✓
  pont=9 + phone, w→encounter, v → "Ты свистнул пацанам по мобиле — летят
        быстрее." + "Подошли пацаны… Врага отпинали на 7з" ✓
```
Test save cleared from localStorage afterward.

## What's next

1. **Зоновская наколка** (EXE @ 0xab24: "Шансы, что наедут −50% (кроме
   бандитов, ментов и манья[ков])") — buyable, lowers random encounter
   aggression; and **Глушитель** (@ 0xac38) for the самопал (quieter shots →
   less mentHeat).
2. **Magic-man encounter** (Рушель Блаво — EXE @ 0x92d2 / 0x9477: blessings
   that bump понтовость) during `w`.
3. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
4. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 15 — кожанка + понтовые шмотки (buyable gear → понтовость)

Implements item #1 from the Session 14 "What's next" list. The named offsets
in CLAUDE.md (0x8CF9 / 0x9036) turned out stale; the real gear strings live in
the dealer-menu region (EXE @ 0xa4e2..0xa661) and the status region
(0x3053..0x328a), plus the resale line @ 0xb0b2 and "Понтовость увеличивается"
@ 0x3d60.

## What changed

- **New gear slot `STATE.jacket`** (кожанка) — `{name, armor}` or `null`. A
  distinct armor item separate from the boxer's jaw-guard. Two dealer tiers
  (verbatim menu text @ 0xa59a / 0xa661):
  - **Реальная кожанка** 50р → защита+2, понт+2 ("Дополнительная защита от
    случайностей на 2").
  - **Ваще крутая кожанка** 95р → броня+4, понт+3.
  Tier-replace like weapons: a stronger кожанка swaps in and the old one is
  **stashed to junk** (`stashOldJacket`), resalable via `wes`/`x`
  (EXE @ 0xb0b2). Re-buying a weaker/equal tier → "Утебя есть кожанка круче."
  (verbatim @ 0xa8d8).
- **Donning понтовые шмотки raises понтовость** (EXE @ 0x3d60 "Понтовость
  увеличивается: ") — jackets grant +2/+3 понт on purchase; the new
  **Понтовёйшие бутсы** (45р, урон+3) grant +1. This is the "tied to
  понтовость" hook from the task list.
- **`effArmor()` helper** = base armor (зубная защита) + `jacketArmor()`.
  Combat damage reduction and the jaw-break block now read `effArmor()`; `s`
  shows "Броня: N (вкл. кожанку +K)" + a "Прикид: <кожанка> (защита+K)" line.
- **"Защита от случайностей"**: on defeat the cash-loss fraction drops by 5%
  per jacket-armor point (0.5 → 0.4 with +2, → 0.3 with +4), narrated
  "(кожанка спасла часть бабла)".
- **Junk entries gained `armor`**; the барахолка (`wes`) menu now tags items
  "(броня+K)" vs "(урон+K)". `addJunk`/`stashOldWeapon` write `armor:0`.
- **Save migration**: pre-jacket saves coerce any missing/malformed `jacket`
  to `null`; old saves load unchanged.
- **Bumped to `?v=17`** across all module imports + `index.html` (19 stamps).

## Verified (preview eval, no JS/console errors)

```
seed pacan, 200р, pont 0, found={bmar}:
  bmar → menu lists 5 Понтовые бутсы / 6 Понтовёйшие / 8 Реальная кожанка /
         9 Ваще крутая кожанка ✓
  8 (Реальная кожанка) → money 200→150, pont 0→2, jacket{armor2}; re-buy 8 →
       "Утебя есть кожанка круче." ✓
  9 (Ваще крутая)      → money 150→55, pont 2→5, jacket{armor4}; old Реальная
       кожанка stashed to junk {armor2,price50} ✓
  s   → "Броня: 4 (вкл. кожанку +4)" + "Прикид: Ваще крутая кожанка (защита+4)"
       + "Хлам: Реальная кожанка" ✓
  wes → "1. Реальная кожанка  25р (броня+2)"; 1 → "продал ... за 25р",
       money 55→80, junk emptied ✓
```
Test save cleared from localStorage afterward.

## What's next

1. **Краденый мобильник** (EXE @ 0xaac7 "Подмога быстрее приходит") +
   **Офигенный косяк** (@ 0xab24 "Очко прокачки") as market/dealer items.
2. **Magic-man encounter** (Рушель Блаво — EXE @ 0x92d2 / 0x9477: blessings
   that bump понтовость) during `w`.
3. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
4. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 14 — per-district training caps (качалка)

Implements item #1 from the Session 13 "What's next" list (EXE @ 0x6647).

## What changed

- **Each district has a `trainCap`** — a per-stat ceiling on gym training:
  - Ельцовка: `{str 13, dex 10, vitality 7, luck 7}`
  - ОбьГЭС:   `{str 20, dex 14, vitality 11, luck 11}`
  - Шлюз:     `{str 30, dex 20, vitality 18, luck 18}` (last район — high)
- **`GYM_ITEMS` gained `stat` + `noun`** (`Сила`→`str`/«силу», `Ловкость`→
  `dex`/«ловкость», `Живучесть`→`vitality`/«пресс», `Удача`→`luck`/«удачу»)
  so the cap check is generic.
- **`handleGymTrain` enforces the cap** *before* charging: at/above ceiling →
  "Ты максимально прокачал ${noun} для своего уровня!" + "Качай дальше в
  следующем районе." (verbatim EXE @ 0x6647). On the final район the tail is
  "Ты на пике — иди мочи Ректора НГУ." No money is spent on a capped attempt.
- **Gym entry shows the ceiling**: a dim line
  "Потолок <район>: Сил n/cap Лов n/cap Жив n/cap Уд n/cap".
- No new save fields — caps key off the existing `district` + stats, so all
  old saves work unchanged.
- **Bumped to `?v=16`** across all module imports + `index.html` (19 stamps).

## Verified (preview eval, no JS errors)

```
seed: Ельцовка, str=13 (=cap), 50р, found={trn}:
  trn → gym menu + "Потолок Ельцовка: Сил 13/13 Лов 5/10 Жив 2/7 Уд 2/7" ✓
  1 (Сила, at cap) → "Ты максимально прокачал силу... Качай дальше
       в следующем районе"; Сил stays 13, money stays 50р (no charge) ✓
  2 (Ловкость, below cap) → "Ловкость +1 ... Лов 6"; money 50→46р ✓
```
Test save cleared from localStorage afterward.

## What's next

1. **Кожанка / понтовые шмотки** as buyable gear (EXE @ 0x8CF9 / 0x9036),
   tied to понтовость.
2. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
3. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 13 — самопал (homemade gun) + менты + бандитские районы

> ⚠️ This work was done in a session that crashed on a repeated
> `400 thinking-block` API error mid-verification; this entry was
> reconstructed and the verification finished in the following session.

## What changed

Implements item #1 from the Session 12 "What's next" list
(EXE @ 0x6023 / 0x3754 / 0x5747).

- **New state fields**: `has_gun` (ствол), `ammo` (патроны), `shades`
  (затемнённые очки). Old saves migrate (coerced to `false`/`0`).
- **`f` — ranged attack** (`gunFire()`, EXE @ 0x6023): one loud heavy hit
  (`8 + rand(8) + luck/2`), no enemy counter that round, spends a патрон,
  and raises session-only `mentHeat += 2`. Guard order: no encounter →
  "Не в кого стрелять"; no gun → "У тебя нет ствола. Спроси у барыг (bmar)";
  not a gun zone → "Нельзя тут стрелять! Менты накроют!"; no ammo →
  "Патроны кончились".
- **Bandit districts** (`gunZone`): Ельцовка `false` (спальный — менты
  патрулируют, стрелять нельзя); ОбьГЭС + Шлюз `true`. Added to the help
  list and the `s` status (shows ammo count + "Тут стрелять нельзя").
- **Менты** (`spawnMent()`, EXE @ 0x5747): tougher than locals
  (`hp 14+lvl*4`, `str 5+lvl`), drawn by gunfire during `w` when
  `mentHeat > 0` (chance scales with heat, capped 7/10). `shades` lets you
  slip past ("менты тебя не приметили"); otherwise an encounter spawns.
  Менты are `isMent` — killing one pays beспредел XP but does **not** count
  toward the district-boss gate; losing to one = "ночь в обезьяннике" and
  resets `mentHeat`.
- **Baryga (dealer) stock** added: Самопальный пистолет 120р (+3 патрона),
  Патроны (3 шт) 18р, Затемнённые очки 25р, with idempotent re-buy guards
  ("Ствол у тебя уже есть", "Сначала купи ствол", "Очки у тебя уже есть").
- **`mentHeat`** is reset on play-state enter (session-only, not persisted).
- **Bumped to `?v=15`** across all module imports + `index.html` (19 stamps).

## Verified (next session, after the crash)

- `node --check` on all modules → clean; 19/19 import stamps at `?v=15`.
- Preview boot: no JS errors, reaches play, status bar renders (Ельцовка
  HP 25/25 …).
- `f` with no encounter → "Не в кого стрелять" (first guard fires) ✓.
- New symbols all present and code blocks complete (gunFire, spawnMent,
  enemyDead/playerDead ment branches, dealer handlers, wander ment-heat).
- Full economy playthrough (buy gun → travel to ОбьГЭС → fire in anger)
  not re-driven; left as a manual smoke test.

## What's next

1. **Per-district training caps** (EXE @ 0x6647: "Ты максимально прокачал
   пресс для своего уровня! Качай дальше в следующем районе").
2. **Кожанка / понтовые шмотки** as buyable gear (EXE @ 0x8CF9 / 0x9036),
   tied to понтовость.
3. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
4. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 12 — притон (the den) + понтовость meter

## What changed

- **Новый стат `STATE.pont` — понтовость** (street-cred), capped at 12
  (EXE @ 0x595B "# из 12 шансов"). Shown in `s` ("Понт: N/12"). Old saves
  migrate (defaults to 0, clamped 0..12).
- **`pr` теперь интерактивный притон** (`mode = 'den'`, EXE @ 0x9F0A) — an
  in-place sub-REPL with its own `притон>` prompt + footer. Entry narrates a
  random den name (verbatim: общагу №5 / общагу ВКИ / гоповский притон /
  притон отморозков, EXE @ 0x9D4D). Sub-commands (verbatim strings):
  - `p`  — угостить пацанов пивом: −5р, +5 понт (+7 для Гопника). Иначе
    "А нет у тебя пива."
  - `r`  — занять денег на пиво: +2..4р, −2 понт. При понт<2 "Ты уже всю
    мелочь выгреб!"
  - `hp` — подлечиться у пацанов: +6 HP.
  - `a`  — разузнать: открывает качалку (trn) + барыг (bmar) в текущем районе
    ("Ты узнал где находится качалка и где находятся барыги") — кормит систему
    re-discovery из Session 10.
  - `d`  — пойти на дело (воровать): шанс зависит от удачи/класса; провал —
    "Шухер менты! Пора валить!" (−деньги, −1 понт), успех — "Ты смылся от
    ментов. Ты наваровал денег: +#р." Вор ворует ловчее.
  - `s`  — "Твоя понтовость сейчас = N/12." / "Да если чё мы за тебя впрягаемся."
  - `0`/Esc — свалить.
- **`v` (подкрепление) теперь гейтится понтовостью** (EXE @ 0x35E0): при
  понт<3 — "Ни кто не хочет за тебя впрягаться." / "Сначала надо скорешиться
  с местной гопотой (притон, pr)." При понт≥3 — шанс успеха растёт с понт;
  успех "Подошли пацаны - Ща начнется! / Врага отпинали на #з.", провал
  "Твою подмогу отпинали. / Подмоге надоело столько парится из-за мало
  понтового мудака." Каждый вызов тратит 1 понт.
- **`kl` (клуб) гейтится понтовостью** (EXE @ 0xA130): при понт<2 —
  "Тебя мудака такого туда не пустят - поднимай понтовость. / Тебе не стоит
  пока туда соваться. Зайди в притон (pr)." Иначе старый реп-бонус (с учётом
  Пацан-бонуса из Session 11).
- **Старый инлайновый Гопник-бонус в `pr`** заменён притоном; бонус Гопника
  теперь = больше понтовости за пиво (+7 vs +5) + тёплый приём.
- **Bumped to `?v=14`** across all module imports + `index.html`.

## Verified end-to-end (preview eval + screenshot, no JS errors)

```
seed pacan, 50р, pont 0, found={pr}:
  pr → "Ты пришел в притон — притон отморозков"; меню рисуется ✓
  p,p → понт 0→5→10, деньги 50→40; s → "понтовость = 10/12" ✓
  a → "узнал где качалка и барыги" (found += trn,bmar); hp → HP 15→21 ✓
  0 → "Свалил из притона" (mode=cmd) ✓
  w (rand=0) spawn enemy; v (понт 10) → "Подошли пацаны / Врага отпинали на 3з" ✓
seed pont=1: w; v → "Ни кто не хочет за тебя впрягаться" (gate) ✓
seed pont=1, found.kl: kl → "Тебя мудака такого туда не пустят" (gate) ✓
den: r@понт1 → "выгреб"; p → понт6; r → "занял 4р, −2 понт" (понт4);
     d (success) → "смылся от ментов, наваровал +14р" ✓
```
Test saves cleared from localStorage afterward.

## What's next

1. **Самопальный пистолет + бандитские районы** (EXE @ 0x6023 / 0x3754):
   `f` ranged attack usable only where "менты не накроют — Тельзя тут
   стрелять! Менты накроют!"; ment encounters (EXE @ 0x5747 — затемнённые
   очки to dodge).
2. **Per-district training caps** (EXE @ 0x6647: "Ты максимально прокачал пресс
   для своего уровня! Качай дальше в следующем районе").
3. **Кожанка / понтовые шмотки** as buyable gear (EXE @ 0x8CF9 / 0x9036:
   "Понтовые бутсы / Реальную кожанку"), tied to понтовость.
4. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
5. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 11 — character classes (Пацан/Отморозок/Гопник/Вор)

## What changed

- **The "difficulty" screen is now the real class picker** (`src/states/difficulty.js`,
  EXE @ 0x66E8: "Выбери кем ты будешь"). The old 5-option Сабж/Стандарт/Сложно
  placeholder is gone. Four classes with verbatim blurbs + bonuses from the EXE
  (@ 0x7FB3..0x805C):
  - **0 Пацан** — нормальный тип (Бонус — Гёлфренд, Клуб)
  - **1 Отморозок** — тупой корявый мудак (Бонус — Самолечение царапин)
  - **2 Гопник** — гоп он и есть гоп (Бонус — Притон)
  - **3 Вор** — везучий ублюдок (Бонус — Воровство, Барыги)
  `4-Чё за батва?` toggles the bonus blurbs (verbatim EXE menu line). Two phases:
  pick (0-3 / Up-Down) → name. The name prompt prefills the EXE default
  **"Раздолбай"** (@ 0x6802) for new players, current nick for returning ones;
  Enter applies and drops you at the university doors → `play`.
- **`STATE.klass`** added to `DEFAULT_STATE` (default `'pacan'`); default nick
  changed `Сабж` → `Раздолбай` to match the EXE. Old saves migrate (unknown/
  missing klass → `pacan`). `CLASS_LIST` is exported from `play.js` along with
  new hooks `armNewGame(klassId, nick)`, `getNick()`, `getKlassId()` that the
  class screen calls (STATE stays module-private).
- **Class bonuses wired into commands** (rather than altering base stats):
  - Пацан → `girl` heals to full (not +8); `kl` rep chance 50% (vs 33%).
  - Отморозок → `w` self-heals +2 HP ("Царапины затягиваются сами собой").
  - Гопник → `pr` gives +3..7р, реп +1, +3 HP ("Свои в доску").
  - Вор → dealers −25% (`buyPrice`, shown in menu + on purchase "по знакомству");
    `w` pickpockets +2..6р ~33% of the time ("обчистил чей-то карман").
- **`s` now shows class** ("Ты, <nick> (<Класс>)" + a "Класс: X (бонус: …)" line).
  Also fixed a latent dealer double-charge path (weapon block now guards
  `item.armor === undefined`).
- **Bumped to `?v=13`** across all module imports + `index.html`.

## Verified end-to-end (preview eval + screenshot, no JS errors)

```
fresh game: title→intro→class screen renders 4 classes + blurbs (screenshot) ✓
  pick Вор (3), name "Хитрюга", Enter → play; save klass=vor nick=Хитрюга ✓
  s → "Ты, Хитрюга (Вор)" + "Класс: Вор (бонус: Воровство, Барыги)" ✓
  w (Math.random=0) → "обчистил чей-то карман: +2р" (20→23р) ✓
  bmar → "Барыги — свои люди. Тебе скидка"; prices 15→12 25→19 40→30 70→53
         20→15 30→23; buy Кастет → "-12р. (по знакомству)", 26→14р ✓
seed klass=otmorozok hp=5 → w → "Царапины затягиваются сами собой. HP: 7/25" ✓
```
Test saves cleared from localStorage afterward.

## What's next

1. **Притон mechanics** (EXE @ 0x6377..0x6407): p/r/hp/a/d sub-commands +
   понтовость meter that gates `v` (call-backup) success. The Гопник class
   bonus already keys off `pr` — deepen it here.
2. **Самопальный пистолет + бандитские районы** (EXE @ 0x6023 / 0x6143):
   `f` ranged attack usable only where "менты не накроют"; ment encounters
   (EXE @ 0x5747 — затемнённые очки to dodge).
3. **Per-district training caps** (EXE @ 0x6647: "Ты максимально прокачал пресс
   для своего уровня! Качай дальше в следующем районе").
4. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
5. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 10 — per-district location re-discovery

## What changed

- **Locations must be re-discovered in every district** (`src/states/play.js`,
  EXE @ 0x4331: "Придя в новый район, ты должен находить все эти места снова").
  New `LOCATIONS` table (mar/bmar/rep/girl/pr/kl/trn) with verbatim discovery
  and locked lines where the EXE had them ("Ты нашел базар" @ 0x9D85, club/gym
  ads @ same frag, "Ты спросил у прохожего где больница" @ 0x9EED, "Ты пока что
  неузнал где в этом районе клуб" @ 0x198B, "...качалка" @ 0x19F7); the rest in
  the same voice.
- **New STATE field `found`** — a `{key:true}` map of locations discovered in
  the *current* district. Entering an undiscovered location is blocked with the
  locked line + a "шатайся (w)" hint (`blockedLocation()` guards every location
  command). Wandering (`w`) reveals one random undiscovered location ~45% of the
  time (`discoverOne()`).
- **Re-locked on district advance** — `enemyDead()` clears `STATE.found = {}`
  when you move to the next district; the arrival narrative now adds "Все
  местные точки придётся искать заново" + a "ещё не разведано: N" counter
  (also shown on normal entry while anything is unfound).
- **`s` lists known / not-yet-found locations.** `help` gained a one-line note
  about the mechanic.
- **Save migration**: pre-discovery saves (no `found` key) unlock everything so
  returning players aren't suddenly locked out; `reset`/new game start with
  nothing found (faithful). `LOCATIONS` data was hoisted above `loadState` to
  avoid a TDZ `ReferenceError` during migration. `resetState` now allocates a
  fresh `found`/`junk` (the `DEFAULT_STATE` copies are shared references).
- **Bumped to `?v=12`** across all module imports + `index.html`.

## Verified end-to-end (preview eval, no JS errors)

```
fresh game (localStorage cleared):
  mar → "Ты незнаешь, пока ешё, где находится базар..." (blocked) ✓
  w ×N (clearing enemies) → all 7 locations discovered (found map full) ✓
  mar → Рынок menu opens; s → "Известные места: mar bmar rep girl pr kl trn" ✓
Ельцовка boss kill → advance to ОбьГЭС:
  found reset to []; arrival "Все местные точки придётся искать заново",
  "Ещё не разведано мест: 7"; trn → "Ты пока незнаешь где ... качалка" ✓
old save (no `found` key) → load → all 7 auto-unlocked; mar opens ✓
```
Test saves cleared from localStorage afterward.

## What's next

1. **Character class bonuses** (EXE @ 0x4649: Пацан/Отморозок/Гопник/Вор) —
   wire the difficulty/class menu to real starting bonuses (Гёлфренд+Клуб /
   самолечение / Притон / Воровство+Барыги).
2. **Притон mechanics** (EXE @ 0x6377..0x6407): p/r/hp/a/d sub-commands +
   понтовость meter that gates `v` (call-backup) success.
3. **Самопальный пистолет + бандитские районы** (EXE @ 0x6023 / 0x6143):
   `f` ranged attack usable only where "менты не накроют"; ment encounters
   (EXE @ 0x5747 — затемнённые очки to dodge).
4. **Per-district training caps** (EXE @ 0x6647: "Ты максимально прокачал пресс
   для своего уровня! Качай дальше в следующем районе").
5. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
6. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 9 — district progression + rep-based rank ladder

## What changed

- **Three-district progression** (`src/states/play.js`, EXE @ 0x8143 / 0x9c40,
  travel strings @ frag 0x125x): **Ельцовка → ОбьГЭС → Шлюз**. New `DISTRICTS`
  table: each has an arrival narrative (verbatim travel lines — "На маршрутке
  ты доехал до ОбьГЭСа...", "Ты сел на автобус и попёрся на шлюз..."), an
  `enemyBonus` that scales wandering encounters (+0/+3/+6 levels), and a
  district boss.
- **New STATE fields** `district` (0..2) and `district_kills`. Old saves
  migrate (default to Ельцовка / 0 kills). The district boss now appears once
  you've cleared **5 locals** in the current district (40%/wander) — replaces
  the old `rep >= 5` global gate. `w` shows a "до главного отморозка: ещё N"
  countdown.
- **Per-district bosses** (`isBoss`, replaces `isRector`):
  - Ельцовка: **Ректор** (HP 50) — the comedic Проректор-СУНЦа fake (`fake`).
  - ОбьГЭС: **главный отморозок ОбьГЭСа** (HP 90) — mid-district (`district`).
  - Шлюз: **Ректор НГУ** (HP 140, `isFinal`) — the real final boss (`final`).
- **Boss death now branches** (`enemyDead`): non-final boss → advance district
  (`district++`, kills reset, arrival narrated on re-entry) and hand off to a
  transition screen; final boss → true ending. `rector_done` now means the
  *final* boss is down. The Ельцовка win still awards `VICTORY_RANK`
  (Проректор СУНЦа); the final win awards `FINAL_RANK` ("Пацан, который всех
  опрокинул", EXE @ 0x158F3).
- **`victory.js` parametrised** into three page-sets via
  `armVictory(nick, kind, nextDistrictName)`:
  - `fake` → the 3-page Проректор-СУНЦа twist, then back to `play` (next dist).
  - `district` → 1-page "район зачищен, отправляйся в следующий", → `play`.
  - `final` → 2-page "НАСТОЯЩАЯ ПОБЕДА" / Ректор НГУ, → `title`.
  Footer shows "Enter → едем в <район>" on the last non-final page.
- **Rep-based rank ladder** (`src/states/ranks.js`, EXE @ 0x12FA3..0x157F2):
  37 verbatim ranks "Полное ЧМО" → "Самый Крутой Реальный Пацан".
  `rankForRep(rep)` clamps to the top rung. `s` now shows
  "Погоняло: <awarded rank || rankForRep(rep)>" and a "Район: X (n/3)" line;
  the header bar shows the live district name.
- **Bumped to `?v=11`** across all module imports + `index.html`.

## Verified end-to-end (preview eval + dumps, no JS errors)

```
Ельцовка near-boss save → w until [ БОСС Ректор HP 50/50 ]; k×… →
  current flips to 'victory' → page 1/3 "Ты замочил самого ректора!!!" →
  Enter×3 → back to 'play', header "ОбьГЭС", arrival "На маршрутке…",
  district=1, rank="Пацан, который завалил Проректора СУНЦа" ✓
Шлюз near-boss save (rep 20) →
  s → "Район: Шлюз (3/3)" + "Погоняло: Понтовый Пацан" (rep-ladder) ✓
  w until [ БОСС Ректор НГУ HP 140/140 ]; k×… → 'victory' →
  "НАСТОЯЩАЯ ПОБЕДА" → Enter → 'title';
  rector_done=true, rank="Пацан, который всех опрокинул" ✓
```
Test saves cleared from localStorage afterward.

## What's next

1. **Per-district location re-discovery** (EXE @ 0x4331 / 0x6539 / 0x6647:
   "Придя в новый район, ты должен находить все эти места снова"): lock
   mar/bmar/trn/kl/pr until found via `w` in each new district; per-district
   training caps ("Ты максимально прокачал пресс для своего уровня").
2. **Character class bonuses** (EXE @ 0x4649: Пацан/Отморозок/Гопник/Вор) —
   wire the difficulty/class menu to real starting bonuses.
3. **Притон mechanics** (EXE @ 0x6377..0x6407): p/r/hp/a/d sub-commands,
   понтовость meter that gates `v` (call-backup) success.
4. **Самопальный пистолет + бандитские районы** (EXE @ 0x6023 / 0x6143):
   `f` ranged attack usable only where "менты не накроют".
5. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
6. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 8 — sell items (барахолка): wes / x + junk inventory

## What changed

- **Junk inventory** (`STATE.junk: [{name,dmg,price}]`): looted/replaced gear
  is no longer silently discarded. `stashOldWeapon()` moves the previously
  equipped weapon to junk whenever a better one is equipped (combat loot or
  dealer purchase); `addJunk()` keeps a weaker looted weapon instead of
  dropping it. Only items with resale value (`WEAPON_VALUE`) are kept.
- **`wes` command — барахолка** (EXE @ 0xB00D / 0xB01D..0xB14A): new
  `shop_sell` mode. Lists junk numbered with a half-of-dealer-price tag,
  sell one at a time ("Ты продал кастет за #р"), re-lists remaining after
  each sale, `0`/Esc to leave. Prices: кастет 7, дубинка 12, ножик 20,
  тесак 35, бутсы 10 (= floor(buy/2)).
- **`x` command — спихнуть хлам** (EXE @ 0xAF9F): dumps the whole junk pile
  for a lump sum ("Барыги дали тебе денег за хлам. +#р (N шт)").
- **`s` shows junk** in red ("Хлам (продай wes/x): …") matching the EXE's
  "Выделеные красным в твоей статистике" (EXE @ 0x76DF).
- **Dealer screen hint** now mentions `x` and `wes` (EXE @ 0xAA25).
- Shop-mode dispatch generalised to `mode.startsWith('shop')` so `shop_sell`
  reuses the existing `#>` digit prompt / footer.
- Old saves migrate (junk defaults to `[]`).
- **Bumped to `?v=10`** across all module imports.

## Verified end-to-end (preview eval + screenshots)

```
load (тесак, junk=[кастет,дубинка,ножик], 20р)
  s   → "Хлам (продай wes/x): кастет, дубинка, ножик" (red) ✓
  wes → == Барахолка == кастет 7р / дубинка 12р / ножик 20р
  1   → "Ты продал кастет за 7р. Деньги: 27р"; menu relists дубинка/ножик ✓
  0   → "Ушёл от барыг."
  x   → "Барыги дали тебе денег за хлам. +32р (2 шт). Деньги: 59р" ✓
  s   → no junk line; деньги 59р ✓
load (кастет+2, 200р); bmar; 2 (buy Дубинка) → old кастет stashed to junk;
  s → "Оружие: Дубинка (урон+4)" + "Хлам: кастет", 175р ✓
```
Test save cleared afterward; no JS errors.

## What's next

1. **District progression** — Ельцовка → ОбьГЭС → Шлюз (EXE @ 0x8143 /
   0x9c40), real Ректор НГУ as final boss (enemy name @ 0x12ddf). Victory
   p3 already teases it.
2. **Rank ladder** — EXE @ 0x144f3..0x157f2 rep-based rank progression;
   show current rank in `s`/header.
3. **Richer wandering events** — magic-man (Рушель Блаво @ 0x8CBA),
   pickpocket at market, phone-call hooks (EXE @ 0x9d7e / 0x9e66).
4. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
5. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 7 — victory end-game state (Проректор СУНЦа twist)

## What changed

- **New `victory` state** (`src/states/victory.js`): a proper end-game screen
  reached when the boss dies. 3 pages, verbatim EXE text:
  - p1 (EXE @ 0x5128): "Ты замочил самого ректора!!! ТЫ САМЫЙ КРУТОЙ!!! /
    Вновь сила торжествует над интелектом. / После этого сразу началась
    анархия и полный беспредел."
  - p2 — the comedic twist (EXE @ 0x51E6 / 0x5236): "о чёрт! да это ж не
    ректор был. / Это был проректор СУНЦа!"
  - p3 — new rank (EXE @ 0x157F2) "Пацан, который завалил Проректора СУНЦа"
    + tease of the next district / real Ректор НГУ (EXE @ 0x9B7F / 0x8143).
  - `armVictory(nick)` setter personalises the screen; Enter/Esc → title.
- **`play.js` hand-off**: killing the Rector no longer prints win text inline.
  `enemyDead()` now sets `STATE.rector_done`, awards `STATE.rank = VICTORY_RANK`,
  pockets the cash drop, calls `armVictory`, and arms `pendingState='victory'`.
  `update()` returns that state on the same tick the boss dies.
- **New `STATE.rank` field** (default null), surfaced in the `s` command as
  "Погоняло: …". Old saves migrate (merge over DEFAULT_STATE).
- **Bumped to `?v=9`** across all module imports.

## Verified end-to-end (preview eval)

```
victory state: all 3 pages dump verbatim text; final Enter → 'title' ✓
play → victory: injected boss-ready save via `load`, wandered until
  [ БОСС Ректор HP 50/50 ], single `k` → current flips to 'victory',
  localStorage rank = "Пацан, который завалил Проректора СУНЦа",
  rector_done = true ✓
screenshot: victory page 1/3 renders in CRT theme ✓
```
Test save cleared from localStorage afterward; no JS errors.

## What's next

1. **Sell items** (`bmar` sell mode — EXE @ 0xB00D / 0xAFDB): offload looted
   weapons for half price.
2. **District progression** — the EXE has Ельцовка → ОбьГЭС → Шлюз
   (EXE @ 0x8143 / 0x9c40) with the real Ректор НГУ as the final boss
   (enemy name @ 0x12ddf). Victory p3 already teases it; wire `w`/reset to
   advance districts and scale gopota.
3. **Rank ladder** — EXE @ 0x144f3..0x157f2 lists a rep-based rank
   progression (Пацан покруче → … → Самый Крутой Реальный Пацан). Show the
   current rank in `s`/header based on rep.
4. **Real .sav format reversal** — drive dosbox-x, capture places.sav.
5. **CP866 bitmap font** — pixel-perfect glyphs.

---

# Session 6 — market, dealer, gym stat choice, Rector boss

## What changed

- **Market (`mar`) — numbered shop** (EXE @ 0xA4AD / 0xA4CF): opens a `#>` prompt, player picks 1-N to buy or 0 to leave. Items: Хотдог (HP+4, 8р), Пиво (HP+3+drunk, 5р), Косяк (High+3, 10р).
- **Dealer (`bmar`) — weapons + gear** (EXE @ 0xAB89 / 0xBCD6): same numbered shop. Items: Кастет(+2,15р), Дубинка(+4,25р), Ножик(+6,40р), Тесак(+9,70р), Понтовые бутсы(+2,20р), Зубная защита боксёров(броня+2, −75% перелом, 30р). Weapon purchase only accepted if it improves on current weapon.
- **Gym (`trn`) — choose which stat to train** (EXE @ 0x7241 / 0x72BA): Сила(3р), Ловкость(4р), Живучесть(5р), Удача(5р). Each immediately updates STATE and recalculates max_hp.
- **Shop mode (`mode = 'shop_*'`)**: all three shops reuse a `#>` digit prompt with Esc to cancel. Inputs outside valid range are rejected gracefully.
- **Rector boss** (EXE @ 0x464A / 0x5128): spawns via `w` when `STATE.rep >= 5` (30% per wander). Stats: HP 50, Сила 12, Ловкость 7, level 5. Intro text verbatim from EXE: "Тут заходит настоящий ректор. / Мудак! ты тупой дебил, думал что я идиот? / Ну тада сдохни!" Win text: "Ты замочил самого ректора!!! ТЫ САМЫЙ КРУТОЙ!!!". Death text from EXE @ 0x505A. Sets `STATE.rector_done` on win.
- **Зубная защита боксёров**: reduces jaw-break chance by 75% (3-in-4 block chance in `playerDead`/combat).
- **Bumped to `?v=8`** across all module imports.
- **Save key migrated** to `gopnik.state.v3`; old v1/v2 saves load gracefully.

## Verified end-to-end

```
\> reset; mar → == Рынок ==; 1 → Купил Хотдог -8р ✓
bmar → == Барыги ==; 2 (Дубинка 25р, but only 12р) → Надо 25р, есть 12р ✓
trn → == Качалка ==; 2 → Ловкость +1 (Лов 6), Ур 2-5 ✓
[rep=6 injected] w (repeat) → [ БОСС Ректор  HP 50/50 ]
  "Тут заходит настоящий ректор." / "Мудак! ты тупой дебил..." ✓
```

## What's next

1. **Victory screen** — when Rector is killed, transition to a proper end-game state with the EXE win text.
2. **Sell items** (`bmar` sell mode — EXE @ 0xB00D / 0xAFDB): offload looted weapons for half price.
3. **Real .sav format reversal** — drive dosbox-x, capture `places.sav` / `save_r0.sav`.
4. **CP866 bitmap font** — pixel-perfect glyph rendering for all Cyrillic.
5. **Wandering events richer** — the magic-man encounter (EXE @ 0x8CBA: Рушель Блаво, save for # руб), pickpocket at market (luck-based).

---

# Session 5 — proper fight loop + encounter system

## What changed

- **Back-and-forth fight loop** (`src/states/play.js`). Each `k` command now runs one full combat round: player hits (with accuracy %), then enemy hits back. Continues until one side reaches 0 HP.
- **Real combat formulas from EXE** (@ 0x735A / 0x7241 / 0x72F9):
  - Точность = min(95, 20 + Ловкость × 5) % hit chance
  - Урон игрока = (Сила/2)..(Сила) + weapon_dmg
  - Урон врага = (Сила/2)..(Сила), reduced by player Броня
  - Ловкость > 90% → double-hit trigger
- **Critical hits and special events** (strings from EXE @ 0x4A55 / 0x4A7C / 0x4B96):
  - Двойной урон!!! (10% chance)
  - Точный удар!!! (rolling message)
  - Jaw/leg breaks (rare, high-damage threshold)
  - Crowd commentary (EXE @ 0x4823): "Зрители: Чё-тут за батва?" etc.
- **Enemy spawn system**: `w` (wander) has ~60% chance to produce a random enemy (7 name variants, level-scaled stats). `sv` shows enemy HP/damage/accuracy. `k` fights. `v` (call backup) has 50% chance to deal 3 bonus damage.
- **XP and item drops on win** (EXE @ 0x5251 / 0x547F):
  - XP = level×5 + roll(5); shown with "качки опыта"
  - Random cash drop from enemy
  - Weapon drops: кастет(+2), дубинка(+4), ножик(+6) — only equip if better than current
- **Extended STATE**: added `vitality`, `luck`, `exp`, `weapon_name`, `weapon_dmg`. HP formula fixed to `10 + Живучесть*5 + Сила` (EXE @ 0x72F9). Migrates old v1 saves gracefully.
- **Richer `s` command**: shows damage range, accuracy %, double-hit flag, weapon, exp, rep.
- **Encounter indicator** in header row 1: `[ враг: бухой мудак  HP 10/13 ]` when fight is active.
- **Bumped to `?v=7`** across all module imports.

## Verified end-to-end (via preview eval)

```
\> reset      → Полный сброс
\> w          → Ты встретил: бухой мудак (уровень 1).
\> sv         → Здоровье 13/13  Урон 2-4  Точность 40%
\> k          → Ты пнул бухой мудак на 3з. У него осталось 10
              → бухой мудак: Получи гнида!! / Враг промазал.
[... more k ...] → бухой мудак сдох.
              → За отпин врага ты получаешь N качков опыта.
              → Ты нашарил у него 3р.
\> k          → Чё машешь копытами? Ищи мудака которого будешь пинать!
```
HP, money, rep, exp all updated correctly. No JS errors.

## What's next

1. **Market / dealers** (`mar`, `bmar`) — buy/sell items using money + item inventory list.
2. **Real .sav format reversal** — drive dosbox-x, capture `places.sav` / `save_r0.sav`.
3. **Dexterity/Vitality/Luck training** — gym should allow choosing which stat to train.
4. **Boss encounter (Ректор)** — special fight at end of progression.
5. **CP866 bitmap font** — pixel-perfect glyph rendering.

---

# Session 4 — persistence + real `name` input

## What changed

- **`localStorage` persistence** for player state. `STATE` is now loaded from `gopnik.state.v1` at module init and re-persisted on every state-changing command (`trn`, `rep`, `k`, `kos`, `h`, `mh`, `name`), on explicit `save`/`load`, and on every exit (Esc / `e` / `exit`). Survives full page reloads — verified: typed `name → Хитрый Лис`, reloaded, typed `s`, output shows `Ты, Хитрый Лис`.
- **Real `name` prompt** — the REPL now has two input modes: `cmd` and `name`. After typing `name`, the prompt label switches to `имя>` and the input accepts any printable Unicode (including Cyrillic) up to 16 chars. Enter applies the nickname and persists.
- **New commands**: `save` (manual persist), `load` (revert to last persisted), `reset` (wipe to defaults).
- **Bumped to `?v=6`** across all module imports.

## Verified end-to-end

```
\> s              → Ты, Сабж + stats
\> name           → Сменить погоняло. Введи новое и нажми Enter.
имя> Хитрый Лис   (Cyrillic input accepted)
                  → Теперь тебя зовут "Хитрый Лис".
\> s              → Ты, Хитрый Лис + stats
\> save           → Сохранено локально (localStorage).
[full page reload]
\> s              → Ты, Хитрый Лис + stats   ← persisted ✓
```

`localStorage["gopnik.state.v1"]` contains the full JSON-serialized STATE with Cyrillic nicknames intact.

## What's next

1. **Real .sav format reversal** — drive dosbox-x through to a save point (next step blocked on stable keystroke delivery; in the meantime, the JSON STATE in localStorage works as a placeholder save).
2. **Place-specific encounters** — hook the location descriptions from EXE @ 0x76DF more thoroughly into `w`, `pr`, `kl`.
3. **Fight loop** — `k` currently rolls a single hit; the original has a back-and-forth combat with enemies that have their own stats.
4. **CP866 bitmap font** for full pixel-fidelity rendering of all glyphs.

---

# Session 3 — bitmap renderer + expanded REPL

## What changed

- **`src/render.js` — bitmap box-drawing.** Replaced VT323's spotty CP437 coverage with primitive rectangles for single-line (`─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼`), double-line (`═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬`), and block (`█ ▀ ▄ ▌ ▐`) characters. Falls back to canvas `fillText` for everything else (Cyrillic, ASCII). Title now shows Cyrillic **ГОПНИК** with proper horizontals — verified visually.
- **`^0` semantics fix.** Compared against the live DOSBox-X capture: `^0` in this game means "reset to default" (color 7 light gray), not literal color 0 (black). The renderer now treats `^0` and any caller-provided `fg=0` as 7.
- **`src/states/play.js` — full command set.** Replaced the 13-command placeholder with the actual 17 commands extracted verbatim from EXE @ 0xBFDF: `w mar bmar rep girl pr kl trn s sv k v kos h mh name e`. Each command has a stub body (some with real mechanics: `rep` consumes 5р and restores HP, `trn` consumes 3р and bumps Сила, `k` rolls accuracy using the formula from frag @ 0x735A, `kos`/`h`/`mh` bump high/drunk meters, `s` prints the stats line). Status bar with HP/Сила/Лов/Деньги now visible on the top header.
- **ES module cache busting.** Added `?v=N` query suffixes to all imports across all modules (and `index.html`'s `<script type="module">`) so browser cache refreshes when modules are edited. Bumped to `?v=5`.

## Files touched

- `src/render.js` — bitmap box-drawing + `^0`-as-default fix.
- `src/states/play.js` — full command list + per-command stub logic.
- `src/main.js`, `index.html`, all five `src/states/*.js` — `?v=5` query suffix on imports.

## Verified

- Direct render eval: `writeAt(buf, 0, 0, 'X', 0, 0)` now produces `cell.fg = 7`.
- Title state draws all 8 art rows with horizontals visible; Cyrillic letters Г О П Н И К all recognisable in the canvas screenshot.
- Play state has 17 commands; `help` prints the full list with Russian descriptions.

## What's next

1. **Save format**: drive dosbox-x through to a save point, capture `places.sav` / `save_r0.sav`, diff and document the layout.
2. **More content per command**: hook the place descriptions from EXE @ 0x76DF into `w`/`pr`/`kl`/`trn`, the dealer pricing into `bmar`, the dice from `kos` (probably matches the EXE's RNG section).
3. **Real input prompt for `name`**: read a string with backspace + Enter (already supported by the input handler; just wire it).
4. **Persist player state via localStorage**.
5. **Bitmap fidelity**: once a CP866 8x16 BIOS font is embedded, swap fillText to bitmap draws for ALL chars — pixel-perfect text mode.

---

# Session 2 — ground truth in DOSBox-X + state-flow build-out

## What was confirmed live in dosbox-x

Launched `GOPNIK.EXE` in `/Applications/dosbox-x.app` with auto-mount
(`-fastlaunch -nomenu -c "mount c ." -c "c:" -c "gopnik.exe"`). Walked
through the opening sequence and verified:

- **Title screen**: the box-drawing letters are **Cyrillic ГОПНИК** (Г-О-П-Н-И-К), not Latin. Each row drawn in its own color (rainbow). The lines `Версия 1.025`, `Нажми какую-нибудь кнопку` and `2003 year, June,Sept by V.P.` appear below. (My web-port title used the same source bytes — so it's correct; the apparent "Latin" look in earlier screenshots is just VT323 rendering thin verticals where horizontals should be.)
- **Name/year prompt** follows the title.
- **Intro narrative** matches fragment @ 0x81B1 verbatim: "Ты приехал в Ельцовку…".
- **Dialog with Ректор (Dean)** matches fragment @ 0x7E4E ("Ты отчислен мудак!!!").
- **Rules screen** in green ("А теперь правила:") followed by white explanation including the hint `Введи 'help' если не помнишь чё за буквы`.
- **Difficulty menu**: five options (0-4) — labels visible but garbled in dosbox-x's default CP437 font.
- **REPL prompt** `\>` waiting for typed commands; `help` shows the full command list.

## What was added to the port

- `src/states/intro.js` — three-page intro that mirrors the narrative + Dean dialog + rules screens.
- `src/states/difficulty.js` — 5-option vertical menu (Up/Down + 0-4 to select, Enter to begin).
- `src/states/play.js` — the actual REPL. Builds a scrolling log above a `\> _` prompt. `help` prints the full Russian command list. Stubs for `w`, `mar`, `rep`, etc.
- `src/main.js` — boot → title → intro → difficulty → play wired up. Verified via state-machine eval: `title → intro → intro → intro → difficulty → play → play` on successive Enters.

## Tooling / static analysis added

- `tools/segments.py` — relocation-table analysis. Identified 5 segments: 4 code (0x0EE5, 0x0EED, 0x0F16, 0x0F78) + 1 DGROUP (0x10AE). Confirmed Borland LARGE memory model.
- `tools/disasm.py` — Capstone-driven recursive disassembly from the entry point following CALL/Jcc; emits `notes/disasm.txt`, `notes/functions.txt`, `notes/xrefs_data.txt`.
- `tools/extract_screens.py` — re-extracted using **CP866** (Russian DOS codepage) instead of Latin-1, yielding 1,930 readable fragments.
- `tools/find_decoder.py`, `tools/find_video_access.py` — pattern hunters for the ^N decoder and the conio video output routine.
- `tools/ghidra_dump.py` — headless Ghidra post-script (Jython style). Currently blocked by Ghidra 12.1 requiring PyGhidra; works if PyGhidra is installed, otherwise the interactive UI is the alternative.

## Status snapshot

- Tools installed: Ghidra 12.1, dosbox-x (cask), OpenJDK 21, Capstone (Python venv at `.venv/`).
- Browser preview at `http://localhost:8000` shows: boot console → title (Cyrillic ГОПНИК) → 3-page intro → difficulty selection → REPL.

## What's next

1. Save game format reversal — open `places.sav` / `save_r0.sav` from dosbox-x runs.
2. Build real `w`, `fight`, `kos`, `trn`, `mar`, `bmar`, `girl`, `wes` states from the catalogued fragments.
3. Improve box-drawing rendering — switch from VT323 to a CP866-pixel bitmap font so the title art shows the actual Cyrillic letters cleanly.
4. Implement the original `^N` color escape parser semantics once the decoder routine is identified in Ghidra.

---

# Session 1 — initial RE + web port skeleton

## Status

**Page is up.** `python3 -m http.server 8000` from this folder, open
`http://localhost:8000` — you'll see the CRT-themed boot console
auto-advance to the reconstructed title screen, then **Enter** to a
placeholder main menu showing the inventory tokens we've already pulled
from the binary.

## What was done

### Static analysis (no Ghidra needed)

- Confirmed toolchain: **Borland C++ 3.1** (1983,92 copyright marker).
- Confirmed text-mode game: 37× INT 21h, 4× INT 16h, **1× INT 10h** (a
  single `puttext()`-style call), **0× INT 33h** (no mouse).
- No direct B800h immediate writes → game uses Borland `conio.h`
  library, which is the clean public API we'll reproduce in JS.
- 124 screen fragments with `^N` color escapes pulled out into
  `assets/screens_raw.json`. They cluster into ~11 candidate screens.
- Identified content tokens (gopnik street-life sim): `mar`, `bmar`,
  `wes`, `rep`, `kos`, `trn`, `girl`, `fight`, `Abibas(+1)`.
- Full findings: [findings.md](findings.md).

### Tools installed

- **Ghidra 12.1** (via brew, `/opt/homebrew/Cellar/ghidra/12.1`,
  uses OpenJDK 21). Headless project at `ghidra_proj/` already
  analyzed — open in `ghidraRun` to continue Phase 1.
- **dosbox-x.app** (via brew cask, `/Applications/dosbox-x.app`) —
  for live verification against the original.

### Web port skeleton (`http://localhost:8000`)

| File | Purpose |
|------|---------|
| `index.html` | Retro CRT page chrome |
| `styles.css` | Bezel + scanlines + green-phosphor glow |
| `src/render.js` | 80×25 text-mode renderer, CGA 16-color palette, `^N` parser |
| `src/input.js` | Keyboard + touch input queue (DOS INT 16h-style) |
| `src/rng.js` | Borland 3.1 LCG `rand()` (seed × 0x015A4E35 + 1) |
| `src/main.js` | State machine + boot/title/menu wiring |
| `src/states/title.js` | Reconstructed title screen (8-frame arrow) |
| `src/states/menu.js` | Placeholder main menu, shows recovered tokens |

### Tools (Python static-analysis scripts)

- `tools/header_dump.py` — MZ header parser, dumps entry, relocations,
  memory request, alignment.
- `tools/find_int_sites.py` — locates all INT 10h/16h/21h/33h calls
  with surrounding context and guesses AH/AX from the nearest immediate
  load.
- `tools/find_video_access.py` — looks for VRAM access / Borland
  toolchain signatures.
- `tools/strings_dump.py` → `assets/strings_raw.json` (547 strings).
- `tools/extract_screens.py` → `assets/screens_raw.json`
  (124 fragments grouped into 11 candidate screens).

## What's next (resumable from `notes/`)

1. **Phase 1 — interactive Ghidra**: open `ghidra_proj/` in `ghidraRun`,
   label `main()`, the main loop, the `^N` decoder, gotoxy/cputs sites,
   and file I/O. Write up in `notes/STATES.md` and `notes/LOGIC.md`.
2. **Phase 1b — dosbox-x ground truth**: open
   `/Applications/dosbox-x.app`, `mount c <gopnik-folder>`, run
   `GOPNIK.EXE`. Use the debugger to dump B800 at known states for
   visual comparison; save the game at known states for save-format
   diffing.
3. **Phase 2 — curated `assets/screens.json`**: map each fragment to a
   screen ID, x/y position, and color attribute. Cross-reference with
   Ghidra labels.
4. **Phase 3 — real state modules**: replace the placeholder
   `title.js`/`menu.js` with full reproductions, add the dozen+ other
   states.
5. **Phase 3 — save/load**: read original `.sav` format directly so
   saves are interchangeable with the DOS version.

The plan file is at `/Users/antonkarliner/.claude/plans/i-need-to-convert-functional-owl.md`.
