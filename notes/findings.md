# GOPNIK.EXE — RE findings

Updated through Phase 1 (initial state-machine mapping).

## Binary identification

- **Toolchain**: Borland C++ 3.1 (`"Portions Copyright (c) 1983,92 Borland"` at 0x1129C). Compiled with the LARGE memory model (many far calls via `lcall seg:off`).
- **Format**: plain MZ, **not packed**.
- **Sizes**: 88,656-byte file = 6,352-byte header (0x18D0) + 82,304-byte load image.
- **Entry**: CS:IP = 0:0xAB59, file offset 0xC429 = 50217.
- **Relocations**: 1,580.
- **Memory request**: min 19 KB, max 657 KB heap.

## Codepage & language

- **Game language: Russian**, encoded in **codepage 866** (Russian DOS).
- Originally we read the strings as Latin-1 / CP437 and got gibberish; CP866 decoding reveals a fully-formed Russian street-life RPG with rich dialog, formulas, and place descriptions.

## Genre and structure (recovered from strings)

The game is a **text-command-driven RPG**: the player types commands at a prompt to choose actions. Story setup (from fragment @ 0x81B1):

> "Ты приехал в Ельцовку. Отовсюду доносятся крики запинываемых. Пора наконец отомстить ректору. Доказать свою крутизну ты можешь, окоротив главного отморозка района."

