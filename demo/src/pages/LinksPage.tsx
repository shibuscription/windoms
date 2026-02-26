import { useMemo, useState } from "react";

type DemoMenuRole = "child" | "parent" | "admin";
type LinkType = "photo" | "sns" | "admin";
type LinkRole = "all" | "officer";

type ExternalLinkItem = {
  id: string;
  title: string;
  url: string;
  type: LinkType;
  role: LinkRole;
  ogTitle?: string;
  ogImageUrl?: string;
  faviconUrl?: string;
  host?: string;
};

const DEMO_MENU_ROLE_KEY = "windoms_demo_role";

const linkItems: ExternalLinkItem[] = [
  { id: "photo-google", title: "Googleフォト", url: "https://photos.app.goo.gl/afyMZUo7YKrSaNHo9", type: "photo", role: "all" },
  { id: "sns-mamabrass-poppo", title: "ママブラス ぽっぽ（Instagram）", url: "https://www.instagram.com/mamabrass_poppo", type: "sns", role: "all" },
  { id: "sns-tono-wind", title: "東濃ウインドオーケストラ（Instagram）", url: "https://www.instagram.com/to_no_wind", type: "sns", role: "all" },
  { id: "sns-tokisho", title: "岐阜県立土岐商業高等学校吹奏楽団（Instagram）", url: "https://www.instagram.com/tokisho_w.e", type: "sns", role: "all" },
  { id: "sns-x-tajimi", title: "多治見高校吹奏楽部（X）", url: "https://x.com/tajimibrass", type: "sns", role: "all" },
  { id: "sns-gifu-fed", title: "岐阜県吹奏楽連盟", url: "https://www.ajba.or.jp/gifu/", type: "sns", role: "all" },
  { id: "admin-facility", title: "多治見市公共施設予約システム", url: "https://www2.pf489.com/tajimi/webR/", type: "admin", role: "officer" },
  { id: "admin-spoan", title: "スポあんネット", url: "https://www.spokyo.jp/", type: "admin", role: "officer" },
];

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

const readDemoMenuRole = (): DemoMenuRole => {
  const raw = window.localStorage.getItem(DEMO_MENU_ROLE_KEY);
  return raw === "child" || raw === "parent" || raw === "admin" ? raw : "admin";
};

const hostLabel = (item: ExternalLinkItem): string => {
  if (item.host) return item.host;
  try {
    return new URL(item.url).host;
  } catch {
    return item.url;
  }
};

export function LinksPage() {
  const role = readDemoMenuRole();
  const isOfficer = role === "admin";
  const [items, setItems] = useState<ExternalLinkItem[]>(linkItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState<LinkFormDraft>({
    title: "",
    url: "",
    type: "sns",
    role: "all"
  });
  const [errors, setErrors] = useState<LinkFormErrors>({});

  const visible = useMemo(
    () => items.filter((item) => item.role === "all" || isOfficer),
    [items, isOfficer]
  );
  const officerLinks = visible.filter((item) => item.role === "officer");
  const sharedLinks = visible.filter((item) => item.role === "all");

  const editingItem = editingId ? items.find((item) => item.id === editingId) ?? null : null;
  const deleteTarget = deleteTargetId ? items.find((item) => item.id === deleteTargetId) ?? null : null;
  const isEditMode = Boolean(editingItem);

  const showFeedback = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback((current) => (current === message ? null : current)), 1800);
  };

  const openCreate = () => {
    setEditingId("__new__");
    setForm({ title: "", url: "", type: "sns", role: "all" });
    setErrors({});
  };

  const openEdit = (item: ExternalLinkItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      url: item.url,
      type: item.type,
      role: item.role
    });
    setErrors({});
  };

  const closeEditor = () => {
    setEditingId(null);
    setErrors({});
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

  const submitEditor = () => {
    const nextErrors = validateForm();
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.url) return;

    if (isEditMode && editingItem) {
      setItems((current) =>
        current.map((item) =>
          item.id === editingItem.id
            ? {
                ...item,
                title: form.title.trim(),
                url: form.url.trim(),
                type: form.type,
                role: form.role
              }
            : item
        )
      );
      closeEditor();
      showFeedback("リンクを更新しました");
      return;
    }

    const nextItem: ExternalLinkItem = {
      id: `custom-${Date.now()}`,
      title: form.title.trim(),
      url: form.url.trim(),
      type: form.type,
      role: form.role
    };
    setItems((current) => [nextItem, ...current]);
    closeEditor();
    showFeedback("リンクを追加しました");
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTargetId(null);
    showFeedback("リンクを削除しました");
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
          <button type="button" className="links-add-button" onClick={openCreate} aria-label="リンクを追加">
            ➕
          </button>
        )}
      </div>
      <p className="muted">外部サービスへの導線（DEMO: レベル2）</p>
      {feedback && <p className="links-feedback">{feedback}</p>}

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

      {editingId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={closeEditor} aria-label="閉じる">×</button>
            <h3>{isEditMode ? "リンクを編集" : "リンクを追加"}</h3>
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
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeEditor}>キャンセル</button>
              <button type="button" className="button" onClick={submitEditor}>
                {isEditMode ? "保存する" : "追加する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={() => setDeleteTargetId(null)} aria-label="閉じる">×</button>
            <h3>リンクを削除しますか？</h3>
            <p className="modal-summary">{deleteTarget.title}</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setDeleteTargetId(null)}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={confirmDelete}>
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
