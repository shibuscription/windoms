export type TransactionType = "income" | "expense" | "transfer";

export type AccountDefinition = {
  accountKey: string;
  label: string;
  sortOrder: number;
};

export type SubjectType = "income" | "expense" | "both";

export type CategoryDefinition = {
  categoryId: string;
  label: string;
  sortOrder: number;
};

export type SubjectDefinition = {
  subjectId: string;
  label: string;
  categoryId: string;
  type: SubjectType;
  sortOrder: number;
};

export type PeriodAccount = {
  accountKey: string;
  label: string;
  sortOrder: number;
  openingBalance: number;
};

export type AccountingTransaction = {
  id: string;
  createdAt: string;
  date: string;
  type: TransactionType;
  amount: number;
  subjectId: string;
  memo?: string;
  accountKey?: string;
  fromAccountKey?: string;
  toAccountKey?: string;
};

export type PeriodStatus = "editing" | "closed";

export type AccountingPeriod = {
  periodId: string;
  label: string;
  fiscalYear: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  accounts: PeriodAccount[];
  transactions: AccountingTransaction[];
  createdAt: string;
};

export type AccountingStore = {
  version: 1;
  currentPeriodId: string;
  periods: AccountingPeriod[];
};

export type TransactionDraft = {
  date: string;
  amount: string;
  subjectId: string;
  memo: string;
  accountKey: string;
  fromAccountKey: string;
  toAccountKey: string;
};
