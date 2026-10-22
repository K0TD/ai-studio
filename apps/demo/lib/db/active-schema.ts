import { isPostgres } from "./index";
import * as pg from "./schema";
import * as sqlite from "./sqlite-schema";

export const s = isPostgres ? pg : sqlite;

export const user: typeof pg.user = (isPostgres ? pg.user : sqlite.user) as any;
export const account: typeof pg.account = (isPostgres ? pg.account : sqlite.account) as any;
export const session: typeof pg.session = (isPostgres ? pg.session : sqlite.session) as any;
export const verification: typeof pg.verification = (isPostgres ? pg.verification : sqlite.verification) as any;
export const transactions: typeof pg.transactions = (isPostgres ? pg.transactions : sqlite.transactions) as any;
export const adminAudit: typeof pg.adminAudit = (isPostgres ? pg.adminAudit : sqlite.adminAudit) as any;
export const invitation: typeof pg.invitation = (isPostgres ? pg.invitation : sqlite.invitation) as any;
export const rateLimit: typeof pg.rateLimit = (isPostgres ? pg.rateLimit : sqlite.rateLimit) as any;
export const syntxChats: typeof pg.syntxChats = (isPostgres ? pg.syntxChats : sqlite.syntxChats) as any;
export const syntxQuotes: typeof pg.syntxQuotes = (isPostgres ? pg.syntxQuotes : sqlite.syntxQuotes) as any;
export const syntxJobs: typeof pg.syntxJobs = (isPostgres ? pg.syntxJobs : sqlite.syntxJobs) as any;
export const syntxFiles: typeof pg.syntxFiles = (isPostgres ? pg.syntxFiles : sqlite.syntxFiles) as any;
export const syntxArtifacts: typeof pg.syntxArtifacts = (isPostgres ? pg.syntxArtifacts : sqlite.syntxArtifacts) as any;
export const syntxCatalog: typeof pg.syntxCatalog = (isPostgres ? pg.syntxCatalog : sqlite.syntxCatalog) as any;
export const syntxWorkerHeartbeats: typeof pg.syntxWorkerHeartbeats = (isPostgres ? pg.syntxWorkerHeartbeats : sqlite.syntxWorkerHeartbeats) as any;
