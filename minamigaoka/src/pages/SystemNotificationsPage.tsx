import { useEffect, useMemo, useState } from "react";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { sortMembersForDisplay } from "../members/permissions";
import { subscribeMembers } from "../members/service";
import type { MemberRecord } from "../members/types";
import {
  cancelManualNotificationHistory,
  sendSystemNotification,
  subscribeNotificationHistory,
} from "../notifications/service";
import type {
  NotificationAudienceScope,
  NotificationHistoryKind,
  NotificationHistoryRecord,
} from "../notifications/types";

type Props = {
  currentMember: MemberRecord | null;
  currentLoginId: string;
};

type FieldErrors = {
  title?: string;
  body?: string;
  audienceScope?: string;
  audienceUserUids?: string;
};

const TEXT = {
  title: "システム通知",
  description:
    "管理者がタイトルと本文を指定して、対象ユーザーへ手動通知を送信します。送信後は通知履歴にも記録されます。",
  targetLabel: "送信対象",
  titleLabel: "タイトル",
  bodyLabel: "本文",
  recipientsLabel: "対象ユーザー",
  send: "通知を送信する",
  sending: "送信中...",
  sent: "通知を送信しました。",
  historyTitle: "通知履歴",
  noHistory: "この条件の通知履歴はありません。",
  noRecipients: "送信対象ユーザーが見つかりません。",
  filterAll: "すべて",
  filterManual: "手動",
  filterAuto: "自動",
  previousMonth: "前月",
  nextMonth: "翌月",
  detailTitle: "通知履歴詳細",
  cancelHistory: "通知を取り消す",
  canceling: "取消中...",
  canceled: "通知を取り消しました。",
} as const;

const audienceOptions: Array<{ value: NotificationAudienceScope; label: string }> = [
  { value: "all", label: "全員" },
  { value: "admins", label: "管理者のみ" },
  { value: "parents", label: "保護者のみ" },
  { value: "children", label: "子どものみ" },
  { value: "individual", label: "個別ユーザー選択" },
];

const monthLabel = (value: Date): string =>
  `${value.getFullYear()}年${String(value.getMonth() + 1).padStart(2, "0")}月`;

const monthKey = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;

const shiftMonth = (value: Date, delta: number): Date =>
  new Date(value.getFullYear(), value.getMonth() + delta, 1);

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as { toDate?: () => Date }).toDate?.();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value: unknown): string => {
  const date = toDate(value);
  if (!date) return "-";
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatHistoryKind = (value: NotificationHistoryKind): string =>
  value === "manual" ? "手動" : "自動";

const summarizeBody = (value: string): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || "本文はありません。";
};

const roleLabel = (member: MemberRecord): string => {
  if (member.role === "admin" || member.adminRole === "admin") return "管理者";
  if (member.memberTypes.includes("child") || member.role === "child") return "部員";
  if (member.memberTypes.includes("parent") || member.role === "parent" || member.role === "officer") {
    return "保護者";
  }
  if (member.memberTypes.includes("supporter")) return "サポーター";
  if (member.memberTypes.includes("obog")) return "先輩";
  if (member.memberTypes.includes("teacher") || member.role === "teacher") return "先生";
  return member.role;
};

