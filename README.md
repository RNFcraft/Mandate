# Mandate: каноническая карта

Из папки `game`:

```sh
npm install
npm run build
npm run build:adm2
npm run migrate:atomic
npm run audit:adm2
npm start
```

Карта: http://127.0.0.1:3000. DEV: http://127.0.0.1:3000/?editor=1&scenario=1700.
Обычный сценарий 1700: `/?scenario=1700`; по умолчанию `modern`.
Сборка создаёт шаблоны только при отсутствии; сохранённые сценарии не сбрасываются.
`server.js` с llama.cpp для карты не запускается и не изменён.
Историческая география 1700 и игровые системы пока не реализованы.

## Canonical atomic mesh

Исходные Natural Earth ADM0/ADM1 в `data/map` и geoBoundaries CGAZ ADM2 в `data/source` остаются неизменными.
Полная GIS-обработка выполняется только offline. Natural Earth даёт ID, названия, matching и intended coverage, но исходные контуры не рисуются независимо поверх ADM2.

`scripts/build-adm2.cjs` потоково читает исходник, сохраняет прежнее сопоставление и упрощает реальную геометрию примерно до 500 м.
`scripts/canonical-mesh.cjs` строит глобальную noded mosaic: реальные ADM2 имеют приоритет, затем остатки покрытия ADM1, затем остатки ADM0 без ADM1.
При конфликте меньшая исходная единица сохраняется первой (важно для анклавов), равные площади разрешаются стабильным ID.
Это техническое разрешение перекрытий источников, не решение о политическом статусе.

Все **49 349** реальных ID `gb:<shapeGroup>:<shapeID>` и их прежние родители сохранены.
Два микрополигона LCA/MDV, схлопнувшиеся при прежней квантовании, восстановлены из неизменённого GeoJSON.
В runtime **52 262 atom: 49 349 real ADM2 + 2 913 residual**.

Residual — оставшаяся непокрытая суша, а не полный ADM1.
ID: `residual:<adm0>:<adm1>`; без родителя — `residual:<adm0>:unassigned`.
Раздельные компоненты хранятся одним MultiPolygon с одним стабильным ID.
Из прежних **533** full-ADM1 fallback **167** полностью покрыты реальными ADM2, остальные **366** сопоставлены с residual.
Новые остатки также встречаются у ADM1, уже имеющих реальные ADM2.

Порог residual-компоненты — **0,01 км²**; исключены 2 131 микрокомпонента суммарно 7,506 км².
Snap — **0,000001°**; итоговые общие координаты экспортируются без повторной квантования.
Численные остатки покрытия проверяются отдельно: допустимы только явно перечисленные части менее 1 км².
Площади и bounds исключений — `data/processed/canonical/coverage-exceptions.json`, геометрия — `uncovered.geojson`.
Наличие любой части ≥1 км² останавливает публикацию. В текущей финальной проверке таких частей и непокрытых граней не найдено.
Это проверка подготовленного intended coverage на точности топологического overlay, не доказательство геодезической точности исходников.

`verify:mesh` проверяет все пары с пересекающимися bbox, включая dateline, независимой polygon-clipping intersection.
Вторая проверка через mapshaper mosaic считает перекрытые грани; третья вычисляет разность intended coverage и атомов.
Любая перекрытая грань или ошибка intersection останавливает сборку.
`invariants.json` содержит SHA-256 проверенной топологии: **234 861 пара, ноль overlap, ноль ошибок**.
До изменения было **924** существенных overlap (918 fallback↔ADM2, 6 ADM2↔ADM2, по прежнему порогу ≥1 км² и ≥1% меньшей площади).
Новый порог строже: ≥1 км² без ограничения доли; дополнительно требуется ноль перекрытых граней любого размера.

## Один источник видимых границ

`scripts/publish-canonical.cjs` выводит ADM1 и ADM0 через `topojson mergeArcs` групп атомов по `adm1Id` / `adm0Id`.
`client/data/adm2/derived.topo.json` содержит производную геометрию и `sourceArcIds` физических дуг atom topology.
Ни одного отдельного Natural Earth stroke в обычной карте нет.

`shared/borders.cjs` назначает каждой физической дуге один класс с приоритетом:

1. coastline — один сосед;
2. political — разные юридические owner;
3. country — разные ADM0 при одном owner;
4. adm1 — разные ADM1;
5. adm2 — остальные внутренние границы.

