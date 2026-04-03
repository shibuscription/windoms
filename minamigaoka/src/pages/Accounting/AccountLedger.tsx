import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ledgerRowsForAccount, transactionMemoSuggestions } from "../../accounting/calc";
import { formatMoney } from "../../accounting/format";
import { buildAccountingFiscalYearRange } from "../../accounting/fiscalYear";
import type { TransactionType } from "../../accounting/model";
import { useAccountingStore } from "../../accounting/useAccountingStore";
import { LinkifiedText } from "../../components/LinkifiedText";
import { TransactionForm } from "./TransactionForm";

type AccountLedgerProps = {
  isAdmin: boolean;
};

export function AccountLedger({ isAdmin }: AccountLedgerProps) {
  const { store, addTransaction, loading, error } = useAccountingStore();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<TransactionType | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const periodId = searchParams.get("period") ?? store.currentPeriodId ?? "";
  const accountId = searchParams.get("account") ?? "";
  const period = store.periods.find((item) => item.periodId === periodId);
  const account = period?.accounts.find((item) => item.accountId === accountId);

  if (loading) {
    return (
      <section className="card accounting-page">
        <h1>口座通帳</h1>
        <p className="muted">会計データを読み込んでいます...</p>
      </section>
    );
  }

  if (!period || !account) {
    return (
      <section className="card accounting-page">
        <h1>口座通帳</h1>
        {error && <p className="field-error">{error}</p>}
        <p>対象データが見つかりません。</p>
        <Link to="/accounting" className="button">
          会計トップへ戻る
        </Link>
      </section>
    );
  }

  const rows = ledgerRowsForAccount(period, accountId);
  const transactionLocked = period.state === "closed";
  const memoSuggestions =
    mode === "income" || mode === "expense" ? transactionMemoSuggestions(store.periods, mode) : [];
  const fiscalRange = buildAccountingFiscalYearRange(period.fiscalYear);

  return (
    <section className="card accounting-page">
      <div className="accounting-ledger-heading">
        <h1>口座通帳：{account.label}</h1>
        <p className="muted">
          {period.label} / {fiscalRange.startDate} - {fiscalRange.endDate}
        </p>
      </div>
      {error && <p className="field-error">{error}</p>}
      {submitError && <p className="field-error">{submitError}</p>}
      {isAdmin && (
        <>
          <div className="accounting-action-row accounting-action-row-fixed">
            <button
              type="button"
              className="button accounting-action-button accounting-action-income"
              disabled={transactionLocked}
              onClick={() => setMode("income")}
            >
              <span className="accounting-action-icon">➕</span>
              <span>収入</span>
            </button>
            <button
              type="button"
              className="button accounting-action-button accounting-action-expense"
              disabled={transactionLocked}
              onClick={() => setMode("expense")}
            >
              <span className="accounting-action-icon">➖</span>
              <span>支出</span>
            </button>
            <button
              type="button"
              className="button accounting-action-button accounting-action-transfer"
              disabled={transactionLocked}
              onClick={() => setMode("transfer")}
            >
              <span className="accounting-action-icon">🔄</span>
              <span>振替</span>
            </button>
          </div>
          {transactionLocked && <p className="muted">確定済み期は仕訳できません（閲覧のみ）。</p>}
        </>
      )}
      <div className="accounting-small-links">
        <Link to="/accounting" className="button button-small button-secondary">
          会計トップ
        </Link>
        <Link to={`/accounting/report?period=${period.periodId}`} className="button button-small button-secondary">
          収支計算書
        </Link>
      </div>
      <div className="accounting-ledger-table-wrap">
        <table className="accounting-ledger-table">
          <thead>
            <tr>
              <th>日付</th>
              <th>種別</th>
              <th>科目</th>
              <th>摘要 / 備考</th>
              <th>金額</th>
              <th>残高</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{period.startDate}</td>
              <td>期首</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>{formatMoney(account.openingBalance)}</td>
            </tr>
            {rows.map((row) => (
              <tr key={row.transactionId}>
                <td>{row.date}</td>
                <td>{row.kindLabel}</td>
                <td>{row.subjectLabel}</td>
                <td>
                  {row.memo ? <LinkifiedText text={row.memo} className="todo-linkified-text" /> : "-"}
                </td>
                <td>{formatMoney(row.signedAmount)}</td>
                <td>{formatMoney(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin && mode && (
        <TransactionForm
          mode={mode}
          period={period}
          defaultAccountId={mode === "transfer" ? "" : account.accountId}
          defaultFromAccountId={mode === "transfer" ? account.accountId : ""}
          defaultToAccountId=""
          memoSuggestions={memoSuggestions}
          onClose={() => setMode(null)}
          onSubmit={async (payload) => {
            setSubmitError(null);
            try {
              await addTransaction({
                periodId: period.periodId,
                type: mode,
                ...payload,
              });
              setMode(null);
            } catch (error) {
              const message = error instanceof Error ? error.message : "保存に失敗しました。";
              setSubmitError(message);
              throw error;
            }
          }}
        />
      )}
    </section>
  );
}