*(You arrived at Yeltsovka. Cries of beaten people from everywhere. Time to take revenge on the dean. Prove your toughness by taking down the area's main thug.)*

Stats and formulas — see the fully recovered model below.

## Commands & locations (fragment @ 0xBFDF)

| Cmd | Russian description | Translation |
|------|--------------------|-------------|
| `w`     | шататься по окрестностям — искать на свою жопу приключения | wander, find trouble |
| `mar`   | идти на рынок | go to market |
| `bmar`  | идти на большой рынок (Барыги) | go to big market (Dealers) |
| `wes`   | веселье — сходить в клуб | fun — go to club |
| `rep`   | репутация | reputation / stats |
| `kos`   | кости / казино | dice / casino |
| `trn`   | тренировка / качалка | training / gym |
| `girl`  | к подруге | visit girlfriend |
| `fight` | провоцировать драку | provoke a fight |
| `save`  | сохранить игру | save game |
| `load`  | загрузить игру | load game |

Locations: **Качалка** (Gym), **Барыги** (Dealers), **Рынок** (Market), **Клуб** (Club), **Подруга** (Girlfriend), **Бог** (God — random encounter), **Ректор** (Dean — boss), **Ельцовка** (Yeltsovka — town).

Inventory items: **Abibas(+1)** (counterfeit Adidas tracksuit — canonical gopnik attire).

## Segment / memory layout

| Seg (paragraphs) | File offset | Role | Refs |
|------------------|-------------|------|------|
| 0x0000 | 0x001880 | Code segment 0 (entry + screen-art data) | (load segment) |
| 0x0EE5 | 0x010720 | Code (Borland runtime support) | 2 |
| 0x0EED | 0x0107A0 | Code (Borland C startup) | 683 |
| 0x0F16 | 0x010A30 | Code (Borland runtime) | 75 |
| 0x0F78 | 0x011050 | Code (Borland runtime) | 817 |
| 0x10AE | 0x0123B0 | **DGROUP / data segment** (lookup tables, globals) | 3 |

Segment 0 contains both the entry code AND the ~10 KB of ASCII-art / dialog text at offsets 0x0000–0xAB59 (image). Strings are accessed via `mov dx, imm; push ds; ...` patterns — same-segment loads.

## Entry point disassembly

```
0x00AB59: lcall 0xF78:0x0000   ; Borland C startup #1
0x00AB5E: lcall 0xF16:0x000D   ; init exceptions
0x00AB63: push  bp
0x00AB64: mov   bp, sp
0x00AB66: mov   ax, 0x0200
0x00AB69: lcall 0xF78:0x02CD   ; alloc 512-byte local stack
0x00AB6E: sub   sp, 0x0200
0x00AB72: call  0x6A0D         ; user main()
```

Variables seen in the first 200 bytes:

| Address | Width | Likely role |
|---------|-------|-------------|
| `[0x3692]` | byte | Save-slot count (bounded `<= 5`) |
| `[0x3694]` | byte | (cleared on entry) |
| `[0x3698]` | byte | (cleared on entry) |
| `[0x3699]` | byte | (cleared, conditional on `[0x389C] != 3`) |
| `[0x369A]` | byte | (cleared on entry) |
| `[0x389C]` | word | Game phase / state (compared to 3) |
| `[0x38A6]` | word | Threshold compared to `[0x3692] * 10` |

The user `main()` is at image 0x6A0D (file 0x82DD). Its 484-byte body and call graph are in `disasm.txt`.

## Runtime profile

| Interrupt | Count | Role |
|-----------|-------|------|
| INT 21h | 37 | DOS file/services |
| INT 16h | 4 | BIOS keyboard (`getch`/`kbhit`) |
| INT 10h | 1 | Single thin `int86()` wrapper at 0x011044 |
| INT 33h | 0 | No mouse |

The single INT 10h is the generic BIOS wrapper — callers set AX before `call` to it. Used for `gotoxy`, `clrscr`, video mode set (probably one-time at startup), etc. — all part of Borland `conio`.

## Color escape encoding

Strings embed `^N` color codes. `N` is usually a hex digit `0`-`F`, but the
original DOS data **also** uses non-hex "special" selectors: `^<`, `^,`, `^/`,
`^!`, `^?`, `^=`, `^)`, `^"`, `^&`. (NB: the once-suspected `^#` is a false
lead — `#` only ever appears as the *token* after a selector, e.g. `^/#` / `^?#`,
where it is a runtime price placeholder, not an escape char.)

**Resolved (Session 25) — the decoder is a single arithmetic rule, not two
features.** The selector char is converted to a color as the low nibble of
`(char - '0')`:

```
color = (charCode(N) - 0x30) & 0x0F
```

This subsumes everything observed:

| `N` | code | `(code-0x30)&0xF` | color |
|-----|------|-------------------|-------|
| `0`..`9` | 0x30-0x39 | 0..9 | dim CGA 0-9 |
| `:` `;` `<` `=` `>` `?` | 0x3A-0x3F | 10..15 | bright CGA |
| `!` | 0x21 | 1 | blue |
| `"` | 0x22 | 2 | green |
| `&` | 0x26 | 6 | brown |
| `)` | 0x29 | 9 | light blue |
| `,` | 0x2C | 12 | light red |
| `/` | 0x2F | 15 | white |

Evidence: the dealer/gear menu (frags @ 0xA4E2..0xA661) prints each item's
price `#` with a **different** selector per line (`/ ? ) E " &`), i.e. a
per-row rainbow — the same trick the title art (@ 0x18D0) uses with `^0`..`^7`.
The only hypothesis consistent with the hex digits, the `:`..`?` punctuation
*and* this rainbow is the `(char - '0')` arithmetic above. The selectors mark a
bright highlight around interactive values: prices (`^/#` руб), stat-menu
numbers (`^,15`, `^=30`), hotkeys (`^!p`). Low-nibble masked → no blink.

⚠️ One divergence to keep in mind: under the *original* arithmetic, hex letters
`A`-`F` would mean `(0x41..0x46-0x30)&0xF = 1..6`, **not** 10-15. But the web
port's *own* UI strings (play.js etc.) author `^A`-`^F` as 10-15 (the natural
hex reading, DOSBox-verified for `^0`-`^F`). So `src/render.js#writeAt` keeps
the hex path (0-F → palette, `^0`→7) for port strings and applies the
`(char-'0')&0xF` rule **only** to the punctuation selectors (`0x21-0x2F` /
`0x3A-0x3F`), which the port never emits. Net: original-data fragments and
port-authored strings both render correctly.

## Combat & stat model (ground truth, recovered via PyGhidra — Session 26)

Decompiled from `notes/ghidra_decomp.txt`: stat-init in `FUN_1000_6a0d` (user
`main`, @ line 1542), the status screen `FUN_1000_1a03`, the combat core
`FUN_1000_3d11` (@ line ~245), and enemy spawn `FUN_1000_0d14`. `FUN_1f78_114b(n)`
is `rand() % n` (0..n-1). The four player stats live in DGROUP:

