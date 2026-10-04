# Material Quantity Takeoff Implementation Plan

> **For agentic workers:** Execute ONE task at a time, in order. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not commit any changes. Leave all work uncommitted.** Never run `git add`, `git commit`, `git stash`, `git reset`, `git restore`, or `git checkout` — the user manages the git index themselves.

**Goal:** Replace broad material categories on each Plan Analyzer trade scope item with a material takeoff — specific materials, plan-supported quantities with units and sources, and a Home Depot search link per material — shown in aligned Material | Qty | Home Depot columns.

**Architecture:** The existing scope generation AI calls (`functions/routes/generateScopes.js`) return a `materials` array per scope item instead of `materialCategories`; the backend sanitizes it. The frontend normalizes new and legacy data with `getScopeMaterials`, builds Home Depot search URLs client-side, and renders one span cell covering three columns in the shared `PlanLedger` table, aligned with CSS subgrid.

**Tech Stack:** Firebase Cloud Functions (Node 20, CommonJS, `node:test`), OpenAI structured outputs (`json_schema`, strict), React 18 + TypeScript (Vite, `strict: false`), plain CSS.

**Spec:** `docs/superpowers/specs/2026-09-14-material-quantity-takeoff-design.md`

## Global Constraints

- **Do not commit. Do not touch the git index.** Leave all work uncommitted and unstaged.
- Quantities only from what the plans support; otherwise `quantity`, `unit`, `quantitySource` are all `null`.
- Units are exactly, in this order: `EA`, `SF`, `LF`, `SY`, `CY`, `SQ`, `GAL`, `LB`, `BOX`, `ROLL`, `BAG`, `SHEET`.
- `searchQuery` max length: 100 characters.
- Home Depot link format: `https://www.homedepot.com/s/${encodeURIComponent(query.trim())}` — no scraping, no fetching, no product lookup.
- "Add to new bid" and `functions/routes/formatPlanScopeSelectionsForBid.js` must not change.
- The Verification, Safety, Conflicts, and RFI tabs must render unchanged.
- Match surrounding code style: 2-space indent, double quotes, explanatory comments only where the reason isn't obvious.
- Baseline before this work: `npm --prefix functions test` → 133 pass / 0 fail; `npm run typecheck` → exit 0; `npx eslint src/pages/PlanAnalyzer src/models src/lib` → exit 0.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `functions/routes/generateScopes.js` | Modify | Units list, material prompt rules, item shape example, response schema, material sanitization |
| `functions/test/plan-analyzer-trade-scopes.test.js` | Modify | Backend tests for schema, sanitization, prompt rules; frontend/backend unit list sync test |
| `src/models/PlanAnalyzerScopes.ts` | Modify | `SCOPE_MATERIAL_UNITS`, `ScopeMaterialUnit`, `ScopeMaterial`, `getScopeMaterials` legacy fallback |
| `src/lib/homeDepot.ts` | Create | `buildHomeDepotSearchUrl` |
| `src/pages/PlanAnalyzer/PlanLedger.tsx` | Modify | Span cell support (`LedgerSpanCell`, `LedgerCell`) |
| `src/pages/PlanAnalyzer/PlanAnalyzer.css` | Modify | Span cell subgrid + narrow layout; material line styles |
| `src/pages/PlanAnalyzer/PlanAnalyzerRun.tsx` | Modify | Trade scopes columns, material line rendering, subtitle |
| `src/data/releaseNotes.ts` | Modify | v3.8.0 entry |

---

### Task 1: Backend material takeoff in scope generation

**Files:**
- Modify: `functions/routes/generateScopes.js`
- Test: `functions/test/plan-analyzer-trade-scopes.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (attached to the `generateScopes` handler export, alongside the existing `getScopeResponseFormat`, `getTradeScopeTemplate`, `parseScopePayload`):
  - `MATERIAL_UNITS: string[]` — `["EA","SF","LF","SY","CY","SQ","GAL","LB","BOX","ROLL","BAG","SHEET"]`
  - `SCOPE_MATERIAL_RULES: string` — prompt rules text
  - `sanitizeScopeMaterials(materials: unknown): Array<{ name: string, searchQuery: string, quantity: number|null, unit: string|null, quantitySource: string|null }>`
  - Sanitized scope items now have shape `{ title, description, materials, classification }` (no `materialCategories`).

- [ ] **Step 1: Update existing tests and add failing tests**

In `functions/test/plan-analyzer-trade-scopes.test.js`:

1a. Change the destructuring near the top from:

```js
const {
  getScopeResponseFormat,
  getTradeScopeTemplate,
  parseScopePayload,
} = generateScopesHandler;
```

to:

```js
const {
  MATERIAL_UNITS,
  SCOPE_MATERIAL_RULES,
  getScopeResponseFormat,
  getTradeScopeTemplate,
  parseScopePayload,
  sanitizeScopeMaterials,
} = generateScopesHandler;
```

1b. In the test `"parseScopePayload ignores trades outside the selection"`, replace `materialCategories: ["copper pipe"],` with:

```js
    materials: [
      {
        name: "Copper pipe",
        searchQuery: "copper pipe",
        quantity: null,
        unit: null,
        quantitySource: null,
      },
    ],
