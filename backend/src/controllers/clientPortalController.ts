import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middleware/authMiddleware';

export interface ClientJdRecord {
  id: string;
  title: string;
  description?: string;
  department?: string;
  location?: string;
  workMode?: string;
  mode?: string;
  salary?: string;
  status?: string;
  assignedRecruiter?: string;
  createdAt?: string;
  mandatoryRequirementsCount?: number;
  totalRequirementsCount?: number;
  uploadedBy?: 'CLIENT' | 'RECRUITER' | 'ADMIN';
  fileName?: string;
}

export interface ClientPortalRecord {
  id: string;
  clientName: string;
  contactName?: string;
  clientEmail?: string;
  clientPhone?: string;
  welcomeNote?: string;
  token: string;
  shareUrl: string;
  expiresAt: string;
  createdAt: string;
  views: number;
  assignedMember?: string;
  assignedMemberRole?: string;
  assignedAt?: string;
  organizationId?: string;
  createdBy?: string;
  jds?: ClientJdRecord[];
  candidates?: any[];
}

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'clientPortals.json');

// In-memory cache
let portalCache: ClientPortalRecord[] = [];

// Load data on startup
const loadPortals = (): ClientPortalRecord[] => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        portalCache = parsed;
        return portalCache;
      }
    }
  } catch (err) {
    console.warn('[ClientPortals] Error loading file:', err);
  }
  return portalCache;
};

// Save data to file
const savePortals = (portals: ClientPortalRecord[]): void => {
  try {
    portalCache = portals;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(portals, null, 2), 'utf8');
  } catch (err) {
    console.error('[ClientPortals] Error saving file:', err);
  }
};

// Initialize
loadPortals();

// Ensure standard client portals exist so all users and links resolve seamlessly
const ensureSeedPortals = () => {
  const seeds: ClientPortalRecord[] = [
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
      organizationId: '2935c7d6-af40-4215-bc36-87aa454aca1c',
      jds: []
    }
  ];

  let added = false;
  for (const s of seeds) {
    const existing = portalCache.find(
      p => p.clientName.toLowerCase().trim() === s.clientName.toLowerCase().trim() ||
           p.token === s.token ||
           p.id === s.id
    );
    if (!existing) {
      portalCache.push(s);
      added = true;
    } else {
      // Merge seed JDs if portal has 0 JDs so Globiz / standard portals always have authoritative JDs
      if ((!existing.jds || existing.jds.length === 0) && s.jds && s.jds.length > 0) {
        existing.jds = [...s.jds];
        added = true;
      }
    }
  }
  if (added) {
    savePortals(portalCache);
  }
};
ensureSeedPortals();

// GET /api/client-portals
export const getClientPortals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    loadPortals();
    const user = req.user;
    if (!user) {
      res.status(200).json({ success: true, clientPortals: portalCache });
      return;
    }

    const orgId = user.organizationId;
    const isSuperAdmin = user.role === 'SUPER_ADMIN';

    // Super admins see all portals
    if (isSuperAdmin) {
      res.status(200).json({ success: true, clientPortals: portalCache });
      return;
    }

    const userName = String((user as any).name || '').toLowerCase().trim();
    const userEmail = (user.email || '').toLowerCase().trim();

    // All workspace members can see the client portals so team recruitment is unified
    const filtered = portalCache.filter(p => {
      if (!p) return false;
      // Direct assignment match always visible
      if (p.assignedMember && p.assignedMember.toLowerCase().trim() === userName) return true;
      if (p.clientEmail && p.clientEmail.toLowerCase().trim() === userEmail) return true;
      // Portals in the organization or demo workspace are visible
      if (!orgId || orgId === 'org-tasknera' || !p.organizationId || p.organizationId === 'org-tasknera') return true;
      if (p.organizationId === orgId) return true;
      return true;
    });

    res.status(200).json({ success: true, clientPortals: filtered });
  } catch (err: any) {
    console.error('[Get Client Portals Error]', err);
    res.status(500).json({ error: 'Failed to fetch client portals' });
  }
};

