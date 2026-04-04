import { useEffect, useMemo, useRef, useState } from "react";
import { LinkifiedText } from "../components/LinkifiedText";
import type { DemoData, PurchaseRequest } from "../types";
import { ReceiptImagePicker } from "../components/ReceiptImagePicker";
import { useReceiptPreviews } from "../hooks/useReceiptPreviews";
import { toDemoFamilyName } from "../utils/demoName";

type PurchaseTab = "open" | "bought";
type DemoRole = "admin" | "parent";

type PurchaseCreateDraft = {
  title: string;
  memo: string;
};

type PurchaseCompleteDraft = {
  itemName: string;
  quantity: string;
  amount: string;
  purchasedAt: string;
  recordToReimbursement: boolean;
  recordToAccounting: boolean;
};

type PurchasesPageProps = {
  data: DemoData;
  currentUid: string;
  demoRole: DemoRole;
  isLoading: boolean;
  loadError: string;
  createPurchaseRequest: (purchase: Omit<PurchaseRequest, "id">) => Promise<void>;
  completePurchaseRequest: (input: {
    purchase: PurchaseRequest;
    completedBy: string;
    itemName: string;
    quantity?: string;
    amount?: number;
    purchasedAt: string;
    files?: File[];
    createReimbursement?: boolean;
  }) => Promise<void>;
  deletePurchaseRequest: (purchaseId: string) => Promise<void>;
};

type PurchaseConfirmDialogState =
  | {
      mode: "delete";
      purchase: PurchaseRequest;
    }
  | null;

const toDateTimeLabel = (iso?: string): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ja-JP", { hour12: false });
};

const toDateTimeInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseDateValue = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const toIsoFromInput = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const statusLabel = (status: PurchaseRequest["status"]): string =>
  status === "OPEN" ? "未購入" : "購入済";

const createPurchaseDraft = (): PurchaseCreateDraft => ({
  title: "",
  memo: "",
});

