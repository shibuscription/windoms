import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  reportCategoryGroups,
  totalClosingBalance,
  totalExpense,
  totalIncome,
  totalOpeningBalance,
} from "../../accounting/calc";
import { buildAccountingFiscalYearRange } from "../../accounting/fiscalYear";
import { formatMoney } from "../../accounting/format";
import { useAccountingStore } from "../../accounting/useAccountingStore";
import { siteConfig } from "../../config/site";

type DraftNotes = Record<string, string>;

export function AccountingReport() {
  const { store, loading, error, saveAccountingReportNote } = useAccountingStore();
  const [searchParams] = useSearchParams();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<DraftNotes>({});
  const periodId = searchParams.get("period") ?? store.currentPeriodId ?? "";
  const period = store.periods.find((item) => item.periodId === periodId);

  const incomeGroups = useMemo(
    () => (period ? reportCategoryGroups(period, "income", store.reportNotes) : []),
    [period, store.reportNotes],
  );
  const expenseGroups = useMemo(
    () => (period ? reportCategoryGroups(period, "expense", store.reportNotes) : []),
    [period, store.reportNotes],
  );

  if (loading) {
    return (
      <section className="card accounting-page">
        <h1>収支計算書</h1>
        <p className="muted">会計データを読み込んでいます...</p>
      </section>
    );
  }

  if (!period) {
    return (
      <section className="card accounting-page">
        <h1>収支計算書</h1>
        {error && <p className="field-error">{error}</p>}
        <p>対象期が見つかりません。</p>
        <Link to="/accounting" className="button">
          会計トップへ戻る
        </Link>
      </section>
    );
  }

  const carryIn = totalOpeningBalance(period);
  const currentIncomeTotal = totalIncome(period);
  const incomeTotal = currentIncomeTotal + carryIn;
  const currentExpenseTotal = totalExpense(period);
  const carryOut = totalClosingBalance(period);
  const expenseTotal = currentExpenseTotal + carryOut;
  const fiscalRange = buildAccountingFiscalYearRange(period.fiscalYear);

  const noteValueFor = (subjectId: string, currentNote: string) =>
    draftNotes[subjectId] !== undefined ? draftNotes[subjectId] : currentNote;

  const saveNote = async (
    type: "income" | "expense",
    categoryId: string,
    subjectId: string,
    note: string,
  ) => {
    setSaveMessage(null);
    setSaveError(null);
    setSavingKey(subjectId);
    try {
      await saveAccountingReportNote({
        periodId: period.periodId,
        type,
        categoryId,
        subjectId,
        note,
      });
      setDraftNotes((current) => {
        const next = { ...current };
        delete next[subjectId];
        return next;
      });
      setSaveMessage("帳票用摘要を保存しました。");
    } catch (nextError) {
      setSaveError(nextError instanceof Error ? nextError.message : "帳票用摘要の保存に失敗しました。");
    } finally {
      setSavingKey(null);
    }
  };

  const renderSection = (
    title: string,
    type: "income" | "expense",
    groups: typeof incomeGroups,
  ) => (
    <section className="accounting-report-card">
      <h2>{title}</h2>
      <table className="accounting-report-table">
        <thead>
          <tr>
            <th className="accounting-report-col-subject">科目</th>
            <th className="accounting-report-col-note">帳票用摘要</th>
            <th className="accounting-report-col-amount">金額</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <FragmentCategory
              key={group.categoryId}
              categoryLabel={group.categoryLabel}
              rows={group.items.map((item) => ({
                ...item,
                inputValue: noteValueFor(item.subjectId, item.note),
              }))}
              onChangeNote={(subjectId, value) =>
                setDraftNotes((current) => ({
                  ...current,
                  [subjectId]: value,
                }))
              }
              onSaveNote={(categoryId, subjectId, note) => saveNote(type, categoryId, subjectId, note)}
              savingKey={savingKey}
            />
          ))}
        </tbody>
      </table>
    </section>
  );

  return (
    <section className="card accounting-page accounting-report-page">
      <h1>{period.fiscalYear}年度 収支計算書</h1>
      <p className="muted">団体名: {siteConfig.organizationName}</p>
      <p className="muted">
        会計期間: {fiscalRange.startDate} - {fiscalRange.endDate}
      </p>

      <div className="accounting-small-links print-hidden">
        <Link to="/accounting" className="button button-small button-secondary">
          会計トップ
        </Link>
        <button type="button" className="button button-small" onClick={() => window.print()}>
          PDF出力
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}
      {saveError && <p className="field-error">{saveError}</p>}
      {saveMessage && <p className="muted">{saveMessage}</p>}

      <div className="accounting-report-summary">
        <div className="accounting-report-total-row">
          <span>前年度繰越金</span>
          <strong>{formatMoney(carryIn)}</strong>
        </div>
        <div className="accounting-report-total-row">
          <span>当期収入合計</span>
          <strong>{formatMoney(currentIncomeTotal)}</strong>
        </div>
        <div className="accounting-report-total-row is-strong">
          <span>収入合計</span>
          <strong>{formatMoney(incomeTotal)}</strong>
        </div>
        <div className="accounting-report-total-row">
          <span>当期支出合計</span>
          <strong>{formatMoney(currentExpenseTotal)}</strong>
        </div>
        <div className="accounting-report-total-row">
          <span>次年度繰越金</span>
          <strong>{formatMoney(carryOut)}</strong>
        </div>
        <div className="accounting-report-total-row is-strong">
          <span>支出合計</span>
          <strong>{formatMoney(expenseTotal)}</strong>
        </div>
      </div>

      <div className="accounting-report-sections">
        {renderSection("収入の部", "income", incomeGroups)}
        {renderSection("支出の部", "expense", expenseGroups)}
      </div>

      <div className="accounting-signature">
        <div>会長署名 ____________________</div>
        <div>会計署名 ____________________</div>
      </div>
    </section>
  );
}

type FragmentCategoryProps = {
  categoryLabel: string;
  rows: Array<{
    categoryId: string;
    subjectId: string;
    subjectLabel: string;
    amount: number;
    inputValue: string;
  }>;
  savingKey: string | null;
  onChangeNote: (subjectId: string, value: string) => void;
  onSaveNote: (categoryId: string, subjectId: string, note: string) => Promise<void>;
};

function FragmentCategory({
  categoryLabel,
  rows,
  savingKey,
  onChangeNote,
  onSaveNote,
}: FragmentCategoryProps) {
  return (
    <>
      <tr className="accounting-report-category-row">
        <th colSpan={3}>{categoryLabel}</th>
      </tr>
      {rows.map((item) => (
        <tr key={item.subjectId}>
          <td className="accounting-report-subject-cell">{item.subjectLabel}</td>
          <td className="accounting-report-note-cell">
            <div className="accounting-report-note-editor">
              <textarea
                value={item.inputValue}
                onChange={(event) => onChangeNote(item.subjectId, event.target.value)}
                rows={2}
                placeholder="帳票用摘要を入力"
              />
              <button
                type="button"
                className="button button-small button-secondary print-hidden"
                onClick={() => void onSaveNote(item.categoryId, item.subjectId, item.inputValue)}
                disabled={savingKey === item.subjectId}
              >
                {savingKey === item.subjectId ? "保存中..." : "保存"}
              </button>
            </div>
          </td>
          <td className="accounting-report-amount-cell">{formatMoney(item.amount)}</td>
        </tr>
      ))}
    </>
  );
}
