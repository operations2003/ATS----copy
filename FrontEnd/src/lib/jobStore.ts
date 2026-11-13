// Central in-memory candidate registry per job for frontend API routes
export const jobCandidatesStore: Record<string, any[]> = {};

export interface PublicJobLinkRecord {
  jobId: string;
  publicToken: string;
  isActive: boolean;
  publicUrl?: string;
  position?: string;
  client?: string;
  jobInfo?: any;
}

// In-memory registry for public application links across serverless invocations
export const publicJobLinkStore: Record<string, PublicJobLinkRecord> = {};

// Token to Job ID lookup map
export const publicTokenToJobIdMap: Record<string, string> = {};
