import type { AccountDefinition } from "./model";

export const FIXED_ACCOUNTS: AccountDefinition[] = [
  { accountKey: "cash_treasurer", label: "現金（会計手元金）", sortOrder: 10 },
  { accountKey: "cash_president", label: "会長手元金", sortOrder: 20 },
  { accountKey: "yucho", label: "ゆうちょ銀行", sortOrder: 30 },
];
