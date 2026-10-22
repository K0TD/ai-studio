import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const getStorageDir = (): string => {
  if (process.env.STORAGE_ROOT?.trim()) {
    return resolve(process.env.STORAGE_ROOT.trim());
  }
  // 1. Docker mounted volume at root
  if (existsSync("/app/storage")) {
    return "/app/storage";
  }
  const cwd = process.cwd();
  // 2. In monorepo root or current directory
  if (existsSync(resolve(cwd, "storage"))) {
    return resolve(cwd, "storage");
  }
  // 3. If running from apps/demo inside monorepo
  if (existsSync(resolve(cwd, "../../storage"))) {
    return resolve(cwd, "../../storage");
  }
  if (existsSync(resolve(cwd, "../storage"))) {
    return resolve(cwd, "../storage");
  }
  return resolve(cwd, "storage");
};

export const getSqlitePath = (): string => {
  if (process.env.SQLITE_PATH?.trim()) {
    return resolve(process.env.SQLITE_PATH.trim());
  }
  return resolve(getStorageDir(), "database/studio.sqlite");
};
