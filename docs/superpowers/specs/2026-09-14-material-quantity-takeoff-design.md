# Material Quantity Takeoff — Design Spec

**Date:** 2026-09-14
**Branch:** `57/material_quantity_takeoff`
**Status:** Approved design (brainstormed and approved section-by-section). This document is the written spec only; it does not include implementation code.

## Overview

The Plan Analyzer's Trade scopes table currently shows each scope item with a list of broad material categories (`materialCategories`) and no quantities. This feature replaces that with a per-scope-item **material takeoff**: each scope item lists the specific materials it requires, each with a plan-supported quantity (or none), the plan source for that quantity, and a link that opens Home Depot's search results for that material.

Materials, quantities, and links appear in three new columns — **Material | Qty | Home Depot** — with one line per material. A scope item that lists four materials shows four aligned lines and four links.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Where quantities come from | **Only what the plans support** — schedules, keynotes, fixture/device counts, stated dimensions and areas. Otherwise no quantity. | Scope generation reads extracted plan text (plus limited visual page summaries), not scaled geometry. Presenting guessed square footage or linear feet as takeoff numbers risks under-ordering and under-bidding. |
| Home Depot link | **Search-results link built from a search phrase** (`homedepot.com/s/<query>`). No product lookup. | Home Depot returns `403` to scripted requests and its Terms of Use prohibit screen scraping. A paid product-data API (e.g. SerpApi) was considered and declined. Add-to-cart deep links with quantity are not publicly available and are out of scope. |
| Table layout | **Three columns**: Material, Qty, Home Depot, aligned line-by-line. | Chosen by the user over a combined single column. |
| Materials in bids | **No.** "Add to new bid" is unchanged. | Keeps the change focused on the analysis screen. |
| Architecture | **Extend the existing scope generation** rather than adding a separate takeoff pipeline step. | Scope items are identified by array index (`buildScopeSelectionId(key, index)`), so a separate module keyed to scope items would silently mismatch on regeneration; a new step would also need its own status, progress, failure, and quota handling. |

## Data Model

### New material shape

Each scope item's `materialCategories: string[]` is replaced by `materials: ScopeMaterial[]`:

| Field | Type | Meaning |
|---|---|---|
| `name` | `string` | Specific material, shown in the Material column. e.g. `"3068 prehung interior door, 6-panel"` |
| `searchQuery` | `string` | Short phrase as a contractor would type it into Home Depot search. Used to build the link. e.g. `"30 in x 80 in prehung interior door 6 panel"` |
| `quantity` | `number \| null` | Plan-supported quantity. `null` when the plans do not state or directly support one. |
| `unit` | `ScopeMaterialUnit \| null` | Unit for the quantity, from a fixed list (see below). Always `null` when `quantity` is `null`. |
| `quantitySource` | `string \| null` | Where the quantity came from, e.g. `"Door schedule, A-601"`. Always `null` when `quantity` is `null`. |

### Units

`unit` is restricted to this fixed list so the same unit never appears under different spellings:

| Unit | Meaning |
|---|---|
| `EA` | each |
| `SF` | square feet |
| `LF` | linear feet |
| `SY` | square yards |
| `CY` | cubic yards |
| `SQ` | roofing squares (100 SF) |
| `GAL` | gallons |
| `LB` | pounds |
| `BOX` | boxes |
| `ROLL` | rolls |
| `BAG` | bags |
| `SHEET` | sheets |

The backend defines the list once as `MATERIAL_UNITS` in `generateScopes.js`; the frontend defines `SCOPE_MATERIAL_UNITS` and the `ScopeMaterialUnit` type in `src/models/PlanAnalyzerScopes.ts`. A test keeps the two lists identical, in the same style as the existing trade list sync test.

The link URL is **not stored**. It is built on the frontend from `searchQuery`, so the URL format can change without re-running any analysis.

### TypeScript (`src/models/PlanAnalyzerScopes.ts`)

