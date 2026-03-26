import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import { randomInt } from "crypto";

const functionsRegion = "asia-northeast1";
const adminApp = initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
});
setGlobalOptions({ region: functionsRegion, maxInstances: 10 });

const firestore = getFirestore();
const adminAuth = getAuth();
const internalEmailDomain = "minamigaoka.windoms.club";
const serverProjectId =
  adminApp.options.projectId ??
  process.env.GCLOUD_PROJECT ??
  process.env.FIREBASE_CONFIG?.match(/"projectId":"([^"]+)"/)?.[1] ??
  "";

const normalizeLoginId = (value: string): string => value.trim().toLowerCase();
const loginIdPattern = /^[a-z0-9_-]{4,20}$/;
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const calendarSessionTypes = new Set(["normal", "self", "event"]);
const toInternalAuthEmail = (loginId: string): string =>
  `${normalizeLoginId(loginId)}@${internalEmailDomain}`;
const getLoginIdValidationMessage = (loginId: string): string =>
  loginId.length < 4 || loginId.length > 20
    ? "ユーザーIDは4〜20文字で入力してください。"
    : "使用できる文字は半角英小文字・数字・アンダーバー(_)・ハイフン(-)です。";

const deriveLegacyRole = (memberTypes: string[], adminRole: string): "admin" | "officer" | "parent" | "child" | "teacher" => {
  if (adminRole === "admin") return "admin";
  if (adminRole === "officer") return "officer";
  if (memberTypes.includes("child")) return "child";
  if (memberTypes.includes("teacher")) return "teacher";
  return "parent";
};

const generateTemporaryPassword = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 12; i += 1) {
    password += chars[randomInt(0, chars.length)];
  }
  return password;
};

const normalizeOptionalString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeOptionalBoolean = (value: unknown): boolean | null => {
  if (value === true) return true;
  if (value === false) return false;
  return null;
};

const toFamilyDisplayName = (familyName: string): string => {
  const value = familyName.trim();
  if (!value) return "";
  if (value.includes(" ")) return value.split(" ")[0] || "";
  if (value.includes("　")) return value.split("　")[0] || "";
  return value.endsWith("家") ? value.slice(0, -1) : value;
};

