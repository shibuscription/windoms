import { useEffect, useMemo, useRef, useState } from "react";
import { FIXED_CATEGORIES } from "../../accounting/fixedCategories";
import { todayYmd } from "../../accounting/format";
import type { AccountingPeriod, TransactionType } from "../../accounting/model";
import { ReceiptImagePicker } from "../../components/ReceiptImagePicker";
import { useReceiptPreviews } from "../../hooks/useReceiptPreviews";
import { ReceiptOcrCanceledError, readReceiptSuggestion } from "../../utils/receiptOcr";

type Props = {
  mode: TransactionType;
  period: AccountingPeriod;
  onClose: () => void;
  onSubmit: (input: {
    date: string;
    amount: number;
    categoryId?: string;
    memo?: string;
    accountId?: string;
    fromAccountId?: string;
    toAccountId?: string;
    files?: File[];
  }) => Promise<void>;
};

type FormErrors = {
  date?: string;
  amount?: string;
  categoryId?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  submit?: string;
};

const titleMap: Record<TransactionType, string> = {
  income: "収入を登録",
  expense: "支出を登録",
  transfer: "振替を登録",
};

export function TransactionForm({ mode, period, onClose, onSubmit }: Props) {
  const [date, setDate] = useState<string>(todayYmd());
  const [amount, setAmount] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReadingReceipt, setIsReadingReceipt] = useState(false);
  const [ocrMessage, setOcrMessage] = useState("");
  const [ocrPhaseLabel, setOcrPhaseLabel] = useState("画像を準備中");
  const [ocrProgress, setOcrProgress] = useState(0);
  const ocrRunIdRef = useRef(0);
  const ocrToastTimerRef = useRef<number | null>(null);
  const { previews, addFiles, removePreview, clearPreviews } = useReceiptPreviews();

  const categoryOptions = useMemo(
    () => FIXED_CATEGORIES.filter((item) => (mode === "income" ? item.categoryId.startsWith("income_") : item.categoryId.startsWith("expense_"))),
    [mode],
  );

  useEffect(() => {
    return () => {
      if (ocrToastTimerRef.current !== null) {
        window.clearTimeout(ocrToastTimerRef.current);
      }
    };
  }, []);

  const showOcrMessage = (message: string) => {
    setOcrMessage(message);
    if (ocrToastTimerRef.current !== null) {
      window.clearTimeout(ocrToastTimerRef.current);
    }
    ocrToastTimerRef.current = window.setTimeout(() => {
      setOcrMessage("");
      ocrToastTimerRef.current = null;
    }, 2000);
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!date) next.date = "日付は必須です";
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) next.amount = "金額は正の数で入力してください";
    if (mode !== "transfer" && !categoryId) next.categoryId = "科目を選択してください";
    if (mode === "income" && !accountId) next.accountId = "入金口座を選択してください";
    if (mode === "expense" && !accountId) next.accountId = "出金口座を選択してください";
    if (mode === "transfer") {
      if (!fromAccountId) next.fromAccountId = "出金口座を選択してください";
      if (!toAccountId) next.toAccountId = "入金口座を選択してください";
      if (fromAccountId && toAccountId && fromAccountId === toAccountId) {
        next.toAccountId = "同一口座は選択できません";
      }
    }
    return next;
  };

  const submit = async () => {
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const parsedAmount = Number(amount);
    try {
      setIsSubmitting(true);
      await onSubmit({
        date,
        amount: parsedAmount,
        categoryId: mode === "transfer" ? undefined : categoryId,
        memo: memo.trim() || undefined,
        accountId: mode === "transfer" ? undefined : accountId,
        fromAccountId: mode === "transfer" ? fromAccountId : undefined,
        toAccountId: mode === "transfer" ? toAccountId : undefined,
        files: mode === "transfer" ? [] : previews.map((item) => item.file),
      });
      clearPreviews();
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        submit: error instanceof Error ? error.message : "保存に失敗しました。",
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const runReceiptOcr = async () => {
    const firstReceipt = previews[0];
    if (!firstReceipt) {
      showOcrMessage("画像を選択してください");
      return;
    }

    const runId = ocrRunIdRef.current + 1;
    ocrRunIdRef.current = runId;
    setIsReadingReceipt(true);
    setOcrPhaseLabel("画像を準備中");
    setOcrProgress(0.08);

    try {
      const suggestion = await readReceiptSuggestion(firstReceipt.file, {
        shouldCancel: () => ocrRunIdRef.current !== runId,
        onProgress: (phase, progress) => {
          if (ocrRunIdRef.current !== runId) return;
          setOcrPhaseLabel(phase);
          setOcrProgress(progress);
        },
      });
      if (ocrRunIdRef.current !== runId) return;
      if (!suggestion || suggestion.amount === null) {
        showOcrMessage("金額を読み取れませんでした");
        return;
      }
      setAmount(String(suggestion.amount));
      setErrors((prev) => ({ ...prev, amount: undefined }));
      showOcrMessage("画像から金額を入力しました");
    } catch (error) {
      if (error instanceof ReceiptOcrCanceledError || ocrRunIdRef.current !== runId) return;
      showOcrMessage("金額を読み取れませんでした");
    } finally {
      if (ocrRunIdRef.current !== runId) return;
      setIsReadingReceipt(false);
      setOcrPhaseLabel("画像を準備中");
      setOcrProgress(0);
    }
  };

  const cancelReceiptOcr = () => {
    if (!isReadingReceipt) return;
    ocrRunIdRef.current += 1;
    setIsReadingReceipt(false);
    setOcrProgress(0);
    setOcrPhaseLabel("中止しました");
    showOcrMessage("読み取りを中止しました");
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-panel accounting-modal-panel">
        <button type="button" className="modal-close" aria-label="閉じる" title="閉じる" onClick={onClose}>
          ×
        </button>
        <h3>{titleMap[mode]}</h3>
        <label>
          日付
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          {errors.date && <span className="field-error">{errors.date}</span>}
        </label>
        <label>
          金額
          <input type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} />
          {errors.amount && <span className="field-error">{errors.amount}</span>}
        </label>
        {mode !== "transfer" && (
          <>
            <ReceiptImagePicker previews={previews} onAddFiles={addFiles} onRemovePreview={removePreview} title="添付画像（任意・複数）" />
            <div className="suggestion-anchor">
              {ocrMessage && <div className="inline-toast">{ocrMessage}</div>}
            </div>
            {previews.length > 0 && (
              <div className="receipt-ocr-row">
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => void runReceiptOcr()}
                  disabled={isReadingReceipt}
                >
                  画像から金額を読み取る
                </button>
              </div>
            )}
          </>
        )}
        {mode !== "transfer" && (
          <label>
            科目
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">選択してください</option>
              {categoryOptions.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.label}
                </option>
              ))}
            </select>
            {errors.categoryId && <span className="field-error">{errors.categoryId}</span>}
          </label>
        )}
        {mode !== "transfer" && (
          <label>
            {mode === "income" ? "入金口座" : "出金口座"}
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">選択してください</option>
              {period.accounts
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.label}
                  </option>
                ))}
            </select>
            {errors.accountId && <span className="field-error">{errors.accountId}</span>}
          </label>
        )}
        {mode === "transfer" && (
          <>
            <label>
              出金口座
              <select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>
                <option value="">選択してください</option>
                {period.accounts
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((account) => (
                    <option key={account.accountId} value={account.accountId}>
                      {account.label}
                    </option>
                  ))}
              </select>
              {errors.fromAccountId && <span className="field-error">{errors.fromAccountId}</span>}
            </label>
            <label>
              入金口座
              <select value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>
                <option value="">選択してください</option>
                {period.accounts
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((account) => (
                    <option key={account.accountId} value={account.accountId}>
                      {account.label}
                    </option>
                  ))}
              </select>
              {errors.toAccountId && <span className="field-error">{errors.toAccountId}</span>}
            </label>
          </>
        )}
        <label>
          メモ
          <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="任意" />
        </label>
        {errors.submit && <p className="field-error">{errors.submit}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={isSubmitting || isReadingReceipt}>
            キャンセル
          </button>
          <button type="button" className="button" onClick={() => void submit()} disabled={isSubmitting || isReadingReceipt}>
            登録する
          </button>
        </div>
      </section>
      {isReadingReceipt && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <section className="modal-panel ocr-progress-modal" onClick={(event) => event.stopPropagation()}>
            <h3>画像から金額を読み取り中です</h3>
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
    </div>
  );
}