- Add an exported `ScopeMaterial` interface matching the table above.
- `ScopeItem` gains `materials?: ScopeMaterial[]`.
- `ScopeItem.materialCategories` becomes optional (`materialCategories?: string[]`) and is retained only so projects analyzed before this change still render.

### Backward compatibility

Existing saved scope results contain `materialCategories` and no `materials`. No migration and no re-run is required: the frontend helper `getScopeMaterials(item)` (see UI) maps each legacy category to a material with `name` and `searchQuery` equal to the category and `quantity`, `unit`, `quantitySource` all `null`.

## Backend Changes (`functions/routes/generateScopes.js`)

### Response format

`getScopeResponseFormat` replaces the `materialCategories` property on the scope item schema with `materials`: an array of objects with `additionalProperties: false`, all five fields listed in `required` (strict structured output), `quantity` typed `["number", "null"]`, `quantitySource` typed `["string", "null"]`, and `unit` as `anyOf: [{ type: "string", enum: MATERIAL_UNITS }, { type: "null" }]`. The scope item's `required` list replaces `materialCategories` with `materials`.

### Prompt rules

Both the chunk prompt and the aggregation prompt currently say:

> Include materials only as broad material categories, not exact quantities.

This line is **removed**. The material rules move into a single exported constant, `SCOPE_MATERIAL_RULES`, interpolated into both prompts, so they cannot drift and can be asserted in tests. The rules state:

- List the specific materials each scope item requires, one entry per distinct material.
- Provide a quantity only when the plans state it or it can be counted directly from the provided context — schedules, keynotes, fixture/device counts, stated dimensions or areas — and name that source in `quantitySource`.
- When a quantity is given, `unit` must be one of the listed units (the prompt lists them with their meanings).
- Otherwise set `quantity`, `unit`, and `quantitySource` to `null`. Never estimate, extrapolate, or measure quantities from drawing graphics.
- Write `searchQuery` as a short phrase a contractor would type into Home Depot's search (material type, size, grade), with no brand names or SKUs unless the plans specify them.

The item shape examples in both prompts are updated to show `materials` instead of `materialCategories`.

The material rules also state: only list physical materials a contractor buys — never labor, services, engineering, design, permits, inspections, submittals, or documentation — and when the same material is counted in more than one place, combine the counts into its single entry and list every source.

The aggregation prompt additionally states: merge materials into one entry per material; when the same source (the same schedule, note, or count) appears in more than one chunk, count it once; when counts come from different sheets or areas that do not overlap, add them together and list every source; and if it cannot tell whether two counts overlap, set `quantity`, `unit`, and `quantitySource` to `null`.

Unchanged: the shared estimator prompt's "Never fabricate quantities…" rule and the scope prompt's "Do not include pricing, labor hours, markup…" rule. Both are consistent with plan-supported quantities.

### Sanitization

A new exported `sanitizeScopeMaterials(materials)` is applied inside `sanitizeScopeItem`:

- Non-array input → `[]`. Non-object entries are dropped.
- `name` is trimmed; entries with an empty name are dropped.
- Entries are merged by case-insensitive trimmed `name`, keeping the first entry's `name` and `searchQuery`. Quantities merge conservatively:
  - If the first entry has no quantity and a later duplicate does, the duplicate's `quantity`, `unit`, and `quantitySource` are used.
  - If duplicates carry the same `quantity`, `unit`, and `quantitySource`, that quantity is kept.
  - If duplicates carry different quantities, units, or sources, the material's `quantity`, `unit`, and `quantitySource` become `null`, and no later duplicate can restore them. Picking either count could be wrong and adding them could double count, so no quantity is shown rather than a guess.