export function SystemNotificationsPage({ currentMember, currentLoginId }: Props) {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [history, setHistory] = useState<NotificationHistoryRecord[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [pageError, setPageError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceScope, setAudienceScope] = useState<NotificationAudienceScope>("all");
  const [audienceUserUids, setAudienceUserUids] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [pendingCancelHistoryId, setPendingCancelHistoryId] = useState<string | null>(null);
  const [historyMonth, setHistoryMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [historyKindFilter, setHistoryKindFilter] = useState<"all" | NotificationHistoryKind>("all");

  useEffect(() => {
    try {
      return subscribeMembers((rows) => {
        setMembers(rows);
        setIsLoadingMembers(false);
      });
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : "通知対象ユーザーの読み込みに失敗しました。",
      );
      setIsLoadingMembers(false);
      return undefined;
    }
  }, []);

  useEffect(() => {
    try {
      return subscribeNotificationHistory(
        (rows) => {
          setHistory(rows);
          setIsLoadingHistory(false);
        },
        (message) => {
          setHistoryError(message);
          setIsLoadingHistory(false);
        },
      );
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "通知履歴の読み込みに失敗しました。",
      );
      setIsLoadingHistory(false);
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = window.setTimeout(() => setSuccessMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const recipientOptions = useMemo(() => {
    const ordered = sortMembersForDisplay(
      members.filter((member) => member.memberStatus === "active" && member.authUid.trim()),
      "all",
    );
    const unique = new Set<string>();
    return ordered.flatMap((member) => {
      const uid = member.authUid.trim();
      if (!uid || unique.has(uid)) return [];
      unique.add(uid);
      return [
        {
          uid,
          label: member.displayName,
          meta: roleLabel(member),
        },
      ];
    });
  }, [members]);

  const selectedHistory = useMemo(
    () => (selectedHistoryId ? history.find((item) => item.id === selectedHistoryId) ?? null : null),
    [history, selectedHistoryId],
  );

  const visibleHistory = useMemo(() => {
    const currentMonthKey = monthKey(historyMonth);
    return history.filter((item) => {
      const created = toDate(item.createdAt);
      if (!created || monthKey(created) !== currentMonthKey) return false;
      if (historyKindFilter === "all") return true;
      return item.kind === historyKindFilter;
    });
  }, [history, historyKindFilter, historyMonth]);

  const toggleRecipient = (uid: string, checked: boolean) => {
    setAudienceUserUids((current) =>
      checked ? Array.from(new Set([...current, uid])) : current.filter((item) => item !== uid),
    );
  };

  const submit = async () => {
    const nextErrors: FieldErrors = {};
    if (!title.trim()) nextErrors.title = "タイトルを入力してください。";
    if (!body.trim()) nextErrors.body = "本文を入力してください。";
    if (!audienceScope) nextErrors.audienceScope = "送信対象を選択してください。";
    if (audienceScope === "individual" && audienceUserUids.length === 0) {
      nextErrors.audienceUserUids = "対象ユーザーを選択してください。";
    }

    setFieldErrors(nextErrors);
    setPageError("");
    setSuccessMessage("");
    if (Object.keys(nextErrors).length > 0) return;

    setIsSending(true);
    try {
      await sendSystemNotification(
        {
          title,
          body,
          audienceScope,
          audienceUserUids,
          senderUid: currentMember?.authUid || currentLoginId,
          senderName: currentMember?.displayName || currentLoginId || "管理者",
        },
        members,
      );
      setTitle("");
      setBody("");
      setAudienceScope("all");
      setAudienceUserUids([]);
      setSuccessMessage(TEXT.sent);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "通知送信に失敗しました。");
    } finally {
      setIsSending(false);
    }
  };

  const handleCancelHistory = async () => {
    if (!pendingCancelHistoryId) return;
    setIsCanceling(true);
    setPageError("");
    try {
      await cancelManualNotificationHistory(pendingCancelHistoryId);
      if (selectedHistoryId === pendingCancelHistoryId) {
        setSelectedHistoryId(null);
      }
      setPendingCancelHistoryId(null);
      setSuccessMessage(TEXT.canceled);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "通知取消に失敗しました。");
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <section className="card settings-page">
      <div className="settings-page-header">
        <h1>{TEXT.title}</h1>
      </div>

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>{TEXT.title}</h2>
        </div>
        <p className="muted">{TEXT.description}</p>
        {pageError && <p className="field-error">{pageError}</p>}
        {successMessage && <div className="inline-toast">{successMessage}</div>}
        <div className="settings-form-grid">
          <label className="field-block">
            <span>{TEXT.targetLabel}</span>
            <select
              value={audienceScope}
              onChange={(event) => {
                setAudienceScope(event.target.value as NotificationAudienceScope);
                setFieldErrors((current) => ({
                  ...current,
                  audienceScope: undefined,
                  audienceUserUids: undefined,
                }));
              }}
            >
              {audienceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldErrors.audienceScope && <span className="field-error">{fieldErrors.audienceScope}</span>}
          </label>
          <label className="field-block">
            <span>{TEXT.titleLabel}</span>
            <input
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setFieldErrors((current) => ({ ...current, title: undefined }));
              }}
              placeholder="タイトルを入力"
            />
            {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
          </label>
          <label className="field-block">
            <span>{TEXT.bodyLabel}</span>
            <textarea
              className="system-notification-textarea"
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setFieldErrors((current) => ({ ...current, body: undefined }));
              }}
              placeholder="本文を入力"
            />
            {fieldErrors.body && <span className="field-error">{fieldErrors.body}</span>}
          </label>
          {audienceScope === "individual" && (
            <div className="field-block">
              <span>{TEXT.recipientsLabel}</span>
              {isLoadingMembers ? (
                <p className="muted">対象ユーザーを読み込み中...</p>
              ) : recipientOptions.length === 0 ? (
                <p className="field-error">{TEXT.noRecipients}</p>
              ) : (
                <div className="system-notification-recipient-list" role="group" aria-label={TEXT.recipientsLabel}>
                  {recipientOptions.map((option) => (
                    <label key={option.uid} className="system-notification-recipient-item">
                      <input
                        type="checkbox"
                        checked={audienceUserUids.includes(option.uid)}
                        onChange={(event) => {
                          toggleRecipient(option.uid, event.target.checked);
                          setFieldErrors((current) => ({ ...current, audienceUserUids: undefined }));
                        }}
                      />
                      <span className="system-notification-recipient-name">{option.label}</span>
                      <span className="system-notification-recipient-meta">{option.meta}</span>
                    </label>
                  ))}
                </div>
              )}
              {fieldErrors.audienceUserUids && (
                <span className="field-error">{fieldErrors.audienceUserUids}</span>
              )}
            </div>
          )}
        </div>
        <div className="settings-actions">
          <button type="button" className="button" onClick={() => void submit()} disabled={isSending}>
            {isSending ? TEXT.sending : TEXT.send}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>{TEXT.historyTitle}</h2>
        </div>
        <div className="system-notification-history-toolbar">
          <div className="system-notification-history-month-nav">
            <button
              type="button"
              className="button button-small button-secondary"
              onClick={() => setHistoryMonth((current) => shiftMonth(current, -1))}
            >
              {TEXT.previousMonth}
            </button>
            <strong>{monthLabel(historyMonth)}</strong>
            <button
              type="button"
              className="button button-small button-secondary"
              onClick={() => setHistoryMonth((current) => shiftMonth(current, 1))}
            >
              {TEXT.nextMonth}
            </button>
          </div>
          <div className="system-notification-history-filters">
            {[
              { value: "all" as const, label: TEXT.filterAll },
              { value: "manual" as const, label: TEXT.filterManual },
              { value: "auto" as const, label: TEXT.filterAuto },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`status-panel-tab ${historyKindFilter === option.value ? "active" : ""}`}
                onClick={() => setHistoryKindFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {historyError && <p className="field-error">{historyError}</p>}
        {isLoadingHistory ? (
          <p className="muted">通知履歴を読み込み中...</p>
        ) : visibleHistory.length === 0 ? (
          <p className="muted">{TEXT.noHistory}</p>
        ) : (
          <div className="system-notification-history">
            {visibleHistory.map((item) => (
              <button
                key={item.id}
                type="button"
                className="system-notification-history-card"
                onClick={() => setSelectedHistoryId(item.id)}
              >
                <div className="system-notification-history-head">
                  <strong>{item.title}</strong>
                  <span className="muted">{item.recipientCount}人</span>
                </div>
                <p className="system-notification-history-body">{summarizeBody(item.body)}</p>
                <p className="muted">{formatDateTime(item.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedHistory && (
        <div className="modal-backdrop modal-backdrop-front" onClick={() => setSelectedHistoryId(null)}>
          <section className="modal-panel todos-related-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              onClick={() => setSelectedHistoryId(null)}
            >
              ×
            </button>
            <h3>{TEXT.detailTitle}</h3>
            <p className="modal-context">{selectedHistory.title}</p>
            <p className="modal-summary">送信日時: {formatDateTime(selectedHistory.createdAt)}</p>
            <p className="modal-summary">種別: {formatHistoryKind(selectedHistory.kind)}</p>
            <p className="modal-summary">由来モジュール: {selectedHistory.sourceModule || "-"}</p>
            <p className="modal-summary">対象範囲: {selectedHistory.targetSummary || "-"}</p>
            <p className="modal-summary">人数: {selectedHistory.recipientCount}人</p>
            {selectedHistory.createdByName && (
              <p className="modal-summary">送信者: {selectedHistory.createdByName}</p>
            )}
            {selectedHistory.body?.trim() ? (
              <>
                <p className="modal-summary">本文</p>
                <p className="todo-memo-full">{selectedHistory.body}</p>
              </>
            ) : (
              <p className="muted">本文はありません。</p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSelectedHistoryId(null)}
              >
                閉じる
              </button>
              {selectedHistory.kind === "manual" && selectedHistory.isCancelable && (
                <button
                  type="button"
                  className="button events-danger-button"
                  onClick={() => setPendingCancelHistoryId(selectedHistory.id)}
                >
                  {TEXT.cancelHistory}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {pendingCancelHistoryId && (
        <ConfirmationDialog
          title="通知を取り消しますか？"
          message="この通知を取り消すと、配布済みの全ユーザー通知も削除されます。"
          summary="手動通知のみ取り消せます。すでに対応済の通知も対象です。"
          confirmLabel={isCanceling ? TEXT.canceling : TEXT.cancelHistory}
          danger
          busy={isCanceling}
          onClose={() => setPendingCancelHistoryId(null)}
          onConfirm={handleCancelHistory}
        />
      )}
    </section>
  );
}
