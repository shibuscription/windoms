import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { DemoData, DocCategory, DocMemo } from "../types";
import { renderMarkdownToHtml } from "../utils/markdown";

const DOC_CATEGORIES: DocCategory[] = [
  "運営",
  "会計",
  "シフト",
  "楽器",
  "楽譜",
  "イベント",
  "その他",
];

type DocsPageProps = {
  data: DemoData;
  updateDocs: (updater: (prev: DocMemo[]) => DocMemo[]) => void;
};

type DocsEditorProps = DocsPageProps & {
  mode: "new" | "edit";
};

const formatDateTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sortDocs = (docs: DocMemo[]): DocMemo[] =>
  docs
    .map((doc, index) => ({ doc, index }))
    .sort((a, b) => {
      if (Boolean(a.doc.pinned) !== Boolean(b.doc.pinned)) return a.doc.pinned ? -1 : 1;

      const aTime = a.doc.updatedAt ? Date.parse(a.doc.updatedAt) : Number.NaN;
      const bTime = b.doc.updatedAt ? Date.parse(b.doc.updatedAt) : Number.NaN;
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
      if (Number.isFinite(aTime) && !Number.isFinite(bTime)) return -1;
      if (!Number.isFinite(aTime) && Number.isFinite(bTime)) return 1;

      const idCompare = a.doc.id.localeCompare(b.doc.id);
      if (idCompare !== 0) return idCompare;
      return a.index - b.index;
    })
    .map((entry) => entry.doc);

const parseTags = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  );

