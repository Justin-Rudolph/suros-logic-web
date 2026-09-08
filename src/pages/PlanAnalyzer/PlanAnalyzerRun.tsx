import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { firestore } from "@/lib/firebase";
import { canEditRecord, getEffectiveCompanyProfile } from "@/lib/account";
import { getFunctionsBaseUrl } from "@/lib/functionsApi";
import { ConflictItem, PlanConflictsModuleRecord } from "@/models/PlanAnalyzerConflicts";
import { PlanAnalysisResult, PlanOverviewModuleRecord } from "@/models/PlanAnalyzerOverview";
import { PlanRfiModuleRecord, RfiPackage } from "@/models/PlanAnalyzerRfi";
import { PlanSafetyModuleRecord, SafetyItem } from "@/models/PlanAnalyzerSafety";
import { ScopeItem, ScopeResult, PlanScopesModuleRecord } from "@/models/PlanAnalyzerScopes";
import { PlanModuleStatus, PlanModuleType } from "@/models/PlanAnalyzerShared";
import { PlanVerificationModuleRecord, VerificationItem } from "@/models/PlanAnalyzerVerification";
import { PlanProjectRecord } from "@/models/PlanProjects";

import PlanLedger, { LedgerColumn, LedgerGroup, LedgerTone } from "./PlanLedger";
import "./PlanAnalyzer.css";

type FirestoreTimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};


type PlanProjectDoc = PlanProjectRecord;

const NO_EDIT_TITLE =
  "Only the creator or an account owner/full-access teammate can change this analysis.";

/**
 * Every results tab writes its favorites into one module document. The field
 * name doubles as the Firestore doc id under planProjects/{id}/modules.
 */
type FavoriteField = "scopes" | "verification" | "safety" | "conflicts" | "rfi";

const FAVORITE_SAVE_ERROR_TITLES: Record<FavoriteField, string> = {
  scopes: "Unable to save scope favorites",
  verification: "Unable to save verification favorites",
  safety: "Unable to save safety favorites",
  conflicts: "Unable to save conflict favorites",
  rfi: "Unable to save RFI favorites",
};

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

const VERIFICATION_CATEGORY_LABELS: Record<VerificationItem["category"], string> = {
  dimensions: "Dimensions",
  structure: "Structure",
  MEP_conflict: "MEP conflicts",
  access: "Access",
  existing_conditions: "Existing conditions",
};

const SEVERITY_ORDER: Array<SafetyItem["severity"]> = [
  "critical",
  "high",
  "medium",
  "low",
];

const SEVERITY_LABELS: Record<SafetyItem["severity"], string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const RFI_SECTIONS: Array<{ key: keyof RfiPackage; label: string }> = [
  { key: "rfis", label: "RFIs" },
  { key: "assumptions", label: "Assumptions" },
  { key: "estimatorQuestions", label: "Estimator questions" },
  { key: "contingencyNotes", label: "Contingency notes" },
];

const RFI_SECTION_TONES: Record<keyof RfiPackage, LedgerTone> = {
  rfis: "clarify",
  assumptions: "inferred",
  estimatorQuestions: "clarify",
  contingencyNotes: "risk",
};

const buildScopeSelectionId = (tradeKey: string, index: number) => `${tradeKey}::${index}`;
const buildVerificationSelectionId = (index: number) => `verification::${index}`;
const buildSafetySelectionId = (index: number) => `safety::${index}`;
const buildConflictSelectionId = (index: number) => `conflict::${index}`;
const buildRfiSelectionId = (sectionKey: keyof RfiPackage, index: number) => `${sectionKey}::${index}`;
const PLAN_ANALYSIS_SUPPORT_MESSAGE =
  "This analysis failed. Please contact an admin at support@suroslogic.com.";

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