- `quantity` must be a finite number greater than 0; anything else (0, negative, `NaN`, strings, missing) becomes `null`.
- `unit` is trimmed and upper-cased; a value not in `MATERIAL_UNITS` is treated as missing. A quantity without a valid unit is ambiguous, so when `unit` is missing, `quantity` becomes `null` too.
- When `quantity` is `null`, `unit` and `quantitySource` are forced to `null`. Otherwise `quantitySource` is trimmed, and an empty string becomes `null`.
- `searchQuery` is trimmed, falls back to `name` when empty, and is capped at 100 characters.

Bad material data never drops the scope item: a scope item that passes the existing title / description / classification checks is kept with whatever materials survive, possibly `materials: []`. `materialCategories` is no longer written by the backend.

`sanitizeScopeMaterials` and `SCOPE_MATERIAL_RULES` are attached to the handler export alongside the existing `getScopeResponseFormat`, `getTradeScopeTemplate`, and `parseScopePayload`.

## UI Changes

### Home Depot link helper (`src/lib/homeDepot.ts`, new)

`buildHomeDepotSearchUrl(query: string): string` returns `https://www.homedepot.com/s/${encodeURIComponent(query.trim())}`.

The `/s/<query>` path could not be verified from a script (Home Depot returns `403`) and search pages are not indexed. It must be confirmed in a real browser during implementation; if the format is wrong, this function is the only place that changes.

### Material normalization helper

`getScopeMaterials(item: ScopeItem): ScopeMaterial[]` (in `src/models/PlanAnalyzerScopes.ts`) returns `item.materials` when it is an array, otherwise maps `item.materialCategories` using the legacy fallback described under Backward compatibility, otherwise `[]`.

### `PlanLedger.tsx` — spanning cells

`LedgerRow.cells` accepts either a plain `ReactNode` (current behavior) or a span cell `{ span: number; label: string; content: ReactNode }`.

- A span cell renders one `.plan-ledger-cell` with the added class `plan-ledger-cell-span`, the span passed as the CSS custom property `--ledger-cell-span` (consumed by `grid-column: span var(--ledger-cell-span)` in the stylesheet, so the narrow layout can still override it), and `data-label={label}`. The Trade scopes tab passes `label: "Materials"`.
- Column-index bookkeeping (`columns[cellIndex]` for keys and labels) must account for spans so later cells still get the correct column.
- Inside the span, content uses `display: grid; grid-template-columns: subgrid;` so each material line occupies one row across Material | Qty | Home Depot and stays aligned when a long name wraps.
- The Verification, Safety, Conflicts, and RFI tabs pass plain cells and are unaffected.

### Trade scopes tab columns (`PlanAnalyzerRun.tsx`)

| Scope item | Class | Material | Qty | Home Depot |
|---|---|---|---|---|
| `minmax(0, 2fr)` | `minmax(0, 148px)` | `minmax(0, 1.3fr)` | `minmax(0, 96px)` | `minmax(0, 104px)` |

The existing `Materials` column and its `renderListCell(item.materialCategories)` cell are replaced by one span cell covering the three new columns.

### Material lines

For each material from `getScopeMaterials(item)`:

- **Material:** the name. When `quantitySource` is present, a small muted secondary line below reads `from {quantitySource}`.
- **Qty:** `{quantity} {unit}` (e.g. `6 EA`). When `quantity` is `null`, a muted `—` with `title="Not stated on plans"`.
- **Home Depot:** a `View ↗` link to `buildHomeDepotSearchUrl(searchQuery)`, with `target="_blank"`, `rel="noopener noreferrer"`, and `aria-label="Search Home Depot for {name}"`.

When a scope item has no materials, the span cell shows a single muted `Not specified` (the existing `.plan-ledger-blank` style).

Quantities are formatted with `quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })` (so `1200` shows as `1,200` and `12.5` as `12.5`).

### Narrow screens (≤ 900px)

The column header is already hidden at this width and cells stack with `data-label` headings. The span cell stacks as a single block labeled "Materials". Each material renders as one compact line — name (and source) on the left, then quantity, then link (`grid-template-columns: minmax(0, 1fr) auto auto`) — so a material is never split across three separately labeled blocks.