В чанках `drawArcs` назначает ровно одному чанку право рисовать общую дугу.
Классы взаимоисключающие: одно ребро не рисуется ADM2 + ADM1 + country.
Выделение и DEV-аудит имеют отдельные диагностические контуры.
Политические заливки по `atomic territory → owner` сшиваются из подготовленных дуг через `mergeArcs` в worker.
Runtime не делает GIS union, clipping, erase или matching.
Controller хранится отдельно и не определяет юридическую границу.

## LOD, cache и управление

- FAR (<2,5×): производные country/political shapes, без запросов ADM2.
- MEDIUM (2,5–8×): производные ADM1 и классифицированные границы.
- CLOSE (≥8×): ленивые пространственные чанки атомов и их классифицированные дуги.

Физические координаты одинаковы на всех LOD; меняются видимость и толщина классов.
Дуги передаются lossless: точные индексы исходных сеток, если они восстанавливают Float64 точно, иначе исходный Float64; gzip сжимает координатный payload.
Никакого дополнительного округления. **901 chunk занимает 29,67 MB**, производная общая геометрия — **9,62 MB**.
Political API возвращает ссылки на уже загруженные дуги и только новые координаты для границ внутри ADM1.

Canvas работает в половинном разрешении; приглушённый стиль сохранён.
Path2D кешируется, hit test использует пространственную сетку, невидимые полигоны пропускаются.
Cache ограничен **128 чанками / 12 MiB сериализованных данных**, максимум четыре параллельных запроса; ненужные отменяются.
При превышении бюджета интерфейс предлагает приблизиться для полной детализации.
Дальний/средний статический векторный слой кешируется в одном bitmap размером viewport + 256 физических пикселей по каждой оси.
Во время жеста bitmap переносится/масштабируется; через 120 мс после остановки zoom точный слой перерисовывается в текущем масштабе.
Координаты геометрии, выделение, DEV-слои и close atoms остаются векторными.

ЛКМ выбирает территорию, drag переносит карту; колесо масштабирует вокруг курсора (1–64×).
В DEV ПКМ/средняя кнопка переносят карту независимо от кисти.
`window.mandateMap.model.setOwner(regionId, countryId)` назначает atom или детей ADM1; `null` — нейтральное владение.
`setColor` меняет цвет государства. `addLayer` добавляет слой в мировых координатах 360×180.
Canvas `regionselect` содержит `detail.regionId`.

## Сценарии и безопасная миграция

`scenarios/<id>` содержит `scenario.json`, `countries.json`, `ownership.json` и необязательный `controllers.json`.
Текущий формат: **version 3**, geography **mandate-atomic-v1**; ownership содержит все 52 262 атомарных ID.
Государство: `id, name, shortName, color, capitalRegionId, governmentType`.

`migrate:atomic` сохраняет побайтовую копию исходной папки в `scenarios/.atomic-backups/<id>`, готовит полную новую папку и заменяет её с rollback.
Повторный запуск не меняет мигрированные сценарии или отчёт.
Реальный v2 ownership и controller сохраняются по прежним ID.
Старый fallback передаёт владение/контроль своим residual; исчезнувший fallback получает `status: fully-covered`.
Все прежние fallback claims сохраняются в `scenario.territoryMigration.retiredOwnership / retiredControllers` и `effects`, даже если геометрия исчезла.

Новый residual без старого fallback наследует owner только при единогласном владении реальными детьми ADM1; такие назначения перечислены в `inferredResidualOwners`.
При неоднородном/отсутствующем владении он нейтрален.
Для v1 atom наследует старое ADM1 владение; отсутствующий родитель остаётся нейтральным.
Реальная ADM2-столица сохраняется; fallback-столица переносится на принадлежащий стране residual либо снимается с provenance, если fallback исчез.
Настоящие ADM2 не переназначаются ради старых перекрывавшихся claims.

`data/processed/canonical/migration.json` — географическое соответствие;
`scenario-migration.json` — эффекты и SHA-256 оригинальных файлов.
API читает v1/v2 с миграцией в памяти; явное сохранение v3 тоже делает backup.
Прежние v1 backups сохраняются в `.legacy-backups`.
DEV создаёт государства, красит территории и назначает столицы; Undo/Redo — до 100 операций кисти.
При close редактируется atom, ниже — дети ADM1. Сохранение заменяет папку с rollback; чтения/записи сериализованы.
`MANDATE_DEV_EDITOR=0` запрещает запись. Несохранённые изменения не переживают reload.