```

1c. In the test `"parseScopePayload drops malformed scope items"`, replace each of the three `materialCategories: []` occurrences with `materials: []`.

1d. Append these tests to the end of the file:

```js
const EMPTY_QUANTITY = { quantity: null, unit: null, quantitySource: null };

test("the scope item schema asks for materials with nullable quantity fields", () => {
  const { schema } = getScopeResponseFormat(["plumbing"]).json_schema;
  const itemSchema = schema.properties.plumbing.items;
  const materialSchema = itemSchema.properties.materials.items;

  assert.ok(itemSchema.required.includes("materials"));
  assert.doesNotMatch(JSON.stringify(schema), /materialCategories/);
  assert.equal(materialSchema.additionalProperties, false);
  assert.deepEqual(materialSchema.required, [
    "name",
    "searchQuery",
    "quantity",
    "unit",
    "quantitySource",
  ]);
  assert.deepEqual(materialSchema.properties.quantity.type, ["number", "null"]);
  assert.deepEqual(materialSchema.properties.quantitySource.type, ["string", "null"]);
  assert.deepEqual(materialSchema.properties.unit.anyOf, [
    { type: "string", enum: MATERIAL_UNITS },
    { type: "null" },
  ]);
});

test("MATERIAL_UNITS is the fixed takeoff unit list", () => {
  assert.deepEqual(MATERIAL_UNITS, [
    "EA",
    "SF",
    "LF",
    "SY",
    "CY",
    "SQ",
    "GAL",
    "LB",
    "BOX",
    "ROLL",
    "BAG",
    "SHEET",
  ]);
});

test("sanitizeScopeMaterials returns an empty list for non-array input", () => {
  assert.deepEqual(sanitizeScopeMaterials(undefined), []);
  assert.deepEqual(sanitizeScopeMaterials("drywall"), []);
  assert.deepEqual(sanitizeScopeMaterials({ name: "drywall" }), []);
});

test("sanitizeScopeMaterials drops non-object entries and empty names", () => {
  const materials = sanitizeScopeMaterials([
    null,
    "drywall",
    { name: "   ", searchQuery: "blank" },
    { name: "Joint compound", searchQuery: "joint compound", ...EMPTY_QUANTITY },
  ]);

  assert.deepEqual(
    materials.map(({ name }) => name),
    ["Joint compound"]
  );
});

test("sanitizeScopeMaterials removes duplicate names regardless of case", () => {
  const materials = sanitizeScopeMaterials([
    { name: "Copper pipe", searchQuery: "copper pipe", ...EMPTY_QUANTITY },
    { name: "  copper PIPE ", searchQuery: "copper pipe 1/2", ...EMPTY_QUANTITY },
  ]);

  assert.equal(materials.length, 1);
  assert.equal(materials[0].name, "Copper pipe");
});

test("sanitizeScopeMaterials keeps a valid quantity and upper-cases its unit", () => {
  const [material] = sanitizeScopeMaterials([
    {
      name: "Prehung interior door",
      searchQuery: "  prehung interior door 30 x 80 ",
      quantity: 6,
      unit: "ea",
      quantitySource: " Door schedule, A-601 ",
    },
  ]);

  assert.deepEqual(material, {
    name: "Prehung interior door",
    searchQuery: "prehung interior door 30 x 80",
    quantity: 6,
    unit: "EA",
    quantitySource: "Door schedule, A-601",
  });
});

test("sanitizeScopeMaterials nulls quantity, unit, and source for invalid quantities", () => {
  [0, -3, "6", Number.NaN, Infinity, undefined, null].forEach((quantity) => {
    const [material] = sanitizeScopeMaterials([
      {
        name: "Lever passage set",
        searchQuery: "lever passage set",
        quantity,
        unit: "EA",
        quantitySource: "Door schedule",
      },
    ]);

    assert.deepEqual(
      { quantity: material.quantity, unit: material.unit, quantitySource: material.quantitySource },
      EMPTY_QUANTITY,
      `quantity ${String(quantity)} should be cleared`
    );
  });
});

test("sanitizeScopeMaterials nulls quantity when the unit is missing or not allowed", () => {
  ["pcs", "", null, undefined].forEach((unit) => {
    const [material] = sanitizeScopeMaterials([
      {
        name: "Door shims",
        searchQuery: "door shims",
        quantity: 12,
        unit,
        quantitySource: "Door schedule",
      },
    ]);

    assert.deepEqual(
      { quantity: material.quantity, unit: material.unit, quantitySource: material.quantitySource },
      EMPTY_QUANTITY,
      `unit ${String(unit)} should clear the quantity`
    );
  });
});