### Copy

The Trade scopes subtitle is updated to mention plan-supported material quantities and Home Depot links, keeping the existing favorites / new bid guidance.

### Unchanged

Favorites and their row IDs, "Add to new bid" and `formatPlanScopeSelectionsForBid`, sticky header and collapse behavior, and group counts.

## Error Handling

- **Malformed material output:** handled by sanitization; the scope item is kept and at worst shows `Not specified`.
- **No new network dependency:** links are constructed client-side, so there is no lookup to fail, no quota, and no new module status. Scope generation success and failure behave exactly as today.
- **Legacy data:** handled by `getScopeMaterials`; the table never breaks on pre-feature results.
- **Document size:** roughly 4 materials × ~200 bytes × ~60 scope items ≈ 50 KB added to the scopes module document, well under Firestore's 1 MB limit.

## Testing

### Backend unit tests (`functions/test/plan-analyzer-trade-scopes.test.js`)

Following the existing `node:test` style:

- The response format's scope item schema has a `materials` array whose item schema requires `name`, `searchQuery`, `quantity`, `unit`, `quantitySource`, allows `null` for `quantity`, `unit`, and `quantitySource`, sets `additionalProperties: false`, and no longer contains `materialCategories`.
- `sanitizeScopeMaterials`:
  - drops entries with empty names and non-object entries; non-array input returns `[]`
  - removes case-insensitive duplicate names
  - converts `0`, negative, non-numeric, and missing quantities to `null` and clears `unit` and `quantitySource` with them
  - keeps a valid positive quantity with its unit and trimmed source, upper-casing a lower-case unit (`"ea"` → `"EA"`)
  - nulls quantity, unit, and source when the unit is missing or not in `MATERIAL_UNITS`
  - falls back `searchQuery` to `name` when empty and caps its length
- `parseScopePayload` keeps a valid scope item whose materials are malformed, with `materials: []`.
- The frontend `SCOPE_MATERIAL_UNITS` list (parsed from `src/models/PlanAnalyzerScopes.ts`) matches the backend `MATERIAL_UNITS`, in order.
- The `unit` schema's string enum equals `MATERIAL_UNITS`.
- `SCOPE_MATERIAL_RULES` states the plan-supported-only quantity rule and does not contain `broad material categories`.
- Existing tests that build scope items with `materialCategories` are updated to use `materials`.

Run with `npm test` in `functions/`.

### Frontend verification

There is no frontend test runner. Verify with `npm run typecheck`, `npm run lint`, and `npm run build`, then in the browser via `npm run dev`:

- A legacy project renders its categories as material lines with `—` quantities and working links.
- Material, Qty, and Home Depot stay aligned when a long material name wraps.
- The ≤ 900px layout shows each material as one compact line.
- A generated `homedepot.com/s/...` link opens Home Depot search results for the phrase (settles the URL format).
- The other four results tabs render unchanged.

## Release Notes

Add an entry to `src/data/releaseNotes.ts`, following the pattern of earlier Plan Analyzer entries.

## Out of Scope

- Add to cart or any cart deep link
- SerpApi or any other product lookup / scraping, and product pricing
- Carrying materials or quantities into bids
- Editing quantities in the table
- Re-running or migrating analysis for existing projects

---

## Update — 2026-09-16: calculated quantities

Plans state counts mainly in schedules, so a stated-only rule leaves most rows blank. Quantities may now be calculated, with every number labeled by how it was reached.

### Material fields

`quantitySource` is replaced by `planReference`, which is expected on **every** material whether or not it carries a quantity. Three fields are added:

| Field | Values | Notes |
|---|---|---|
| `quantityBasis` | `stated` \| `calculated` \| `inferred` \| `null` | how the number was reached; `null` only when `quantity` is `null` |
| `calculation` | `string \| null` | the working, e.g. `42 LF / 16 in. O.C. = 33 studs + 7 corners and openings = 40` |
| `confidence` | `high` \| `medium` \| `low` \| `null` | high = shown or scheduled, medium = minor calculation, low = significant assumption |

