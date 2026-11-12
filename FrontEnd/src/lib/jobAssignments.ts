/**
 * Central deterministic Requisition Assignment Engine
 * 
 * Ensures that whenever a Job Description is assigned to an organization member
 * (from the Client Portal, Requisition Intake, or Admin assignment modal),
 * the assignment sticks steadily across all views (/jobs, /clients, /dashboard, /pipeline),
 * without hallucination, fluctuating states, or disappearing upon backend fetch.
 */

export const JOB_ASSIGNMENTS_STORAGE_KEY = 'tasknera_job_assignments_v1';
export const CLIENT_SHARES_STORAGE_KEY = 'tasknera_client_portal_shares_v1';
export const LEGACY_CLIENT_SHARES_KEY = 'tasknera_client_shares';

export interface JobAssignmentRecord {
  jobId?: string;
  client: string;
  title?: string;
  assignedRecruiter: string;
  role: string;
  assignedAt: string;
  assignedBy?: string;
}

const clean = (s?: string | null): string => String(s || '').trim().toLowerCase();

export const isExcludedRecruiterName = (name?: string | null): boolean => {
  const n = clean(name);
  if (!n) return true;
  return (
    n === 'demo' ||
    n === 'demo admin' ||
    n === 'job creator' ||
    n === 'unassigned' ||
    n === 'agency delivery team' ||
    n === 'recruiter' ||
    n === 'administrator' ||
    n === 'tasknera user' ||
    n === 'tasknera'
  );
};

/**
 * Resolves the deterministic assigned recruiter for a job requisition by inspecting:
 * 1. Dedicated tasknera_job_assignments_v1 by jobId
 * 2. Dedicated tasknera_job_assignments_v1 by client:::title composite
 * 3. Dedicated tasknera_job_assignments_v1 by client:::* wildcard
 * 4. tasknera_client_portal_shares_v1 / tasknera_client_shares matching client
 * 5. tasknera_client_jds_${client} matching title or id
 * 6. tasknera_created_jobs matching id or title
 * 7. tasknera_all_jobs matching id or title
 * 8. tasknera_ats_jobs (ATS Store) matching id or title
 */
