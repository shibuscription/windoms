import { Link } from "react-router-dom";
import { balancesByAccount, expenseTopSubjects, totalExpense, totalIncome } from "../../accounting/calc";
import { formatMoney } from "../../accounting/format";
import { readDemoRole } from "../../utils/activityPlan";
import { PeriodClose } from "./PeriodClose";
import { TransactionForm } from "./TransactionForm";
import { useState } from "react";
import type { TransactionType } from "../../accounting/model";
import { useAccountingStore } from "../../accounting/useAccountingStore";

export function AccountingHome() {
  const {
    currentPeriod,
    addTransaction,
    closeCurrentPeriodAndCarryOver,
    reopenPeriod,
    updatePeriodAccount,
  } = useAccountingStore();
  const [mode, setMode] = useState<TransactionType | null>(null);
  const canManageYear = readDemoRole() === "admin";

  if (!currentPeriod) {
    return (
      <section className="card">
        <h1>会計</h1>
        <p>会計データを初期化できませんでした。</p>
      </section>
    );
  }

  const balances = balancesByAccount(currentPeriod);
  const income = totalIncome(currentPeriod);
  const expense = totalExpense(currentPeriod);
  const diff = income - expense;
  const topExpense = expenseTopSubjects(currentPeriod, 5);
  const transactionLocked = currentPeriod.status === "closed";

  return (
    <section className="card accounting-page">
      <h1>会計</h1>
      <p className="muted">現在の期: {currentPeriod.label}</p>

      <div className="accounting-action-row">
        <button type="button" className="button" disabled={transactionLocked} onClick={() => setMode("income")}>
          ＋収入
        </button>
        <button type="button" className="button" disabled={transactionLocked} onClick={() => setMode("expense")}>
          －支出
        </button>
        <button type="button" className="button" disabled={transactionLocked} onClick={() => setMode("transfer")}>
          ⇄振替
        </button>
      </div>
      {transactionLocked && <p className="muted">締め済みの期は取引を追加できません。</p>}

      <div className="accounting-account-grid">
        {currentPeriod.accounts
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((account) => (
            <Link
              key={account.accountKey}
              to={`/accounting/ledger?period=${currentPeriod.periodId}&account=${account.accountKey}`}
              className="accounting-account-card"
            >
              <strong>{account.label}</strong>
              <span>{formatMoney(balances[account.accountKey] ?? 0)}</span>
            </Link>
          ))}
      </div>

      <div className="accounting-summary">
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
          <strong>{formatMoney(diff)}</strong>
        </div>
      </div>

      <section className="card accounting-subcard">
        <h3>支出の上位科目</h3>
        {topExpense.length === 0 ? (
          <p className="muted">まだ支出がありません</p>
        ) : (
          <ul className="accounting-rank-list">
            {topExpense.map((item) => (
              <li key={item.subjectId}>
                <span>{item.label}</span>
                <strong>{formatMoney(item.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="accounting-small-links">
        <Link to={`/accounting/report?period=${currentPeriod.periodId}`} className="button button-small button-secondary">
          収支計算書
        </Link>
        <Link to="/accounting/periods" className="button button-small button-secondary">
          過去期一覧
        </Link>
      </div>

      <PeriodClose
        period={currentPeriod}
        canManage={canManageYear}
        closePeriod={closeCurrentPeriodAndCarryOver}
        reopenPeriod={reopenPeriod}
        updateAccount={(accountKey, patch) => updatePeriodAccount(currentPeriod.periodId, accountKey, patch)}
      />

      {mode && (
        <TransactionForm
          mode={mode}
          period={currentPeriod}
          onClose={() => setMode(null)}
          onSubmit={(payload) => {
            addTransaction({
              periodId: currentPeriod.periodId,
              type: mode,
              ...payload,
            });
            setMode(null);
          }}
        />
      )}
    </section>
  );
}
