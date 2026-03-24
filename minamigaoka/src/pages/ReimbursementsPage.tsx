import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoData, Reimbursement, ReimbursementStatus } from "../types";
import { useAccountingStore } from "../accounting/useAccountingStore";
import { ReceiptImagePicker } from "../components/ReceiptImagePicker";
import { useReceiptPreviews } from "../hooks/useReceiptPreviews";
import { toDemoFamilyName } from "../utils/demoName";
import { ReceiptOcrCanceledError, readReceiptSuggestion } from "../utils/receiptOcr";
import { appRuntimeConfig } from "../config/runtime";

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

type ReceiptOcrDebugView = NonNullable<Awaited<ReturnType<typeof readReceiptSuggestion>>>["debug"] & {
  trigger?: "auto_select";
  canceled?: boolean;
  appliedAmount?: number | null;
  phase?: string;
  progress?: number;
};

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

const hasDebugFlag = (value: string): boolean => {
  const normalized = value.startsWith("?") ? value.slice(1) : value;
  return new URLSearchParams(normalized).get("debug") === "1";
};

const resolveOcrDebugEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  if (hasDebugFlag(window.location.search)) return true;

  const hash = window.location.hash.replace(/^#/, "");
  const questionIndex = hash.indexOf("?");
  if (questionIndex >= 0) {
    return hasDebugFlag(hash.slice(questionIndex + 1));
  }

  return false;
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
  const [isReadingReceipt, setIsReadingReceipt] = useState(false);
  const [ocrToastMessage, setOcrToastMessage] = useState("");
  const [ocrDebug, setOcrDebug] = useState<ReceiptOcrDebugView | null>(null);
  const [isOcrDebugOpen, setIsOcrDebugOpen] = useState(false);
  const [isOcrDebugEnabled, setIsOcrDebugEnabled] = useState<boolean>(
    () => appRuntimeConfig.features.enableOcrDebug && resolveOcrDebugEnabled(),
  );
  const [ocrPhaseLabel, setOcrPhaseLabel] = useState("画像を準備中");
  const [ocrProgress, setOcrProgress] = useState(0);
  const ocrToastTimerRef = useRef<number | null>(null);
  const ocrRunIdRef = useRef(0);
  const lastOcrTargetReceiptIdRef = useRef<string | null>(null);
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
    setIsReadingReceipt(false);
    setOcrToastMessage("");
    setOcrDebug(null);
    setIsOcrDebugOpen(false);
    setOcrPhaseLabel("画像を準備中");
    setOcrProgress(0);
    ocrRunIdRef.current += 1;
    lastOcrTargetReceiptIdRef.current = null;
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreateErrors({});
    setIsReadingReceipt(false);
    setOcrToastMessage("");
    setOcrDebug(null);
    setIsOcrDebugOpen(false);
    setOcrPhaseLabel("画像を準備中");
    setOcrProgress(0);
    ocrRunIdRef.current += 1;
    lastOcrTargetReceiptIdRef.current = null;
    clearCreateReceiptPreviews();
  };

  useEffect(() => {
    return () => {
      if (ocrToastTimerRef.current !== null) {
        window.clearTimeout(ocrToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!appRuntimeConfig.features.enableOcrDebug) {
      setIsOcrDebugEnabled(false);
      return;
    }

    const syncDebugFlag = () => {
      setIsOcrDebugEnabled(resolveOcrDebugEnabled());
    };

    syncDebugFlag();
    window.addEventListener("hashchange", syncDebugFlag);
    window.addEventListener("popstate", syncDebugFlag);

    return () => {
      window.removeEventListener("hashchange", syncDebugFlag);
      window.removeEventListener("popstate", syncDebugFlag);
    };
  }, []);

  const showOcrToast = (message: string) => {
    setOcrToastMessage(message);
    if (ocrToastTimerRef.current !== null) {
      window.clearTimeout(ocrToastTimerRef.current);
    }
    ocrToastTimerRef.current = window.setTimeout(() => {
      setOcrToastMessage("");
      ocrToastTimerRef.current = null;
    }, 2000);
  };

  const copyTextToClipboard = async (text: string) => {
    if (!text.trim()) {
      showOcrToast("コピー対象がありません");
      return;
    }
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(text);
      showOcrToast("コピーしました");
    } catch {
      showOcrToast("コピーに失敗しました");
    }
  };

  const buildOcrDebugCopyText = (debug: ReceiptOcrDebugView | null): string => {
    if (!debug) return "";
    const amountCandidates = debug.amountCandidates
      .map(
        (candidate, index) =>
          `${index + 1}. 値:${candidate.value} score:${candidate.score} line:[${candidate.lineIndex}] ${candidate.lineText} reason:${candidate.reason.join(", ")}`,
      )
      .join("\n");
    const titleCandidates = debug.titleCandidates
      .map(
        (candidate, index) =>
          `${index + 1}. 候補:${candidate.title} score:${candidate.score} line:[${candidate.lineIndex}] ${candidate.lineText} reason:${candidate.reason.join(", ")}`,
      )
      .join("\n");
    const lines = debug.lines.map((line) => `[${line.index}] ${line.text}`).join("\n");
    return [
      "【OCRデバッグ結果】",
      `実行結果: ${debug.success ? "成功" : "失敗"}`,
      `起動: ${debug.trigger ?? "(なし)"}`,
      `中止: ${debug.canceled ? "はい" : "いいえ"}`,
      `OCR対象: ${debug.sourceImageIndex + 1}枚目`,
      `フェーズ: ${debug.phase ?? "(なし)"}`,
      `進捗: ${debug.progress !== undefined ? `${Math.round(debug.progress * 100)}%` : "(なし)"}`,
      `反映金額: ${debug.appliedAmount ?? "(なし)"}`,
      `採用金額: ${debug.selectedAmount ?? "(なし)"} (score: ${debug.selectedAmountScore ?? "(なし)"})`,
      `採用タイトル候補: ${debug.selectedTitle ?? "(なし)"} (score: ${debug.selectedTitleScore ?? "(なし)"})`,
      "",
      "【前処理】",
      `状態: ${debug.preprocess.status}`,
      `使用画像: ${debug.preprocess.usedImage}`,
      `詳細: ${debug.preprocess.message}`,
      `検出矩形: ${
        debug.preprocess.detectedRect
          ? `x=${debug.preprocess.detectedRect.x}, y=${debug.preprocess.detectedRect.y}, w=${debug.preprocess.detectedRect.width}, h=${debug.preprocess.detectedRect.height}`
          : "(なし)"
      }`,
      "",
      "【OCR生テキスト】",
      debug.rawText || "(なし)",
      "",
      "【正規化後テキスト】",
      debug.normalizedText || "(なし)",
      "",
      "【行分解結果】",
      lines || "(なし)",
      "",
      "【金額候補】",
      amountCandidates || "(なし)",
      "",
      "【タイトル候補】",
      titleCandidates || "(なし)",
    ].join("\n");
  };

  const runReceiptOcr = async (trigger: "auto_select") => {
    const firstReceipt = createReceiptPreviews[0];
    if (!firstReceipt) {
      setOcrDebug({
        success: false,
        sourceImageIndex: 0,
        preprocess: {
          status: "failed",
          usedImage: "original",
          message: "画像未選択",
          sourcePreviewDataUrl: null,
          processedPreviewDataUrl: null,
          detectedRect: null,
          workingSize: { width: 0, height: 0 },
        },
        rawText: "",
        normalizedText: "",
        lines: [],
        amountCandidates: [],
        selectedAmount: null,
        selectedAmountScore: null,
        titleCandidates: [],
        selectedTitle: null,
        selectedTitleScore: null,
        trigger,
        canceled: false,
        appliedAmount: null,
        phase: "画像未選択",
        progress: 0,
      });
      return;
    }

    const runId = ocrRunIdRef.current + 1;
    ocrRunIdRef.current = runId;
    setIsReadingReceipt(true);
    setOcrPhaseLabel("画像を準備中");
    setOcrProgress(0.08);
    let latestPhase = "画像を準備中";
    let latestProgress = 0.08;

    try {
      const suggestion = await readReceiptSuggestion(firstReceipt.file, {
        shouldCancel: () => ocrRunIdRef.current !== runId,
        onProgress: (phase, progress) => {
          if (ocrRunIdRef.current !== runId) return;
          latestPhase = phase;
          latestProgress = progress;
          setOcrPhaseLabel(phase);
          setOcrProgress(progress);
        },
      });
      if (ocrRunIdRef.current !== runId) return;
      if (!suggestion) {
        setOcrDebug(null);
        showOcrToast("読み取れませんでした");
        return;
      }
      let appliedAmount: number | null = null;

      if (suggestion.amount !== null) {
        setCreateAmount(String(suggestion.amount));
        setCreateErrors((prev) => ({ ...prev, amount: undefined }));
        appliedAmount = suggestion.amount;
      }

      setOcrDebug({
        ...suggestion.debug,
        trigger,
        canceled: false,
        appliedAmount,
        phase: latestPhase,
        progress: latestProgress,
      });

      if (appliedAmount === null) {
        showOcrToast("読み取れませんでした");
        return;
      }
      showOcrToast("レシートから金額を入力しました");
    } catch (error) {
      if (error instanceof ReceiptOcrCanceledError || ocrRunIdRef.current !== runId) {
        return;
      }
      showOcrToast("読み取れませんでした");
    } finally {
      if (ocrRunIdRef.current !== runId) return;
      setIsReadingReceipt(false);
      setOcrProgress(0);
      setOcrPhaseLabel("画像を準備中");
    }
  };

  const cancelReceiptOcr = () => {
    if (!isReadingReceipt) return;
    ocrRunIdRef.current += 1;
    setIsReadingReceipt(false);
    setOcrProgress(0);
    setOcrPhaseLabel("中止しました");
    setOcrDebug((prev) =>
      prev
        ? { ...prev, canceled: true, phase: "中止しました", progress: 0 }
        : null,
    );
    showOcrToast("読み取りを中止しました");
  };

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const firstReceipt = createReceiptPreviews[0];
    if (!firstReceipt) {
      lastOcrTargetReceiptIdRef.current = null;
      return;
    }
    if (isReadingReceipt) return;
    if (lastOcrTargetReceiptIdRef.current === firstReceipt.id) return;
    lastOcrTargetReceiptIdRef.current = firstReceipt.id;
    void runReceiptOcr("auto_select");
  }, [createReceiptPreviews, isCreateModalOpen, isReadingReceipt]);

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
            <div className="suggestion-anchor">
              {ocrToastMessage && <div className="inline-toast">{ocrToastMessage}</div>}
            </div>
            <ReceiptImagePicker
              previews={createReceiptPreviews}
              onAddFiles={addCreateReceiptFiles}
              onRemovePreview={removeCreateReceiptPreview}
            />
            {isOcrDebugEnabled && (
              <details className="ocr-debug-panel" open={isOcrDebugOpen}>
                <summary
                  className="ocr-debug-toggle"
                  onClick={(event) => {
                    event.preventDefault();
                    setIsOcrDebugOpen((prev) => !prev);
                  }}
                >
                  OCRデバッグを表示
                </summary>
                {isOcrDebugOpen && (
                  <div className="ocr-debug-content">
                    <div className="ocr-debug-actions">
                      <button
                        type="button"
                        className="button button-small button-secondary"
                        onClick={() => copyTextToClipboard(ocrDebug?.rawText ?? "")}
                      >
                        OCR生テキストをコピー
                      </button>
                      <button
                        type="button"
                        className="button button-small button-secondary"
                        onClick={() => copyTextToClipboard(buildOcrDebugCopyText(ocrDebug))}
                      >
                        デバッグ結果をコピー
                      </button>
                    </div>
                    <p className="ocr-debug-meta">
                      実行結果: {ocrDebug?.success ? "成功" : "失敗"} / OCR対象: {ocrDebug ? `${ocrDebug.sourceImageIndex + 1}枚目` : "未実行"}
                    </p>
                    <p className="ocr-debug-meta">
                      起動: {ocrDebug?.trigger ?? "(なし)"} / 中止: {ocrDebug?.canceled ? "はい" : "いいえ"} / 反映金額:{" "}
                      {ocrDebug?.appliedAmount ?? "(なし)"} / フェーズ: {ocrDebug?.phase ?? "(なし)"} / 進捗:{" "}
                      {ocrDebug?.progress !== undefined ? `${Math.round(ocrDebug.progress * 100)}%` : "(なし)"}
                    </p>
                    <div className="ocr-debug-block">
                      <h4>前処理（自動トリミング）</h4>
                      <p className="ocr-debug-meta">
                        状態: {ocrDebug?.preprocess.status ?? "(なし)"} / 使用画像: {ocrDebug?.preprocess.usedImage ?? "(なし)"} / 詳細:{" "}
                        {ocrDebug?.preprocess.message ?? "(なし)"}
                      </p>
                      {ocrDebug?.preprocess.detectedRect && (
                        <p className="ocr-debug-meta">
                          検出矩形: x={ocrDebug.preprocess.detectedRect.x}, y={ocrDebug.preprocess.detectedRect.y}, w=
                          {ocrDebug.preprocess.detectedRect.width}, h={ocrDebug.preprocess.detectedRect.height}
                        </p>
                      )}
                      <div className="ocr-debug-image-grid">
                        <figure>
                          <figcaption>元画像</figcaption>
                          {ocrDebug?.preprocess.sourcePreviewDataUrl ? (
                            <img src={ocrDebug.preprocess.sourcePreviewDataUrl} alt="OCR前処理前の元画像" />
                          ) : (
                            <div className="ocr-debug-image-placeholder">(なし)</div>
                          )}
                        </figure>
                        <figure>
                          <figcaption>トリミング後</figcaption>
                          {ocrDebug?.preprocess.processedPreviewDataUrl ? (
                            <img src={ocrDebug.preprocess.processedPreviewDataUrl} alt="OCR前処理後の画像" />
                          ) : (
                            <div className="ocr-debug-image-placeholder">(なし)</div>
                          )}
                        </figure>
                      </div>
                    </div>
                    <div className="ocr-debug-block">
                      <h4>OCR生テキスト</h4>
                      <pre>{ocrDebug?.rawText || "(なし)"}</pre>
                    </div>
                    <div className="ocr-debug-block">
                      <h4>正規化後テキスト</h4>
                      <pre>{ocrDebug?.normalizedText || "(なし)"}</pre>
                    </div>
                    <div className="ocr-debug-block">
                      <h4>行分解結果</h4>
                      <ul>
                        {(ocrDebug?.lines ?? []).map((line) => (
                          <li key={`line-${line.index}`}>
                            [{line.index}] {line.text}
                          </li>
                        ))}
                        {(ocrDebug?.lines ?? []).length === 0 && <li>(なし)</li>}
                      </ul>
                    </div>
                    <div className="ocr-debug-block">
                      <h4>金額候補</h4>
                      <p className="ocr-debug-meta">採用: {ocrDebug?.selectedAmount ?? "(なし)"} / score: {ocrDebug?.selectedAmountScore ?? "(なし)"}</p>
                      <ul>
                        {(ocrDebug?.amountCandidates ?? []).map((candidate, index) => (
                          <li key={`amount-${candidate.lineIndex}-${index}`} className={candidate.value === ocrDebug?.selectedAmount ? "selected" : ""}>
                            値: {candidate.value} / score: {candidate.score} / line: [{candidate.lineIndex}] {candidate.lineText} / reason: {candidate.reason.join(", ")}
                          </li>
                        ))}
                        {(ocrDebug?.amountCandidates ?? []).length === 0 && <li>(なし)</li>}
                      </ul>
                    </div>
                    <div className="ocr-debug-block">
                      <h4>タイトル候補</h4>
                      <p className="ocr-debug-meta">採用: {ocrDebug?.selectedTitle ?? "(なし)"} / score: {ocrDebug?.selectedTitleScore ?? "(なし)"}</p>
                      <ul>
                        {(ocrDebug?.titleCandidates ?? []).map((candidate, index) => (
                          <li key={`title-${candidate.lineIndex}-${index}`} className={candidate.title === ocrDebug?.selectedTitle ? "selected" : ""}>
                            候補: {candidate.title} / score: {candidate.score} / line: [{candidate.lineIndex}] {candidate.lineText} / reason: {candidate.reason.join(", ")}
                          </li>
                        ))}
                        {(ocrDebug?.titleCandidates ?? []).length === 0 && <li>(なし)</li>}
                      </ul>
                    </div>
                  </div>
                )}
              </details>
            )}
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

      {isCreateModalOpen && isReadingReceipt && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <section className="modal-panel ocr-progress-modal" onClick={(event) => event.stopPropagation()}>
            <h3>レシートから金額を読み取り中です</h3>
            <p className="muted">完了までしばらくお待ちください。中止して手入力に切り替えることもできます。</p>
            <p className="ocr-progress-phase">{ocrPhaseLabel}</p>
            <div className="ocr-progress-track" aria-hidden="true">
              <div className="ocr-progress-fill" style={{ width: `${Math.max(5, Math.round(ocrProgress * 100))}%` }} />
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={cancelReceiptOcr}>
                中止
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
