import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createDocMemo, deleteDocMemo, saveDocMemo, subscribeDocs } from "../docs/service";
import type { DocCategory, DocMemo } from "../types";
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

type DocsEditorProps = {
  mode: "new" | "edit";
  isAdmin: boolean;
};

type DocsListPageProps = {
  isAdmin: boolean;
};

type DocsDetailPageProps = {
  isAdmin: boolean;
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

const useDocsCollection = () => {
  const [docs, setDocs] = useState<DocMemo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    try {
      return subscribeDocs(
        (items) => {
          setDocs(items);
          setIsLoading(false);
          setLoadError("");
        },
        (error) => {
          setDocs([]);
          setIsLoading(false);
          setLoadError(error.message || "資料データの読み込みに失敗しました。");
        },
      );
    } catch (error) {
      setDocs([]);
      setIsLoading(false);
      setLoadError(error instanceof Error ? error.message : "資料データの読み込みに失敗しました。");
      return undefined;
    }
  }, []);

  return { docs, isLoading, loadError };
};

export function DocsListPage({ isAdmin }: DocsListPageProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const { docs, isLoading, loadError } = useDocsCollection();

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
        {isAdmin && (
          <button
            type="button"
            className="links-add-button"
            onClick={() => navigate("/docs/new")}
            aria-label="追加"
            title="追加"
          >
            ＋ 追加
          </button>
        )}
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

      {isLoading && <p className="muted">資料を読み込み中です。</p>}
      {!isLoading && loadError && <p className="field-error">{loadError}</p>}

      <div className="docs-list">
        {!isLoading &&
          !loadError &&
          filteredDocs.map((doc) => (
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
        {!isLoading && !loadError && filteredDocs.length === 0 && (
          <p className="muted">該当するメモはありません。</p>
        )}
      </div>
    </section>
  );
}

export function DocsEditorPage({ mode, isAdmin }: DocsEditorProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { docs, isLoading, loadError } = useDocsCollection();
  const source = mode === "edit" ? docs.find((item) => item.id === id) ?? null : null;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<DocCategory | "">("");
  const [tagsInput, setTagsInput] = useState("");
  const [pinned, setPinned] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<{ title?: string; body?: string }>({});

  useEffect(() => {
    if (isAdmin) return;
    if (mode === "edit" && id) {
      navigate(`/docs/${id}`, { replace: true });
      return;
    }
    navigate("/docs", { replace: true });
  }, [id, isAdmin, mode, navigate]);

  useEffect(() => {
    if (!source) return;
    setTitle(source.title);
    setBody(source.body);
    setCategory((source.category as DocCategory) ?? "");
    setTagsInput(source.tags?.join(", ") ?? "");
    setPinned(Boolean(source.pinned));
  }, [source]);

  const handleCancel = () => {
    navigate(-1);
  };

  if (mode === "edit" && isLoading) {
    return (
      <section className="card docs-page">
        <h1>資料</h1>
        <p className="muted">資料を読み込み中です。</p>
      </section>
    );
  }

  if (mode === "edit" && loadError) {
    return (
      <section className="card docs-page">
        <h1>資料</h1>
        <p className="field-error">{loadError}</p>
        <button type="button" className="button" onClick={() => navigate("/docs")}>
          一覧へ戻る
        </button>
      </section>
    );
  }

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

  const save = async () => {
    if (!isAdmin) return;
    setIsSaving(true);
    setSaveError("");
    const nextErrors: { title?: string; body?: string } = {};
    if (!title.trim()) nextErrors.title = "タイトルは必須です";
    if (!body.trim()) nextErrors.body = "本文は必須です";
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.body) {
      setIsSaving(false);
      return;
    }

    try {
      if (mode === "edit" && source) {
        await saveDocMemo({
          ...source,
          title: title.trim(),
          body,
          category: category || undefined,
          tags: parseTags(tagsInput),
          pinned,
        });
        navigate(`/docs/${source.id}`);
        return;
      }

      const nextId = await createDocMemo({
        title: title.trim(),
        body,
        category: category || undefined,
        tags: parseTags(tagsInput),
        pinned,
      });
      navigate(`/docs/${nextId}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
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

      {saveError && <p className="field-error">{saveError}</p>}

      <div className="modal-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={handleCancel}
          disabled={isSaving}
        >
          キャンセル
        </button>
        <button type="button" className="button" onClick={() => void save()} disabled={isSaving}>
          {isSaving ? "保存中..." : "保存"}
        </button>
      </div>
    </section>
  );
}

export function DocsDetailPage({ isAdmin }: DocsDetailPageProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { docs, isLoading, loadError } = useDocsCollection();
  const doc = docs.find((item) => item.id === id);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  if (isLoading) {
    return (
      <section className="card docs-page">
        <h1>資料</h1>
        <p className="muted">資料を読み込み中です。</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="card docs-page">
        <h1>資料</h1>
        <p className="field-error">{loadError}</p>
        <button type="button" className="button" onClick={() => navigate("/docs")}>
          一覧へ戻る
        </button>
      </section>
    );
  }

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

  const confirmDelete = async () => {
    if (!isAdmin) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteDocMemo(doc.id);
      navigate("/docs");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "削除に失敗しました。");
      setIsDeleting(false);
    }
  };

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
        {isAdmin && (
          <>
            <button type="button" className="button" onClick={() => navigate(`/docs/${doc.id}/edit`)}>
              編集
            </button>
            <button type="button" className="button button-secondary" onClick={() => setIsDeleteOpen(true)}>
              削除
            </button>
          </>
        )}
      </div>

      {isAdmin && isDeleteOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={() => setIsDeleteOpen(false)} aria-label="閉じる" title="閉じる">
              ×
            </button>
            <h3>資料を削除しますか？</h3>
            <p className="modal-summary">{doc.title}</p>
            {deleteError && <p className="field-error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void confirmDelete()} disabled={isDeleting}>
                {isDeleting ? "削除中..." : "削除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