## DEV audit и проверки

ADM2 AUDIT загружается только по кнопке в DEV.
confident / ambiguous / unmatched описывают matching реальных ADM2 с исходным Natural Earth ADM1; residual имеет отдельный фиолетовый режим.
Показываются площади, atomic overlap, residual area, uncovered land, geometry conflicts и migration effects с прежними owner.
Диагностический видимый ADM1-контур тоже производный; кандидаты проверяются offline против исходного NE.

Matching консервативен: доля ≥99,5%, конкурент ≤0,1%, margin ≥99,4%, согласованный ADM0.
XKX→KOS и SSD→SDS — явные aliases.
15 прежних специальных country links сохраняются как неподтверждённые для совместимости.
Dateline matching остаётся неопределённым, но atomic overlap проверяется и там.
1 006 численных source-matching intersection потребовали диагностического пересчёта на сетке 10⁻⁷–10⁻⁵°; это не меняет atom geometry и не повышает уверенность назначения.
Они перечислены в `summary.numericalMatchingRetries`; неразрешённых ошибок — ноль.
Разные уровни источников (например, Италия) и включённые в административные полигоны водные участки не переклассифицируются.

```sh
node scripts/check-adm2-repro.cjs --snapshot
npm run build:adm2
node scripts/check-adm2-repro.cjs
npm run audit:adm2
npm test
```

Тесты проверяют исходный SHA-256, реальные ID/родителей, отсутствие atom overlap, derived ADM1/ADM0 как merge атомов, точные дуги, единственную отрисовку shared edge, приоритеты классов, ownership/controllers, backup, редактор, LOD, audit opt-in и консоль.
`test-results/lod-profile.json` измеряет JS-render и интервалы кадров, не гарантированный аппаратный FPS.
Постоянная копия QA — `data/processed/canonical/qa/`.
Before/after для Центральной Азии, России, Германии/Польши/Чехии, Балкан, Италии, США/Канады, Норвегии и Румынии — `data/processed/canonical-baseline/screenshots/`.
Воспроизведение: `node scripts/capture-mesh.cjs after` при запущенном приложении на 3000.
Приватные source/processed и test-results исключены из git; runtime assets должны быть подготовлены до запуска.

## Основа симуляции и сохранения игры

В обычном режиме сценарий инициализирует отдельный `GameState`, принадлежащий
`shared/simulation.cjs`. Ядро переносимо между Node и браузером и не знает о DOM,
Canvas, геометрии или реальном времени. Scenario v3 и geography остаются прежними.
DEV-редактор по-прежнему работает отдельно с авторскими сценариями.

Один фиксированный tick — **один игровой день**, с пролептическим Gregorian calendar.
Новая игра начинается на паузе 1 января года сценария. Кнопка «Играть» запускает
время; скорости 1/5/20/100 означают игровых дней в секунду. Дневной шаг даёт основу
для будущих систем без преждевременного почасового расчёта.
`client/game/clock.js` запрашивает целые шаги каждые 100 мс независимо от FPS;
после фоновой приостановки учитывает максимум одну реальную секунду.
Дробный остаток реального времени не входит в GameState и сбрасывается при
pause, смене скорости и загрузке. Seed + начальное состояние + команды/число
фиксированных шагов определяют результат; реальная частота кадров — нет.

GameState v1 содержит `game.scenario` (метаданные происхождения), `geography`,
`clock`, `rng`, `ownership`, `controllers`, `countries`, `systems`.
Геометрия не дублируется. PRNG — xorshift32, seed по умолчанию 1;
нулевой seed получает фиксированное ненулевое начальное состояние.
Минимальный упорядоченный system pipeline содержит только `tickProbe`:
счётчик ticks и последний PRNG sample, без игровых последствий.
`systems` допускает дальнейшие JSON-расширения; настоящие игровые системы не реализованы.

API `Simulation`: `start`, `pause`, `setSpeed`, `step`, `submit`, `subscribe`,
`snapshot`, `serialize`, `load`. Команды проверяются до применения; отказ не
меняет состояние. События `timeAdvanced`, `pauseChanged`, `speedChanged`,
`stateChanged`, `gameLoaded` — уведомления, не источник истины.
Системы принадлежат ядру; UI не реализует правила последствий.
В обычной игре `MapModel` читает неизменяемые live views ownership/countries
из Simulation; часы не запускают пересчёт политических границ.
Прежние интеграционные helpers назначения владельца/цвета/столицы теперь
подают явные валидируемые команды. Действий изменения ownership в игровой панели нет.
Создание государств остаётся в DEV-редакторе.

