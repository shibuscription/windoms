export type NotificationStatus = "active" | "resolved";

export type NotificationLinkType = "none" | "url";

export type NotificationAudienceScope =
  | "all"
  | "admins"
  | "parents"
  | "children"
  | "individual";

export type NotificationHistoryKind = "manual" | "auto";

export type UserNotificationRecord = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  readAt: unknown;
  status: NotificationStatus;
  resolvedAt: unknown;
  createdAt: unknown;
  sourceModule: string;
  sourceEvent: string;
  sourceRecordId: string;
  linkType: NotificationLinkType;
  linkUrl: string;
  senderUid: string;
  senderName: string;
};

export type NotificationHistoryRecord = {
  id: string;
  kind: NotificationHistoryKind;
  sourceModule: string;
  sourceEvent: string;
  title: string;
  body: string;
  targetType: NotificationAudienceScope | "unknown";
  targetSummary: string;
  targetUserIds: string[];
  recipientCount: number;
  createdAt: unknown;
  createdByUid: string;
  createdByName: string;
  isCancelable: boolean;
  sourceRecordId: string;
  canceledAt: unknown;
  canceledByUid: string;
  canceledByName: string;
};

export type SystemNotificationRecord = {
  id: string;
  title: string;
  body: string;
  audienceScope: NotificationAudienceScope;
  audienceUserUids: string[];
  recipientCount: number;
  createdAt: unknown;
  senderUid: string;
  senderName: string;
};

export type SendSystemNotificationInput = {
  title: string;
  body: string;
  audienceScope: NotificationAudienceScope;
  audienceUserUids: string[];
  senderUid: string;
  senderName: string;
};
