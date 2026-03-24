import { appRuntimeConfig } from "../config/runtime";

const LOGIN_ID_PATTERN = /^[a-z0-9._-]+$/;

export const normalizeLoginId = (value: string): string => value.trim().toLowerCase();

export const isValidLoginId = (value: string): boolean => LOGIN_ID_PATTERN.test(value);

export const toInternalAuthEmail = (loginId: string): string =>
  `${normalizeLoginId(loginId)}@${appRuntimeConfig.authEmailDomain}`;

export const resolveLoginIdFromEmail = (email: string): string => {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  return atIndex >= 0 ? normalized.slice(0, atIndex) : normalized;
};
