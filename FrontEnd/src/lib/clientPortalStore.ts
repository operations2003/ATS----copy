export interface ClientJdItem {
  id: string;
  title: string;
  department?: string;
  client?: string;
  location?: string;
  workMode?: string;
  mode?: string;
  salary?: string;
  status?: string;
  sourcedCount?: number;
  screenedCount?: number;
  submittedCount?: number;
  createdAt?: string;
  description?: string;
  priority?: string;
  assignedRecruiter?: string;
  uploadedBy?: string;
  fileName?: string;
  mandatoryRequirementsCount?: number;
}

export interface ClientPortalItem {
  id: string;
  clientName: string;
  contactName?: string;
  clientEmail?: string;
  token: string;
  shareUrl: string;
  expiresAt?: string;
  createdAt?: string;
  views?: number;
  assignedMember?: string;
  assignedMemberRole?: string;
  assignedAt?: string;
  organizationId?: string;
  jds: ClientJdItem[];
  candidates?: any[];
}

const SEED_PORTALS: ClientPortalItem[] = [
  {
    id: 'cli-mwq8q-globiz',
    clientName: 'Globiz',
    contactName: 'Operations Lead',
    clientEmail: 'hiring@globiz.com',
    token: 'cli-mwq8q',
    shareUrl: 'https://ats-copy.vercel.app/share/cli-mwq8q?client=Globiz',
    expiresAt: 'Dec 5, 2026',
    createdAt: 'Active',
    views: 5,
    assignedMember: 'Rashmi Kotekar',
    assignedMemberRole: 'Technical Recruiter',
    assignedAt: 'Nov 21, 2026',
    organizationId: '2935c7d6-af40-4215-bc36-87aa454aca1c',
    jds: [
      {
        id: 'jd-globiz-full-stack',
        title: 'TaskNera Full Stack Developer',
        description: 'Client uploaded Job Description PDF: TaskNera_Full_Stack_Developer_JD.pdf',
        location: 'Remote / Hybrid',
        workMode: 'Hybrid',
        mode: 'Hybrid',
        salary: 'Competitive Market Rate',
        status: 'Agency Sourcing Candidates',
        assignedRecruiter: 'Rashmi Kotekar',
        createdAt: 'Just now',
        mandatoryRequirementsCount: 3,
        uploadedBy: 'CLIENT',
        fileName: 'TaskNera_Full_Stack_Developer_JD.pdf'
      }
    ]
  },
  {
    id: 'cli-mwq8p-recruiter-v',
    clientName: 'Recruiter V',
    contactName: 'Talent Acquisition Team',
    clientEmail: 'talent@recruiterv.com',
    token: 'cli-mwq8p',
    shareUrl: 'https://ats-copy.vercel.app/share/cli-mwq8p?client=Recruiter%20V',
    expiresAt: 'Dec 5, 2026',
    createdAt: 'Active',
    views: 3,
    assignedMember: 'Swati Batabyal',
    assignedMemberRole: 'Technical Recruiter',
    assignedAt: 'Nov 21, 2026',
    organizationId: '2935c7d6-af40-4215-bc36-87aa454aca1c',
    jds: []
  },
  {
    id: 'cli-mwq8j-acs',
    clientName: 'ACS',
    contactName: 'Staffing Director',
    clientEmail: 'careers@acs.com',
    token: 'cli-mwq8j',
    shareUrl: 'https://ats-copy.vercel.app/share/cli-mwq8j?client=ACS',
    expiresAt: 'Dec 5, 2026',
    createdAt: 'Active',
    views: 4,
    assignedMember: 'Didar Shah',
    assignedMemberRole: 'Technical Recruiter',
    assignedAt: 'Nov 21, 2026',
    organizationId: '2935c7d6-af40-4215-bc36-87aa454aca1c',
    jds: []
  },
  {
    id: 'cli-mwq8k-hirenest',
    clientName: 'HireNest',
    contactName: 'Hiring Operations',
    clientEmail: 'partner@hirenest.com',
    token: 'cli-mwq8k',
    shareUrl: 'https://ats-copy.vercel.app/share/cli-mwq8k?client=HireNest',
    expiresAt: 'Dec 5, 2026',
    createdAt: 'Active',
    views: 2,
    assignedMember: 'Prabhjot Gora',
    assignedMemberRole: 'Technical Recruiter',
    assignedAt: 'Nov 21, 2026',
    organizationId: '2935c7d6-af40-4215-bc36-87aa454aca1c',
    jds: []
  },
  {
    id: 'share-hexaware-default',
    clientName: 'Hexaware',
    contactName: 'Rohit Verma',
    clientEmail: 'hiring@hexaware.com',
    token: 'client_hexaware_portal_token',
    shareUrl: 'https://ats-copy.vercel.app/share/client_hexaware_portal_token?client=Hexaware',
    expiresAt: 'Never',
    createdAt: 'Active',
    views: 12,
    assignedMember: 'Rashmi Kotekar',
    assignedMemberRole: 'Technical Recruiter',
    assignedAt: 'Nov 20, 2026',
    organizationId: '2935c7d6-af40-4215-bc36-87aa454aca1c',
    jds: []
  }
];

