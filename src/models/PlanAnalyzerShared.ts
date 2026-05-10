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
