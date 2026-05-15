import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { FileImage, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { firestore, storage } from "@/lib/firebase";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { UploadedPlanFile } from "@/models/PlanAnalyzerShared";
import { PlanProjectRecord } from "@/models/PlanProjects";
import { PlanAnalyzerUsage, UserProfile } from "@/models/UserProfile";

import "./PlanAnalyzer.css";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type AnalysisToggleKey = "verification" | "safety" | "conflicts" | "rfi";

type AnalysisToggleState = Record<AnalysisToggleKey, boolean>;

const DEFAULT_PLAN_ANALYSIS_MONTHLY_LIMIT = 3;
const TRIAL_PLAN_ANALYSIS_MONTHLY_LIMIT = 1;

const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
];

const formatFileSize = (bytes: number) => {
  if (!bytes) return "0 KB";

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${Math.max(bytes / 1024, 0.1).toFixed(1)} KB`;
};

const isAcceptedPlanFile = (file: File) => {
  if (ACCEPTED_FILE_TYPES.includes(file.type)) return true;

  const lowercaseName = file.name.toLowerCase();
  return (
    lowercaseName.endsWith(".pdf") ||
    lowercaseName.endsWith(".png") ||
    lowercaseName.endsWith(".jpg") ||
    lowercaseName.endsWith(".jpeg") ||
    lowercaseName.endsWith(".webp") ||
    lowercaseName.endsWith(".heic") ||
    lowercaseName.endsWith(".heif")
  );
};

const isOptionalStepEnabled = (
  project: Pick<PlanProjectRecord, "analysisOptions">,
  step: AnalysisToggleKey
) => {
  if (!project.analysisOptions) {
    return true;
  }

  return project.analysisOptions[step] === true;
};

const getOverviewStatus = (project: Pick<PlanProjectRecord, "modules">) =>
  project.modules?.overview?.status;

const getModuleStatus = (
  project: Pick<PlanProjectRecord, "modules">,
  moduleType: AnalysisToggleKey | "scopes"
) => project.modules?.[moduleType]?.status;

const isProjectFullyAnalyzed = (
  project: Pick<PlanProjectRecord, "modules" | "analysisOptions">
) => {
  const analysisDone =
    getOverviewStatus(project) === "completed" || getOverviewStatus(project) === "completed_with_errors";
  const scopesDone = getModuleStatus(project, "scopes") === "completed";
  const verificationDone =
    !isOptionalStepEnabled(project, "verification") ||
    getModuleStatus(project, "verification") === "completed" ||
    getModuleStatus(project, "verification") === "skipped";
  const safetyDone =
    !isOptionalStepEnabled(project, "safety") ||
    getModuleStatus(project, "safety") === "completed" ||
    getModuleStatus(project, "safety") === "skipped";
  const conflictsDone =
    !isOptionalStepEnabled(project, "conflicts") ||
    getModuleStatus(project, "conflicts") === "completed" ||
    getModuleStatus(project, "conflicts") === "skipped";
  const rfiDone =
    !isOptionalStepEnabled(project, "rfi") ||
    getModuleStatus(project, "rfi") === "completed" ||
    getModuleStatus(project, "rfi") === "skipped";

  return analysisDone && scopesDone && verificationDone && safetyDone && conflictsDone && rfiDone;
};

const getProjectStatusLabel = (project: PlanProjectRecord) => {
  if (project.status === "reserved_upload") return "Preparing Upload";
  if (project.status === "failed") return "Analysis Failed";
  if (isProjectFullyAnalyzed(project)) return "Fully Analyzed";
  if (getModuleStatus(project, "rfi") === "processing") return "Generating RFIs";
  if (getModuleStatus(project, "rfi") === "queued") return "RFI Queued";
  if (getModuleStatus(project, "conflicts") === "completed") return "Conflict Checked";
  if (getModuleStatus(project, "conflicts") === "processing") return "Detecting Conflicts";
  if (getModuleStatus(project, "conflicts") === "queued") return "Conflicts Queued";
  if (getModuleStatus(project, "safety") === "completed") return "Safety Reviewed";
  if (getModuleStatus(project, "safety") === "processing") return "Analyzing Safety";
  if (getModuleStatus(project, "safety") === "queued") return "Safety Queued";
  if (getModuleStatus(project, "verification") === "completed") return "Verified";
  if (getModuleStatus(project, "verification") === "processing") return "Generating Verification";
  if (getModuleStatus(project, "verification") === "queued") return "Verification Queued";
  if (getModuleStatus(project, "scopes") === "completed") return "Scoped";
  if (getModuleStatus(project, "scopes") === "processing") return "Generating Scopes";
  if (getModuleStatus(project, "scopes") === "queued") return "Scopes Queued";
  if (getOverviewStatus(project) === "completed" || getOverviewStatus(project) === "completed_with_errors") {
    return "Overview Analyzed";
  }
  if (getOverviewStatus(project) === "processing") return "Analyzing Overview";
  if (getOverviewStatus(project) === "queued") return "Overview Queued";
  if (getOverviewStatus(project) === "failed") return "Analysis Failed";
  if (project.status === "uploaded") return "Uploaded";
  if (project.status === "processing") return "Processing";
  if (project.status === "completed") return "Fully Analyzed";
  if (project.status === "completed_with_errors") return "Analyzed with Warnings";
  return "Uploaded";
};

const getProjectFileCountLabel = (project: PlanProjectRecord) => {
  if (project.status === "reserved_upload") {
    return "Upload pending";
  }

  const fileCount = project.fileCount || project.uploadedFiles?.length || 0;
  return `${fileCount} file${fileCount === 1 ? "" : "s"}`;
};

const getProjectTitle = (project: Pick<PlanProjectRecord, "title">) => {
  if (project.title?.trim()) {
    return project.title.trim();
  }

  return "Untitled plan analysis";
};

const formatProjectTimestamp = (project: PlanProjectRecord) => {
  const timestamp =
    project.updatedAt?.toDate?.() ||
    project.createdAt?.toDate?.() ||
    (typeof project.updatedAt?.seconds === "number"
      ? new Date(project.updatedAt.seconds * 1000)
      : typeof project.createdAt?.seconds === "number"
        ? new Date(project.createdAt.seconds * 1000)
        : null);

  return timestamp ? timestamp.toLocaleString() : "Pending timestamp";
};

const deletePlanUploadStorageObject = async (storagePath?: string) => {
  if (!storagePath) return;

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "storage/object-not-found") {
      return;
    }

    throw error;
  }
};

const getCurrentPlanAnalysisPeriodKey = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value || String(now.getFullYear());
  const month =
    parts.find((part) => part.type === "month")?.value ||
    String(now.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const getPlanAnalyzerMonthlyLimit = (profile?: UserProfile | null) => {
  if (profile?.stripeSubscriptionStatus === "trialing") {
    return TRIAL_PLAN_ANALYSIS_MONTHLY_LIMIT;
  }

  if (profile?.stripeSubscriptionStatus === "active") {
    return DEFAULT_PLAN_ANALYSIS_MONTHLY_LIMIT;
  }

  const usageLimit = Number(profile?.planAnalyzerUsage?.monthlyLimit);
  return Number.isFinite(usageLimit)
    ? Math.max(usageLimit, 0)
    : DEFAULT_PLAN_ANALYSIS_MONTHLY_LIMIT;
};

const normalizePlanAnalyzerUsage = (profile?: UserProfile | null): PlanAnalyzerUsage => {
  const usage = profile?.planAnalyzerUsage;
  const monthlyLimit = getPlanAnalyzerMonthlyLimit(profile);
  const periodKey = getCurrentPlanAnalysisPeriodKey();

  if (usage?.periodKey !== periodKey) {
    return {
      monthlyLimit,
      used: 0,
      reserved: 0,
      periodKey,
    };
  }

  return {
    monthlyLimit,
    used: Math.max(Number(usage?.used) || 0, 0),
    reserved: Math.max(Number(usage?.reserved) || 0, 0),
    periodKey,
  };
};

const getPlanAnalyzerRemaining = (usage: PlanAnalyzerUsage) =>
  Math.max(usage.monthlyLimit - usage.used - usage.reserved, 0);

export default function PlanAnalyzer() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const hasActiveSubscription = profile?.isSubscribed === true;
  const planAnalyzerUsage = useMemo(
    () => normalizePlanAnalyzerUsage(profile),
    [profile]
  );
  const remainingPlanAnalyses = getPlanAnalyzerRemaining(planAnalyzerUsage);
  const hasAvailablePlanAnalysis = remainingPlanAnalyses > 0;
  const canUploadPlanAnalysis = hasActiveSubscription && hasAvailablePlanAnalysis;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleFieldRef = useRef<HTMLDivElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [projects, setProjects] = useState<PlanProjectRecord[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [projectPendingDelete, setProjectPendingDelete] = useState<PlanProjectRecord | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [showMissingTitleDialog, setShowMissingTitleDialog] = useState(false);
  const [showUploadDisclaimerDialog, setShowUploadDisclaimerDialog] = useState(false);
  const [analysisToggles, setAnalysisToggles] = useState<AnalysisToggleState>({
    verification: false,
    safety: false,
    conflicts: false,
    rfi: false,
  });

  useEffect(() => {
    if (!user) return;

    const projectsQuery = query(
      collection(firestore, "planProjects"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(projectsQuery, (snapshot) => {
      const nextProjects = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PlanProjectRecord, "id">),
      }));

      nextProjects.sort((left, right) => {
        const leftTime = left.updatedAt?.seconds || left.createdAt?.seconds || 0;
        const rightTime = right.updatedAt?.seconds || right.createdAt?.seconds || 0;
        return rightTime - leftTime;
      });

      setProjects(nextProjects);
    });

    return unsubscribe;
  }, [user]);

  const totalUploadSize = useMemo(
    () => selectedFile?.size || 0,
    [selectedFile]
  );

  const validateFiles = (files: File[]) => {
    if (files.length === 0) {
      return { validFiles: [], rejectedFiles: [] as File[] };
    }

    const validFiles = files.filter(isAcceptedPlanFile);
    const rejectedFiles = files.filter((file) => !isAcceptedPlanFile(file));

    return { validFiles, rejectedFiles };
  };

  const addFiles = (incomingFiles: File[]) => {
    if (!hasActiveSubscription) {
      toast({
        title: "Subscription required",
        description: "Reactivate your subscription to upload a new plan file.",
        variant: "destructive",
      });
      return;
    }

    if (!hasAvailablePlanAnalysis) {
      toast({
        title: "Monthly analysis limit reached",
        description: `You have used all ${planAnalyzerUsage.monthlyLimit} plan analyses for this month.`,
        variant: "destructive",
      });
      return;
    }

    const { validFiles, rejectedFiles } = validateFiles(incomingFiles);

    if (rejectedFiles.length > 0) {
      toast({
        title: "Some files were skipped",
        description: "Only PDF and image files can be uploaded to the plan analyzer.",
        variant: "destructive",
      });
    }

    if (validFiles.length === 0) {
      return;
    }

    if (validFiles.length > 1 || incomingFiles.length > 1) {
      toast({
        title: "Only one plan file is supported",
        description: "The first valid PDF or image was kept for this analysis.",
      });
    }

    setSelectedFile(validFiles[0]);
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!hasActiveSubscription) {
      event.target.value = "";
      return;
    }

    const files = Array.from(event.target.files || []);
    addFiles(files);
    event.target.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canUploadPlanAnalysis) return;
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (!canUploadPlanAnalysis) return;
    addFiles(Array.from(event.dataTransfer.files || []));
  };

  const removeFile = (fileToRemove: File) => {
    setSelectedFile((current) => {
      if (
        current &&
        current.name === fileToRemove.name &&
        current.size === fileToRemove.size &&
        current.lastModified === fileToRemove.lastModified
      ) {
        return null;
      }

      return current;
    });
  };

  const clearSelection = () => {
    if (isUploading) return;
    setSelectedFile(null);
    setUploadProgress(0);
  };

  const confirmDeleteProject = (project: PlanProjectRecord) => {
    setProjectPendingDelete(project);
  };

  const handleDeleteProject = async () => {
    if (!projectPendingDelete) return;

    setIsDeletingProject(true);

    try {
      await postPlanAnalysisRequest("deletePlanAnalysisProject", {
        projectId: projectPendingDelete.id,
      });

      setProjectPendingDelete(null);
      toast({
        title: "Project deleted",
        description: "The plan analysis project was removed from your history.",
      });
    } catch (error) {
      console.error("Failed to delete plan project:", error);
      toast({
        title: "Delete failed",
        description:
          error instanceof Error
            ? error.message
            : "There was a problem deleting this plan analysis project.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingProject(false);
    }
  };

  const toggleAnalysisOption = (key: AnalysisToggleKey) => {
    if (isUploading || !canUploadPlanAnalysis) return;

    setAnalysisToggles((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const enableFullAnalysis = () => {
    if (isUploading || !canUploadPlanAnalysis) return;

    setAnalysisToggles({
      verification: true,
      safety: true,
      conflicts: true,
      rfi: true,
    });
  };

  const focusProjectTitleField = () => {
    titleFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 180);
  };

  const postPlanAnalysisRequest = async <ResponseBody,>(endpoint: string, body: Record<string, unknown>) => {
    if (!user) {
      throw new Error("Please sign in before uploading a plan file.");
    }

    const token = await user.getIdToken();
    const response = await fetch(`${getFunctionsBaseUrl()}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : "There was a problem preparing your plan analysis."
      );
    }

    return payload as ResponseBody;
  };

  const startUpload = async () => {
    const trimmedProjectTitle = projectTitle.trim();

    if (!user) {
      throw new Error("Please sign in before uploading a plan file.");
    }

    if (!hasActiveSubscription) {
      throw new Error("An active subscription is required to upload plan files.");
    }

    if (!hasAvailablePlanAnalysis) {
      throw new Error(`You have used all ${planAnalyzerUsage.monthlyLimit} plan analyses for this month.`);
    }

    setIsUploading(true);
    setUploadProgress(0);

    let reservedProjectId = "";
    let uploadedStoragePath = "";

    try {
      if (!selectedFile) {
        throw new Error("A single plan file is required before upload can begin.");
      }

      const reservation = await postPlanAnalysisRequest<{ projectId: string }>("reservePlanAnalysis", {});
      const projectId = reservation.projectId;
      reservedProjectId = projectId;
      const progressByFile = new Map<string, number>();

      const uploadedResult = await new Promise<UploadedPlanFile>((resolve, reject) => {
        const storagePath = `planUploads/${user.uid}/${projectId}/${selectedFile.name}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, selectedFile);
        const progressKey = `${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}`;

        uploadTask.on(
          "state_changed",
          (snapshot) => {
            progressByFile.set(progressKey, snapshot.bytesTransferred);

            const transferredBytes = Array.from(progressByFile.values()).reduce(
              (total, value) => total + value,
              0
            );

            const nextProgress =
              totalUploadSize > 0
                ? Math.min(
                    Math.round((transferredBytes / totalUploadSize) * 100),
                    100
                  )
                : 0;

            setUploadProgress(nextProgress);
          },
          reject,
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              uploadedStoragePath = storagePath;
              resolve({
                name: selectedFile.name,
                type: selectedFile.type,
                size: selectedFile.size,
                downloadURL,
                storagePath,
              });
            } catch (error) {
              reject(error);
            }
          }
        );
      });

      await postPlanAnalysisRequest("finalizePlanAnalysisUpload", {
        projectId,
        title: trimmedProjectTitle,
        uploadedFile: uploadedResult,
        analysisOptions: analysisToggles,
      });

      toast({
        title: "Plan file uploaded",
        description: "Your file is uploaded. Opening the project processing view now.",
        duration: 3500,
      });

      setSelectedFile(null);
      setProjectTitle("");
      setUploadProgress(0);
      navigate(`/plan-analyzer/${projectId}`);
    } catch (error) {
      console.error("Plan upload failed:", error);

      if (uploadedStoragePath) {
        await deletePlanUploadStorageObject(uploadedStoragePath).catch((deleteError) => {
          console.error("Failed to remove uploaded plan file after upload error:", deleteError);
        });
      }

      if (reservedProjectId) {
        await postPlanAnalysisRequest("cancelPlanAnalysisReservation", {
          projectId: reservedProjectId,
        }).catch((cancelError) => {
          console.error("Failed to release plan analysis reservation after upload error:", cancelError);
        });
      }

      toast({
        title: "Upload failed",
        description:
          error instanceof Error
            ? error.message
            : "There was a problem uploading your plan file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = () => {
    const trimmedProjectTitle = projectTitle.trim();

    if (!user) {
      toast({
        title: "You need to be signed in",
        description: "Please log in before uploading a plan file.",
        variant: "destructive",
      });
      return;
    }

    if (!profile?.isSubscribed) {
      toast({
        title: "Subscription required",
        description: "An active subscription is required to upload plan files.",
        variant: "destructive",
      });
      return;
    }

    if (!hasAvailablePlanAnalysis) {
      toast({
        title: "Monthly analysis limit reached",
        description: `You have used all ${planAnalyzerUsage.monthlyLimit} plan analyses for this month.`,
        variant: "destructive",
      });
      return;
    }

    if (!trimmedProjectTitle) {
      setShowMissingTitleDialog(true);
      return;
    }

    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Select one PDF or image file to create a plan upload.",
        variant: "destructive",
      });
      return;
    }

    setShowUploadDisclaimerDialog(true);
  };

  return (
    <div className="plan-analyzer-page">
      <button className="plan-analyzer-back" onClick={() => navigate("/dashboard")}>
        ← Back
      </button>

      <main className="plan-analyzer-container">
        <section className="plan-analyzer-hero">
          <p className="plan-analyzer-kicker">Plan Analyzer</p>
          <h1 className="plan-analyzer-title">
            {hasActiveSubscription ? "Upload a Plan File for Analysis" : "Open Saved Plan Analyses"}
          </h1>
          <p className="plan-analyzer-subtitle">
            {hasActiveSubscription
              ? "Upload one plan PDF or image, run the analyzer, and reopen the saved project later from the list below."
              : "Your saved plan projects and analysis results are still available below. New uploads stay locked until your subscription is active again."}
          </p>
        </section>

        <section className="plan-analyzer-panel">
          {!hasActiveSubscription ? (
            <div className="plan-readonly-banner">
              <div>
                <span className="plan-summary-label">Read-only access</span>
                <p className="plan-readonly-copy">
                  Your existing plan projects are still available to open and review. Reactivate your subscription to upload a new plan file.
                </p>
              </div>

              <Link to="/billing" className="plan-readonly-link">
                Manage Subscription
              </Link>
            </div>
          ) : (
            <div className="plan-readonly-banner">
              <div>
                <span className="plan-summary-label">Monthly plan analyses</span>
                <p className="plan-readonly-copy">
                  {remainingPlanAnalyses} of {planAnalyzerUsage.monthlyLimit} analyses remaining this month.
                </p>
              </div>
            </div>
          )}

          <div ref={titleFieldRef} className="plan-title-field">
            <label htmlFor="plan-project-title" className="plan-summary-label">
              Project Title (Required)
            </label>
            <input
              ref={titleInputRef}
              id="plan-project-title"
              type="text"
              className="plan-title-input"
              placeholder="Project Title..."
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              disabled={isUploading || !canUploadPlanAnalysis}
              required
            />
            <p className="plan-title-note">
              {canUploadPlanAnalysis
                ? "This title will be used in your project list and processing view."
                : hasActiveSubscription
                  ? "Upload controls are disabled until your monthly plan analysis limit resets."
                  : "Upload controls are disabled while your subscription is inactive."}
            </p>
          </div>

          <div
            className={`plan-dropzone${isDragging && canUploadPlanAnalysis ? " plan-dropzone-active" : ""}${isUploading || !canUploadPlanAnalysis ? " plan-dropzone-disabled" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => {
              if (!isUploading && canUploadPlanAnalysis) {
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={canUploadPlanAnalysis ? 0 : -1}
            aria-disabled={!canUploadPlanAnalysis}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !isUploading && canUploadPlanAnalysis) {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              className="plan-dropzone-input"
              onChange={handleFileInputChange}
              disabled={!canUploadPlanAnalysis}
            />

            <div className="plan-dropzone-icon">
              <UploadCloud size={30} />
            </div>

            <h2 className="plan-dropzone-title">Drag and drop a plan file here</h2>
            <p className="plan-dropzone-copy">
              Upload one PDF or image, or click to browse your file.
            </p>
            <p className="plan-dropzone-note">Accepted: PDF, PNG, JPG, JPEG, WEBP, HEIC, HEIF</p>

            <Button
              type="button"
              size="lg"
              className="plan-dropzone-button"
              onClick={(event) => {
                event.stopPropagation();
                if (canUploadPlanAnalysis) {
                  fileInputRef.current?.click();
                }
              }}
              disabled={isUploading || !canUploadPlanAnalysis}
            >
              Select File
            </Button>
          </div>

          <div className="plan-summary-row plan-summary-row-upload">
            <div className="plan-summary-card plan-summary-card-file plan-summary-card-file-accent">
              {selectedFile ? (
                (() => {
                  const isPdf =
                    selectedFile.type === "application/pdf" ||
                    selectedFile.name.toLowerCase().endsWith(".pdf");

                  return (
                    <div
                      key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}`}
                      className="plan-file-row plan-file-row-inline"
                    >
                      <div className="plan-file-meta">
                        <div className="plan-file-icon">
                          {isPdf ? <FileText size={18} /> : <FileImage size={18} />}
                        </div>

                        <div>
                          <p className="plan-file-name">{selectedFile.name}</p>
                          <p className="plan-file-details">
                            {isPdf ? "PDF" : "Image"} • {formatFileSize(selectedFile.size)}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="plan-file-remove"
                        onClick={() => removeFile(selectedFile)}
                        disabled={isUploading || !canUploadPlanAnalysis}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })()
              ) : (
                <div className="plan-summary-card-empty">No file selected yet.</div>
              )}
            </div>
          </div>

          <div className="plan-analysis-options">
            <div className="plan-analysis-options-header">
              <span className="plan-summary-label">Optional analysis modules</span>
              <p className="plan-section-subtitle">
                Plan overview analysis and trade scope analysis always run. Turn on any additional reviews you want included.
              </p>
            </div>

            <div className="plan-analysis-options-grid">
              <button
                type="button"
                className={`plan-analysis-toggle plan-analysis-toggle-compact${
                  Object.values(analysisToggles).every(Boolean) ? " plan-analysis-toggle-active" : ""
                }`}
                onClick={enableFullAnalysis}
                disabled={isUploading || !canUploadPlanAnalysis}
              >
                <span className="plan-analysis-toggle-title">Full Analysis</span>
                <span className="plan-analysis-toggle-state">
                  {Object.values(analysisToggles).every(Boolean) ? "On" : "Turn On"}
                </span>
              </button>

              <button
                type="button"
                className={`plan-analysis-toggle${analysisToggles.verification ? " plan-analysis-toggle-active" : ""}`}
                onClick={() => toggleAnalysisOption("verification")}
                disabled={isUploading || !canUploadPlanAnalysis}
              >
                <span className="plan-analysis-toggle-title">Verification</span>
                <span className="plan-analysis-toggle-state">{analysisToggles.verification ? "On" : "Off"}</span>
              </button>

              <button
                type="button"
                className={`plan-analysis-toggle${analysisToggles.safety ? " plan-analysis-toggle-active" : ""}`}
                onClick={() => toggleAnalysisOption("safety")}
                disabled={isUploading || !canUploadPlanAnalysis}
              >
                <span className="plan-analysis-toggle-title">Safety</span>
                <span className="plan-analysis-toggle-state">{analysisToggles.safety ? "On" : "Off"}</span>
              </button>

              <button
                type="button"
                className={`plan-analysis-toggle${analysisToggles.conflicts ? " plan-analysis-toggle-active" : ""}`}
                onClick={() => toggleAnalysisOption("conflicts")}
                disabled={isUploading || !canUploadPlanAnalysis}
              >
                <span className="plan-analysis-toggle-title">Conflicts</span>
                <span className="plan-analysis-toggle-state">{analysisToggles.conflicts ? "On" : "Off"}</span>
              </button>

              <button
                type="button"
                className={`plan-analysis-toggle${analysisToggles.rfi ? " plan-analysis-toggle-active" : ""}`}
                onClick={() => toggleAnalysisOption("rfi")}
                disabled={isUploading || !canUploadPlanAnalysis}
              >
                <span className="plan-analysis-toggle-title">RFI Package</span>
                <span className="plan-analysis-toggle-state">{analysisToggles.rfi ? "On" : "Off"}</span>
              </button>
            </div>

            <ul className="plan-analysis-options-notes">
              <li>
                <strong>Trade Scopes:</strong> Organized bid-style scope items by trade.
              </li>
              <li>
                <strong>Verification:</strong> Field checks and plan follow-ups to confirm dimensions,
                structure, access, and existing conditions.
              </li>
              <li>
                <strong>Safety:</strong> Potential life-safety, access, egress, clearance, and
                code-sensitive items that need review.
              </li>
              <li>
                <strong>Conflicts:</strong> Cross-sheet coordination issues like trade clashes,
                mismatched dimensions, and cross-discipline coordination concerns.
              </li>
              <li>
                <strong>RFI Package:</strong> Questions, assumptions, and contingency notes to help
                price the job without overcommitting.
              </li>
            </ul>
          </div>

          {(isUploading || uploadProgress > 0) && (
            <div className="plan-progress-panel">
              <div className="plan-progress-heading">
                <div>
                  <div className="plan-progress-status-row">
                    <p className="plan-progress-label">Upload Progress</p>
                    <span className="plan-progress-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                  <p className="plan-progress-copy">
                    {isUploading
                      ? "Uploading file to Firebase Storage..."
                      : "Upload complete. Redirecting to project processing..."}
                  </p>
                </div>

                <span className="plan-progress-value">{uploadProgress}%</span>
              </div>

              <Progress value={uploadProgress} className="plan-progress-bar plan-progress-bar-animated" />
            </div>
          )}

          <div className="plan-actions">
            <Button
              type="button"
              variant="outline"
              onClick={clearSelection}
              disabled={isUploading || !canUploadPlanAnalysis}
            >
              Clear Selection
            </Button>

            <Button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || !selectedFile || !canUploadPlanAnalysis}
            >
              {isUploading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload Plan File"
              )}
            </Button>
          </div>
        </section>

        <section className="plan-results-panel plan-project-history">
          <div className="plan-results-header">
            <div>
              <p className="plan-results-kicker">Previous Projects</p>
              <h2 className="plan-results-title">Reopen existing plan analyses</h2>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="plan-empty-state">No saved plan analysis projects yet.</div>
          ) : (
            <div className="plan-project-list">
              {projects.map((project) => (
                <div key={project.id} className="plan-project-card">
                  <div className="plan-project-content">
                    <h3 className="plan-project-title">{getProjectTitle(project)}</h3>

                    <div className="plan-project-meta">
                      <span className="plan-project-status-pill">{getProjectStatusLabel(project)}</span>
                      <span>{getProjectFileCountLabel(project)}</span>
                      <span>{formatProjectTimestamp(project)}</span>
                    </div>
                  </div>

                  <div className="plan-project-actions">
                    <button
                      type="button"
                      className="plan-project-open"
                      onClick={() => navigate(`/plan-analyzer/${project.id}`)}
                    >
                      Open Project
                    </button>

                    <button
                      type="button"
                      className="plan-project-delete-icon"
                      onClick={() => confirmDeleteProject(project)}
                      aria-label={`Delete ${getProjectTitle(project)}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showMissingTitleDialog && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Add Title</h2>

            <p>
              Add title at the top of the screen before uploading your plan file.
            </p>

            <div className="billing-modal-actions">
              <button
                className="primary"
                onClick={() => {
                  setShowMissingTitleDialog(false);
                  focusProjectTitleField();
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadDisclaimerDialog && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>AI Analysis Disclaimer</h2>

            <p>
              This AI analyzer can do about 90% of the heavy lifting and help speed up your review,
              but you should still verify the results yourself against the plans, field conditions,
              and your own judgment before relying on them.
            </p>

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => setShowUploadDisclaimerDialog(false)}
              >
                Cancel
              </button>

              <button
                className="primary"
                onClick={() => {
                  setShowUploadDisclaimerDialog(false);
                  void startUpload();
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {projectPendingDelete && (
        <div className="billing-modal-overlay">
          <div className="billing-modal">
            <h2>Delete Plan Analysis Project?</h2>

            <p>
              This will permanently delete {getProjectTitle(projectPendingDelete)} from your
              project history and remove its uploaded plan file.
            </p>

            <div className="billing-modal-actions">
              <button
                className="secondary"
                onClick={() => setProjectPendingDelete(null)}
                disabled={isDeletingProject}
              >
                Cancel
              </button>

              <button
                className="danger"
                onClick={() => {
                  void handleDeleteProject();
                }}
                disabled={isDeletingProject}
              >
                {isDeletingProject ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
