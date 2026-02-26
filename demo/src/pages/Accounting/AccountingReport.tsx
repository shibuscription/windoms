import { Link, useSearchParams } from "react-router-dom";
import {
  reportCategorySummary,
  totalClosingBalance,
  totalExpense,
  totalIncome,
  totalOpeningBalance,
} from "../../accounting/calc";
import { formatMoney } from "../../accounting/format";
import { useAccountingStore } from "../../accounting/useAccountingStore";

export function AccountingReport() {
  const { store } = useAccountingStore();
  const [searchParams] = useSearchParams();
  const periodId = searchParams.get("period") ?? store.currentPeriodId;
  const period = store.periods.find((item) => item.periodId === periodId);

  if (!period) {
    return (
      <section className="card accounting-page">
        <h1>収支計算書</h1>
        <p>対象期が見つかりません。</p>
        <Link to="/accounting" className="button">
          会計トップへ戻る
        </Link>
      </section>
    );
  }

  const incomeCategories = reportCategorySummary(period, "income");
  const expenseCategories = reportCategorySummary(period, "expense");
  const carryIn = totalOpeningBalance(period);
  const carryOut = totalClosingBalance(period);
  const incomeTotal = totalIncome(period) + carryIn;
  const expenseTotal = totalExpense(period) + carryOut;
  const incomeRows = incomeCategories.flatMap((category) => [
    <tr key={`${category.categoryId}-head`}>
      <th colSpan={2}>{category.label}</th>
    </tr>,
    ...category.subjects.map((subject) => (
      <tr key={subject.subjectId}>
        <td>{subject.label}</td>
        <td>{formatMoney(subject.amount)}</td>
      </tr>
    )),
  ]);
  const expenseRows = expenseCategories.flatMap((category) => [
    <tr key={`${category.categoryId}-head`}>
      <th colSpan={2}>{category.label}</th>
    </tr>,
    ...category.subjects.map((subject) => (
      <tr key={subject.subjectId}>
        <td>{subject.label}</td>
        <td>{formatMoney(subject.amount)}</td>
      </tr>
    )),
  ]);

  return (
    <section className="card accounting-page accounting-report-page">
      <h1>{period.fiscalYear}年度 収支計算書</h1>
      <p className="muted">団体名: Windoms DEMO</p>
      <p className="muted">
        会計期間: {period.startDate} - {period.endDate}
      </p>

      <div className="accounting-small-links print-hidden">
        <Link to="/accounting" className="button button-small button-secondary">
          会計トップ
        </Link>
        <button type="button" className="button button-small" onClick={() => window.print()}>
          PDF出力
        </button>
      </div>

      <div className="accounting-report-sections">
        <section>
          <h2>収入の部</h2>
          <table className="accounting-ledger-table">
            <tbody>
              <tr>
                <th>前年度繰越金</th>
                <td>{formatMoney(carryIn)}</td>
              </tr>
              {incomeRows}
              <tr>
                <th>収入合計</th>
                <td>{formatMoney(incomeTotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2>支出の部</h2>
          <table className="accounting-ledger-table">
            <tbody>
              {expenseRows}
              <tr>
                <th>次年度繰越金</th>
                <td>{formatMoney(carryOut)}</td>
              </tr>
              <tr>
                <th>支出合計</th>
                <td>{formatMoney(expenseTotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
      <div className="accounting-signature">
        <div>会長署名: ____________________</div>
        <div>会計署名: ____________________</div>
      </div>
    </section>
  );
}