| Global | Role | port field |
|--------|------|------------|
| `0x389e` | drives **damage** (and +1 to HP) | `str` |
| `0x38a0` | **dexterity** → accuracy | `dex` |
| `0x38a2` | **×5 HP** multiplier stat | `vitality` |
| `0x38a4` | **luck** → crit chance | `luck` |
| `0x38a8`/`0x38aa` | damage range min/max (= `0x389e`/2, `0x389e`) | — |
| `0x38ac`/`0x38ae` | current / max HP | `hp`/`max_hp` |

(The port labels the ×5-HP stat "vitality" and the damage stat "str"; the EXE may
label them oppositely, but the **mechanics map cleanly by role**, so no behavior
changes from the naming.)

- **Class stat presets** (by class index 0..3, as `0x389e,0x38a0,0x38a2,0x38a4`
  = port `str,dex,vitality,luck`; each a 12-point spread):
  - 0 Пацан: 3,3,3,3 · 1 Отморозок: 5,2,4,1 · 2 Гопник: 4,3,3,2 · 3 Вор: 3,3,2,4
- **Max HP** = `0x38a2×5 + 10 + 0x389e` (= `vitality×5 + 10 + str`).
- **Unarmed damage** = `[0x389e/2 + 1 .. 0x389e]` (weapons extend `0x38a8`/`0x38aa`).
- **Accuracy / hit test**: hit iff `rand(1..100) ≤ (dex+4)×5` **and** `≤ 90`
  (the `0x5a` clamp). Displayed точность = `dex×5 + 20` (the old "`% 7`" in this
  file was a string-fragment misread — there is no modulo).
- **Multi-swing flurry**: a turn swings repeatedly, accuracy `−18` per swing, while
  it stays `> 0` and the enemy is alive (so an extra swing once `(dex+4)×5 > 90`,
  i.e. `dex > 14`).
- **Crit** = `luck×3` % chance; a crit adds +max-damage and may break the target's
  jaw/leg (`0x3966`/`0x3967` flags); enemy armor byte `0x3968` subtracts from damage.
- **Enemy** (`FUN_1000_0d14`): type rolled & capped (≤9, ≤7/8 in some modes), stats
  point-distributed across str/dex/vit/luck by a per-type weight table at
  `[0x3952*4 + 2..5]`; **enemy HP = `vit×5 + str + 10`** (same shape as the player),
  enemy dmg `[str/2 .. str]`.

#### Enemy archetype weight table — TRANSCRIBED (Session 27)

The per-type weight table read in `FUN_1000_0d14` as `[0x3952*4 + 2..5]` lives at
**DGROUP file offset 0x123b2** (DGROUP base `0x123b0` + 2; the first 2 bytes of
DGROUP are padding `00 00`). It is **10 rows × 4 bytes**. The spawn math proves the
column order is **`[str, dex, vit, luck]`** (port roles): the spawn accumulators are
`0x3954/0x3956/0x3958/0x395a` for weights `[0]/[1]/[2]/[3]`, and HP is built as
`0x3958×5 + 0x3954 + 10` (= `vit×5 + str + 10`) with damage range `[0x3954/2 .. 0x3954]`
(= `[str/2 .. str]`). **Rows 3–6 are byte-identical to the player class presets**
(Пацан/Отморозок/Гопник/Вор), confirming the layout:

| T | str | dex | vit | luck | sum | port archetype name |
|---|-----|-----|-----|------|-----|---------------------|
| 0 | 1 | 2 | 1 | 2 |  6 | мелкий шкет |
| 1 | 2 | 2 | 2 | 3 |  9 | борзый пацанчик |
| 2 | 2 | 2 | 2 | 2 |  8 | хмырь в треньке |
| 3 | 3 | 3 | 3 | 3 | 12 | крепкий пацан  *(= Пацан preset)* |
| 4 | 5 | 2 | 4 | 1 | 12 | тупой отморозок  *(= Отморозок preset)* |
| 5 | 4 | 3 | 3 | 2 | 12 | бывалый гопник  *(= Гопник preset)* |
| 6 | 3 | 3 | 2 | 4 | 12 | фартовый ворюга  *(= Вор preset)* |
| 7 | 5 | 3 | 4 | 2 | 14 | здоровенный бугай |
| 8 | 5 | 5 | 5 | 5 | 20 | местный авторитет  *(EXE forces T=8 in mode 2)* |
| 9 | 5 | 6 | 8 | 3 | 22 | отмороженный беспредельщик |

