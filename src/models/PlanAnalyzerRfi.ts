import { PlanModuleRecordBase } from "./PlanAnalyzerShared";

export interface RfiPackage {
  rfis: string[];
  assumptions: string[];
  estimatorQuestions: string[];
  contingencyNotes: string[];
}

export interface PlanRfiModuleRecord extends PlanModuleRecordBase {
  moduleType: "rfi";
  result?: RfiPackage;
}
