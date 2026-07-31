/**
 * Firebase Storage security rules tests.
 *
 * These rules resolve the uploader's account out of Firestore, so both the
 * Storage and Firestore emulators must be running. `npm run test:rules` starts
 * both.
 *
 * The case that matters most is deletion: object paths are keyed by the
 * uploader's uid, so before the seats model reached these rules an owner or
 * full-access member could not delete a teammate's file — deleteObject() runs
 * before the Firestore delete, so the whole operation failed.
 */

import test from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

const PROJECT_ID = "suros-logic-rules-test";

const OWNER = "owner_uid";
const FULL = "full_uid";       // member, memberPermission: full
const VIEWER = "viewer_uid";   // member, memberPermission: view_all_edit_own
const LIMITED = "limited_uid"; // member, memberPermission: own
const OUTSIDER = "outsider_uid";

const BYTES = new Uint8Array([1, 2, 3, 4]);
const TOO_BIG = new Uint8Array(2 * 1024 * 1024 + 1);

// Objects owned by a member, so cross-member access is what gets exercised.
const MEMBER_FILE = `projectFiles/${FULL}/bid_1/group/0-plan.pdf`;
const LIMITED_FILE = `projectFiles/${LIMITED}/bid_1/group/0-notes.pdf`;
const OWNER_LOGO = `companyLogos/${OWNER}/logo.png`;
const MEMBER_PLAN = `planUploads/${FULL}/proj_1/source.pdf`;

let testEnv;

const seed = async (context) => {
  const db = context.firestore();

  await setDoc(doc(db, "users", OWNER), {
    uid: OWNER,
    accountId: OWNER,
    accountRole: "owner",
    isSubscribed: true,
  });

  for (const [uid, permission] of [
    [FULL, "full"],
    [VIEWER, "view_all_edit_own"],
    [LIMITED, "own"],
  ]) {
    await setDoc(doc(db, "users", uid), {
      uid,
      accountId: OWNER,
      accountRole: "member",
      memberPermission: permission,
      isSubscribed: true,
    });
  }

  // A separate account entirely.
  await setDoc(doc(db, "users", OUTSIDER), {
    uid: OUTSIDER,
    accountId: OUTSIDER,
    accountRole: "owner",
    isSubscribed: true,
  });

  const storage = context.storage();
  await uploadBytes(ref(storage, MEMBER_FILE), BYTES);
  await uploadBytes(ref(storage, LIMITED_FILE), BYTES);
  await uploadBytes(ref(storage, MEMBER_PLAN), BYTES);
  await uploadBytes(ref(storage, OWNER_LOGO), BYTES, {
    contentType: "image/png",
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
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(seed);
});

test.after(async () => {
  await testEnv?.cleanup();
});

/* ---------------------------------------------------------
   DELETION ACROSS MEMBERS — the bug these rules existed to have
--------------------------------------------------------- */

test("an owner can delete a member's bid file", async () => {
  const storage = testEnv.authenticatedContext(OWNER).storage();

  await assertSucceeds(deleteObject(ref(storage, MEMBER_FILE)));
});

test("a full-access member can delete another member's bid file", async () => {
  const storage = testEnv.authenticatedContext(FULL).storage();

  await assertSucceeds(deleteObject(ref(storage, LIMITED_FILE)));
});

test("a view-all member cannot delete a teammate's file", async () => {
  // Reads everything, writes only their own — same split as firestore.rules.
  const storage = testEnv.authenticatedContext(VIEWER).storage();

  await assertFails(deleteObject(ref(storage, MEMBER_FILE)));
});

test("an own-permission member cannot delete a teammate's file", async () => {
  const storage = testEnv.authenticatedContext(LIMITED).storage();

  await assertFails(deleteObject(ref(storage, MEMBER_FILE)));
});

test("a member can delete their own file", async () => {
  const storage = testEnv.authenticatedContext(LIMITED).storage();

  await assertSucceeds(deleteObject(ref(storage, LIMITED_FILE)));
});

/* ---------------------------------------------------------
   READS
--------------------------------------------------------- */

test("a view-all member can read a teammate's file", async () => {
  const storage = testEnv.authenticatedContext(VIEWER).storage();

  await assertSucceeds(getBytes(ref(storage, MEMBER_FILE)));
});

test("an own-permission member cannot read a teammate's file", async () => {
  const storage = testEnv.authenticatedContext(LIMITED).storage();

  await assertFails(getBytes(ref(storage, MEMBER_FILE)));
});

test("a member can read the owner's logo for inherited branding", async () => {
  const storage = testEnv.authenticatedContext(LIMITED).storage();

  await assertSucceeds(getBytes(ref(storage, OWNER_LOGO)));
});

test("a member cannot overwrite the owner's logo", async () => {
  const storage = testEnv.authenticatedContext(FULL).storage();

  await assertFails(
    uploadBytes(ref(storage, OWNER_LOGO), BYTES, { contentType: "image/png" })
  );
});

/* ---------------------------------------------------------
   ACCOUNT ISOLATION
--------------------------------------------------------- */

test("another account cannot read or delete these files", async () => {
  const storage = testEnv.authenticatedContext(OUTSIDER).storage();

  await assertFails(getBytes(ref(storage, MEMBER_FILE)));
  await assertFails(deleteObject(ref(storage, MEMBER_FILE)));
  await assertFails(getBytes(ref(storage, MEMBER_PLAN)));
});

test("an unauthenticated request is refused", async () => {
  const storage = testEnv.unauthenticatedContext().storage();

  await assertFails(getBytes(ref(storage, MEMBER_FILE)));
});

/* ---------------------------------------------------------
   UPLOADS AND SIZE LIMITS (unchanged)
--------------------------------------------------------- */

test("a member can upload under their own uid", async () => {
  const storage = testEnv.authenticatedContext(LIMITED).storage();

  await assertSucceeds(
    uploadBytes(ref(storage, `projectFiles/${LIMITED}/bid_1/g/0-new.pdf`), BYTES)
  );
});

test("a member cannot upload under someone else's uid", async () => {
  const storage = testEnv.authenticatedContext(LIMITED).storage();

  await assertFails(
    uploadBytes(ref(storage, `projectFiles/${FULL}/bid_1/g/0-sneaky.pdf`), BYTES)
  );
});

test("the 2MB bid-file limit still applies", async () => {
  const storage = testEnv.authenticatedContext(LIMITED).storage();

  await assertFails(
    uploadBytes(ref(storage, `projectFiles/${LIMITED}/bid_1/g/0-big.pdf`), TOO_BIG)
  );
});

test("plan uploads still allow files above the bid limit", async () => {
  const storage = testEnv.authenticatedContext(LIMITED).storage();

  await assertSucceeds(
    uploadBytes(ref(storage, `planUploads/${LIMITED}/proj_2/big.pdf`), TOO_BIG)
  );
});
