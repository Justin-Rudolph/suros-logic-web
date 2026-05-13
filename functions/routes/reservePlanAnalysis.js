const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const {
  getPlanAnalyzerRemaining,
  normalizePlanAnalyzerUsage,
  verifyAuthenticatedUser,
} = require("./lib/planAnalyzerQuota");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

module.exports = async function reservePlanAnalysisHandler(req, res) {
  try {
    const decodedToken = await verifyAuthenticatedUser(req);
    const userRef = firestore.doc(`users/${decodedToken.uid}`);
    const projectRef = firestore.collection("planProjects").doc();

    const result = await firestore.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) {
        const error = new Error("User profile was not found.");
        error.statusCode = 404;
        throw error;
      }

      const profile = userSnap.data() || {};
      if (profile.isSubscribed !== true) {
        const error = new Error("An active subscription is required to upload plan files.");
        error.statusCode = 403;
        throw error;
      }

      const usage = normalizePlanAnalyzerUsage(profile);
      const remaining = getPlanAnalyzerRemaining(usage);

      if (remaining <= 0) {
        const error = new Error("You have used all 3 plan analyses for this month.");
        error.statusCode = 429;
        error.usage = usage;
        throw error;
      }

      const nextUsage = {
        ...usage,
        reserved: usage.reserved + 1,
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.set(
        userRef,
        {
          planAnalyzerUsage: nextUsage,
        },
        { merge: true }
      );

      transaction.set(projectRef, {
        userId: decodedToken.uid,
        projectId: projectRef.id,
        status: "reserved_upload",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        quota: {
          periodKey: usage.periodKey,
          reserved: true,
          charged: false,
          completed: false,
          failed: false,
          reservedAt: FieldValue.serverTimestamp(),
        },
      });

      return {
        projectId: projectRef.id,
        usage: nextUsage,
      };
    });

    return res.json({
      projectId: result.projectId,
      planAnalyzerUsage: {
        monthlyLimit: result.usage.monthlyLimit,
        used: result.usage.used,
        reserved: result.usage.reserved,
        remaining: getPlanAnalyzerRemaining(result.usage),
        periodKey: result.usage.periodKey,
      },
    });
  } catch (error) {
    console.error("Failed to reserve plan analysis:", error);

    return res.status(error.statusCode || 500).json({
      error: error instanceof Error ? error.message : "Failed to reserve plan analysis.",
      planAnalyzerUsage: error.usage
        ? {
            monthlyLimit: error.usage.monthlyLimit,
            used: error.usage.used,
            reserved: error.usage.reserved,
            remaining: getPlanAnalyzerRemaining(error.usage),
            periodKey: error.usage.periodKey,
          }
        : undefined,
    });
  }
};
