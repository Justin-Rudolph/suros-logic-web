const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const {
  TRADE_KEYS,
  TRADE_LABELS,
  isFullTradeSelection,
  normalizeSelectedTrades,
  selectValidTrades,
} = require("../routes/lib/tradeScopes");
const { buildEstimatorSystemPrompt } = require("../routes/lib/estimatorPrompt");
const generateScopesHandler = require("../routes/generateScopes");
const {
  getScopeResponseFormat,
  getTradeScopeTemplate,
  parseScopePayload,
} = generateScopesHandler;

test("generateScopes still exports a callable handler for index.js and the pipeline", () => {
  assert.equal(typeof generateScopesHandler, "function");
});

test("an absent selection still asks for all 14 trades", () => {
  const { schema } = getScopeResponseFormat(undefined).json_schema;

  assert.deepEqual(Object.keys(schema.properties), TRADE_KEYS);
  assert.deepEqual(getTradeScopeTemplate(undefined), getTradeScopeTemplate(TRADE_KEYS));
});

// The frontend list is TypeScript and cannot be required from here, so this parses
// the source. Blunt, but these two lists have already drifted once — the frontend
// copy had plumbing and electrical in different positions — and a comment asking for
// them to be kept in sync did not prevent it. If reformatting SCOPE_TRADE_LABELS ever
// breaks this parse, fix the regex; do not delete the test.
const FRONTEND_TRADES_PATH = path.join(
  __dirname,
  "../../src/models/PlanAnalyzerShared.ts"
);

const readFrontendTrades = () => {
  const source = readFileSync(FRONTEND_TRADES_PATH, "utf8");
  const block = source.match(/SCOPE_TRADE_LABELS = \[(.*?)\] as const;/s);

  assert.ok(block, `Could not find SCOPE_TRADE_LABELS in ${FRONTEND_TRADES_PATH}`);

  return [...block[1].matchAll(/key:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)].map(
    ([, key, label]) => ({ key, label })
  );
};

test("the frontend trade list matches the backend one, in order", () => {
  assert.deepEqual(
    readFrontendTrades(),
    TRADE_KEYS.map((key) => ({ key, label: TRADE_LABELS[key] }))
  );
});

test("every trade key has a display label", () => {
  assert.equal(TRADE_KEYS.length, 14);
  TRADE_KEYS.forEach((key) => {
    assert.equal(typeof TRADE_LABELS[key], "string");
    assert.ok(TRADE_LABELS[key].length > 0);
  });
});

test("normalizeSelectedTrades keeps only known trades in canonical order", () => {
  assert.deepEqual(normalizeSelectedTrades(["electrical", "demo", "plumbing"]), [
    "demo",
    "plumbing",
    "electrical",
  ]);
});

test("normalizeSelectedTrades drops unknown keys and duplicates", () => {
  assert.deepEqual(
    normalizeSelectedTrades(["roofing", "roofing", "landscaping", "", null, 7]),
    ["roofing"]
  );
});

test("normalizeSelectedTrades falls back to every trade when nothing usable is provided", () => {
  assert.deepEqual(normalizeSelectedTrades([]), TRADE_KEYS);
  assert.deepEqual(normalizeSelectedTrades(undefined), TRADE_KEYS);
  assert.deepEqual(normalizeSelectedTrades(["landscaping"]), TRADE_KEYS);
  assert.deepEqual(normalizeSelectedTrades("plumbing"), TRADE_KEYS);
});

test("selectValidTrades reports an empty result instead of falling back", () => {
  assert.deepEqual(selectValidTrades([]), []);
  assert.deepEqual(selectValidTrades(["landscaping"]), []);
  assert.deepEqual(selectValidTrades("plumbing"), []);
  assert.deepEqual(selectValidTrades(undefined), []);
  assert.deepEqual(selectValidTrades(["hvac"]), [], "trade keys are case sensitive");
  assert.deepEqual(selectValidTrades(["electrical", "demo"]), ["demo", "electrical"]);
});

test("isFullTradeSelection only reports true for the complete list", () => {
  assert.equal(isFullTradeSelection(TRADE_KEYS), true);
  assert.equal(isFullTradeSelection(["plumbing", "electrical"]), false);
});

test("getScopeResponseFormat asks for only the selected trades", () => {
  const format = getScopeResponseFormat(["plumbing", "electrical"]);
  const { schema } = format.json_schema;

  assert.deepEqual(Object.keys(schema.properties), ["plumbing", "electrical"]);
  assert.deepEqual(schema.required, ["plumbing", "electrical"]);
  assert.equal(schema.additionalProperties, false);
});

test("getTradeScopeTemplate seeds only the selected trades", () => {
  assert.deepEqual(getTradeScopeTemplate(["demo", "HVAC"]), { demo: [], HVAC: [] });
});

test("parseScopePayload ignores trades outside the selection", () => {
  const item = {
    title: "Rough-in supply lines",
    description: "Run new supply piping to the fixture group.",
    materialCategories: ["copper pipe"],
    classification: "confirmed",
  };

  const parsed = parseScopePayload({ plumbing: [item], roofing: [item] }, ["plumbing"]);

  assert.deepEqual(Object.keys(parsed), ["plumbing"]);
  assert.equal(parsed.plumbing.length, 1);
});

test("parseScopePayload drops malformed scope items", () => {
  const parsed = parseScopePayload(
    {
      plumbing: [
        { title: "", description: "no title", materialCategories: [], classification: "confirmed" },
        { title: "No class", description: "missing classification", materialCategories: [] },
        {
          title: "Valid",
          description: "Supported scope item.",
          materialCategories: [],
          classification: "inferred",
        },
      ],
    },
    ["plumbing"]
  );

  assert.deepEqual(
    parsed.plumbing.map((entry) => entry.title),
    ["Valid"]
  );
});

test("buildEstimatorSystemPrompt restricts analysis to a trade subset", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.", {
    selectedTrades: ["plumbing", "electrical"],
  });

  assert.match(prompt, /SELECTED TRADE SCOPES/);
  assert.match(prompt, /Plumbing/);
  assert.match(prompt, /Electrical/);
  assert.doesNotMatch(prompt, /Roofing/);
});

test("buildEstimatorSystemPrompt omits the restriction when every trade is selected", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.", { selectedTrades: TRADE_KEYS });

  assert.doesNotMatch(prompt, /SELECTED TRADE SCOPES/);
});

test("buildEstimatorSystemPrompt omits the restriction when no selection is given", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.");

  assert.doesNotMatch(prompt, /SELECTED TRADE SCOPES/);
  assert.match(prompt, /Do the thing\./);
});

test("buildEstimatorSystemPrompt keeps contractor notes alongside a trade restriction", () => {
  const prompt = buildEstimatorSystemPrompt("Do the thing.", {
    userNotes: "Slab is already poured.",
    selectedTrades: ["demo"],
  });

  assert.match(prompt, /CONTRACTOR-PROVIDED CONTEXT NOTES/);
  assert.match(prompt, /Slab is already poured\./);
  assert.match(prompt, /SELECTED TRADE SCOPES/);
});
