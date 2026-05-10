import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { Check, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { firestore } from "@/lib/firebase";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { ConflictItem, PlanConflictsModuleRecord } from "@/models/PlanAnalyzerConflicts";
import { PlanAnalysisResult, PlanOverviewModuleRecord } from "@/models/PlanAnalyzerOverview";
import { PlanRfiModuleRecord, RfiPackage } from "@/models/PlanAnalyzerRfi";
import { PlanSafetyModuleRecord, SafetyItem } from "@/models/PlanAnalyzerSafety";
import { ScopeItem, ScopeResult, PlanScopesModuleRecord } from "@/models/PlanAnalyzerScopes";
import { PlanModuleStatus, PlanModuleType } from "@/models/PlanAnalyzerShared";
import { PlanVerificationModuleRecord, VerificationItem } from "@/models/PlanAnalyzerVerification";
import { PlanProjectRecord } from "@/models/PlanProjects";

import "./PlanAnalyzer.css";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};


type PlanProjectDoc = PlanProjectRecord;

type ModalState =
  | {
      type: "scope";
      tradeKey: string;
      tradeLabel: string;
      title: string;
      description: string;
      items: ScopeItem[];
    }
  | {
      type: "scopeFavorites";
      title: string;
      description: string;
      items: Array<{
        id: string;
        tradeKey: string;
        tradeLabel: string;
        item: ScopeItem;
      }>;
    }
    | {
      type: "verification";
      title: string;
      description: string;
      items: Array<{ id: string; item: VerificationItem }>;
    }
  | {
      type: "safety";
      title: string;
      description: string;
      items: Array<{ id: string; item: SafetyItem }>;
    }
  | {
      type: "conflict";
      title: string;
      description: string;
      items: Array<{ id: string; item: ConflictItem }>;
    }
  | {
      type: "rfi";
      title: string;
      description: string;
      items: Array<{ id: string; item: string }>;
      badgeLabel: string;
      badgeClassName: string;
    }
  | null;

type PipelineStep =
  | "analyze"
  | "generateScopes"
  | "generateVerification"
  | "analyzeSafety"
  | "detectConflicts"
  | "generateRFIs";

type PlanAnalyzerTabId =
  | "overview"
  | "tradeScopes"
  | "verification"
  | "safety"
  | "conflicts"
  | "rfi";

type BidFormPrefillState = {
  formSnapshot: {
    company_name: string;
    company_address: string;
    company_phone: string;
    company_email: string;
    company_slogan: string;
    invoice_date: string;
    invoice_number: string;
    salesperson: string;
    job: string;
    payment_terms: string;
    approx_weeks: string;
    contingency_coverage: string;
    total_costs: string;
    deposit_percentage: string;
    weekly_payments: string;
    customer_name: string;
    customer_address: string;
    customer_phone: string;
    customer_email: string;
    tax_percentage: string;
    contingency_percentage: string;
  };
  lineItems: Array<{
    trade: string;
    scope: string;
    material_labor_included: "Yes" | "No";
    line_total: string;
  }>;
};

type FormattedBidLineItem = {
  trade: string;
  scope_lines: string[];
};

const SCOPE_TRADE_LABELS: Array<{ key: string; label: string }> = [
  { key: "demo", label: "Demo" },
  { key: "structural", label: "Structural" },
  { key: "framing", label: "Framing" },
  { key: "exterior_envelope", label: "Exterior Envelope" },
  { key: "doors_windows", label: "Doors/Windows" },
  { key: "roofing", label: "Roofing" },
  { key: "plumbing", label: "Plumbing" },
  { key: "electrical", label: "Electrical" },
  { key: "concrete_masonry", label: "Concrete/Masonry" },
  { key: "drywall_insulation", label: "Drywall/Insulation" },
  { key: "flooring_tile", label: "Flooring/Tile" },
  { key: "paint_finishes", label: "Paint/Finishes" },
  { key: "millwork_cabinets", label: "Millwork/Cabinets" },
  { key: "HVAC", label: "HVAC" },
];

const VERIFICATION_CATEGORY_ORDER: VerificationItem["category"][] = [
  "dimensions",
  "structure",
  "MEP_conflict",
  "access",
  "existing_conditions",
];

const SEVERITY_ORDER: Array<SafetyItem["severity"]> = [
  "critical",
  "high",
  "medium",
  "low",
];

const buildScopeSelectionId = (tradeKey: string, index: number) => `${tradeKey}::${index}`;
const buildVerificationSelectionId = (index: number) => `verification::${index}`;
const buildSafetySelectionId = (index: number) => `safety::${index}`;
const buildConflictSelectionId = (index: number) => `conflict::${index}`;
const buildRfiSelectionId = (sectionKey: keyof RfiPackage, index: number) => `${sectionKey}::${index}`;

const haveSameIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
};

const DISPLAY_PREFIX_PATTERN =
  /^\s*(?:\[(?:confirmed|inferred|unknown|needs[_\s-]?verification|needs[_\s-]?clarification|risk(?:\s*\/\s*assumption)?|assumption|mep[_\s-]?conflict|dimensions|structure|access|existing[_\s-]?conditions)\]|\((?:confirmed|inferred|unknown|needs[_\s-]?verification|needs[_\s-]?clarification|risk(?:\s*\/\s*assumption)?|assumption|mep[_\s-]?conflict|dimensions|structure|access|existing[_\s-]?conditions)\)|(?:confirmed|inferred|unknown|needs[_\s-]?verification|needs[_\s-]?clarification|risk(?:\s*\/\s*assumption)?|assumption|mep[_\s-]?conflict|dimensions|structure|access|existing[_\s-]?conditions))\s*[:-]\s*/i;
const DISPLAY_SUFFIX_PATTERN =
  /\s*(?:[:-]\s*(?:confirmed|inferred|unknown|needs[_\s-]?verification|needs[_\s-]?clarification|risk(?:\s*\/\s*assumption)?|assumption|mep[_\s-]?conflict|dimensions|structure|access|existing[_\s-]?conditions)|\[(?:confirmed|inferred|unknown|needs[_\s-]?verification|needs[_\s-]?clarification|risk(?:\s*\/\s*assumption)?|assumption|mep[_\s-]?conflict|dimensions|structure|access|existing[_\s-]?conditions)\]|\((?:confirmed|inferred|unknown|needs[_\s-]?verification|needs[_\s-]?clarification|risk(?:\s*\/\s*assumption)?|assumption|mep[_\s-]?conflict|dimensions|structure|access|existing[_\s-]?conditions)\))\s*$/i;

const cleanDisplayText = (value: string) => {
  let next = String(value || "").trim();

  while (DISPLAY_PREFIX_PATTERN.test(next)) {
    next = next.replace(DISPLAY_PREFIX_PATTERN, "").trim();
  }

  while (DISPLAY_SUFFIX_PATTERN.test(next)) {
    next = next.replace(DISPLAY_SUFFIX_PATTERN, "").trim();
  }

  return next;
};

const compareVerificationItems = (left: VerificationItem, right: VerificationItem) => {
  const categoryDelta =
    VERIFICATION_CATEGORY_ORDER.indexOf(left.category) -
    VERIFICATION_CATEGORY_ORDER.indexOf(right.category);

  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  return cleanDisplayText(left.item).localeCompare(cleanDisplayText(right.item));
};

const sortVerificationItems = (items: VerificationItem[]) =>
  [...items].sort(compareVerificationItems);

const compareSafetyItems = (left: SafetyItem, right: SafetyItem) => {
  const severityDelta =
    SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity);

  if (severityDelta !== 0) {
    return severityDelta;
  }

  return cleanDisplayText(left.issue).localeCompare(cleanDisplayText(right.issue));
};

const sortSafetyItems = (items: SafetyItem[]) =>
  [...items].sort(compareSafetyItems);

const compareConflictItems = (left: ConflictItem, right: ConflictItem) => {
  const severityDelta =
    SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity);

  if (severityDelta !== 0) {
    return severityDelta;
  }

  return cleanDisplayText(left.conflict).localeCompare(cleanDisplayText(right.conflict));
};

const sortConflictItems = (items: ConflictItem[]) =>
  [...items].sort(compareConflictItems);

const getRfiBadgeConfig = (key: keyof RfiPackage) => {
  switch (key) {
    case "rfis":
      return {
        label: "Needs Clarification",
        className: "plan-detail-pill-needs-clarification",
      };
    case "assumptions":
      return {
        label: "Inferred",
        className: "plan-detail-pill-inferred",
      };
    case "estimatorQuestions":
      return {
        label: "Needs Clarification",
        className: "plan-detail-pill-needs-clarification",
      };
    case "contingencyNotes":
      return {
        label: "Risk/Assumption",
        className: "plan-detail-pill-risk",
      };
    default:
      return {
        label: "Item",
        className: "plan-detail-pill-unknown",
      };
  }
};

const getOverviewStatus = (project: PlanProjectDoc | null) =>
  project?.modules?.overview?.status;

const getModuleStatus = (
  project: PlanProjectDoc | null,
  moduleType: PlanModuleType
): PlanModuleStatus | undefined => project?.modules?.[moduleType]?.status;

const getModuleError = (
  project: PlanProjectDoc | null,
  moduleType: PlanModuleType
) => project?.modules?.[moduleType]?.error;

