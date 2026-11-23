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

const SEED_PORTALS: ClientPortalItem[] = [];

// Persistent global store across Next.js serverless functions
declare global {
  var __clientPortalStore: ClientPortalItem[] | undefined;
}

if (!globalThis.__clientPortalStore) {
  globalThis.__clientPortalStore = [];
}

export const getClientPortalsMemory = (): ClientPortalItem[] => {
  if (!globalThis.__clientPortalStore) {
    globalThis.__clientPortalStore = [];
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

  return portal;
};

export const deletePortalMemory = (idOrToken: string): boolean => {
  const store = getClientPortalsMemory();
  const raw = String(idOrToken || '').toLowerCase().trim();
  const idx = store.findIndex(
    p => p.id.toLowerCase() === raw || p.token.toLowerCase() === raw || p.clientName.toLowerCase().trim() === raw
  );
  if (idx !== -1) {
    store.splice(idx, 1);
    return true;
  }
  return false;
};