Нижняя панель обычной игры показывает дату, pause/play, скорость и save/load.
`window.mandateSimulation` даёт доступ к ядру для локальной отладки,
например `mandateSimulation.step(10)` для десяти дней даже на паузе.
На tick не выполняется клонирование или сериализация мира из 52k территорий;
меняются только небольшие поля clock, RNG и probe.

Сохранения лежат в **`saves/<save-id>/save.json`**, отдельно от `scenarios/`,
и исключены из git. Envelope: `{format: "mandate-save", version: 1,
geography, scenarioId, state}`. Внутри — полный runtime GameState без карты.
Timestamp не добавляется: save/load восстанавливает сериализованное состояние точно.
Если сохранение было запущено, после загрузки оно продолжает время;
сохранённая пауза также сохраняется. Несовместимые format/geography/date/ID
отклоняются до замены действующего состояния.

Локальный map server поддерживает `GET /api/saves`, `GET /api/saves/<id>` и
`PUT /api/saves/<id>`. ID ограничены безопасными ASCII tags, зарезервированные
Windows имена и symlink paths отвергаются. Same-origin проверяется для записи.
JSON полностью валидируется; запись идёт во временный файл с flush, затем
атомарный rename заменяет save.json. Неудачная замена оставляет старое сохранение.
Чтения и записи сериализованы. Gameplay и save/load не пишут сценарии.
`server.js`/LLM не используются.

`tests/simulation.spec.cjs` проверяет календарь/leap years, PRNG,
детерминизм, отказ команд без частичной мутации, pause/manual steps,
разную группировку real-time шагов, точный save/load и продолжение,
валидацию API/географии/путей, отсутствие world cloning на ticks,
UI play/pause/speed/save/reload/load, DEV и неизменность сценариев.
Полный запуск: `npm test`; отдельная проверка: `npx playwright test tests/simulation.spec.cjs`.
Ограничения: локальная однопользовательская симуляция, один поддерживаемый save format,
нет игровых систем, командного журнала replay или multiplayer authority.
# Population System v1

Current 1700 population data is not yet historically populated.

Population is simulation authority in `systems.population`, separate from geometry,
ownership and editor state. Only authored cohorts exist: no territory × registry
Cartesian product and no synthetic demographic data in real scenarios.

Optional `scenarios/<id>/population.json` has the exact schema:

```json
{
  "version": 1,
  "cultures": [{"id": "culture-a", "name": "Culture A"}],
  "religions": [{"id": "religion-a", "name": "Religion A"}],
  "strata": [{"id": "stratum-a", "name": "Stratum A"}],
  "cohorts": [{
    "id": "pop-001", "territoryId": "<canonical territory ID>",
    "cultureId": "culture-a", "religionId": "religion-a", "stratumId": "stratum-a",
    "settlement": "rural", "count": 0, "literacyBps": 0,
    "birthRateBps": 0, "deathRateBps": 0
  }]
}
```

This is a schema example, not historical data. Registry/cohort IDs use safe tags;
registry names are nonempty strings up to 160 characters. IDs and demographic
tuples (territory, culture, religion, stratum, settlement) must be unique.
Settlement is `rural` or `urban`; counts are nonnegative safe integers; literacy
is integer basis points in 0..10000 or `null` (unknown). Annual birth/death rates
are integer basis points in 0..10000. Only rates are
optional, explicitly defaulting to zero. Unknown fields/references are rejected.

Runtime structure is the same dataset with both rates always present, integer
`birthRemainder` and `deathRemainder` (0..119999) per cohort, plus
`stats: {monthsProcessed: 0, births: 0, deaths: 0}`. Counts are the sole population
authority; totals are derived. Existing GameState/save versions remain unchanged.

One update processes the completed month when a daily tick enters its successor's
first day: January 31 → February 1 processes January. Monthly systems run in
explicit order before that tick's clock/RNG commit; daily diagnostic system order
and xorshift RNG are unchanged. For each rate, using the count at the start of
the month: `numerator = count * rateBps + remainder`,
`change = numerator / 120000` (integer floor), `remainder = numerator % 120000`.
Births and deaths both use the old count; new count is old count + births − deaths.
Temporary BigInt arithmetic prevents precision loss; saved state remains JSON
Numbers. Overflow rejects the monthly update before its mutation. Earlier ticks
in a batched step remain committed if a later tick fails. Literacy is unchanged.

