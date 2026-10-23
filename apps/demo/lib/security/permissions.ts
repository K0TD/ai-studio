import { z } from "zod";
export const roleSchema = z.enum(["user", "vip", "admin"]);
export const sectionSchema = z.enum(["video", "image", "audio"]);
const normalizeRubString = (val: unknown) => {
  if (typeof val === "number") return val.toFixed(2);
  if (typeof val === "string") {
    const match = /^(-?)(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/u.exec(val);
    if (match) {
      const whole = match[2];
      const dec = (match[3] ?? "").padEnd(2, "0");
      return `${match[1] ?? ""}${whole}.${dec}`;
    }
  }
  return val;
};

export const rubSchema = z.preprocess(
  normalizeRubString,
  z.string().regex(/^(0|[1-9]\d{0,9})\.\d{2}$/u)
);
export const signedRubSchema = z.preprocess(
  normalizeRubString,
  z.string().regex(/^-?(0|[1-9]\d{0,9})\.\d{2}$/u)
);
export const permissionsSchema = z.strictObject({
  dailyLimitRub: rubSchema.nullable(),
  maxConcurrentJobs: z.number().int().min(1).max(20),
  modelIds: z.array(z.string().trim().min(1).max(160)).max(500),
  sections: z.array(sectionSchema).max(3),
});
export type UserPermissions = z.infer<typeof permissionsSchema>;
export type UserRole = z.infer<typeof roleSchema>;
export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  dailyLimitRub: null,
  maxConcurrentJobs: 3,
  modelIds: [],
  sections: ["video", "image", "audio"],
};
export const DEFAULT_VIP_PERMISSIONS: UserPermissions = {
  dailyLimitRub: null,
  maxConcurrentJobs: 10,
  modelIds: [],
  sections: ["video", "image", "audio"],
};
export const DEFAULT_ADMIN_PERMISSIONS: UserPermissions = {
  dailyLimitRub: null,
  maxConcurrentJobs: 20,
  modelIds: [],
  sections: ["video", "image", "audio"],
};
export const CLOSED_PERMISSIONS: UserPermissions = {
  dailyLimitRub: "0.00",
  maxConcurrentJobs: 1,
  modelIds: [],
  sections: [],
};

