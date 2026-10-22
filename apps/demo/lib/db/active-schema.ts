import { isPostgres } from "./index";
import * as pg from "./schema";
import * as sqlite from "./sqlite-schema";

export const s = isPostgres ? pg : sqlite;

export const user: any = isPostgres ? pg.user : sqlite.user;
export const account: any = isPostgres ? pg.account : sqlite.account;
export const session: any = isPostgres ? pg.session : sqlite.session;
export const verification: any = isPostgres ? pg.verification : sqlite.verification;
export const transactions: any = isPostgres ? pg.transactions : sqlite.transactions;
export const adminAudit: any = isPostgres ? pg.adminAudit : sqlite.adminAudit;
export const invitation: any = isPostgres ? pg.invitation : sqlite.invitation;
export const rateLimit: any = isPostgres ? pg.rateLimit : sqlite.rateLimit;
export const syntxChats: any = isPostgres ? pg.syntxChats : sqlite.syntxChats;
export const syntxQuotes: any = isPostgres ? pg.syntxQuotes : sqlite.syntxQuotes;
export const syntxJobs: any = isPostgres ? pg.syntxJobs : sqlite.syntxJobs;
export const syntxFiles: any = isPostgres ? pg.syntxFiles : sqlite.syntxFiles;
export const syntxArtifacts: any = isPostgres ? pg.syntxArtifacts : sqlite.syntxArtifacts;
export const syntxCatalog: any = isPostgres ? pg.syntxCatalog : sqlite.syntxCatalog;
export const syntxWorkerHeartbeats: any = isPostgres ? pg.syntxWorkerHeartbeats : sqlite.syntxWorkerHeartbeats;
