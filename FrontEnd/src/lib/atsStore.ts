// In-House Tasknera ATS Unified Store (Local State + LocalStorage Synchronization)
import initialRecruitersData from './initialRecruiters.json';

export type CandidateStageStatus = 
  | 'SOURCED'
  | 'SCREENED'
  | 'SHORTLISTED'
  | 'PENDING_TL_REVIEW'
  | 'TL_APPROVED'
  | 'OVERRIDDEN'
  | 'REJECTED';

export interface ScreeningInfo {
  currentCtc?: string;
  expectedCtc?: string;
  noticePeriod?: string;
  location?: string;
  relocationReady?: 'Yes' | 'No' | 'Hybrid only';
  notes?: string;
  screenedBy?: string;
  screenedAt?: string;
}

export interface CandidateItem {
  id: string;
  name: string;
  role: string;
  email: string;
  phone?: string;
  location: string;
  exp: string;
  companyCount: number;
  currentCompany?: string;
  match: number;
  calibratedScore?: number;
  scoreOverrideReason?: string;
  decision: 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT';
  stageStatus: CandidateStageStatus;
  jobId: string;
  jobTitle: string;
  client: string;
  assignedRecruiter: string;
  skills: string[];
  mandatoryMatch: string; // e.g. "5/5"
  mandatoryFailed: boolean;
  screeningInfo?: ScreeningInfo;
  flagReason?: string;
  submittedToTlAt?: string;
  tlReviewedBy?: string;
  tlReviewedAt?: string;
  evidenceSnippets?: { requirement: string; evidence: string; status: 'MET' | 'PARTIAL' | 'MISSING' }[];
  uploadedAt: string;
}

export interface JobWorker {
  id: string;
  name: string;
  email?: string;
  role?: string;
  action?: string;
  isCreator?: boolean;
}

export interface JobItem {
  id: string;
  title: string;
  client: string;
  location: string;
  mode: 'Hybrid' | 'Remote' | 'Onsite';
  salary: string;
  candidates: number;
  topScore: number;
  status: 'Active' | 'Draft' | 'Closed';
  assignedRecruiter: string;
  workedBy?: JobWorker[];
  pod: string;
  createdAtDaysAgo: number;
  mandatoryRequirementsCount: number;
  totalRequirementsCount: number;
  description?: string;
  requirements?: { id: string; requirement: string; category: string; mandatory: boolean; weight: number }[];
}

export interface AuditEvent {
  id: string;
  action: 'JOB_CREATED' | 'RESUMES_UPLOADED' | 'SCREENING_SAVED' | 'SENT_TO_TL_REVIEW' | 'SCORE_OVERRIDE_APPROVED' | 'TL_APPROVED' | 'REQUISITION_REASSIGNED' | 'USER_ROLE_UPDATED';
  user: string;
  userRole: string;
  target: string;
  detail: string;
  time: string;
  timestamp: number;
}

export interface DailyTimeLog {
  day: string; // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'
  date: string;
  hoursSpent: number; // e.g. 6.4
  resumesReviewedCount: number; // e.g. 38
  resumesTimeHours: number; // e.g. 3.2
  screeningsCount: number; // e.g. 8
  screeningTimeHours: number; // e.g. 2.1
  jdsUploadedCount: number; // e.g. 1
  jdTimeHours: number; // e.g. 1.1
}

export interface RecruiterMetric {
  id: string;
  name: string;
  email: string;
  role: 'RECRUITER_MEMBER' | 'TEAM_LEAD' | 'ADMIN' | string;
  customRole?: string;
  displayRole?: string;
  team: string;
  activeJobs: number;
  jdsUploaded: number;
  resumesSeen: number;
  screenedThisWeek: number;
  tlApprovedCount: number;
  avgMatchScore: number;
  avgTimePerScreen: string;
  avgTimePerResume: string;
  todayHoursSpent: number;
  totalHoursThisWeek: number;
  dailyTimeLogs: DailyTimeLog[];
  dailyPipelineLogs?: any[];
  operationalAllocation?: {
    reviewPct: number;
    reviewHours: number;
    shortlistPct: number;
    shortlistHours: number;
    jdPct: number;
    jdHours: number;
    totalHours: number;
  };
  capacity: 'Optimal' | 'Normal' | 'Available' | 'High Load';
  lastActive: string;
  recentActivity?: string[];
  avatarUrl?: string;
  phone?: string;
  strengths?: string[];
  insightsSummary?: string;
  topSkills?: string[];
  efficiencyScore?: number;
}

const INITIAL_JOBS: JobItem[] = [];

const INITIAL_CANDIDATES: CandidateItem[] = [];

const INITIAL_AUDIT_EVENTS: AuditEvent[] = [];

const INITIAL_RECRUITERS: RecruiterMetric[] = ((initialRecruitersData as any[]) || []).filter(r => r.email?.toLowerCase().trim() !== 'admin@gmail.com' && r.email?.toLowerCase().trim() !== 'operations@tasknera.com' && r.role !== 'ADMIN' && r.role !== 'SUPER_ADMIN');