test("sanitizeScopeMaterials nulls an empty quantity source but keeps the quantity", () => {
  const [material] = sanitizeScopeMaterials([
    { name: "Duplex receptacle", searchQuery: "duplex receptacle", quantity: 14, unit: "EA", quantitySource: "  " },
  ]);

  assert.equal(material.quantity, 14);
  assert.equal(material.unit, "EA");
  assert.equal(material.quantitySource, null);
});

test("sanitizeScopeMaterials falls back to the name for an empty search phrase and caps its length", () => {
  const [fallback, capped] = sanitizeScopeMaterials([
    { name: "5/8 in. Type X gypsum board", searchQuery: "   ", ...EMPTY_QUANTITY },
    { name: "Long phrase material", searchQuery: "a".repeat(150), ...EMPTY_QUANTITY },
  ]);

  assert.equal(fallback.searchQuery, "5/8 in. Type X gypsum board");
  assert.equal(capped.searchQuery.length, 100);
});

test("parseScopePayload keeps a scope item whose materials are malformed", () => {
  const parsed = parseScopePayload(
    {
      plumbing: [
        {
          title: "Set fixtures",
          description: "Set and connect scheduled fixtures.",
          materials: "not an array",
          classification: "confirmed",
        },
      ],
    },
    ["plumbing"]
  );

  assert.equal(parsed.plumbing.length, 1);
  assert.deepEqual(parsed.plumbing[0].materials, []);
  assert.equal("materialCategories" in parsed.plumbing[0], false);
});

test("SCOPE_MATERIAL_RULES limits quantities to what the plans support", () => {
  assert.match(SCOPE_MATERIAL_RULES, /Never estimate, extrapolate, or measure quantities/);
  assert.match(SCOPE_MATERIAL_RULES, /quantitySource/);
  MATERIAL_UNITS.forEach((unit) => {
    assert.match(SCOPE_MATERIAL_RULES, new RegExp(`\\b${unit}\\b`));
  });
});

