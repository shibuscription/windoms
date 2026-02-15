const jstDateFormatter = new Intl.DateTimeFormat("ja-JP-u-ca-gregory", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const isValidDateKey = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const shiftDateKey = (baseDateKey: string, days: number): string => {
  const [year, month, day] = baseDateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const todayDateKey = (): string => {
  const parts = jstDateFormatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
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
