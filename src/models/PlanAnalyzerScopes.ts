import { PlanModuleRecordBase } from "./PlanAnalyzerShared";

export interface ScopeItem {
  title: string;
  description: string;
  materialCategories: string[];
  classification: "confirmed" | "inferred" | "unknown";
}

export type ScopeResult = Record<string, ScopeItem[]>;

export interface PlanScopesModuleRecord extends PlanModuleRecordBase {
  moduleType: "scopes";
  result?: ScopeResult;
}
