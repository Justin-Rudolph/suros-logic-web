import { PlanModuleRecordBase } from "./PlanAnalyzerShared";

export interface ConflictItem {
  conflict: string;
  involvedTrades: string[];
  severity: "low" | "medium" | "high" | "critical";
  sourceSheets: string[];
}

export interface PlanConflictsModuleRecord extends PlanModuleRecordBase {
  moduleType: "conflicts";
  result?: ConflictItem[];
}
