/**
 * Firestore security rules tests.
 *
 * Rules are the only barrier between a client (signed-in or anonymous) and the
 * database — the Firebase web API key is public, so anyone can talk to
 * Firestore directly, with no app code in the way. These cover the things that
 * barrier is load-bearing for:
 *
 *   1. Seat fields a member must not be able to edit on their own doc.
 *   2. The subscription gate: an inactive account may read and delete, but not
 *      create or update.
 *   3. The public `inquiries` collection: anyone (including unauthenticated
 *      visitors) may create a well-formed record, but nobody may read, update,
 *      or delete one from the client.
 *
 * Run with the Firestore emulator:
 *   npx firebase emulators:exec --only firestore "node --test firestore-rules.test.mjs"
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

const PROJECT_ID = "suros-logic-rules-test";

let testEnv;

/* ---------------------------------------------------------
   FIXTURES
--------------------------------------------------------- */

const OWNER = "owner_uid";
const MEMBER = "member_uid";
const LAPSED = "lapsed_uid";
const LIMITED = "limited_uid";
const OUTSIDER = "outsider_uid";

const seedUsers = async (context) => {
  const db = context.firestore();

  await setDoc(doc(db, "users", OWNER), {
    uid: OWNER,
    accountId: OWNER,
    accountRole: "owner",
    isSubscribed: true,
    stripeSubscriptionStatus: "active",
    stripeCustomerId: "cus_owner",
    stripeSubscriptionId: "sub_owner",
  });

  await setDoc(doc(db, "users", MEMBER), {
    uid: MEMBER,
    accountId: OWNER,
    accountRole: "member",
    memberPermission: "full",
    seatPlanAnalyzerLimit: 3,
    seatStatus: "active",
    stripeSeatPriceId: "price_75",
    isSubscribed: true,
    stripeSubscriptionStatus: "active",
  });

  // The least-privileged seat shape, so escalation attempts are real changes
  // rather than no-op writes of the values already there.
  await setDoc(doc(db, "users", LIMITED), {
    uid: LIMITED,
    accountId: OWNER,
    accountRole: "member",
    memberPermission: "own",
    seatPlanAnalyzerLimit: 1,
    seatStatus: "active",
    stripeSeatPriceId: "price_55",
    isSubscribed: true,
    stripeSubscriptionStatus: "active",
  });

  // Same account shape as OWNER, but the subscription has lapsed.
  await setDoc(doc(db, "users", LAPSED), {
    uid: LAPSED,
    accountId: LAPSED,
    accountRole: "owner",
    isSubscribed: false,
    stripeSubscriptionStatus: "canceled",
  });

  await setDoc(doc(db, "bidForms", "bid_owner"), {
    userId: OWNER,
    accountId: OWNER,
    title: "Active account bid",
  });

  await setDoc(doc(db, "bidForms", "bid_member"), {
    userId: MEMBER,
    accountId: OWNER,
    title: "Teammate's bid",
  });

  await setDoc(doc(db, "bidForms", "bid_limited"), {
    userId: LIMITED,
    accountId: OWNER,
    title: "Own-permission member's bid",
  });

  await setDoc(doc(db, "bidForms", "bid_lapsed"), {
    userId: LAPSED,
    accountId: LAPSED,
    title: "Lapsed account bid",
    updatedAt: "seed",
  });

  await setDoc(doc(db, "projectFiles", "file_lapsed"), {
    userId: LAPSED,
    accountId: LAPSED,
    bidFormId: "bid_lapsed",
    storagePath: "x/y.pdf",
  });
};

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(seedUsers);
});

test.after(async () => {
  await testEnv?.cleanup();
});

/* ---------------------------------------------------------
   SEAT FIELDS A MEMBER MUST NOT CONTROL
--------------------------------------------------------- */

test("a member may edit their own profile fields", async () => {
  const db = testEnv.authenticatedContext(MEMBER).firestore();

  await assertSucceeds(
    updateDoc(doc(db, "users", MEMBER), { displayName: "New Name" })
  );
});

test("a member cannot mark their own seat removed", async () => {
  // Would dodge suspension on cancellation: propagation skips removed seats,
  // and removeSeat refuses a seat that is already removed.
  const db = testEnv.authenticatedContext(MEMBER).firestore();

  await assertFails(
    updateDoc(doc(db, "users", MEMBER), { seatStatus: "removed" })
  );
});

