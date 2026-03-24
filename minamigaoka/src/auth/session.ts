import type { User } from "firebase/auth";
import { resolveLoginIdFromEmail } from "./loginId";
import { resolveAppRole, resolveAppUid, type AppRole } from "../config/runtime";

export type AuthenticatedUser = {
  user: User;
  loginId: string;
  appUid: string;
  role: AppRole;
};

export const toAuthenticatedUser = (user: User): AuthenticatedUser | null => {
  const email = user.email;
  if (!email) return null;
  const loginId = resolveLoginIdFromEmail(email);
  return {
    user,
    loginId,
    appUid: resolveAppUid(loginId),
    role: resolveAppRole(loginId),
  };
};