export function PurchasesPage({
  data,
  currentUid,
  demoRole,
  isLoading,
  loadError,
  createPurchaseRequest,
  completePurchaseRequest,
  deletePurchaseRequest,
}: PurchasesPageProps) {
  const [activeTab, setActiveTab] = useState<PurchaseTab>("open");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<PurchaseCreateDraft>(createPurchaseDraft());
  const [createTitleError, setCreateTitleError] = useState<string | null>(null);
  const [isTitleSuggestOpen, setIsTitleSuggestOpen] = useState(false);
  const titleSuggestRootRef = useRef<HTMLDivElement | null>(null);
  const [modalTarget, setModalTarget] = useState<PurchaseRequest | null>(null);
  const [completeDraft, setCompleteDraft] = useState<PurchaseCompleteDraft | null>(null);
  const [itemNameError, setItemNameError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<PurchaseConfirmDialogState>(null);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { previews: receiptPreviews, addFiles, removePreview, clearPreviews } =
    useReceiptPreviews();

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!titleSuggestRootRef.current) return;
      if (!titleSuggestRootRef.current.contains(event.target as Node)) {
        setIsTitleSuggestOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsTitleSuggestOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const openRows = useMemo(
    () =>
      data.purchaseRequests
        .filter((item) => item.status === "OPEN")
        .sort((a, b) => {
          const aCreated = parseDateValue(a.createdAt ?? "");
          const bCreated = parseDateValue(b.createdAt ?? "");
          if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
            return bCreated - aCreated;
          }
          if (Number.isFinite(aCreated) && !Number.isFinite(bCreated)) return -1;
          if (!Number.isFinite(aCreated) && Number.isFinite(bCreated)) return 1;
          return a.title.localeCompare(b.title, "ja");
        }),
    [data.purchaseRequests],
  );

  const boughtRows = useMemo(
    () =>
      data.purchaseRequests
        .filter((item) => item.status === "BOUGHT")
        .sort((a, b) => {
          const aBought = parseDateValue(a.boughtAt ?? "");
          const bBought = parseDateValue(b.boughtAt ?? "");
          if (Number.isFinite(aBought) && Number.isFinite(bBought) && aBought !== bBought) {
            return bBought - aBought;
          }
          if (Number.isFinite(aBought) && !Number.isFinite(bBought)) return -1;
          if (!Number.isFinite(aBought) && Number.isFinite(bBought)) return 1;
          const aCreated = parseDateValue(a.createdAt ?? "");
          const bCreated = parseDateValue(b.createdAt ?? "");
          if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
            return bCreated - aCreated;
          }
          return a.title.localeCompare(b.title, "ja");
        }),
    [data.purchaseRequests],
  );

  const rows = activeTab === "open" ? openRows : boughtRows;
  const titleQuery = createDraft.title.trim().toLocaleLowerCase("ja");
  const titleSuggestions = useMemo(() => {
    if (!titleQuery) return [] as string[];
    return Array.from(
      new Set(
        data.purchaseRequests
          .map((item) => item.title.trim())
          .filter((item) => item.length > 0)
          .filter((item) => item.toLocaleLowerCase("ja").includes(titleQuery)),
      ),
    ).slice(0, 6);
  }, [data.purchaseRequests, titleQuery]);

  const userName = (uid?: string): string => {
    if (!uid) return "—";
    return toDemoFamilyName(data.users[uid]?.displayName ?? uid, uid);
  };

  const openCreateModal = () => {
    setCreateDraft(createPurchaseDraft());
    setCreateTitleError(null);
    setSubmitError("");
    setIsTitleSuggestOpen(false);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateTitleError(null);
    setSubmitError("");
    setIsTitleSuggestOpen(false);
  };

  const submitCreate = async () => {
    if (!createDraft.title.trim()) {
      setCreateTitleError("タイトルは必須です");
      return;
    }
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const now = new Date().toISOString();
      await createPurchaseRequest({
        title: createDraft.title.trim(),
        memo: createDraft.memo.trim() || undefined,
        createdBy: currentUid,
        createdAt: now,
        status: "OPEN",
      });
      setActiveTab("open");
      setIsTitleSuggestOpen(false);
      closeCreateModal();
    } catch {
      setSubmitError("購入依頼の保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCompleteModal = (item: PurchaseRequest) => {
    clearPreviews();
    setSubmitError("");
    setModalTarget(item);
    setCompleteDraft({
      itemName: item.title,
      quantity: item.quantity === undefined ? "" : String(item.quantity),
      amount: item.estimatedAmount === undefined ? "" : String(item.estimatedAmount),
      purchasedAt: toDateTimeInputValue(new Date()),
      recordToReimbursement: demoRole === "parent",
      recordToAccounting: demoRole === "admin",
    });
    setItemNameError(null);
  };

  const closeCompleteModal = () => {
    clearPreviews();
    setModalTarget(null);
    setCompleteDraft(null);
    setItemNameError(null);
    setSubmitError("");
  };

  const runConfirmAction = async () => {
    if (!confirmDialog) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      await deletePurchaseRequest(confirmDialog.purchase.id);
      setConfirmDialog(null);
    } catch {
      setSubmitError("購入依頼の削除に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const commitComplete = async () => {
    if (!modalTarget || !completeDraft) return;
    if (!completeDraft.itemName.trim()) {
      setItemNameError("買ったものは必須です");
      return;
    }

    const purchasedAtIso = toIsoFromInput(completeDraft.purchasedAt);
    const amountNumber = completeDraft.amount.trim() ? Number(completeDraft.amount) : undefined;
    const normalizedAmount = Number.isFinite(amountNumber) ? amountNumber : undefined;
    const receiptFilesMeta = receiptPreviews.map((item) => ({
      name: item.name,
      size: item.size,
      type: item.type,
    }));

    setIsSubmitting(true);
    setSubmitError("");
    try {
      await completePurchaseRequest({
        purchase: {
          ...modalTarget,
          accountingRequested: demoRole === "admin" ? completeDraft.recordToAccounting : false,
          accountingSourceType: "purchaseRequest",
          accountingSourceId: modalTarget.id,
          purchaseResult: {
            itemName: completeDraft.itemName.trim(),
            quantity: completeDraft.quantity.trim() || undefined,
            amount: normalizedAmount,
            purchasedAt: purchasedAtIso,
            receiptFilesMeta,
            reimbursementRecordRequested: demoRole === "parent" ? completeDraft.recordToReimbursement : false,
            accountingRecordRequested: demoRole === "admin" ? completeDraft.recordToAccounting : false,
          },
        },
        completedBy: currentUid,
        itemName: completeDraft.itemName.trim(),
        quantity: completeDraft.quantity.trim() || undefined,
        amount: normalizedAmount,
        purchasedAt: purchasedAtIso,
        files: receiptPreviews.map((item) => item.file),
        createReimbursement: demoRole === "parent" && completeDraft.recordToReimbursement,
      });
      closeCompleteModal();
    } catch {
      setSubmitError("購入完了の保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card purchases-page">
      <header className="purchases-header">
        <h1>購入依頼</h1>
        <button type="button" className="button button-small" onClick={openCreateModal} disabled={isSubmitting}>
          ＋ 追加
        </button>
      </header>
      {loadError && <p className="field-error">{loadError}</p>}
      {submitError && <p className="field-error">{submitError}</p>}

      <div className="purchases-tabs" role="tablist" aria-label="購入依頼状態">
        <button
          type="button"
          className={`members-tab ${activeTab === "open" ? "active" : ""}`}
          onClick={() => setActiveTab("open")}
        >
          未購入 ({openRows.length})
        </button>
        <button
          type="button"
          className={`members-tab ${activeTab === "bought" ? "active" : ""}`}
          onClick={() => setActiveTab("bought")}
        >
          購入済 ({boughtRows.length})
        </button>
      </div>

      <div className="purchases-list">
        {rows.map((item) => (
          <article key={item.id} className="purchase-card">
            <div className="purchase-card-top">
              <strong>{item.title}</strong>
              <span className={`purchase-status ${item.status === "OPEN" ? "open" : "bought"}`}>
                {statusLabel(item.status)}
              </span>
            </div>
            <p className="purchase-meta">
              <span>依頼者: {userName(item.createdBy)}</span>
              <span>依頼日時: {toDateTimeLabel(item.createdAt)}</span>
            </p>
            {item.memo?.trim() && (
              <p className="todo-memo-preview compact">
                <LinkifiedText text={item.memo} className="todo-linkified-text" />
              </p>
            )}
            {item.status === "BOUGHT" && (
              <p className="purchase-bought-meta muted">
                購入者: {userName(item.boughtBy)} / 購入日時: {toDateTimeLabel(item.boughtAt)}
              </p>
            )}
            {item.status === "OPEN" && (
              <div className="purchase-actions">
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => openCompleteModal(item)}
                >
                  購入済みにする
                </button>
              </div>
            )}
            {item.status === "OPEN" && item.createdBy === currentUid && (
              <div className="reimbursement-delete-action">
                <button
                  type="button"
                  className="link-icon-button"
                  aria-label="削除"
                  onClick={() => setConfirmDialog({ mode: "delete", purchase: item })}
                >
                  🗑️
                </button>
              </div>
            )}
          </article>
        ))}
        {isLoading && rows.length === 0 && <p className="muted">読み込み中...</p>}
        {!isLoading && rows.length === 0 && <p className="muted">該当する購入依頼はありません。</p>}
      </div>

      {isCreateModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel purchases-create-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeCreateModal}>
              ×
            </button>
            <h3>購入依頼を追加</h3>
            <label>
              タイトル
              <div className="suggestion-anchor" ref={titleSuggestRootRef}>
                <input
                  value={createDraft.title}
                  onFocus={() => setIsTitleSuggestOpen(true)}
                  onChange={(event) => {
                    setCreateDraft((prev) => ({ ...prev, title: event.target.value }));
                    setCreateTitleError(null);
                    setIsTitleSuggestOpen(true);
                  }}
                />
                {isTitleSuggestOpen && titleSuggestions.length > 0 && (
                  <div className="suggestion-dropdown" role="listbox" aria-label="過去タイトル候補">
                    {titleSuggestions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="suggestion-option"
                        onClick={() => {
                          setCreateDraft((prev) => ({ ...prev, title: option }));
                          setIsTitleSuggestOpen(false);
                          setCreateTitleError(null);
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {createTitleError && <span className="field-error">{createTitleError}</span>}
            </label>
            <label>
              メモ（任意）
              <textarea
                value={createDraft.memo}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, memo: event.target.value }))}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeCreateModal} disabled={isSubmitting}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void submitCreate()} disabled={isSubmitting}>
                追加
              </button>
            </div>
          </section>
        </div>
      )}

      {modalTarget && completeDraft && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel purchases-complete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeCompleteModal}>
              ×
            </button>
            <h3>購入完了</h3>
            <p className="modal-context">依頼: {modalTarget.title}</p>
            <label>
              買ったもの
              <input
                value={completeDraft.itemName}
                onChange={(event) => {
                  setCompleteDraft((prev) => (prev ? { ...prev, itemName: event.target.value } : prev));
                  setItemNameError(null);
                }}
              />
              {itemNameError && <span className="field-error">{itemNameError}</span>}
            </label>
            <div className="field-grid">
              <label>
                数量
                <input
                  value={completeDraft.quantity}
                  onChange={(event) =>
                    setCompleteDraft((prev) => (prev ? { ...prev, quantity: event.target.value } : prev))
                  }
                />
              </label>
              <label>
                購入金額
                <input
                  type="number"
                  min={0}
                  value={completeDraft.amount}
                  onChange={(event) =>
                    setCompleteDraft((prev) => (prev ? { ...prev, amount: event.target.value } : prev))
                  }
                />
              </label>
            </div>
            <label>
              購入日時
              <input
                type="datetime-local"
                value={completeDraft.purchasedAt}
                onChange={(event) =>
                  setCompleteDraft((prev) => (prev ? { ...prev, purchasedAt: event.target.value } : prev))
                }
              />
            </label>

            <ReceiptImagePicker
              previews={receiptPreviews}
              onAddFiles={addFiles}
              onRemovePreview={removePreview}
            />

            {demoRole === "parent" && (
              <label className="purchase-option-check">
                <input
                  type="checkbox"
                  checked={completeDraft.recordToReimbursement}
                  onChange={(event) =>
                    setCompleteDraft((prev) =>
                      prev ? { ...prev, recordToReimbursement: event.target.checked } : prev,
                    )
                  }
                />
                <span>立替に記録する</span>
              </label>
            )}

            {demoRole === "admin" && (
              <>
                <label className="purchase-option-check">
                  <input
                    type="checkbox"
                    checked={completeDraft.recordToAccounting}
                    onChange={(event) =>
                      setCompleteDraft((prev) =>
                        prev ? { ...prev, recordToAccounting: event.target.checked } : prev,
                      )
                    }
                  />
                  <span>会計に支出を記録する</span>
                </label>
                <p className="muted">会計への実追加は未実装です（片方向のみ想定）。</p>
              </>
            )}

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeCompleteModal} disabled={isSubmitting}>
                キャンセル
              </button>
              <button type="button" className="button" onClick={() => void commitComplete()} disabled={isSubmitting}>
                確定
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmDialog && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel events-delete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setConfirmDialog(null)}>
              ×
            </button>
            <h3>この購入依頼を削除しますか？</h3>
            <p className="modal-summary">{confirmDialog.purchase.title}</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setConfirmDialog(null)} disabled={isSubmitting}>
                キャンセル
              </button>
              <button
                type="button"
                className="button events-danger-button"
                onClick={() => void runConfirmAction()}
                disabled={isSubmitting}
              >
                削除
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
