import { useEffect, useMemo, useRef, useState } from "react";
import { LinkifiedText } from "../components/LinkifiedText";
import { ReceiptImagePicker } from "../components/ReceiptImagePicker";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { useReceiptPreviews } from "../hooks/useReceiptPreviews";
import { useAccountingStore } from "../accounting/useAccountingStore";
import { groupedAccountingSubjects } from "../accounting/fixedSubjects";
import { comparePeriodAccounts } from "../accounting/sort";
import type { DemoData, PurchaseRequest } from "../types";
import { toDemoFamilyName } from "../utils/demoName";

type PurchaseTab = "open" | "bought";
type DemoRole = "admin" | "parent";
type PurchaseCreateDraft = { title: string; memo: string };
type PurchaseCreateErrors = { title?: string };
type PurchaseCompleteDraft = {
  itemName: string;
  quantity: string;
  amount: string;
  purchasedAt: string;
  recordToReimbursement: boolean;
  recordToAccounting: boolean;
  accountingAccountId: string;
  accountingCategoryId: string;
  accountingMemo: string;
};
type PurchaseCompleteErrors = {
  itemName?: string;
  quantity?: string;
  amount?: string;
  purchasedAt?: string;
  accountingAccountId?: string;
  accountingCategoryId?: string;
  accountingMemo?: string;
};
type PurchaseConfirmDialogState = { mode: "delete"; purchase: PurchaseRequest } | null;

