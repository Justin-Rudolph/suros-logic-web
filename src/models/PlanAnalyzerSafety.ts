import { PlanModuleRecordBase } from "./PlanAnalyzerShared";

export interface SafetyItem {
  issue: string;
  severity: "low" | "medium" | "high" | "critical";
  requiresReview: true;
}

export interface PlanSafetyModuleRecord extends PlanModuleRecordBase {
  moduleType: "safety";
  result?: SafetyItem[];
}
