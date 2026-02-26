import { Link } from "react-router-dom";
import { totalClosingBalance, totalExpense, totalIncome } from "../../accounting/calc";
import { formatMoney } from "../../accounting/format";
import { useAccountingStore } from "../../accounting/useAccountingStore";

export function AccountingPeriods() {
  const { periodsSorted, currentPeriod, setCurrentPeriod } = useAccountingStore();

  return (
    <section className="card accounting-page">
      <h1>過去期一覧</h1>
      <div className="accounting-small-links">
        <Link to="/accounting" className="button button-small button-secondary">
          会計トップ
        </Link>
      </div>
      <div className="accounting-period-list">
        {periodsSorted.map((period) => (
          <article key={period.periodId} className="accounting-period-card">
            <strong>{period.label}</strong>
            <span className="muted">状態: {period.status === "open" ? "編集中" : "締め済み"}</span>
            <span className="muted">
              収入 {formatMoney(totalIncome(period))} / 支出 {formatMoney(totalExpense(period))}
            </span>
            <span className="muted">期末残高 {formatMoney(totalClosingBalance(period))}</span>
            <div className="accounting-small-links">
              <Link to={`/accounting/report?period=${period.periodId}`} className="button button-small button-secondary">
                収支計算書
              </Link>
              {period.accounts[0] && (
                <Link
                  to={`/accounting/ledger?period=${period.periodId}&account=${period.accounts[0].accountKey}`}
                  className="button button-small button-secondary"
                >
                  通帳
                </Link>
              )}
              {period.periodId !== currentPeriod?.periodId && (
                <button
                  type="button"
                  className="button button-small button-secondary"
                  onClick={() => setCurrentPeriod(period.periodId)}
                >
                  この期を現在にする
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