class ATSStore {
  private jobs: JobItem[] = [];
  private candidates: CandidateItem[] = [];
  private auditEvents: AuditEvent[] = [];
  private recruiters: RecruiterMetric[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.sanitizeLocalStorage();
      this.loadFromStorage();
      this.purgeHarshAndAditya();
      this.saveToStorage();
    } else {
      this.jobs = INITIAL_JOBS;
      this.candidates = INITIAL_CANDIDATES;
      this.auditEvents = INITIAL_AUDIT_EVENTS;
      this.recruiters = INITIAL_RECRUITERS;
      this.purgeHarshAndAditya();
    }
  }

  public purgeHarshAndAditya(): void {
    const isTarget = (val?: any): boolean => {
      if (!val) return false;
      const s = String(val).toLowerCase().trim();
      return s.includes('harsh') || s.includes('aditya');
    };

    // 1. Purge Recruiters
    this.recruiters = this.recruiters.filter(r => !isTarget(r.name) && !isTarget(r.email) && !isTarget(r.id));

    // 2. Purge Jobs
    const purgedJobIds = new Set<string>();
    this.jobs = this.jobs.filter(j => {
      const assigned = isTarget(j.assignedRecruiter);
      const title = isTarget(j.title);
      const client = isTarget(j.client);
      const worked = j.workedBy?.some(w => isTarget(w.name) || isTarget(w.email) || isTarget(w.id));
      if (assigned || title || client || worked) {
        purgedJobIds.add(j.id);
        return false;
      }
      return true;
    });

    // 3. Purge Candidates
    this.candidates = this.candidates.filter(c => {
      if (c.jobId && purgedJobIds.has(c.jobId)) return false;
      if (isTarget(c.name) || isTarget(c.email) || isTarget(c.role)) return false;
      if (isTarget(c.assignedRecruiter)) return false;
      if (isTarget(c.screeningInfo?.screenedBy)) return false;
      if (isTarget(c.tlReviewedBy)) return false;
      return true;
    });

    // 4. Purge Audit Events
    this.auditEvents = this.auditEvents.filter(a => {
      if (isTarget(a.user) || isTarget(a.target) || isTarget(a.detail)) return false;
      return true;
    });
  }

  private sanitizeLocalStorage(): void {
    if (typeof window === 'undefined') return;
    const isTarget = (str?: any): boolean => {
      if (!str) return false;
      const s = String(str).toLowerCase().trim();
      return s.includes('harsh') || s.includes('aditya');
    };

    try {
      ['tasknera_ats_recruiters', 'tasknera_ats_jobs', 'tasknera_ats_candidates', 'tasknera_ats_audits'].forEach(key => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;

        if (key === 'tasknera_ats_recruiters') {
          const clean = parsed.filter((r: any) => !isTarget(r.name) && !isTarget(r.email));
          localStorage.setItem(key, JSON.stringify(clean));
        } else if (key === 'tasknera_ats_jobs') {
          const clean = parsed.filter((j: any) => !isTarget(j.assignedRecruiter) && !isTarget(j.title) && !j.workedBy?.some((w: any) => isTarget(w.name) || isTarget(w.email)));
          localStorage.setItem(key, JSON.stringify(clean));
        } else if (key === 'tasknera_ats_candidates') {
          const clean = parsed.filter((c: any) => !isTarget(c.name) && !isTarget(c.email) && !isTarget(c.assignedRecruiter) && !isTarget(c.screeningInfo?.screenedBy) && !isTarget(c.tlReviewedBy));
          localStorage.setItem(key, JSON.stringify(clean));
        } else if (key === 'tasknera_ats_audits') {
          const clean = parsed.filter((a: any) => !isTarget(a.user) && !isTarget(a.target) && !isTarget(a.detail));
          localStorage.setItem(key, JSON.stringify(clean));
        }
      });
    } catch (_) {}
  }

  private loadFromStorage() {
    try {
      const storedJobs = localStorage.getItem('tasknera_ats_jobs');
      const storedCandidates = localStorage.getItem('tasknera_ats_candidates');
      const storedAudits = localStorage.getItem('tasknera_ats_audits');
      const storedRecruiters = localStorage.getItem('tasknera_ats_recruiters');

      // Purge dummy mock jobs & unwanted stale jobs
      const dummyJobIds = ['jd-1', 'jd-2', 'jd-3', 'jd-4'];
      let loadedJobs: JobItem[] = storedJobs ? JSON.parse(storedJobs) : [];
      loadedJobs = (Array.isArray(loadedJobs) ? loadedJobs : []).filter(j => {
        const id = String(j.id || '');
        const title = String(j.title || '').toLowerCase();
        const client = String((j as any).client || (j as any).company || '').toLowerCase();
        return !dummyJobIds.includes(id) &&
               !id.startsWith('jd-') &&
               !id.includes('1788597184624') &&
               id !== 'b069cc8a-8e5d-47e4-8444-1c9ed2a0258b' &&
               id !== '83838c13-a542-457c-a696-1289c9734869' &&
               !title.includes('1788597184624') &&
               !title.includes('test engineer') &&
               !client.includes('test client');
      });
      this.jobs = loadedJobs;

      // Purge dummy mock candidates (cand-1 through cand-6 and mock test candidates)
      const dummyCandidateIds = ['cand-1', 'cand-2', 'cand-3', 'cand-4', 'cand-5', 'cand-6'];
      let loadedCandidates: CandidateItem[] = storedCandidates ? JSON.parse(storedCandidates) : [];
      loadedCandidates = (Array.isArray(loadedCandidates) ? loadedCandidates : []).filter(c => {
        const id = String(c.id || '');
        const name = String(c.name || '').toLowerCase().trim();
        return !dummyCandidateIds.includes(id) &&
               !id.startsWith('cand-') &&
               name !== 'michael chen' &&
               name !== 'sarah jenkins' &&
               name !== 'james wilson' &&
               name !== 'marcus vance' &&
               name !== 'elena rostova' &&
               name !== 'alex chen' &&
               name !== 'jennifer lopez' &&
               !name.includes('mahesh pk');
      });
      this.candidates = loadedCandidates;
      this.auditEvents = storedAudits ? JSON.parse(storedAudits) : [];
      
      if (storedRecruiters) {
        let parsed = JSON.parse(storedRecruiters) as RecruiterMetric[];
        // Filter out legacy dummy mock recruiters (Sarah Mitchell, etc.) as well as the system admin account
        const dummyEmails = [
          'sarah.m@tasknera.com',
          'priya.s@tasknera.com',
          'david.p@tasknera.com',
          'marcus.v@tasknera.com',
          'elena.r@tasknera.com',
          'john.r@tasknera.com',
          'alex.m@tasknera.com',
          'alex.c@tasknera.com'
        ];
        parsed = parsed.filter(p => {
          const email = String(p.email || '').toLowerCase().trim();
          const name = String(p.name || '').toLowerCase().trim();
          if (dummyEmails.includes(email)) return false;
          if (email === 'admin@gmail.com' || email === 'operations@tasknera.com' || p.role === 'ADMIN' || p.role === 'SUPER_ADMIN') return false;
          if (email.includes('harsh') || name.includes('harsh')) return false;
          if (email.includes('aditya') || name.includes('aditya')) return false;
          return true;
        });

        // Also purge any jobs or candidates assigned to or screened by harsh or aditya
        this.jobs = this.jobs.filter(j => {
          const assigned = String(j.assignedRecruiter || '').toLowerCase().trim();
          const worked = j.workedBy?.some(w => {
            const n = String(w.name || '').toLowerCase();
            const e = String(w.email || '').toLowerCase();
            return n.includes('harsh') || e.includes('harsh') || n.includes('aditya') || e.includes('aditya');
          });
          if (assigned.includes('harsh') || assigned.includes('aditya') || worked) return false;
          return true;
        });

        this.candidates = this.candidates.filter(c => {
          const assigned = String(c.assignedRecruiter || '').toLowerCase().trim();
          const screened = String(c.screeningInfo?.screenedBy || '').toLowerCase().trim();
          if (assigned.includes('harsh') || assigned.includes('aditya')) return false;
          if (screened.includes('harsh') || screened.includes('aditya')) return false;
          return true;
        });

        if (parsed.length === 0) {
          this.recruiters = INITIAL_RECRUITERS;
        } else {
          this.recruiters = parsed;
          // Ensure all real database initial recruiters are present
          for (const ir of INITIAL_RECRUITERS) {
            const irEmail = String(ir.email || '').toLowerCase().trim();
            const irName = String(ir.name || '').toLowerCase().trim();
            if (irEmail.includes('harsh') || irName.includes('harsh') || irEmail.includes('aditya') || irName.includes('aditya')) continue;
            if (!this.recruiters.some(r => r.id === ir.id || r.email.toLowerCase() === ir.email.toLowerCase())) {
              this.recruiters.push(ir);
            }
          }
        }
      } else {
        this.recruiters = INITIAL_RECRUITERS.filter(r => {
          const e = String(r.email || '').toLowerCase();
          const n = String(r.name || '').toLowerCase();
          return !e.includes('harsh') && !n.includes('harsh') && !e.includes('aditya') && !n.includes('aditya');
        });
      }
      
      // Resave clean arrays to localStorage
      this.saveToStorage();
    } catch {
      this.jobs = INITIAL_JOBS;
      this.candidates = INITIAL_CANDIDATES;
      this.auditEvents = INITIAL_AUDIT_EVENTS;
      this.recruiters = INITIAL_RECRUITERS;
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('tasknera_ats_jobs', JSON.stringify(this.jobs));
      localStorage.setItem('tasknera_ats_candidates', JSON.stringify(this.candidates));
      localStorage.setItem('tasknera_ats_audits', JSON.stringify(this.auditEvents));
      localStorage.setItem('tasknera_ats_recruiters', JSON.stringify(this.recruiters));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
    this.notify();
  }

  public subscribe(fn: () => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  // --- Getters ---
  public getJobs(): JobItem[] {
    return this.jobs;
  }

  public getJob(id: string): JobItem | undefined {
    return this.jobs.find(j => j.id === id);
  }

  public getCandidates(jobId?: string): CandidateItem[] {
    if (jobId) {
      return this.candidates.filter(c => c.jobId === jobId);
    }
    return this.candidates;
  }

  public getCandidate(id: string): CandidateItem | undefined {
    return this.candidates.find(c => c.id === id);
  }

  public getTLReviewQueue(): CandidateItem[] {
    return this.candidates.filter(c => c.stageStatus === 'PENDING_TL_REVIEW');
  }

  public getAuditEvents(): AuditEvent[] {
    return this.auditEvents;
  }

  public setRecruitersFromDatabase(members: RecruiterMetric[]): void {
    if (!Array.isArray(members)) return;
    this.recruiters = members.filter(m => {
      const email = String(m.email || '').toLowerCase().trim();
      const name = String(m.name || '').toLowerCase().trim();
      if (email === 'admin@gmail.com' || email === 'operations@tasknera.com' || m.role === 'ADMIN' || m.role === 'SUPER_ADMIN') return false;
      if (email.includes('harsh') || name.includes('harsh')) return false;
      if (email.includes('aditya') || name.includes('aditya')) return false;
      return true;
    });
    this.saveToStorage();
  }

  public getRecruiters(): RecruiterMetric[] {
    return this.recruiters.filter(r => {
      const email = String(r.email || '').toLowerCase().trim();
      const name = String(r.name || '').toLowerCase().trim();
      if (email === 'admin@gmail.com' || email === 'operations@tasknera.com' || r.role === 'ADMIN' || r.role === 'SUPER_ADMIN') return false;
      if (email.includes('harsh') || name.includes('harsh')) return false;
      if (email.includes('aditya') || name.includes('aditya')) return false;
      return true;
    });
  }

  public getRecruiter(id: string): RecruiterMetric | undefined {
    return this.recruiters.find(r => r.id === id);
  }

  public deleteRecruiter(id: string, name?: string, email?: string): boolean {
    const cleanId = String(id || '').trim();
    const cleanName = String(name || '').toLowerCase().trim();
    const cleanEmail = String(email || '').toLowerCase().trim();

    if (cleanEmail === 'admin@gmail.com' || cleanEmail === 'operations@tasknera.com') return false;

    const target = this.recruiters.find(r =>
      (cleanId && r.id === cleanId) ||
      (cleanEmail && r.email.toLowerCase() === cleanEmail) ||
      (cleanName && r.name.toLowerCase() === cleanName)
    );

    const targetName = target ? target.name : name || '';
    const targetEmail = target ? target.email : email || '';

    // Remove from recruiters
    this.recruiters = this.recruiters.filter(r => {
      if (cleanId && r.id === cleanId) return false;
      if (cleanEmail && r.email.toLowerCase() === cleanEmail) return false;
      if (cleanName && r.name.toLowerCase() === cleanName) return false;
      return true;
    });

    // Cascade remove associated jobs created by or worked by this recruiter
    const removedJobIds = new Set<string>();
    this.jobs = this.jobs.filter(j => {
      const assigned = String(j.assignedRecruiter || '').toLowerCase().trim();
      const worked = j.workedBy?.some(w =>
        (cleanName && w.name?.toLowerCase().trim() === cleanName) ||
        (cleanEmail && w.email?.toLowerCase().trim() === cleanEmail) ||
        (cleanId && w.id === cleanId)
      );
      const isAssigned = (cleanName && (assigned === cleanName || assigned.includes(cleanName))) ||
                         (cleanEmail && assigned.includes(cleanEmail));
      if (isAssigned || worked) {
        removedJobIds.add(j.id);
        return false;
      }
      return true;
    });

    // Cascade remove associated candidates assigned to or screened by this recruiter, or under purged jobs
    this.candidates = this.candidates.filter(c => {
      if (c.jobId && removedJobIds.has(c.jobId)) return false;
      const assigned = String(c.assignedRecruiter || '').toLowerCase().trim();
      const screened = String(c.screeningInfo?.screenedBy || '').toLowerCase().trim();
      const reviewed = String(c.tlReviewedBy || '').toLowerCase().trim();
      const isAssigned = (cleanName && (assigned === cleanName || assigned.includes(cleanName))) ||
                         (cleanEmail && assigned.includes(cleanEmail));
      const isScreened = cleanName && (screened === cleanName || screened.includes(cleanName));
      const isReviewed = cleanName && (reviewed === cleanName || reviewed.includes(cleanName));
      if (isAssigned || isScreened || isReviewed) return false;
      return true;
    });

    this.logAudit({
      action: 'USER_ROLE_UPDATED',
      user: 'Administrator',
      userRole: 'ADMIN',
      target: `Member ${targetName || cleanName || cleanEmail}`,
      detail: `Permanently removed team member ${targetName || cleanEmail} and purged all associated jobs, candidates, and evaluation records.`
    });

    this.saveToStorage();
    return true;
  }

  public ensureMember(user: { id?: string; name?: string | null; email?: string; role?: string }): RecruiterMetric | null {
    if (!user || !user.email) return null;
    const cleanEmail = user.email.toLowerCase().trim();
    if (cleanEmail === 'admin@gmail.com' || cleanEmail === 'operations@tasknera.com' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return null;
    if (cleanEmail.includes('harsh') || cleanEmail.includes('aditya')) return null;
    const cleanName = user.name?.trim() || cleanEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase());
    if (cleanName.toLowerCase().includes('harsh') || cleanName.toLowerCase().includes('aditya')) return null;

    const existing = this.recruiters.find(r => r.email.toLowerCase() === cleanEmail || r.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      return existing;
    }

    const newMember: RecruiterMetric = {
      id: user.id || `rec-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      role: (user.role === 'ADMIN' ? 'ADMIN' : user.role === 'TEAM_LEAD' ? 'TEAM_LEAD' : 'RECRUITER_MEMBER'),
      customRole: (user as any).customRole || 'General',
      displayRole: (user as any).displayRole || (user as any).customRole || (user.role === 'ADMIN' ? 'Admin' : user.role === 'TEAM_LEAD' ? 'Team Lead' : 'General'),
      team: (user as any).team || (user.role === 'ADMIN' ? 'Executive & TA Leadership' : 'General'),
      activeJobs: 0,
      jdsUploaded: 0,
      resumesSeen: 0,
      screenedThisWeek: 0,
      tlApprovedCount: 0,
      avgMatchScore: 0,
      avgTimePerScreen: '—',
      avgTimePerResume: '—',
      todayHoursSpent: 0,
      totalHoursThisWeek: 0,
      capacity: 'Available',
      lastActive: 'Active now',
      strengths: ['Talent Sourcing', 'Candidate Screening'],
      insightsSummary: `${cleanName} is newly provisioned. No candidate evaluations or job requisitions recorded yet.`,
      topSkills: ['Sourcing', 'Interviewing'],
      efficiencyScore: 0,
      dailyTimeLogs: [
        { day: 'Mon', date: 'Sep 01', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
        { day: 'Tue', date: 'Sep 02', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
        { day: 'Wed', date: 'Sep 03', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
        { day: 'Thu', date: 'Sep 04', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
        { day: 'Fri', date: 'Sep 05', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
      ],
      recentActivity: [
        'Provisioned database credentials by Administrator',
      ]
    };

    this.recruiters = [newMember, ...this.recruiters];
    this.saveToStorage();
    return newMember;
  }

  public addRecruiter(member: Omit<RecruiterMetric, 'id'>): RecruiterMetric {
    const newMember: RecruiterMetric = {
      ...member,
      id: `rec-${Date.now()}`,
    };
    this.recruiters = [newMember, ...this.recruiters];
    this.logAudit({
      action: 'USER_ROLE_UPDATED',
      user: 'Administrator',
      userRole: 'ADMIN',
      target: `Member ${newMember.name}`,
      detail: `Provisioned new team member ${newMember.name} in ${newMember.team} with role ${newMember.role}.`
    });
    this.saveToStorage();
    return newMember;
  }

  public updateRecruiter(id: string, updates: Partial<RecruiterMetric>, oldEmail?: string): RecruiterMetric | undefined {
    const cleanId = String(id || '').trim();
    const cleanOldEmail = String(oldEmail || '').toLowerCase().trim();

    const rec = this.recruiters.find(r => 
      (cleanId && r.id === cleanId) || 
      (cleanOldEmail && r.email?.toLowerCase().trim() === cleanOldEmail)
    );
    if (!rec) return undefined;

    const previousName = rec.name;
    const previousEmail = rec.email;

    Object.assign(rec, updates);

    // Cascade update jobs assigned to this recruiter if name changed
    if (updates.name && updates.name !== previousName) {
      this.jobs.forEach(j => {
        if (j.assignedRecruiter === previousName) {
          j.assignedRecruiter = updates.name!;
        }
      });
      this.candidates.forEach(c => {
        if (c.assignedRecruiter === previousName) {
          c.assignedRecruiter = updates.name!;
        }
      });
    }

    this.logAudit({
      action: 'USER_ROLE_UPDATED',
      user: 'Administrator',
      userRole: 'ADMIN',
      target: `Member ${rec.name}`,
      detail: `Updated profile details for team member ${rec.name} (${rec.email || previousEmail}).`
    });

    this.saveToStorage();
    return rec;
  }

  // --- Admin Analytics Helpers ---
  public getAdminOverviewStats() {
    const totalJds = this.jobs.length;
    const totalJdsUploaded = totalJds;

    const recruitersResumesSeen = this.recruiters.reduce((sum, r) => sum + (r.resumesSeen || 0), 0);
    const recruitersShortlisted = this.recruiters.reduce((sum, r) => sum + (r.tlApprovedCount || 0), 0);

    const totalResumesSeen = Math.max(this.candidates.length, recruitersResumesSeen);

    const candidatesShortlisted = this.candidates.filter(c => c.decision === 'SUBMIT' || c.stageStatus === 'TL_APPROVED' || c.stageStatus === 'SHORTLISTED').length;
    const totalShortlisted = Math.max(candidatesShortlisted, recruitersShortlisted);
    const totalScreened = Math.max(
      this.candidates.filter(c => c.stageStatus === 'SCREENED' || c.stageStatus === 'TL_APPROVED' || c.stageStatus === 'SHORTLISTED').length,
      totalShortlisted
    );
    const activeRecruiters = this.recruiters.length;
    const agingJdsCount = this.jobs.filter(j => (j.createdAtDaysAgo || 0) >= 25).length;

    return {
      totalJds,
      totalJdsUploaded,
      totalResumesSeen,
      totalScreened,
      totalShortlisted,
      activeRecruiters,
      agingJdsCount,
      conversionRate: totalResumesSeen > 0 ? Math.round((totalShortlisted / totalResumesSeen) * 100) : (totalScreened > 0 ? Math.round((totalShortlisted / totalScreened) * 100) : 0),
    };
  }

  public getWeeklyEvaluationTrends() {
    return [
      { day: 'Mon', resumesEvaluated: 142, jdsUploaded: 4, screenings: 38 },
      { day: 'Tue', resumesEvaluated: 185, jdsUploaded: 6, screenings: 46 },
      { day: 'Wed', resumesEvaluated: 210, jdsUploaded: 5, screenings: 52 },
      { day: 'Thu', resumesEvaluated: 198, jdsUploaded: 7, screenings: 49 },
      { day: 'Fri', resumesEvaluated: 235, jdsUploaded: 8, screenings: 61 },
      { day: 'Sat', resumesEvaluated: 92, jdsUploaded: 2, screenings: 18 },
      { day: 'Sun', resumesEvaluated: 45, jdsUploaded: 1, screenings: 8 },
    ];
  }

  public getPodAnalytics() {
    const teams = Array.from(new Set(this.recruiters.map(r => r.team || 'General')));
    if (teams.length === 0) teams.push('General');
    return teams.map(teamName => {
      const teamRecruiters = this.recruiters.filter(r => (r.team || 'General') === teamName);
      const jds = teamRecruiters.reduce((sum, r) => sum + (r.activeJobs || 0), 0);
      const resumes = teamRecruiters.reduce((sum, r) => sum + (r.resumesSeen || 0), 0);
      const screenings = teamRecruiters.reduce((sum, r) => sum + (r.screenedThisWeek || 0), 0);
      const shortlists = teamRecruiters.reduce((sum, r) => sum + (r.tlApprovedCount || 0), 0);
      const avgScore = teamRecruiters.length > 0
        ? Math.round(teamRecruiters.reduce((sum, r) => sum + (r.avgMatchScore || 0), 0) / teamRecruiters.length)
        : 0;
      const lead = teamRecruiters.find(r => r.role === 'TEAM_LEAD')?.name || teamRecruiters[0]?.name || 'Unassigned';
      return {
        name: teamName,
        jds,
        resumes,
        screenings,
        shortlists,
        avgScore,
        lead
      };
    });
  }

  public getScoreTierDistribution() {
    return [
      { name: 'High Fit (≥85%)', value: 45, color: '#10B981', label: 'Direct Shortlist' },
      { name: 'Moderate Fit (65-84%)', value: 38, color: '#F59E0B', label: 'Review For Shortlist' },
      { name: 'Low Fit (<65%)', value: 17, color: '#EF4444', label: 'Rejected' },
    ];
  }

  // --- Mutations ---
  public addJob(job: Omit<JobItem, 'id' | 'createdAtDaysAgo'>, creatorName: string, creatorRole: string): JobItem {
    const newJob: JobItem = {
      ...job,
      id: `jd-${Date.now()}`,
      createdAtDaysAgo: 0,
    };
    this.jobs = [newJob, ...this.jobs];

    // Increment recruiter JD upload count
    const rec = this.recruiters.find(r => r.name.toLowerCase() === creatorName.toLowerCase() || creatorName.includes(r.name));
    if (rec) {
      rec.jdsUploaded = (rec.jdsUploaded || 0) + 1;
      rec.activeJobs = (rec.activeJobs || 0) + 1;
    }

    this.logAudit({
      action: 'JOB_CREATED',
      user: `${creatorName} (${creatorRole === 'ADMIN' ? 'Admin' : creatorRole === 'TEAM_LEAD' ? 'Team Lead' : 'TA Member'})`,
      userRole: creatorRole,
      target: `Job ${newJob.title}`,
      detail: `Created & uploaded new job / JD for ${newJob.client} with ${newJob.mandatoryRequirementsCount} mandatory requirements.`
    });
    this.saveToStorage();
    return newJob;
  }

  public reassignJob(jobId: string, newRecruiterName: string, leadName: string, targetRole: string = 'Technical Recruiter') {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return;
    const prevRecruiter = job.assignedRecruiter;
    job.assignedRecruiter = newRecruiterName;

    // Ensure workedBy is maintained with the assigned recruiter
    if (!Array.isArray(job.workedBy)) {
      job.workedBy = [];
    }
    const cleanId = `rec-${newRecruiterName.toLowerCase().replace(/\s+/g, '-')}`;
    const existingIndex = job.workedBy.findIndex(w => w.name.toLowerCase() === newRecruiterName.toLowerCase());
    if (existingIndex >= 0) {
      job.workedBy[existingIndex] = {
        ...job.workedBy[existingIndex],
        role: targetRole,
        action: 'Assigned Lead'
      };
    } else {
      job.workedBy = [
        {
          id: cleanId,
          name: newRecruiterName,
          role: targetRole,
          action: 'Assigned Lead',
          isCreator: false
        },
        ...job.workedBy.filter(w => !prevRecruiter || w.name.toLowerCase() !== prevRecruiter.toLowerCase())
      ];
    }

    // Update recruiter metrics
    const newRec = this.recruiters.find(r => r.name.toLowerCase() === newRecruiterName.toLowerCase() || newRecruiterName.toLowerCase().includes(r.name.toLowerCase()));
    if (newRec) {
      newRec.activeJobs = Math.max(1, (newRec.activeJobs || 0) + 1);
    }
    if (prevRecruiter && prevRecruiter !== newRecruiterName) {
      const prevRec = this.recruiters.find(r => r.name.toLowerCase() === prevRecruiter.toLowerCase());
      if (prevRec && (prevRec.activeJobs || 0) > 0) {
        prevRec.activeJobs = Math.max(0, (prevRec.activeJobs || 1) - 1);
      }
    }

    this.logAudit({
      action: 'REQUISITION_REASSIGNED',
      user: `${leadName} (Team Lead)`,
      userRole: 'TEAM_LEAD',
      target: `Job ${job.title}`,
      detail: `Reassigned job from ${prevRecruiter} to ${newRecruiterName}.`
    });
    this.saveToStorage();
  }

  public updateJobStatus(jobId: string, status: 'Active' | 'Draft' | 'Closed', updaterName: string = 'Team Member', updaterRole: string = 'MEMBER') {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return;
    const prevStatus = job.status;
    job.status = status;
    this.logAudit({
      action: 'JOB_CREATED',
      user: `${updaterName} (${updaterRole === 'ADMIN' ? 'Admin' : updaterRole === 'TEAM_LEAD' ? 'Team Lead' : 'TA Member'})`,
      userRole: updaterRole,
      target: `Job ${job.title}`,
      detail: `Changed job status from ${prevStatus} to ${status}.`
    });
    this.saveToStorage();
  }

  public addCandidateBatch(candidates: CandidateItem[], uploaderName: string, uploaderRole: string, jobTitle: string) {
    this.candidates = [...candidates, ...this.candidates];

    // Increment recruiter resumes seen count
    const rec = this.recruiters.find(r => r.name.toLowerCase() === uploaderName.toLowerCase() || uploaderName.includes(r.name));
    if (rec) {
      rec.resumesSeen = (rec.resumesSeen || 0) + candidates.length;
    }

    this.logAudit({
      action: 'RESUMES_UPLOADED',
      user: `${uploaderName} (${uploaderRole === 'ADMIN' ? 'Admin' : uploaderRole === 'TEAM_LEAD' ? 'Team Lead' : 'TA Member'})`,
      userRole: uploaderRole,
      target: `Job: ${jobTitle}`,
      detail: `Uploaded & parsed ${candidates.length} candidate resumes with AI Match Scoring.`
    });
    this.saveToStorage();
  }

  public saveScreeningInfo(candidateId: string, screening: ScreeningInfo, recruiterName: string, newStatus?: CandidateStageStatus) {
    const cand = this.candidates.find(c => c.id === candidateId);
    if (!cand) return;
    cand.screeningInfo = {
      ...screening,
      screenedBy: recruiterName,
      screenedAt: 'Just now'
    };
    if (newStatus) {
      cand.stageStatus = newStatus;
      if (newStatus === 'SHORTLISTED') {
        cand.decision = 'SUBMIT';
      } else if (newStatus === 'REJECTED') {
        cand.decision = 'DO NOT SUBMIT';
      }
    } else if (cand.stageStatus === 'SOURCED') {
      cand.stageStatus = 'SCREENED';
    }

    // Update recruiter screened count
    const rec = this.recruiters.find(r => r.name.toLowerCase() === recruiterName.toLowerCase() || recruiterName.includes(r.name));
    if (rec) {
      rec.screenedThisWeek = (rec.screenedThisWeek || 0) + 1;
      if (newStatus === 'SHORTLISTED') {
        rec.tlApprovedCount = (rec.tlApprovedCount || 0) + 1;
      }
    }

    this.logAudit({
      action: 'SCREENING_SAVED',
      user: `${recruiterName} (TA Member)`,
      userRole: 'USER',
      target: `Candidate: ${cand.name}`,
      detail: `Logged screening call (Current: ${screening.currentCtc || 'N/A'}, Expected: ${screening.expectedCtc || 'N/A'}, Notice: ${screening.noticePeriod || 'N/A'}${newStatus ? ` -> Marked as ${newStatus}` : ''}).`
    });
    this.saveToStorage();
  }

  public shortlistCandidate(candidateId: string, recruiterName: string) {
    const cand = this.candidates.find(c => c.id === candidateId);
    if (!cand) return;
    cand.stageStatus = 'SHORTLISTED';
    cand.decision = 'SUBMIT';

    const rec = this.recruiters.find(r => r.name.toLowerCase() === recruiterName.toLowerCase() || recruiterName.includes(r.name));
    if (rec) {
      rec.tlApprovedCount = (rec.tlApprovedCount || 0) + 1;
    }

    this.logAudit({
      action: 'TL_APPROVED',
      user: `${recruiterName} (TA Member)`,
      userRole: 'USER',
      target: `Candidate: ${cand.name} (${cand.jobTitle})`,
      detail: `Candidate approved & shortlisted directly by ${recruiterName}.`
    });
    this.saveToStorage();
  }

  public rejectCandidate(candidateId: string, recruiterName: string, reason?: string) {
    const cand = this.candidates.find(c => c.id === candidateId);
    if (!cand) return;
    cand.stageStatus = 'REJECTED';
    cand.decision = 'DO NOT SUBMIT';
    this.logAudit({
      action: 'SCORE_OVERRIDE_APPROVED',
      user: `${recruiterName} (TA Member)`,
      userRole: 'USER',
      target: `Candidate: ${cand.name} (${cand.jobTitle})`,
      detail: `Candidate rejected by ${recruiterName}.${reason ? ` Reason: ${reason}` : ''}`
    });
    this.saveToStorage();
  }

  public submitForTLReview(candidateId: string, flagReason: string, recruiterName: string) {
    const cand = this.candidates.find(c => c.id === candidateId);
    if (!cand) return;
    cand.stageStatus = 'PENDING_TL_REVIEW';
    cand.flagReason = flagReason || 'Submitted by recruiter for QA verification.';
    cand.submittedToTlAt = 'Just now';
    this.logAudit({
      action: 'SENT_TO_TL_REVIEW',
      user: `${recruiterName} (TA Member)`,
      userRole: 'USER',
      target: `Candidate: ${cand.name} (${cand.jobTitle})`,
      detail: `Flagged for QA review: ${cand.flagReason}`
    });
    this.saveToStorage();
  }

  public approveTL(candidateId: string, tlName: string) {
    const cand = this.candidates.find(c => c.id === candidateId);
    if (!cand) return;
    cand.stageStatus = 'TL_APPROVED';
    cand.decision = 'SUBMIT';
    cand.tlReviewedBy = tlName;
    cand.tlReviewedAt = 'Just now';
    this.logAudit({
      action: 'TL_APPROVED',
      user: `${tlName} (Team Lead)`,
      userRole: 'TEAM_LEAD',
      target: `Candidate: ${cand.name}`,
      detail: `QA Profile verified & approved for Client/Interview submission.`
    });
    this.saveToStorage();
  }

  public calibrateScoreTL(candidateId: string, newScore: number, reason: string, tlName: string) {
    const cand = this.candidates.find(c => c.id === candidateId);
    if (!cand) return;
    const oldScore = cand.calibratedScore || cand.match;
    cand.calibratedScore = newScore;
    cand.scoreOverrideReason = reason;
    cand.stageStatus = 'OVERRIDDEN';
    cand.decision = newScore >= 75 ? 'SUBMIT' : 'REVIEW';
    cand.tlReviewedBy = tlName;
    cand.tlReviewedAt = 'Just now';
    this.logAudit({
      action: 'SCORE_OVERRIDE_APPROVED',
      user: `${tlName} (Team Lead)`,
      userRole: 'TEAM_LEAD',
      target: `Candidate: ${cand.name} (${cand.jobTitle})`,
      detail: `Calibrated match score from ${oldScore}% to ${newScore}%. Reason: ${reason}`
    });
    this.saveToStorage();
  }

  public rejectTL(candidateId: string, reason: string, tlName: string) {
    const cand = this.candidates.find(c => c.id === candidateId);
    if (!cand) return;
    cand.stageStatus = 'REJECTED';
    cand.decision = 'DO NOT SUBMIT';
    cand.scoreOverrideReason = reason;
    cand.tlReviewedBy = tlName;
    cand.tlReviewedAt = 'Just now';
    this.saveToStorage();
  }

  public clearAll() {
    this.jobs = [];
    this.candidates = [];
    this.auditEvents = [];
    this.recruiters = [];
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tasknera_ats_jobs');
      localStorage.removeItem('tasknera_ats_candidates');
      localStorage.removeItem('tasknera_ats_audits');
      localStorage.removeItem('tasknera_ats_recruiters');
    }
  }

  private logAudit(event: Omit<AuditEvent, 'id' | 'time' | 'timestamp'>) {
    const newAudit: AuditEvent = {
      ...event,
      id: `aud-${Date.now()}`,
      time: 'Just now',
      timestamp: Date.now(),
    };
    this.auditEvents = [newAudit, ...this.auditEvents.slice(0, 49)];
  }
}

export const atsStore = new ATSStore();