test("a member cannot move their seat onto a cheaper price", async () => {
  // Would keep tier-3 quota while billing the owner the tier-1 rate.
  const db = testEnv.authenticatedContext(MEMBER).firestore();

  await assertFails(
    updateDoc(doc(db, "users", MEMBER), { stripeSeatPriceId: "price_55" })
  );
});

test("a member cannot raise their own permission, quota or role", async () => {
  const db = testEnv.authenticatedContext(LIMITED).firestore();

  await assertFails(
    updateDoc(doc(db, "users", LIMITED), { memberPermission: "full" })
  );
  await assertFails(
    updateDoc(doc(db, "users", LIMITED), { seatPlanAnalyzerLimit: 3 })
  );
  await assertFails(
    updateDoc(doc(db, "users", LIMITED), { accountRole: "owner" })
  );
  await assertFails(
    updateDoc(doc(db, "users", LIMITED), { accountId: LIMITED })
  );
});

/* ---------------------------------------------------------
   SELF-GRANTED SUBSCRIPTION ON CREATE
--------------------------------------------------------- */

test("a brand new user cannot create a doc claiming a subscription", async () => {
  // Anyone can obtain an auth token; this must not become free access.
  const db = testEnv.authenticatedContext(OUTSIDER).firestore();

  await assertFails(
    setDoc(doc(db, "users", OUTSIDER), {
      uid: OUTSIDER,
      accountId: OUTSIDER,
      accountRole: "owner",
      isSubscribed: true,
    })
  );
});

test("a profile created with no billing fields at all is allowed", async () => {
  // The exact payload EditProfile now sends: it stays silent about billing so
  // a merge cannot overwrite what the Stripe webhook already wrote.
  const db = testEnv.authenticatedContext(OUTSIDER).firestore();

  await assertSucceeds(
    setDoc(doc(db, "users", OUTSIDER), {
      uid: OUTSIDER,
      displayName: "New Person",
      companyName: "Acme",
      phone: "555",
      email: "new@example.com",
      profileComplete: true,
    })
  );
});

test("a brand new user may create an unsubscribed doc", async () => {
  const db = testEnv.authenticatedContext(OUTSIDER).firestore();

  await assertSucceeds(
    setDoc(doc(db, "users", OUTSIDER), {
      uid: OUTSIDER,
      accountId: OUTSIDER,
      accountRole: "owner",
      isSubscribed: false,
      displayName: "New Person",
    })
  );
});

test("a brand new user cannot claim someone else's Stripe customer", async () => {
  const db = testEnv.authenticatedContext(OUTSIDER).firestore();

  await assertFails(
    setDoc(doc(db, "users", OUTSIDER), {
      uid: OUTSIDER,
      accountId: OUTSIDER,
      accountRole: "owner",
      isSubscribed: false,
      stripeCustomerId: "cus_owner",
    })
  );
});

/* ---------------------------------------------------------
   SUBSCRIPTION GATE — read/delete open, create/update closed
--------------------------------------------------------- */

test("an active account can create and edit", async () => {
  const db = testEnv.authenticatedContext(OWNER).firestore();

  await assertSucceeds(
    setDoc(doc(db, "bidForms", "bid_new"), {
      userId: OWNER,
      accountId: OWNER,
      title: "Fresh bid",
    })
  );
  await assertSucceeds(
    updateDoc(doc(db, "bidForms", "bid_owner"), { title: "Edited" })
  );
});

test("a lapsed account can still read its own data", async () => {
  const db = testEnv.authenticatedContext(LAPSED).firestore();

  await assertSucceeds(getDoc(doc(db, "bidForms", "bid_lapsed")));
});

test("a lapsed account can still delete its own data", async () => {
  // Matches the app today: delete controls stay enabled while inactive, and
  // people should always be able to remove their own records.
  const db = testEnv.authenticatedContext(LAPSED).firestore();

  await assertSucceeds(deleteDoc(doc(db, "bidForms", "bid_lapsed")));
});

test("a lapsed account cannot create new records", async () => {
  const db = testEnv.authenticatedContext(LAPSED).firestore();

  await assertFails(
    setDoc(doc(db, "bidForms", "bid_sneaky"), {
      userId: LAPSED,
      accountId: LAPSED,
      title: "Should not exist",
    })
  );
});

test("a lapsed account cannot edit existing records", async () => {
  const db = testEnv.authenticatedContext(LAPSED).firestore();

  await assertFails(
    updateDoc(doc(db, "bidForms", "bid_lapsed"), { title: "Should not change" })
  );
});

