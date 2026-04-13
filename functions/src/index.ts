import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import { randomBytes, randomInt } from "crypto";

const functionsRegion = "asia-northeast1";
const adminApp = initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
});
setGlobalOptions({ region: functionsRegion, maxInstances: 10 });

const firestore = getFirestore();
const adminAuth = getAuth();
const internalEmailDomain = "minamigaoka.windoms.club";
const calendarIcsConfigRef = firestore.collection("appSettings").doc("calendarIcs");
const serverProjectId =
  adminApp.options.projectId ??
  process.env.GCLOUD_PROJECT ??
  process.env.FIREBASE_CONFIG?.match(/"projectId":"([^"]+)"/)?.[1] ??
  "";

const normalizeLoginId = (value: string): string => value.trim().toLowerCase();
const loginIdPattern = /^[a-z0-9_-]{4,20}$/;
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const calendarSessionTypes = new Set(["normal", "self", "event", "other"]);
const todoSharedScopeValues = new Set(["parent", "officer", "child", "accounting"]);
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

const validateTemporaryPassword = (value: string): string | null => {
  if (value.length < 8) {
    return "仮パスワードは 8 文字以上で入力してください。";
  }
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value)) {
    return "仮パスワードは英大文字・英小文字・数字を含めてください。";
  }
  return null;
};

