const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");

const {
  getStripe,
  getChildSeatPriceId,
  sendSeatInviteEmail,
  verifyFirebaseUser,
} = require("./stripe");
const { getPlanAnalyzerMonthlyLimit } = require("./lib/planAnalyzerQuota");
const { createSeatManager } = require("./lib/seatManager");

/* 🔥 FIX: prevent double initialization */
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

/* ---------------------------------------------------------
   BUILD SEAT MANAGER WITH REAL DEPENDENCIES
--------------------------------------------------------- */

const buildSeatManager = () =>
  createSeatManager({
    db,
    stripe: getStripe(),
    authAdmin: admin.auth(),
    getChildSeatPriceId,
    getPlanAnalyzerMonthlyLimit,
    sendSeatInviteEmail,
    now: () => Timestamp.now(),
  });

const handleError = (res, err, label) => {
  // Only messages we wrote are safe to show. Stripe and Firebase errors carry
  // their own statusCode and would otherwise be echoed verbatim — e.g. a
  // cancelled subscription surfacing as "Customer cus_... does not have a
  // subscription with ID sub_...", which leaks internal ids and means nothing
  // to the account owner.
  if (err?.isSeatError) {
    return res.status(err.statusCode || 500).json({
      error: err.message,
      // The trial seat cap is a paywall — the client turns this into an
      // upgrade prompt instead of a plain error line.
      ...(err.upgradeRequired ? { upgradeRequired: true } : {}),
    });
  }

  console.error(`${label} error:`, err);
  return res.status(500).json({
    error: "Something went wrong managing your seats. Please try again.",
  });
};

/* ---------------------------------------------------------
   LIST SEATS (owner-only)
--------------------------------------------------------- */

app.get("/seats", async (req, res) => {
  try {
    const decodedToken = await verifyFirebaseUser(req);
    const seatManager = buildSeatManager();
    const seats = await seatManager.listSeats(decodedToken.uid);
    res.json({ seats });
  } catch (err) {
    handleError(res, err, "List seats");
  }
});

/* ---------------------------------------------------------
   ADD SEAT (owner-only)
--------------------------------------------------------- */

app.post("/seats", async (req, res) => {
  try {
    const decodedToken = await verifyFirebaseUser(req);
    const { email, tier, permission } = req.body || {};
    const seatManager = buildSeatManager();
    const seat = await seatManager.addSeat({
      ownerUid: decodedToken.uid,
      email,
      tier,
      permission,
    });
    res.status(201).json({ seat });
  } catch (err) {
    handleError(res, err, "Add seat");
  }
});

/* ---------------------------------------------------------
   UPDATE SEAT — tier and/or permission (owner-only)
--------------------------------------------------------- */

app.patch("/seats/:childUid", async (req, res) => {
  try {
    const decodedToken = await verifyFirebaseUser(req);
    const { childUid } = req.params;
    const { tier, permission } = req.body || {};

    if (tier === undefined && permission === undefined) {
      return res
        .status(400)
        .json({ error: "Provide a tier or permission to update." });
    }

    const seatManager = buildSeatManager();
    let seat;

    if (tier !== undefined) {
      seat = await seatManager.changeSeatTier({
        ownerUid: decodedToken.uid,
        childUid,
        tier,
      });
    }

    if (permission !== undefined) {
      seat = await seatManager.changeSeatPermission({
        ownerUid: decodedToken.uid,
        childUid,
        permission,
      });
    }

    res.json({ seat });
  } catch (err) {
    handleError(res, err, "Update seat");
  }
});

/* ---------------------------------------------------------
   REMOVE SEAT (owner-only)
--------------------------------------------------------- */

app.delete("/seats/:childUid", async (req, res) => {
  try {
    const decodedToken = await verifyFirebaseUser(req);
    const { childUid } = req.params;
    const seatManager = buildSeatManager();
    const seat = await seatManager.removeSeat({
      ownerUid: decodedToken.uid,
      childUid,
    });
    res.json({ seat });
  } catch (err) {
    handleError(res, err, "Remove seat");
  }
});

/* ---------------------------------------------------------
   REACTIVATE SEAT (owner-only)
--------------------------------------------------------- */

app.post("/seats/:childUid/reactivate", async (req, res) => {
  try {
    const decodedToken = await verifyFirebaseUser(req);
    const { childUid } = req.params;
    const { tier, permission } = req.body || {};
    const seatManager = buildSeatManager();
    const seat = await seatManager.reactivateSeat({
      ownerUid: decodedToken.uid,
      childUid,
      tier,
      permission,
    });
    res.json({ seat });
  } catch (err) {
    handleError(res, err, "Reactivate seat");
  }
});

module.exports = { app };
