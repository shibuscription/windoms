export const todayDateKey = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const formatDateJa = (dateKey: string): string => {
  const [y, m, d] = dateKey.split("-");
  return `${y}/${m}/${d}`;
};

export const formatDateYmd = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
};

export const formatWeekdayJa = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("ja-JP", { weekday: "short" });
};

export const formatTimeNoLeadingZero = (time: string): string => {
  const [h, m] = time.split(":");
  return `${Number(h)}:${m}`;
};

export const formatDateWithWeekday = (dateKey: string): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("ja-JP", { weekday: "short" });
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}（${weekday}）`;
};

export const weekdayTone = (dateKey: string): "weekday" | "sat" | "sun" => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  if (weekday === 0) return "sun";
  if (weekday === 6) return "sat";
  return "weekday";
};