const escapeIcsText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const toIcsUtcDateTime = (dateKey: string, time: string): string => {
  const date = new Date(`${dateKey}T${time}:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid calendar datetime: ${dateKey} ${time}`);
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

const toIcsDateStamp = (value: Date): string => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

const getCalendarIcsFeedUrl = (token: string): string => {
  const projectId = serverProjectId || process.env.GCLOUD_PROJECT || "";
  return `https://${functionsRegion}-${projectId}.cloudfunctions.net/calendarIcsFeed?token=${token}`;
};

const getOrCreateCalendarIcsToken = async (): Promise<string> => {
  const snapshot = await calendarIcsConfigRef.get();
  const existingToken =
    snapshot.exists && typeof snapshot.get("token") === "string"
      ? String(snapshot.get("token")).trim()
      : "";
  if (existingToken) return existingToken;

  const token = randomBytes(32).toString("hex");
  await calendarIcsConfigRef.set(
    {
      token,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { merge: true },
  );
  return token;
};

const getCalendarSessionTitle = (session: Record<string, unknown>): string => {
  const type =
    session.type === "self" || session.type === "event" || session.type === "other" ? session.type : "normal";
  const assigneeName =
    typeof session.assigneeNameSnapshot === "string" ? session.assigneeNameSnapshot.trim() : "";
  const eventName = typeof session.eventName === "string" ? session.eventName.trim() : "";

  if (type === "self") {
    return assigneeName ? `【吹奏楽】 自主練 ${assigneeName}` : "【吹奏楽】 自主練";
  }
  if (type === "event") {
    return assigneeName ? `【吹奏楽】 ${eventName} ${assigneeName}` : `【吹奏楽】 ${eventName}`;
  }
  if (type === "other") {
    return eventName ? `【吹奏楽】 ${eventName}` : "【吹奏楽】 その他";
  }
  return assigneeName ? `【吹奏楽】 ${assigneeName}` : "【吹奏楽】 通常練習";
};

const loadCalendarIcsEvents = async (): Promise<
  Array<{
    uid: string;
    summary: string;
    description: string;
    location: string;
    dtStart: string;
    dtEnd: string;
    updatedAt: Date | null;
  }>
> => {
  const scheduleDaysSnapshot = await firestore.collection("scheduleDays").get();
  const rows = await Promise.all(
    scheduleDaysSnapshot.docs.map(async (dayDoc) => {
      const dateKey = dayDoc.id;
      if (!isValidDateKey(dateKey)) return [] as Array<{
        uid: string;
        summary: string;
        description: string;
        location: string;
        dtStart: string;
        dtEnd: string;
        updatedAt: Date | null;
      }>;

      const sessionsSnapshot = await dayDoc.ref.collection("sessions").get();
      return sessionsSnapshot.docs
        .map((sessionDoc) => {
          const value = sessionDoc.data();
          const startTime = typeof value.startTime === "string" ? value.startTime : "";
          const endTime = typeof value.endTime === "string" ? value.endTime : "";
          if (!timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
            return null;
          }
          const updatedAtRaw = value.updatedAt;
          const updatedAt =
            updatedAtRaw && typeof updatedAtRaw === "object" && "toDate" in updatedAtRaw
              ? (updatedAtRaw as { toDate: () => Date }).toDate()
              : null;
          return {
            uid: `${dateKey}-${sessionDoc.id}@windoms-minamigaoka`,
            summary: getCalendarSessionTitle(value),
            description: typeof value.note === "string" ? value.note.trim() : "",
            location: typeof value.location === "string" ? value.location.trim() : "",
            dtStart: toIcsUtcDateTime(dateKey, startTime),
            dtEnd: toIcsUtcDateTime(dateKey, endTime),
            updatedAt: updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
          };
        })
        .filter(
          (
            item,
          ): item is {
            uid: string;
            summary: string;
            description: string;
            location: string;
            dtStart: string;
            dtEnd: string;
            updatedAt: Date | null;
          } => Boolean(item),
        );
    }),
  );

  return rows
    .flat()
    .sort((left, right) => {
      if (left.dtStart !== right.dtStart) return left.dtStart.localeCompare(right.dtStart);
      if (left.dtEnd !== right.dtEnd) return left.dtEnd.localeCompare(right.dtEnd);
      return left.uid.localeCompare(right.uid);
    });
};

const normalizeOptionalBoolean = (value: unknown): boolean | null => {
  if (value === true) return true;
  if (value === false) return false;
  return null;
};

const normalizeTodoKind = (value: unknown): "shared" | "private" =>
  value === "private" ? "private" : "shared";

const normalizeSharedTodoScopes = (value: Record<string, unknown>): string[] => {
  const arrayScopes = Array.isArray(value.sharedScopes)
    ? value.sharedScopes.filter(
        (scope): scope is string => typeof scope === "string" && todoSharedScopeValues.has(scope),
      )
    : [];
  if (arrayScopes.length > 0) {
    return [...new Set(arrayScopes)];
  }
  const legacyScope =
    typeof value.sharedScope === "string" && todoSharedScopeValues.has(value.sharedScope)
      ? value.sharedScope
      : "";
  return legacyScope ? [legacyScope] : [];
};

const getJstDateParts = (base = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const getPart = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  return {
    year,
    month,
    day,
    dayOfMonth: Number(day),
    dateKey: `${year}-${month}-${day}`,
    yearMonth: `${year}-${month}`,
    compactYearMonth: `${year}${month}`,
  };
};

const recurringOccurrenceKey = (templateId: string, yearMonth: string) => `${templateId}:${yearMonth}`;
const recurringTodoDocId = (templateId: string, compactYearMonth: string) =>
  `recurring_${templateId}_${compactYearMonth}`;

const getRecurringExecutionDayOfMonth = (year: string, month: string, dayOfMonth: number): number => {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth)) {
    return dayOfMonth;
  }
  const lastDay = new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate();
  if (!Number.isInteger(lastDay) || lastDay < 1) {
    return dayOfMonth;
  }
  return Math.min(Math.max(dayOfMonth, 1), lastDay);
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
  type: "normal" | "self" | "event" | "other";
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
  const type = (calendarSessionTypes.has(typeValue) ? typeValue : "normal") as
    | "normal"
    | "self"
    | "event"
    | "other";
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
  if ((type === "event" || type === "other") && !eventName) {
    throw new HttpsError("invalid-argument", "予定名を入力してください。");
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

export const resetMemberTemporaryPassword = onCall(async (request) => {
  await assertAdmin(request.auth);

  const memberId = typeof request.data?.memberId === "string" ? request.data.memberId.trim() : "";
  const newPassword =
    typeof request.data?.newPassword === "string" ? request.data.newPassword.trim() : "";

  if (!memberId || !newPassword) {
    throw new HttpsError("invalid-argument", "memberId and newPassword are required.");
  }

  const passwordError = validateTemporaryPassword(newPassword);
  if (passwordError) {
    throw new HttpsError("invalid-argument", passwordError, {
      errorCode: "auth/weak-password",
      errorMessage: passwordError,
    });
  }

  const memberRef = firestore.collection("members").doc(memberId);
  const memberSnapshot = await memberRef.get();
  if (!memberSnapshot.exists) {
    throw new HttpsError("not-found", "Target member was not found.");
  }

  const authUid = typeof memberSnapshot.get("authUid") === "string" ? String(memberSnapshot.get("authUid")).trim() : "";
  if (!authUid) {
    throw new HttpsError("failed-precondition", "Target member does not have linked authUid.", {
      errorCode: "auth/member-auth-not-linked",
      errorMessage: "members.authUid が未設定のため再設定できません。",
    });
  }

  try {
    await adminAuth.updateUser(authUid, { password: newPassword });
    await memberRef.set(
      {
        updatedAt: new Date(),
      },
      { merge: true },
    );
    return { authUid };
  } catch (error) {
    const errorCode =
      typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? String((error as { code: string }).code)
        : "";
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorCode === "auth/user-not-found") {
      throw new HttpsError("not-found", "Auth user was not found.", {
        errorCode,
        errorMessage,
      });
    }
    if (errorCode === "auth/invalid-password" || errorCode === "auth/weak-password") {
      throw new HttpsError("invalid-argument", "仮パスワードが Firebase の要件を満たしていません。", {
        errorCode,
        errorMessage,
      });
    }
    logger.error("resetMemberTemporaryPassword failed", {
      projectId: serverProjectId || "(unknown)",
      functionsRegion,
      authUid: request.auth?.uid ?? "",
      targetAuthUid: authUid,
      errorCode,
      errorMessage,
    });
    throw new HttpsError("internal", "仮パスワードの再設定に失敗しました。", {
      errorCode: errorCode || "auth/reset-password-failed",
      errorMessage,
    });
  }
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

export const getCalendarIcsSubscription = onCall(async (request) => {
  await assertAdmin(request.auth);
  const token = await getOrCreateCalendarIcsToken();
  return {
    url: getCalendarIcsFeedUrl(token),
  };
});

export const calendarIcsFeed = onRequest(async (request, response) => {
  try {
    const token = typeof request.query.token === "string" ? request.query.token.trim() : "";
    if (!token) {
      response.status(400).type("text/plain; charset=utf-8").send("token is required");
      return;
    }

    const snapshot = await calendarIcsConfigRef.get();
    const expectedToken =
      snapshot.exists && typeof snapshot.get("token") === "string"
        ? String(snapshot.get("token")).trim()
        : "";

    if (!expectedToken || token !== expectedToken) {
      response.status(404).type("text/plain; charset=utf-8").send("not found");
      return;
    }

    const events = await loadCalendarIcsEvents();
    const dtStamp = toIcsDateStamp(new Date());
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Windoms//Calendar ICS//JA",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:南ヶ丘中学校吹奏楽クラブ",
      "X-WR-TIMEZONE:Asia/Tokyo",
    ];

    events.forEach((event) => {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${escapeIcsText(event.uid)}`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART:${event.dtStart}`);
      lines.push(`DTEND:${event.dtEnd}`);
      lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);
      if (event.description) {
        lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
      }
      if (event.location) {
        lines.push(`LOCATION:${escapeIcsText(event.location)}`);
      }
      if (event.updatedAt) {
        lines.push(`LAST-MODIFIED:${toIcsDateStamp(event.updatedAt)}`);
      }
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");

    response
      .status(200)
      .set("Content-Type", "text/calendar; charset=utf-8")
      .set("Content-Disposition", 'inline; filename="windoms-calendar.ics"')
      .set("Cache-Control", "private, max-age=300")
      .send(`${lines.join("\r\n")}\r\n`);
  } catch (error) {
    logger.error("calendarIcsFeed failed", {
      projectId: serverProjectId || "(unknown)",
      functionsRegion,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    response.status(500).type("text/plain; charset=utf-8").send("internal error");
  }
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
    eventName: payload.type === "event" || payload.type === "other" ? payload.eventName : "",
    dutyRequirement: payload.type === "self" || payload.type === "other" ? "watch" : "duty",
    requiresShift: payload.type !== "self" && payload.type !== "other",
    location: payload.location,
    assigneeFamilyId: payload.type === "other" ? "" : payload.assigneeFamilyId,
    assignees: [],
    assigneeNameSnapshot: payload.type === "other" ? "" : assigneeNameSnapshot,
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
    eventName: payload.type === "event" || payload.type === "other" ? payload.eventName : "",
    dutyRequirement: payload.type === "self" || payload.type === "other" ? "watch" : "duty",
    requiresShift: payload.type !== "self" && payload.type !== "other",
    location: payload.location,
    assigneeFamilyId: payload.type === "other" ? "" : payload.assigneeFamilyId,
    assigneeNameSnapshot: payload.type === "other" ? "" : assigneeNameSnapshot,
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

export const generateRecurringTodos = onSchedule(
  {
    schedule: "5 1 * * *",
    timeZone: "Asia/Tokyo",
  },
  async () => {
    const { year, month, dateKey, dayOfMonth, yearMonth, compactYearMonth } = getJstDateParts();
    const templatesSnapshot = await firestore
      .collection("recurringTodoTemplates")
      .where("isActive", "==", true)
      .get();

    let createdCount = 0;
    let skippedCount = 0;

    for (const templateDoc of templatesSnapshot.docs) {
      const value = templateDoc.data() as Record<string, unknown>;
      const templateDayOfMonth =
        typeof value.dayOfMonth === "number" && Number.isFinite(value.dayOfMonth)
          ? value.dayOfMonth
          : Number(normalizeOptionalString(value.dayOfMonth));
      if (!Number.isInteger(templateDayOfMonth)) {
        skippedCount += 1;
        continue;
      }
      const executionDayOfMonth = getRecurringExecutionDayOfMonth(year, month, templateDayOfMonth);
      if (executionDayOfMonth !== dayOfMonth) {
        skippedCount += 1;
        continue;
      }

      const kind = normalizeTodoKind(value.kind);
      const title = normalizeOptionalString(value.title);
      const memo = normalizeOptionalString(value.memo);
      const createdByUid = normalizeOptionalString(value.createdByUid);
      const sharedScopes = normalizeSharedTodoScopes(value);

      if (!title) {
        logger.warn("generateRecurringTodos skipped template without title", {
          templateId: templateDoc.id,
          dateKey,
        });
        skippedCount += 1;
        continue;
      }

      if (kind === "shared" && sharedScopes.length === 0) {
        logger.warn("generateRecurringTodos skipped shared template without audiences", {
          templateId: templateDoc.id,
          dateKey,
        });
        skippedCount += 1;
        continue;
      }

      if (kind === "private" && !createdByUid) {
        logger.warn("generateRecurringTodos skipped private template without creator", {
          templateId: templateDoc.id,
          dateKey,
        });
        skippedCount += 1;
        continue;
      }

      const occurrenceKey = recurringOccurrenceKey(templateDoc.id, yearMonth);
      const todoRef = firestore.collection("todos").doc(recurringTodoDocId(templateDoc.id, compactYearMonth));
      const createdAt = new Date().toISOString();

      try {
        await todoRef.create({
          kind,
          sharedScopes: kind === "shared" ? sharedScopes : [],
          sharedScope: kind === "shared" ? sharedScopes[0] ?? null : null,
          title,
          memo: memo || null,
          completed: false,
          createdAt,
          createdByUid: createdByUid || null,
          assigneeUid: null,
          dueDate: dateKey,
          related: null,
          sourceRecurringTodoId: templateDoc.id,
          occurrenceKey,
          updatedAt: new Date(),
        });
        createdCount += 1;
      } catch (error) {
        const code =
          typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
        if (code === "already-exists" || code === "6") {
          skippedCount += 1;
          continue;
        }
        logger.error("generateRecurringTodos failed for template", {
          templateId: templateDoc.id,
          occurrenceKey,
          code,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    }

    logger.info("generateRecurringTodos completed", {
      dateKey,
      createdCount,
      skippedCount,
      templateCount: templatesSnapshot.size,
    });
  },
);