### Units (19)

`EA, LF, SF, SY, CF, CY, BF, SQ, SHEET, PC, BOX, ROLL, BAG, GAL, LB, FIXTURE, ASSEMBLY, DEVICE, OPENING`

### Prompt

- Calculate quantities whenever the plans give enough to work from; put the working in `calculation`.
- Standard construction assumptions (stud spacing, coverage, waste) are allowed as `inferred`, with the assumption named.
- Measuring or scaling off drawing graphics stays forbidden. Numbers trace to stated dimensions, schedules, notes, or counts.
- A plan reference is expected on every material.
- The merge pass no longer blanks ambiguous counts. It keeps the best-supported count, marks it `inferred`, sets confidence `low`, and explains the disagreement in `calculation`.

### Cleanup

- `planReference` is independent of quantity, and a duplicate entry can fill in a missing one.
- An unrecognized `quantityBasis` becomes `inferred`; an unrecognized `confidence` becomes `low`.
- Duplicates that disagree keep the better-supported count (`stated` > `calculated` > `inferred`, ties keep the first) and drop to `low` confidence, instead of clearing the quantity.

### Table

- Material column shows the plan reference under the name.
- Qty column shows the amount, then `basis · confidence` beneath it, with the calculation as its tooltip. Column width 96px → 150px.
- Home Depot search links are unchanged.

---

## Update — 2026-09-16 (part 2): vision on every page

Quantities stayed sparse because the analyzer mostly read extracted text. Vision ran only when text extraction came back weak, and on large sets only ~15 sampled pages. Vision now runs on every page of every upload, and quantities may come from it.

### Analysis path

- **PDFs:** every page is rendered (up to 4x, capped at 4096px / 18MP) and analyzed as its own vision call — the path previously used only for weak-text files. `choosePdfAnalysisMode`, `selectPdfVisualSamplePages`, `createSampledPdfBuffer`, `createPdfSubsetBuffer`, and `remapSampledVisualPages` are deleted, along with the 15-page and 25-page limits.
- **Images:** OCR and vision both run, merged into one page entry (`image_hybrid`), instead of vision replacing OCR only when OCR was weak.
- Text-extraction quality no longer decides *whether* vision runs, only how it is steered: weak → transcribe everything legible; strong → concentrate on counts and printed dimensions.
- Concurrency 6 → 8 (`VISUAL_PAGE_CONCURRENCY`). Higher risks exhausting the 2GiB function memory, since each page is held as an 18MP canvas, a PNG, and a base64 copy.

### Page observations

Each page returns two new fields alongside `visibleText` and `visualSummary`:

| Field | Shape | Meaning |
|---|---|---|
| `countedItems` | `[{ item, count, note }]` | what can be counted on the page — fixtures, devices, doors, windows, symbols, schedule rows — with how and where it was counted |
| `statedDimensions` | `string[]` | dimensions, areas, spacings, heights, and slopes transcribed exactly as printed |

Both are rendered into the page text as `COUNTED ITEMS` and `STATED DIMENSIONS`, so every downstream module sees them.

### Prompt rules

- The shared estimator prompt no longer forbids visual drawing interpretation. Visible text, visual summaries, counted items, and stated dimensions are evidence, the same as extracted text; extracted text wins when both describe the same thing.
- Material rules: prefer quantities the text states; when it states none, use the visual analysis's counted items and stated dimensions.
- Unchanged in spirit: no scaling or measuring distances off drawing geometry, and no inventing counts no sheet supports.

### Accepted tradeoffs