export function getJobAssignment(job: {
  id?: string | null;
  client?: string | null;
  company?: string | null;
  title?: string | null;
  position?: string | null;
  assignedRecruiter?: string | null;
  assignedTo?: string | null;
}): { assignedRecruiter: string; role: string; assignedAt?: string; assignedBy?: string } | null {
  if (typeof window === 'undefined') return null;

  const jobId = job.id ? String(job.id).trim() : '';
  const client = clean(job.client || job.company);
  const title = clean(job.position || job.title);

  // 1. Check dedicated tasknera_job_assignments_v1
  try {
    const raw = localStorage.getItem(JOB_ASSIGNMENTS_STORAGE_KEY);
    if (raw) {
      const registry: Record<string, JobAssignmentRecord> = JSON.parse(raw);

      // 1a. By exact ID
      if (jobId && registry[jobId] && !isExcludedRecruiterName(registry[jobId].assignedRecruiter)) {
        return registry[jobId];
      }

      // 1b. By composite key: client:::title
      if (client && title) {
        const compositeKey = `${client}:::${title}`;
        if (registry[compositeKey] && !isExcludedRecruiterName(registry[compositeKey].assignedRecruiter)) {
          return registry[compositeKey];
        }
      }

      // 1c. By client wildcard: client:::*
      if (client) {
        const wildcardKey = `${client}:::*`;
        if (registry[wildcardKey] && !isExcludedRecruiterName(registry[wildcardKey].assignedRecruiter)) {
          return registry[wildcardKey];
        }
      }
    }
  } catch {}

  // 2. Check Client Portal Shares (tasknera_client_portal_shares_v1)
  try {
    const sharesRaw = localStorage.getItem(CLIENT_SHARES_STORAGE_KEY) || localStorage.getItem(LEGACY_CLIENT_SHARES_KEY);
    if (sharesRaw) {
      const shares = JSON.parse(sharesRaw);
      if (Array.isArray(shares)) {
        const matchingShare = shares.find((s: any) => clean(s.clientName) === client || (client && clean(s.clientName).includes(client)));
        if (matchingShare && matchingShare.assignedMember && !isExcludedRecruiterName(matchingShare.assignedMember)) {
          return {
            assignedRecruiter: matchingShare.assignedMember,
            role: matchingShare.assignedMemberRole || 'Technical Recruiter',
            assignedAt: matchingShare.assignedAt || 'Portal Assignment',
            assignedBy: 'Client Portal Share'
          };
        }
      }
    }
  } catch {}

  // 3. Check client uploaded JDs (tasknera_client_jds_${client})
  if (client) {
    try {
      const storageKey = `tasknera_client_jds_${client.replace(/\s+/g, '_')}`;
      const rawCj = localStorage.getItem(storageKey);
      if (rawCj) {
        const list = JSON.parse(rawCj);
        if (Array.isArray(list)) {
          const match = list.find((item: any) =>
            (jobId && String(item.id) === jobId) ||
            (title && clean(item.title || item.name) === title)
          );
          if (match && match.assignedRecruiter && !isExcludedRecruiterName(match.assignedRecruiter)) {
            return {
              assignedRecruiter: match.assignedRecruiter,
              role: match.assignedMemberRole || 'Technical Recruiter',
              assignedAt: match.createdAt || 'Client Upload'
            };
          }
        }
      }
    } catch {}
  }

  // 4. Check tasknera_created_jobs
  try {
    const rawCreated = localStorage.getItem('tasknera_created_jobs');
    if (rawCreated) {
      const list = JSON.parse(rawCreated);
      if (Array.isArray(list)) {
        const match = list.find((item: any) =>
          (jobId && String(item.id) === jobId) ||
          ((clean(item.client || item.company) === client) && clean(item.position || item.title) === title)
        );
        const assigned = match?.assignedRecruiter || match?.assignedTo;
        if (assigned && !isExcludedRecruiterName(assigned)) {
          return {
            assignedRecruiter: assigned,
            role: match.workedBy?.[0]?.role || 'Technical Recruiter',
            assignedAt: match.createdAt || 'Requisition Intake'
          };
        }
      }
    }
  } catch {}

  // 5. Check tasknera_all_jobs
  try {
    const rawAll = localStorage.getItem('tasknera_all_jobs');
    if (rawAll) {
      const list = JSON.parse(rawAll);
      if (Array.isArray(list)) {
        const match = list.find((item: any) =>
          (jobId && String(item.id) === jobId) ||
          ((clean(item.client || item.company) === client) && clean(item.position || item.title) === title)
        );
        const assigned = match?.assignedRecruiter || match?.assignedTo;
        if (assigned && !isExcludedRecruiterName(assigned)) {
          return {
            assignedRecruiter: assigned,
            role: match.workedBy?.[0]?.role || 'Technical Recruiter',
            assignedAt: match.createdAt || 'Active Jobs'
          };
        }
      }
    }
  } catch {}

  // 6. Check tasknera_ats_jobs (ATS Store)
  try {
    const rawAts = localStorage.getItem('tasknera_ats_jobs');
    if (rawAts) {
      const list = JSON.parse(rawAts);
      if (Array.isArray(list)) {
        const match = list.find((item: any) =>
          (jobId && String(item.id) === jobId) ||
          ((clean(item.client) === client) && clean(item.title) === title)
        );
        if (match && match.assignedRecruiter && !isExcludedRecruiterName(match.assignedRecruiter)) {
          return {
            assignedRecruiter: match.assignedRecruiter,
            role: match.workedBy?.[0]?.role || 'Technical Recruiter',
            assignedAt: match.createdAt || 'ATS Store'
          };
        }
      }
    }
  } catch {}

  // 7. Check the job's own assignedRecruiter / assignedTo
  const ownAssigned = job.assignedRecruiter || job.assignedTo;
  if (ownAssigned && !isExcludedRecruiterName(ownAssigned)) {
    return {
      assignedRecruiter: ownAssigned,
      role: 'Technical Recruiter',
      assignedAt: 'Job Profile'
    };
  }

  return null;
}

