const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const DEFAULT_PLAN_ANALYSIS_MONTHLY_LIMIT = 3;
const PLAN_ANALYSIS_TIME_ZONE = "America/New_York";

const getCurrentPlanAnalysisPeriodKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLAN_ANALYSIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || String(date.getUTCFullYear());
  const month =
    parts.find((part) => part.type === "month")?.value ||
    String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const normalizePlanAnalyzerUsage = (profile = {}, periodKey = getCurrentPlanAnalysisPeriodKey()) => {
  const usage = profile.planAnalyzerUsage || {};
  const monthlyLimit = Number.isFinite(Number(usage.monthlyLimit))
    ? Math.max(Number(usage.monthlyLimit), 0)
    : DEFAULT_PLAN_ANALYSIS_MONTHLY_LIMIT;

  if (usage.periodKey !== periodKey) {
    return {
      monthlyLimit,
      used: 0,
      reserved: 0,
      periodKey,
    };
  }

  return {
    monthlyLimit,
    used: Math.max(Number(usage.used) || 0, 0),
    reserved: Math.max(Number(usage.reserved) || 0, 0),
    periodKey,
  };
};

const getPlanAnalyzerRemaining = (usage) =>
  Math.max((Number(usage.monthlyLimit) || 0) - (Number(usage.used) || 0) - (Number(usage.reserved) || 0), 0);

const createPlanAnalysisStateError = (message, options = {}) => {
  const error = new Error(message);
  error.statusCode = 409;
  error.shouldReleasePlanAnalysisReservation = options.shouldReleasePlanAnalysisReservation === true;
  return error;
};

const assertPlanAnalysisCanProcess = (projectData = {}) => {
  if (projectData.quota?.failed === true || projectData.status === "failed") {
    throw createPlanAnalysisStateError("This plan analysis has already failed.", {
      shouldReleasePlanAnalysisReservation:
        projectData.quota?.reserved === true && projectData.quota?.completed !== true,
    });
  }

  if (projectData.quota?.completed === true || projectData.status === "completed") {
    throw createPlanAnalysisStateError("This plan analysis has already completed.");
  }
};

const shouldSkipPlanAnalysisFailureMutation = (error) =>
  error?.statusCode === 401 || error?.statusCode === 403 || error?.statusCode === 409;

const shouldReleasePlanAnalysisReservationAfterError = (error) =>
  error?.shouldReleasePlanAnalysisReservation === true ||
  !shouldSkipPlanAnalysisFailureMutation(error);

const verifyAuthenticatedUser = async (req) => {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    const error = new Error("Authentication is required.");
    error.statusCode = 401;
    throw error;
  }

  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (error) {
    const authError = new Error("Authentication is invalid or expired.");
    authError.statusCode = 401;
    throw authError;
  }
};

const verifyPlanProjectOwner = async (firestore, req, projectId) => {
  const decodedToken = await verifyAuthenticatedUser(req);
  const projectRef = firestore.doc(`planProjects/${projectId}`);
  const projectSnap = await projectRef.get();

  if (!projectSnap.exists) {
    const error = new Error("Plan analysis project was not found.");
    error.statusCode = 404;
    throw error;
  }

  const projectData = projectSnap.data() || {};
  if (projectData.userId !== decodedToken.uid) {
    const error = new Error("You do not have access to this plan analysis.");
    error.statusCode = 403;
    throw error;
  }

  return {
    decodedToken,
    projectData,
    projectRef,
    projectSnap,
  };
};

const markPlanAnalysisCompleted = async (firestore, projectId) => {
  const projectRef = firestore.doc(`planProjects/${projectId}`);

  await firestore.runTransaction(async (transaction) => {
    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists) return;

    const projectData = projectSnap.data() || {};
    if (
      projectData.quota?.reserved !== true ||
      projectData.quota?.completed === true ||
      projectData.quota?.failed === true
    ) {
      return;
    }

    const userId = projectData.userId;
    if (!userId) return;

    const userRef = firestore.doc(`users/${userId}`);
    const userSnap = await transaction.get(userRef);
    const userData = userSnap.data() || {};
    const projectPeriodKey = projectData.quota?.periodKey || getCurrentPlanAnalysisPeriodKey();
    const usagePeriodKey = userData.planAnalyzerUsage?.periodKey;

    if (usagePeriodKey === projectPeriodKey) {
      const usage = normalizePlanAnalyzerUsage(userData, projectPeriodKey);
      const nextReserved = Math.max(usage.reserved - 1, 0);

      transaction.set(
        userRef,
        {
          planAnalyzerUsage: {
            ...usage,
            reserved: nextReserved,
            used: usage.used + 1,
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    }

    transaction.set(
      projectRef,
      {
        quota: {
          ...(projectData.quota || {}),
          completed: true,
          failed: false,
          reserved: false,
          charged: true,
          completedAt: FieldValue.serverTimestamp(),
          periodKey: projectPeriodKey,
        },
      },
      { merge: true }
    );
  });
};

const markPlanAnalysisFailed = async (firestore, projectId) => {
  const projectRef = firestore.doc(`planProjects/${projectId}`);

  await firestore.runTransaction(async (transaction) => {
    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists) return;

    const projectData = projectSnap.data() || {};
    if (
      projectData.quota?.reserved !== true ||
      projectData.quota?.completed === true
    ) {
      return;
    }

    const userId = projectData.userId;
    if (!userId) return;

    const userRef = firestore.doc(`users/${userId}`);
    const userSnap = await transaction.get(userRef);
    const userData = userSnap.data() || {};
    const projectPeriodKey = projectData.quota?.periodKey || getCurrentPlanAnalysisPeriodKey();
    const usagePeriodKey = userData.planAnalyzerUsage?.periodKey;

    if (usagePeriodKey === projectPeriodKey) {
      const usage = normalizePlanAnalyzerUsage(userData, projectPeriodKey);
      const nextReserved = Math.max(usage.reserved - 1, 0);

      transaction.set(
        userRef,
        {
          planAnalyzerUsage: {
            ...usage,
            reserved: nextReserved,
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    }

    transaction.set(
      projectRef,
      {
        quota: {
          ...(projectData.quota || {}),
          completed: false,
          failed: true,
          reserved: false,
          charged: false,
          failedAt: FieldValue.serverTimestamp(),
          periodKey: projectPeriodKey,
        },
      },
      { merge: true }
    );
  });
};

module.exports = {
  DEFAULT_PLAN_ANALYSIS_MONTHLY_LIMIT,
  assertPlanAnalysisCanProcess,
  getCurrentPlanAnalysisPeriodKey,
  getPlanAnalyzerRemaining,
  markPlanAnalysisCompleted,
  markPlanAnalysisFailed,
  normalizePlanAnalyzerUsage,
  shouldReleasePlanAnalysisReservationAfterError,
  shouldSkipPlanAnalysisFailureMutation,
  verifyAuthenticatedUser,
  verifyPlanProjectOwner,
};
