import { appRuntimeConfig } from "../config/runtime";

const LOGIN_ID_PATTERN = /^[a-z0-9_-]{4,20}$/;

export const loginIdValidationMessages = {
  length: "ユーザーIDは4〜20文字で入力してください。",
  charset: "使用できる文字は半角英小文字・数字・アンダーバー(_)・ハイフン(-)です。",
} as const;

export const normalizeLoginId = (value: string): string => value.trim().toLowerCase();

export const isValidLoginId = (value: string): boolean => LOGIN_ID_PATTERN.test(value);

export const toInternalAuthEmail = (loginId: string): string =>
  `${normalizeLoginId(loginId)}@${appRuntimeConfig.authEmailDomain}`;

export const resolveLoginIdFromEmail = (email: string): string => {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  return atIndex >= 0 ? normalized.slice(0, atIndex) : normalized;
};