test("a member whose owner lapsed loses write access too", async () => {
  // Propagation mirrors the owner's flag onto every seat.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "users", MEMBER), {
      isSubscribed: false,
      stripeSubscriptionStatus: "canceled",
    });
  });

  const db = testEnv.authenticatedContext(MEMBER).firestore();

  await assertFails(
    updateDoc(doc(db, "bidForms", "bid_owner"), { title: "Nope" })
  );
  // Reads survive.
  await assertSucceeds(getDoc(doc(db, "bidForms", "bid_owner")));
});

/* ---------------------------------------------------------
   ACCOUNT ISOLATION
--------------------------------------------------------- */

test("one account cannot read or write another account's data", async () => {
  const db = testEnv.authenticatedContext(LAPSED).firestore();

  await assertFails(getDoc(doc(db, "bidForms", "bid_owner")));
  await assertFails(
    updateDoc(doc(db, "bidForms", "bid_owner"), { title: "Not yours" })
  );
});

/* ---------------------------------------------------------
   DELETE SIDE EFFECTS — the app bumps the parent bid's
   timestamp immediately after a delete
--------------------------------------------------------- */

test("a lapsed account can delete a file and bump the parent bid afterwards", async () => {
  // Mirrors ProjectFiles.tsx: deleteDoc, then touchBidFormUpdatedAt. Blocking
  // the second call made the permitted delete report failure.
  const db = testEnv.authenticatedContext(LAPSED).firestore();

  await assertSucceeds(deleteDoc(doc(db, "projectFiles", "file_lapsed")));
  await assertSucceeds(
    updateDoc(doc(db, "bidForms", "bid_lapsed"), { updatedAt: "bumped" })
  );
});

test("the updatedAt exemption does not let a lapsed account edit content", async () => {
  const db = testEnv.authenticatedContext(LAPSED).firestore();

  // Smuggling a real field alongside the timestamp must still fail.
  await assertFails(
    updateDoc(doc(db, "bidForms", "bid_lapsed"), {
      updatedAt: "bumped",
      title: "Sneaky edit",
    })
  );
});

/* ---------------------------------------------------------
   LIST QUERIES — rules validate these structurally, so the
   query's own filter must match the read rule exactly
--------------------------------------------------------- */

test("an owner may list the whole account by accountId", async () => {
  const db = testEnv.authenticatedContext(OWNER).firestore();

  const snap = await assertSucceeds(
    getDocs(query(collection(db, "bidForms"), where("accountId", "==", OWNER)))
  );
  assert.equal(snap.size, 3);
});

test("a view-all member may list the whole account by accountId", async () => {
  const db = testEnv.authenticatedContext(MEMBER).firestore();

  await assertSucceeds(
    getDocs(query(collection(db, "bidForms"), where("accountId", "==", OWNER)))
  );
});

test("an own-permission member may list their own records by userId", async () => {
  // getScopeQueryField() returns "userId" for this profile precisely so the
  // query matches the only branch of canReadAccountDoc that grants them access.
  const db = testEnv.authenticatedContext(LIMITED).firestore();

  const snap = await assertSucceeds(
    getDocs(query(collection(db, "bidForms"), where("userId", "==", LIMITED)))
  );
  assert.equal(snap.size, 1);
});

test("an own-permission member cannot list the account by accountId", async () => {
  // The whole query is rejected, not filtered — which is why the UI must pick
  // the query field by permission rather than always using accountId.
  const db = testEnv.authenticatedContext(LIMITED).firestore();

  await assertFails(
    getDocs(query(collection(db, "bidForms"), where("accountId", "==", OWNER)))
  );
});

test("an own-permission member cannot read a teammate's record directly", async () => {
  const db = testEnv.authenticatedContext(LIMITED).firestore();

  await assertFails(getDoc(doc(db, "bidForms", "bid_member")));
});

test("an own-permission member cannot edit a teammate's record", async () => {
  const db = testEnv.authenticatedContext(LIMITED).firestore();

  await assertFails(
    updateDoc(doc(db, "bidForms", "bid_member"), { title: "Not mine" })
  );
});

test("a full-permission member may edit a teammate's record", async () => {
  const db = testEnv.authenticatedContext(MEMBER).firestore();

  await assertSucceeds(
    updateDoc(doc(db, "bidForms", "bid_limited"), { title: "Allowed" })
  );
});

