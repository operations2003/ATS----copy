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

// Seed initial demo client portal if completely empty
if (portalCache.length === 0) {
  portalCache = [
    {
      id: 'share-hexaware-default',
      clientName: 'Hexaware',
      contactName: 'Rohit Verma',
      clientEmail: 'hiring@hexaware.com',
      token: 'client_hexaware_portal_token',
      shareUrl: 'http://localhost:3000/share/client_hexaware_portal_token?client=Hexaware',
      expiresAt: 'Never',
      createdAt: 'Active',
      views: 12,
      assignedMember: 'Rashmi Kotekar',
      assignedMemberRole: 'Technical Recruiter',
      assignedAt: 'Nov 20, 2026',
      organizationId: '2935c7d6-af40-4215-bc36-87aa454aca1c'
    }
  ];
  savePortals(portalCache);
}

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
    const isClientAdmin = user.role === 'CLIENT_ADMIN' || user.role === 'ADMIN';

    // Super admins see all portals
    if (isSuperAdmin) {
      res.status(200).json({ success: true, clientPortals: portalCache });
      return;
    }

    // Organization users see all portals belonging to their organization
    // OR portals where assignedMember matches their name
    const userName = String((user as any).name || '').toLowerCase().trim();
    const userEmail = (user.email || '').toLowerCase().trim();

    const filtered = portalCache.filter(p => {
      // Organization match
      if (orgId && p.organizationId && p.organizationId === orgId) return true;
      // Assigned directly to this recruiter
      if (p.assignedMember && p.assignedMember.toLowerCase().trim() === userName) return true;
      if (p.clientEmail && p.clientEmail.toLowerCase().trim() === userEmail) return true;
      // If portal has no organizationId assigned, share with org members
      if (!p.organizationId) return true;
      return false;
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
    loadPortals();

    const portal = portalCache.find(
      p => p.token === rawToken ||
           p.id === rawToken ||
           (p.shareUrl && p.shareUrl.includes(rawToken)) ||
           (p.token && rawToken && p.token.toLowerCase() === rawToken.toLowerCase()) ||
           (p.id && rawToken && p.id.toLowerCase() === rawToken.toLowerCase())
    );

    if (!portal) {
      res.status(404).json({ error: 'Client portal not found' });
      return;
    }

    // Increment views
    portal.views = (portal.views || 0) + 1;
    savePortals(portalCache);

    res.status(200).json({ success: true, clientPortal: portal });
  } catch (err: any) {
    console.error('[Get Public Client Portal Error]', err);
    res.status(500).json({ error: 'Failed to fetch client portal' });
  }
};

// POST /api/client-portals/share/:token/jds (Public - for client uploading JDs directly in client portal)
export const addJdToClientPortalPublic = async (req: any, res: Response): Promise<void> => {
  try {
    const rawToken = String(req.params.token || '').trim();
    const { jd, jds } = req.body;
    loadPortals();

    const portal = portalCache.find(
      p => p.token === rawToken ||
           p.id === rawToken ||
           (p.shareUrl && p.shareUrl.includes(rawToken)) ||
           (p.token && rawToken && p.token.toLowerCase() === rawToken.toLowerCase()) ||
           (p.id && rawToken && p.id.toLowerCase() === rawToken.toLowerCase())
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
