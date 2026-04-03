import { useState } from "react";
import { Link } from "react-router-dom";
import { balancesByAccount, monthlyExpenseByMonth, totalExpense, totalIncome } from "../../accounting/calc";
import { formatMoney } from "../../accounting/format";
import type { TransactionType } from "../../accounting/model";
import { useAccountingStore } from "../../accounting/useAccountingStore";
import { TransactionForm } from "./TransactionForm";

export function AccountingHome() {
  const { currentPeriod, addTransaction, loading, error } = useAccountingStore();
  const [mode, setMode] = useState<TransactionType | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (loading) {
    return (
      <section className="card accounting-page">
        <h1>会計</h1>
        <p className="muted">会計データを読み込んでいます...</p>
      </section>
    );
  }

  if (!currentPeriod) {
    return (
      <section className="card accounting-page">
        <h1>会計</h1>
        {error && <p className="field-error">{error}</p>}
        <div className="empty-state">
          <p>現在の会計期はまだ設定されていません。</p>
          <p className="muted">現在期として扱う `editing` の会計期を1件用意すると、ここに内容を表示できます。</p>
          <div className="accounting-small-links">
            <Link to="/accounting/periods" className="button button-small button-secondary">
              期管理へ
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const balances = balancesByAccount(currentPeriod);
  const income = totalIncome(currentPeriod);
  const expense = totalExpense(currentPeriod);
  const diff = income - expense;
  const transactionLocked = currentPeriod.state === "closed";
  const expenseByMonth = monthlyExpenseByMonth(currentPeriod);
  const maxGraphValue = Math.max(...expenseByMonth.map((item) => item.value), 1);

  return (
    <section className="card accounting-page">
      <h1>会計</h1>
      <p className="muted">現在の期: {currentPeriod.label}</p>
      {error && <p className="field-error">{error}</p>}
      {submitError && <p className="field-error">{submitError}</p>}

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

      <section className="card accounting-subcard">
        <h3 className="accounting-section-heading">口座一覧</h3>
        <ul className="accounting-account-list">
          {currentPeriod.accounts
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((account) => (
              <li key={account.accountId} className="accounting-account-row">
                <Link
                  to={`/accounting/ledger?period=${currentPeriod.periodId}&account=${account.accountId}`}
                  className="accounting-account-row-main"
                >
                  <span>{account.label}</span>
                  <strong>{formatMoney(balances[account.accountId] ?? 0)}</strong>
                </Link>
                <button
                  type="button"
                  className="button button-small button-secondary"
                  disabled
                  title="口座名編集（今後実装）"
                  aria-label={`${account.label}を編集（未実装）`}
                >
                  ✎
                </button>
              </li>
            ))}
          {currentPeriod.accounts.length === 0 && <li className="muted">表示できる口座がありません。</li>}
        </ul>
      </section>

      <section className="card accounting-subcard">
        <h3 className="accounting-section-heading">今期の収支</h3>
        <div className="accounting-summary accounting-summary-right">
          <div>
            <span className="muted">収入合計</span>
            <strong>{formatMoney(income)}</strong>
          </div>
          <div>
            <span className="muted">支出合計</span>
            <strong>{formatMoney(expense)}</strong>
          </div>
          <div>
            <span className="muted">差額</span>
            <strong className={diff < 0 ? "accounting-amount-negative" : undefined}>{formatMoney(diff)}</strong>
          </div>
        </div>
      </section>

      <section className="card accounting-subcard">
        <h3 className="accounting-section-heading">月別支出グラフ</h3>
        <div className="accounting-graph-list">
          {expenseByMonth.map((item) => (
            <div key={item.month} className="accounting-graph-row">
              <span className="accounting-graph-label">{item.month}</span>
              <div className="accounting-graph-track" role="img" aria-label={`${item.month}の支出`}> 
                <div className="accounting-graph-bar" style={{ width: `${(item.value / maxGraphValue) * 100}%` }} />
              </div>
              <span className="accounting-graph-value">{formatMoney(item.value)}</span>
            </div>
          ))}
          {expenseByMonth.length === 0 && <p className="muted">支出データはありません。</p>}
        </div>
      </section>

      <div className="accounting-small-links">
        <Link to={`/accounting/report?period=${currentPeriod.periodId}`} className="button button-small button-secondary">
          収支計算書
        </Link>
        <Link to="/accounting/periods" className="button button-small button-secondary">
          期管理
        </Link>
      </div>

      {mode && (
        <TransactionForm
          mode={mode}
          period={currentPeriod}
          onClose={() => setMode(null)}
          onSubmit={async (payload) => {
            setSubmitError(null);
            try {
              await addTransaction({
                periodId: currentPeriod.periodId,
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
