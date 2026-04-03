import type { AccountDefinition } from "./model";

export const FIXED_ACCOUNTS: AccountDefinition[] = [
  { accountId: "cash_treasurer", name: "現金（会計手元金）", sortOrder: 10, isActive: true },
  { accountId: "cash_president", name: "現金（会長手元金）", sortOrder: 20, isActive: true },
  { accountId: "yucho", name: "ゆうちょ銀行", sortOrder: 30, isActive: true },
];