Daily population overhead is a calendar-boundary check; monthly work is O(cohorts).
No world cloning/serialization occurs per tick. Step grouping and real-time
delivery do not change results. A lightweight `populationUpdated` notification
contains `{type, date, births, deaths, netChange}` after the boundary tick commits;
it contains no world/cohort arrays and does not invalidate political geometry.

`simulation.populationSummary(territoryId?)` returns detached derived
`{total, urban, rural, literacyBps, byCulture, byReligion, byStratum}`. Literacy is
population-weighted with exact integer arithmetic, rounded down (zero if total
is zero; null if any positive-count cohort has unknown literacy). Zero-person
unknown cohorts do not affect literacy. No country totals are stored. Pure helpers live in
`shared/population.cjs`: validation, initialization, monthly advance and summary.

Normal scenario loading requests `/api/scenarios/<id>?population=1`. A missing
asset yields `{version:1,cultures:[],religions:[],strata:[],cohorts:[]}`; malformed
or invalid authored data fails clearly. Editor requests keep the existing response
shape; editor folder replacement preserves population.json byte for byte and
ignores runtime population input. The independent population.meta.json asset is
also preserved byte for byte. No population editor is provided.

Saves include exact cohorts, registries, rates, literacy, remainders and cumulative
stats through GameState. Old saves without population remain unchanged and safe:
monthly population work is skipped, summaries return zero, and no scenario data
is injected on load. Current limitations: authored aggregate natural growth only;
no age/sex model, education, migration, conversion, economy or historical import.

## Population Baseline 1700 v1 (offline importer)

Mandate scenarios prioritize historical plausibility, internal simulation
consistency and gameplay, not exact historical reconstruction. HYDE 3.2 supplies
baseline spatial total/urban/rural population, not culture or religion. Atomic
territory counts are deterministic game-oriented downscaling of a coarse
historical reconstruction. Exact integer counts do not imply historical census
precision. Later gameplay rules may explicitly transform this baseline through
version-controlled adjustments; no such multipliers or caps are applied in v1.

