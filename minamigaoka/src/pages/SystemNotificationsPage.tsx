import { useEffect, useMemo, useState } from "react";
import { subscribeMembers } from "../members/service";
import type { MemberRecord } from "../members/types";
import {
  sendSystemNotification,
  subscribeSystemNotifications,
} from "../notifications/service";
import type {
  NotificationAudienceScope,
  SystemNotificationRecord,
} from "../notifications/types";

type Props = {
  currentMember: MemberRecord | null;
  currentLoginId: string;
};

const TEXT = {
  title: "システム通知",
  description:
    "管理者がタイトル・本文・送信対象を指定して、通知センターへ手動通知を送信します。",
  targetLabel: "送信対象",
  targetPlaceholder: "送信対象を選択",
  titleLabel: "タイトル",
  bodyLabel: "本文",
  recipientsLabel: "対象ユーザー",
  send: "通知を送信する",
  sending: "送信中...",
  sent: "通知を送信しました。",
  recentTitle: "送信履歴",
  noHistory: "まだ通知送信履歴はありません。",
  noRecipients: "送信対象ユーザーが見つかりません。",
} as const;

const audienceOptions: Array<{ value: NotificationAudienceScope; label: string }> = [
  { value: "all", label: "全員" },
  { value: "admins", label: "管理者のみ" },
  { value: "parents", label: "保護者のみ" },
  { value: "children", label: "子どものみ" },
  { value: "individual", label: "個別ユーザー選択" },
];

const roleLabel = (member: MemberRecord): string => {
  if (member.role === "admin" || member.adminRole === "admin") return "管理者";
  if (member.memberTypes.includes("child") || member.role === "child") return "子ども";
  if (member.memberTypes.includes("parent") || member.role === "parent" || member.role === "officer") {
    return "保護者";
  }
  if (member.memberTypes.includes("teacher") || member.role === "teacher") return "先生";
  return member.role;
};

type FieldErrors = {
  title?: string;
  body?: string;
  audienceScope?: string;
  audienceUserUids?: string;
};

export function SystemNotificationsPage({ currentMember, currentLoginId }: Props) {
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [history, setHistory] = useState<SystemNotificationRecord[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [pageError, setPageError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceScope, setAudienceScope] = useState<NotificationAudienceScope>("all");
  const [audienceUserUids, setAudienceUserUids] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    try {
      return subscribeMembers((rows) => {
        setMembers(rows);
        setIsLoadingMembers(false);
      });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "通知対象ユーザーの読み込みに失敗しました。");
      setIsLoadingMembers(false);
      return undefined;
    }
  }, []);

  useEffect(() => {
    try {
      return subscribeSystemNotifications(
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
      setHistoryError(error instanceof Error ? error.message : "通知送信履歴の読み込みに失敗しました。");
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
    const map = new Map<string, { uid: string; label: string; sortLabel: string }>();
    members
      .filter((member) => member.memberStatus === "active" && member.authUid.trim())
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "ja"))
      .forEach((member) => {
        const uid = member.authUid.trim();
        if (map.has(uid)) return;
        map.set(uid, {
          uid,
          label: `${member.displayName} (${roleLabel(member)})`,
          sortLabel: member.displayName,
        });
      });
    return Array.from(map.values()).sort((left, right) => left.sortLabel.localeCompare(right.sortLabel, "ja"));
  }, [members]);

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
                const nextValue = event.target.value as NotificationAudienceScope;
                setAudienceScope(nextValue);
                setFieldErrors((current) => ({ ...current, audienceScope: "", audienceUserUids: "" }));
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
                setFieldErrors((current) => ({ ...current, title: "" }));
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
                setFieldErrors((current) => ({ ...current, body: "" }));
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
                <div className="system-notification-recipient-list">
                  {recipientOptions.map((option) => (
                    <label key={option.uid} className="system-notification-recipient-item">
                      <input
                        type="checkbox"
                        checked={audienceUserUids.includes(option.uid)}
                        onChange={(event) => {
                          toggleRecipient(option.uid, event.target.checked);
                          setFieldErrors((current) => ({ ...current, audienceUserUids: "" }));
                        }}
                      />
                      <span>{option.label}</span>
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
          <h2>{TEXT.recentTitle}</h2>
        </div>
        {historyError && <p className="field-error">{historyError}</p>}
        {isLoadingHistory ? (
          <p className="muted">送信履歴を読み込み中...</p>
        ) : history.length === 0 ? (
          <p className="muted">{TEXT.noHistory}</p>
        ) : (
          <div className="system-notification-history">
            {history.slice(0, 10).map((item) => (
              <article key={item.id} className="system-notification-history-card">
                <div className="system-notification-history-head">
                  <strong>{item.title}</strong>
                  <span className="muted">{item.recipientCount}人</span>
                </div>
                {item.body && <p>{item.body}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