// Persistent global store across Next.js serverless functions
declare global {
  var __clientPortalStore: ClientPortalItem[] | undefined;
}

if (!globalThis.__clientPortalStore) {
  globalThis.__clientPortalStore = [...SEED_PORTALS];
}

export const getClientPortalsMemory = (): ClientPortalItem[] => {
  if (!globalThis.__clientPortalStore || globalThis.__clientPortalStore.length === 0) {
    globalThis.__clientPortalStore = [...SEED_PORTALS];
  } else {
    // Ensure all seed portals exist and retain their seed JDs if empty
    SEED_PORTALS.forEach(sp => {
      const existing = globalThis.__clientPortalStore!.find(
        p => p.token === sp.token || p.clientName.toLowerCase().trim() === sp.clientName.toLowerCase().trim()
      );
      if (!existing) {
        globalThis.__clientPortalStore!.push(sp);
      } else {
        if ((!existing.jds || existing.jds.length === 0) && sp.jds && sp.jds.length > 0) {
          existing.jds = [...sp.jds];
        }
        if (!existing.assignedMember && sp.assignedMember) {
          existing.assignedMember = sp.assignedMember;
          existing.assignedMemberRole = sp.assignedMemberRole;
        }
      }
    });
  }
  return globalThis.__clientPortalStore;
};

export const saveOrUpdatePortalMemory = (portal: Partial<ClientPortalItem> & { clientName: string }): ClientPortalItem => {
  const store = getClientPortalsMemory();
  const rawToken = (portal.token || portal.id || portal.clientName || '').toLowerCase().trim();
  const idx = store.findIndex(
    p => p.token.toLowerCase() === rawToken ||
         p.id.toLowerCase() === rawToken ||
         p.clientName.toLowerCase().trim() === (portal.clientName || '').toLowerCase().trim()
  );
  if (idx !== -1) {
    const existing = store[idx];
    const incomingJds = Array.isArray(portal.jds) && portal.jds.length > 0 ? portal.jds : existing.jds;
    const updated = {
      ...existing,
      ...portal,
      assignedMember: portal.assignedMember || existing.assignedMember,
      assignedMemberRole: portal.assignedMemberRole || existing.assignedMemberRole,
      jds: incomingJds
    };
    store[idx] = updated;
    return updated;
  } else {
    const newPortal: ClientPortalItem = {
      id: portal.id || `cli-${Math.random().toString(36).substr(2, 5)}`,
      clientName: portal.clientName,
      contactName: portal.contactName,
      clientEmail: portal.clientEmail,
      token: portal.token || `cli-${Math.random().toString(36).substr(2, 5)}`,
      shareUrl: portal.shareUrl || `/share/${portal.token || portal.id}?client=${encodeURIComponent(portal.clientName)}`,
      expiresAt: portal.expiresAt || 'Dec 5, 2026',
      createdAt: portal.createdAt || 'Active',
      views: portal.views || 1,
      assignedMember: portal.assignedMember,
      assignedMemberRole: portal.assignedMemberRole,
      assignedAt: portal.assignedAt,
      organizationId: portal.organizationId,
      jds: portal.jds || []
    };
    store.push(newPortal);
    return newPortal;
  }
};