test("the scope prompts no longer ask for broad material categories", () => {
  const source = readFileSync(path.join(__dirname, "../routes/generateScopes.js"), "utf8");

  assert.doesNotMatch(source, /broad material categories/i);
  assert.doesNotMatch(source, /materialCategories/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix functions test 2>&1 | tail -20`
Expected: FAIL — new tests fail (e.g. `sanitizeScopeMaterials is not a function`, `Cannot read properties of undefined (reading 'items')`, source still matches `broad material categories`).

- [ ] **Step 3: Add units, material rules, and item shape constants**

In `functions/routes/generateScopes.js`, directly after the line `const MAX_PROJECT_CONTEXT_LENGTH = 75000;`, add:

```js
const MAX_MATERIAL_SEARCH_QUERY_LENGTH = 100;

// Mirrors SCOPE_MATERIAL_UNITS in src/models/PlanAnalyzerScopes.ts; a test keeps the
// two lists identical. Key order is the unit order.
const MATERIAL_UNIT_LABELS = {
  EA: "each",
  SF: "square feet",
  LF: "linear feet",
  SY: "square yards",
  CY: "cubic yards",
  SQ: "roofing squares, 100 SF",
  GAL: "gallons",
  LB: "pounds",
  BOX: "boxes",
  ROLL: "rolls",
  BAG: "bags",
  SHEET: "sheets",
};

const MATERIAL_UNITS = Object.keys(MATERIAL_UNIT_LABELS);
const MATERIAL_UNIT_SET = new Set(MATERIAL_UNITS);

const SCOPE_MATERIAL_RULES = `
Material takeoff rules:
- List the specific materials each scope item requires in "materials", one entry per distinct material.
- "name" is the specific material as a contractor would write it on a takeoff, including type, size, and grade when the plans give them.
- Provide "quantity" only when the plans state it or it can be counted directly from the provided context: schedules, keynotes, fixture or device counts, or stated dimensions and areas. Name that source in "quantitySource", for example "Door schedule, A-601".
- When a quantity is given, "unit" must be one of: ${MATERIAL_UNITS.map(
  (unit) => `${unit} (${MATERIAL_UNIT_LABELS[unit]})`
).join(", ")}.
- Otherwise set "quantity", "unit", and "quantitySource" to null. Never estimate, extrapolate, or measure quantities from drawing graphics.
- "searchQuery" is a short phrase a contractor would type into Home Depot's search: material type, size, and grade. Do not include brand names or SKUs unless the plans specify them.
`;

// Chunks are reviewed independently, so the same schedule can reach the aggregator
// several times. Summing those repeats would multiply real counts.
const SCOPE_MATERIAL_AGGREGATION_RULES = `
- Merge the materials of deduplicated scope items. When the same schedule, note, or count appears in more than one chunk, count it once. Do not add the counts together. Keep the best-supported quantity and its source.
`;

const SCOPE_ITEM_SHAPE_EXAMPLE = `{
    "title": "short scope title",
    "description": "contractor-style scope description",
    "materials": [
      {
        "name": "specific material",
        "searchQuery": "Home Depot search phrase",
        "quantity": number | null,
        "unit": ${MATERIAL_UNITS.map((unit) => `"${unit}"`).join(" | ")} | null,
        "quantitySource": "plan source for the quantity" | null
      }
    ],
    "classification": "confirmed" | "inferred" | "unknown"
  }`;
```

- [ ] **Step 4: Add material sanitization and use it in `sanitizeScopeItem`**

Directly above `const sanitizeScopeItem = (item) => {`, add:

```js
const toPositiveQuantity = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

const sanitizeScopeMaterials = (materials) => {
  if (!Array.isArray(materials)) {
    return [];
  }

  const seenNames = new Set();

  return materials.reduce((acc, material) => {
    if (!material || typeof material !== "object") {
      return acc;
    }

    const name = String(material.name || "").trim();
    const nameKey = name.toLowerCase();

    if (!name || seenNames.has(nameKey)) {
      return acc;
    }

    seenNames.add(nameKey);

    const unitCandidate = String(material.unit || "").trim().toUpperCase();
    const unit = MATERIAL_UNIT_SET.has(unitCandidate) ? unitCandidate : null;
    // A number without a unit could mean doors, boxes, or feet, so it is not kept.
    const quantity = unit ? toPositiveQuantity(material.quantity) : null;
    const hasQuantity = quantity !== null;
    const searchQuery = (String(material.searchQuery || "").trim() || name)
      .slice(0, MAX_MATERIAL_SEARCH_QUERY_LENGTH)
      .trim();

    acc.push({
      name,
      searchQuery,
      quantity,
      unit: hasQuantity ? unit : null,
      quantitySource: hasQuantity ? String(material.quantitySource || "").trim() || null : null,
    });

    return acc;
  }, []);
};
```

Then replace the body of `sanitizeScopeItem` so it reads:

```js
const sanitizeScopeItem = (item) => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const title = String(item.title || "").trim();
  const description = String(item.description || "").trim();
  const classification = String(item.classification || "").trim();

  if (!title || !description || !ALLOWED_CLASSIFICATIONS.has(classification)) {
    return null;
  }

  return {
    title,
    description,
    materials: sanitizeScopeMaterials(item.materials),
    classification,
  };
};
```

`uniqueStrings` was only used for `materialCategories`. Run `grep -n uniqueStrings functions/routes/generateScopes.js`; if the only remaining hit is the import line, remove `uniqueStrings,` from the `require("./lib/planAnalyzerContext")` destructuring.

- [ ] **Step 5: Update the response schema**

In `getScopeResponseFormat`, replace the whole `const scopeItemSchema = { ... };` declaration with:

```js
  const materialSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: {
        type: "string",
      },
      searchQuery: {
        type: "string",
      },
      quantity: {
        type: ["number", "null"],
      },
      unit: {
        anyOf: [{ type: "string", enum: [...MATERIAL_UNITS] }, { type: "null" }],
      },
      quantitySource: {
        type: ["string", "null"],
      },
    },
    required: ["name", "searchQuery", "quantity", "unit", "quantitySource"],
  };

  const scopeItemSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: {
        type: "string",
      },
      description: {
        type: "string",
      },
      materials: {
        type: "array",
        items: materialSchema,
      },
      classification: {
        type: "string",
        enum: ["confirmed", "inferred", "unknown"],
      },
    },
    required: ["title", "description", "materials", "classification"],
  };
