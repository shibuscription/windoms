import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LinkifiedText } from "../components/LinkifiedText";
import { ReceiptImagePicker } from "../components/ReceiptImagePicker";
import { useReceiptPreviews } from "../hooks/useReceiptPreviews";
import type { DemoData, LunchRecord } from "../types";
import { isValidDateKey, todayDateKey, weekdayTone } from "../utils/date";

type LunchPageProps = {
  data: DemoData;
  currentUid: string;
  demoRole: "admin" | "parent";
  isLoading: boolean;
  loadError: string;
  createLunchRecord: (input: {
    lunchRecord: Omit<LunchRecord, "id">;
    files?: File[];
    createReimbursement?: boolean;
  }) => Promise<void>;
};

type LunchDraft = {
  title: string;
  amount: string;
  purchasedAt: string;
  memo: string;
};

const toDateInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toIsoFromInput = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const toDateKeyFromIso = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return todayDateKey();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const formatDateWithWeekday = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("ja-JP", { weekday: "short" });
  return `${dateKey}（${weekday}）`;
};

const formatShortDateWithWeekday = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("ja-JP", { weekday: "short" });
  return `${month}/${String(day).padStart(2, "0")}(${weekday})`;
};

const createInitialDraft = (): LunchDraft => ({
  title: "お弁当",
  amount: "",
  purchasedAt: toDateInputValue(new Date()),
  memo: "",
});

const resolveDisplayName = (data: DemoData, uid?: string, fallback = "未定"): string => {
  if (!uid) return fallback;
  const user = data.users[uid];
  return user?.displayName?.trim() || fallback;
};

const resolveDutyName = (data: DemoData, record: LunchRecord): string => {
  if (record.dutyHouseholdId) {
    return data.households[record.dutyHouseholdId]?.label ?? record.dutyHouseholdId;
  }
  if (record.dutyMemberId) {
    return resolveDisplayName(data, record.dutyMemberId, record.dutyMemberId);
  }
  return resolveDisplayName(data, record.buyer, record.buyer);
};

const resolveBuyerName = (data: DemoData, record: LunchRecord): string =>
  resolveDisplayName(data, record.buyer, record.buyer);

