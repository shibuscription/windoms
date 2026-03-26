import { useMemo, useRef, useState } from "react";
import type { DemoData, Score } from "../types";
import { buildScoreSearchHaystack, tokenizeScoreSearch } from "../scores/search";

type ScorePageProps = {
  data: DemoData;
  updateScores: (updater: (prev: Score[]) => Score[]) => void;
  saveScore: (score: Score, previousId?: string | null) => Promise<void>;
  isAdmin: boolean;
  isLoading: boolean;
  loadError: string;
};

type SortKey = "no" | "title";
type SortOrder = "asc" | "desc";

type ScoreFormState = {
  no: string;
  title: string;
  publisher: string;
  duration: string;
  productCode: string;
  note: string;
};

const display = (value?: string): string => value ?? "";

const displayTopRow = (value?: string): string => {
  const normalized = value ?? "";
  return normalized.trim() === "" ? "\u00A0" : normalized;
};

const toOptional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
};

const nextScoreNo = (scores: Score[]): number => {
  const maxNo = scores.reduce((max, score) => Math.max(max, score.no), 0);
  return maxNo + 1;
};

const emptyForm = (): ScoreFormState => ({
  no: "",
  title: "",
  publisher: "",
  duration: "",
  productCode: "",
  note: "",
});

const toForm = (score: Score): ScoreFormState => ({
  no: String(score.no),
  title: score.title,
  publisher: score.publisher ?? "",
  duration: score.duration ?? "",
  productCode: score.productCode ?? "",
  note: score.note ?? "",
});

