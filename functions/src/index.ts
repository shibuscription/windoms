import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";

const functionsRegion = "asia-northeast1";
const adminApp = initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
});
setGlobalOptions({ region: functionsRegion, maxInstances: 10 });

const firestore = getFirestore();
const adminAuth = getAuth();
const serverProjectId =
  adminApp.options.projectId ??
  process.env.GCLOUD_PROJECT ??
  process.env.FIREBASE_CONFIG?.match(/"projectId":"([^"]+)"/)?.[1] ??
  "";

const assertAdmin = async (
  auth:
    | {
        uid?: string;
        token?: Record<string, unknown>;
      }
    | undefined,
) => {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  if (auth.token?.admin !== true) {
    logger.warn("admin claim required", {
      projectId: serverProjectId || "(unknown)",
      functionsRegion,
      authUid: auth.uid,
    });
    throw new HttpsError("permission-denied", "Admin claim is required.", {
      projectId: serverProjectId,
      functionsRegion,
      errorCode: "auth/admin-claim-required",
      errorMessage: "Firebase Auth custom claims admin:true が必要です。",
    });
  }
};

const listAllAuthUsers = async () => {
  const users: Array<{
    uid: string;
    email: string;
    displayName: string;
    disabled: boolean;
    creationTime: string;
    lastSignInTime: string;
  }> = [];

  let pageToken: string | undefined;

  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    users.push(
      ...page.users.map((user) => ({
        uid: user.uid,
        email: user.email ?? "",
        displayName: user.displayName ?? "",
        disabled: user.disabled,
        creationTime: user.metadata.creationTime ?? "",
        lastSignInTime: user.metadata.lastSignInTime ?? "",
      })),
    );
    pageToken = page.pageToken;
  } while (pageToken);

  return users.sort((a, b) => a.email.localeCompare(b.email));
};

export const listAuthUsers = onCall(async (request) => {
  await assertAdmin(request.auth);

  try {
    const users = await listAllAuthUsers();
    return {
      users,
      projectId: serverProjectId,
      fetchedAt: new Date().toISOString(),
      functionsRegion,
      errorCode: "",
      errorMessage: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown internal error.";
    logger.error("listAuthUsers failed", {
      projectId: serverProjectId || "(unknown)",
      functionsRegion,
      message,
      authUid: request.auth?.uid ?? "",
    });
    throw new HttpsError("internal", "Auth 一覧の取得に失敗しました。", {
      projectId: serverProjectId,
      functionsRegion,
      errorCode: "auth/list-users-failed",
      errorMessage: message,
    });
  }
});

export const linkMemberAuth = onCall(async (request) => {
  await assertAdmin(request.auth);

  const memberId = typeof request.data?.memberId === "string" ? request.data.memberId.trim() : "";
  const authUid = typeof request.data?.authUid === "string" ? request.data.authUid.trim() : "";

  if (!memberId || !authUid) {
    throw new HttpsError("invalid-argument", "memberId and authUid are required.");
  }

  const authUser = await adminAuth.getUser(authUid);
  const memberRef = firestore.collection("members").doc(memberId);
  const memberSnapshot = await memberRef.get();

  if (!memberSnapshot.exists) {
    throw new HttpsError("not-found", "Target member was not found.");
  }

  const duplicatedMemberSnapshot = await firestore
    .collection("members")
    .where("authUid", "==", authUid)
    .limit(1)
    .get();

  const duplicatedMember = duplicatedMemberSnapshot.docs[0];
  if (duplicatedMember && duplicatedMember.id !== memberId) {
    throw new HttpsError("already-exists", "This Auth user is already linked to another member.");
  }

  await memberRef.set(
    {
      authUid: authUser.uid,
      authEmail: authUser.email ?? "",
      updatedAt: new Date(),
    },
    { merge: true },
  );

  return {
    authUid: authUser.uid,
    authEmail: authUser.email ?? "",
  };
});