type PurchasesPageProps = {
  data: DemoData;
  currentUid: string;
  demoRole: DemoRole;
  canManageAccounting: boolean;
  isLoading: boolean;
  loadError: string;
  createPurchaseRequest: (purchase: Omit<PurchaseRequest, "id">) => Promise<void>;
  savePurchaseRequest: (purchase: PurchaseRequest) => Promise<void>;
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

const toDateLabel = (iso?: string): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const toDateInputValue = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const parseDateValue = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const toIsoFromDateInput = (value: string): string => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const statusLabel = (status: PurchaseRequest["status"]): string => (status === "OPEN" ? "未購入" : "購入済");
const createPurchaseDraft = (): PurchaseCreateDraft => ({ title: "", memo: "" });
const buildAccountingMemo = (purchase: PurchaseRequest, itemName: string): string =>
  itemName.trim() || purchase.title.trim() || purchase.memo?.trim() || "";
const accountingStateLabel = (purchase: PurchaseRequest): string => {
  if (purchase.accountingLinked || purchase.accountingEntryId) return "会計連携済み";
  return "会計連携なし";
};

const createCompleteDraft = (
  purchase: PurchaseRequest,
  demoRole: DemoRole,
  canManageAccounting: boolean,
  defaultAccountId: string,
): PurchaseCompleteDraft => ({
  itemName: purchase.purchaseResult?.itemName ?? purchase.title,
  quantity: purchase.purchaseResult?.quantity === undefined ? "" : String(purchase.purchaseResult.quantity),
  amount:
    purchase.purchaseResult?.amount === undefined
      ? purchase.estimatedAmount === undefined
        ? ""
        : String(purchase.estimatedAmount)
      : String(purchase.purchaseResult.amount),
  purchasedAt: toDateInputValue(new Date(purchase.purchaseResult?.purchasedAt ?? purchase.boughtAt ?? new Date())),
  recordToReimbursement:
    demoRole === "parent" ? (purchase.purchaseResult?.reimbursementRecordRequested ?? true) : false,
  recordToAccounting:
    canManageAccounting ? (purchase.purchaseResult?.accountingRecordRequested ?? purchase.accountingRequested ?? true) : false,
  accountingAccountId: purchase.accountingAccountId ?? defaultAccountId,
  accountingCategoryId: purchase.accountingCategoryId ?? "",
  accountingMemo: purchase.accountingMemo ?? buildAccountingMemo(purchase, purchase.purchaseResult?.itemName ?? purchase.title),
});

export function PurchasesPage({
  data,
  currentUid,
  demoRole,
  canManageAccounting,
  isLoading,
  loadError,
  createPurchaseRequest,
  savePurchaseRequest,
  completePurchaseRequest,
  deletePurchaseRequest,
}: PurchasesPageProps) {
  const isAdmin = demoRole === "admin";
  const { currentPeriod } = useAccountingStore();
  const [activeTab, setActiveTab] = useState<PurchaseTab>("open");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseRequest | null>(null);
  const [createDraft, setCreateDraft] = useState<PurchaseCreateDraft>(createPurchaseDraft());
  const [createErrors, setCreateErrors] = useState<PurchaseCreateErrors>({});
  const [isTitleSuggestOpen, setIsTitleSuggestOpen] = useState(false);
  const titleSuggestRootRef = useRef<HTMLDivElement | null>(null);
  const [detailTarget, setDetailTarget] = useState<PurchaseRequest | null>(null);
  const [modalTarget, setModalTarget] = useState<PurchaseRequest | null>(null);
  const [completeDraft, setCompleteDraft] = useState<PurchaseCompleteDraft | null>(null);
  const [completeErrors, setCompleteErrors] = useState<PurchaseCompleteErrors>({});
  const [confirmDialog, setConfirmDialog] = useState<PurchaseConfirmDialogState>(null);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { previews: receiptPreviews, addFiles, removePreview, clearPreviews } = useReceiptPreviews();

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!titleSuggestRootRef.current) return;
      if (!titleSuggestRootRef.current.contains(event.target as Node)) setIsTitleSuggestOpen(false);
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

  const availableAccounts = useMemo(
    () => [...(currentPeriod?.accounts ?? [])].sort(comparePeriodAccounts),
    [currentPeriod],
  );
  const defaultAccountingAccountId =
    availableAccounts.find((account) =>
      isAdmin ? account.label === "現金（会長手元金）" : account.label === "現金（会計手元金）",
    )?.accountId ?? "";
  const accountingSubjectGroups = useMemo(() => groupedAccountingSubjects("expense"), []);

  const openRows = useMemo(
    () =>
      data.purchaseRequests
        .filter((item) => item.status === "OPEN")
        .sort((a, b) => (parseDateValue(b.createdAt ?? "") || 0) - (parseDateValue(a.createdAt ?? "") || 0)),
    [data.purchaseRequests],
  );
  const boughtRows = useMemo(
    () =>
      data.purchaseRequests
        .filter((item) => item.status === "BOUGHT")
        .sort(
          (a, b) =>
            (parseDateValue(b.purchaseResult?.purchasedAt ?? b.boughtAt ?? "") || 0) -
            (parseDateValue(a.purchaseResult?.purchasedAt ?? a.boughtAt ?? "") || 0),
        ),
    [data.purchaseRequests],
  );
  const rows = activeTab === "open" ? openRows : boughtRows;
  const titleQuery = createDraft.title.trim().toLocaleLowerCase("ja");
  const titleSuggestions = useMemo(
    () =>
      !titleQuery
        ? []
        : Array.from(
            new Set(
              data.purchaseRequests
                .map((item) => item.title.trim())
                .filter((item) => item.length > 0)
                .filter((item) => item.toLocaleLowerCase("ja").includes(titleQuery)),
            ),
          ).slice(0, 6),
    [data.purchaseRequests, titleQuery],
  );

  const userName = (uid?: string): string => (uid ? toDemoFamilyName(data.users[uid]?.displayName ?? uid, uid) : "—");
  const canEditPurchase = (purchase: PurchaseRequest): boolean => isAdmin || (purchase.status === "OPEN" && purchase.createdBy === currentUid);
  const canDeletePurchase = (purchase: PurchaseRequest): boolean => isAdmin || (purchase.status === "OPEN" && purchase.createdBy === currentUid);

  const openCreateModal = (purchase?: PurchaseRequest) => {
    setEditingPurchase(purchase ?? null);
    setCreateDraft(purchase ? { title: purchase.title, memo: purchase.memo ?? "" } : createPurchaseDraft());
    setCreateErrors({});
    setSubmitError("");
    setIsTitleSuggestOpen(false);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setEditingPurchase(null);
    setCreateErrors({});
    setSubmitError("");
    setIsTitleSuggestOpen(false);
  };

  const closeCompleteModal = () => {
    clearPreviews();
    setModalTarget(null);
    setCompleteDraft(null);
    setCompleteErrors({});
    setSubmitError("");
  };

  const submitCreate = async () => {
    const nextErrors: PurchaseCreateErrors = {};
    if (!createDraft.title.trim()) nextErrors.title = "タイトルは必須です";
    setCreateErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError("");
    try {
      if (editingPurchase) {
        await savePurchaseRequest({
          ...editingPurchase,
          title: createDraft.title.trim(),
          memo: createDraft.memo.trim() || undefined,
        });
      } else {
        await createPurchaseRequest({
          title: createDraft.title.trim(),
          memo: createDraft.memo.trim() || undefined,
          createdBy: currentUid,
          createdAt: new Date().toISOString(),
          status: "OPEN",
        });
      }
      setActiveTab("open");
      closeCreateModal();
    } catch {
      setSubmitError(editingPurchase ? "購入依頼の更新に失敗しました。" : "購入依頼の保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCompleteModal = (purchase: PurchaseRequest) => {
    clearPreviews();
    setDetailTarget(null);
    setModalTarget(purchase);
    setCompleteDraft(createCompleteDraft(purchase, demoRole, canManageAccounting, defaultAccountingAccountId));
    setCompleteErrors({});
    setSubmitError("");
  };

  const runConfirmAction = async () => {
    if (!confirmDialog) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      await deletePurchaseRequest(confirmDialog.purchase.id);
      if (detailTarget?.id === confirmDialog.purchase.id) setDetailTarget(null);
      setConfirmDialog(null);
    } catch {
      setSubmitError("購入依頼の削除に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const commitComplete = async () => {
    if (!modalTarget || !completeDraft) return;
    const nextErrors: PurchaseCompleteErrors = {};
    if (!completeDraft.itemName.trim()) nextErrors.itemName = "買ったものは必須です";
    if (!completeDraft.quantity.trim()) nextErrors.quantity = "数量は必須です";
    const amountNumber = Number(completeDraft.amount);
    if (!completeDraft.amount.trim() || !Number.isFinite(amountNumber) || amountNumber < 0) {
      nextErrors.amount = "購入金額は0以上の数値で入力してください";
    }
    if (!completeDraft.purchasedAt.trim() || Number.isNaN(Date.parse(completeDraft.purchasedAt))) {
      nextErrors.purchasedAt = "購入日は必須です";
    }
    if (canManageAccounting && completeDraft.recordToAccounting) {
      if (!completeDraft.accountingAccountId) nextErrors.accountingAccountId = "出金元口座を選択してください";
      if (!completeDraft.accountingCategoryId) nextErrors.accountingCategoryId = "科目を選択してください";
      if (!completeDraft.accountingMemo.trim()) nextErrors.accountingMemo = "摘要は必須です";
    }
    setCompleteErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError("");
    try {
      await completePurchaseRequest({
        purchase: {
          ...modalTarget,
          accountingRequested: canManageAccounting ? completeDraft.recordToAccounting : false,
          accountingSourceType: "purchaseRequest",
          accountingSourceId: modalTarget.id,
          accountingAccountId: completeDraft.recordToAccounting ? completeDraft.accountingAccountId : undefined,
          accountingCategoryId: completeDraft.recordToAccounting ? completeDraft.accountingCategoryId : undefined,
          accountingMemo: completeDraft.recordToAccounting ? completeDraft.accountingMemo.trim() : undefined,
          purchaseResult: {
            itemName: completeDraft.itemName.trim(),
            quantity: completeDraft.quantity.trim(),
            amount: amountNumber,
            purchasedAt: toIsoFromDateInput(completeDraft.purchasedAt),
            receiptFilesMeta:
              receiptPreviews.length > 0
                ? receiptPreviews.map((item) => ({ name: item.name, size: item.size, type: item.type }))
                : modalTarget.purchaseResult?.receiptFilesMeta,
            reimbursementRecordRequested: demoRole === "parent" ? completeDraft.recordToReimbursement : false,
            accountingRecordRequested: canManageAccounting ? completeDraft.recordToAccounting : false,
            reimbursementLinked: modalTarget.purchaseResult?.reimbursementLinked,
            reimbursementId: modalTarget.purchaseResult?.reimbursementId,
          },
        },
        completedBy: currentUid,
        itemName: completeDraft.itemName.trim(),
        quantity: completeDraft.quantity.trim(),
        amount: amountNumber,
        purchasedAt: toIsoFromDateInput(completeDraft.purchasedAt),
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
        <button type="button" className="button button-small" onClick={() => openCreateModal()} disabled={isSubmitting}>
          ＋ 追加
        </button>
      </header>
      {loadError && <p className="field-error">{loadError}</p>}
      {submitError && <p className="field-error">{submitError}</p>}

      <div className="purchases-tabs" role="tablist" aria-label="購入依頼状態">
        <button type="button" className={`members-tab ${activeTab === "open" ? "active" : ""}`} onClick={() => setActiveTab("open")}>
          未購入 ({openRows.length})
        </button>
        <button type="button" className={`members-tab ${activeTab === "bought" ? "active" : ""}`} onClick={() => setActiveTab("bought")}>
          購入済 ({boughtRows.length})
        </button>
      </div>

      <div className="purchases-list">
        {rows.map((item) => (
          <article
            key={item.id}
            className="purchase-card"
            role="button"
            tabIndex={0}
            onClick={() => setDetailTarget(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setDetailTarget(item);
              }
            }}
          >
            <div className="purchase-card-top">
              <strong>{item.title}</strong>
              <span className={`purchase-status ${item.status === "OPEN" ? "open" : "bought"}`}>{statusLabel(item.status)}</span>
            </div>
            <p className="purchase-meta">
              <span>依頼者: {userName(item.createdBy)}</span>
              <span>依頼日: {toDateLabel(item.createdAt)}</span>
            </p>
            {item.memo?.trim() && (
              <p className="todo-memo-preview compact">
                <LinkifiedText text={item.memo} className="todo-linkified-text" />
              </p>
            )}
            {item.status === "BOUGHT" && (
              <p className="purchase-bought-meta muted">
                購入者: {userName(item.boughtBy)} / 購入日: {toDateLabel(item.purchaseResult?.purchasedAt ?? item.boughtAt)}
              </p>
            )}
            <p className="muted">{accountingStateLabel(item)}</p>
            <div className="purchase-actions">
              {item.status === "OPEN" && (
                <button type="button" className="button button-small" onClick={(event) => { event.stopPropagation(); openCompleteModal(item); }}>
                  購入済みにする
                </button>
              )}
              {canEditPurchase(item) && item.status === "OPEN" && (
                <button type="button" className="button button-small button-secondary" onClick={(event) => { event.stopPropagation(); openCreateModal(item); }}>
                  編集
                </button>
              )}
              {canDeletePurchase(item) && (
                <button type="button" className="link-icon-button" aria-label="削除" onClick={(event) => { event.stopPropagation(); setConfirmDialog({ mode: "delete", purchase: item }); }}>
                  🗑️
                </button>
              )}
            </div>
          </article>
        ))}
        {isLoading && rows.length === 0 && <p className="muted">読み込み中...</p>}
        {!isLoading && rows.length === 0 && <p className="muted">該当する購入依頼はありません。</p>}
      </div>

      {isCreateModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel purchases-create-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeCreateModal}>×</button>
            <h3>{editingPurchase ? "購入依頼を編集" : "購入依頼を追加"}</h3>
            <label>
              タイトル
              <div className="suggestion-anchor" ref={titleSuggestRootRef}>
                <input
                  value={createDraft.title}
                  onFocus={() => setIsTitleSuggestOpen(true)}
                  onChange={(event) => {
                    setCreateDraft((prev) => ({ ...prev, title: event.target.value }));
                    setCreateErrors((prev) => ({ ...prev, title: undefined }));
                    setIsTitleSuggestOpen(true);
                  }}
                />
                {isTitleSuggestOpen && titleSuggestions.length > 0 && (
                  <div className="suggestion-dropdown" role="listbox" aria-label="過去タイトル候補">
                    {titleSuggestions.map((option) => (
                      <button key={option} type="button" className="suggestion-option" onClick={() => {
                        setCreateDraft((prev) => ({ ...prev, title: option }));
                        setCreateErrors((prev) => ({ ...prev, title: undefined }));
                        setIsTitleSuggestOpen(false);
                      }}>
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {createErrors.title && <span className="field-error">{createErrors.title}</span>}
            </label>
            <label>
              メモ（任意）
              <textarea value={createDraft.memo} onChange={(event) => setCreateDraft((prev) => ({ ...prev, memo: event.target.value }))} />
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeCreateModal} disabled={isSubmitting}>キャンセル</button>
              <button type="button" className="button" onClick={() => void submitCreate()} disabled={isSubmitting}>{editingPurchase ? "更新" : "追加"}</button>
            </div>
          </section>
        </div>
      )}

      {detailTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDetailTarget(null)}>
          <section className="modal-panel purchases-complete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={() => setDetailTarget(null)}>×</button>
            <h3>{detailTarget.title}</h3>
            <p className="muted">依頼者: {userName(detailTarget.createdBy)}</p>
            <p className="muted">依頼日: {toDateLabel(detailTarget.createdAt)}</p>
            {detailTarget.memo?.trim() && (
              <>
                <p className="muted">メモ</p>
                <p className="todo-memo-full"><LinkifiedText text={detailTarget.memo} className="todo-linkified-text" /></p>
              </>
            )}
            {detailTarget.status === "BOUGHT" && (
              <>
                <p className="muted">購入者: {userName(detailTarget.boughtBy)}</p>
                <p className="muted">数量: {detailTarget.purchaseResult?.quantity ?? "—"}</p>
                <p className="muted">購入金額: {detailTarget.purchaseResult?.amount === undefined ? "—" : `${detailTarget.purchaseResult.amount.toLocaleString()}円`}</p>
                <p className="muted">購入日: {toDateLabel(detailTarget.purchaseResult?.purchasedAt ?? detailTarget.boughtAt)}</p>
                <p className="muted">会計連携状態: {accountingStateLabel(detailTarget)}</p>
                {detailTarget.purchaseResult?.receiptFilesMeta && detailTarget.purchaseResult.receiptFilesMeta.length > 0 && (
                  <div className="purchase-receipt-grid">
                    {detailTarget.purchaseResult.receiptFilesMeta.map((file, index) => (
                      <article key={`${detailTarget.id}-${file.name}-${index}`} className="purchase-receipt-card">
                        {file.downloadUrl ? <img src={file.downloadUrl} alt={`${detailTarget.title}-${index + 1}`} className="purchase-receipt-image" /> : <div className="purchase-receipt-placeholder">{file.name}</div>}
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="modal-actions">
              {detailTarget.status === "OPEN" && <button type="button" className="button" onClick={() => openCompleteModal(detailTarget)}>購入済みにする</button>}
              {canEditPurchase(detailTarget) && <button type="button" className="button button-secondary" onClick={() => detailTarget.status === "OPEN" ? openCreateModal(detailTarget) : openCompleteModal(detailTarget)}>編集</button>}
              {canDeletePurchase(detailTarget) && <button type="button" className="button events-danger-button" onClick={() => setConfirmDialog({ mode: "delete", purchase: detailTarget })}>削除</button>}
            </div>
          </section>
        </div>
      )}

      {modalTarget && completeDraft && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel purchases-complete-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={closeCompleteModal}>×</button>
            <h3>{modalTarget.status === "BOUGHT" ? "購入情報を編集" : "購入完了"}</h3>
            <p className="modal-context">依頼: {modalTarget.title}</p>
            <label>
              買ったもの
              <input value={completeDraft.itemName} onChange={(event) => {
                setCompleteDraft((prev) => prev ? { ...prev, itemName: event.target.value } : prev);
                setCompleteErrors((prev) => ({ ...prev, itemName: undefined }));
              }} />
              {completeErrors.itemName && <span className="field-error">{completeErrors.itemName}</span>}
            </label>
            <div className="field-grid">
              <label>
                数量
                <input value={completeDraft.quantity} onChange={(event) => {
                  setCompleteDraft((prev) => prev ? { ...prev, quantity: event.target.value } : prev);
                  setCompleteErrors((prev) => ({ ...prev, quantity: undefined }));
                }} />
                {completeErrors.quantity && <span className="field-error">{completeErrors.quantity}</span>}
              </label>
              <label>
                購入金額
                <input type="number" min={0} value={completeDraft.amount} onChange={(event) => {
                  setCompleteDraft((prev) => prev ? { ...prev, amount: event.target.value } : prev);
                  setCompleteErrors((prev) => ({ ...prev, amount: undefined }));
                }} />
                {completeErrors.amount && <span className="field-error">{completeErrors.amount}</span>}
              </label>
            </div>
            <label>
              購入日
              <input type="date" value={completeDraft.purchasedAt} onChange={(event) => {
                setCompleteDraft((prev) => prev ? { ...prev, purchasedAt: event.target.value } : prev);
                setCompleteErrors((prev) => ({ ...prev, purchasedAt: undefined }));
              }} />
              {completeErrors.purchasedAt && <span className="field-error">{completeErrors.purchasedAt}</span>}
            </label>

            <ReceiptImagePicker previews={receiptPreviews} onAddFiles={addFiles} onRemovePreview={removePreview} />
            {demoRole === "parent" && (
              <label className="purchase-option-check">
                <input type="checkbox" checked={completeDraft.recordToReimbursement} onChange={(event) => setCompleteDraft((prev) => prev ? { ...prev, recordToReimbursement: event.target.checked } : prev)} />
                <span>立替に記録する</span>
              </label>
            )}
            {canManageAccounting && (
              <>
                <label className="purchase-option-check">
                  <input type="checkbox" checked={completeDraft.recordToAccounting} onChange={(event) => setCompleteDraft((prev) => prev ? { ...prev, recordToAccounting: event.target.checked } : prev)} />
                  <span>会計に支出を記録する</span>
                </label>
                {completeDraft.recordToAccounting && (
                  <div className="field-stack">
                    <label>
                      出金元口座
                      <select value={completeDraft.accountingAccountId} onChange={(event) => {
                        setCompleteDraft((prev) => prev ? { ...prev, accountingAccountId: event.target.value } : prev);
                        setCompleteErrors((prev) => ({ ...prev, accountingAccountId: undefined }));
                      }}>
                        <option value="">選択してください</option>
                        {availableAccounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.label}</option>)}
                      </select>
                      {completeErrors.accountingAccountId && <span className="field-error">{completeErrors.accountingAccountId}</span>}
                    </label>
                    <label>
                      科目
                      <select value={completeDraft.accountingCategoryId} onChange={(event) => {
                        setCompleteDraft((prev) => prev ? { ...prev, accountingCategoryId: event.target.value } : prev);
                        setCompleteErrors((prev) => ({ ...prev, accountingCategoryId: undefined }));
                      }}>
                        <option value="">選択してください</option>
                        {accountingSubjectGroups.map((group) => (
                          <optgroup key={group.category.categoryId} label={group.category.label}>
                            {group.subjects.map((subject) => <option key={subject.subjectId} value={subject.subjectId}>{subject.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      {completeErrors.accountingCategoryId && <span className="field-error">{completeErrors.accountingCategoryId}</span>}
                    </label>
                    <label>
                      摘要
                      <input value={completeDraft.accountingMemo} onChange={(event) => {
                        setCompleteDraft((prev) => prev ? { ...prev, accountingMemo: event.target.value } : prev);
                        setCompleteErrors((prev) => ({ ...prev, accountingMemo: undefined }));
                      }} />
                      {completeErrors.accountingMemo && <span className="field-error">{completeErrors.accountingMemo}</span>}
                    </label>
                  </div>
                )}
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeCompleteModal} disabled={isSubmitting}>キャンセル</button>
              <button type="button" className="button" onClick={() => void commitComplete()} disabled={isSubmitting}>確定</button>
            </div>
          </section>
        </div>
      )}

      {confirmDialog && (
        <ConfirmationDialog
          title="この購入依頼を削除しますか？"
          message={`状態: ${statusLabel(confirmDialog.purchase.status)} / 依頼者: ${userName(confirmDialog.purchase.createdBy)}`}
          summary={confirmDialog.purchase.title}
          confirmLabel="削除"
          danger
          busy={isSubmitting}
          onClose={() => setConfirmDialog(null)}
          onConfirm={runConfirmAction}
        />
      )}
    </section>
  );
}
