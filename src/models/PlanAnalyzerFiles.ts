import { Timestamp } from "firebase/firestore";

export interface PlanProjectFileRecord {
  fileId: string;
  projectId: string;
  fileName: string;
  sourceFileName?: string;
  fileUrl?: string;
  fileKind?: string;
  analysisMethod?: "pdf_hybrid_full" | "pdf_hybrid_sampled" | "pdf_hybrid" | "pdf_text_extraction" | "image_ocr" | "pdf_visual_fallback" | "image_visual_fallback" | string;
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