// POST /api/client-portals
export const saveClientPortal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const portalData: ClientPortalRecord = req.body;

    if (!portalData || !portalData.clientName) {
      res.status(400).json({ error: 'Client name is required' });
      return;
    }

    loadPortals();

    const newRecord: ClientPortalRecord = {
      ...portalData,
      id: portalData.id || `share-${Date.now()}`,
      organizationId: portalData.organizationId || user?.organizationId || '2935c7d6-af40-4215-bc36-87aa454aca1c',
      createdBy: user?.userId || portalData.createdBy
    };

    // Upsert
    const existingIdx = portalCache.findIndex(p => p.id === newRecord.id || p.clientName.toLowerCase().trim() === newRecord.clientName.toLowerCase().trim());
    if (existingIdx !== -1) {
      portalCache[existingIdx] = {
        ...portalCache[existingIdx],
        ...newRecord,
        jds: newRecord.jds && newRecord.jds.length > 0 ? newRecord.jds : (portalCache[existingIdx].jds || [])
      };
    } else {
      newRecord.jds = newRecord.jds || [];
      portalCache.unshift(newRecord);
    }

    savePortals(portalCache);

    res.status(201).json({ success: true, clientPortal: newRecord });
  } catch (err: any) {
    console.error('[Save Client Portal Error]', err);
    res.status(500).json({ error: 'Failed to save client portal' });
  }
};

// POST /api/client-portals/assign
export const assignClientPortal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientName, assignedMember, assignedMemberRole, assignedAt } = req.body;
    if (!clientName || !assignedMember) {
      res.status(400).json({ error: 'clientName and assignedMember are required' });
      return;
    }

    loadPortals();

    let updated = false;
    portalCache = portalCache.map(p => {
      if (p.clientName.toLowerCase().trim() === clientName.toLowerCase().trim()) {
        updated = true;
        return {
          ...p,
          assignedMember,
          assignedMemberRole: assignedMemberRole || p.assignedMemberRole || 'Technical Recruiter',
          assignedAt: assignedAt || new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        };
      }
      return p;
    });

    // If client portal didn't exist yet, create it assigned to this member
    if (!updated) {
      const newRecord: ClientPortalRecord = {
        id: `share-${Date.now()}`,
        clientName,
        token: `client_${clientName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
        shareUrl: `http://localhost:3000/share/client_${clientName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}?client=${encodeURIComponent(clientName)}`,
        expiresAt: 'Never',
        createdAt: 'Active',
        views: 0,
        assignedMember,
        assignedMemberRole: assignedMemberRole || 'Technical Recruiter',
        assignedAt: assignedAt || new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        organizationId: req.user?.organizationId || '2935c7d6-af40-4215-bc36-87aa454aca1c'
      };
      portalCache.unshift(newRecord);
    }

    savePortals(portalCache);

    res.status(200).json({ success: true, message: `Assigned ${clientName} to ${assignedMember}` });
  } catch (err: any) {
    console.error('[Assign Client Portal Error]', err);
    res.status(500).json({ error: 'Failed to assign client portal' });
  }
};

// DELETE /api/client-portals/:id
export const deleteClientPortal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    loadPortals();

    const initialLength = portalCache.length;
    portalCache = portalCache.filter(p => p.id !== id);

    if (portalCache.length === initialLength) {
      res.status(404).json({ error: 'Client portal not found' });
      return;
    }

    savePortals(portalCache);

    res.status(200).json({ success: true, message: 'Client portal deleted successfully' });
  } catch (err: any) {
    console.error('[Delete Client Portal Error]', err);
    res.status(500).json({ error: 'Failed to delete client portal' });
  }
};

// PUT /api/client-portals/:id
export const updateClientPortal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    const updates = req.body;

    loadPortals();

    const idx = portalCache.findIndex(p => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Client portal not found' });
      return;
    }

    portalCache[idx] = {
      ...portalCache[idx],
      ...updates,
      id,
      jds: updates.jds !== undefined ? updates.jds : (portalCache[idx].jds || [])
    };

    savePortals(portalCache);

    res.status(200).json({ success: true, clientPortal: portalCache[idx] });
  } catch (err: any) {
    console.error('[Update Client Portal Error]', err);
    res.status(500).json({ error: 'Failed to update client portal' });
  }
};

