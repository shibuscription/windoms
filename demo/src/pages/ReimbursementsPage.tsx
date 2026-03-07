import { useMemo, useState } from "react";
import type { DemoData, Reimbursement, ReimbursementStatus } from "../types";
import { useAccountingStore } from "../accounting/useAccountingStore";
import { ReceiptImagePicker } from "../components/ReceiptImagePicker";
import { useReceiptPreviews } from "../hooks/useReceiptPreviews";
import { toDemoFamilyName } from "../utils/demoName";

type ReimbursementsPageProps = {
  data: DemoData;
  currentUid: string;
  demoRole: "admin" | "parent";
  updateReimbursements: (updater: (prev: Reimbursement[]) => Reimbursement[]) => void;
};

type ConfirmDialogState =
  | {
      mode: "markReceived" | "delete";
      reimbursement: Reimbursement;
    }
  | null;

const resolveReimbursementStatus = (
  paidByTreasurerAt?: string,
  receivedByBuyerAt?: string,
): ReimbursementStatus => {
  if (paidByTreasurerAt && receivedByBuyerAt) return "DONE";
  if (paidByTreasurerAt) return "PAID_BY_TREASURER";
  if (receivedByBuyerAt) return "RECEIVED_BY_BUYER";
  return "OPEN";
};

const toDateLabel = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ja-JP", { hour12: false });
};

const toDateTimeInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toIsoFromInput = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const createReimbursementId = (rows: Reimbursement[]): string => {
  const numbers = rows
    .map((row) => /^rb-(\d+)$/.exec(row.id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return "rb-001";
  const next = Math.max(...numbers) + 1;
  return `rb-${String(next).padStart(3, "0")}`;
};

type ReimbursementUiStatus = "unpaid" | "paid" | "done";
type ReimbursementTab = "unfinished" | "done";

const resolveUiStatus = (item: Reimbursement): ReimbursementUiStatus => {
  const status = resolveReimbursementStatus(item.paidByTreasurerAt, item.receivedByBuyerAt);
  if (status === "DONE") return "done";
  if (status === "PAID_BY_TREASURER") return "paid";
  return "unpaid";
};

const reimbursementStatusLabel: Record<ReimbursementUiStatus, string> = {
  unpaid: "未精算",
  paid: "支払済",
  done: "完了",
};

const isTabMatched = (status: ReimbursementUiStatus, tab: ReimbursementTab): boolean => {
  if (tab === "done") return status === "done";
  return status !== "done";
};

export function ReimbursementsPage({
  data,
  currentUid,
  demoRole,
  updateReimbursements,
}: ReimbursementsPageProps) {
  const { currentPeriod, addTransaction } = useAccountingStore();
  const [activeTab, setActiveTab] = useState<ReimbursementTab>("unfinished");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [paidModalTarget, setPaidModalTarget] = useState<Reimbursement | null>(null);
  const [shouldRecordAccountingExpense, setShouldRecordAccountingExpense] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createAmount, setCreateAmount] = useState("");
  const [createPurchasedAt, setCreatePurchasedAt] = useState(toDateTimeInputValue(new Date()));
  const [createMemo, setCreateMemo] = useState("");
  const [createErrors, setCreateErrors] = useState<{ title?: string; amount?: string; purchasedAt?: string }>({});
  const {
    previews: createReceiptPreviews,
    addFiles: addCreateReceiptFiles,
    removePreview: removeCreateReceiptPreview,
    clearPreviews: clearCreateReceiptPreviews,
  } = useReceiptPreviews();

  const isAdmin = demoRole === "admin";
  const visibleByRole = useMemo(
    () =>
      data.reimbursements.filter((item) => (isAdmin ? true : item.buyer === currentUid)),
    [currentUid, data.reimbursements, isAdmin],
  );
  const rows = useMemo(() => {
    return [...visibleByRole]
      .map((item) => ({ item, uiStatus: resolveUiStatus(item) }))
      .filter(({ uiStatus }) => isTabMatched(uiStatus, activeTab))
      .sort((a, b) => b.item.purchasedAt.localeCompare(a.item.purchasedAt));
  }, [activeTab, visibleByRole]);

  const openCreateModal = () => {
    setCreateTitle("");
    setCreateAmount("");
    setCreatePurchasedAt(toDateTimeInputValue(new Date()));
    setCreateMemo("");
    clearCreateReceiptPreviews();
    setCreateErrors({});
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateErrors({});
    clearCreateReceiptPreviews();
  };

  const submitCreate = () => {
    const nextErrors: { title?: string; amount?: string; purchasedAt?: string } = {};
    const amountNumber = Number(createAmount);
    if (!createTitle.trim()) nextErrors.title = "タイトルは必須です";
    if (!createAmount.trim() || !Number.isFinite(amountNumber) || amountNumber < 0) {
      nextErrors.amount = "金額は0以上の数値で入力してください";
    }
    if (!createPurchasedAt.trim() || Number.isNaN(Date.parse(createPurchasedAt))) {
      nextErrors.purchasedAt = "購入日は必須です";
    }
    if (Object.keys(nextErrors).length > 0) {
      setCreateErrors(nextErrors);
      return;
    }

    const purchasedAtIso = toIsoFromInput(createPurchasedAt);
    const receiptFilesMeta = createReceiptPreviews.map((item) => ({
      name: item.name,
      size: item.size,
      type: item.type,
    }));
    updateReimbursements((prev) => [
      {
        id: createReimbursementId(prev),
        title: createTitle.trim(),
        amount: amountNumber,
        purchasedAt: purchasedAtIso,
        buyer: currentUid,
        memo: createMemo.trim() || undefined,
        receipt: receiptFilesMeta.length > 0 ? `画像${receiptFilesMeta.length}件` : undefined,
        receiptFilesMeta: receiptFilesMeta.length > 0 ? receiptFilesMeta : undefined,
      },
      ...prev,
    ]);
    setActiveTab("unfinished");
    closeCreateModal();
  };

  const openMarkPaidModal = (item: Reimbursement) => {
    setPaidModalTarget(item);
    setShouldRecordAccountingExpense(true);
  };

  const closeMarkPaidModal = () => {
    setPaidModalTarget(null);
    setShouldRecordAccountingExpense(true);
  };

  const confirmMarkPaid = () => {
    if (!paidModalTarget) return;
    const now = new Date().toISOString();

    updateReimbursements((prev) =>
      prev.map((row) =>
        row.id === paidModalTarget.id && !row.paidByTreasurerAt
          ? { ...row, paidByTreasurerAt: now }
          : row,
      ),
    );

    if (shouldRecordAccountingExpense) {
      const accountKey = currentPeriod?.accounts[0]?.accountKey;
      const canRecord = Boolean(currentPeriod && currentPeriod.status === "editing" && accountKey);
      if (canRecord && currentPeriod) {
        addTransaction({
          periodId: currentPeriod.periodId,
          type: "expense",
          source: "reimbursement",
          date: now.slice(0, 10),
          amount: paidModalTarget.amount,
          subjectId: "EXPENSE_MISC",
          accountKey,
          memo: `[source:reimbursement] ${paidModalTarget.title} (${paidModalTarget.id})`,
        });
      }
    }

    closeMarkPaidModal();
  };

  const confirmDialogTitle = (() => {
    if (!confirmDialog) return "";
    if (confirmDialog.mode === "markReceived") return "領収済にしますか？";
    return "この立替を削除しますか？";
  })();

  const runConfirmAction = () => {
    if (!confirmDialog) return;
    const { reimbursement } = confirmDialog;
    if (confirmDialog.mode === "markReceived") {
      const now = new Date().toISOString();
      updateReimbursements((prev) =>
        prev.map((row) =>
          row.id === reimbursement.id && !row.receivedByBuyerAt
            ? { ...row, receivedByBuyerAt: now }
            : row,
        ),
      );
    } else {
      updateReimbursements((prev) => prev.filter((row) => row.id !== reimbursement.id));
    }
    setConfirmDialog(null);
  };

  return (
    <section className="card reimbursements-page">
      <header className="reimbursements-header">
        <h1>立替</h1>
        <button type="button" className="button button-small" onClick={openCreateModal}>
          ＋ 追加
        </button>
      </header>
      <div className="purchases-tabs">
        <button
          type="button"
          className={`members-tab ${activeTab === "unfinished" ? "active" : ""}`}
          onClick={() => setActiveTab("unfinished")}
        >
          未完了
        </button>
        <button
          type="button"
          className={`members-tab ${activeTab === "done" ? "active" : ""}`}
          onClick={() => setActiveTab("done")}
        >
          完了
        </button>
      </div>
      <div className="reimbursements-list">
        {rows.map(({ item, uiStatus }) => {
          const isBuyer = item.buyer === currentUid;
          const canMarkPaid = uiStatus === "unpaid" && isAdmin;
          const canMarkReceived = uiStatus === "paid" && isBuyer;
          const canDelete = uiStatus === "unpaid" && isBuyer;
          return (
            <article key={item.id} className="reimbursement-card">
              <div className="reimbursement-card-top">
                <strong>{item.title}</strong>
                <span className={`reimbursement-status ${uiStatus === "done" ? "done" : uiStatus}`}>
                  {reimbursementStatusLabel[uiStatus]}
                </span>
              </div>
              <p className="reimbursement-meta">
                <span>購入者: {toDemoFamilyName(data.users[item.buyer]?.displayName ?? item.buyer, item.buyer)}</span>
                <span>購入日: {toDateLabel(item.purchasedAt)}</span>
                <span>金額: {item.amount.toLocaleString()}円</span>
              </p>
              {item.receiptFilesMeta && item.receiptFilesMeta.length > 0 && (
                <p className="muted">領収書: 画像{item.receiptFilesMeta.length}件</p>
              )}
              {item.receipt && (!item.receiptFilesMeta || item.receiptFilesMeta.length === 0) && (
                <p className="muted">領収書: {item.receipt}</p>
              )}
              {item.relatedPurchaseRequestId && (
                <p className="muted">関連購入依頼: {item.relatedPurchaseRequestId}</p>
              )}
              {item.memo && <p className="muted">{item.memo}</p>}
              {(canMarkPaid || canMarkReceived) && (
                <div className="reimbursement-actions">
                  {canMarkPaid && (
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => openMarkPaidModal(item)}
                    >
                      支払済にする
                    </button>
                  )}
                  {canMarkReceived && (
                    <button
                      type="button"
                      className="button button-small button-secondary"
                      onClick={() => setConfirmDialog({ mode: "markReceived", reimbursement: item })}
                    >
                      領収済にする
                    </button>
                  )}
                </div>
              )}
              {canDelete && (
                <div className="reimbursement-delete-action">
                  <button
                    type="button"
                    className="link-icon-button"
                    aria-label="削除"
                    onClick={() => setConfirmDialog({ mode: "delete", reimbursement: item })}
                  >
                    🗑️
                  </button>
                </div>
              )}
              {(item.paidByTreasurerAt || item.receivedByBuyerAt) && (
                <p className="reimbursement-stamps muted">
                  会計支払: {toDateLabel(item.paidByTreasurerAt ?? "")} / 受領確認:{" "}
                  {toDateLabel(item.receivedByBuyerAt ?? "")}
                </p>
              )}
            </article>
          );
        })}
        {rows.length === 0 && (
          <p className="muted">
            {activeTab === "unfinished"
              ? "未完了の立替データはありません。"
              : "完了の立替データはありません。"}
          </p>
        )}
      </div>

      {isCreateModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeCreateModal}>
          <section className="modal-panel purchases-complete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeCreateModal}>
              ×
            </button>
            <h3>立替を追加</h3>
            <label>
              タイトル
              <input
                value={createTitle}
                onChange={(event) => {
                  setCreateTitle(event.target.value);
                  setCreateErrors((prev) => ({ ...prev, title: undefined }));
                }}
              />
              {createErrors.title && <span className="field-error">{createErrors.title}</span>}
            </label>
            <label>
              金額
              <input
                type="number"
                min={0}
                value={createAmount}
                onChange={(event) => {
                  setCreateAmount(event.target.value);
                  setCreateErrors((prev) => ({ ...prev, amount: undefined }));
                }}
              />
              {createErrors.amount && <span className="field-error">{createErrors.amount}</span>}
            </label>
            <label>
              購入日時
              <input
                type="datetime-local"
                value={createPurchasedAt}
                onChange={(event) => {
                  setCreatePurchasedAt(event.target.value);
                  setCreateErrors((prev) => ({ ...prev, purchasedAt: undefined }));
                }}
              />
              {createErrors.purchasedAt && <span className="field-error">{createErrors.purchasedAt}</span>}
            </label>
            <label>
              メモ（任意）
              <textarea value={createMemo} onChange={(event) => setCreateMemo(event.target.value)} />
            </label>

            <ReceiptImagePicker
              previews={createReceiptPreviews}
              onAddFiles={addCreateReceiptFiles}
              onRemovePreview={removeCreateReceiptPreview}
            />

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeCreateModal}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={submitCreate}>
                追加
              </button>
            </div>
          </section>
        </div>
      )}

      {paidModalTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeMarkPaidModal}>
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeMarkPaidModal}>
              ×
            </button>
            <h3>支払済にしますか？</h3>
            <p className="modal-summary">{paidModalTarget.title}</p>
            <p className="muted">金額: {paidModalTarget.amount.toLocaleString()}円</p>
            <p className="muted">購入者: {toDemoFamilyName(data.users[paidModalTarget.buyer]?.displayName ?? paidModalTarget.buyer, paidModalTarget.buyer)}</p>
            <p className="muted">購入日: {toDateLabel(paidModalTarget.purchasedAt)}</p>
            <label className="purchase-option-check">
              <input
                type="checkbox"
                checked={shouldRecordAccountingExpense}
                onChange={(event) => setShouldRecordAccountingExpense(event.target.checked)}
              />
              <span>会計に支出を記録する</span>
            </label>
            <p className="muted">会計側への反映は片方向で、逆同期は行いません。</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeMarkPaidModal}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={confirmMarkPaid}>
                支払済にする
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmDialog && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setConfirmDialog(null)}>
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setConfirmDialog(null)}>
              ×
            </button>
            <h3>{confirmDialogTitle}</h3>
            <p className="modal-summary">{confirmDialog.reimbursement.title}</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setConfirmDialog(null)}>
                キャンセル
              </button>
              <button
                type="button"
                className={`button ${confirmDialog.mode === "delete" ? "events-danger-button" : ""}`}
                onClick={runConfirmAction}
              >
                {confirmDialog.mode === "delete" ? "削除" : "確定"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