**Type-index roll** (`FUN_1000_0d14`, ported verbatim as `rollArchetypeIndex`): a
uniform `rand(0x33)+1` (1..51) is folded into a low-biased bucket by repeated
triangular subtraction (`T = 10 - k`), then shifted **up** by the район number
(`rand(район_count)`), and clamped to 9. Net effect: large roll → low archetype,
small roll → high archetype; higher районы lean on the tougher rows. Modes:
`param_1==1` caps the index at 7, `param_1==2` forces 8 (the авторитет mini-boss).
Stat points distributed = `sum(weights) + район×2`. Enemy armor byte `0x3968` =
`((район−1)²·2) + rand((район−1)²·2)`.

### Port reconciliation (`src/states/play.js`)

Already faithful: `calcMaxHp` (= `vitality×5+10+str`), `rollDmg` (`[str/2..str]`),
the `dex×5+20` accuracy, and the double-hit threshold (now `dex>14`, matching the
flurry's first extra swing).

**Fixed Session 26 (character model):**
- Class **stat presets** + class-derived starting HP (was: all classes identical
  `5/5/2/2`, stats unaffected by class) — now seeded in `armNewGame`/`DEFAULT_STATE`.
- Accuracy clamp `95 → 90` (the `0x5a` cap); flurry derived from the uncapped
  value via `canFlurry()` so the cap change doesn't disable it.

**Fixed Session 26 (combat model — the formerly-deferred trio, now faithful):**
- **Crit = `luck×3`%** adding +max-damage and a fracture message (was: fixed 10% ×2).
  Both player and enemy. Makes Удача matter in a fight.
- **Full flurry loop**: each turn swings while `acc > 0`, accuracy `−18`/swing
  (`acc` starts `stat+4`), instead of a single extra hit. Both sides.
- **Enemy stat model**: `spawnEnemy` now point-distributes `sum(weights)+lvl×2`
  stat points across str/dex/vit/luck by per-archetype weights (the verbatim EXE
  loop, `distributeStats`), HP `= vit×5 + str + 10`, plus district-scaled enemy
  **armor** (`≈ район²·2`) and **luck** (crit). Bosses/менты gained `luck`+`armor`.
  (Session 26 used 7 hand-tuned archetype weights. **Superseded in Session 27:**
  the exact 10-row EXE weight table at `[0x3952*4+2..5]` is now transcribed —
  see "Enemy archetype weight table" above — and the port's `ENEMY_ARCHETYPES`
  uses the verbatim rows + the EXE's `rollArchetypeIndex` район-biased selection.)

**Balance tuning (Session 26 Part 4 — Monte Carlo, ~150–600 fights/scenario).**
The faithful formulas produced ~30-round fistfights (low accuracy × low damage vs
parallel HP) — unplayable when each round is a keypress. The recovered *shapes* are
kept; these constants are tuned for the port's pace (each marked in code + here):
- **`ACC_BASE = 45`** (EXE base 20): `hitChance = 45 + dex×5`, clamp 90. Unified so
  combat and the `s`/`sv` display use the *same* value (the pre-tuning combat path
  used `(dex+4)×5` directly — the display-only `pctHit` edit hadn't touched it).
  Flurry now decrements 90 percentage-points/swing; extra swing once `45+dex×5 > 90`
  (`dex > 9`).
- **Enemy HP = `vit×2 + str + 5`** (player keeps the heroic `vit×5+str+10`) — mooks
  are squishier than the hero so fights are ~5–12 rounds, not 30.
- **Enemy armor = `район×2 + roll(район+1)`** (0 / 2–3 / 4–6) — the EXE's `район²·2`
  made mooks tankier than the final boss and could zero out player damage.

Final measured curve: fresh L1 ~8–12 rounds @ 77–98% win (Вор weakest — fragile,
combat-light, economy-strong; Отморозок strongest); geared mid/late mooks 2–5
rounds; bosses gated — 91–97% when prepared, **0% undergeared**, and rushing ahead
to a later район at L1 = 0%.

## Function map — seg-1000 game logic (labelled Session 27)

Ghidra's auto-analysis names everything `FUN_*`. The seg-1000 functions (Ghidra
bases the load segment at `1000`, so `1000:XXXX` == image offset `0xXXXX`) are the
actual game logic. Labels below were recovered by **disassembling each function and
decoding the CP866 string immediates it loads** (`tools/` Capstone + the seg-0 string
region 0x40..0xAB59); the decompilation itself is string-sparse, so the fingerprint
is the strings each function prints. Sorted by size:

| Function | img | role (recovered) | key strings it prints |
|----------|-----|------------------|-----------------------|
| `FUN_1000_3d11` | 0x3d11 | **Wander + combat + special street encounters** (the `w`/`k`/`f`/`v` action core) | maniac arc ("Я МАНЬЯК!!!"), "Чё за батва? …патроны кончились", таунты |
| `FUN_1000_1a03` | 0x1a03 | **Status / reputation screen** (`s` / `rep` char sheet) | "Ты # уровня - А зовут тебя: … # опыта … Сл:# Лв:# Жв:# Уд:# Феньки:" |
| `FUN_1000_6a0d` | 0x6a0d | **user `main()`** — new-game / save-slot setup / district pick | "\save_r?.sav", "Можно начать с # района" |
| `FUN_1000_7c67` | 0x7c67 | **Храм божий / Бог** free-blessing encounter | "Ты наткнулся на храм божий", "Господи, Братан, прости грешника" |
| `FUN_1000_0d14` | 0x0d14 | **Enemy spawn** (archetype roll + stat distribution + HP/dmg/armor) | — (pure math; weight table @ DGROUP 0x123b2) |
| `FUN_1000_5f55` | 0x5f55 | **Character creation / rules** (Dean intro + class-pick tutorial) | "Вначале ты должен выбрать свой характер", "навыки в сумме составляют 12", "# из 12 шансов" |
| `FUN_1000_2526` | 0x2526 | **Blessing / stat-up helper** (10 callers — shared) | "Понтовость увеличивается:", "Сила +1 / Ловкость +1 / Живучесть +1 / Удача", "анархия и полный беспредел" |
| `FUN_1000_074b` | 0x074b | **Win / lose end screen** | "Ты сдох…", "Ты победил…", title-art region refs |
| `FUN_1000_1348` | 0x1348 | **Enemy inspect** (`sv` — приглядеться к мудаку) | "Это # уровня Сл:# Лв:# Жв:# Уд:# Урон #-# Сломана челюсть / Сломана нога" |
| `FUN_1000_29c4` | 0x29c4 | **Drink handler** (`h` / `mh` — пиво) | "Ты не можешь пить пиво из-за сломаной челюсти", "Пиво прибавляет #з … #л. пива" |
| `FUN_1000_7538` | 0x7538 | **Рушель Блаво** paid-save encounter | "Ты встретил великого мага и экстрасенса - Рушеля", "За # рублей … сохранение прямо здесь", "save_r0.sav places.sav Сохранено!" |
| `FUN_1000_0aec` | 0x0aec | **"ТЫ СУПЕР ГОПНИК" victory / credits screen** | "ТЫ СУПЕР ГОП…", "by V.P.U" |
| `FUN_1000_02c2` | 0x02c2 | **Title screen draw** | "Нажми какую-нибудь кнопку", "2003 year, June, Sept" |
| `FUN_1000_11c2` | 0x11c2 | small art/screen helper (draws a colour row; writes `[0x3958]`) | — |
| `FUN_1000_0acc` | 0x0acc | tiny helper (15 bytes) | — |

Shared seg-`1f78`/`1f16`/`1eed` functions are Borland runtime (`FUN_1f78_114b` =
`rand()%n`, `FUN_1eed_01c2` @ 602 callers = the `cputs`-style coloured printer,
`FUN_1f16_031a` = `getch`, `FUN_1f16_0614` = the conio INT 10h wrapper).

### Больница / ветеринар (`rep`) — sub-menu @ file `0xB245` (Session 34)

Not a one-shot heal: the `rep` handler (code @ `0xB2EF`–`0xB41B`, strings @
`0xB245`–`0xB37C`) presents a **priced service menu** and waits on `getch`:

- `h` — «за # рубля тебя залатают» → restore HP / царапины.
- `r` — «за # рублей починят переломы» → clear broken челюсть/нога.
- `w` — leave.

Cost scales with the district byte `[0x3692]`; "Блин халявщик, медицина не
бесплатная" is the can't-afford branch; "Твои переломы залечены" on a fracture
repair. There is **no separate y/n** — choosing the letter (with the price already
shown) is the commit. The port (Session 34) restores this `h`/`r`/`w` sub-menu.

### Bone-break subsystem (Session 34)

A crit anywhere is «Двойной урон!!!» (double damage) + a possible break:
- **Челюсть** blocks piva (`FUN_1000_29c4` "не можешь пить пиво из-за сломаной
  челюсти"), колёса (`kos` @ `0x6653`), and eating at база́р (@ `0x5849`).
- **Нога** blocks fleeing (`run` @ `0x3754` "не можешь убежать на сломаной ноге").
- `sv` inspect (`FUN_1000_1348`) prints the target's "Сломана челюсть / Сломана нога".
- Cures: больница `r`, храм/Бог ("залечилась с божей помощью"), фенька «5%
  самозарост переломов» (@ `0x9477`), зубная защита «−75% что сломают челюсть» (@ `0x6563`).

### Maniac & Рушель Блаво frequency (Session 34)

- The **маньяк** is a high archetype in the district-scaled spawn roll
  (`FUN_1000_0d14`: archetype index = triangular `rand(51)` folded to 0–9, **+**
  district `[0x3692]`), so it is rare in район 1 and common only later.
- **Рушель Блаво** (`FUN_1000_7538`) is **only** a paid save-point — `getch`-confirm,
  charge `[0x3692]*0x32` (district×50₽), write `save_r0.sav`/`places.sav`,
  "Сохранено!". The понт/stat blessing belongs to the храм (`FUN_1000_7c67`), not
  the mage. The port (Session 34) separates them accordingly.

### `run` / flee command (Session 34)

Verbatim string cluster @ file `0x4c98–0x4d10` (length-prefixed message-table
entries). Fleeing combat is possible but западло:

- Taunt «^4Враг: Трусливый засранец!», понтовость crashes («Такого конявого
  непустят в местный притон!»), and **one random stat −1** — the «Сила -1 /
  Ловкость -1 / Живучесть -1 / Удача -1» entries are a pick-one table that mirrors
  the blessing's pick-one **+1** (`FUN_1000_2526`). (The pick-one reading is
  inferred from that structural symmetry; the all-four reading can't be fully
  ruled out from the decomp, which is string-sparse here.)
- **Blocked vs the Ректор**: «^4Ректор: Кудa? Стоять! Бейся до конца трусливый
  урод!» (note verbatim latin-`a` typo in «Кудa»).
- **Blocked on a broken leg**: «^4Ты не можешь убежать на сломаной ноге.»

Port (Session 34): `run` command → `fleeCombat()`; final boss = verbatim line,
district bosses = generic block, broken leg = verbatim block.

## Save format — decided: not reversed (JSON instead)

**Decision (settled):** the port deliberately does **not** reverse the original
binary `.sav` format. The port's STATE has diverged too far from the 2003 binary
to round-trip losslessly, and a binary interchange serves almost no user. Saves
use localStorage (per-device) + a lossless **JSON** export/import
(`src/save_transfer.js`, Session 24) for moving a save between machines. The
`.sav` reversal idea is **dropped** — do not pursue it.

For reference only (the original EXE's scheme, not reproduced):

- Slots: `save_r0.sav` .. `save_r9.sav` (numbered); plus global `places.sav`.
- Access pattern in EXE: `INT 21h AH=3C` (create), `AH=3F` (read), `AH=40` (write), `AH=42 AL=00/02` (seek), `AH=3E` (close).

## Title screen art

Fragment @ 0x18D0 (713 bytes) — 8 rows of box-drawing glyphs spelling **GOPNIK** plus credits:

```
┌──── ┌────┐ ┌────┐  │    │  │    │  │    /     ← color 0
│     │    │ │    │  │    │  │    │  │   /      ← color 1
│     │    │ │    │  │    │  │    │  │  /       ← color 2
│     │    │ │    │  ├────┤  │   /│  │_/        ← color 3
│     │    │ │    │  │    │  │  / │  │ \        ← color 4
│     │    │ │    │  │    │  │ /  │  │  \       ← color 5
│     │    │ │    │  │    │  │/   │  │   \      ← color 6
│     └────┘ │    │  │    │  │    │  │    \=    ← color 7
                                                
Версия 1.025
Нажми какую-нибудь кнопку
2003 year, June, Sept
by V.P.U.
```

Each row is in its own color, producing a rainbow effect.

## What's reproduced in the web port now

- `src/states/title.js` — the title screen rendered above (with a blinking-`?` cursor).
- `src/states/menu.js` — the recovered command help screen from EXE @ 0xBFDF.
- `src/render.js` + `src/font_cp866.js` — glyphs are now blitted from the
  authentic FreeDOS CP866 8x16 VGA bitmap font (Session 21), so on-screen
  Cyrillic / box-art is pixel-identical to the original under Russian DOS.
  The `^<`/`^#`/`^/`/`^,`/`^!`/`^?`/`^=` color-escape specials are still
  undecoded (pass through as literal chars) — that decoder is still a
  Ghidra-phase TODO.

## What's left (resumable)

1. **Phase 1 (Ghidra) — dump now regenerable headless.** `tools/pyghidra_dump.py` (PyGhidra; see CLAUDE.md "Ghidra (headless dump)") imports + auto-analyzes the binary and writes `notes/ghidra_{functions,decomp,strings}.txt` — **123 functions** with C decompilation (vs the 8 the Capstone tracer reached). Already identified: `FUN_1000_6a0d` = user `main()`, `FUN_1f16_031a` = `getch` (INT 16h, 60 callers), `FUN_1f16_0614` = conio INT 10h video wrapper (15 callers), and the INT 21h file-IO cluster in seg `1f78`/`1f16`. Remaining interactive work (optional, low-priority — the `^N` decoder and save format it was meant to crack are both resolved/decided): walk `ghidra_decomp.txt` to label the encounter/stat-formula functions for the per-location-encounters chunk.
2. ~~**Phase 1b — save format**: reverse the binary `.sav` layout.~~ **Dropped** — the port uses localStorage + JSON export/import (`src/save_transfer.js`); see "Save format — decided" above.
3. **Phase 2 — full screen catalog**: 1,930 raw fragments are now in `assets/screens_raw.json`. Cluster into screens (cf. `extract_screens.py` output), map each cluster to a state name.
4. **Phase 3 — more states**: build modules for fight, gym, market, club, dealer, girlfriend, god encounter, dean encounter.
5. **Phase 3 — input parser**: implement the text-command prompt (the original reads a buffer with `getch` loop, terminated by Enter). Currently we use single-key navigation.

## Tooling notes

- `tools/extract_screens.py` — CP866-aware screen extraction.
- `tools/disasm.py` — recursive Capstone disassembly with control-flow tracking, far-call awareness, screen-fragment xref.
- `tools/find_int_sites.py` / `tools/find_video_access.py` / `tools/find_decoder.py` — pattern hunters.
- `tools/segments.py` — relocation-table analysis to identify code vs data segments.
- `tools/header_dump.py` — MZ header parse.
- Ghidra 12.1 (needs JDK 21 = `openjdk@21`); project at `ghidra_proj/`. **PyGhidra now configured** in `.venv-ghidra` (py3.13 + bundled `pyghidra-3.1.0` wheel + JPype 1.5.2). `tools/pyghidra_dump.py` regenerates the function/decomp/strings dumps headlessly (the old `tools/ghidra_dump.py` analyzeHeadless/Jython post-script no longer runs — 12.1 dropped Jython). `ghidraRun` for interactive GUI.
