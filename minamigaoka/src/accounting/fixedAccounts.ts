import type { AccountDefinition } from "./model";

export const FIXED_ACCOUNTS: AccountDefinition[] = [
  { accountId: "cash_treasurer", label: "現金（会計手元金）", sortOrder: 10 },
  { accountId: "cash_president", label: "現金（会長手元金）", sortOrder: 20 },
  { accountId: "yucho", label: "ゆうちょ銀行", sortOrder: 30 },
];
