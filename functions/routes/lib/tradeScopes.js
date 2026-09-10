// Canonical trade scope list shared by the scope generator, the prompt builder, and
// the upload finalizer. Keep this in sync with SCOPE_TRADE_LABELS in
// src/models/PlanAnalyzerShared.ts, which drives the picker and the results view.
const TRADE_KEYS = [
  "demo",
  "structural",
  "framing",
  "exterior_envelope",
  "doors_windows",
  "roofing",
  "concrete_masonry",
  "drywall_insulation",
  "flooring_tile",
  "paint_finishes",
  "millwork_cabinets",
  "plumbing",
  "electrical",
  "HVAC",
];

const TRADE_LABELS = {
  demo: "Demo",
  structural: "Structural",
  framing: "Framing",
  exterior_envelope: "Exterior Envelope",
  doors_windows: "Doors/Windows",
  roofing: "Roofing",
  concrete_masonry: "Concrete/Masonry",
  drywall_insulation: "Drywall/Insulation",
  flooring_tile: "Flooring/Tile",
  paint_finishes: "Paint/Finishes",
  millwork_cabinets: "Millwork/Cabinets",
  plumbing: "Plumbing",
  electrical: "Electrical",
  HVAC: "HVAC",
};

// Intersects a requested list with the canonical one, in canonical order. Returns an
// empty array when nothing matches — callers decide what that means.
const selectValidTrades = (selectedTrades) => {
  if (!Array.isArray(selectedTrades)) {
    return [];
  }

  const requested = new Set(selectedTrades.filter((trade) => typeof trade === "string"));

  return TRADE_KEYS.filter((trade) => requested.has(trade));
};

// For READ paths. Falls back to the full list so projects saved before trade selection
// existed keep their original behavior. Write paths should use selectValidTrades and
// reject an empty result instead — see finalizePlanAnalysisUpload.
const normalizeSelectedTrades = (selectedTrades) => {
  if (!Array.isArray(selectedTrades)) {
    return [...TRADE_KEYS];
  }

  const normalized = selectValidTrades(selectedTrades);

  return normalized.length ? normalized : [...TRADE_KEYS];
};

const isFullTradeSelection = (selectedTrades) =>
  normalizeSelectedTrades(selectedTrades).length === TRADE_KEYS.length;

const getTradeLabel = (trade) => TRADE_LABELS[trade] || String(trade || "").trim();

const formatTradeLabelList = (selectedTrades) =>
  normalizeSelectedTrades(selectedTrades).map(getTradeLabel).join(", ");

module.exports = {
  TRADE_KEYS,
  TRADE_LABELS,
  formatTradeLabelList,
  getTradeLabel,
  isFullTradeSelection,
  normalizeSelectedTrades,
  selectValidTrades,
};
