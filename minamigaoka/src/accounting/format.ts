export const formatMoney = (value: number): string =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);

export const todayYmd = (): string => new Date().toISOString().slice(0, 10);
