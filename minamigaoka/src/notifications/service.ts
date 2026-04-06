import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db, hasFirebaseAppConfig } from "../config/firebase";
import type { MemberRecord } from "../members/types";
import type {
  SendSystemNotificationInput,
  SystemNotificationRecord,
  UserNotificationRecord,
} from "./types";

const ensureDb = () => {
  if (!db || !hasFirebaseAppConfig) {
    throw new Error("Firebase の設定が不十分なため通知機能を利用できません。");
  }
};

const notificationsCollection = (uid: string) =>
  collection(doc(collection(db!, "users"), uid), "notifications");

const systemNotificationsCollection = () => collection(db!, "systemNotifications");

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
    throw new Error("通知先ユーザーが見つかりません。");
  }

  const systemNotificationRef = doc(systemNotificationsCollection());
  const batch = writeBatch(db!);

  batch.set(systemNotificationRef, {
    title: input.title.trim(),
    body: input.body.trim(),
    audienceScope: input.audienceScope,
    audienceUserUids:
      input.audienceScope === "individual" ? recipientUids : [],
    recipientCount: recipientUids.length,
    senderUid: input.senderUid,
    senderName: input.senderName.trim(),
    createdAt: serverTimestamp(),
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
      sourceRecordId: systemNotificationRef.id,
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
    () => onError?.("通知送信履歴の読み込みに失敗しました。"),
  );
};