const getProcessingCopy = (step: PipelineStep | null, project: PlanProjectDoc | null) => {
  if (step === "analyze" || getOverviewStatus(project) === "processing") {
    return "Upload complete. Running plan analysis...";
  }
  if (step === "generateScopes" || getModuleStatus(project, "scopes") === "processing") {
    return "Analysis complete. Generating trade scopes...";
  }
  if (step === "generateVerification" || getModuleStatus(project, "verification") === "processing") {
    return "Scopes complete. Generating verification checklist...";
  }
  if (step === "analyzeSafety" || getModuleStatus(project, "safety") === "processing") {
    return "Verification complete. Running safety review...";
  }
  if (step === "detectConflicts" || getModuleStatus(project, "conflicts") === "processing") {
    return "Safety review complete. Detecting cross-sheet conflicts...";
  }
  if (step === "generateRFIs" || getModuleStatus(project, "rfi") === "processing") {
    return "Conflict detection complete. Generating RFIs and estimator notes...";
  }
  return "Project upload complete.";
};

const isOptionalStepEnabled = (
  project: PlanProjectDoc | null,
  step: "verification" | "safety" | "conflicts" | "rfi"
) => {
  if (!project?.analysisOptions) {
    return true;
  }

  if (step === "verification") return project.analysisOptions.verification === true;
  if (step === "safety") return project.analysisOptions.safety === true;
  if (step === "conflicts") return project.analysisOptions.conflicts === true;
  return project.analysisOptions.rfi === true;
};

const isProjectFullyAnalyzed = (project: PlanProjectDoc | null) => {
  if (!project) return false;

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

const getStatusValue = (project: PlanProjectDoc | null) => {
  if (!project) return "Loading";
  if (isProjectFullyAnalyzed(project)) return "Fully Analyzed";
  if (getModuleStatus(project, "rfi") === "completed") return "Fully Analyzed";
  if (getModuleStatus(project, "rfi") === "failed") return "RFI Generation Failed";
  if (getModuleStatus(project, "rfi") === "processing") return "Generating RFIs";
  if (getModuleStatus(project, "conflicts") === "completed") return "Conflict Checked";
  if (getModuleStatus(project, "conflicts") === "failed") return "Conflict Detection Failed";
  if (getModuleStatus(project, "conflicts") === "processing") return "Detecting Conflicts";
  if (getModuleStatus(project, "safety") === "completed") return "Safety Reviewed";
  if (getModuleStatus(project, "safety") === "failed") return "Safety Analysis Failed";
  if (getModuleStatus(project, "safety") === "processing") return "Analyzing Safety";
  if (getModuleStatus(project, "verification") === "completed") return "Verified";
  if (getModuleStatus(project, "verification") === "failed") return "Verification Failed";
  if (getModuleStatus(project, "verification") === "processing") return "Generating Verification";
  if (getModuleStatus(project, "scopes") === "completed") return "Scoped";
  if (getModuleStatus(project, "scopes") === "failed") return "Scope Generation Failed";
  if (getModuleStatus(project, "scopes") === "processing") return "Generating Scopes";
  if (getOverviewStatus(project) === "completed" || getOverviewStatus(project) === "completed_with_errors") {
    return "Analyzed";
  }
  if (getOverviewStatus(project) === "failed") return "Analysis Failed";
  if (getOverviewStatus(project) === "processing") return "Analyzing";
  return project.status === "uploaded" ? "Uploaded" : project.status || "Uploaded";
};

const getProjectTitle = (
  project: Pick<PlanProjectDoc, "title"> | null
) => {
  if (project?.title?.trim()) {
    return project.title.trim();
  }

  return "Untitled plan analysis";
};

const formatProjectCreatedAt = (
  project: Pick<PlanProjectDoc, "createdAt">
) => {
  const timestamp =
    project.createdAt?.toDate?.() ||
    (typeof project.createdAt?.seconds === "number"
      ? new Date(project.createdAt.seconds * 1000)
      : null);

  return timestamp ? timestamp.toLocaleString() : "Pending date";
};

const PLAN_ANALYZER_TABS: Array<{ id: PlanAnalyzerTabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "tradeScopes", label: "Trade Scopes" },
  { id: "verification", label: "Verification Checklist" },
  { id: "safety", label: "Safety Review" },
  { id: "conflicts", label: "Conflicts" },
  { id: "rfi", label: "RFI Package" },
];

