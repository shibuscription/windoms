export type TransactionType = "income" | "expense" | "transfer";

export type AccountDefinition = {
  accountId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
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
  accountId: string;
  label: string;
  sortOrder: number;
  openingBalance: number;
};

export type AccountingAttachment = {
  name: string;
  size: number;
  type: string;
  downloadUrl?: string;
  storagePath: string;
};

export type AccountingTransaction = {
  id: string;
  periodId: string;
  createdAt: string;
  updatedAt: string;
  date: string;
  type: TransactionType;
  source?: "manual" | "reimbursement" | "purchase";
  amount: number;
  categoryId?: string;
  memo?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  attachments?: AccountingAttachment[];
};

export type AccountingTransactionInput = {
  date: string;
  amount: number;
  categoryId?: string;
  memo?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  files?: File[];
  source?: "manual" | "reimbursement" | "purchase";
};

export type AccountingReportNote = {
  id: string;
  periodId: string;
  type: "income" | "expense";
  categoryId: string;
  subjectId: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type PeriodStatus = "editing" | "closed";

export type AccountingPeriod = {
  periodId: string;
  label: string;
  fiscalYear: number;
  startDate: string;
  endDate: string;
  state: PeriodStatus;
  accounts: PeriodAccount[];
  transactions: AccountingTransaction[];
  createdAt: string;
  updatedAt: string;
};

export type AccountingStore = {
  currentPeriodId: string | null;
  accounts: AccountDefinition[];
  periods: AccountingPeriod[];
  reportNotes: AccountingReportNote[];
};

export type TransactionDraft = {
  date: string;
  amount: string;
  categoryId: string;
  memo: string;
  accountId: string;
  fromAccountId: string;
  toAccountId: string;
};
