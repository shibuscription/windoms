import type { CategoryDefinition } from "./model";

export const FIXED_CATEGORIES: CategoryDefinition[] = [
  { categoryId: "income_membership_fee", label: "会費", sortOrder: 10 },
  { categoryId: "income_donation", label: "寄付金", sortOrder: 20 },
  { categoryId: "income_subsidy_grant", label: "補助金・助成金", sortOrder: 30 },
  { categoryId: "income_honorarium", label: "謝礼金", sortOrder: 40 },
  { categoryId: "income_interest", label: "受取利息", sortOrder: 50 },
  { categoryId: "income_misc", label: "雑収入", sortOrder: 60 },
  { categoryId: "expense_instructor", label: "講師関連費", sortOrder: 110 },
  { categoryId: "expense_instrument_supply", label: "楽器・備品関連費", sortOrder: 120 },
  { categoryId: "expense_concert", label: "大会・演奏会関連費", sortOrder: 130 },
  { categoryId: "expense_burden", label: "負担金", sortOrder: 140 },
  { categoryId: "expense_insurance", label: "保険料", sortOrder: 150 },
  { categoryId: "expense_misc", label: "雑費", sortOrder: 160 },
];
