import { useState } from "react";
import { Link } from "react-router-dom";
import { totalClosingBalance, totalExpense, totalIncome } from "../../accounting/calc";
import { formatMoney } from "../../accounting/format";
import { useAccountingStore } from "../../accounting/useAccountingStore";

type AccountingPeriodsProps = {
  canManageYear: boolean;
};

export function AccountingPeriods({ canManageYear }: AccountingPeriodsProps) {
  const { periodsSorted, currentPeriod, closeCurrentPeriodAndCarryOver, loading, error } = useAccountingStore();
  const [closingError, setClosingError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  if (loading) {
    return (
      <section className="card accounting-page">
        <h1>期管理</h1>
        <p className="muted">期データを読み込んでいます...</p>
      </section>
    );
  }

  const pastPeriods = periodsSorted.filter((period) => period.periodId !== currentPeriod?.periodId && period.state === "closed");

  const submitClose = async () => {
    try {
      setClosingError(null);
      setIsClosing(true);
      await closeCurrentPeriodAndCarryOver();
    } catch (nextError) {
      setClosingError(nextError instanceof Error ? nextError.message : "年度締めに失敗しました。");
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <section className="card accounting-page">
      <h1>期管理</h1>
      {error && <p className="field-error">{error}</p>}
      {closingError && <p className="field-error">{closingError}</p>}
      <div className="accounting-small-links">
        <Link to="/accounting" className="button button-small button-secondary">
          会計トップ
        </Link>
      </div>

      <section className="card accounting-subcard">
        <h3 className="accounting-section-heading">現在の期</h3>
        {currentPeriod ? (
          <>
            <strong>{currentPeriod.label}</strong>
            <span className="muted">状態: {currentPeriod.state === "editing" ? "editing" : "closed"}</span>
            <span className="muted">
              収入 {formatMoney(totalIncome(currentPeriod))} / 支出 {formatMoney(totalExpense(currentPeriod))}
            </span>
            <span className="muted">期末残高 {formatMoney(totalClosingBalance(currentPeriod))}</span>
            {currentPeriod.state === "editing" ? (
              canManageYear ? (
                <button type="button" className="button" onClick={() => void submitClose()} disabled={isClosing}>
                  年度を締めて繰越
                </button>
              ) : (
                <p className="muted">年度締めは権限者（会長・会計）のみ実行できます。</p>
              )
            ) : (
              <p className="muted">現在の期は確定済みです（閲覧のみ）。</p>
            )}
          </>
        ) : (
          <p className="muted">現在の期はまだ設定されていません。</p>
        )}
      </section>

      <section className="card accounting-subcard">
        <h3 className="accounting-section-heading">過去の期一覧（確定済み）</h3>
        <div className="accounting-period-list">
          {pastPeriods.length === 0 && <p className="muted">まだ過去期はありません。</p>}
          {pastPeriods.map((period) => (
            <article key={period.periodId} className="accounting-period-card">
              <strong>{period.label}</strong>
              <span className="muted">状態: {period.state === "editing" ? "editing" : "closed"}</span>
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
                    to={`/accounting/ledger?period=${period.periodId}&account=${period.accounts[0].accountId}`}
                    className="button button-small button-secondary"
                  >
                    通帳
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
