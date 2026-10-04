import { PlanModuleRecordBase } from "./PlanAnalyzerShared";

export type QuantityBasis = "stated" | "calculated" | "measured" | "inferred";
export type QuantityConfidence = "high" | "medium" | "low";

export interface ScopeMaterial {
  name: string;
  /** Home Depot search phrase. */
  searchQuery: string;
  /** Null when the plans support no quantity, along with unit, basis, and confidence. */
  quantity: number | null;
  /** One of MATERIAL_UNITS in functions/routes/generateScopes.js. */
  unit: string | null;
  /** stated = given by the plans, calculated = math on printed numbers, measured = traced against the sheet's scale bar, inferred = estimating allowance. */
  quantityBasis: QuantityBasis | null;
  /** The working behind the quantity, or what is missing when there is none. */
  calculation: string | null;
  confidence: QuantityConfidence | null;
  /** Sheet, detail, schedule, or keynote the material comes from. */
  planReference: string | null;
}

export interface ScopeItem {
  title: string;
  description: string;
  materials?: ScopeMaterial[];
  /** Legacy category names, used when materials is absent. */
  materialCategories?: string[];
  classification: "confirmed" | "inferred" | "unknown";
}

export type ScopeResult = Record<string, ScopeItem[]>;

export interface PlanScopesModuleRecord extends PlanModuleRecordBase {
  moduleType: "scopes";
  result?: ScopeResult;
}

/** A scope item's materials, or its legacy category names as materials with no quantity. */
export const getScopeMaterials = (item: ScopeItem): ScopeMaterial[] =>
  item.materials ??
  (item.materialCategories ?? []).map((category) => ({
    name: category,
    searchQuery: category,
    quantity: null,
    unit: null,
    quantityBasis: null,
    calculation: null,
    confidence: null,
    planReference: null,
  }));
