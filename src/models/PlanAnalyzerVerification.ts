import { PlanModuleRecordBase } from "./PlanAnalyzerShared";

export interface VerificationItem {
  item: string;
  reason: string;
  category:
    | "dimensions"
    | "structure"
    | "MEP_conflict"
    | "access"
    | "existing_conditions";
}

export interface PlanVerificationModuleRecord extends PlanModuleRecordBase {
  moduleType: "verification";
  result?: VerificationItem[];
}