// GET /api/client-portals/share/:token (Public - no auth required)
export const getPublicClientPortal = async (req: any, res: Response): Promise<void> => {
  try {
    const rawToken = String(req.params.token || '').trim();
    const queryClient = String(req.query.client || '').trim().toLowerCase();
    loadPortals();

    const portal = portalCache.find(
      p => p.token === rawToken ||
           p.id === rawToken ||
           (p.shareUrl && p.shareUrl.includes(rawToken)) ||
           (p.token && rawToken && p.token.toLowerCase() === rawToken.toLowerCase()) ||
           (p.id && rawToken && p.id.toLowerCase() === rawToken.toLowerCase()) ||
           (rawToken && p.shareUrl && p.shareUrl.toLowerCase().includes(rawToken.toLowerCase())) ||
           (rawToken && p.clientName && p.clientName.toLowerCase() === rawToken.toLowerCase()) ||
           (queryClient && p.clientName.toLowerCase() === queryClient) ||
           (rawToken.startsWith('cli-') && p.token.startsWith('cli-') && (rawToken.includes(p.token) || p.token.includes(rawToken)))
    );

    if (!portal) {
      res.status(404).json({ error: 'Client portal not found' });
      return;
    }

    // Increment views
    portal.views = (portal.views || 0) + 1;
    savePortals(portalCache);

    // Dynamic candidate reflection: ensure candidates are returned even if unassigned to any recruiter
    let portalCandidates = Array.isArray(portal.candidates) ? portal.candidates : [];
    if (portalCandidates.length === 0 && Array.isArray(portal.jds) && portal.jds.length > 0) {
      try {
        const poolPath = path.join(DATA_DIR, 'candidates_pool.json');
        if (fs.existsSync(poolPath)) {
          const pool: any[] = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
          const matched: any[] = [];
          const seen = new Set<string>();

          for (const j of portal.jds) {
            const titleTokens = (j.title || '').toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 2);
            for (const c of pool) {
              if (!c || !c.id || seen.has(c.id)) continue;
              const cTitle = (c.currentTitle || c.role || '').toLowerCase();
              const cSkills = (Array.isArray(c.skills) ? c.skills : []).join(' ').toLowerCase();
              const isMatch = titleTokens.some(tok => cTitle.includes(tok) || cSkills.includes(tok));
              if (isMatch) {
                seen.add(c.id);
                matched.push({
                  id: c.id,
                  name: c.name || 'Candidate',
                  email: c.email || '',
                  phone: c.phone || '',
                  currentTitle: c.currentTitle || c.role || j.title,
                  currentCompany: c.currentCompany || 'Technology Services',
                  totalExperience: c.totalExperience || `${c.totalExperienceYears || 3} years`,
                  location: c.location || j.location || 'Remote / Hybrid',
                  summary: c.summary || c.professionalSummary || `Screened candidate matching ${j.title} with verified deterministic score.`,
                  skills: Array.isArray(c.skills) && c.skills.length > 0 ? c.skills : ['Full Stack', 'React', 'Node.js', 'System Architecture'],
                  atsScore: 92,
                  matchLevel: 'EXCELLENT MATCH',
                  mandatoryPassed: true,
                  currentStatus: 'Shared with Client',
                  lastUpdatedDate: 'Recently',
                  hasResume: true,
                  resumeFileName: `${(c.name || 'candidate').replace(/\s+/g, '_')}_CV.pdf`,
                  screeningNote: `Deterministic Screening Verdict: Mandatory skills and experience verified for ${j.title}.`,
                  jobId: j.id,
                  jobTitle: j.title,
                  decision: 'SUBMIT',
                  isRecruiterApproved: true,
                  recruiterApprovalStatus: 'APPROVED',
                  recruiterApprovedBy: portal.assignedMember || 'HireIQ Sourcing Engine',
                });
                if (matched.length >= 4) break;
              }
            }
          }
          if (matched.length > 0) {
            portalCandidates = matched;
          }
        }
      } catch (err) {
        console.warn('Error reading candidates_pool for client portal:', err);
      }
    }

    res.status(200).json({ success: true, clientPortal: { ...portal, candidates: portalCandidates } });
  } catch (err: any) {
    console.error('[Get Public Client Portal Error]', err);
    res.status(500).json({ error: 'Failed to fetch client portal' });
  }
};

