import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type { MemberRecord } from "../members/types";
import type {
  NotificationHistoryRecord,
  SendSystemNotificationInput,
  SystemNotificationRecord,
  UserNotificationRecord,
} from "./types";

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig) {
    throw new Error("Firebase の設定が未完了のため通知機能は利用できません。");
  }
};

const notificationsCollection = (uid: string) =>
  collection(doc(collection(db!, "users"), uid), "notifications");

const systemNotificationsCollection = () => collection(db!, "systemNotifications");
const notificationHistoryCollection = () => collection(db!, "notificationHistory");

const toUserNotificationRecord = (
  id: string,
  value: Record<string, unknown>,
): UserNotificationRecord => ({
  id,
  type: typeof value.type === "string" ? value.type : "system",
  title: typeof value.title === "string" ? value.title : "",
  body: typeof value.body === "string" ? value.body : "",
  isRead: value.isRead === true,
  readAt: value.readAt ?? null,
  status: value.status === "resolved" ? "resolved" : "active",
  resolvedAt: value.resolvedAt ?? null,
  createdAt: value.createdAt ?? null,
  sourceModule: typeof value.sourceModule === "string" ? value.sourceModule : "",
  sourceEvent: typeof value.sourceEvent === "string" ? value.sourceEvent : "",
  sourceRecordId: typeof value.sourceRecordId === "string" ? value.sourceRecordId : "",
  linkType: value.linkType === "url" ? "url" : "none",
  linkUrl: typeof value.linkUrl === "string" ? value.linkUrl : "",
  senderUid: typeof value.senderUid === "string" ? value.senderUid : "",
  senderName: typeof value.senderName === "string" ? value.senderName : "",
});

const toSystemNotificationRecord = (
  id: string,
  value: Record<string, unknown>,
): SystemNotificationRecord => ({
  id,
  title: typeof value.title === "string" ? value.title : "",
  body: typeof value.body === "string" ? value.body : "",
  audienceScope:
    value.audienceScope === "admins" ||
    value.audienceScope === "parents" ||
    value.audienceScope === "children" ||
    value.audienceScope === "individual"
      ? value.audienceScope
      : "all",
  audienceUserUids: Array.isArray(value.audienceUserUids)
    ? value.audienceUserUids.filter((item): item is string => typeof item === "string")
    : [],
  recipientCount:
    typeof value.recipientCount === "number" && Number.isFinite(value.recipientCount)
      ? value.recipientCount
      : 0,
  createdAt: value.createdAt ?? null,
  senderUid: typeof value.senderUid === "string" ? value.senderUid : "",
  senderName: typeof value.senderName === "string" ? value.senderName : "",
});

const toNotificationHistoryRecord = (
  id: string,
  value: Record<string, unknown>,
): NotificationHistoryRecord => ({
  id,
  kind: value.kind === "auto" ? "auto" : "manual",
  sourceModule: typeof value.sourceModule === "string" ? value.sourceModule : "",
  sourceEvent: typeof value.sourceEvent === "string" ? value.sourceEvent : "",
  title: typeof value.title === "string" ? value.title : "",
  body: typeof value.body === "string" ? value.body : "",
  targetType:
    value.targetType === "all" ||
    value.targetType === "admins" ||
    value.targetType === "parents" ||
    value.targetType === "children" ||
    value.targetType === "individual"
      ? value.targetType
      : "unknown",
  targetSummary: typeof value.targetSummary === "string" ? value.targetSummary : "",
  targetUserIds: Array.isArray(value.targetUserIds)
    ? value.targetUserIds.filter((item): item is string => typeof item === "string")
    : [],
  recipientCount:
    typeof value.recipientCount === "number" && Number.isFinite(value.recipientCount)
      ? value.recipientCount
      : 0,
  createdAt: value.createdAt ?? null,
  createdByUid: typeof value.createdByUid === "string" ? value.createdByUid : "",
  createdByName: typeof value.createdByName === "string" ? value.createdByName : "",
  isCancelable: value.isCancelable === true,
  sourceRecordId: typeof value.sourceRecordId === "string" ? value.sourceRecordId : "",
  canceledAt: value.canceledAt ?? null,
  canceledByUid: typeof value.canceledByUid === "string" ? value.canceledByUid : "",
  canceledByName: typeof value.canceledByName === "string" ? value.canceledByName : "",
});