- **Cost** scales with page count — one vision call per page instead of one per file.
- **Time:** roughly page count ÷ 8 rounds inside a 20-minute step. Very large sets can exceed it and fail the analysis, consuming one of the month's quota. Chosen deliberately over capping pages.
- **Rate limits:** 8 concurrent vision calls may hit OpenAI account limits; the remedy is lowering concurrency, not code.

---

## Update — 2026-09-16 (part 3): cross-sheet evidence

A real 12-page analysis left 66 of 82 quantities blank, none calculated or inferred. Three causes: quantities needing numbers from several sheets (wall lengths on the floor plan, stud spacing on a framing detail) were split across analysis sections; the merge pass received only section results, never plan evidence; and the rules permitted calculation without requiring it.

- `buildTakeoffEvidence` collects every page's COUNTED ITEMS and STATED DIMENSIONS, labeled by the sheet number vision read, into one block. It is prepended to every section call and to the merge call (capped at 150,000 characters).
- Material rules now require attempting a quantity for every material, point to the evidence block for numbers on other sheets, and state that a calculation with its working shown is not fabrication. The shared estimator prompt says the same.
- The merge pass fills in every null quantity it can calculate from the evidence.
- A blank quantity keeps `calculation` as a note on what is missing; the table shows it on hover.
- Page entries take the sheet number and title the vision pass read, and generated section labels are excluded from sheet and title detection.

---

## Update — 2026-09-16 (part 4): a quantity on every material

A second 12-page analysis on the cross-sheet evidence code filled 30 of 89 quantities (up from 16 of 82), but 59 stayed blank. Their notes showed the rules still permitted blanks: wall lengths existed only as unlabeled dimension strings, dependent counts (hangers, straps, fasteners) waited on those, dense electrical symbols were skipped by vision, and routed lengths (wire, pipe, duct) appear on no sheet.

- The scope response format now requires `quantity` (number), `unit`, `quantityBasis`, `confidence`, and `calculation` (string) on every material. Only `planReference` may be null.
- Material rules require a quantity on every material, reached in order: stated → calculated (including totals of printed dimension strings, such as perimeter from overall dimensions or wall area as length × ceiling height) → inferred from a named standard estimating allowance (studs per LF of wall, sheathing per wall area, one hanger per joist end, wire or pipe per device or fixture). Dependent quantities are worked out first.
- Confidence: medium now covers calculation on plan numbers; low covers standard estimating allowances.
- The merge pass ensures every material in the final output has a quantity.
- The vision pass counts every repeated item and symbol, giving a best count with a note when unclear rather than omitting it, and reports totals of segmented dimension strings.
- Blank quantities remain possible only for analyses made before this change or when cleanup rejects an invalid value.

---

## Update — 2026-09-16 (part 5): measuring against printed scale bars

When no dimension is printed, lengths and areas are measured from the drawing itself using the graphic scale bars printed on the sheets. The vision model locates; code does the arithmetic.

- Page images are sent with `detail: "original"`, so GPT-5.x keeps the full render resolution.
- Each page returns `scaleBars` (`view`, `lengthFeet`, pixel `startX`/`startY`/`endX`/`endY` of the zero mark and a labeled mark) and `measurements` (`item`, `view`, `kind` length or area, ordered pixel `points`, `note`). The model is told not to convert to feet itself.
- `computeMeasuredDimensions` converts each trace with the scale bar of the same view (or the page's only scale bar): polyline length × feet per pixel for LF, shoelace polygon area × feet per pixel² for SF. Scale bars shorter than 20 px or with a non-positive length, and traces with too few points or no usable scale bar, are dropped.
- Results enter page text as MEASURED DIMENSIONS and flow into the takeoff evidence block for every section and the merge call.
- New basis `measured`, ranked stated → calculated → measured → inferred, at medium confidence. The rule against measuring off geometry becomes: measure only against a graphic scale bar; never estimate a distance by eye; never trace on views marked NOT TO SCALE.
- Accuracy depends on how precisely the model places points on dense sheets. It has not yet been checked against a trusted manual takeoff.
