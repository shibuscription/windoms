import { useEffect, useMemo, useState } from "react";
import { createLinkItem, deleteLinkItem, saveLinkItem, subscribeLinks } from "../links/service";
import type { ExternalLinkItem, LinkRole, LinkType } from "../types";

type DemoMenuRole = "child" | "parent" | "admin";

const iconForType: Record<LinkType, string> = {
  photo: "🖼️",
  sns: "🌐",
  admin: "🛡️",
};

type LinkFormDraft = {
  title: string;
  url: string;
  type: LinkType;
  role: LinkRole;
};

type LinkFormErrors = {
  title?: string;
  url?: string;
};

const hostLabel = (item: ExternalLinkItem): string => {
  if (item.host) return item.host;
  try {
    return new URL(item.url).host;
  } catch {
    return item.url;
  }
};

type LinksPageProps = {
  menuRole: DemoMenuRole;
};

export function LinksPage({ menuRole }: LinksPageProps) {
  const isOfficer = menuRole === "admin";
  const [items, setItems] = useState<ExternalLinkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingId, setEditingId] = useState<string | "__new__" | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<LinkFormDraft>({
    title: "",
    url: "",
    type: "sns",
    role: "all",
  });
  const [errors, setErrors] = useState<LinkFormErrors>({});

  useEffect(() => {
    try {
      return subscribeLinks(
        (nextItems) => {
          setItems(nextItems);
          setIsLoading(false);
          setLoadError("");
        },
        (error) => {
          setItems([]);
          setIsLoading(false);
          setLoadError(error.message || "リンク集の読み込みに失敗しました。");
        },
      );
    } catch (error) {
      setItems([]);
      setIsLoading(false);
      setLoadError(error instanceof Error ? error.message : "リンク集の読み込みに失敗しました。");
      return undefined;
    }
  }, []);

  const visible = useMemo(
    () => items.filter((item) => item.role === "all" || isOfficer),
    [items, isOfficer],
  );
  const officerLinks = visible.filter((item) => item.role === "officer");
  const sharedLinks = visible.filter((item) => item.role === "all");

  const editingItem = editingId && editingId !== "__new__" ? items.find((item) => item.id === editingId) ?? null : null;
  const deleteTarget = deleteTargetId ? items.find((item) => item.id === deleteTargetId) ?? null : null;
  const isEditMode = Boolean(editingItem);

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback((current) => (current === message ? null : current)), 1800);
  };

  const openCreate = () => {
    if (!isOfficer) return;
    setEditingId("__new__");
    setForm({ title: "", url: "", type: "sns", role: "all" });
    setErrors({});
    setSubmitError("");
  };

  const openEdit = (item: ExternalLinkItem) => {
    if (!isOfficer) return;
    setEditingId(item.id);
    setForm({
      title: item.title,
      url: item.url,
      type: item.type,
      role: item.role,
    });
    setErrors({});
    setSubmitError("");
  };

  const closeEditor = () => {
    setEditingId(null);
    setErrors({});
    setSubmitError("");
    setIsSubmitting(false);
  };

  const validateForm = (): LinkFormErrors => {
    const next: LinkFormErrors = {};
    if (!form.title.trim()) next.title = "タイトルは必須です";
    const normalizedUrl = form.url.trim();
    if (!normalizedUrl) {
      next.url = "URLは必須です";
    } else if (!/^https?:\/\//i.test(normalizedUrl)) {
      next.url = "URLは http:// または https:// で入力してください";
    }
    return next;
  };

  const submitEditor = async () => {
    if (!isOfficer) return;
    const nextErrors = validateForm();
    setErrors(nextErrors);
    setSubmitError("");
    if (nextErrors.title || nextErrors.url) return;

    setIsSubmitting(true);
    try {
      if (isEditMode && editingItem) {
        await saveLinkItem({
          ...editingItem,
          title: form.title.trim(),
          url: form.url.trim(),
          type: form.type,
          role: form.role,
        });
        closeEditor();
        showFeedback("リンクを更新しました");
        return;
      }

      await createLinkItem({
        title: form.title.trim(),
        url: form.url.trim(),
        type: form.type,
        role: form.role,
      });
      closeEditor();
      showFeedback("追加しました");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "リンクの保存に失敗しました。");
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!isOfficer) return;
    if (!deleteTarget) return;
    try {
      await deleteLinkItem(deleteTarget.id);
      setDeleteTargetId(null);
      showFeedback("リンクを削除しました");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "リンクの削除に失敗しました。");
    }
  };

  const renderLinkCard = (item: ExternalLinkItem, officerCard = false) => (
    <div key={item.id} className={`link-card${officerCard ? " officer" : ""}`}>
      <a className="link-card-main" href={item.url} target="_blank" rel="noopener noreferrer">
        <span className="link-icon" aria-hidden="true">{iconForType[item.type]}</span>
        <span className="link-meta">
          <strong className="link-title">{item.title}</strong>
          <span className="link-sub">{hostLabel(item)}</span>
        </span>
        <span className="link-open" aria-hidden="true">↗</span>
      </a>
      {isOfficer && (
        <span className="link-card-actions">
          <button type="button" className="link-icon-button" onClick={() => openEdit(item)} aria-label={`${item.title}を編集`}>
            ✏️
          </button>
          <button type="button" className="link-icon-button" onClick={() => setDeleteTargetId(item.id)} aria-label={`${item.title}を削除`}>
            🗑
          </button>
        </span>
      )}
    </div>
  );

  return (
    <section className="card links-page">
      <div className="links-header">
        <h1>リンク集</h1>
        {isOfficer && (
          <button type="button" className="links-add-button" onClick={openCreate} aria-label="追加" title="追加">
            ＋ 追加
          </button>
        )}
      </div>
      {feedback && <p className="links-feedback">{feedback}</p>}
      {isLoading && <p className="muted">リンク集を読み込み中です。</p>}
      {!isLoading && loadError && <p className="field-error">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <div className="links-list">
            {sharedLinks.map((item) => renderLinkCard(item))}
          </div>

          {officerLinks.length > 0 && (
            <>
              <h2 className="links-officer-heading">役員専用</h2>
              <div className="links-list">
                {officerLinks.map((item) => renderLinkCard(item, true))}
              </div>
            </>
          )}

          {sharedLinks.length === 0 && officerLinks.length === 0 && (
            <p className="muted">表示できるリンクはありません。seed 実行後に再度確認してください。</p>
          )}
        </>
      )}

      {editingId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={closeEditor} aria-label="閉じる" title="閉じる">×</button>
            <h3>{isEditMode ? "リンクを編集" : "追加"}</h3>
            <label>
              タイトル
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="タイトル"
              />
              {errors.title && <span className="field-error">{errors.title}</span>}
            </label>
            <label>
              URL
              <input
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder="https://"
              />
              {errors.url && <span className="field-error">{errors.url}</span>}
            </label>
            <label>
              type
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({ ...current, type: event.target.value as LinkType }))
                }
              >
                <option value="photo">photo</option>
                <option value="sns">sns</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label>
              role
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({ ...current, role: event.target.value as LinkRole }))
                }
              >
                <option value="all">all</option>
                <option value="officer">officer</option>
              </select>
            </label>
            {submitError && <p className="field-error">{submitError}</p>}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeEditor} disabled={isSubmitting}>キャンセル</button>
              <button type="button" className="button" onClick={() => void submitEditor()} disabled={isSubmitting}>
                {isSubmitting ? "保存中..." : isEditMode ? "保存" : "追加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={() => setDeleteTargetId(null)} aria-label="閉じる" title="閉じる">×</button>
            <h3>リンクを削除しますか？</h3>
            <p className="modal-summary">{deleteTarget.title}</p>
            {submitError && <p className="field-error">{submitError}</p>}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setDeleteTargetId(null)}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void confirmDelete()}>
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