Sources: [HYDE dataset](https://doi.org/10.17026/DANS-25G-GEZ3),
[HYDE 3.2 paper](https://essd.copernicus.org/articles/9/927/2017/)
(DOI 10.5194/essd-9-927-2017). The roughly 600-million order of magnitude around
1700 is a reference only, never a rescaling target.

Raw files belong in ignored data/source/population/hyde32/. No automatic downloads.
Extract the three HYDE 3.2 baseline **1700 CE people-per-cell** ESRI ASCII grids:
total, urban and rural. Do not supply population density (people/km2), other years,
or land-use layers. ASCII has no year/unit metadata: selecting the right files is
an explicit input responsibility. Plain .asc and gzip-compressed .asc.gz are
supported; ZIP, GeoTIFF and NetCDF must first be extracted/converted externally.
Global CLI inputs must use matching 4320 x 2160 grids, 5 arc minutes, longitude/
latitude origin -180/-90. Resolution validation allows an absolute tolerance of
1e-6 degrees around nominal 1/12 degree, accepting HYDE's rounded 0.0833333.
Cell coordinates still use the actual parsed cellsize without snapping.
Missing inputs fail with all expected paths and create
no population assets. Invalid rows/headers/mismatched grids also fail.

PowerShell example (replace file placeholders with your extracted filenames):

```powershell
node scripts/import-population-1700.cjs `
  --total "data/source/population/hyde32/<total-file.asc>" `
  --urban "data/source/population/hyde32/<urban-file.asc>" `
  --rural "data/source/population/hyde32/<rural-file.asc>"
```

Options: --strict rejects any unresolved positive population;
--max-unresolved-pct 0.05 and --max-anomaly-pct 0.05 explicitly set tolerated
percentages (defaults both 0.05%). --output defaults to scenarios/1700;
--audit defaults to data/generated/population/1700. Output folders must stay
inside this repository and separate scenario assets from diagnostics.

Stages live in scripts/population-raster.cjs (streamed ASCII into Float64 grids),
scripts/population-baseline.cjs (allocate, normalize, build cohorts), and
scripts/import-population-1700.cjs (CLI, provenance, audit and publication).
Exact polygons are data/processed/canonical/atomic.topo.json. Their hash must
match the successful canonical mesh invariant report, and IDs must exactly
match client/data/adm2/hierarchy.json. No display, FAR, political or alternative
geography is substituted. A one-degree grid indexes individual polygon parts;
positive cells intersect polygon interiors including holes. Equal-area overlap
uses the existing cylindrical longitude/sin(latitude) approximation consistently.
All cell mass is normalized over game-land intersections, including partial
coastal cells. Zero-overlap cells may go to the nearest polygon boundary within
one local equirectangular cell diagonal from the cell center; longitude wraps,
and equal-distance ties use ASCII territory ID. Other cells remain unresolved.

All three grids must declare identical NODATA semantics/value (including all
omitting the header or all declaring NaN); mismatch fails before allocation.
The common convention is recorded in audit. NODATA becomes zero without an anomaly. Negative/NaN/infinite source values are
replaced by zero and listed in audit; raw finite total and cleaned total are
reported separately (nonfinite source mass is unknowable). Urban share is
urban/(urban+rural), independently of total mass. A missing split becomes rural
and is audited. The anomaly threshold counts positive total mass in cells with
invalid source values or missing settlement split, without double counting.
Cells with cleaned total zero and positive urban/rural signal are also audited
as settlementWithoutTotalCells; their urban+rural signal mass is accumulated as
settlementWithoutTotalPopulation and added to anomalyPopulation. This signal
never creates game population. Anomaly percentage uses cleaned total mass as
the denominator; with no cleaned total and any anomaly signal it is 100%.
The existing maxAnomalyPct threshold applies to the combined anomaly mass.
Unresolved mass is reported and, if tolerated, excluded explicitly from the
chosen target: round(cleaned mass assigned to game land). Global Hamilton
apportionment selects integer territory counts with stable ASCII ID ties; a
second Hamilton split selects rural/urban counts per territory (rural wins exact
settlement ties). The chosen normalized target is conserved exactly. Failures
with allocation diagnostics write audit only, never publish scenario population.
Broad sanity requires total >100 million and <2 billion, urban < total, rural >0
and at least one populated territory. No country population rescaling occurs.

Successful real import publishes population.json and population.meta.json with
rollback on normal publication I/O failure. Two-file publication is not a crash-
atomic transaction; interrupted processes may leave .bak/.tmp files for manual
recovery. Output JSON has stable ordering, SHA256-derived cohort IDs with collision
checks, source byte hashes, geography/hierarchy hashes and recorded normalization
rules/thresholds. No local absolute paths, wall-clock timestamps or raw files
enter these assets. At most one positive rural and one positive urban cohort per
territory; culture/religion/stratum are unclassified (composition not generated),
literacy is null (unknown), and rates are omitted. Natural growth is disabled by
the existing zero-rate defaults until a separate demographic model is authored.
Numeric literacy scenarios/saves remain compatible; unknown stays unknown through
save/load and monthly ticks. Runtime/save architecture and formats are unchanged.
The local runtime save body limit is 64 MiB: two cohorts per 52k atoms can need
about 30 MiB of cohort JSON alone. Scenario editor payload limits remain unchanged.

Ignored audit contains summary.json, fallback-cells.jsonl, unresolved-cells.jsonl,
rural-fallback-cells.jsonl, settlement-without-total-cells.jsonl,
invalid-source-values.jsonl, territories.json,
largest-territories.json, country-summary.json and region-examples.json.
Country totals derive from scenario ownership for diagnostics only. Region examples
use explicit, nonexclusive geographic boxes (Europe, India, China, Japan, North/
South America, Africa, Siberia/Central Asia), with bbox-midpoint membership; they
are approximate developer checks, not political or demographic authority.
Performance report includes wall time, process peak RSS, cells, cohort counts,
totals and population.json size. Full HYDE performance is unmeasured until actual
source files are supplied. Tests use tiny synthetic rasters only, isolated test
folders, and never publish synthetic values into real scenario 1700.

Population Composition v1 is an offline authored layer over the frozen HYDE mass.
Its registries, rule precedence, joint Hamilton splitting, preview/publication
commands and baseline-preservation workflow are documented in
[docs/population-composition.md](docs/population-composition.md).
