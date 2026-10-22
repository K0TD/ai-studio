import type { UserPermissions, UserRole } from "../security/permissions";
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  balanceRub: string;
  reservedRub: string;
  availableRub: string;
  permissions: UserPermissions;
  isApproved: boolean;
  isBanned: boolean;
  isEnvAdmin: boolean;
  activatedAt: string | null;
  totalGenerations: number;
  createdAt: string;
  lastActiveAt: string;
}
export interface AdminTransaction {
  id: string;
  userId: string;
  userName: string;
  actorId: string | null;
  jobId: string | null;
  amountRub: string;
  type: string;
  reason: string;
  balanceBeforeRub: string;
  balanceAfterRub: string;
  createdAt: string;
}
export interface SystemStats {
  totalUsers: number;
  totalBalanceRub: string;
  totalSpentTodayRub: string;
  activeGenerations: number;
  routerAiStatus: "operational" | "degraded" | "down";
  supportedModelsCount: number;
}

export interface AdminAuditDetails {
  role?: UserRole;
  permissions?: UserPermissions;
  sessionsRevoked?: boolean;
  transactionId?: string;
  amountRub?: string;
  reason?: string;
  before?: {
    role: UserRole;
    isApproved: boolean;
    isBanned: boolean;
    permissions: UserPermissions;
  };
  after?: {
    role?: UserRole;
    isApproved?: boolean;
    isBanned?: boolean;
    permissions?: UserPermissions;
  };
}
