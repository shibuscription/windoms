export type AppRole = "admin" | "parent";

const parseCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const parseLoginIdMap = (value: string | undefined): Record<string, string> => {
  const entries = parseCsv(value);
  return entries.reduce<Record<string, string>>((result, entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex <= 0) return result;
    const loginId = entry.slice(0, separatorIndex).trim().toLowerCase();
    const appUid = entry.slice(separatorIndex + 1).trim();
    if (!loginId || !appUid) return result;
    result[loginId] = appUid;
    return result;
  }, {});
};

const env = import.meta.env;

const defaultRole = env.VITE_MINAMIGAOKA_DEFAULT_ROLE === "admin" ? "admin" : "parent";

export const appRuntimeConfig = {
  appId: "minamigaoka",
  appName: "Windoms 南ヶ丘",
  authEmailDomain: env.VITE_MINAMIGAOKA_AUTH_EMAIL_DOMAIN ?? "minamigaoka.windoms.club",
  defaultRole,
  adminLoginIds: new Set(parseCsv(env.VITE_MINAMIGAOKA_ADMIN_LOGIN_IDS)),
  loginIdUserMap: parseLoginIdMap(env.VITE_MINAMIGAOKA_LOGIN_USER_MAP),
  features: {
    showDevPanel: false,
    enableOcrDebug: false,
  },
} as const;

export const resolveAppRole = (loginId: string): AppRole =>
  appRuntimeConfig.adminLoginIds.has(loginId) ? "admin" : appRuntimeConfig.defaultRole;

export const resolveAppUid = (loginId: string): string =>
  appRuntimeConfig.loginIdUserMap[loginId] ?? loginId;
