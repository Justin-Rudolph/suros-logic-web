import { Timestamp } from "firebase/firestore";
import {
  PlanAnalysisOptions,
  PlanModuleSummary,
  PlanProjectStatus,
  UploadedPlanFile,
} from "./PlanAnalyzerShared";

export interface PlanProjectModulesSummary {
  overview: PlanModuleSummary;
  scopes: PlanModuleSummary;
  verification: PlanModuleSummary;
  safety: PlanModuleSummary;
  conflicts: PlanModuleSummary;
  rfi: PlanModuleSummary;
}

export interface PlanProjectDocument {
  userId: string;
  // Denormalized owner account id (owner's uid). Set at creation time.
  accountId?: string;
  projectId: string;
  title?: string;
  fileCount: number;
  status?: PlanProjectStatus | string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  uploadedFiles?: UploadedPlanFile[];
  analysisOptions?: PlanAnalysisOptions;
  modules: PlanProjectModulesSummary;
}

export interface PlanProjectRecord extends PlanProjectDocument {
  id: string;
}