const selectAudienceMembers = (
  members: MemberRecord[],
  input: SendSystemNotificationInput,
): MemberRecord[] => {
  const activeMembers = members.filter(
    (member) => member.memberStatus === "active" && member.authUid.trim(),
  );

  if (input.audienceScope === "admins") {
    return activeMembers.filter(
      (member) => member.role === "admin" || member.adminRole === "admin",
    );
  }
  if (input.audienceScope === "parents") {
    return activeMembers.filter(
      (member) =>
        member.memberTypes.includes("parent") ||
        member.role === "parent" ||
        member.role === "officer",
    );
  }
  if (input.audienceScope === "children") {
    return activeMembers.filter(
      (member) => member.memberTypes.includes("child") || member.role === "child",
    );
  }
  if (input.audienceScope === "individual") {
    const selected = new Set(input.audienceUserUids.map((item) => item.trim()).filter(Boolean));
    return activeMembers.filter((member) => selected.has(member.authUid.trim()));
  }
  return activeMembers;
};

const summarizeAudience = (
  input: SendSystemNotificationInput,
  audienceMembers: MemberRecord[],
  recipientUids: string[],
): string => {
  if (input.audienceScope === "admins") return "管理者のみ";
  if (input.audienceScope === "parents") return "保護者のみ";
  if (input.audienceScope === "children") return "子どものみ";
  if (input.audienceScope === "all") return "全員";

  const names = audienceMembers
    .filter((member) => recipientUids.includes(member.authUid.trim()))
    .map((member) => member.displayName.trim())
    .filter(Boolean);
  return names.length > 0 ? names.join("、") : "個別ユーザー";
};

export const subscribeUserNotifications = (
  uid: string,
  callback: (rows: UserNotificationRecord[]) => void,
  onError?: (message: string) => void,
): (() => void) => {
  ensureDb();
  return onSnapshot(
    query(notificationsCollection(uid), orderBy("createdAt", "desc")),
    (snapshot) => {
      callback(
        snapshot.docs.map((item) =>
          toUserNotificationRecord(item.id, item.data() as Record<string, unknown>),
        ),
      );
    },
    () => onError?.("通知の読み込みに失敗しました。"),
  );
};

export const markNotificationAsRead = async (
  uid: string,
  notificationId: string,
): Promise<void> => {
  ensureDb();
  await updateDoc(doc(notificationsCollection(uid), notificationId), {
    isRead: true,
    readAt: serverTimestamp(),
  });
};

export const resolveNotification = async (
  uid: string,
  notificationId: string,
  markRead: boolean,
): Promise<void> => {
  ensureDb();
  await updateDoc(doc(notificationsCollection(uid), notificationId), {
    status: "resolved",
    resolvedAt: serverTimestamp(),
    ...(markRead
      ? {
          isRead: true,
          readAt: serverTimestamp(),
        }
      : {}),
  });
};

export const reopenNotification = async (
  uid: string,
  notificationId: string,
): Promise<void> => {
  ensureDb();
  await updateDoc(doc(notificationsCollection(uid), notificationId), {
    status: "active",
    resolvedAt: null,
  });
};