const isValidDateKey = (value: string): boolean => {
  if (!dateKeyPattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const assertCalendarDateKey = (value: string) => {
  if (!isValidDateKey(value)) {
    throw new HttpsError("invalid-argument", "日付が不正です。");
  }
};

const assertCalendarTime = (value: string, fieldLabel: string) => {
  if (!timePattern.test(value)) {
    throw new HttpsError("invalid-argument", `${fieldLabel}を正しく入力してください。`);
  }
};

const touchScheduleDay = async (dateKey: string) => {
  await firestore.collection("scheduleDays").doc(dateKey).set(
    {
      updatedAt: new Date(),
    },
    { merge: true },
  );
};

const reorderScheduleSessions = async (dateKey: string) => {
  const sessionsSnapshot = await firestore
    .collection("scheduleDays")
    .doc(dateKey)
    .collection("sessions")
    .get();

  const orderedDocs = [...sessionsSnapshot.docs].sort((left, right) => {
    const leftStart = typeof left.get("startTime") === "string" ? String(left.get("startTime")) : "";
    const rightStart = typeof right.get("startTime") === "string" ? String(right.get("startTime")) : "";
    if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);

    const leftEnd = typeof left.get("endTime") === "string" ? String(left.get("endTime")) : "";
    const rightEnd = typeof right.get("endTime") === "string" ? String(right.get("endTime")) : "";
    if (leftEnd !== rightEnd) return leftEnd.localeCompare(rightEnd);

    return left.id.localeCompare(right.id);
  });

  if (orderedDocs.length === 0) {
    await touchScheduleDay(dateKey);
    return;
  }

  const batch = firestore.batch();
  orderedDocs.forEach((doc, index) => {
    batch.set(
      doc.ref,
      {
        order: index + 1,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  });
  batch.set(
    firestore.collection("scheduleDays").doc(dateKey),
    {
      updatedAt: new Date(),
    },
    { merge: true },
  );
  await batch.commit();
};

type CalendarSessionPayload = {
  date: string;
  originalDate: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  type: "normal" | "self" | "event";
  eventName: string;
  location: string;
  assigneeFamilyId: string;
  assigneeNameSnapshot: string;
  note: string;
  mainInstructorPlanned: boolean | null;
};

const parseCalendarSessionPayload = (
  value: unknown,
  mode: "create" | "update" | "delete",
): CalendarSessionPayload => {
  const data = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  const date = normalizeOptionalString(data.date);
  const originalDate = normalizeOptionalString(data.originalDate) || date;
  const sessionId = normalizeOptionalString(data.sessionId);
  const startTime = normalizeOptionalString(data.startTime);
  const endTime = normalizeOptionalString(data.endTime);
  const typeValue = normalizeOptionalString(data.type);
  const type = (calendarSessionTypes.has(typeValue) ? typeValue : "normal") as "normal" | "self" | "event";
  const eventName = normalizeOptionalString(data.eventName);
  const location = normalizeOptionalString(data.location);
  const assigneeFamilyId = normalizeOptionalString(data.assigneeFamilyId);
  const assigneeNameSnapshot = normalizeOptionalString(data.assigneeNameSnapshot);
  const note = normalizeOptionalString(data.note);
  const mainInstructorPlanned = normalizeOptionalBoolean(data.mainInstructorPlanned);

  assertCalendarDateKey(date);
  if (mode !== "create") {
    assertCalendarDateKey(originalDate);
  }
  if (mode !== "delete") {
    assertCalendarTime(startTime, "開始時刻");
    assertCalendarTime(endTime, "終了時刻");
    if (startTime >= endTime) {
      throw new HttpsError("invalid-argument", "終了時刻は開始時刻より後にしてください。");
    }
  }
  if (mode !== "create" && !sessionId) {
    throw new HttpsError("invalid-argument", "sessionId が必要です。");
  }
  if (typeValue && !calendarSessionTypes.has(typeValue)) {
    throw new HttpsError("invalid-argument", "種別が不正です。");
  }
  if (type === "event" && !eventName) {
    throw new HttpsError("invalid-argument", "イベント名を入力してください。");
  }

  return {
    date,
    originalDate,
    sessionId,
    startTime,
    endTime,
    type,
    eventName,
    location,
    assigneeFamilyId,
    assigneeNameSnapshot,
    note,
    mainInstructorPlanned,
  };
};

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

const assertCalendarSessionManager = async (
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

  if (auth.token?.admin === true) {
    return;
  }

  const memberSnapshot = await firestore
    .collection("members")
    .where("authUid", "==", auth.uid)
    .limit(1)
    .get();

  const member = memberSnapshot.docs[0];
  const adminRole = typeof member?.get("adminRole") === "string" ? String(member.get("adminRole")) : "";
  const role = typeof member?.get("role") === "string" ? String(member.get("role")) : "";
  const rawStaffPermissions = member?.get("staffPermissions");
  const staffPermissions = Array.isArray(rawStaffPermissions)
    ? rawStaffPermissions.filter((item: unknown): item is string => typeof item === "string")
    : [];

  if (role === "admin" || adminRole === "admin" || staffPermissions.includes("shift_management")) {
    return;
  }

  logger.warn("calendar session manager permission required", {
    projectId: serverProjectId || "(unknown)",
    functionsRegion,
    authUid: auth.uid,
  });
  throw new HttpsError("permission-denied", "Calendar session management permission is required.", {
    projectId: serverProjectId,
    functionsRegion,
    errorCode: "auth/calendar-session-manager-required",
    errorMessage: "admin またはシフト作成担当者の権限が必要です。",
  });
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

type BulkRegisterRowInput = {
  rowNumber?: number;
  familyDisplayName?: string;
  input?: {
    familyId?: string;
    displayName?: string;
    familyName?: string;
    givenName?: string;
    familyNameKana?: string;
    givenNameKana?: string;
    name?: string;
    nameKana?: string;
    enrollmentYear?: number | null;
    instrumentCodes?: string[];
    memberTypes?: string[];
    adminRole?: string;
    staffPermissions?: string[];
    memberStatus?: string;
    loginId?: string;
    notes?: string;
  };
};

export const bulkRegisterMembers = onCall(async (request) => {
  await assertAdmin(request.auth);

  const rows = Array.isArray(request.data?.rows) ? (request.data.rows as BulkRegisterRowInput[]) : [];
  if (rows.length === 0) {
    throw new HttpsError("invalid-argument", "rows are required.");
  }

  const seenLoginIds = new Set<string>();
  const familyIdByDisplayName = new Map<string, string>();
  let createdFamilyCount = 0;
  const results: Array<{
    rowNumber: number;
    userId: string;
    displayName: string;
    generatedEmail: string;
    temporaryPassword: string;
    status: "success" | "error";
    errorMessage: string;
  }> = [];

  for (const row of rows) {
    const rowNumber = typeof row.rowNumber === "number" ? row.rowNumber : 0;
    const input = row.input ?? {};
    const familyDisplayName = typeof row.familyDisplayName === "string" ? row.familyDisplayName.trim() : "";
    const familyName = typeof input.familyName === "string" ? input.familyName.trim() : "";
    const givenName = typeof input.givenName === "string" ? input.givenName.trim() : "";
    const familyNameKana = typeof input.familyNameKana === "string" ? input.familyNameKana.trim() : "";
    const givenNameKana = typeof input.givenNameKana === "string" ? input.givenNameKana.trim() : "";
    const displayName =
      typeof input.displayName === "string" && input.displayName.trim()
        ? input.displayName.trim()
        : `${familyName}${givenName}`.trim() || (typeof input.name === "string" ? input.name.trim() : "");
    const loginId = normalizeLoginId(typeof input.loginId === "string" ? input.loginId : "");
    const generatedEmail = loginId ? toInternalAuthEmail(loginId) : "";

    const fail = (message: string) => {
      results.push({
        rowNumber,
        userId: loginId,
        displayName,
        generatedEmail,
        temporaryPassword: "",
        status: "error",
        errorMessage: message,
      });
    };

    if (!familyName) {
      fail("familyName が不足しています。");
      continue;
    }

    if (!givenName) {
      fail("givenName が不足しています。");
      continue;
    }

    if (!familyNameKana) {
      fail("familyNameKana が不足しています。");
      continue;
    }

    if (!givenNameKana) {
      fail("givenNameKana が不足しています。");
      continue;
    }

    if (!displayName) {
      fail("displayName が不足しています。");
      continue;
    }

    if (!loginId) {
      fail("userId が不足しています。");
      continue;
    }

    if (!loginIdPattern.test(loginId)) {
      fail(getLoginIdValidationMessage(loginId));
      continue;
    }

    if (seenLoginIds.has(loginId)) {
      fail("この CSV 内で userId が重複しています。");
      continue;
    }
    seenLoginIds.add(loginId);

    try {
      let resolvedFamilyId = typeof input.familyId === "string" ? input.familyId.trim() : "";
      if (familyDisplayName) {
        const cachedFamilyId = familyIdByDisplayName.get(familyDisplayName);
        if (cachedFamilyId) {
          resolvedFamilyId = cachedFamilyId;
        } else {
          const existingFamilySnapshot = await firestore
            .collection("families")
            .where("name", "==", familyDisplayName)
            .limit(1)
            .get();

          if (!existingFamilySnapshot.empty) {
            resolvedFamilyId = existingFamilySnapshot.docs[0].id;
          } else {
            const familyRef = await firestore.collection("families").add({
              name: familyDisplayName,
              status: "active",
              notes: "",
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            resolvedFamilyId = familyRef.id;
            createdFamilyCount += 1;
          }

          familyIdByDisplayName.set(familyDisplayName, resolvedFamilyId);
        }
      } else if (resolvedFamilyId) {
        const familySnapshot = await firestore.collection("families").doc(resolvedFamilyId).get();
        if (!familySnapshot.exists) {
          fail("familyId に一致する family が見つかりません。");
          continue;
        }
      }

      const existingMemberSnapshot = await firestore
        .collection("members")
        .where("loginId", "==", loginId)
        .limit(1)
        .get();
      if (!existingMemberSnapshot.empty) {
        fail("同じ userId の member が既に存在します。");
        continue;
      }

      try {
        await adminAuth.getUserByEmail(generatedEmail);
        fail("同じ内部メールアドレスの Auth ユーザーが既に存在します。");
        continue;
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
        if (code && code !== "auth/user-not-found") {
          throw error;
        }
      }

      const temporaryPassword = generateTemporaryPassword();
      const authUser = await adminAuth.createUser({
        email: generatedEmail,
        password: temporaryPassword,
        displayName,
      });

      try {
        const memberTypes = Array.isArray(input.memberTypes)
          ? input.memberTypes.filter((item): item is string => typeof item === "string")
          : [];
        const adminRole = typeof input.adminRole === "string" ? input.adminRole : "none";
        const staffPermissions = Array.isArray(input.staffPermissions)
          ? input.staffPermissions.filter((item): item is string => typeof item === "string")
          : [];
        const memberStatus = input.memberStatus === "inactive" ? "inactive" : "active";
        const legacyRole = deriveLegacyRole(memberTypes, adminRole);

        await firestore.collection("members").add({
          familyId: resolvedFamilyId,
          displayName,
          familyName,
          givenName,
          familyNameKana,
          givenNameKana,
          name: displayName,
          nameKana: familyNameKana,
          enrollmentYear: typeof input.enrollmentYear === "number" ? input.enrollmentYear : null,
          instrumentCodes: Array.isArray(input.instrumentCodes)
            ? input.instrumentCodes.filter((item): item is string => typeof item === "string")
            : [],
          memberTypes,
          adminRole,
          staffPermissions,
          memberStatus,
          role: legacyRole,
          permissions: staffPermissions,
          status: memberStatus,
          loginId,
          authUid: authUser.uid,
          authEmail: generatedEmail,
          notes: typeof input.notes === "string" ? input.notes.trim() : "",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (error) {
        await adminAuth.deleteUser(authUser.uid).catch(() => undefined);
        throw error;
      }

      results.push({
        rowNumber,
        userId: loginId,
        displayName,
        generatedEmail,
        temporaryPassword,
        status: "success",
        errorMessage: "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      logger.error("bulkRegisterMembers failed for row", {
        projectId: serverProjectId || "(unknown)",
        functionsRegion,
        rowNumber,
        userId: loginId,
        message,
      });
      fail(message);
    }
  }

  return {
    results,
    successCount: results.filter((item) => item.status === "success").length,
    failureCount: results.filter((item) => item.status === "error").length,
    createdFamilyCount,
    projectId: serverProjectId,
    functionsRegion,
  };
});

export const createCalendarSession = onCall(async (request) => {
  await assertCalendarSessionManager(request.auth);

  const payload = parseCalendarSessionPayload(request.data, "create");
  let assigneeNameSnapshot = "";
  if (payload.assigneeFamilyId) {
    const familySnapshot = await firestore.collection("families").doc(payload.assigneeFamilyId).get();
    if (!familySnapshot.exists) {
      throw new HttpsError("invalid-argument", "当番 / 見守り担当の family が見つかりません。");
    }
    const familyName =
      typeof familySnapshot.get("name") === "string" ? String(familySnapshot.get("name")) : "";
    assigneeNameSnapshot = toFamilyDisplayName(familyName);
  }
  const scheduleDayRef = firestore.collection("scheduleDays").doc(payload.date);
  const sessionRef = scheduleDayRef.collection("sessions").doc();

  await scheduleDayRef.set(
    {
      updatedAt: new Date(),
    },
    { merge: true },
  );

  await sessionRef.set({
    order: 999,
    startTime: payload.startTime,
    endTime: payload.endTime,
    type: payload.type,
    eventName: payload.type === "event" ? payload.eventName : "",
    dutyRequirement: payload.type === "self" ? "watch" : "duty",
    requiresShift: payload.type !== "self",
    location: payload.location,
    assigneeFamilyId: payload.assigneeFamilyId,
    assignees: [],
    assigneeNameSnapshot,
    note: payload.note,
    mainInstructorPlanned: payload.mainInstructorPlanned,
    updatedAt: new Date(),
  });

  await reorderScheduleSessions(payload.date);

  return {
    date: payload.date,
    sessionId: sessionRef.id,
  };
});

export const updateCalendarSession = onCall(async (request) => {
  await assertCalendarSessionManager(request.auth);

  const payload = parseCalendarSessionPayload(request.data, "update");
  let assigneeNameSnapshot = "";
  if (payload.assigneeFamilyId) {
    const familySnapshot = await firestore.collection("families").doc(payload.assigneeFamilyId).get();
    if (!familySnapshot.exists) {
      throw new HttpsError("invalid-argument", "当番 / 見守り担当の family が見つかりません。");
    }
    const familyName =
      typeof familySnapshot.get("name") === "string" ? String(familySnapshot.get("name")) : "";
    assigneeNameSnapshot = toFamilyDisplayName(familyName);
  }
  const sourceRef = firestore
    .collection("scheduleDays")
    .doc(payload.originalDate)
    .collection("sessions")
    .doc(payload.sessionId);
  const sourceSnapshot = await sourceRef.get();

  if (!sourceSnapshot.exists) {
    throw new HttpsError("not-found", "編集対象の予定が見つかりません。");
  }

  const currentData = sourceSnapshot.data() ?? {};
  const nextData = {
    ...currentData,
    startTime: payload.startTime,
    endTime: payload.endTime,
    type: payload.type,
    eventName: payload.type === "event" ? payload.eventName : "",
    dutyRequirement: payload.type === "self" ? "watch" : "duty",
    requiresShift: payload.type !== "self",
    location: payload.location,
    assigneeFamilyId: payload.assigneeFamilyId,
    assigneeNameSnapshot,
    note: payload.note,
    mainInstructorPlanned: payload.mainInstructorPlanned,
    updatedAt: new Date(),
  };

  if (payload.originalDate === payload.date) {
    await sourceRef.set(nextData, { merge: true });
    await reorderScheduleSessions(payload.date);
  } else {
    const targetDayRef = firestore.collection("scheduleDays").doc(payload.date);
    const targetRef = targetDayRef.collection("sessions").doc(payload.sessionId);
    const batch = firestore.batch();

    batch.set(
      targetDayRef,
      {
        updatedAt: new Date(),
      },
      { merge: true },
    );
    batch.set(targetRef, nextData, { merge: true });
    batch.delete(sourceRef);
    batch.set(
      firestore.collection("scheduleDays").doc(payload.originalDate),
      {
        updatedAt: new Date(),
      },
      { merge: true },
    );

    await batch.commit();
    await reorderScheduleSessions(payload.originalDate);
    await reorderScheduleSessions(payload.date);
  }

  return {
    date: payload.date,
    sessionId: payload.sessionId,
  };
});

export const deleteCalendarSession = onCall(async (request) => {
  await assertCalendarSessionManager(request.auth);

  const payload = parseCalendarSessionPayload(request.data, "delete");
  const sessionRef = firestore
    .collection("scheduleDays")
    .doc(payload.date)
    .collection("sessions")
    .doc(payload.sessionId);
  const sessionSnapshot = await sessionRef.get();

  if (!sessionSnapshot.exists) {
    throw new HttpsError("not-found", "削除対象の予定が見つかりません。");
  }

  await sessionRef.delete();
  await reorderScheduleSessions(payload.date);

  return {
    date: payload.date,
    sessionId: payload.sessionId,
  };
});
