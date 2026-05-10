import { Timestamp } from "firebase/firestore";

export interface PlanProjectFileRecord {
  fileId: string;
  projectId: string;
  fileName: string;
  sourceFileName?: string;
  fileUrl?: string;
  fileKind?: string;
  contentType?: string;
  sourcePageNumber?: number;
  sourcePageCount?: number;
  detectedSheetNumber?: string;
  detectedTitle?: string;
  discipline?: string;
  revisionDate?: string | null;
  rawText?: string;
  analyzedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