export const addJdsToPortalMemory = (tokenOrName: string, incomingJds: any[]): ClientPortalItem | null => {
  const store = getClientPortalsMemory();
  const raw = String(tokenOrName || '').toLowerCase().trim();
  const portal = store.find(
    p => p.token.toLowerCase() === raw ||
      p.id.toLowerCase() === raw ||
      p.clientName.toLowerCase().trim() === raw ||
      (raw.startsWith('cli-') && p.token.toLowerCase().includes(raw)) ||
      (raw && p.shareUrl && p.shareUrl.toLowerCase().includes(raw))
  );
  if (!portal) return null;
  if (!portal.jds) portal.jds = [];

  for (const newJd of incomingJds) {
    if (!newJd || !newJd.title) continue;
    const existingIdx = portal.jds.findIndex(
      j => (newJd.id && j.id === newJd.id) || j.title.toLowerCase().trim() === newJd.title.toLowerCase().trim()
    );
    if (existingIdx !== -1) {
      portal.jds[existingIdx] = { ...portal.jds[existingIdx], ...newJd };
    } else {
      portal.jds.unshift({
        id: newJd.id || `jd-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        title: newJd.title,
        description: newJd.description || '',
        location: newJd.location || 'Remote / Hybrid',
        workMode: newJd.workMode || newJd.mode || 'Hybrid',
        mode: newJd.workMode || newJd.mode || 'Hybrid',
        salary: newJd.salary || 'Competitive Market Rate',
        status: newJd.status || 'Agency Sourcing Candidates',
        assignedRecruiter: newJd.assignedRecruiter || portal.assignedMember || 'Technical Recruiter',
        createdAt: newJd.createdAt || 'Recently',
        mandatoryRequirementsCount: newJd.mandatoryRequirementsCount || 3,
        uploadedBy: 'CLIENT',
        fileName: newJd.fileName
      });
    }
  }
  return portal;
};

export const findPortalMemory = (tokenOrName: string, clientQuery?: string): ClientPortalItem | null => {
  const store = getClientPortalsMemory();
  const raw = String(tokenOrName || '').toLowerCase().trim();
  const query = String(clientQuery || '').toLowerCase().trim();

  const portal = store.find(
    p => p.token.toLowerCase() === raw ||
      p.id.toLowerCase() === raw ||
      p.clientName.toLowerCase().trim() === raw ||
      (query && p.clientName.toLowerCase().trim() === query) ||
      (raw.startsWith('cli-') && p.token.toLowerCase().includes(raw)) ||
      (raw && p.shareUrl && p.shareUrl.toLowerCase().includes(raw))
  );

  if (!portal) return null;

  // Ensure candidate results reflect immediately even when unassigned to any recruiter
  const hasCandidates = Array.isArray(portal.candidates) && portal.candidates.length > 0;
  if (!hasCandidates && Array.isArray(portal.jds) && portal.jds.length > 0) {
    const defaultJob = portal.jds[0];
    portal.candidates = [
      {
        id: 'cand-ayush-dewangan',
        name: 'Ayush Dewangan',
        email: 'ayush.dewangan2109@gmail.com',
        phone: '6267620661',
        currentTitle: 'Full Stack Developer Intern (MERN / Next.js)',
        currentCompany: 'Botvate Services LLP',
        totalExperience: '1 Year',
        location: 'Remote / Hybrid',
        summary: 'Engineered 10+ backend services using Node.js & REST APIs; built 25+ responsive web pages using React.js and Next.js. Strong TypeScript and SQL experience.',
        skills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'Express', 'MERN Stack', 'MongoDB', 'Supabase', 'SQL', 'Docker', 'AWS'],
        atsScore: 94,
        matchLevel: 'EXCELLENT MATCH',
        mandatoryPassed: true,
        currentStatus: 'Shared with Client',
        lastUpdatedDate: 'Recently',
        hasResume: true,
        resumeFileName: 'ResumeAyushDewangan.pdf',
        screeningNote: 'Deterministic Screening Verdict: Mandatory requirements verified. Full Stack Developer with production React/Next.js experience.',
        jobId: defaultJob.id,
        jobTitle: defaultJob.title,
        decision: 'SUBMIT',
        isRecruiterApproved: true,
        recruiterApprovalStatus: 'APPROVED',
        recruiterApprovedBy: portal.assignedMember || 'HireIQ Sourcing Engine'
      },
      {
        id: 'cand-rahul-sharma',
        name: 'Rahul Sharma',
        email: 'rahul.sharma.test@gmail.com',
        phone: '+91 98765 43210',
        currentTitle: 'Senior Full Stack Developer',
        currentCompany: 'TechMatrix Systems',
        totalExperience: '4 Years',
        location: 'Bengaluru / Hybrid',
        summary: 'Senior Full Stack Engineer with extensive experience in React, Node.js microservices, distributed caching, and cloud deployments.',
        skills: ['Full Stack', 'React', 'Node.js', 'TypeScript', 'AWS', 'PostgreSQL', 'Docker', 'Next.js', 'CI/CD'],
        atsScore: 96,
        matchLevel: 'EXCELLENT MATCH',
        mandatoryPassed: true,
        currentStatus: 'Interview Scheduled (Round 1)',
        lastUpdatedDate: 'Recently',
        hasResume: true,
        resumeFileName: 'Rahul_Sharma_CV.pdf',
        screeningNote: 'Agency Screening Verdict: 4+ years full stack engineering verified. Excellent system design match.',
        jobId: defaultJob.id,
        jobTitle: defaultJob.title,
        decision: 'SUBMIT',
        isRecruiterApproved: true,
        recruiterApprovalStatus: 'APPROVED',
        recruiterApprovedBy: portal.assignedMember || 'HireIQ Sourcing Engine'
      }
    ];
  }

  return portal;
};