/** What each RFI section is, said in the vocabulary the scope tags already use. */
const RFI_SECTION_TAGS: Record<keyof RfiPackage, string> = {
  rfis: "Needs clarification",
  assumptions: "Inferred",
  estimatorQuestions: "Needs clarification",
  contingencyNotes: "Risk / assumption",
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

const getPlanModuleSummaryDocPath = (projectId: string, moduleType: PlanModuleType) =>
  `planProjects/${projectId}/modules/${moduleType}`;

const isProjectFailed = (project: PlanProjectDoc | null) =>
  project?.status === "failed" ||
  getOverviewStatus(project) === "failed" ||
  getModuleStatus(project, "scopes") === "failed" ||
  getModuleStatus(project, "verification") === "failed" ||
  getModuleStatus(project, "safety") === "failed" ||
  getModuleStatus(project, "conflicts") === "failed" ||
  getModuleStatus(project, "rfi") === "failed";

const getProcessingCopy = (project: PlanProjectDoc | null) => {
  if (getOverviewStatus(project) === "processing") {
    return "Upload complete. Running plan analysis...";
  }
  if (getModuleStatus(project, "scopes") === "processing") {
    return "Analysis complete. Generating trade scopes...";
  }
  if (getModuleStatus(project, "verification") === "processing") {
    return "Scopes complete. Generating verification checklist...";
  }
  if (getModuleStatus(project, "safety") === "processing") {
    return "Verification complete. Running safety review...";
  }
  if (getModuleStatus(project, "conflicts") === "processing") {
    return "Safety review complete. Detecting cross-sheet conflicts...";
  }
  if (getModuleStatus(project, "rfi") === "processing") {
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
  if (getOverviewStatus(project) === "processing") return "Analyzing Overview";
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
  const { profile, user } = useAuth();

  const [project, setProject] = useState<PlanProjectDoc | null>(null);
  // Mirrors canWriteAccountDoc in firestore.rules: owners and full-access
  // members can edit anything; view_all_edit_own members only their own
  // projects. Reading and downloading stay open to anyone who can see it.
  const canEditThisProject = canEditRecord(profile, project);
  const hasActiveSubscription = profile?.isSubscribed === true;
  // Both gates must pass. Subscription is checked here because "Add to New
  // Bid" navigates into the bid form, which has no paywall of its own — so
  // leaving these enabled while inactive is a way around the subscription.
  const canModifyAnalysis = hasActiveSubscription && canEditThisProject;
  const modifyBlockedReason = !hasActiveSubscription
    ? "Your subscription is inactive. Reactivate it to save favorites or start a bid."
    : !canEditThisProject
      ? NO_EDIT_TITLE
      : undefined;
  const [overviewModule, setOverviewModule] = useState<PlanOverviewModuleRecord | null>(null);
  const [scopesModule, setScopesModule] = useState<PlanScopesModuleRecord | null>(null);
  const [verificationModule, setVerificationModule] = useState<PlanVerificationModuleRecord | null>(null);
  const [safetyModule, setSafetyModule] = useState<PlanSafetyModuleRecord | null>(null);
  const [conflictsModule, setConflictsModule] = useState<PlanConflictsModuleRecord | null>(null);
  const [rfiModule, setRfiModule] = useState<PlanRfiModuleRecord | null>(null);
  const [projectMissing, setProjectMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [showProgressPanel, setShowProgressPanel] = useState(true);
  const [progressPanelFading, setProgressPanelFading] = useState(false);
  const [activeTab, setActiveTab] = useState<PlanAnalyzerTabId>("overview");
  const [isPreparingBidPrefill, setIsPreparingBidPrefill] = useState(false);
  // Unsaved marks, kept per module so switching tabs never silently discards
  // work in another one. A missing entry means "identical to what's saved".
  const [favoriteDrafts, setFavoriteDrafts] = useState<Partial<Record<FavoriteField, string[]>>>({});
  const [savingFavoriteField, setSavingFavoriteField] = useState<FavoriteField | null>(null);
  const [favoritesOnlyFields, setFavoritesOnlyFields] = useState<FavoriteField[]>([]);
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

  const savedFavoriteIdsByField: Record<FavoriteField, string[]> = {
    scopes: selectedScopeItemIds,
    verification: selectedVerificationItemIds,
    safety: selectedSafetyItemIds,
    conflicts: selectedConflictItemIds,
    rfi: selectedRfiItemIds,
  };

  // Marks a tab is showing right now: the unsaved draft when there is one,
  // otherwise whatever Firestore last handed back.
  const getMarkedFavoriteIds = (field: FavoriteField) =>
    favoriteDrafts[field] ?? savedFavoriteIdsByField[field];

  const isFavoriteDraftDirty = (field: FavoriteField) =>
    !haveSameIds(getMarkedFavoriteIds(field), savedFavoriteIdsByField[field]);

  const clearFavoriteDraft = (
    drafts: Partial<Record<FavoriteField, string[]>>,
    field: FavoriteField
  ) => {
    const next = { ...drafts };
    delete next[field];
    return next;
  };

  const toggleFavoriteMark = (field: FavoriteField, itemId: string) => {
    if (!canModifyAnalysis) return;
    setFavoriteDrafts((current) => {
      const base = current[field] ?? savedFavoriteIdsByField[field];
      const next = base.includes(itemId)
        ? base.filter((id) => id !== itemId)
        : [...base, itemId];

      // Toggling back to what is already saved leaves nothing to save. Drop the
      // draft rather than keeping an identical copy, or it would go on shadowing
      // favorites another session saves after this point.
      return haveSameIds(next, savedFavoriteIdsByField[field])
        ? clearFavoriteDraft(current, field)
        : { ...current, [field]: next };
    });
  };

  const discardFavoriteDraft = (field: FavoriteField) => {
    setFavoriteDrafts((current) => clearFavoriteDraft(current, field));
  };

  const toggleFavoritesOnly = (field: FavoriteField) => {
    setFavoritesOnlyFields((current) =>
      current.includes(field) ? current.filter((entry) => entry !== field) : [...current, field]
    );
  };

  const saveFavoriteMarks = async (field: FavoriteField) => {
    if (!canModifyAnalysis || !projectId) return;

    const nextIds = getMarkedFavoriteIds(field);
    setSavingFavoriteField(field);

    try {
      await updateDoc(doc(firestore, "planProjects", projectId, "modules", field), {
        favoriteItemIds: nextIds,
      });

      // Rows stay markable during the write, so only retire the draft when it
      // still matches what was sent. Anything marked meanwhile stays unsaved
      // instead of being reverted underneath the user.
      setFavoriteDrafts((current) =>
        current[field] && !haveSameIds(current[field], nextIds)
          ? current
          : clearFavoriteDraft(current, field)
      );
    } catch (error) {
      console.error(`Failed to save ${field} favorites:`, error);
      toast({
        title: FAVORITE_SAVE_ERROR_TITLES[field],
        description: "Your favorites could not be saved right now.",
        variant: "destructive",
      });
    } finally {
      setSavingFavoriteField(null);
    }
  };

  const hasFailed = isProjectFailed(project);
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
    !hasFailed && showProgressPanel && (!isFullyAnalyzed || hasSeenIncompleteProgressRef.current);
  const shouldRenderStatusRow = shouldRenderProgressPanel || hasFailed;
  const isActivelyProcessing =
    !hasFailed &&
    !isFullyAnalyzed &&
    Boolean(
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

    if (hasFailed) {
      setShowProgressPanel(false);
      setProgressPanelFading(false);
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
            const minIncrement = 0.054;
            const proportionalIncrement = 0.01;
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
  }, [hasFailed, project, progressMetrics, isActivelyProcessing, isFullyAnalyzed]);

  useEffect(() => {
    if (hasFailed) {
      setShowProgressPanel(false);
      setProgressPanelFading(false);
      return;
    }

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
  }, [displayedProgress, hasFailed, isFullyAnalyzed]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, visibleTabs]);

  const handleAddSelectedScopesToNewBid = async () => {
    if (!canModifyAnalysis) return;
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

      // BidForm skips its own branding lookup in prefill mode, so the snapshot
      // has to carry the resolved values. Member seats hold no branding of
      // their own — it lives on the owner's profile — so read it through the
      // shared resolver rather than off `profile`. Awaited here instead of via
      // useEffectiveCompanyProfile so the click can't race the lookup.
      const branding = await getEffectiveCompanyProfile(profile);

      const today = new Date().toISOString().slice(0, 10);
      const prefillBid: BidFormPrefillState = {
        formSnapshot: {
          company_name: branding.companyName,
          company_address: branding.companyAddress,
          // Phone and email stay the member's own contact details, matching
          // how BidForm populates them for a non-prefill bid.
          company_phone: profile?.phone ?? "",
          company_email: profile?.email ?? "",
          company_slogan: branding.slogan,
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
          <p className="plan-analysis-copy">{PLAN_ANALYSIS_SUPPORT_MESSAGE}</p>
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

  /**
   * Shared chrome for the five results tables: the heading, the run of counts,
   * the favorites filter, whatever tab-specific action belongs up top, the
   * table itself, and the save bar that appears once marks go out of sync.
   */
  const renderLedgerSection = (options: {
    field: FavoriteField;
    title: string;
    subtitle: string;
    columns: LedgerColumn[];
    groups: LedgerGroup[];
    groupNoun: string;
    filteredEmptyMessage: string;
    actions?: ReactNode;
  }) => {
    const { field, title, subtitle, columns, groups, groupNoun, filteredEmptyMessage, actions } =
      options;

    const markedIds = getMarkedFavoriteIds(field);
    const markedIdSet = new Set(markedIds);
    const totalRows = groups.reduce((count, group) => count + group.rows.length, 0);
    const filledGroups = groups.filter((group) => group.rows.length > 0).length;
    const favoritesOnly = favoritesOnlyFields.includes(field);
    const isDirty = isFavoriteDraftDirty(field);
    const isSaving = savingFavoriteField === field;

    return (
      <div className="plan-ledger-section">
        <div className="plan-ledger-toolbar">
          <div className="plan-ledger-toolbar-copy">
            <h2 className="plan-ledger-title">{title}</h2>
            <p className="plan-ledger-subtitle">{subtitle}</p>
            <p className="plan-ledger-metrics">
              <span>{totalRows} items</span>
              <span>
                {filledGroups} {groupNoun}
              </span>
              <span className={markedIdSet.size ? "is-marked" : undefined}>
                {markedIdSet.size} {markedIdSet.size === 1 ? "favorite" : "favorites"}
              </span>
            </p>
          </div>

          <div className="plan-ledger-toolbar-actions">
            <button
              type="button"
              className={`plan-ledger-filter${favoritesOnly ? " is-on" : ""}`}
              onClick={() => toggleFavoritesOnly(field)}
              aria-pressed={favoritesOnly}
              disabled={!markedIdSet.size && !favoritesOnly}
            >
              <span className="plan-ledger-filter-dot" aria-hidden="true" />
              Favorites only
            </button>
            {actions}
          </div>
        </div>

        {/* Keyed by module so collapsed-group state never carries across tabs —
            Safety and Conflicts share group keys. */}
        <PlanLedger
          key={field}
          columns={columns}
          groups={groups}
          markedIds={markedIdSet}
          onToggleMark={(itemId) => toggleFavoriteMark(field, itemId)}
          canMark={canModifyAnalysis}
          blockedReason={modifyBlockedReason}
          favoritesOnly={favoritesOnly}
          filteredEmptyMessage={filteredEmptyMessage}
        />

        {isDirty ? (
          <div className="plan-ledger-savebar">
            <span className="plan-ledger-savebar-copy">
              {markedIdSet.size} {markedIdSet.size === 1 ? "favorite" : "favorites"}, not saved yet
            </span>
            <div className="plan-ledger-savebar-actions">
              <button
                type="button"
                className="plan-ledger-ghost-button"
                onClick={() => discardFavoriteDraft(field)}
                disabled={isSaving}
              >
                Discard
              </button>
              <button
                type="button"
                className={`plan-add-to-bid-button${
                  canModifyAnalysis ? "" : " is-permission-disabled"
                }`}
                onClick={() => {
                  void saveFavoriteMarks(field);
                }}
                disabled={isSaving || !canModifyAnalysis}
                title={modifyBlockedReason}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderPrimaryCell = (title: string, copy?: string) => (
    <div className="plan-ledger-primary">
      <span className="plan-ledger-primary-title">{title}</span>
      {copy ? <span className="plan-ledger-primary-copy">{copy}</span> : null}
    </div>
  );

  const renderListCell = (values: string[]) =>
    values.length ? (
      <span className="plan-ledger-list">
        {values.map((value, index) => (
          <span key={`${value}-${index}`} className="plan-ledger-chip">
            {value}
          </span>
        ))}
      </span>
    ) : (
      <span className="plan-ledger-blank">Not specified</span>
    );

  const renderTradeScopesTab = () =>
    scopeResult ? (
      renderLedgerSection({
        field: "scopes",
        title: "Trade scopes",
        subtitle:
          "Bid-ready scope items grouped by trade. Favorite the ones you want, then send them to a new bid.",
        groupNoun: "trades",
        filteredEmptyMessage: "No scope items are favorites yet.",
        columns: [
          { key: "item", label: "Scope item", width: "minmax(0, 2.2fr)" },
          { key: "class", label: "Class", width: "minmax(0, 148px)" },
          { key: "materials", label: "Materials", width: "minmax(0, 1.1fr)" },
        ],
        groups: SCOPE_TRADE_LABELS.map(({ key, label }) => ({
          key,
          label,
          rows: (Array.isArray(scopeResult[key]) ? scopeResult[key] : []).map((item, index) => ({
            id: buildScopeSelectionId(key, index),
            label: cleanDisplayText(item.title),
            cells: [
              renderPrimaryCell(cleanDisplayText(item.title), cleanDisplayText(item.description)),
              <span className={`plan-ledger-tag plan-ledger-tag-${item.classification}`}>
                {item.classification.replace("_", " ")}
              </span>,
              renderListCell(item.materialCategories),
            ],
          })),
        })),
        actions: selectedScopeItems.length ? (
          <button
            type="button"
            className={`plan-add-to-bid-button${
              canModifyAnalysis ? "" : " is-permission-disabled"
            }`}
            onClick={() => {
              void handleAddSelectedScopesToNewBid();
            }}
            disabled={isPreparingBidPrefill || !canModifyAnalysis}
            title={modifyBlockedReason}
          >
            {isPreparingBidPrefill
              ? "Preparing bid..."
              : `Add ${selectedScopeItems.length} to new bid`}
          </button>
        ) : null,
      })
    ) : (
      <div className="plan-empty-state">
        Trade scopes will appear here after scope generation completes.
      </div>
    );

  const renderVerificationTab = () =>
    verificationResult ? (
      renderLedgerSection({
        field: "verification",
        title: "Verification checklist",
        subtitle:
          "Field checks and plan follow-ups that confirm dimensions, structure, access, and existing conditions.",
        groupNoun: "categories",
        filteredEmptyMessage: "No checklist items are favorites yet.",
        columns: [
          { key: "check", label: "Check", width: "minmax(0, 1.5fr)" },
          { key: "reason", label: "Why it matters", width: "minmax(0, 1.5fr)" },
        ],
        groups: VERIFICATION_CATEGORY_ORDER.map((category) => ({
          key: category,
          label: VERIFICATION_CATEGORY_LABELS[category],
          rows: allSelectableVerificationItems
            .filter(({ item }) => item.category === category)
            .sort((left, right) => compareVerificationItems(left.item, right.item))
            .map(({ id, item }) => ({
              id,
              label: cleanDisplayText(item.item),
              cells: [
                renderPrimaryCell(cleanDisplayText(item.item)),
                <span className="plan-ledger-muted">{cleanDisplayText(item.reason)}</span>,
              ],
            })),
        })),
      })
    ) : (
      <div className="plan-empty-state">
        Verification checklist items will appear here when that review finishes.
      </div>
    );

  const renderSafetyTab = () =>
    safetyResult ? (
      renderLedgerSection({
        field: "safety",
        title: "Safety review",
        subtitle:
          "Life-safety, access, egress, clearance, and code-sensitive items, ranked by severity. Every item needs review before you price it.",
        groupNoun: "severity levels",
        filteredEmptyMessage: "No safety items are favorites yet.",
        columns: [{ key: "issue", label: "Issue", width: "minmax(0, 1fr)" }],
        groups: SEVERITY_ORDER.map((severity) => ({
          key: severity,
          label: SEVERITY_LABELS[severity],
          tone: severity as LedgerTone,
          rows: allSelectableSafetyItems
            .filter(({ item }) => item.severity === severity)
            .sort((left, right) => compareSafetyItems(left.item, right.item))
            .map(({ id, item }) => ({
              id,
              label: cleanDisplayText(item.issue),
              cells: [renderPrimaryCell(cleanDisplayText(item.issue))],
            })),
        })),
      })
    ) : (
      <div className="plan-empty-state">
        Safety review results will appear here when that step finishes.
      </div>
    );

  const renderConflictsTab = () =>
    conflictResult ? (
      renderLedgerSection({
        field: "conflicts",
        title: "Conflicts",
        subtitle:
          "Cross-sheet coordination issues: trade clashes, mismatched dimensions, and discipline-to-discipline gaps.",
        groupNoun: "severity levels",
        filteredEmptyMessage: "No conflicts are favorites yet.",
        columns: [
          { key: "conflict", label: "Conflict", width: "minmax(0, 2fr)" },
          { key: "trades", label: "Involved trades", width: "minmax(0, 1fr)" },
          { key: "sheets", label: "Source sheets", width: "minmax(0, 0.9fr)" },
        ],
        groups: SEVERITY_ORDER.map((severity) => ({
          key: severity,
          label: SEVERITY_LABELS[severity],
          tone: severity as LedgerTone,
          rows: allSelectableConflictItems
            .filter(({ item }) => item.severity === severity)
            .sort((left, right) => compareConflictItems(left.item, right.item))
            .map(({ id, item }) => ({
              id,
              label: cleanDisplayText(item.conflict),
              cells: [
                renderPrimaryCell(cleanDisplayText(item.conflict)),
                renderListCell(item.involvedTrades),
                renderListCell(item.sourceSheets),
              ],
            })),
        })),
      })
    ) : (
      <div className="plan-empty-state">
        Conflict review results will appear here when that step finishes.
      </div>
    );

  const renderRfiTab = () =>
    rfiResult ? (
      renderLedgerSection({
        field: "rfi",
        title: "RFI package",
        subtitle:
          "Questions, assumptions, and contingency notes that let you price the job without overcommitting.",
        groupNoun: "sections",
        filteredEmptyMessage: "No RFI items are favorites yet.",
        columns: [{ key: "item", label: "Item", width: "minmax(0, 1fr)" }],
        groups: RFI_SECTIONS.map(({ key, label }) => {
          return {
            key,
            label,
            tone: RFI_SECTION_TONES[key],
            tag: RFI_SECTION_TAGS[key],
            rows: allSelectableRfiItems
              .filter(({ sectionKey }) => sectionKey === key)
              .map(({ id, item }) => ({
                id,
                label: cleanDisplayText(item),
                cells: [renderPrimaryCell(cleanDisplayText(item))],
              })),
          };
        }),
      })
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

          {shouldRenderStatusRow ? (
            <div
              className={`plan-analyzer-progress-row${progressPanelFading ? " plan-analyzer-progress-row-fade" : ""}${
                hasFailed ? " plan-analyzer-progress-row-status-only" : ""
              }`}
            >
              <div className="plan-analyzer-status">
                <span className="plan-summary-label">Status</span>
                <strong className="plan-summary-value">{getStatusValue(project)}</strong>
              </div>

              {shouldRenderProgressPanel ? (
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
                      <p className="plan-progress-copy">{getProcessingCopy(project)}</p>
                    </div>
                    <span className="plan-progress-value">{Math.round(visibleProgress)}%</span>
                  </div>

                  <Progress
                    value={visibleProgress}
                    className="plan-progress-bar plan-progress-bar-animated plan-progress-bar-solid-track"
                  />
                </div>
              ) : null}
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