/* ---------------------------------------------------------
   LISTING ACCOUNT MEMBERS — what useAccountCreators does to
   turn a record's userId into a name
--------------------------------------------------------- */

test("an own-permission member can list the users in their account", async () => {
  // The users read rule checks accountId with no permission gate, unlike the
  // data collections — so creator attribution works at every access level.
  const db = testEnv.authenticatedContext(LIMITED).firestore();

  const snap = await assertSucceeds(
    getDocs(query(collection(db, "users"), where("accountId", "==", OWNER)))
  );
  assert.ok(snap.size > 1);
});

test("an owner can list the users in their account", async () => {
  const db = testEnv.authenticatedContext(OWNER).firestore();

  await assertSucceeds(
    getDocs(query(collection(db, "users"), where("accountId", "==", OWNER)))
  );
});

test("someone outside the account cannot list its users", async () => {
  const db = testEnv.authenticatedContext(LAPSED).firestore();

  await assertFails(
    getDocs(query(collection(db, "users"), where("accountId", "==", OWNER)))
  );
});

/* ---------------------------------------------------------
   INQUIRIES — public landing-page lead form. No login is
   required to submit, so this is the one collection anonymous
   clients can write to at all; the rule's job is to allow that
   single narrow write while blocking everything else (reads,
   edits, deletes, and creates with the wrong shape).
--------------------------------------------------------- */

const validInquiry = {
  firstName: "Jamie",
  lastName: "Rivera",
  email: "jamie@example.com",
  phone: "555-123-4567",
  companyName: "Rivera Roofing",
  website: "https://riveraroofing.com",
  companyDescription: "Residential roofing contractor.",
};

test("an anonymous visitor can submit a valid inquiry", async () => {
  const db = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(
    addDoc(collection(db, "inquiries"), {
      ...validInquiry,
      createdAt: new Date(),
    })
  );
});

test("a signed-in visitor can also submit a valid inquiry", async () => {
  const db = testEnv.authenticatedContext(OUTSIDER).firestore();

  await assertSucceeds(
    addDoc(collection(db, "inquiries"), {
      ...validInquiry,
      createdAt: new Date(),
    })
  );
});

test("an inquiry missing a required field is rejected", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const { companyName, ...withoutCompanyName } = validInquiry;

  await assertFails(
    addDoc(collection(db, "inquiries"), {
      ...withoutCompanyName,
      createdAt: new Date(),
    })
  );
});

test("an inquiry with an empty required field is rejected", async () => {
  const db = testEnv.unauthenticatedContext().firestore();

  await assertFails(
    addDoc(collection(db, "inquiries"), {
      ...validInquiry,
      firstName: "",
      createdAt: new Date(),
    })
  );
});

test("an inquiry with an unexpected extra field is rejected", async () => {
  const db = testEnv.unauthenticatedContext().firestore();

  await assertFails(
    addDoc(collection(db, "inquiries"), {
      ...validInquiry,
      createdAt: new Date(),
      isAdmin: true,
    })
  );
});

test("an inquiry with an oversized field is rejected", async () => {
  const db = testEnv.unauthenticatedContext().firestore();

  await assertFails(
    addDoc(collection(db, "inquiries"), {
      ...validInquiry,
      companyDescription: "x".repeat(5000),
      createdAt: new Date(),
    })
  );
});

test("nobody can read inquiries from the client", async () => {
  let seededId;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const ref = await addDoc(collection(context.firestore(), "inquiries"), {
      ...validInquiry,
      createdAt: new Date(),
    });
    seededId = ref.id;
  });

  const anonDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonDb, "inquiries", seededId)));

  const ownerDb = testEnv.authenticatedContext(OWNER).firestore();
  await assertFails(getDoc(doc(ownerDb, "inquiries", seededId)));
});

test("nobody can update or delete an inquiry from the client", async () => {
  let seededId;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const ref = await addDoc(collection(context.firestore(), "inquiries"), {
      ...validInquiry,
      createdAt: new Date(),
    });
    seededId = ref.id;
  });

  const ownerDb = testEnv.authenticatedContext(OWNER).firestore();
  await assertFails(
    updateDoc(doc(ownerDb, "inquiries", seededId), { firstName: "Changed" })
  );
  await assertFails(deleteDoc(doc(ownerDb, "inquiries", seededId)));
});