export function LunchPage({
  data,
  currentUid,
  demoRole,
  isLoading,
  loadError,
  createLunchRecord,
}: LunchPageProps) {
  const [searchParams] = useSearchParams();
  const fallbackDate = todayDateKey();
  const queryDate = searchParams.get("date") ?? "";
  const targetDate = queryDate && isValidDateKey(queryDate) ? queryDate : fallbackDate;
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMemoDetailsOpen, setIsMemoDetailsOpen] = useState(false);
  const [isReceiptDetailsOpen, setIsReceiptDetailsOpen] = useState(false);
  const [draft, setDraft] = useState<LunchDraft>(createInitialDraft);
  const [errors, setErrors] = useState<{ title?: string; amount?: string; purchasedAt?: string }>({});
  const [detailTarget, setDetailTarget] = useState<LunchRecord | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    previews: receiptPreviews,
    addFiles: addReceiptFiles,
    removePreview: removeReceiptPreview,
    clearPreviews: clearReceiptPreviews,
  } = useReceiptPreviews();

  const sortedRecords = useMemo(
    () => [...data.lunchRecords].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
    [data.lunchRecords],
  );

  const upcomingLunchDuties = useMemo(() => {
    return Object.entries(data.scheduleDays)
      .filter(([dateKey]) => dateKey >= targetDate)
      .flatMap(([dateKey, day]) =>
        day.sessions
          .filter(
            (session) =>
              session.dutyRequirement === "duty" &&
              session.startTime >= "12:00" &&
              (weekdayTone(dateKey) === "sat" || weekdayTone(dateKey) === "sun"),
          )
          .map((session) => ({
            dateKey,
            dutyName:
              session.assigneeNameSnapshot ||
              resolveDisplayName(data, session.assignees[0], "未定"),
            isCurrentUserDuty: session.assignees.includes(currentUid),
          })),
      )
      .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
      .slice(0, 2);
  }, [currentUid, data, targetDate]);

  const amountNumber = Number(draft.amount || "0");
  const canSubmit =
    draft.title.trim().length > 0 &&
    draft.purchasedAt.trim().length > 0 &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    !isSubmitting;

  const openAddModal = () => {
    setDraft(createInitialDraft());
    setErrors({});
    setSubmitError("");
    setIsMemoDetailsOpen(false);
    setIsReceiptDetailsOpen(false);
    clearReceiptPreviews();
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setErrors({});
    setSubmitError("");
    clearReceiptPreviews();
  };

  const resolveDutyMemberId = (dateKey: string): string => {
    const day = data.scheduleDays[dateKey];
    const candidate = day?.sessions.find((session) => session.dutyRequirement === "duty")?.assignees[0];
    return candidate ?? currentUid;
  };

  const resolveDutyHouseholdId = (): string | undefined => data.users[currentUid]?.householdId;

  const submitLunchRecord = async () => {
    const nextErrors: { title?: string; amount?: string; purchasedAt?: string } = {};
    if (!draft.title.trim()) nextErrors.title = "タイトルは必須です";
    if (!draft.amount.trim() || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      nextErrors.amount = "金額は1以上の数値で入力してください";
    }
    if (!draft.purchasedAt.trim() || Number.isNaN(Date.parse(draft.purchasedAt))) {
      nextErrors.purchasedAt = "購入日は必須です";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const purchasedAtIso = toIsoFromInput(draft.purchasedAt);
    const dateKey = toDateKeyFromIso(purchasedAtIso);

    setIsSubmitting(true);
    setSubmitError("");
    try {
      await createLunchRecord({
        lunchRecord: {
          title: draft.title.trim(),
          amount: amountNumber,
          purchasedAt: purchasedAtIso,
          date: dateKey,
          buyer: currentUid,
          dutyMemberId: resolveDutyMemberId(dateKey),
          dutyHouseholdId: resolveDutyHouseholdId(),
          memo: draft.memo.trim() || undefined,
          paymentMethod: "reimbursement",
          reimbursementLinked: true,
          accountingSourceType: "lunch",
          accountingSourceId: "",
          accountingRequested: false,
        },
        files: receiptPreviews.map((preview) => preview.file),
        createReimbursement: true,
      });
      closeAddModal();
    } catch {
      setSubmitError("お弁当の保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card lunch-page">
      <header className="lunch-header">
        <h1>お弁当</h1>
        <button type="button" className="button button-small" onClick={openAddModal} disabled={isSubmitting}>
          ＋ 追加
        </button>
      </header>
      {loadError && <p className="field-error">{loadError}</p>}
      {submitError && <p className="field-error">{submitError}</p>}

      <div className="lunch-duty-board">
        <div className="lunch-duty-row">
          <span className="lunch-duty-label">次回のお弁当当番：</span>
          <span className="lunch-duty-value">
            {upcomingLunchDuties[0]
              ? `${formatShortDateWithWeekday(upcomingLunchDuties[0].dateKey)} ${upcomingLunchDuties[0].dutyName}`
              : "未定"}
            {upcomingLunchDuties[0]?.isCurrentUserDuty && <span className="lunch-you-badge">あなた</span>}
          </span>
        </div>
        <div className="lunch-duty-row">
          <span className="lunch-duty-label">その次：</span>
          <span className="lunch-duty-value">
            {upcomingLunchDuties[1]
              ? `${formatShortDateWithWeekday(upcomingLunchDuties[1].dateKey)} ${upcomingLunchDuties[1].dutyName}`
              : "未定"}
            {upcomingLunchDuties[1]?.isCurrentUserDuty && <span className="lunch-you-badge">あなた</span>}
          </span>
        </div>
      </div>

      <p className="muted">
        現在の標準導線は立替払いです。
        {demoRole === "admin" ? " 直接会計払いの入力項目は後続フェーズで整備します。" : ""}
      </p>

      <section className="lunch-grid">
        {sortedRecords.map((record) => {
          const thumbnail = record.imageUrls?.[0];
          return (
            <button
              key={record.id}
              type="button"
              className="lunch-tile"
              onClick={() => setDetailTarget(record)}
            >
              {thumbnail ? (
                <img src={thumbnail} alt={record.title} className="lunch-tile-image" />
              ) : (
                <div className="lunch-tile-placeholder">🍱</div>
              )}
              <span className="lunch-tile-meta">
                <span className="lunch-tile-date">
                  {formatDateWithWeekday(record.date || toDateKeyFromIso(record.purchasedAt))}
                </span>
                <span className="lunch-tile-duty">当番: {resolveDutyName(data, record)}</span>
              </span>
            </button>
          );
        })}
      </section>
      {isLoading && sortedRecords.length === 0 && <p className="muted">読み込み中...</p>}
      {!isLoading && sortedRecords.length === 0 && <p className="muted">お弁当記録はまだありません。</p>}

      <div className="modal-actions">
        <Link to={`/today?date=${targetDate}`} className="button button-secondary">
          Todayへ戻る
        </Link>
      </div>

      {isAddModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section
            className="modal-panel purchases-complete-modal lunch-add-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeAddModal}>
              ×
            </button>
            <h3>お弁当を追加</h3>
            <div className="lunch-add-modal-content">
              <label>
                タイトル
                <input
                  value={draft.title}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, title: event.target.value }));
                    setErrors((prev) => ({ ...prev, title: undefined }));
                  }}
                />
                {errors.title && <span className="field-error">{errors.title}</span>}
              </label>
              <label>
                金額
                <input
                  type="number"
                  min={1}
                  value={draft.amount}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, amount: event.target.value }));
                    setErrors((prev) => ({ ...prev, amount: undefined }));
                  }}
                />
                {errors.amount && <span className="field-error">{errors.amount}</span>}
              </label>
              <label>
                購入日
                <input
                  type="date"
                  value={draft.purchasedAt}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, purchasedAt: event.target.value }));
                    setErrors((prev) => ({ ...prev, purchasedAt: undefined }));
                  }}
                />
                {errors.purchasedAt && <span className="field-error">{errors.purchasedAt}</span>}
              </label>

              <details
                className="lunch-fold-details"
                open={isMemoDetailsOpen}
                onToggle={(event) => setIsMemoDetailsOpen(event.currentTarget.open)}
              >
                <summary>メモ（任意）</summary>
                <label className="lunch-fold-body">
                  <textarea
                    value={draft.memo}
                    onChange={(event) => setDraft((prev) => ({ ...prev, memo: event.target.value }))}
                  />
                </label>
              </details>

              <details
                className="lunch-fold-details"
                open={isReceiptDetailsOpen}
                onToggle={(event) => setIsReceiptDetailsOpen(event.currentTarget.open)}
              >
                <summary>レシート画像（任意・複数）</summary>
                <ReceiptImagePicker
                  title=""
                  previews={receiptPreviews}
                  onAddFiles={addReceiptFiles}
                  onRemovePreview={removeReceiptPreview}
                />
              </details>
            </div>
            <div className="modal-actions lunch-add-modal-footer">
              <button type="button" className="button button-secondary" onClick={closeAddModal} disabled={isSubmitting}>
                キャンセル
              </button>
              <button type="button" className="button" disabled={!canSubmit} onClick={() => void submitLunchRecord()}>
                追加
              </button>
            </div>
          </section>
        </div>
      )}

      {detailTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDetailTarget(null)}>
          <section className="modal-panel purchases-complete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setDetailTarget(null)}>
              ×
            </button>
            <h3>{detailTarget.title}</h3>
            <p className="muted">購入日: {formatDateWithWeekday(detailTarget.date || toDateKeyFromIso(detailTarget.purchasedAt))}</p>
            <p className="muted">購入者: {resolveBuyerName(data, detailTarget)}</p>
            <p className="muted">金額: {detailTarget.amount.toLocaleString()}円</p>
            <p className="muted">
              支払い方法: {detailTarget.paymentMethod === "direct_accounting" ? "直接会計払い" : "立替払い"}
            </p>
            {detailTarget.memo?.trim() && (
              <>
                <p className="muted">メモ</p>
                <p className="todo-memo-full">
                  <LinkifiedText text={detailTarget.memo} className="todo-linkified-text" />
                </p>
              </>
            )}
            {detailTarget.imageUrls && detailTarget.imageUrls.length > 0 && (
              <div className="purchase-receipt-grid">
                {detailTarget.imageUrls.map((imageUrl, index) => (
                  <article key={`${detailTarget.id}-${index}`} className="purchase-receipt-card">
                    <img src={imageUrl} alt={`${detailTarget.title}-${index + 1}`} className="purchase-receipt-image" />
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
