import { useMemo, useState } from "react";
import { FIXED_CATEGORIES } from "../../accounting/fixedCategories";
import { FIXED_SUBJECTS, TRANSFER_SUBJECT_ID } from "../../accounting/fixedSubjects";
import { todayYmd } from "../../accounting/format";
import type { AccountingPeriod, TransactionType } from "../../accounting/model";

type Props = {
  mode: TransactionType;
  period: AccountingPeriod;
  onClose: () => void;
  onSubmit: (input: {
    date: string;
    amount: number;
    subjectId: string;
    memo?: string;
    accountKey?: string;
    fromAccountKey?: string;
    toAccountKey?: string;
  }) => void;
};

type FormErrors = {
  date?: string;
  amount?: string;
  subjectId?: string;
  accountKey?: string;
  fromAccountKey?: string;
  toAccountKey?: string;
};

const titleMap: Record<TransactionType, string> = {
  income: "収入を登録",
  expense: "支出を登録",
  transfer: "振替を登録",
};

export function TransactionForm({ mode, period, onClose, onSubmit }: Props) {
  const [date, setDate] = useState<string>(todayYmd());
  const [amount, setAmount] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [accountKey, setAccountKey] = useState<string>("");
  const [fromAccountKey, setFromAccountKey] = useState<string>("");
  const [toAccountKey, setToAccountKey] = useState<string>("");
  const [errors, setErrors] = useState<FormErrors>({});

  const subjectOptions = useMemo(() => {
    if (mode === "income") return FIXED_SUBJECTS.filter((item) => item.type === "income");
    if (mode === "expense") return FIXED_SUBJECTS.filter((item) => item.type === "expense");
    return [];
  }, [mode]);

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!date) next.date = "日付は必須です";
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) next.amount = "金額は正の数で入力してください";
    if (mode !== "transfer" && !subjectId) next.subjectId = "科目を選択してください";
    if (mode === "income" && !accountKey) next.accountKey = "入金口座を選択してください";
    if (mode === "expense" && !accountKey) next.accountKey = "出金口座を選択してください";
    if (mode === "transfer") {
      if (!fromAccountKey) next.fromAccountKey = "出金口座を選択してください";
      if (!toAccountKey) next.toAccountKey = "入金口座を選択してください";
      if (fromAccountKey && toAccountKey && fromAccountKey === toAccountKey) {
        next.toAccountKey = "同一口座は選択できません";
      }
    }
    return next;
  };

  const submit = () => {
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const parsedAmount = Number(amount);
    onSubmit({
      date,
      amount: parsedAmount,
      subjectId: mode === "transfer" ? TRANSFER_SUBJECT_ID : subjectId,
      memo: memo.trim() || undefined,
      accountKey: mode === "transfer" ? undefined : accountKey,
      fromAccountKey: mode === "transfer" ? fromAccountKey : undefined,
      toAccountKey: mode === "transfer" ? toAccountKey : undefined,
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-panel accounting-modal-panel">
        <button type="button" className="modal-close" aria-label="閉じる" onClick={onClose}>
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
          <label>
            科目
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              <option value="">選択してください</option>
              {FIXED_CATEGORIES.map((category) => {
                const subjects = subjectOptions.filter((item) => item.categoryId === category.categoryId);
                if (subjects.length === 0) return null;
                return (
                  <optgroup key={category.categoryId} label={category.label}>
                    {subjects
                      .slice()
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((subject) => (
                        <option key={subject.subjectId} value={subject.subjectId}>
                          {subject.label}
                        </option>
                      ))}
                  </optgroup>
                );
              })}
            </select>
            {errors.subjectId && <span className="field-error">{errors.subjectId}</span>}
          </label>
        )}
        {mode !== "transfer" && (
          <label>
            {mode === "income" ? "入金口座" : "出金口座"}
            <select value={accountKey} onChange={(event) => setAccountKey(event.target.value)}>
              <option value="">選択してください</option>
              {period.accounts
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((account) => (
                  <option key={account.accountKey} value={account.accountKey}>
                    {account.label}
                  </option>
                ))}
            </select>
            {errors.accountKey && <span className="field-error">{errors.accountKey}</span>}
          </label>
        )}
        {mode === "transfer" && (
          <>
            <label>
              出金口座
              <select value={fromAccountKey} onChange={(event) => setFromAccountKey(event.target.value)}>
                <option value="">選択してください</option>
                {period.accounts
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((account) => (
                    <option key={account.accountKey} value={account.accountKey}>
                      {account.label}
                    </option>
                  ))}
              </select>
              {errors.fromAccountKey && <span className="field-error">{errors.fromAccountKey}</span>}
            </label>
            <label>
              入金口座
              <select value={toAccountKey} onChange={(event) => setToAccountKey(event.target.value)}>
                <option value="">選択してください</option>
                {period.accounts
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((account) => (
                    <option key={account.accountKey} value={account.accountKey}>
                      {account.label}
                    </option>
                  ))}
              </select>
              {errors.toAccountKey && <span className="field-error">{errors.toAccountKey}</span>}
            </label>
          </>
        )}
        <label>
          メモ
          <input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="任意" />
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="button" onClick={submit}>
            登録する
          </button>
        </div>
      </section>
    </div>
  );
}