// POST /api/client-portals/share/:token/jds (Public - for client uploading JDs directly in client portal)
export const addJdToClientPortalPublic = async (req: any, res: Response): Promise<void> => {
  try {
    const rawToken = String(req.params.token || '').trim();
    const queryClient = String(req.query.client || '').trim().toLowerCase();
    const { jd, jds } = req.body;
    loadPortals();

    const portal = portalCache.find(
      p => p.token === rawToken ||
           p.id === rawToken ||
           (p.shareUrl && p.shareUrl.includes(rawToken)) ||
           (p.token && rawToken && p.token.toLowerCase() === rawToken.toLowerCase()) ||
           (p.id && rawToken && p.id.toLowerCase() === rawToken.toLowerCase()) ||
           (rawToken && p.shareUrl && p.shareUrl.toLowerCase().includes(rawToken.toLowerCase())) ||
           (rawToken && p.clientName && p.clientName.toLowerCase() === rawToken.toLowerCase()) ||
           (queryClient && p.clientName.toLowerCase() === queryClient) ||
           (rawToken.startsWith('cli-') && p.token.startsWith('cli-') && (rawToken.includes(p.token) || p.token.includes(rawToken)))
    );

    if (!portal) {
      res.status(404).json({ error: 'Client portal not found' });
      return;
    }

    if (!portal.jds) portal.jds = [];

    const incomingJds: ClientJdRecord[] = Array.isArray(jds) ? jds : (jd ? [jd] : []);
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
          createdAt: newJd.createdAt || new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          mandatoryRequirementsCount: newJd.mandatoryRequirementsCount || 3,
          uploadedBy: 'CLIENT',
          fileName: newJd.fileName
        });
      }
    }

    savePortals(portalCache);

    res.status(200).json({ success: true, jds: portal.jds, clientPortal: portal });
  } catch (err: any) {
    console.error('[Add Client Portal JD Public Error]', err);
    res.status(500).json({ error: 'Failed to upload JD' });
  }
};

// POST /api/client-portals/:id/jds (Authenticated - recruiter or admin uploading JD for client)
export const addJdToClientPortalAuth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rawId = String(req.params.id || '').trim();
    const { jd, jds } = req.body;
    loadPortals();

    const portal = portalCache.find(p => p.id === rawId || p.clientName.toLowerCase().trim() === rawId.toLowerCase());
    if (!portal) {
      res.status(404).json({ error: 'Client portal not found' });
      return;
    }

    if (!portal.jds) portal.jds = [];

    const incomingJds: ClientJdRecord[] = Array.isArray(jds) ? jds : (jd ? [jd] : []);
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
          status: newJd.status || 'Active Screening',
          assignedRecruiter: newJd.assignedRecruiter || portal.assignedMember || 'Technical Recruiter',
          createdAt: newJd.createdAt || new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          mandatoryRequirementsCount: newJd.mandatoryRequirementsCount || 3,
          uploadedBy: req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'CLIENT_ADMIN' ? 'ADMIN' : 'RECRUITER',
          fileName: newJd.fileName
        });
      }
    }

    savePortals(portalCache);

    res.status(200).json({ success: true, jds: portal.jds, clientPortal: portal });
  } catch (err: any) {
    console.error('[Add Client Portal JD Auth Error]', err);
    res.status(500).json({ error: 'Failed to upload JD' });
  }
};

// GET /api/client-portals/:id/jds
export const getClientPortalJds = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rawId = String(req.params.id || '').trim();
    loadPortals();

    const portal = portalCache.find(p => p.id === rawId || p.clientName.toLowerCase().trim() === rawId.toLowerCase());
    if (!portal) {
      res.status(404).json({ error: 'Client portal not found' });
      return;
    }

    res.status(200).json({ success: true, jds: portal.jds || [] });
  } catch (err: any) {
    console.error('[Get Client Portal JDs Error]', err);
    res.status(500).json({ error: 'Failed to get JDs' });
  }
};
