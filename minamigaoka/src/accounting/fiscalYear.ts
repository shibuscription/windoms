export const ACCOUNTING_FISCAL_YEAR_START_MONTH = 9;

export const resolveAccountingFiscalYear = (date: Date): number => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= ACCOUNTING_FISCAL_YEAR_START_MONTH ? year : year - 1;
};

export const buildAccountingFiscalYearRange = (fiscalYear: number) => ({
  startDate: `${fiscalYear}-09-01`,
  endDate: `${fiscalYear + 1}-08-31`,
});

export const accountingFiscalMonthLabels = (): { monthKey: string; label: string }[] =>
  [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8].map((month) => ({
    monthKey: String(month).padStart(2, "0"),
    label: `${month}月`,
  }));
