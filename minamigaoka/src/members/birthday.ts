import type { MemberRecord, MemberType } from "./types";

const validBirthdayTypes: MemberType[] = ["child", "obog", "teacher"];

export const isValidBirthDate = (value: string | null | undefined): value is string => {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const calculateAge = (birthDate: string, referenceDate = new Date()): number | null => {
  if (!isValidBirthDate(birthDate)) return null;
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  let age = referenceDate.getFullYear() - birthYear;
  const hasBirthdayPassed =
    referenceDate.getMonth() + 1 > birthMonth ||
    (referenceDate.getMonth() + 1 === birthMonth && referenceDate.getDate() >= birthDay);
  if (!hasBirthdayPassed) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

const hasBirthdayTargetType = (member: Pick<MemberRecord, "memberTypes" | "role">): boolean =>
  validBirthdayTypes.some((memberType) => member.memberTypes.includes(memberType)) ||
  member.role === "teacher" ||
  member.role === "child";

export const isBirthdayCelebrationTarget = (
  member: Pick<MemberRecord, "memberTypes" | "role" | "memberStatus" | "birthDate">,
): boolean =>
  member.memberStatus === "active" &&
  isValidBirthDate(member.birthDate) &&
  hasBirthdayTargetType(member);

export const isBirthdayOnDate = (
  birthDate: string | null | undefined,
  dateKey: string,
): boolean => {
  if (!isValidBirthDate(birthDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  return birthDate.slice(5) === dateKey.slice(5);
};

export const getBirthdayCelebrants = (members: MemberRecord[], dateKey: string): MemberRecord[] =>
  members.filter(
    (member) => isBirthdayCelebrationTarget(member) && isBirthdayOnDate(member.birthDate, dateKey),
  );

const getBirthdayHonorific = (member: Pick<MemberRecord, "memberTypes" | "role">): string => {
  if (member.memberTypes.includes("teacher") || member.role === "teacher") {
    return "先生";
  }
  if (member.memberTypes.includes("obog")) {
    return "先輩";
  }
  return "さん";
};

export const formatBirthdayCelebrationName = (
  member: Pick<MemberRecord, "displayName" | "name" | "loginId" | "id" | "memberTypes" | "role">,
): string => {
  const baseName = member.displayName || member.name || member.loginId || member.id;
  return `${baseName}${getBirthdayHonorific(member)}`;
};