/**
 * Persists an authoritative assignment for a job requisition across:
 * 1. tasknera_job_assignments_v1 (by ID, composite key, and client wildcard)
 * 2. tasknera_client_portal_shares_v1 & tasknera_client_shares
 * 3. tasknera_client_jds_${client}
 * 4. tasknera_created_jobs
 * 5. tasknera_all_jobs
 * 6. tasknera_ats_jobs (ATS Store)
 * 7. Broadcasts custom event 'tasknera_jobs_updated' so all listening pages instantly re-render
 */
export function setJobAssignment(params: {
  jobId?: string;
  client: string;
  title?: string;
  assignedRecruiter: string;
  role?: string;
  assignedBy?: string;
}): void {
  if (typeof window === 'undefined') return;

  const { jobId, client, title, assignedRecruiter, role = 'Technical Recruiter', assignedBy = 'Administrator' } = params;
  if (!assignedRecruiter || isExcludedRecruiterName(assignedRecruiter)) return;

  const now = new Date().toISOString();
  const dateFormatted = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const record: JobAssignmentRecord = {
    jobId,
    client: client.trim(),
    title: title?.trim(),
    assignedRecruiter: assignedRecruiter.trim(),
    role: role.trim() || 'Technical Recruiter',
    assignedAt: dateFormatted,
    assignedBy
  };

  const cleanClient = clean(client);
  const cleanTitle = clean(title);

  // 1. Update tasknera_job_assignments_v1
  try {
    const raw = localStorage.getItem(JOB_ASSIGNMENTS_STORAGE_KEY);
    const registry: Record<string, JobAssignmentRecord> = raw ? JSON.parse(raw) : {};

    if (jobId) {
      registry[String(jobId).trim()] = record;
    }
    if (cleanClient && cleanTitle) {
      registry[`${cleanClient}:::${cleanTitle}`] = record;
    }
    if (cleanClient) {
      registry[`${cleanClient}:::*`] = record;
    }

    localStorage.setItem(JOB_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(registry));
  } catch (err) {
    console.warn('Failed to save to JOB_ASSIGNMENTS_STORAGE_KEY:', err);
  }

  // 2. Synchronize tasknera_client_portal_shares_v1 & tasknera_client_shares
  try {
    [CLIENT_SHARES_STORAGE_KEY, LEGACY_CLIENT_SHARES_KEY].forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw) {
        const shares = JSON.parse(raw);
        if (Array.isArray(shares)) {
          let updated = false;
          const mapped = shares.map((s: any) => {
            if (clean(s.clientName) === cleanClient || (cleanClient && clean(s.clientName).includes(cleanClient))) {
              updated = true;
              return {
                ...s,
                assignedMember: record.assignedRecruiter,
                assignedMemberRole: record.role,
                assignedAt: record.assignedAt
              };
            }
            return s;
          });
          if (updated) {
            localStorage.setItem(key, JSON.stringify(mapped));
          }
        }
      }
    });
  } catch (err) {
    console.warn('Failed to sync client shares:', err);
  }

  // 3. Synchronize tasknera_client_jds_${client}
  try {
    const storageKey = `tasknera_client_jds_${client.trim().replace(/\s+/g, '_')}`;
    const rawCj = localStorage.getItem(storageKey);
    if (rawCj) {
      const list = JSON.parse(rawCj);
      if (Array.isArray(list)) {
        const updatedList = list.map((item: any) => {
          if (!cleanTitle || clean(item.title || item.name) === cleanTitle || (jobId && String(item.id) === jobId)) {
            return {
              ...item,
              assignedRecruiter: record.assignedRecruiter,
              assignedMemberRole: record.role
            };
          }
          return item;
        });
        localStorage.setItem(storageKey, JSON.stringify(updatedList));
      }
    }
  } catch (err) {
    console.warn('Failed to sync client JDs:', err);
  }

  const workerObj = {
    id: `rec-${record.assignedRecruiter.toLowerCase().replace(/\s+/g, '-')}`,
    name: record.assignedRecruiter,
    role: record.role,
    action: 'Assigned Lead',
    isCreator: false
  };

  // 4. Synchronize tasknera_created_jobs
  try {
    const rawCreated = localStorage.getItem('tasknera_created_jobs');
    const list = rawCreated ? JSON.parse(rawCreated) : [];
    if (Array.isArray(list)) {
      let matched = false;
      const updatedList = list.map((item: any) => {
        const matchById = jobId && String(item.id) === jobId;
        const matchByTitleClient = clean(item.client || item.company) === cleanClient && (!cleanTitle || clean(item.position || item.title) === cleanTitle);
        if (matchById || matchByTitleClient) {
          matched = true;
          const currentWorkers = Array.isArray(item.workedBy) ? item.workedBy : [];
          return {
            ...item,
            assignedRecruiter: record.assignedRecruiter,
            assignedTo: record.assignedRecruiter,
            workedBy: [
              workerObj,
              ...currentWorkers.filter((w: any) => clean(w.name) !== clean(record.assignedRecruiter))
            ]
          };
        }
        return item;
      });

      if (!matched && (jobId || (cleanClient && cleanTitle))) {
        // Prepend new created job record
        updatedList.unshift({
          id: jobId || `job-client-${Date.now()}`,
          client: client.trim(),
          company: client.trim(),
          position: title || 'Client Requisition',
          title: title || 'Client Requisition',
          location: 'Remote / Hybrid',
          work_mode: 'Hybrid',
          workMode: 'Hybrid',
          mode: 'Hybrid',
          salary: 'Competitive Market Rate',
          status: 'Active',
          created_at: now,
          createdAt: now,
          assignedRecruiter: record.assignedRecruiter,
          assignedTo: record.assignedRecruiter,
          workedBy: [workerObj],
          candidatesCount: 0,
          candidates: 0,
          topScore: 0,
          description: `Intake requisition for ${client.trim()}`
        });
      }

      localStorage.setItem('tasknera_created_jobs', JSON.stringify(updatedList));
    }
  } catch (err) {
    console.warn('Failed to sync tasknera_created_jobs:', err);
  }

  // 5. Synchronize tasknera_all_jobs
  try {
    const rawAll = localStorage.getItem('tasknera_all_jobs');
    if (rawAll) {
      const list = JSON.parse(rawAll);
      if (Array.isArray(list)) {
        const updatedList = list.map((item: any) => {
          const matchById = jobId && String(item.id) === jobId;
          const matchByTitleClient = clean(item.client || item.company) === cleanClient && (!cleanTitle || clean(item.position || item.title) === cleanTitle);
          if (matchById || matchByTitleClient) {
            const currentWorkers = Array.isArray(item.workedBy) ? item.workedBy : [];
            return {
              ...item,
              assignedRecruiter: record.assignedRecruiter,
              assignedTo: record.assignedRecruiter,
              workedBy: [
                workerObj,
                ...currentWorkers.filter((w: any) => clean(w.name) !== clean(record.assignedRecruiter))
              ]
            };
          }
          return item;
        });
        localStorage.setItem('tasknera_all_jobs', JSON.stringify(updatedList));
      }
    }
  } catch (err) {
    console.warn('Failed to sync tasknera_all_jobs:', err);
  }

  // 6. Broadcast event across UI components and tabs
  try {
    window.dispatchEvent(new CustomEvent('tasknera_jobs_updated', { detail: record }));
  } catch {}
}