```

- [ ] **Step 6: Update the chunk prompt**

In the chunk-level `buildEstimatorSystemPrompt(` template inside `generateTradeScopesFromPlans`:

6a. Delete the line:

```
- Include materials only as broad material categories, not exact quantities.
```

6b. Replace this block:

```
- Each item must be:
  {
    "title": "short scope title",
    "description": "contractor-style scope description",
    "materialCategories": ["string"],
    "classification": "confirmed" | "inferred" | "unknown"
  }
```

with:

```
${SCOPE_MATERIAL_RULES}
- Each item must be:
  ${SCOPE_ITEM_SHAPE_EXAMPLE}
```

- [ ] **Step 7: Update the aggregation prompt**

In the aggregation `buildEstimatorSystemPrompt(` template, replace this block:

```
- Return empty arrays for trades with no meaningful supported scope.
- Each item must be:
  {
    "title": "short scope title",
    "description": "contractor-style scope description",
    "materialCategories": ["string"],
    "classification": "confirmed" | "inferred" | "unknown"
  }
```

with:

```
- Return empty arrays for trades with no meaningful supported scope.
${SCOPE_MATERIAL_RULES}${SCOPE_MATERIAL_AGGREGATION_RULES}
- Each item must be:
  ${SCOPE_ITEM_SHAPE_EXAMPLE}
```

- [ ] **Step 8: Export the new helpers**

At the bottom of the file, after `module.exports.parseScopePayload = parseScopePayload;`, add:

```js
module.exports.MATERIAL_UNITS = MATERIAL_UNITS;
module.exports.SCOPE_MATERIAL_RULES = SCOPE_MATERIAL_RULES;
module.exports.sanitizeScopeMaterials = sanitizeScopeMaterials;
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm --prefix functions test 2>&1 | tail -12`
Expected: PASS — `# fail 0`, pass count = 133 + the 13 new tests (146).

Also run: `grep -n 'materialCategories\|broad material' functions/routes/generateScopes.js`
Expected: no output.

- [ ] **Step 10: Checkpoint — do not commit.** Report the test summary line.

---

### Task 2: Frontend material model, Home Depot link helper, unit list sync test

**Files:**
- Modify: `src/models/PlanAnalyzerScopes.ts`
- Create: `src/lib/homeDepot.ts`
- Modify: `src/pages/PlanAnalyzer/PlanAnalyzerRun.tsx` (one-line null guard)
- Test: `functions/test/plan-analyzer-trade-scopes.test.js`

**Interfaces:**
- Consumes: `MATERIAL_UNITS` exported from `functions/routes/generateScopes.js` (Task 1), already destructured at the top of the test file.
- Produces:
  - `SCOPE_MATERIAL_UNITS` (readonly tuple), `type ScopeMaterialUnit`
  - `interface ScopeMaterial { name: string; searchQuery: string; quantity: number | null; unit: ScopeMaterialUnit | null; quantitySource: string | null; }`
  - `ScopeItem.materials?: ScopeMaterial[]`, `ScopeItem.materialCategories?: string[]`
  - `getScopeMaterials(item: ScopeItem): ScopeMaterial[]` — from `@/models/PlanAnalyzerScopes`
  - `buildHomeDepotSearchUrl(query: string): string` — from `@/lib/homeDepot`

- [ ] **Step 1: Write the failing sync test**

Append to `functions/test/plan-analyzer-trade-scopes.test.js`:

```js
// Same reasoning as the trade list test above: the frontend unit list is TypeScript,
// so it is parsed from source. If reformatting breaks the parse, fix the regex.
const FRONTEND_SCOPES_PATH = path.join(__dirname, "../../src/models/PlanAnalyzerScopes.ts");

test("the frontend material unit list matches the backend one, in order", () => {
  const source = readFileSync(FRONTEND_SCOPES_PATH, "utf8");
  const block = source.match(/SCOPE_MATERIAL_UNITS = \[(.*?)\] as const;/s);

  assert.ok(block, `Could not find SCOPE_MATERIAL_UNITS in ${FRONTEND_SCOPES_PATH}`);
  assert.deepEqual(
    [...block[1].matchAll(/"([^"]+)"/g)].map(([, unit]) => unit),
    MATERIAL_UNITS
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix functions test 2>&1 | grep -A3 'material unit list'`
Expected: FAIL with `Could not find SCOPE_MATERIAL_UNITS`.

- [ ] **Step 3: Replace the scopes model**

Replace the entire contents of `src/models/PlanAnalyzerScopes.ts` with:

```ts
import { PlanModuleRecordBase } from "./PlanAnalyzerShared";

// Mirrors MATERIAL_UNITS in functions/routes/generateScopes.js. A functions test
// parses this list from source to keep the two in sync.
export const SCOPE_MATERIAL_UNITS = [
  "EA",
  "SF",
  "LF",
  "SY",
  "CY",
  "SQ",
  "GAL",
  "LB",
  "BOX",
  "ROLL",
  "BAG",
  "SHEET",
] as const;

export type ScopeMaterialUnit = (typeof SCOPE_MATERIAL_UNITS)[number];

export interface ScopeMaterial {
  name: string;
  /** Phrase used to build the Home Depot search link. */
  searchQuery: string;
  /** Only set when the plans support it; unit and quantitySource are null whenever this is. */
  quantity: number | null;
  unit: ScopeMaterialUnit | null;
  /** Where the quantity came from, e.g. "Door schedule, A-601". */
  quantitySource: string | null;
}

export interface ScopeItem {
  title: string;
  description: string;
  materials?: ScopeMaterial[];
  /** Written before material takeoff existed. Read only as a fallback for older projects. */
  materialCategories?: string[];
  classification: "confirmed" | "inferred" | "unknown";
}

export type ScopeResult = Record<string, ScopeItem[]>;

export interface PlanScopesModuleRecord extends PlanModuleRecordBase {
  moduleType: "scopes";
  result?: ScopeResult;
}

/**
 * The materials to show for a scope item. Projects analyzed before takeoff only
 * stored category names, so those become materials with no quantity rather than
 * requiring the analysis to be run again.
 */
export const getScopeMaterials = (item: ScopeItem): ScopeMaterial[] => {
  if (Array.isArray(item.materials)) {
    return item.materials;
  }

  if (Array.isArray(item.materialCategories)) {
    return item.materialCategories
      .map((category) => String(category || "").trim())
      .filter(Boolean)
      .map((category) => ({
        name: category,
        searchQuery: category,
        quantity: null,
        unit: null,
        quantitySource: null,
      }));
  }

  return [];
};
```

- [ ] **Step 4: Create the Home Depot link helper**

Create `src/lib/homeDepot.ts`:

```ts
const HOME_DEPOT_SEARCH_URL = "https://www.homedepot.com/s/";

/**
 * Home Depot's own search results for a material. Nothing is fetched: Home Depot
 * blocks scripted requests and its terms prohibit scraping, so this only builds
 * the URL the contractor's browser opens.
 */
export const buildHomeDepotSearchUrl = (query: string) =>
  `${HOME_DEPOT_SEARCH_URL}${encodeURIComponent(String(query || "").trim())}`;
```

- [ ] **Step 5: Guard the one existing `materialCategories` read**

`materialCategories` is now optional. In `src/pages/PlanAnalyzer/PlanAnalyzerRun.tsx`, change:

```tsx
              renderListCell(item.materialCategories),
```

to:

```tsx
              renderListCell(item.materialCategories ?? []),
```

(Task 4 replaces this cell entirely; this keeps the app working in between.)

- [ ] **Step 6: Verify**

Run: `npm --prefix functions test 2>&1 | tail -12`
Expected: `# fail 0`, 147 pass.

Run: `npm run typecheck`
Expected: exit 0, no errors.

Run: `npx eslint src/models/PlanAnalyzerScopes.ts src/lib/homeDepot.ts src/pages/PlanAnalyzer/PlanAnalyzerRun.tsx`
Expected: exit 0, no errors.

- [ ] **Step 7: Checkpoint — do not commit.** Report the three command results.

---

### Task 3: Span cells in the shared results table

**Files:**
- Modify: `src/pages/PlanAnalyzer/PlanLedger.tsx`
- Modify: `src/pages/PlanAnalyzer/PlanAnalyzer.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (exported from `./PlanLedger`):
  - `type LedgerSpanCell = { span: number; label: string; content: ReactNode }`
  - `type LedgerCell = ReactNode | LedgerSpanCell`
  - `LedgerRow.cells: LedgerCell[]`
  - A span cell renders `<div class="plan-ledger-cell plan-ledger-cell-span" style="--ledger-cell-span: N" data-label={label}>`; its children are laid out on the row's column tracks via `grid-template-columns: subgrid`.

There is no frontend test runner; verification is typecheck + lint, and the existing tabs must be unaffected (they pass plain cells).

- [ ] **Step 1: Add the span cell types and layout helper**

In `src/pages/PlanAnalyzer/PlanLedger.tsx`:

1a. Change the first import line from:

```tsx
import { ReactNode, useLayoutEffect, useRef, useState } from "react";
```

to:

```tsx
import { ReactNode, isValidElement, useLayoutEffect, useRef, useState } from "react";
```

1b. Replace the `LedgerRow` type:

```tsx
export type LedgerRow = {
  id: string;
  /** Plain-text name for the row, used by the mark button's screen reader label. */
  label: string;
  cells: ReactNode[];
};
```

with:

```tsx
/**
 * A cell covering several adjacent columns. Its children sit on those columns'
 * tracks through CSS subgrid, so a child row stays level across the covered
 * columns even when one of its values wraps.
 */
export type LedgerSpanCell = {
  span: number;
  /** Heading for the cell in the stacked narrow layout, in place of the covered columns' labels. */
  label: string;
  content: ReactNode;
};

export type LedgerCell = ReactNode | LedgerSpanCell;

export type LedgerRow = {
  id: string;
  /** Plain-text name for the row, used by the mark button's screen reader label. */
  label: string;
  cells: LedgerCell[];
};
```

1c. Directly after `const formatMark = (index: number) => padNumber(index + 1);`, add:

```tsx
const isSpanCell = (cell: LedgerCell): cell is LedgerSpanCell =>
  typeof cell === "object" &&
  cell !== null &&
  !isValidElement(cell) &&
  "span" in cell &&
  "content" in cell;

/** Pairs each cell with the column it starts in, advancing past the columns a span covers. */
const layoutCells = (cells: LedgerCell[], columns: LedgerColumn[]) => {
  let columnIndex = 0;

  return cells.map((cell) => {
    const column = columns[columnIndex];
    const span = isSpanCell(cell) ? Math.max(1, cell.span) : 1;
    const key = column?.key || String(columnIndex);
    const label = isSpanCell(cell) ? cell.label : column?.label;
    const content = isSpanCell(cell) ? cell.content : cell;

    columnIndex += span;

    return { key, label, span, content };
  });
};
```

- [ ] **Step 2: Render cells through the layout helper**

Replace this block in the row rendering:

```tsx
                      {row.cells.map((cell, cellIndex) => (
                        <div
                          key={columns[cellIndex]?.key || cellIndex}
                          className="plan-ledger-cell"
                          data-label={columns[cellIndex]?.label}
                        >
                          {cell}
                        </div>
                      ))}
```

with:

```tsx
                      {layoutCells(row.cells, columns).map((cell) => (
                        <div
                          key={cell.key}
                          className={`plan-ledger-cell${
                            cell.span > 1 ? " plan-ledger-cell-span" : ""
                          }`}
                          style={
                            cell.span > 1
                              ? ({ "--ledger-cell-span": cell.span } as React.CSSProperties)
                              : undefined
                          }
                          data-label={cell.label}
                        >
                          {cell.content}
                        </div>
                      ))}
```

- [ ] **Step 3: Add the span cell CSS**

In `src/pages/PlanAnalyzer/PlanAnalyzer.css`, directly after the `.plan-ledger-cell { ... }` rule (the one with `min-width: 0; font-size: 13.5px;`, around line 1667), add:

```css
/* The span is a custom property rather than an inline grid-column so the
   narrow layout below can still pull the cell back into the single content
   column. */
.plan-ledger-cell-span {
  grid-column: span var(--ledger-cell-span, 1);
  display: grid;
  grid-template-columns: subgrid;
  align-items: start;
  row-gap: 10px;
}
```

Then inside the existing `@media (max-width: 900px) { ... }` block that contains `.plan-ledger-cell { grid-column: 2; }` (around line 1924), directly after the `.plan-ledger-cell + .plan-ledger-cell::before { ... }` rule, add:

```css
  .plan-ledger-cell-span {
    grid-column: 2;
    grid-template-columns: minmax(0, 1fr) auto auto;
    column-gap: 12px;
  }

  /* The stacked heading is a grid item here; keep it on its own full-width row. */
  .plan-ledger-cell-span::before {
    grid-column: 1 / -1;
  }
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npx eslint src/pages/PlanAnalyzer/PlanLedger.tsx`
Expected: exit 0.

Run: `grep -n 'plan-ledger-cell-span' src/pages/PlanAnalyzer/PlanAnalyzer.css`
Expected: three hits — the base rule, the narrow-layout rule, and the `::before` rule, with the latter two inside the `max-width: 900px` block.

- [ ] **Step 5: Checkpoint — do not commit.** Report results.

---

### Task 4: Material, Qty, and Home Depot columns in the Trade scopes tab

**Files:**
- Modify: `src/pages/PlanAnalyzer/PlanAnalyzerRun.tsx`
- Modify: `src/pages/PlanAnalyzer/PlanAnalyzer.css`
- Modify: `src/data/releaseNotes.ts`

**Interfaces:**
- Consumes:
  - `ScopeMaterial`, `getScopeMaterials(item: ScopeItem): ScopeMaterial[]` from `@/models/PlanAnalyzerScopes` (Task 2)
  - `buildHomeDepotSearchUrl(query: string): string` from `@/lib/homeDepot` (Task 2)
  - Span cells `{ span: number; label: string; content: ReactNode }` accepted in `LedgerRow.cells` (Task 3); children of a span cell sit on its subgrid tracks.
- Produces: final UI. Nothing downstream.

- [ ] **Step 1: Update imports**

In `src/pages/PlanAnalyzer/PlanAnalyzerRun.tsx`, replace:

```tsx
import { ScopeItem, ScopeResult, PlanScopesModuleRecord } from "@/models/PlanAnalyzerScopes";
```

with:

```tsx
import {
  ScopeItem,
  ScopeMaterial,
  ScopeResult,
  PlanScopesModuleRecord,
  getScopeMaterials,
} from "@/models/PlanAnalyzerScopes";
```

and add, directly after the `import { getFunctionsBaseUrl } from "@/lib/functionsApi";` line:

```tsx
import { buildHomeDepotSearchUrl } from "@/lib/homeDepot";
```

- [ ] **Step 2: Add the material line renderer**

Directly after the `renderListCell` definition (the arrow function ending with `<span className="plan-ledger-blank">Not specified</span>` and `);`), add:

```tsx
  const formatMaterialQuantity = (material: ScopeMaterial) => {
    const amount = material.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return material.unit ? `${amount} ${material.unit}` : amount;
  };

  /**
   * One line per material across the Material, Qty, and Home Depot columns. Each
   * line is display: contents, so its three parts land directly on the span
   * cell's subgrid tracks and stay level with each other.
   */
  const renderMaterialLines = (item: ScopeItem) => {
    const materials = getScopeMaterials(item);

    if (!materials.length) {
      return <span className="plan-ledger-blank">Not specified</span>;
    }

    return materials.map((material, index) => (
      <div key={`${material.name}-${index}`} className="plan-material-line">
        <div className="plan-material-name">
          <span>{material.name}</span>
          {material.quantitySource ? (
            <span className="plan-material-source">from {material.quantitySource}</span>
          ) : null}
        </div>
        <div className="plan-material-qty">
          {material.quantity == null ? (
            <span className="plan-ledger-blank" title="Not stated on plans">
              <span aria-hidden="true">—</span>
              <span className="sr-only">Not stated on plans</span>
            </span>
          ) : (
            formatMaterialQuantity(material)
          )}
        </div>
        <a
          className="plan-material-link"
          href={buildHomeDepotSearchUrl(material.searchQuery || material.name)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Search Home Depot for ${material.name}`}
        >
          View <span aria-hidden="true">↗</span>
        </a>
      </div>
    ));
  };
```

- [ ] **Step 3: Replace the Trade scopes columns, cell, and subtitle**

In `renderTradeScopesTab`, replace:

```tsx
        subtitle:
          "Bid-ready scope items grouped by trade. Favorite the ones you want, then send them to a new bid.",
```

with:

```tsx
        subtitle:
          "Bid-ready scope items grouped by trade, with the materials each one needs, quantities where the plans state them, and a Home Depot search link for each material. Favorite the ones you want, then send them to a new bid.",
```

Replace:

```tsx
        columns: [
          { key: "item", label: "Scope item", width: "minmax(0, 2.2fr)" },
          { key: "class", label: "Class", width: "minmax(0, 148px)" },
          { key: "materials", label: "Materials", width: "minmax(0, 1.1fr)" },
        ],
```

with:

```tsx
        columns: [
          { key: "item", label: "Scope item", width: "minmax(0, 2fr)" },
          { key: "class", label: "Class", width: "minmax(0, 148px)" },
          { key: "material", label: "Material", width: "minmax(0, 1.3fr)" },
          { key: "qty", label: "Qty", width: "minmax(0, 96px)" },
          { key: "homeDepot", label: "Home Depot", width: "minmax(0, 104px)" },
        ],
```

Replace:

```tsx
              renderListCell(item.materialCategories ?? []),
```

with:

```tsx
              { span: 3, label: "Materials", content: renderMaterialLines(item) },
```

Do NOT remove `renderListCell` — the Conflicts tab still uses it for `involvedTrades` and `sourceSheets`.

- [ ] **Step 4: Add material line CSS**

In `src/pages/PlanAnalyzer/PlanAnalyzer.css`, directly after the `.plan-ledger-cell-span { ... }` base rule added in Task 3 (outside any media query), add:

```css
/* -- Material takeoff lines (Trade scopes) ---------------------------------- */

.plan-material-line {
  display: contents;
}

.plan-material-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.plan-material-source {
  font-size: 11.5px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.44);
}

.plan-material-qty {
  font-family: var(--ledger-mono);
  font-size: 12px;
  white-space: nowrap;
  color: #ffffff;
}

.plan-material-link {
  justify-self: start;
  font-family: var(--ledger-mono);
  font-size: 11.5px;
  letter-spacing: 0.04em;
  white-space: nowrap;
  color: var(--ledger-accent);
  text-decoration: none;
}

.plan-material-link:hover {
  text-decoration: underline;
}

.plan-material-link:focus-visible {
  outline: 2px solid var(--ledger-accent);
  outline-offset: 2px;
  border-radius: 2px;
}
```

- [ ] **Step 5: Add the release note**

In `src/data/releaseNotes.ts`, insert this as the first element of the `releases` array (directly after `export const releases = [`):

```ts
  {
    version: "v3.8.0",
    date: "September 14, 2026",
    highlights: [
      "Added a material takeoff to Plan Analyzer trade scopes. Each scope item now lists the specific materials it needs in its own Material column.",
      "Quantities appear in a new Qty column only when the plans support them, such as counts from a door or fixture schedule, and each one notes the schedule or sheet it came from. Quantities the plans don't state are left blank rather than guessed.",
      "Added a Home Depot column with a link for every material that opens Home Depot's search results for it in a new tab.",
      "Projects analyzed before this update still show their materials, with Home Depot links, without needing to be run again.",
    ],
  },
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npx eslint src/pages/PlanAnalyzer src/models src/lib src/data/releaseNotes.ts`
Expected: exit 0.

Run: `npm run build 2>&1 | tail -8`
Expected: build completes (`✓ built in ...`), no errors.

Run: `grep -n 'materialCategories' src/pages/PlanAnalyzer/PlanAnalyzerRun.tsx`
Expected: no output.

- [ ] **Step 7: Checkpoint — do not commit.** Report results.

---

### Task 5: Final verification (main session, not a subagent)

- [ ] `npm --prefix functions test` → `# fail 0`, 147 pass
- [ ] `npm run typecheck` → exit 0
- [ ] `npx eslint src/pages/PlanAnalyzer src/models src/lib src/data/releaseNotes.ts` → exit 0
- [ ] `npm run build` → succeeds
- [ ] `git diff --stat` shows only the files in the File Structure table plus the spec and plan docs; `git diff --staged` is empty
- [ ] Browser (`npm run dev`): open an existing analyzed project's Trade scopes tab — legacy categories render as material lines with `—` quantities and working links; the other four tabs look unchanged; at ≤ 900px each material is one compact line
- [ ] Open a generated `https://www.homedepot.com/s/...` link in a real browser and confirm it lands on Home Depot search results (settles the URL format; if wrong, change only `src/lib/homeDepot.ts`)