export default function PlanAnalyzerRun() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { toast } = useToast();
  const { profile } = useAuth();

  const [project, setProject] = useState<PlanProjectDoc | null>(null);
  const [overviewModule, setOverviewModule] = useState<PlanOverviewModuleRecord | null>(null);
  const [scopesModule, setScopesModule] = useState<PlanScopesModuleRecord | null>(null);
  const [verificationModule, setVerificationModule] = useState<PlanVerificationModuleRecord | null>(null);
  const [safetyModule, setSafetyModule] = useState<PlanSafetyModuleRecord | null>(null);
  const [conflictsModule, setConflictsModule] = useState<PlanConflictsModuleRecord | null>(null);
  const [rfiModule, setRfiModule] = useState<PlanRfiModuleRecord | null>(null);
  const [projectMissing, setProjectMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<ModalState>(null);
  const [activeStep, setActiveStep] = useState<PipelineStep | null>(null);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [showProgressPanel, setShowProgressPanel] = useState(true);
  const [progressPanelFading, setProgressPanelFading] = useState(false);
  const [activeTab, setActiveTab] = useState<PlanAnalyzerTabId>("overview");
  const [isPreparingBidPrefill, setIsPreparingBidPrefill] = useState(false);
  const [draftFavoriteItemIds, setDraftFavoriteItemIds] = useState<string[]>([]);
  const [isSavingFavorites, setIsSavingFavorites] = useState(false);
  const hasSeenIncompleteProgressRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = onSnapshot(
      doc(firestore, "planProjects", projectId),
      (snapshot) => {
        setLoading(false);

        if (!snapshot.exists()) {
          setProject(null);
          setProjectMissing(true);
          return;
        }

        setProject({
          id: snapshot.id,
          ...(snapshot.data() as Omit<PlanProjectDoc, "id">),
        });
        setProjectMissing(false);
      },
      (error) => {
        console.error("Failed to subscribe to project:", error);
        setLoading(false);
        toast({
          title: "Unable to load project",
          description: "The project processing view could not be loaded right now.",
          variant: "destructive",
        });
      }
    );

    return unsubscribe;
  }, [projectId, toast]);

  useEffect(() => {
    if (!projectId) return;

    const moduleSubscriptions = [
      onSnapshot(doc(firestore, "planProjects", projectId, "modules", "overview"), (snapshot) => {
        setOverviewModule(snapshot.exists() ? (snapshot.data() as PlanOverviewModuleRecord) : null);
      }),
      onSnapshot(doc(firestore, "planProjects", projectId, "modules", "scopes"), (snapshot) => {
        setScopesModule(snapshot.exists() ? (snapshot.data() as PlanScopesModuleRecord) : null);
      }),
      onSnapshot(doc(firestore, "planProjects", projectId, "modules", "verification"), (snapshot) => {
        setVerificationModule(snapshot.exists() ? (snapshot.data() as PlanVerificationModuleRecord) : null);
      }),
      onSnapshot(doc(firestore, "planProjects", projectId, "modules", "safety"), (snapshot) => {
        setSafetyModule(snapshot.exists() ? (snapshot.data() as PlanSafetyModuleRecord) : null);
      }),
      onSnapshot(doc(firestore, "planProjects", projectId, "modules", "conflicts"), (snapshot) => {
        setConflictsModule(snapshot.exists() ? (snapshot.data() as PlanConflictsModuleRecord) : null);
      }),
      onSnapshot(doc(firestore, "planProjects", projectId, "modules", "rfi"), (snapshot) => {
        setRfiModule(snapshot.exists() ? (snapshot.data() as PlanRfiModuleRecord) : null);
      }),
    ];

    return () => {
      moduleSubscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [projectId]);

  const analysisResult = useMemo<PlanAnalysisResult | null>(() => {
    if (
      overviewModule?.status !== "completed" &&
      overviewModule?.status !== "completed_with_errors"
    ) {
      return null;
    }
    const result = overviewModule.result;

    return {
      projectType: typeof result?.projectType === "string" ? result.projectType : "",
      areas: Array.isArray(result?.areas) ? result.areas : [],
      summary: typeof result?.summary === "string" ? result.summary : "",
    };
  }, [overviewModule]);

  const scopeResult = useMemo<ScopeResult | null>(
    () => (scopesModule?.status === "completed" ? scopesModule.result || {} : null),
    [scopesModule]
  );

  const verificationResult = useMemo<VerificationItem[] | null>(
    () => (verificationModule?.status === "completed" ? verificationModule.result || [] : null),
    [verificationModule]
  );

  const safetyResult = useMemo<SafetyItem[] | null>(
    () => (safetyModule?.status === "completed" ? safetyModule.result || [] : null),
    [safetyModule]
  );

  const conflictResult = useMemo<ConflictItem[] | null>(
    () => (conflictsModule?.status === "completed" ? conflictsModule.result || [] : null),
    [conflictsModule]
  );

  const rfiResult = useMemo<RfiPackage | null>(() => {
    if (rfiModule?.status !== "completed") return null;
    const result = rfiModule.result;

    return {
      rfis: Array.isArray(result?.rfis) ? result.rfis : [],
      assumptions: Array.isArray(result?.assumptions) ? result.assumptions : [],
      estimatorQuestions: Array.isArray(result?.estimatorQuestions) ? result.estimatorQuestions : [],
      contingencyNotes: Array.isArray(result?.contingencyNotes) ? result.contingencyNotes : [],
    };
  }, [rfiModule]);

  const failedStepError = useMemo(() => {
    if (!project) return "";
    return (
      rfiModule?.error ||
      getModuleError(project, "rfi") ||
      conflictsModule?.error ||
      getModuleError(project, "conflicts") ||
      safetyModule?.error ||
      getModuleError(project, "safety") ||
      verificationModule?.error ||
      getModuleError(project, "verification") ||
      scopesModule?.error ||
      getModuleError(project, "scopes") ||
      overviewModule?.error ||
      getModuleError(project, "overview") ||
      ""
    );
  }, [conflictsModule, overviewModule, project, rfiModule, safetyModule, scopesModule, verificationModule]);

  const visibleTabs = useMemo(() => {
    return PLAN_ANALYZER_TABS.filter((tab) => {
      if (tab.id === "overview" || tab.id === "tradeScopes") {
        return true;
      }

      if (tab.id === "verification") {
        return isOptionalStepEnabled(project, "verification");
      }

      if (tab.id === "safety") {
        return isOptionalStepEnabled(project, "safety");
      }

      if (tab.id === "conflicts") {
        return isOptionalStepEnabled(project, "conflicts");
      }

      if (tab.id === "rfi") {
        return isOptionalStepEnabled(project, "rfi");
      }

      return true;
    });
  }, [project]);

  const allSelectableScopeItems = useMemo(() => {
    return SCOPE_TRADE_LABELS.flatMap(({ key, label }) =>
      Array.isArray(scopeResult?.[key])
        ? scopeResult[key].map((item, index) => ({
            id: buildScopeSelectionId(key, index),
            tradeKey: key,
            tradeLabel: label,
            item,
          }))
        : []
    );
  }, [scopeResult]);

  const allSelectableVerificationItems = useMemo(
    () =>
      (verificationResult || []).map((item, index) => ({
        id: buildVerificationSelectionId(index),
        item,
      })),
    [verificationResult]
  );

  const allSelectableSafetyItems = useMemo(
    () =>
      (safetyResult || []).map((item, index) => ({
        id: buildSafetySelectionId(index),
        item,
      })),
    [safetyResult]
  );

  const allSelectableConflictItems = useMemo(
    () =>
      (conflictResult || []).map((item, index) => ({
        id: buildConflictSelectionId(index),
        item,
      })),
    [conflictResult]
  );

  const allSelectableRfiItems = useMemo(
    () =>
      rfiResult
        ? (Object.entries(rfiResult) as Array<[keyof RfiPackage, string[]]>).flatMap(([sectionKey, items]) =>
            items.map((item, index) => ({
              id: buildRfiSelectionId(sectionKey, index),
              item,
              sectionKey,
            }))
          )
        : [],
    [rfiResult]
  );

  const selectedScopeItemIds = useMemo(() => {
    const validIds = new Set(allSelectableScopeItems.map(({ id }) => id));
    return Array.isArray(scopesModule?.favoriteItemIds)
      ? scopesModule.favoriteItemIds.filter((id) => validIds.has(id))
      : [];
  }, [allSelectableScopeItems, scopesModule?.favoriteItemIds]);

  const selectedVerificationItemIds = useMemo(() => {
    const validIds = new Set(allSelectableVerificationItems.map(({ id }) => id));
    return Array.isArray(verificationModule?.favoriteItemIds)
      ? verificationModule.favoriteItemIds.filter((id) => validIds.has(id))
      : [];
  }, [allSelectableVerificationItems, verificationModule?.favoriteItemIds]);

  const selectedSafetyItemIds = useMemo(() => {
    const validIds = new Set(allSelectableSafetyItems.map(({ id }) => id));
    return Array.isArray(safetyModule?.favoriteItemIds)
      ? safetyModule.favoriteItemIds.filter((id) => validIds.has(id))
      : [];
  }, [allSelectableSafetyItems, safetyModule?.favoriteItemIds]);

  const selectedConflictItemIds = useMemo(() => {
    const validIds = new Set(allSelectableConflictItems.map(({ id }) => id));
    return Array.isArray(conflictsModule?.favoriteItemIds)
      ? conflictsModule.favoriteItemIds.filter((id) => validIds.has(id))
      : [];
  }, [allSelectableConflictItems, conflictsModule?.favoriteItemIds]);

  const selectedRfiItemIds = useMemo(() => {
    const validIds = new Set(allSelectableRfiItems.map(({ id }) => id));
    return Array.isArray(rfiModule?.favoriteItemIds)
      ? rfiModule.favoriteItemIds.filter((id) => validIds.has(id))
      : [];
  }, [allSelectableRfiItems, rfiModule?.favoriteItemIds]);

  const selectedScopeItemIdSet = useMemo(
    () => new Set(selectedScopeItemIds),
    [selectedScopeItemIds]
  );
  const selectedVerificationItemIdSet = useMemo(
    () => new Set(selectedVerificationItemIds),
    [selectedVerificationItemIds]
  );
  const selectedSafetyItemIdSet = useMemo(
    () => new Set(selectedSafetyItemIds),
    [selectedSafetyItemIds]
  );
  const selectedConflictItemIdSet = useMemo(
    () => new Set(selectedConflictItemIds),
    [selectedConflictItemIds]
  );
  const selectedRfiItemIdSet = useMemo(
    () => new Set(selectedRfiItemIds),
    [selectedRfiItemIds]
  );

  const selectedScopeItems = useMemo(
    () => allSelectableScopeItems.filter(({ id }) => selectedScopeItemIdSet.has(id)),
    [allSelectableScopeItems, selectedScopeItemIdSet]
  );
  const selectedVerificationItems = useMemo(
    () => allSelectableVerificationItems.filter(({ id }) => selectedVerificationItemIdSet.has(id)),
    [allSelectableVerificationItems, selectedVerificationItemIdSet]
  );
  const selectedSafetyItems = useMemo(
    () => allSelectableSafetyItems.filter(({ id }) => selectedSafetyItemIdSet.has(id)),
    [allSelectableSafetyItems, selectedSafetyItemIdSet]
  );
  const selectedConflictItems = useMemo(
    () => allSelectableConflictItems.filter(({ id }) => selectedConflictItemIdSet.has(id)),
    [allSelectableConflictItems, selectedConflictItemIdSet]
  );
  const selectedRfiItems = useMemo(
    () => allSelectableRfiItems.filter(({ id }) => selectedRfiItemIdSet.has(id)),
    [allSelectableRfiItems, selectedRfiItemIdSet]
  );
  const draftFavoriteItemIdSet = useMemo(
    () => new Set(draftFavoriteItemIds),
    [draftFavoriteItemIds]
  );

  const nextStep = useMemo<PipelineStep | null>(() => {
    if (!project || !project.uploadedFiles?.length) {
      return null;
    }

    if (
      getOverviewStatus(project) === "failed" ||
      getModuleStatus(project, "scopes") === "failed" ||
      getModuleStatus(project, "verification") === "failed" ||
      getModuleStatus(project, "safety") === "failed" ||
      getModuleStatus(project, "conflicts") === "failed" ||
      getModuleStatus(project, "rfi") === "failed"
    ) {
      return null;
    }

    if (
      getOverviewStatus(project) !== "completed" &&
      getOverviewStatus(project) !== "completed_with_errors"
    ) {
      return getOverviewStatus(project) === "processing" ? null : "analyze";
    }

    if (getModuleStatus(project, "scopes") !== "completed") {
      return getModuleStatus(project, "scopes") === "processing" ? null : "generateScopes";
    }

    if (isOptionalStepEnabled(project, "verification") && getModuleStatus(project, "verification") !== "completed") {
      return getModuleStatus(project, "verification") === "processing" ? null : "generateVerification";
    }

    if (isOptionalStepEnabled(project, "safety") && getModuleStatus(project, "safety") !== "completed") {
      return getModuleStatus(project, "safety") === "processing" ? null : "analyzeSafety";
    }

    if (isOptionalStepEnabled(project, "conflicts") && getModuleStatus(project, "conflicts") !== "completed") {
      return getModuleStatus(project, "conflicts") === "processing" ? null : "detectConflicts";
    }

    if (isOptionalStepEnabled(project, "rfi") && getModuleStatus(project, "rfi") !== "completed") {
      return getModuleStatus(project, "rfi") === "processing" ? null : "generateRFIs";
    }

    return null;
  }, [project]);

  const progressMetrics = useMemo(() => {
    if (!project) {
      return {
        totalSteps: 2,
        completedSteps: 0,
        completedProgress: 0,
        segmentSize: 50,
        inFlightCeiling: 49,
      };
    }

    const enabledOptionalSteps = [
      isOptionalStepEnabled(project, "verification"),
      isOptionalStepEnabled(project, "safety"),
      isOptionalStepEnabled(project, "conflicts"),
      isOptionalStepEnabled(project, "rfi"),
    ].filter(Boolean).length;

    const totalSteps = 2 + enabledOptionalSteps;
    const completedSteps = [
      getOverviewStatus(project) === "completed" || getOverviewStatus(project) === "completed_with_errors",
      getModuleStatus(project, "scopes") === "completed",
      isOptionalStepEnabled(project, "verification")
        ? getModuleStatus(project, "verification") === "completed"
        : null,
      isOptionalStepEnabled(project, "safety")
        ? getModuleStatus(project, "safety") === "completed"
        : null,
      isOptionalStepEnabled(project, "conflicts")
        ? getModuleStatus(project, "conflicts") === "completed"
        : null,
      isOptionalStepEnabled(project, "rfi")
        ? getModuleStatus(project, "rfi") === "completed"
        : null,
    ].filter(Boolean).length;

    const safeTotalSteps = Math.max(totalSteps, 1);

    return {
      totalSteps: safeTotalSteps,
      completedSteps,
      completedProgress: (completedSteps / safeTotalSteps) * 100,
      segmentSize: 100 / safeTotalSteps,
      isFinalStepInFlight: completedSteps === safeTotalSteps - 1,
      inFlightCeiling: Math.min(
        ((completedSteps + 1) / safeTotalSteps) * 100 - 1,
        99
      ),
    };
  }, [project]);

  const isFullyAnalyzed = isProjectFullyAnalyzed(project);
  const shouldRenderProgressPanel =
    showProgressPanel && (!isFullyAnalyzed || hasSeenIncompleteProgressRef.current);
  const isActivelyProcessing =
    !isFullyAnalyzed &&
    Boolean(
      activeStep ||
        getOverviewStatus(project) === "processing" ||
        getModuleStatus(project, "scopes") === "processing" ||
        getModuleStatus(project, "verification") === "processing" ||
        getModuleStatus(project, "safety") === "processing" ||
        getModuleStatus(project, "conflicts") === "processing" ||
      getModuleStatus(project, "rfi") === "processing"
    );
  const visibleProgress = useMemo(() => {
    if (isFullyAnalyzed) {
      return displayedProgress;
    }

    return Math.max(displayedProgress, progressMetrics.completedProgress);
  }, [displayedProgress, isFullyAnalyzed, progressMetrics.completedProgress]);

  useEffect(() => {
    if (!project) {
      setDisplayedProgress(0);
      setShowProgressPanel(true);
      setProgressPanelFading(false);
      hasSeenIncompleteProgressRef.current = false;
      return;
    }

    if (!isFullyAnalyzed) {
      hasSeenIncompleteProgressRef.current = true;
    }

    if (isFullyAnalyzed && !hasSeenIncompleteProgressRef.current) {
      setDisplayedProgress(100);
      setShowProgressPanel(false);
      setProgressPanelFading(false);
      return;
    }

    const interval = window.setInterval(() => {
      setDisplayedProgress((current) => {
        const { completedProgress, inFlightCeiling } = progressMetrics;

        if (isFullyAnalyzed) {
          if (current >= 100) return 100;
          const next = current + Math.max(1.4, (100 - current) * 0.22);
          return Math.min(100, Number(next.toFixed(1)));
        }

        if (current < completedProgress) {
          const next = current + Math.max(2.2, (completedProgress - current) * 0.35);
          return Math.min(completedProgress, Number(next.toFixed(1)));
        }

        if (isActivelyProcessing) {
          if (current < inFlightCeiling) {
            const isSlowFunction =
              activeStep === "generateScopes" ||
              activeStep === "generateRFIs" ||
              getModuleStatus(project, "scopes") === "processing" ||
              getModuleStatus(project, "rfi") === "processing";
            const minIncrement = isSlowFunction ? 0.06 : 0.07;
            const proportionalIncrement = isSlowFunction ? 0.011 : 0.012;
            const next =
              current + Math.max(minIncrement, (inFlightCeiling - current) * proportionalIncrement);
            return Math.min(inFlightCeiling, Number(next.toFixed(1)));
          }
          return Number(Math.min(inFlightCeiling, current).toFixed(1));
        }

        if (current > completedProgress && !isFullyAnalyzed) {
          const next = current - Math.max(0.4, (current - completedProgress) * 0.2);
          return Math.max(completedProgress, Number(next.toFixed(1)));
        }

        return Math.max(0, Math.min(100, Number(current.toFixed(1))));
      });
    }, 220);

    return () => window.clearInterval(interval);
  }, [activeStep, project, progressMetrics, isActivelyProcessing, isFullyAnalyzed]);

  useEffect(() => {
    if (!isFullyAnalyzed) {
      setShowProgressPanel(true);
      setProgressPanelFading(false);
      return;
    }

    if (displayedProgress < 100) {
      setShowProgressPanel(true);
      setProgressPanelFading(false);
      return;
    }

    setProgressPanelFading(true);
    const fadeTimer = window.setTimeout(() => {
      setShowProgressPanel(false);
    }, 900);

    return () => window.clearTimeout(fadeTimer);
  }, [displayedProgress, isFullyAnalyzed]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (!activeModal) {
      setDraftFavoriteItemIds([]);
      setIsSavingFavorites(false);
      return;
    }

    if (activeModal.type === "scope") {
      const modalIds = activeModal.items.map((_, index) =>
        buildScopeSelectionId(activeModal.tradeKey, index)
      );
      setDraftFavoriteItemIds(selectedScopeItemIds.filter((id) => modalIds.includes(id)));
      return;
    }

    if (activeModal.type === "scopeFavorites") {
      const modalIds = activeModal.items.map(({ id }) => id);
      setDraftFavoriteItemIds(selectedScopeItemIds.filter((id) => modalIds.includes(id)));
      return;
    }

    if (activeModal.type === "verification") {
      const modalIds = activeModal.items.map(({ id }) => id);
      setDraftFavoriteItemIds(selectedVerificationItemIds.filter((id) => modalIds.includes(id)));
      return;
    }

    if (activeModal.type === "safety") {
      const modalIds = activeModal.items.map(({ id }) => id);
      setDraftFavoriteItemIds(selectedSafetyItemIds.filter((id) => modalIds.includes(id)));
      return;
    }

    if (activeModal.type === "conflict") {
      const modalIds = activeModal.items.map(({ id }) => id);
      setDraftFavoriteItemIds(selectedConflictItemIds.filter((id) => modalIds.includes(id)));
      return;
    }

    if (activeModal.type === "rfi") {
      const modalIds = activeModal.items.map(({ id }) => id);
      setDraftFavoriteItemIds(selectedRfiItemIds.filter((id) => modalIds.includes(id)));
      return;
    }
  }, [
    activeModal,
    selectedConflictItemIds,
    selectedRfiItemIds,
    selectedSafetyItemIds,
    selectedScopeItemIds,
    selectedVerificationItemIds,
  ]);

  useEffect(() => {
    if (!projectId || !project || !nextStep || activeStep) {
      return;
    }

    const projectRef = doc(firestore, "planProjects", projectId);

    const runStep = async () => {
      setActiveStep(nextStep);

      try {
        if (nextStep === "analyze") {
          await updateDoc(projectRef, { "modules.overview.status": "processing" });
        }

        const response = await fetch(
          `${getFunctionsBaseUrl()}/${
            nextStep === "analyze"
              ? "analyzePlanFiles"
              : nextStep === "generateScopes"
                ? "generateScopes"
                : nextStep === "generateVerification"
                  ? "generateVerificationChecklist"
                : nextStep === "analyzeSafety"
                    ? "analyzeSafety"
                    : nextStep === "detectConflicts"
                      ? "detectConflicts"
                      : "generateRFIs"
          }`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              nextStep === "analyze"
                ? {
                    projectId,
                    fileUrl: project.uploadedFiles?.[0]?.downloadURL || "",
                  }
                : { projectId }
            ),
          }
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : `The ${nextStep} step failed.`
          );
        }
      } catch (error) {
        console.error(`Plan analyzer step failed: ${nextStep}`, error);
        toast({
          title: "Project processing failed",
          description:
            error instanceof Error
              ? error.message
              : "A processing step failed for this project.",
          variant: "destructive",
        });
      } finally {
        setActiveStep(null);
      }
    };

    void runStep();
  }, [activeStep, nextStep, project, projectId, toast]);

  const openScopeModal = (tradeKey: string, label: string) => {
    const items = Array.isArray(scopeResult?.[tradeKey]) ? scopeResult[tradeKey] : [];
    setActiveModal({
      type: "scope",
      tradeKey,
      tradeLabel: label,
      title: `${label} Scope`,
      description: items.length
        ? `${items.length} bid item${items.length === 1 ? "" : "s"} generated for this trade.`
        : "No scope items were generated for this trade.",
      items,
    });
  };

  const openFavoriteScopeModal = () => {
    setActiveModal({
      type: "scopeFavorites",
      title: "Favorite Scope Items",
      description: `${selectedScopeItems.length} saved scope favorite${selectedScopeItems.length === 1 ? "" : "s"}.`,
      items: selectedScopeItems,
    });
  };

  const openVerificationModal = (title: string, category?: VerificationItem["category"]) => {
    const items = [...allSelectableVerificationItems]
      .filter(({ item }) => (category ? item.category === category : true))
      .sort((left, right) => compareVerificationItems(left.item, right.item));
    setActiveModal({
      type: "verification",
      title,
      description: items.length
        ? `${items.length} field verification item${items.length === 1 ? "" : "s"} in this group.`
        : "No verification items were generated for this group.",
      items,
    });
  };

  const openSafetyModal = (title: string, severity?: SafetyItem["severity"]) => {
    const items = [...allSelectableSafetyItems]
      .filter(({ item }) => (severity ? item.severity === severity : true))
      .sort((left, right) => compareSafetyItems(left.item, right.item));
    setActiveModal({
      type: "safety",
      title,
      description: items.length
        ? `${items.length} safety review item${items.length === 1 ? "" : "s"} in this group.`
        : "No safety review items were generated for this group.",
      items,
    });
  };

  const openConflictModal = (title: string, severity?: ConflictItem["severity"]) => {
    const items = [...allSelectableConflictItems]
      .filter(({ item }) => (severity ? item.severity === severity : true))
      .sort((left, right) => compareConflictItems(left.item, right.item));
    setActiveModal({
      type: "conflict",
      title,
      description: items.length
        ? `${items.length} coordination conflict${items.length === 1 ? "" : "s"} in this group.`
        : "No conflicts were generated for this group.",
      items,
    });
  };

  const openRfiModal = (title: string, key: keyof RfiPackage) => {
    const items = allSelectableRfiItems.filter(({ sectionKey }) => sectionKey === key);
    const badgeConfig = getRfiBadgeConfig(key);
    setActiveModal({
      type: "rfi",
      title,
      description: items.length
        ? `${items.length} item${items.length === 1 ? "" : "s"} in this section.`
        : "No items were generated for this section.",
      items,
      badgeLabel: badgeConfig.label,
      badgeClassName: badgeConfig.className,
    });
  };

  const toggleDraftFavoriteSelection = (selectionId: string) => {
    setDraftFavoriteItemIds((current) =>
      current.includes(selectionId)
        ? current.filter((id) => id !== selectionId)
        : [...current, selectionId]
    );
  };

  const getActiveModalFavoriteConfig = () => {
    if (!activeModal) return null;

    if (activeModal.type === "scope") {
      return {
        field: "scopes" as const,
        currentIds: selectedScopeItemIds,
        itemIds: activeModal.items.map((_, index) => buildScopeSelectionId(activeModal.tradeKey, index)),
        errorTitle: "Unable to save scope favorites",
      };
    }

    if (activeModal.type === "scopeFavorites") {
      return {
        field: "scopes" as const,
        currentIds: selectedScopeItemIds,
        itemIds: activeModal.items.map(({ id }) => id),
        errorTitle: "Unable to save scope favorites",
      };
    }

    if (activeModal.type === "verification") {
      return {
        field: "verification" as const,
        currentIds: selectedVerificationItemIds,
        itemIds: activeModal.items.map(({ id }) => id),
        errorTitle: "Unable to save verification favorites",
      };
    }

    if (activeModal.type === "safety") {
      return {
        field: "safety" as const,
        currentIds: selectedSafetyItemIds,
        itemIds: activeModal.items.map(({ id }) => id),
        errorTitle: "Unable to save safety favorites",
      };
    }

    if (activeModal.type === "conflict") {
      return {
        field: "conflicts" as const,
        currentIds: selectedConflictItemIds,
        itemIds: activeModal.items.map(({ id }) => id),
        errorTitle: "Unable to save conflict favorites",
      };
    }

    if (activeModal.type === "rfi") {
      return {
        field: "rfi" as const,
        currentIds: selectedRfiItemIds,
        itemIds: activeModal.items.map(({ id }) => id),
        errorTitle: "Unable to save RFI favorites",
      };
    }

    return null;
  };

  const handleSaveFavoriteSelections = async () => {
    const config = getActiveModalFavoriteConfig();

    if (!config || !projectId) {
      return;
    }

    const modalItemIdSet = new Set(config.itemIds);
    const preservedIds = config.currentIds.filter((id) => !modalItemIdSet.has(id));
    const nextIds = [...preservedIds, ...draftFavoriteItemIds.filter((id) => modalItemIdSet.has(id))];

    setIsSavingFavorites(true);

    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      await updateDoc(doc(firestore, "planProjects", projectId, "modules", config.field), {
        favoriteItemIds: nextIds,
      });
      setActiveModal(null);
    } catch (error) {
      console.error(`Failed to save ${config.field} favorites:`, error);
      toast({
        title: config.errorTitle,
        description: "Your favorites could not be saved right now.",
        variant: "destructive",
      });
    } finally {
      setIsSavingFavorites(false);
    }
  };

  const activeModalFavoriteConfig = getActiveModalFavoriteConfig();
  const shouldShowSaveFavorites = useMemo(() => {
    if (!activeModalFavoriteConfig) {
      return false;
    }

    const savedIdsForModal = activeModalFavoriteConfig.currentIds.filter((id) =>
      activeModalFavoriteConfig.itemIds.includes(id)
    );

    return !haveSameIds(savedIdsForModal, draftFavoriteItemIds);
  }, [activeModalFavoriteConfig, draftFavoriteItemIds]);

  const openFavoriteVerificationModal = () => {
    const items = [...selectedVerificationItems].sort((left, right) =>
      compareVerificationItems(left.item, right.item)
    );
    setActiveModal({
      type: "verification",
      title: "Favorite Verification Items",
      description: `${items.length} saved verification favorite${items.length === 1 ? "" : "s"}.`,
      items,
    });
  };

  const openFavoriteSafetyModal = () => {
    const items = [...selectedSafetyItems].sort((left, right) =>
      compareSafetyItems(left.item, right.item)
    );
    setActiveModal({
      type: "safety",
      title: "Favorite Safety Items",
      description: `${items.length} saved safety favorite${items.length === 1 ? "" : "s"}.`,
      items,
    });
  };

  const openFavoriteConflictModal = () => {
    const items = [...selectedConflictItems].sort((left, right) =>
      compareConflictItems(left.item, right.item)
    );
    setActiveModal({
      type: "conflict",
      title: "Favorite Conflicts",
      description: `${items.length} saved conflict favorite${items.length === 1 ? "" : "s"}.`,
      items,
    });
  };

  const openFavoriteRfiModal = () => {
    const items = selectedRfiItems.map(({ id, item }) => ({ id, item }));
    setActiveModal({
      type: "rfi",
      title: "Favorite RFI Items",
      description: `${items.length} saved RFI favorite${items.length === 1 ? "" : "s"}.`,
      items,
      badgeLabel: "Favorite",
      badgeClassName: "plan-detail-pill-inferred",
    });
  };

  const handleAddSelectedScopesToNewBid = async () => {
    if (!selectedScopeItems.length) {
      return;
    }

    setIsPreparingBidPrefill(true);

    try {
      const response = await fetch(`${getFunctionsBaseUrl()}/formatPlanScopeSelectionsForBid`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selections: selectedScopeItems.map(({ tradeLabel, item }) => ({
            trade: tradeLabel,
            title: cleanDisplayText(item.title),
            description: cleanDisplayText(item.description),
          })),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "We couldn't prepare the selected scopes for a new bid."
        );
      }

      const payload = await response.json();
      const formattedLineItems = Array.isArray(payload?.line_items)
        ? payload.line_items
        : [];

      if (!formattedLineItems.length) {
        throw new Error("No formatted bid scopes were returned.");
      }

      const today = new Date().toISOString().slice(0, 10);
      const prefillBid: BidFormPrefillState = {
        formSnapshot: {
          company_name: profile?.companyName ?? "",
          company_address: profile?.companyAddress ?? "",
          company_phone: profile?.phone ?? "",
          company_email: profile?.email ?? "",
          company_slogan: profile?.slogan ?? "",
          invoice_date: today,
          invoice_number: "",
          salesperson: "",
          job: getProjectTitle(project),
          payment_terms: "",
          approx_weeks: "",
          contingency_coverage: "",
          total_costs: "",
          deposit_percentage: "",
          weekly_payments: "",
          customer_name: "",
          customer_address: "",
          customer_phone: "",
          customer_email: "",
          tax_percentage: "7",
          contingency_percentage: "",
        },
        lineItems: (formattedLineItems as FormattedBidLineItem[]).map((lineItem) => ({
          trade: String(lineItem?.trade || "").trim(),
          scope: Array.isArray(lineItem?.scope_lines)
            ? lineItem.scope_lines
                .map((line) => String(line || "").trim())
                .filter(Boolean)
                .join("\n")
            : "",
          material_labor_included: "Yes",
          line_total: "",
        })),
      };

      navigate("/form/bid_form", {
        state: {
          prefillBid,
        },
      });
    } catch (error) {
      toast({
        title: "Unable to prepare bid scopes",
        description:
          error instanceof Error
            ? error.message
            : "There was a problem preparing the selected scopes for your bid.",
        variant: "destructive",
      });
    } finally {
      setIsPreparingBidPrefill(false);
    }
  };

  const renderOverviewTab = () => (
    <>
      {failedStepError ? (
        <div className="plan-analysis-card">
          <span className="plan-summary-label">Latest error</span>
          <p className="plan-analysis-copy">{failedStepError}</p>
        </div>
      ) : null}

      {analysisResult ? (
        <div className="plan-analysis-summary">
          <div className="plan-results-grid">
            <div className="plan-results-stat">
              <span className="plan-summary-label">Project type</span>
              <strong className="plan-analysis-value">
                {analysisResult.projectType || "Not detected"}
              </strong>
            </div>
            <div className="plan-results-stat">
              <span className="plan-summary-label">Affected areas</span>
              <strong className="plan-analysis-value">
                {analysisResult.areas.length ? analysisResult.areas.join(", ") : "Not detected"}
              </strong>
            </div>
          </div>

          <div className="plan-analysis-card">
            <span className="plan-summary-label">High-level scope</span>
            <p className="plan-analysis-copy">{analysisResult.summary || "No summary returned."}</p>
          </div>
        </div>
      ) : (
        <div className="plan-empty-state">
          Overview details will appear once the core plan analysis finishes.
        </div>
      )}

      <div className="plan-analysis-card plan-uploaded-files-card">
        <div className="plan-analysis-card-heading-copy">
          <span className="plan-summary-label">Uploaded file</span>
          <p className="plan-section-subtitle">
            Open the uploaded source file for this plan analysis.
          </p>
        </div>

        <div className="plan-uploaded-list plan-uploaded-list-inline">
          {(project?.uploadedFiles || []).length ? (
            (project?.uploadedFiles || []).map((file) => (
              <div key={file.storagePath} className="plan-uploaded-row">
                <div>
                  <p className="plan-file-name">{file.name}</p>
                </div>

                <a
                  href={file.downloadURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="plan-uploaded-link"
                >
                  Open file
                </a>
              </div>
            ))
          ) : (
            <div className="plan-empty-state plan-empty-state-compact">No uploaded file found.</div>
          )}
        </div>
      </div>
    </>
  );

  const renderTradeScopesTab = () =>
    scopeResult ? (
      <div className="plan-scope-summary">
          <div className="plan-analysis-card">
            <div className="plan-analysis-card-heading">
              <div className="plan-analysis-card-heading-copy">
                <span className="plan-summary-label">Generated trade scopes</span>
                <p className="plan-section-subtitle">
                Organized bid-style scope items by trade (Select scopes to add to bid).
              </p>
              </div>

              <div className="plan-scope-tab-actions">
                {selectedScopeItems.length ? (
                  <button type="button" className="plan-secondary-action-button" onClick={openFavoriteScopeModal}>
                    View Favorites
                  </button>
                ) : null}
                {selectedScopeItems.length ? (
                  <button
                    type="button"
                    className="plan-add-to-bid-button"
                    onClick={() => {
                      void handleAddSelectedScopesToNewBid();
                    }}
                    disabled={isPreparingBidPrefill}
                  >
                    {isPreparingBidPrefill ? "Preparing Bid..." : "Add to New Bid"}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="plan-scope-grid">
              {SCOPE_TRADE_LABELS.map(({ key, label }) => {
                const itemCount = Array.isArray(scopeResult[key]) ? scopeResult[key].length : 0;
                const selectedCount = allSelectableScopeItems.filter(
                  ({ tradeKey, id }) => tradeKey === key && selectedScopeItemIdSet.has(id)
                ).length;

                return (
                  <button
                    key={key}
                    type="button"
                    className="plan-scope-trade"
                    onClick={() => openScopeModal(key, label)}
                  >
                    {selectedCount > 0 ? (
                      <span className="plan-scope-trade-selection-count">
                        {selectedCount}/{itemCount}
                      </span>
                    ) : null}
                    <span className="plan-scope-trade-label">{label}</span>
                    <strong className="plan-scope-trade-value">{itemCount}</strong>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    ) : (
      <div className="plan-empty-state">
        Trade scopes will appear here after scope generation completes.
      </div>
    );

  const renderVerificationTab = () =>
    verificationResult ? (
      <div className="plan-scope-summary">
        <div className="plan-analysis-card">
          <div className="plan-analysis-card-heading">
            <div className="plan-analysis-card-heading-copy">
              <span className="plan-summary-label">Verification checklist</span>
              <p className="plan-section-subtitle">
                Field checks and plan follow-ups to confirm dimensions, structure, access, and existing conditions.
              </p>
            </div>
            {selectedVerificationItems.length ? (
              <button type="button" className="plan-secondary-action-button" onClick={openFavoriteVerificationModal}>
                View Favorites
              </button>
            ) : null}
          </div>
          <div className="plan-scope-grid plan-scope-grid-six">
            <button type="button" className="plan-scope-trade" onClick={() => openVerificationModal("All Verification Items")}>
              {selectedVerificationItems.length ? (
                <span className="plan-scope-trade-selection-count">
                  {selectedVerificationItems.length}/{verificationResult.length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Checklist items</span>
              <strong className="plan-scope-trade-value">{verificationResult.length}</strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openVerificationModal("Dimensions Verification", "dimensions")}>
              {allSelectableVerificationItems.filter(({ id, item }) => item.category === "dimensions" && selectedVerificationItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableVerificationItems.filter(({ id, item }) => item.category === "dimensions" && selectedVerificationItemIdSet.has(id)).length}/
                  {verificationResult.filter((item) => item.category === "dimensions").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Dimensions</span>
              <strong className="plan-scope-trade-value">
                {verificationResult.filter((item) => item.category === "dimensions").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openVerificationModal("Structure Verification", "structure")}>
              {allSelectableVerificationItems.filter(({ id, item }) => item.category === "structure" && selectedVerificationItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableVerificationItems.filter(({ id, item }) => item.category === "structure" && selectedVerificationItemIdSet.has(id)).length}/
                  {verificationResult.filter((item) => item.category === "structure").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Structure</span>
              <strong className="plan-scope-trade-value">
                {verificationResult.filter((item) => item.category === "structure").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openVerificationModal("MEP Conflict Verification", "MEP_conflict")}>
              {allSelectableVerificationItems.filter(({ id, item }) => item.category === "MEP_conflict" && selectedVerificationItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableVerificationItems.filter(({ id, item }) => item.category === "MEP_conflict" && selectedVerificationItemIdSet.has(id)).length}/
                  {verificationResult.filter((item) => item.category === "MEP_conflict").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">MEP Conflicts</span>
              <strong className="plan-scope-trade-value">
                {verificationResult.filter((item) => item.category === "MEP_conflict").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openVerificationModal("Access Verification", "access")}>
              {allSelectableVerificationItems.filter(({ id, item }) => item.category === "access" && selectedVerificationItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableVerificationItems.filter(({ id, item }) => item.category === "access" && selectedVerificationItemIdSet.has(id)).length}/
                  {verificationResult.filter((item) => item.category === "access").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Access</span>
              <strong className="plan-scope-trade-value">
                {verificationResult.filter((item) => item.category === "access").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openVerificationModal("Existing Conditions Verification", "existing_conditions")}>
              {allSelectableVerificationItems.filter(({ id, item }) => item.category === "existing_conditions" && selectedVerificationItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableVerificationItems.filter(({ id, item }) => item.category === "existing_conditions" && selectedVerificationItemIdSet.has(id)).length}/
                  {verificationResult.filter((item) => item.category === "existing_conditions").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Existing Conditions</span>
              <strong className="plan-scope-trade-value">
                {verificationResult.filter((item) => item.category === "existing_conditions").length}
              </strong>
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div className="plan-empty-state">
        Verification checklist items will appear here when that review finishes.
      </div>
    );

  const renderSafetyTab = () =>
    safetyResult ? (
      <div className="plan-scope-summary">
        <div className="plan-analysis-card">
          <div className="plan-analysis-card-heading">
            <div className="plan-analysis-card-heading-copy">
              <span className="plan-summary-label">Safety review</span>
              <p className="plan-section-subtitle">
                Potential life-safety, access, egress, clearance, and code-sensitive items that need review.
              </p>
            </div>
            {selectedSafetyItems.length ? (
              <button type="button" className="plan-secondary-action-button" onClick={openFavoriteSafetyModal}>
                View Favorites
              </button>
            ) : null}
          </div>
          <div className="plan-scope-grid plan-scope-grid-five">
            <button type="button" className="plan-scope-trade" onClick={() => openSafetyModal("All Safety Review Items")}>
              {selectedSafetyItems.length ? (
                <span className="plan-scope-trade-selection-count">
                  {selectedSafetyItems.length}/{safetyResult.length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">All issues</span>
              <strong className="plan-scope-trade-value">{safetyResult.length}</strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openSafetyModal("Critical Safety Issues", "critical")}>
              {allSelectableSafetyItems.filter(({ id, item }) => item.severity === "critical" && selectedSafetyItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableSafetyItems.filter(({ id, item }) => item.severity === "critical" && selectedSafetyItemIdSet.has(id)).length}/
                  {safetyResult.filter((item) => item.severity === "critical").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Critical</span>
              <strong className="plan-scope-trade-value">
                {safetyResult.filter((item) => item.severity === "critical").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openSafetyModal("High Safety Issues", "high")}>
              {allSelectableSafetyItems.filter(({ id, item }) => item.severity === "high" && selectedSafetyItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableSafetyItems.filter(({ id, item }) => item.severity === "high" && selectedSafetyItemIdSet.has(id)).length}/
                  {safetyResult.filter((item) => item.severity === "high").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">High</span>
              <strong className="plan-scope-trade-value">
                {safetyResult.filter((item) => item.severity === "high").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openSafetyModal("Medium Safety Issues", "medium")}>
              {allSelectableSafetyItems.filter(({ id, item }) => item.severity === "medium" && selectedSafetyItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableSafetyItems.filter(({ id, item }) => item.severity === "medium" && selectedSafetyItemIdSet.has(id)).length}/
                  {safetyResult.filter((item) => item.severity === "medium").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Medium</span>
              <strong className="plan-scope-trade-value">
                {safetyResult.filter((item) => item.severity === "medium").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openSafetyModal("Low Safety Issues", "low")}>
              {allSelectableSafetyItems.filter(({ id, item }) => item.severity === "low" && selectedSafetyItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableSafetyItems.filter(({ id, item }) => item.severity === "low" && selectedSafetyItemIdSet.has(id)).length}/
                  {safetyResult.filter((item) => item.severity === "low").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Low</span>
              <strong className="plan-scope-trade-value">
                {safetyResult.filter((item) => item.severity === "low").length}
              </strong>
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div className="plan-empty-state">
        Safety review results will appear here when that step finishes.
      </div>
    );

  const renderConflictsTab = () =>
    conflictResult ? (
      <div className="plan-scope-summary">
        <div className="plan-analysis-card">
          <div className="plan-analysis-card-heading">
            <div className="plan-analysis-card-heading-copy">
              <span className="plan-summary-label">Conflict detection</span>
              <p className="plan-section-subtitle">
                Cross-sheet coordination issues like trade clashes, mismatched dimensions, and cross-discipline coordination concerns.
              </p>
            </div>
            {selectedConflictItems.length ? (
              <button type="button" className="plan-secondary-action-button" onClick={openFavoriteConflictModal}>
                View Favorites
              </button>
            ) : null}
          </div>
          <div className="plan-scope-grid plan-scope-grid-five">
            <button type="button" className="plan-scope-trade" onClick={() => openConflictModal("All Detected Conflicts")}>
              {selectedConflictItems.length ? (
                <span className="plan-scope-trade-selection-count">
                  {selectedConflictItems.length}/{conflictResult.length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">All conflicts</span>
              <strong className="plan-scope-trade-value">{conflictResult.length}</strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openConflictModal("Critical Conflicts", "critical")}>
              {allSelectableConflictItems.filter(({ id, item }) => item.severity === "critical" && selectedConflictItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableConflictItems.filter(({ id, item }) => item.severity === "critical" && selectedConflictItemIdSet.has(id)).length}/
                  {conflictResult.filter((item) => item.severity === "critical").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Critical</span>
              <strong className="plan-scope-trade-value">
                {conflictResult.filter((item) => item.severity === "critical").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openConflictModal("High Conflicts", "high")}>
              {allSelectableConflictItems.filter(({ id, item }) => item.severity === "high" && selectedConflictItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableConflictItems.filter(({ id, item }) => item.severity === "high" && selectedConflictItemIdSet.has(id)).length}/
                  {conflictResult.filter((item) => item.severity === "high").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">High</span>
              <strong className="plan-scope-trade-value">
                {conflictResult.filter((item) => item.severity === "high").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openConflictModal("Medium Conflicts", "medium")}>
              {allSelectableConflictItems.filter(({ id, item }) => item.severity === "medium" && selectedConflictItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableConflictItems.filter(({ id, item }) => item.severity === "medium" && selectedConflictItemIdSet.has(id)).length}/
                  {conflictResult.filter((item) => item.severity === "medium").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Medium</span>
              <strong className="plan-scope-trade-value">
                {conflictResult.filter((item) => item.severity === "medium").length}
              </strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openConflictModal("Low Conflicts", "low")}>
              {allSelectableConflictItems.filter(({ id, item }) => item.severity === "low" && selectedConflictItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableConflictItems.filter(({ id, item }) => item.severity === "low" && selectedConflictItemIdSet.has(id)).length}/
                  {conflictResult.filter((item) => item.severity === "low").length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Low</span>
              <strong className="plan-scope-trade-value">
                {conflictResult.filter((item) => item.severity === "low").length}
              </strong>
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div className="plan-empty-state">
        Conflict review results will appear here when that step finishes.
      </div>
    );

  const renderRfiTab = () =>
    rfiResult ? (
      <div className="plan-scope-summary">
        <div className="plan-analysis-card">
          <div className="plan-analysis-card-heading">
            <div className="plan-analysis-card-heading-copy">
              <span className="plan-summary-label">RFI package</span>
              <p className="plan-section-subtitle">
                Questions, assumptions, and contingency notes to help price the job without overcommitting.
              </p>
            </div>
            {selectedRfiItems.length ? (
              <button type="button" className="plan-secondary-action-button" onClick={openFavoriteRfiModal}>
                View Favorites
              </button>
            ) : null}
          </div>
          <div className="plan-scope-grid">
            <button type="button" className="plan-scope-trade" onClick={() => openRfiModal("RFIs", "rfis")}>
              {allSelectableRfiItems.filter(({ id, sectionKey }) => sectionKey === "rfis" && selectedRfiItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableRfiItems.filter(({ id, sectionKey }) => sectionKey === "rfis" && selectedRfiItemIdSet.has(id)).length}/
                  {rfiResult.rfis.length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">RFIs</span>
              <strong className="plan-scope-trade-value">{rfiResult.rfis.length}</strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openRfiModal("Assumptions", "assumptions")}>
              {allSelectableRfiItems.filter(({ id, sectionKey }) => sectionKey === "assumptions" && selectedRfiItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableRfiItems.filter(({ id, sectionKey }) => sectionKey === "assumptions" && selectedRfiItemIdSet.has(id)).length}/
                  {rfiResult.assumptions.length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Assumptions</span>
              <strong className="plan-scope-trade-value">{rfiResult.assumptions.length}</strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openRfiModal("Estimator Questions", "estimatorQuestions")}>
              {allSelectableRfiItems.filter(({ id, sectionKey }) => sectionKey === "estimatorQuestions" && selectedRfiItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableRfiItems.filter(({ id, sectionKey }) => sectionKey === "estimatorQuestions" && selectedRfiItemIdSet.has(id)).length}/
                  {rfiResult.estimatorQuestions.length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Estimator Questions</span>
              <strong className="plan-scope-trade-value">{rfiResult.estimatorQuestions.length}</strong>
            </button>
            <button type="button" className="plan-scope-trade" onClick={() => openRfiModal("Contingency Notes", "contingencyNotes")}>
              {allSelectableRfiItems.filter(({ id, sectionKey }) => sectionKey === "contingencyNotes" && selectedRfiItemIdSet.has(id)).length ? (
                <span className="plan-scope-trade-selection-count">
                  {allSelectableRfiItems.filter(({ id, sectionKey }) => sectionKey === "contingencyNotes" && selectedRfiItemIdSet.has(id)).length}/
                  {rfiResult.contingencyNotes.length}
                </span>
              ) : null}
              <span className="plan-scope-trade-label">Contingency Notes</span>
              <strong className="plan-scope-trade-value">{rfiResult.contingencyNotes.length}</strong>
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div className="plan-empty-state">
        The RFI package will appear here when that step finishes.
      </div>
    );

  const renderActiveTab = () => {
    switch (activeTab) {
      case "tradeScopes":
        return renderTradeScopesTab();
      case "verification":
        return renderVerificationTab();
      case "safety":
        return renderSafetyTab();
      case "conflicts":
        return renderConflictsTab();
      case "rfi":
        return renderRfiTab();
      case "overview":
      default:
        return renderOverviewTab();
    }
  };

  if (loading) {
    return (
      <div className="plan-analyzer-page">
        <button className="plan-analyzer-back" onClick={() => navigate("/plan-analyzer")}>
          ← Back
        </button>
        <div className="plan-analyzer-container">
          <div className="plan-empty-state">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
            Loading project processing view...
          </div>
        </div>
      </div>
    );
  }

  if (projectMissing || !project) {
    return (
      <div className="plan-analyzer-page">
        <button className="plan-analyzer-back" onClick={() => navigate("/plan-analyzer")}>
          ← Back
        </button>
        <div className="plan-analyzer-container">
          <div className="plan-empty-state">This plan analysis project could not be found.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-analyzer-page">
      <Dialog open={Boolean(activeModal)} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="plan-detail-modal">
          <DialogHeader>
            <DialogTitle className="plan-detail-title">{activeModal?.title}</DialogTitle>
            <DialogDescription className="plan-detail-description">
              {activeModal?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="plan-detail-list">
            {activeModal?.type === "scope" ? (
              activeModal.items.length ? (
                activeModal.items.map((item, index) => (
                  (() => {
                    const selectionId = buildScopeSelectionId(activeModal.tradeKey, index);
                    return (
                  <div
                    key={`${item.title}-${index}`}
                    className={`plan-detail-card plan-detail-card-selectable${
                      draftFavoriteItemIdSet.has(selectionId)
                        ? " plan-detail-card-selected"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`plan-detail-select-toggle${
                        draftFavoriteItemIdSet.has(selectionId)
                          ? " plan-detail-select-toggle-selected"
                          : ""
                      }`}
                      onClick={() => toggleDraftFavoriteSelection(selectionId)}
                      aria-label={`Select ${cleanDisplayText(item.title)}`}
                      aria-pressed={draftFavoriteItemIdSet.has(selectionId)}
                    >
                      {draftFavoriteItemIdSet.has(selectionId) ? <Check size={15} /> : null}
                    </button>
                    <div className="plan-detail-card-header">
                      <h3 className="plan-detail-card-title">{cleanDisplayText(item.title)}</h3>
                      <span className={`plan-detail-pill plan-detail-pill-${item.classification}`}>
                        {item.classification.replace("_", " ")}
                      </span>
                    </div>
                    <p className="plan-detail-copy">{cleanDisplayText(item.description)}</p>
                    <div className="plan-detail-meta">
                      <div>
                        <span className="plan-detail-label">Materials</span>
                        <p className="plan-detail-value">
                          {item.materialCategories.length ? item.materialCategories.join(", ") : "Not specified"}
                        </p>
                      </div>
                    </div>
                  </div>
                    );
                  })()
                ))
              ) : (
                <div className="plan-detail-empty">No scope items to show.</div>
              )
            ) : activeModal?.type === "scopeFavorites" ? (
              activeModal.items.length ? (
                activeModal.items.map(({ id, tradeKey, tradeLabel, item }, index) => (
                  <div
                    key={`${id}-${index}`}
                    className={`plan-detail-card plan-detail-card-selectable${
                      draftFavoriteItemIdSet.has(id) ? " plan-detail-card-selected" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`plan-detail-select-toggle${
                        draftFavoriteItemIdSet.has(id)
                          ? " plan-detail-select-toggle-selected"
                          : ""
                      }`}
                      onClick={() => toggleDraftFavoriteSelection(id)}
                      aria-label={`Select ${cleanDisplayText(item.title)}`}
                      aria-pressed={draftFavoriteItemIdSet.has(id)}
                    >
                      {draftFavoriteItemIdSet.has(id) ? <Check size={15} /> : null}
                    </button>
                    <div className="plan-detail-card-header">
                      <h3 className="plan-detail-card-title">{cleanDisplayText(item.title)}</h3>
                      <span className={`plan-detail-pill plan-detail-pill-${item.classification}`}>
                        {item.classification.replace("_", " ")}
                      </span>
                    </div>
                    <p className="plan-detail-copy">{cleanDisplayText(item.description)}</p>
                    <div className="plan-detail-meta">
                      <div>
                        <span className="plan-detail-label">Trade</span>
                        <p className="plan-detail-value">{tradeLabel}</p>
                      </div>
                      <div>
                        <span className="plan-detail-label">Materials</span>
                        <p className="plan-detail-value">
                          {item.materialCategories.length ? item.materialCategories.join(", ") : "Not specified"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="plan-detail-empty">No scope favorites to show.</div>
              )
            ) : activeModal?.type === "verification" ? (
              activeModal.items.length ? (
                activeModal.items.map(({ id, item }, index) => (
                  <div
                    key={`${id}-${index}`}
                    className={`plan-detail-card plan-detail-card-selectable${
                      draftFavoriteItemIdSet.has(id) ? " plan-detail-card-selected" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`plan-detail-select-toggle${
                        draftFavoriteItemIdSet.has(id)
                          ? " plan-detail-select-toggle-selected"
                          : ""
                      }`}
                      onClick={() => toggleDraftFavoriteSelection(id)}
                      aria-label={`Select ${cleanDisplayText(item.item)}`}
                      aria-pressed={draftFavoriteItemIdSet.has(id)}
                    >
                      {draftFavoriteItemIdSet.has(id) ? <Check size={15} /> : null}
                    </button>
                    <div className="plan-detail-card-header">
                      <h3 className="plan-detail-card-title">{cleanDisplayText(item.item)}</h3>
                      <span className="plan-detail-pill plan-detail-pill-verification">
                        {item.category.replace("_", " ")}
                      </span>
                    </div>
                    <p className="plan-detail-copy">{cleanDisplayText(item.reason)}</p>
                  </div>
                ))
              ) : (
                <div className="plan-detail-empty">No verification items to show.</div>
              )
            ) : activeModal?.type === "safety" ? (
              activeModal.items.length ? (
                activeModal.items.map(({ id, item }, index) => (
                  <div
                    key={`${id}-${index}`}
                    className={`plan-detail-card plan-detail-card-selectable${
                      draftFavoriteItemIdSet.has(id) ? " plan-detail-card-selected" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`plan-detail-select-toggle${
                        draftFavoriteItemIdSet.has(id)
                          ? " plan-detail-select-toggle-selected"
                          : ""
                      }`}
                      onClick={() => toggleDraftFavoriteSelection(id)}
                      aria-label={`Select ${cleanDisplayText(item.issue)}`}
                      aria-pressed={draftFavoriteItemIdSet.has(id)}
                    >
                      {draftFavoriteItemIdSet.has(id) ? <Check size={15} /> : null}
                    </button>
                    <div className="plan-detail-card-header">
                      <h3 className="plan-detail-card-title">{cleanDisplayText(item.issue)}</h3>
                      <span className={`plan-detail-pill plan-detail-pill-${item.severity}`}>
                        {item.severity}
                      </span>
                    </div>
                    <p className="plan-detail-copy">
                      Requires review before relying on this condition in scope or pricing.
                    </p>
                  </div>
                ))
              ) : (
                <div className="plan-detail-empty">No safety items to show.</div>
              )
            ) : activeModal?.type === "conflict" ? (
              activeModal.items.length ? (
                activeModal.items.map(({ id, item }, index) => (
                  <div
                    key={`${id}-${index}`}
                    className={`plan-detail-card plan-detail-card-selectable${
                      draftFavoriteItemIdSet.has(id) ? " plan-detail-card-selected" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`plan-detail-select-toggle${
                        draftFavoriteItemIdSet.has(id)
                          ? " plan-detail-select-toggle-selected"
                          : ""
                      }`}
                      onClick={() => toggleDraftFavoriteSelection(id)}
                      aria-label={`Select ${cleanDisplayText(item.conflict)}`}
                      aria-pressed={draftFavoriteItemIdSet.has(id)}
                    >
                      {draftFavoriteItemIdSet.has(id) ? <Check size={15} /> : null}
                    </button>
                    <div className="plan-detail-card-header">
                      <h3 className="plan-detail-card-title">{cleanDisplayText(item.conflict)}</h3>
                      <span className={`plan-detail-pill plan-detail-pill-${item.severity}`}>
                        {item.severity}
                      </span>
                    </div>
                    <div className="plan-detail-meta">
                      <div>
                        <span className="plan-detail-label">Involved Trades</span>
                        <p className="plan-detail-value">
                          {item.involvedTrades.length ? item.involvedTrades.join(", ") : "Not specified"}
                        </p>
                      </div>
                      <div>
                        <span className="plan-detail-label">Source Sheets</span>
                        <p className="plan-detail-value">
                          {item.sourceSheets.length ? item.sourceSheets.join(", ") : "Not specified"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="plan-detail-empty">No conflicts to show.</div>
              )
            ) : activeModal?.type === "rfi" ? (
              activeModal.items.length ? (
                activeModal.items.map(({ id, item }, index) => (
                  <div
                    key={`${id}-${index}`}
                    className={`plan-detail-card plan-detail-card-selectable${
                      draftFavoriteItemIdSet.has(id) ? " plan-detail-card-selected" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`plan-detail-select-toggle${
                        draftFavoriteItemIdSet.has(id)
                          ? " plan-detail-select-toggle-selected"
                          : ""
                      }`}
                      onClick={() => toggleDraftFavoriteSelection(id)}
                      aria-label={`Select ${cleanDisplayText(item)}`}
                      aria-pressed={draftFavoriteItemIdSet.has(id)}
                    >
                      {draftFavoriteItemIdSet.has(id) ? <Check size={15} /> : null}
                    </button>
                    <div className="plan-detail-card-header">
                      <h3 className="plan-detail-card-title">{cleanDisplayText(item)}</h3>
                      <span className={`plan-detail-pill ${activeModal.badgeClassName}`}>
                        {activeModal.badgeLabel}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="plan-detail-empty">No items to show.</div>
              )
            ) : null}
          </div>

          {shouldShowSaveFavorites ? (
            <div className="plan-detail-actions">
              <button
                type="button"
                className="plan-add-to-bid-button"
                onClick={() => {
                  void handleSaveFavoriteSelections();
                }}
                disabled={isSavingFavorites}
              >
                {isSavingFavorites ? "Saving..." : "Save Favorites"}
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <button className="plan-analyzer-back" onClick={() => navigate("/plan-analyzer")}>
        ← Back
      </button>

      <main className="plan-analyzer-shell">
        <header className="plan-analyzer-header">
          <div className="plan-analyzer-header-main">
            <p className="plan-analyzer-kicker">Plan Analyzer Project</p>
            <h1 className="plan-analyzer-title">{getProjectTitle(project)}</h1>
            <p className="plan-analyzer-created-at">
              Created: {formatProjectCreatedAt(project)}
            </p>
          </div>

          {shouldRenderProgressPanel ? (
            <div className={`plan-analyzer-progress-row${progressPanelFading ? " plan-analyzer-progress-row-fade" : ""}`}>
              <div className="plan-analyzer-status">
                <span className="plan-summary-label">Status</span>
                <strong className="plan-summary-value">{getStatusValue(project)}</strong>
              </div>

              <div className="plan-progress-panel plan-progress-panel-header">
                <div className="plan-progress-heading">
                  <div>
                    <div className="plan-progress-status-row">
                      <p className="plan-progress-label">Processing Progress</p>
                      <span className="plan-progress-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                    <p className="plan-progress-copy">{getProcessingCopy(activeStep, project)}</p>
                  </div>
                  <span className="plan-progress-value">{Math.round(visibleProgress)}%</span>
                </div>

                <Progress
                  value={visibleProgress}
                  className="plan-progress-bar plan-progress-bar-animated plan-progress-bar-solid-track"
                />
              </div>
            </div>
          ) : null}

          <nav className="plan-analyzer-tabs" aria-label="Plan analyzer sections">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`plan-analyzer-tab${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        <section className="plan-analyzer-body">
          <div
            className={`plan-analyzer-tab-panel${
              activeTab === "overview"
                ? " plan-results-panel"
                : " plan-analyzer-tab-panel-plain"
            }`}
          >
            {renderActiveTab()}
          </div>
        </section>
      </main>
    </div>
  );
}