export function ScorePage({
  data,
  updateScores,
  saveScore,
  isAdmin,
  isLoading,
  loadError,
}: ScorePageProps) {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("no");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScoreFormState>(() => emptyForm());
  const [errors, setErrors] = useState<{ no?: string; title?: string }>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tokens = useMemo(() => tokenizeScoreSearch(query), [query]);

  const filteredScores = useMemo(() => {
    if (tokens.length === 0) return data.scores;

    return data.scores.filter((score) => {
      const haystack = buildScoreSearchHaystack(score);
      return tokens.every((token) => haystack.includes(token));
    });
  }, [data.scores, tokens]);

  const visibleScores = useMemo(() => {
    const rows = [...filteredScores];
    rows.sort((a, b) => {
      if (sortKey === "no") {
        return sortOrder === "asc" ? a.no - b.no : b.no - a.no;
      }
      const compared = a.title.localeCompare(b.title, "ja");
      return sortOrder === "asc" ? compared : -compared;
    });
    return rows;
  }, [filteredScores, sortKey, sortOrder]);

  const setSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortOrder("asc");
  };

  const openCreate = () => {
    if (!isAdmin) return;
    setMode("create");
    setEditingId(null);
    setForm(emptyForm());
    setErrors({});
    setSubmitError("");
    setIsSubmitting(false);
  };

  const openEdit = (score: Score) => {
    if (!isAdmin) return;
    setMode("edit");
    setEditingId(score.id);
    setForm(toForm(score));
    setErrors({});
    setSubmitError("");
    setIsSubmitting(false);
  };

  const closeModal = () => {
    setMode(null);
    setEditingId(null);
    setErrors({});
    setSubmitError("");
    setIsSubmitting(false);
  };

  const submit = async () => {
    if (!isAdmin) return;

    const title = form.title.trim();
    const parsedNo = Number(form.no.trim());
    const nextErrors: { no?: string; title?: string } = {};

    if (!title) nextErrors.title = "曲名は必須です。";

    const resolvedNo =
      form.no.trim() === "" || !Number.isFinite(parsedNo) || parsedNo <= 0
        ? nextScoreNo(data.scores)
        : Math.floor(parsedNo);

    const duplicateNo = data.scores.some(
      (score) => score.no === resolvedNo && score.id !== editingId,
    );
    if (duplicateNo) nextErrors.no = "No が重複しています。";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const nextScore: Score = {
      id: String(resolvedNo),
      no: resolvedNo,
      title,
      publisher: toOptional(form.publisher),
      duration: toOptional(form.duration),
      productCode: toOptional(form.productCode),
      note: toOptional(form.note),
    };

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await saveScore(nextScore, mode === "edit" ? editingId : null);

      updateScores((prev) => {
        const remaining = prev.filter((score) => score.id !== editingId && score.id !== nextScore.id);
        return [nextScore, ...remaining];
      });

      closeModal();
    } catch {
      setSubmitError("楽譜データの保存に失敗しました。通信状態を確認して再度お試しください。");
      setIsSubmitting(false);
    }
  };

  const sortArrow = (key: SortKey): string => {
    if (sortKey !== key) return "";
    return sortOrder === "asc" ? "▲" : "▼";
  };

  return (
    <section className="card scores-page">
      <header className="scores-header">
        <h1>楽譜</h1>
        {isAdmin && (
          <button type="button" className="button button-small" onClick={openCreate}>
            ＋追加
          </button>
        )}
      </header>

      <label className="scores-search-field">
        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="曲名 / 出版社 / 品番 / 備考で検索"
        />
        {query && (
          <button
            type="button"
            className="scores-search-clear"
            aria-label="検索欄をクリア"
            title="クリア"
            onClick={() => {
              setQuery("");
              searchInputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
      </label>

      <div className="scores-table-wrap">
        <table className="scores-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="scores-sort-button" onClick={() => setSort("no")}>
                  No {sortArrow("no")}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="scores-sort-button"
                  onClick={() => setSort("title")}
                >
                  曲名・出版社 {sortArrow("title")}
                </button>
              </th>
              <th>演奏時間・品番</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3}>読み込み中…</td>
              </tr>
            )}
            {!isLoading && loadError && (
              <tr>
                <td colSpan={3} className="field-error">
                  {loadError}
                </td>
              </tr>
            )}
            {!isLoading &&
              !loadError &&
              visibleScores.map((score) => (
                <tr
                  key={score.id}
                  onClick={isAdmin ? () => openEdit(score) : undefined}
                  className={isAdmin ? "scores-row" : "scores-row scores-row-readonly"}
                >
                  <td className="scores-no">{score.no}</td>
                  <td>
                    <p className="scores-main">{display(score.title)}</p>
                    <p className="scores-sub">{display(score.publisher)}</p>
                  </td>
                  <td>
                    <p className="scores-main">{displayTopRow(score.duration)}</p>
                    <p className="scores-sub">{display(score.productCode)}</p>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!isLoading && !loadError && visibleScores.length === 0 && (
        <p className="muted">表示できる楽譜がありません。seed 実行後に再度確認してください。</p>
      )}

      {mode && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeModal}>
          <section
            className="modal-panel purchases-create-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="閉じる"
              title="閉じる"
              onClick={closeModal}
            >
              ×
            </button>
            <h3>{mode === "create" ? "楽譜を追加" : "楽譜を編集"}</h3>

            <label>
              No
              <input
                type="number"
                min={1}
                value={form.no}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, no: event.target.value }));
                  setErrors((prev) => ({ ...prev, no: undefined }));
                }}
                placeholder="未入力なら最大+1を自動採番"
              />
              {errors.no && <span className="field-error">{errors.no}</span>}
            </label>

            <label>
              曲名
              <input
                value={form.title}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, title: event.target.value }));
                  setErrors((prev) => ({ ...prev, title: undefined }));
                }}
              />
              {errors.title && <span className="field-error">{errors.title}</span>}
            </label>

            <label>
              出版社
              <input
                value={form.publisher}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, publisher: event.target.value }))
                }
              />
            </label>

            <label>
              演奏時間
              <input
                value={form.duration}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, duration: event.target.value }))
                }
                placeholder="例: 4:20"
              />
            </label>

            <label>
              品番
              <input
                value={form.productCode}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, productCode: event.target.value }))
                }
              />
            </label>

            <label>
              備考
              <textarea
                value={form.note}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </label>

            {submitError && <p className="field-error">{submitError}</p>}

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeModal}>
                キャンセル
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void submit()}
                disabled={isSubmitting}
              >
                保存
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
