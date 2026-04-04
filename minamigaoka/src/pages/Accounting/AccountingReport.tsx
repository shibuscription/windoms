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

type ReportType = "income" | "expense";

const noteKey = (type: ReportType, subjectId: string) => `${type}:${subjectId}`;

export function AccountingReport() {
  const { store, loading, error, saveAccountingReportNote } = useAccountingStore();
  const [searchParams] = useSearchParams();
  const [savingKey, setSavingKey] = useState<string | null>(null);
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
        <p className="muted">会計データを読み込み中です...</p>
      </section>
    );
  }

  if (!period) {
    return (
      <section className="card accounting-page">
        <h1>収支計算書</h1>
        {error && <p className="field-error">{error}</p>}
        <p>表示対象の会計期が見つかりません。</p>
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

  const noteValueFor = (type: ReportType, subjectId: string, currentNote: string) =>
    draftNotes[noteKey(type, subjectId)] !== undefined ? draftNotes[noteKey(type, subjectId)] : currentNote;

  const changeNote = (type: ReportType, subjectId: string, value: string) => {
    setDraftNotes((current) => ({
      ...current,
      [noteKey(type, subjectId)]: value,
    }));
  };

  const saveNote = async (
    type: ReportType,
    categoryId: string,
    subjectId: string,
    note: string,
  ) => {
    setSaveError(null);
    const currentKey = noteKey(type, subjectId);
    setSavingKey(currentKey);
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
        delete next[currentKey];
        return next;
      });
    } catch (nextError) {
      setSaveError(nextError instanceof Error ? nextError.message : "帳票用摘要の保存に失敗しました。");
    } finally {
      setSavingKey(null);
    }
  };

  const blurNote = async (
    type: ReportType,
    categoryId: string,
    subjectId: string,
    note: string,
    currentNote: string,
  ) => {
    if (note.trim() === currentNote.trim()) return;
    await saveNote(type, categoryId, subjectId, note);
  };

  const renderSection = (
    title: string,
    type: ReportType,
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
            <ReportCategorySection
              key={group.categoryId}
              type={type}
              categoryLabel={group.categoryLabel}
              rows={group.items.map((item) => ({
                ...item,
                inputValue: noteValueFor(type, item.subjectId, item.note),
              }))}
              savingKey={savingKey}
              onChangeNote={changeNote}
              onBlurNote={blurNote}
              onSaveNote={saveNote}
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
          会計トップへ
        </Link>
        <button type="button" className="button button-small" onClick={() => window.print()}>
          PDF出力
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}
      {saveError && <p className="field-error">{saveError}</p>}

      <div className="accounting-report-summary">
        <section className="accounting-report-summary-group">
          <h2>収入</h2>
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
        </section>
        <section className="accounting-report-summary-group">
          <h2>支出</h2>
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
        </section>
      </div>

      <div className="accounting-report-sections">
        {renderSection("収入の部", "income", incomeGroups)}
        {renderSection("支出の部", "expense", expenseGroups)}
      </div>

      <div className="accounting-signature">
        <div>会長印 ____________________</div>
        <div>会計印 ____________________</div>
      </div>
    </section>
  );
}

type ReportCategorySectionProps = {
  type: ReportType;
  categoryLabel: string;
  rows: Array<{
    categoryId: string;
    subjectId: string;
    subjectLabel: string;
    amount: number;
    note: string;
    inputValue: string;
  }>;
  savingKey: string | null;
  onChangeNote: (type: ReportType, subjectId: string, value: string) => void;
  onBlurNote: (
    type: ReportType,
    categoryId: string,
    subjectId: string,
    note: string,
    currentNote: string,
  ) => Promise<void>;
  onSaveNote: (type: ReportType, categoryId: string, subjectId: string, note: string) => Promise<void>;
};

function ReportCategorySection({
  type,
  categoryLabel,
  rows,
  savingKey,
  onChangeNote,
  onBlurNote,
  onSaveNote,
}: ReportCategorySectionProps) {
  return (
    <>
      <tr className="accounting-report-category-row">
        <th colSpan={3}>{categoryLabel}</th>
      </tr>
      {rows.map((item) => {
        const currentKey = noteKey(type, item.subjectId);
        const isDirty = item.inputValue.trim() !== item.note.trim();
        const isSaving = savingKey === currentKey;

        return (
          <tr key={item.subjectId}>
            <td className="accounting-report-subject-cell">{item.subjectLabel}</td>
            <td className="accounting-report-note-cell">
              <div className="accounting-report-note-editor">
                <textarea
                  value={item.inputValue}
                  onChange={(event) => onChangeNote(type, item.subjectId, event.target.value)}
                  onBlur={() => void onBlurNote(type, item.categoryId, item.subjectId, item.inputValue, item.note)}
                  rows={1}
                  placeholder="帳票用摘要を入力"
                />
                <div className="accounting-report-note-meta print-hidden">
                  {isSaving ? (
                    <span className="muted">保存中...</span>
                  ) : isDirty ? (
                    <button
                      type="button"
                      className="button button-small button-secondary"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void onSaveNote(type, item.categoryId, item.subjectId, item.inputValue)}
                    >
                      保存
                    </button>
                  ) : null}
                </div>
              </div>
            </td>
            <td className="accounting-report-amount-cell">{formatMoney(item.amount)}</td>
          </tr>
        );
      })}
    </>
  );
}