export const sendSystemNotification = async (
  input: SendSystemNotificationInput,
  members: MemberRecord[],
): Promise<{ recipientCount: number; systemNotificationId: string }> => {
  ensureDb();

  const audienceMembers = selectAudienceMembers(members, input);
  const recipientUids = Array.from(
    new Set(
      audienceMembers
        .map((member) => member.authUid.trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (recipientUids.length === 0) {
    throw new Error("通知対象ユーザーが見つかりません。");
  }

  const systemNotificationRef = doc(systemNotificationsCollection());
  const historyRef = doc(notificationHistoryCollection(), systemNotificationRef.id);
  const batch = writeBatch(db!);

  batch.set(systemNotificationRef, {
    title: input.title.trim(),
    body: input.body.trim(),
    audienceScope: input.audienceScope,
    audienceUserUids: input.audienceScope === "individual" ? recipientUids : [],
    recipientCount: recipientUids.length,
    senderUid: input.senderUid,
    senderName: input.senderName.trim(),
    createdAt: serverTimestamp(),
  });

  batch.set(historyRef, {
    kind: "manual",
    sourceModule: "system-notifications",
    sourceEvent: "manual_send",
    title: input.title.trim(),
    body: input.body.trim(),
    targetType: input.audienceScope,
    targetSummary: summarizeAudience(input, audienceMembers, recipientUids),
    targetUserIds: recipientUids,
    recipientCount: recipientUids.length,
    createdAt: serverTimestamp(),
    createdByUid: input.senderUid,
    createdByName: input.senderName.trim(),
    isCancelable: true,
    sourceRecordId: systemNotificationRef.id,
    canceledAt: null,
    canceledByUid: "",
    canceledByName: "",
  });

  recipientUids.forEach((uid) => {
    const notificationRef = doc(notificationsCollection(uid));
    batch.set(notificationRef, {
      type: "system",
      title: input.title.trim(),
      body: input.body.trim(),
      isRead: false,
      readAt: null,
      status: "active",
      resolvedAt: null,
      createdAt: serverTimestamp(),
      sourceModule: "system-notifications",
      sourceEvent: "manual_send",
      sourceRecordId: historyRef.id,
      linkType: "none",
      linkUrl: "",
      senderUid: input.senderUid,
      senderName: input.senderName.trim(),
    });
  });

  await batch.commit();

  return {
    recipientCount: recipientUids.length,
    systemNotificationId: systemNotificationRef.id,
  };
};

export const subscribeSystemNotifications = (
  callback: (rows: SystemNotificationRecord[]) => void,
  onError?: (message: string) => void,
): (() => void) => {
  ensureDb();
  return onSnapshot(
    query(systemNotificationsCollection(), orderBy("createdAt", "desc")),
    (snapshot) => {
      callback(
        snapshot.docs.map((item) =>
          toSystemNotificationRecord(item.id, item.data() as Record<string, unknown>),
        ),
      );
    },
    () => onError?.("手動通知送信記録の読み込みに失敗しました。"),
  );
};

export const subscribeNotificationHistory = (
  callback: (rows: NotificationHistoryRecord[]) => void,
  onError?: (message: string) => void,
): (() => void) => {
  ensureDb();
  return onSnapshot(
    query(notificationHistoryCollection(), orderBy("createdAt", "desc")),
    (snapshot) => {
      callback(
        snapshot.docs.map((item) =>
          toNotificationHistoryRecord(item.id, item.data() as Record<string, unknown>),
        ),
      );
    },
    () => onError?.("通知履歴の読み込みに失敗しました。"),
  );
};

export const cancelManualNotificationHistory = async (
  historyId: string,
): Promise<void> => {
  ensureDb();

  const relatedNotifications = await getDocs(
    query(
      collectionGroup(db!, "notifications"),
      where("sourceModule", "==", "system-notifications"),
      where("sourceRecordId", "==", historyId),
    ),
  );

  const batch = writeBatch(db!);
  batch.delete(doc(notificationHistoryCollection(), historyId));
  batch.delete(doc(systemNotificationsCollection(), historyId));
  relatedNotifications.docs.forEach((item) => {
    batch.delete(item.ref);
  });

  await batch.commit();
};
