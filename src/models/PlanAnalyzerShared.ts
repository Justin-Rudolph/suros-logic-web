import { Timestamp } from "firebase/firestore";

export type PlanModuleStatus =
  | "queued"
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "skipped";

export type PlanProjectStatus =
  | "uploaded"
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed";

export type PlanModuleType =
  | "overview"
  | "scopes"
  | "verification"
  | "safety"
  | "conflicts"
  | "rfi";

export type PlanProgressPhase =
  | "queued"
  | "loading"
  | "chunking"
  | "aggregating"
  | "writing"
  | "completed"
  | "failed";

export interface UploadedPlanFile {
  name: string;
  type: string;
  size: number;
  downloadURL: string;
  storagePath: string;
}

// Mirrors TRADE_KEYS / TRADE_LABELS in functions/routes/lib/tradeScopes.js. Drives the
// upload picker and the results view; keep the two lists in sync.
export const SCOPE_TRADE_LABELS = [
  { key: "demo", label: "Demo" },
  { key: "structural", label: "Structural" },
  { key: "framing", label: "Framing" },
  { key: "exterior_envelope", label: "Exterior Envelope" },
  { key: "doors_windows", label: "Doors/Windows" },
  { key: "roofing", label: "Roofing" },
  { key: "concrete_masonry", label: "Concrete/Masonry" },
  { key: "drywall_insulation", label: "Drywall/Insulation" },
  { key: "flooring_tile", label: "Flooring/Tile" },
  { key: "paint_finishes", label: "Paint/Finishes" },
  { key: "millwork_cabinets", label: "Millwork/Cabinets" },
  { key: "plumbing", label: "Plumbing" },
  { key: "electrical", label: "Electrical" },
  { key: "HVAC", label: "HVAC" },
] as const;

export type TradeKey = (typeof SCOPE_TRADE_LABELS)[number]["key"];

export const TRADE_KEYS: TradeKey[] = SCOPE_TRADE_LABELS.map(({ key }) => key);

// Projects created before trade selection existed have no selectedTrades field, and
// were analyzed across every trade.
export const getSelectedTradeKeys = (selectedTrades?: string[]): TradeKey[] => {
  if (!Array.isArray(selectedTrades) || !selectedTrades.length) {
    return TRADE_KEYS;
  }

  const requested = new Set(selectedTrades);
  const filtered = TRADE_KEYS.filter((key) => requested.has(key));

  return filtered.length ? filtered : TRADE_KEYS;
};

export interface PlanAnalysisOptions {
  verification?: boolean;
  safety?: boolean;
  conflicts?: boolean;
  rfi?: boolean;
}

export interface PlanModuleProgress {
  totalChunks: number;
  completedChunks: number;
  phase: PlanProgressPhase;
  percent?: number;
  currentChunkLabel?: string;
}

export interface PlanModuleSummary {
  moduleType: PlanModuleType;
  docPath: string;
  status: PlanModuleStatus;
  error?: string;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface PlanModuleRecordBase {
  projectId: string;
  moduleType: PlanModuleType;
  status: PlanModuleStatus;
  error?: string;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  progress?: PlanModuleProgress;
  favoriteItemIds?: string[];
}