export function DocsListPage({ data }: DocsPageProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const docs = data.docs ?? [];

  const filteredDocs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return sortDocs(docs).filter((doc) => {
      if (category && doc.category !== category) return false;
      if (!keyword) return true;
      return doc.title.toLowerCase().includes(keyword);
    });
  }, [docs, search, category]);

  return (
    <section className="card docs-page">
      <div className="docs-header">
        <h1>資料</h1>
        <button
          type="button"
          className="links-add-button"
          onClick={() => navigate("/docs/new")}
          aria-label="追加"
          title="追加"
        >
          ＋ 追加
        </button>
      </div>
      <p className="muted">Dropbox等の実体資料は外部管理。ここでは要点メモを管理します。</p>

      <section className="docs-filters">
        <label className="docs-filter-field">
          検索
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="タイトルで検索"
          />
        </label>
        <label className="docs-filter-field">
          カテゴリ
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">すべて</option>
            {DOC_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="docs-list">
        {filteredDocs.map((doc) => (
          <button
            key={doc.id}
            type="button"
            className="docs-card"
            onClick={() => navigate(`/docs/${doc.id}`)}
          >
            <div className="docs-card-top">
              <strong>{doc.title}</strong>
              {doc.pinned && <span className="docs-pin">PIN</span>}
            </div>
            <p className="docs-card-meta">
              <span>{doc.category ?? "カテゴリ未設定"}</span>
              <span>更新: {formatDateTime(doc.updatedAt)}</span>
            </p>
            {doc.tags && doc.tags.length > 0 && (
              <div className="docs-tags">
                {doc.tags.map((tag) => (
                  <span key={tag} className="docs-tag">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
        {filteredDocs.length === 0 && <p className="muted">該当するメモはありません。</p>}
      </div>
    </section>
  );
}

export function DocsEditorPage({ data, updateDocs, mode }: DocsEditorProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const source = mode === "edit" ? data.docs.find((item) => item.id === id) : null;
  const [title, setTitle] = useState(source?.title ?? "");
  const [body, setBody] = useState(source?.body ?? "");
  const [category, setCategory] = useState<DocCategory | "">((source?.category as DocCategory) ?? "");
  const [tagsInput, setTagsInput] = useState(source?.tags?.join(", ") ?? "");
  const [pinned, setPinned] = useState(Boolean(source?.pinned));
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});
  const handleCancel = () => {
    navigate(-1);
  };

  if (mode === "edit" && !source) {
    return (
      <section className="card docs-page">
        <h1>資料</h1>
        <p className="muted">対象メモが見つかりません。</p>
        <button type="button" className="button" onClick={() => navigate("/docs")}>
          一覧へ戻る
        </button>
      </section>
    );
  }

  const save = () => {
    setIsSaving(true);
    const nextErrors: { title?: string; body?: string } = {};
    if (!title.trim()) nextErrors.title = "タイトルは必須です";
    if (!body.trim()) nextErrors.body = "本文は必須です";
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.body) {
      setIsSaving(false);
      return;
    }

    const nextId = mode === "edit" ? source!.id : `doc-${Date.now()}`;
    const now = new Date().toISOString();
    const nextDoc: DocMemo = {
      id: nextId,
      title: title.trim(),
      body,
      category: category || undefined,
      tags: parseTags(tagsInput),
      pinned,
      updatedAt: now,
    };

    updateDocs((prev) =>
      mode === "edit" ? prev.map((item) => (item.id === nextId ? nextDoc : item)) : [nextDoc, ...prev],
    );
    navigate(`/docs/${nextId}`);
  };

  return (
    <section className="card docs-page">
      <div className="docs-header">
        <h1>{mode === "edit" ? "資料メモ編集" : "資料メモ追加"}</h1>
      </div>

      <label>
        タイトル
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setErrors((prev) => ({ ...prev, title: undefined }));
          }}
          placeholder="タイトル"
        />
        {errors.title && <span className="field-error">{errors.title}</span>}
      </label>

      <div className="field-grid">
        <label>
          カテゴリ
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as DocCategory | "")}
          >
            <option value="">未設定</option>
            {DOC_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          タグ（カンマ区切り）
          <input
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="例: 定演, 会計"
          />
        </label>
      </div>

      <label className="docs-pin-field">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(event) => setPinned(event.target.checked)}
        />
        ピン留めする
      </label>

      <div className="docs-editor-toggle">
        <button
          type="button"
          className={`button button-small ${!isPreview ? "" : "button-secondary"}`}
          onClick={() => setIsPreview(false)}
        >
          編集
        </button>
        <button
          type="button"
          className={`button button-small ${isPreview ? "" : "button-secondary"}`}
          onClick={() => setIsPreview(true)}
        >
          プレビュー
        </button>
      </div>

      {isPreview ? (
        <article
          className="docs-markdown docs-preview"
          dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(body) }}
        />
      ) : (
        <label>
          本文（Markdown）
          <textarea
            className="docs-body-input"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setErrors((prev) => ({ ...prev, body: undefined }));
            }}
            placeholder="Markdownで入力。Dropbox等のURLを貼り付けできます。"
          />
          {errors.body && <span className="field-error">{errors.body}</span>}
        </label>
      )}

      <div className="modal-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={handleCancel}
          disabled={isSaving}
        >
          キャンセル
        </button>
        <button type="button" className="button" onClick={save} disabled={isSaving}>
          {isSaving ? "保存中..." : "保存"}
        </button>
      </div>
    </section>
  );
}

export function DocsDetailPage({ data }: DocsPageProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const doc = data.docs.find((item) => item.id === id);

  if (!doc) {
    return (
      <section className="card docs-page">
        <h1>資料</h1>
        <p className="muted">対象メモが見つかりません。</p>
        <button type="button" className="button" onClick={() => navigate("/docs")}>
          一覧へ戻る
        </button>
      </section>
    );
  }

  return (
    <section className="card docs-page">
      <div className="docs-header">
        <h1>{doc.title}</h1>
      </div>
      <p className="docs-card-meta">
        <span>{doc.category ?? "カテゴリ未設定"}</span>
        <span>更新: {formatDateTime(doc.updatedAt)}</span>
      </p>
      {doc.tags && doc.tags.length > 0 && (
        <div className="docs-tags">
          {doc.tags.map((tag) => (
            <span key={tag} className="docs-tag">
              #{tag}
            </span>
          ))}
        </div>
      )}
      <article
        className="docs-markdown"
        dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(doc.body) }}
      />
      <div className="modal-actions">
        <button type="button" className="button button-secondary" onClick={() => navigate("/docs")}>
          一覧へ
        </button>
        <button type="button" className="button" onClick={() => navigate(`/docs/${doc.id}/edit`)}>
          編集
        </button>
      </div>
    </section>
  );
}
