import { PlanModuleRecordBase } from "./PlanAnalyzerShared";

export interface PlanAnalysisResult {
  projectType: string;
  areas: string[];
  summary: string;
}

export interface PlanOverviewModuleRecord extends PlanModuleRecordBase {
  moduleType: "overview";
  result?: PlanAnalysisResult;
}
