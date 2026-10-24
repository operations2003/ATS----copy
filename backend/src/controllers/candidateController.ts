import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import prisma from '../config/prisma';
import { extractDocumentTextViaPython, extractDocumentTextLocally, PythonDocumentResponse } from '../services/pythonDocumentClient';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  extractStructuredCandidateFromText,
  CandidateParsedProfile,
  validateCvTextQuality,
  calculateCareerGaps,
  calculateNonOverlappingExperienceMonths,
  formatNumericExperience
} from '../services/cvParsingService';
import { evaluateCandidateAgainstRequirements } from '../services/evaluationService';
import { calculateCentralizedATSScore } from '../services/centralizedATSScoringService';
import { getStandardRequirementsForPosition, EVALUATION_CACHE } from './evaluationController';
import { getJobFromStoreOrDb, GLOBAL_JOB_STORE } from './jobController';
import { getEffectiveSkills } from '../utils/requirementUtils';

export interface CandidateRecord extends CandidateParsedProfile {
  id: string;
  jobId: string;
  organizationId?: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  uploadedAt: string;
  uploadedBy?: string;
  createdBy?: string;
  isDuplicate?: boolean;
  source?: string;
  matchScore?: number;
  atsScore?: number;
  decision?: string;
  recommendation?: string;
  matchLevel?: string;
  mandatoryCompliance?: string;
  evaluation?: any;
}

// In-memory store for fast state sync and test resilience
export const CANDIDATE_STORE: Map<string, CandidateRecord[]> = new Map();
export const GLOBAL_CANDIDATES: Map<string, CandidateRecord> = new Map(); // Keyed by fileHash or id

// Initial default candidates (empty so only user uploaded CVs are present)
const DEFAULT_INITIAL_CANDIDATES: Record<string, CandidateRecord[]> = {};

// Initialize global store with defaults
for (const [jobId, list] of Object.entries(DEFAULT_INITIAL_CANDIDATES)) {
  CANDIDATE_STORE.set(jobId, [...list]);
  for (const c of list) {
    if (c.fileHash) GLOBAL_CANDIDATES.set(c.fileHash, c);
    GLOBAL_CANDIDATES.set(c.id, c);
  }
}

const POOL_STORAGE_DIR = path.resolve(process.cwd(), 'data');
const POOL_STORAGE_FILE = path.join(POOL_STORAGE_DIR, 'candidates_pool.json');

export const saveCandidateToPersistentPool = (candidate: CandidateRecord): void => {
  try {
    if (!fs.existsSync(POOL_STORAGE_DIR)) {
      fs.mkdirSync(POOL_STORAGE_DIR, { recursive: true });
    }
    let existingList: CandidateRecord[] = [];
    if (fs.existsSync(POOL_STORAGE_FILE)) {
      try {
        const fileContent = fs.readFileSync(POOL_STORAGE_FILE, 'utf-8');
        existingList = JSON.parse(fileContent);
      } catch {}
    }
    const idx = existingList.findIndex(c =>
      c.id === candidate.id ||
      (candidate.fileHash && c.fileHash === candidate.fileHash) ||
      (candidate.email && c.email && candidate.email.includes('@') && c.email.toLowerCase() === candidate.email.toLowerCase() && (c.organizationId || 'org-tasknera') === (candidate.organizationId || 'org-tasknera'))
    );
    if (idx >= 0) {
      existingList[idx] = { ...existingList[idx], ...candidate };
    } else {
      existingList.unshift(candidate);
    }
    fs.writeFileSync(POOL_STORAGE_FILE, JSON.stringify(existingList, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Pool Persistent File Warning]:', err);
  }
};

export const loadPersistentPool = (targetOrgId?: string): CandidateRecord[] => {
  try {
    if (fs.existsSync(POOL_STORAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(POOL_STORAGE_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        if (targetOrgId) {
          return data.filter(c => (c.organizationId || 'org-tasknera') === targetOrgId);
        }
        return data;
      }
    }
  } catch (err) {
    console.warn('[Pool Load File Warning]:', err);
  }
  return [];
};

export const deleteCandidateFromPersistentPool = (
  candidateId: string,
  fileHash?: string,
  email?: string,
  fileName?: string,
  additionalIds: string[] = []
): void => {
  try {
    if (fs.existsSync(POOL_STORAGE_FILE)) {
      const existingList: CandidateRecord[] = JSON.parse(fs.readFileSync(POOL_STORAGE_FILE, 'utf-8'));
      const cleanEmail = email && email.includes('@') ? email.toLowerCase().trim() : '';
      const cleanFileName = fileName ? fileName.toLowerCase().trim() : '';
      const filtered = existingList.filter(c => {
        if (c.id === candidateId) return false;
        if (additionalIds && additionalIds.includes(c.id)) return false;
        if (fileHash && c.fileHash && c.fileHash === fileHash) return false;
        if (cleanEmail && c.email && c.email.toLowerCase().trim() === cleanEmail) return false;
        if (cleanFileName && c.fileName && c.fileName.toLowerCase().trim() === cleanFileName) return false;
        return true;
      });
      fs.writeFileSync(POOL_STORAGE_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn('[Pool Delete File Warning]:', err);
  }
};

// Initialize pool from persistent storage on startup
try {
  const loadedPool = loadPersistentPool();
  if (loadedPool.length > 0) {
    const poolList = CANDIDATE_STORE.get('pool') || [];
    for (const c of loadedPool) {
      if (!poolList.some(p => p.id === c.id || (p.fileHash && p.fileHash === c.fileHash))) {
        poolList.push(c);
      }
      if (c.fileHash) GLOBAL_CANDIDATES.set(c.fileHash, c);
      GLOBAL_CANDIDATES.set(c.id, c);
    }
    CANDIDATE_STORE.set('pool', poolList);
    console.log(`[Talent Pool] Hydrated ${loadedPool.length} candidate(s) from persistent storage.`);
  }
} catch (hydrateErr) {
  console.warn('[Talent Pool Hydration Warning]:', hydrateErr);
}

/**
 * Cleans filenames into professional human candidate names by stripping compound extensions,
 * remove noise keywords (resume, cv), and capitalizing.
 */
export const cleanFileNameForDisplay = (fileName: string): string => {
  if (!fileName) return 'Candidate Profile';
  let name = fileName.trim();
  // Strip compound extensions like .docx.pdf, .doc.pdf, .pdf, .docx, .doc, .txt
  name = name.replace(/\.(docx?|pdf|txt|rtf)(\.(docx?|pdf|txt|rtf))?$/i, '');
  name = name.replace(/\.[^/.]+$/, '');
  // Remove (1), [1], etc.
  name = name.replace(/\s*\(\d+\)\s*/g, ' ');
  // Remove "Resume", "CV", "Profile" prefixes and suffixes
  name = name.replace(/^(?:resume|cv|profile|candidate)[\s_\-]+/i, '');
  name = name.replace(/[\s_\-]+(?:resume|cv|profile|candidate)$/i, '');
  // CamelCase to spaces
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  // Underscores and hyphens to spaces
  name = name.replace(/[_\-]+/g, ' ');
  // Collapse spaces
  name = name.replace(/\s+/g, ' ').trim();
  // Capitalize words
  if (name.length > 0) {
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return name || 'Candidate Profile';
};

/**
 * Helper to convert Prisma Candidate DB entity to CandidateRecord,
 * automatically extracting skills, experience, and education from raw_text
 * if the relational child tables are empty or incomplete.
 */
export function mapDbCandidateToRecord(c: any, defaultJobId?: string): CandidateRecord {
  const associatedJobId = c.job_id || c.applications?.[0]?.job_id || defaultJobId || 'jd-1';
  let skills: string[] = Array.isArray(c.skills) ? c.skills.map((s: any) => s.skill).filter(Boolean) : [];
  let experience: any[] = Array.isArray(c.experiences) ? c.experiences.map((ex: any) => ({
    title: ex.title || '',
    company: ex.company || '',
    startDate: ex.start_date || '',
    endDate: ex.end_date || '',
    duration: ex.duration || '',
    description: ex.description || '',
  })) : [];
  let education: any[] = Array.isArray(c.education) ? c.education.map((e: any) => ({
    degree: e.degree || '',
    institution: e.institution || '',
    field: e.field || '',
    year: e.start_year ? `${e.start_year}` : undefined,
  })) : [];

  let totalExp = c.total_experience;
  let title = c.current_title;
  let company = c.current_company;
  let location = c.location;
  let summary = c.summary;

  // If skills, experience or totalExperience are missing/0 yrs from DB, parse from raw_text on the fly
  if ((skills.length === 0 || experience.length === 0 || !title || !totalExp || totalExp === '0 yrs' || totalExp === '0 Years') && c.raw_text && c.raw_text.trim().length > 10) {
    try {
      const parsed = extractStructuredCandidateFromText(c.raw_text, c.resume_file_url || 'cv.pdf', {
        fileType: 'application/pdf',
        pageCount: 1,
        extractionMethod: 'database_reparse',
        ocrUsed: false,
        characterCount: c.raw_text.length,
        wordCount: c.raw_text.split(/\s+/).filter(Boolean).length,
      });

      if (skills.length === 0 && parsed.skills && parsed.skills.length > 0) {
        skills = parsed.skills;
        // Asynchronously persist skills into database for permanent caching
        prisma.candidateSkill.createMany({
          data: skills.map((s: string) => ({ candidate_id: c.id, skill: s })),
          skipDuplicates: true,
        }).catch(() => null);
      }

      if (experience.length === 0 && parsed.experience && parsed.experience.length > 0) {
        experience = parsed.experience;
        prisma.candidateExperience.createMany({
          data: experience.map((ex: any) => ({
            candidate_id: c.id,
            company: ex.company || 'Company',
            title: ex.title || 'Role',
            duration: ex.duration || '',
            description: ex.description || '',
            start_date: ex.startDate || '',
            end_date: ex.endDate || '',
          })),
          skipDuplicates: true,
        }).catch(() => null);
      }

      if (education.length === 0 && parsed.education && parsed.education.length > 0) {
        education = parsed.education;
        prisma.candidateEducation.createMany({
          data: education.map((edu: any) => ({
            candidate_id: c.id,
            degree: edu.degree || 'Degree',
            institution: edu.institution || 'University',
            field: edu.field || '',
          })),
          skipDuplicates: true,
        }).catch(() => null);
      }

      if ((!totalExp || totalExp === '0 yrs' || totalExp === '0 Years') && parsed.totalExperience && parsed.totalExperience !== '0 yrs') {
        totalExp = parsed.totalExperience;
      }
      if (!title && parsed.currentTitle && !['candidate profile', 'candidate', 'professional role'].includes(parsed.currentTitle.toLowerCase())) {
        title = parsed.currentTitle;
      }
      if (!company && parsed.currentCompany && !['company', 'the role', 'role', 'the company', 'organization'].includes(parsed.currentCompany.toLowerCase())) {
        company = parsed.currentCompany;
      }
      if (!location && parsed.location) location = parsed.location;
      if (!summary && parsed.summary) summary = parsed.summary;
    } catch (parseErr) {
      console.warn('[DB Candidate Reparse Notice]:', parseErr);
    }
  }

  // Fallback to experience records for real company and title
  if ((!company || ['company', 'the role', 'role', 'the company', 'organization'].includes(company.toLowerCase())) && experience.length > 0) {
    for (const exp of experience) {
      if (exp.company && !['company', 'the role', 'role', 'the company', 'organization', 'position', 'experience', 'present'].includes(exp.company.toLowerCase())) {
        company = exp.company;
        break;
      }
    }
  }

  if ((!title || ['candidate profile', 'candidate', 'professional role', 'software engineer'].includes(title.toLowerCase())) && experience.length > 0) {
    if (experience[0].title && !['role', 'position', 'candidate'].includes(experience[0].title.toLowerCase())) {
      title = experience[0].title;
    }
  }

  const cleanName = c.name && c.name.trim() && !['candidate', 'candidate profile', 'applicant'].includes(c.name.trim().toLowerCase())
    ? c.name.trim()
    : cleanFileNameForDisplay(c.resume_file_url || '');

  // Calculate exact experience months from verified role entries
  let roleMonths = 0;
  if (experience.length > 0) {
    const nonOverlap = calculateNonOverlappingExperienceMonths(experience.map((e: any) => ({
      title: e.title || '',
      company: e.company || '',
      startDate: e.start_date || e.startDate,
      endDate: e.end_date || e.endDate,
      duration: e.duration || ''
    })));
    roleMonths = nonOverlap.totalMonths;
  }

  // Parse explicit totalExp from candidate record (e.g. "10.8 yrs (10y 10m)", "6.5 yrs", "10 yrs")
  let parsedTotalExpMonths = 0;
  let parsedTotalExpYears: number | undefined = undefined;
  if (totalExp) {
    const yrMatch = String(totalExp).match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y\b)?/i);
    const moMatch = String(totalExp).match(/(\d+)\s*(?:months?|mos?)/i);
    if (yrMatch && parseFloat(yrMatch[1]) > 0 && parseFloat(yrMatch[1]) < 70) {
      parsedTotalExpYears = parseFloat(yrMatch[1]);
      parsedTotalExpMonths = Math.round(parsedTotalExpYears * 12);
    }
    if (moMatch && parseInt(moMatch[1], 10) > 0) {
      parsedTotalExpMonths += parseInt(moMatch[1], 10);
    }
  }

  // Check if raw_text mentions explicit overall experience in summary (e.g. "over 6.5 years of IT experience")
  if (c.raw_text) {
    const rawExpMatch = c.raw_text.match(/(?:over|more\s+than|about|around|with|having)?\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)(?:\s*(?:and\s*)?(\d+)\s*(?:months?|mos?))?\s+(?:of\s+)?(?:[a-zA-Z\s\/\-\+]{0,40})?experience/i) ||
      c.raw_text.match(/\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:[a-zA-Z\s\/\-\+]{0,35})?(?:experience|tenure|background|expertise)\b/i);
    if (rawExpMatch) {
      const rawYears = parseFloat(rawExpMatch[1]);
      if (!isNaN(rawYears) && rawYears > 0 && rawYears < 70) {
        if (parsedTotalExpYears === undefined || rawYears > parsedTotalExpYears) {
          parsedTotalExpYears = rawYears;
          parsedTotalExpMonths = Math.round(rawYears * 12);
        }
      }
    }
  }

  const effectiveMonths = Math.max(parsedTotalExpMonths, roleMonths);
  const effectiveYears = parsedTotalExpYears !== undefined
    ? Math.max(parsedTotalExpYears, effectiveMonths > 0 ? parseFloat((effectiveMonths / 12).toFixed(1)) : 0)
    : (effectiveMonths > 0 ? parseFloat((effectiveMonths / 12).toFixed(1)) : undefined);

  const finalExpString = effectiveYears !== undefined && effectiveYears > 0
    ? `${effectiveYears} yrs`
    : (effectiveMonths > 0 ? formatNumericExperience(effectiveMonths) : (totalExp || (experience.length ? `${experience.length} yrs` : '0 yrs')));
  return {
    id: c.id,
    jobId: associatedJobId,
    name: cleanName,
    email: c.email || '',
    phone: c.phone || '',
    location: location || 'Remote',
    totalExperience: finalExpString,
    totalExperienceMonths: effectiveMonths > 0 ? effectiveMonths : undefined,
    totalExperienceYears: effectiveYears,
    relevantExperience: finalExpString,
    currentTitle: title || 'Software Professional',
    currentCompany: company || '',
    summary: summary || '',
    professionalSummary: summary || '',
    skills,
    technologies: skills,
    tools: [],
    industries: [],
    education,
    certifications: c.certifications?.map((ct: any) => ct.certification) || [],
    languages: c.languages?.map((l: any) => l.language) || [],
    experience,
    gapAnalysis: calculateCareerGaps(experience, c.raw_text || ''),
    responsibilities: [],
    achievements: [],
    projects: c.projects?.map((p: any) => ({
      name: p.name || '',
      description: p.description || '',
      technologies: p.technologies || [],
    })) || [],
    rawText: c.raw_text || '',
    parsingStatus: (c.parsing_status as any) || 'PARSED',
    validationErrors: [],
    parsingMetadata: {
      fileName: c.resume_file_url || 'cv.pdf',
      fileType: 'application/pdf',
      pageCount: 1,
      extractionMethod: 'prisma-db',
      ocrUsed: false,
      characterCount: (c.raw_text || '').length,
      wordCount: (c.raw_text || '').split(/\s+/).filter(Boolean).length,
    },
    fileName: c.resume_file_url || 'cv.pdf',
    fileSize: 100000,
    fileHash: c.file_hash || undefined,
    uploadedAt: c.created_at ? c.created_at.toISOString() : new Date().toISOString(),
    uploadedBy: c.created_by,
    createdBy: c.created_by,
    organizationId: c.organizationId || c.user?.organizationId || 'org-tasknera',
    source: c.source || 'manual_upload',
    ...(() => {
      const latestEval = Array.isArray(c.evaluations) && c.evaluations.length > 0 ? c.evaluations[0] : null;
      const latestApp = Array.isArray(c.applications) && c.applications.length > 0 ? c.applications[0] : null;
      const rawScore = latestEval?.score ?? latestEval?.atsScore ?? c.matchScore ?? c.atsScore ?? latestApp?.match_score;
      const hasScore = typeof rawScore === 'number' && !isNaN(rawScore);
      const evalDecision = latestEval?.decision || c.decision || (hasScore ? (rawScore >= 75 ? 'SUBMIT' : (rawScore >= 50 ? 'REVIEW' : 'DO NOT SUBMIT')) : undefined);
      return {
        matchScore: hasScore ? Math.round(rawScore) : undefined,
        atsScore: hasScore ? Math.round(rawScore) : undefined,
        decision: evalDecision,
        matchLevel: latestEval?.matchLevel || c.matchLevel,
        mandatoryCompliance: latestEval?.mandatoryCompliance || c.mandatoryCompliance,
      };
    })(),
  };
}

/**
 * Get all candidates belonging to the Search Talent Pool (job_id IS NULL)
 * GET /api/candidates
 */
export const getAllCandidates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const callerRole = req.user?.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user?.email?.toLowerCase().trim() === 'admin@gmail.com';
    const isClientAdmin = callerRole === 'CLIENT_ADMIN' || callerRole === 'ADMIN';
    const userOrgId = req.user?.organizationId || 'org-tasknera';
    const currentUserId = req.user?.userId || req.user?.id;

    let dbCandidates: CandidateRecord[] = [];

    try {
      const poolWhere: any = {};
      if (!isSuperAdmin) {
        poolWhere.organizationId = userOrgId;
        if (!isClientAdmin && currentUserId) {
          poolWhere.created_by = currentUserId;
        }
      } else if (req.query.organizationId) {
        poolWhere.organizationId = String(req.query.organizationId);
      }
      poolWhere.NOT = [
        ...(poolWhere.NOT || []),
        { email: { contains: 'harsh', mode: 'insensitive' } },
        { name: { contains: 'harsh', mode: 'insensitive' } },
        { email: { contains: 'aditya', mode: 'insensitive' } },
        { name: { contains: 'aditya', mode: 'insensitive' } }
      ];
      const candidatesFromDb = await prisma.candidate.findMany({
        where: poolWhere,
        select: {
          id: true,
          job_id: true,
          name: true,
          email: true,
          phone: true,
          location: true,
          total_experience: true,
          current_title: true,
          current_company: true,
          summary: true,
          resume_file_url: true,
          parsing_status: true,
          source: true,
          created_at: true,
          organizationId: true,
          skills: {
            select: { skill: true }
          },
          experiences: {
            select: {
              title: true,
              company: true,
              start_date: true,
              end_date: true,
              duration: true
            }
          },
          education: {
            select: {
              degree: true,
              institution: true,
              field: true,
              start_year: true
            }
          },
          evaluations: {
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: {
              id: true,
              score: true,
              atsScore: true,
              decision: true,
              matchLevel: true,
              mandatoryCompliance: true
            }
          },
          applications: {
            orderBy: { updated_at: 'desc' as const },
            take: 1,
            select: {
              match_score: true,
              stage: true,
              status: true
            }
          }
        },
        orderBy: { created_at: 'desc' }
      });

      if (candidatesFromDb && candidatesFromDb.length > 0) {
        dbCandidates = candidatesFromDb.map((c: any) => mapDbCandidateToRecord(c, c.job_id || 'pool'));
      }
    } catch (dbErr) {
      console.warn('[Talent Pool Candidates] Database query fallback to memory/persistent store:', dbErr);
    }

    // Combine candidates across DB, persistent storage, and memory stores
    const combinedMap = new Map<string, CandidateRecord>();
    for (const c of dbCandidates) {
      combinedMap.set(c.id, c);
    }

    // Include persistent file backup candidates
    const filePool = loadPersistentPool(isSuperAdmin ? undefined : userOrgId);
    for (const c of filePool) {
      if (!isSuperAdmin && (c.organizationId || 'org-tasknera') !== userOrgId) continue;
      if (!isSuperAdmin && !isClientAdmin && currentUserId && (c.uploadedBy || c.createdBy) !== currentUserId) continue;
      if (!combinedMap.has(c.id)) {
        combinedMap.set(c.id, c);
      }
    }

    // Include in-memory CANDIDATE_STORE candidates across all jobs and pool
    for (const [jId, list] of CANDIDATE_STORE.entries()) {
      for (const c of list) {
        if (!isSuperAdmin && (c.organizationId || 'org-tasknera') !== userOrgId) continue;
        if (!isSuperAdmin && !isClientAdmin && currentUserId && (c.uploadedBy || c.createdBy) !== currentUserId) continue;
        if (!combinedMap.has(c.id)) {
          combinedMap.set(c.id, c);
        }
      }
    }

    // Include GLOBAL_CANDIDATES
    for (const c of GLOBAL_CANDIDATES.values()) {
      if (!isSuperAdmin && (c.organizationId || 'org-tasknera') !== userOrgId) continue;
      if (!isSuperAdmin && !isClientAdmin && currentUserId && (c.uploadedBy || c.createdBy) !== currentUserId) continue;
      if (!combinedMap.has(c.id)) {
        combinedMap.set(c.id, c);
      }
    }

    const rawList = Array.from(combinedMap.values());
    const seenKeys = new Set<string>();
    const resultList: CandidateRecord[] = [];

    for (const c of rawList) {
      const key = (c.email && c.email.trim().toLowerCase()) ||
                  (c.fileHash && c.fileHash.trim()) ||
                  (c.fileName && c.fileName.trim().toLowerCase()) ||
                  (c.name && c.name.trim().toLowerCase()) ||
                  c.id;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        resultList.push(c);
      }
    }

    res.json({
      success: true,
      total: resultList.length,
      candidates: resultList
    });
  } catch (error: any) {
    console.error('Error fetching talent pool candidates:', error);
    res.status(500).json({ error: 'Failed to retrieve talent pool candidates' });
  }
};

/**
 * Get all candidates associated with a specific Job
 * GET /api/jobs/:jobId/candidates
 */
export const getCandidatesForJob = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const jobId = String(req.params.jobId || '');
    if (!jobId) {
      res.status(400).json({ error: 'Job ID is required' });
      return;
    }

    if (jobId === 'all') {
      return getAllCandidates(req, res);
    }

    const isJobUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
    const currentUserId = req.user?.userId || req.user?.id;
    const callerRole = req.user?.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user?.email?.toLowerCase().trim() === 'admin@gmail.com';
    const isClientAdmin = callerRole === 'CLIENT_ADMIN' || callerRole === 'ADMIN';
    const userOrgId = req.user?.organizationId || 'org-tasknera';

    // Verify job belongs to user's organization
    let checkJob: any = null;
    if (isJobUuid) {
      checkJob = await prisma.job.findUnique({ where: { id: jobId }, select: { created_by: true, organizationId: true, user: { select: { role: true, email: true } } } });
    } else {
      checkJob = GLOBAL_JOB_STORE.get(jobId);
    }

    if (checkJob) {
      const jobOrg = checkJob.organizationId || 'org-tasknera';
      if (!isSuperAdmin && jobOrg !== userOrgId) {
        res.status(403).json({ error: 'Forbidden: Access denied to other organization job candidates.' });
        return;
      }
      if (!isSuperAdmin && !isClientAdmin) {
        const jobOwner = checkJob.created_by || checkJob.createdBy;
        const creatorRole = checkJob.user?.role;
        const isCreatedByAdmin = creatorRole === 'SUPER_ADMIN' || creatorRole === 'CLIENT_ADMIN' || creatorRole === 'ADMIN' || checkJob.user?.email === 'operations@tasknera.com' || checkJob.user?.email === 'admin@gmail.com';
        if (jobOwner && jobOwner !== currentUserId && !isCreatedByAdmin) {
          res.status(403).json({ error: 'Forbidden: Access restricted to the requisition owner.' });
          return;
        }
      }
    } else if (isJobUuid) {
      res.status(404).json({ error: `Job with ID "${jobId}" not found.` });
      return;
    }

    let dbCandidates: CandidateRecord[] = [];
    if (isJobUuid) {
      try {
        const appWhere: any = { job_id: jobId };
        const directWhere: any = { job_id: jobId };
        if (!isSuperAdmin) {
          directWhere.organizationId = userOrgId;
          appWhere.candidate = { organizationId: userOrgId };
        }

        const candidateListSelect = {
          id: true,
          job_id: true,
          name: true,
          email: true,
          phone: true,
          location: true,
          total_experience: true,
          current_title: true,
          current_company: true,
          summary: true,
          resume_file_url: true,
          parsing_status: true,
          source: true,
          created_at: true,
          organizationId: true,
          skills: {
            select: { skill: true }
          },
          experiences: {
            select: {
              title: true,
              company: true,
              start_date: true,
              end_date: true,
              duration: true
            }
          },
          education: {
            select: {
              degree: true,
              institution: true,
              field: true,
              start_year: true
            }
          },
          evaluations: {
            where: isJobUuid
              ? { OR: [{ jobId }, { candidateJobId: jobId }] }
              : { candidateJobId: jobId },
            orderBy: { createdAt: 'desc' as const },
            take: 1,
            select: {
              id: true,
              score: true,
              atsScore: true,
              decision: true,
              matchLevel: true,
              mandatoryCompliance: true
            }
          },
          applications: {
            where: { job_id: jobId },
            orderBy: { updated_at: 'desc' as const },
            take: 1,
            select: {
              match_score: true,
              stage: true,
              status: true
            }
          }
        };

        const apps = await (prisma as any).candidateApplication?.findMany({
          where: appWhere,
          select: {
            id: true,
            job_id: true,
            candidate_id: true,
            match_score: true,
            stage: true,
            status: true,
            candidate: {
              select: candidateListSelect
            }
          },
          orderBy: { created_at: 'desc' }
        });

        const directCands = await (prisma as any).candidate?.findMany({
          where: directWhere,
          select: candidateListSelect,
          orderBy: { created_at: 'desc' }
        });

        const combinedCands: any[] = [];
        const seenCandIds = new Set<string>();

        if (apps && apps.length > 0) {
          for (const app of apps) {
            if (app.candidate && !seenCandIds.has(app.candidate.id)) {
              seenCandIds.add(app.candidate.id);
              combinedCands.push(app.candidate);
            }
          }
        }
        if (directCands && directCands.length > 0) {
          for (const c of directCands) {
            if (!seenCandIds.has(c.id)) {
              seenCandIds.add(c.id);
              combinedCands.push(c);
            }
          }
        }

        if (combinedCands.length > 0) {
          dbCandidates = combinedCands.map((c: any) => mapDbCandidateToRecord(c, jobId));
        }
      } catch (dbErr) {
        console.warn('[Candidates] Database query fallback to memory store:', dbErr);
      }
    }

    // 2. Check memory store (scoped to tenant and current user)
    let memCandidates = CANDIDATE_STORE.get(jobId);
    if (!memCandidates) {
      memCandidates = [];
      CANDIDATE_STORE.set(jobId, memCandidates);
    }
    memCandidates = memCandidates.filter(c => {
      if (!isSuperAdmin && (c.organizationId || 'org-tasknera') !== userOrgId) return false;
      if (!isSuperAdmin && !isClientAdmin && currentUserId) {
        const owner = c.uploadedBy || c.createdBy;
        return !owner || owner === currentUserId;
      }
      return true;
    });

    // Combine unique candidates (DB + Memory)
    const combinedMap = new Map<string, CandidateRecord>();
    for (const c of memCandidates) combinedMap.set(c.id, c);
    for (const c of dbCandidates) combinedMap.set(c.id, c);

    const rawList = Array.from(combinedMap.values());
    const seenKeys = new Set<string>();
    const resultList: CandidateRecord[] = [];

    for (const c of rawList) {
      const key = (c.email && c.email.trim().toLowerCase()) ||
                  (c.fileHash && c.fileHash.trim()) ||
                  (c.fileName && c.fileName.trim().toLowerCase()) ||
                  (c.name && c.name.trim().toLowerCase()) ||
                  c.id;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        resultList.push(c);
      }
    }

    // Enrich candidates with evaluations from DB or memory store (supports custom non-UUID IDs)
    let targetJob: any = await getJobFromStoreOrDb(jobId);
    if (!targetJob && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
      targetJob = await prisma.job.findUnique({
        where: { id: jobId },
        include: { requirements: true }
      }).catch(() => null);
    }
    const jobTitle = targetJob?.position || targetJob?.title || 'Job Requisition';
    const jobClient = targetJob?.client || targetJob?.company || 'Enterprise Client';
    const reqs = (targetJob?.requirements && targetJob.requirements.length > 0)
      ? targetJob.requirements
      : ((targetJob?.extractedRequirements && targetJob.extractedRequirements.length > 0)
        ? targetJob.extractedRequirements
        : getStandardRequirementsForPosition(jobTitle, jobClient));

    const enrichedList = await Promise.all(resultList.map(async (c) => {
      let finalScore = (c as any).matchScore ?? (c as any).atsScore;
      let matchLevel = (c as any).matchLevel;
      let decision = (c as any).decision || (c as any).recommendation;
      let compliance = (c as any).mandatoryCompliance;

      // Check if existing evaluation has already run under the AI semantic engine (v5.0.0) for this specific job
      const evalJobTitle = (c as any).evaluation?.jobTitle || (c as any).evaluation?.position;
      const hasAiEvaluation = (c as any).evaluation?.scoringConfigVersion === '5.0.0-ai-semantic-matcher' &&
        (!evalJobTitle || evalJobTitle.toLowerCase() === jobTitle.toLowerCase());

      // Only run fresh AI evaluation if explicitly requested via query parameter ?fresh=true
      if (req.query.fresh === 'true' && reqs.length > 0) {
        try {
          const jobData = {
            id: targetJob?.id || jobId,
            position: jobTitle,
            title: jobTitle,
            client: jobClient,
            company: jobClient,
          };
          const evalPayload = await evaluateCandidateAgainstRequirements(c, jobData, reqs);
          finalScore = evalPayload.overallScore ?? evalPayload.overallMatch ?? 0;
          matchLevel = evalPayload.matchLevel;
          decision = evalPayload.recommendation || (finalScore >= 65 ? 'SUBMIT' : finalScore >= 50 ? 'REVIEW' : 'DO NOT SUBMIT');
          compliance = evalPayload.mandatoryCompliance
            ? `${evalPayload.mandatoryCompliance.met}/${evalPayload.mandatoryCompliance.total}`
            : 'N/A';
          (c as any).matchScore = finalScore;
          (c as any).atsScore = finalScore;
          (c as any).matchLevel = matchLevel;
          (c as any).decision = decision;
          (c as any).recommendation = decision;
          (c as any).mandatoryCompliance = compliance;
        } catch (freshErr) {
          console.warn('[getCandidatesForJob fresh eval]:', freshErr);
        }
      } else if (finalScore === undefined && reqs.length > 0 && c.parsingStatus !== 'FAILED') {
        // Authoritative in-memory centralized ATS scoring (single source of truth v6.0.0)
        try {
          const centralResult = calculateCentralizedATSScore({
            candidate: c,
            job: {
              id: targetJob?.id || jobId,
              position: jobTitle,
              title: jobTitle,
              client: jobClient,
              company: jobClient,
              jd_text: targetJob?.jd_text || jobTitle
            },
            requirements: reqs.map((r: any) => ({
              id: r.id,
              requirement: r.requirement,
              category: r.category,
              is_mandatory: r.is_mandatory ?? r.mandatory,
              weight: r.weight,
              source_evidence: r.source_evidence || r.sourceEvidence,
              aliases: r.aliases
            }))
          });
          finalScore = centralResult.atsScore;
          matchLevel = centralResult.matchLevel;
          decision = centralResult.recommendation;
          compliance = `${centralResult.mandatoryCompliance.matched}/${centralResult.mandatoryCompliance.total}`;
          (c as any).matchScore = finalScore;
          (c as any).atsScore = finalScore;
          (c as any).matchLevel = matchLevel;
          (c as any).decision = decision;
          (c as any).recommendation = decision;
          (c as any).mandatoryCompliance = compliance;
        } catch {}
      }

      const isFailed = c.parsingStatus === 'FAILED';
      const resolvedScore = !isFailed && typeof finalScore === 'number' ? Math.round(finalScore) : (!isFailed && typeof (c as any).matchScore === 'number' ? Math.round((c as any).matchScore) : undefined);
      const effectiveDecision = isFailed ? 'FAILED' : (decision || (c as any).decision || (c as any).recommendation);
      const resolvedDecision = isFailed ? 'REJECT' : (effectiveDecision
        ? (effectiveDecision === 'DO NOT SUBMIT' ? 'REJECT' : (effectiveDecision === 'ACCEPT' ? 'SUBMIT' : effectiveDecision))
        : (resolvedScore !== undefined ? (resolvedScore >= 75 ? 'SUBMIT' : (resolvedScore >= 50 ? 'REVIEW' : 'REJECT')) : 'REVIEW'));
      const resolvedLevel = isFailed ? 'NOT EVALUATED' : (matchLevel || (c as any).matchLevel || (resolvedScore !== undefined ? (resolvedScore >= 75 ? 'STRONG MATCH' : (resolvedScore >= 50 ? 'MODERATE MATCH' : 'LOW FIT')) : undefined));

      return {
        ...c,
        matchScore: resolvedScore,
        atsScore: resolvedScore,
        matchLevel: resolvedLevel,
        decision: resolvedDecision,
        recommendation: resolvedDecision,
        mandatoryCompliance: isFailed ? 'N/A' : (compliance || (c as any).mandatoryCompliance || 'N/A')
      };
    }));

    res.json({
      success: true,
      jobId,
      total: enrichedList.length,
      parsedCount: enrichedList.filter(c => c.parsingStatus === 'PARSED').length,
      processingCount: enrichedList.filter(c => c.parsingStatus === 'PROCESSING' || c.parsingStatus === 'UPLOADED').length,
      failedCount: enrichedList.filter(c => c.parsingStatus === 'FAILED').length,
      candidates: enrichedList
    });
  } catch (error: any) {
    console.error('Error fetching candidates:', error);
    res.status(500).json({ error: 'Failed to retrieve candidates for job' });
  }
};

/**
 * Get single candidate details
 * GET /api/jobs/:jobId/candidates/:candidateId
 */
export const getCandidateById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const jobId = String(req.params.jobId || '');
    const candidateId = String(req.params.candidateId || '');

    const callerRole = req.user?.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user?.email?.toLowerCase().trim() === 'admin@gmail.com';
    const userOrgId = req.user?.organizationId || 'org-tasknera';

    // Check memory store
    const candidates = CANDIDATE_STORE.get(jobId);
    const candidate = candidates?.find(c => c.id === candidateId) || GLOBAL_CANDIDATES.get(candidateId);

    if (candidate) {
      if (!isSuperAdmin && (candidate.organizationId || 'org-tasknera') !== userOrgId) {
        res.status(403).json({ error: 'Forbidden: Candidate profile belongs to another organization.' });
        return;
      }
      res.json({
        success: true,
        jobId,
        candidate
      });
      return;
    }

    // Try DB if candidateId is a valid UUID
    const isCandidateUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);
    if (isCandidateUuid) {
      try {
        const c = await prisma.candidate.findUnique({
          where: { id: candidateId },
          include: {
            experiences: true,
            education: true,
            skills: true,
            certifications: true,
            languages: true,
            projects: true,
            user: true,
          }
        });
        if (c) {
          const candOrg = c.organizationId || (c as any).user?.organizationId || 'org-tasknera';
          if (!isSuperAdmin && candOrg !== userOrgId) {
            res.status(403).json({ error: 'Forbidden: Candidate profile belongs to another organization.' });
            return;
          }
          const record = mapDbCandidateToRecord(c, jobId);
          res.json({ success: true, jobId, candidate: record });
          return;
        }
      } catch (e) {
        console.warn('[Candidate Detail] DB lookup error:', e);
      }
    }

    res.status(404).json({ error: 'Candidate profile not found' });
  } catch (error: any) {
    console.error('Error fetching candidate detail:', error);
    res.status(500).json({ error: 'Failed to retrieve candidate profile' });
  }
};

/**
 * Automatically evaluates candidate against job requirements upon upload or linking to requisition
 */
export async function evaluateAndEnrichCandidateRecord(
  candidateRecord: CandidateRecord,
  jobId: string,
  req: Request,
  defaultUserId: string | null
): Promise<CandidateRecord> {
  if (!jobId || jobId === 'pool') return candidateRecord;
  if (candidateRecord.parsingStatus === 'FAILED') return candidateRecord;

  try {
    let targetJob: any = await getJobFromStoreOrDb(jobId);
    if (!targetJob && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
      targetJob = await prisma.job.findUnique({
        where: { id: jobId },
        include: { requirements: true, user: true }
      }).catch(() => null);
    }

    const reqJobPosition = (req.body?.jobPosition || req.body?.position || '').trim();
    const reqJobClient = (req.body?.jobClient || req.body?.client || '').trim();

    let customReqs: any[] = [];
    if (req.body?.requirements) {
      try {
        const parsed = typeof req.body.requirements === 'string' ? JSON.parse(req.body.requirements) : req.body.requirements;
        if (Array.isArray(parsed) && parsed.length > 0) customReqs = parsed;
      } catch {}
    }

    const jobTitle = targetJob?.position || targetJob?.title || reqJobPosition || 'Job Requisition';
    const jobClient = targetJob?.client || targetJob?.company || reqJobClient || 'Client Organization';
    let reqs: any[] = (targetJob?.requirements && targetJob.requirements.length > 0)
      ? targetJob.requirements
      : (customReqs.length > 0 ? customReqs : getStandardRequirementsForPosition(jobTitle, jobClient));

    if (!targetJob && (reqJobPosition || customReqs.length > 0)) {
      targetJob = {
        id: jobId,
        position: jobTitle,
        title: jobTitle,
        client: jobClient,
        company: jobClient,
        requirements: reqs
      };
      GLOBAL_JOB_STORE.set(jobId, targetJob);
    }

    if (reqs && reqs.length > 0) {
      const jobData = {
        id: targetJob?.id || jobId,
        position: jobTitle,
        title: jobTitle,
        client: jobClient,
        company: jobClient,
        jd_text: targetJob?.jd_text || undefined,
        created_by: targetJob?.created_by || defaultUserId
      };

      const evalPayload = await evaluateCandidateAgainstRequirements(candidateRecord, jobData, reqs);
      const finalScore = evalPayload.overallScore ?? evalPayload.overallMatch ?? 0;
      const complianceStr = evalPayload.mandatoryCompliance
        ? `${evalPayload.mandatoryCompliance.met}/${evalPayload.mandatoryCompliance.total}`
        : 'N/A';
      const decision = evalPayload.recommendation || (finalScore >= 80 ? 'SUBMIT' : (finalScore >= 60 ? 'REVIEW' : 'DO NOT SUBMIT'));

      (candidateRecord as any).matchScore = finalScore;
      (candidateRecord as any).atsScore = evalPayload.atsScore ?? finalScore;
      (candidateRecord as any).matchLevel = evalPayload.matchLevel;
      (candidateRecord as any).mandatoryCompliance = complianceStr;
      (candidateRecord as any).decision = decision;
      (candidateRecord as any).recommendation = decision;
      (candidateRecord as any).evaluation = evalPayload;

      // Save permanently to database with evaluatedBy attribution
      try {
        const evalOwner = (req as any).user?.userId || defaultUserId;
        const orgId = (req as any).user?.organizationId || targetJob?.user?.organizationId || 'org-tasknera';

        if (evalOwner) {
          let dbJobRecord = targetJob;
          if (!dbJobRecord?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dbJobRecord.id)) {
            dbJobRecord = await prisma.job.findFirst({
              where: {
                created_by: evalOwner,
                position: jobTitle
              }
            }).catch(() => null);

            if (!dbJobRecord) {
              dbJobRecord = await prisma.job.create({
                data: {
                  client: jobClient,
                  position: jobTitle,
                  created_by: evalOwner,
                  status: 'active'
                }
              }).catch(() => null);
            }
          }

          let validCandId = candidateRecord.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateRecord.id) ? candidateRecord.id : null;
          if (dbJobRecord?.id && validCandId) {
            const existingCandidateEval = await prisma.evaluation.findFirst({
              where: {
                candidateId: validCandId,
                jobId: dbJobRecord.id,
                OR: [
                  { evaluatedBy: evalOwner },
                  { createdByUserId: evalOwner }
                ]
              }
            });

            if (existingCandidateEval) {
              await prisma.evaluation.update({
                where: { id: existingCandidateEval.id },
                data: {
                  score: finalScore,
                  atsScore: evalPayload.atsScore ?? finalScore,
                  matchLevel: evalPayload.matchLevel,
                  mandatoryCompliance: complianceStr,
                  mandatoryFailed: Boolean(evalPayload.mandatoryRequirementFailed),
                  decision,
                  evaluatedBy: evalOwner,
                  auditData: evalPayload as any,
                  updatedAt: new Date()
                }
              }).catch(() => null);
            } else {
              await prisma.evaluation.create({
                data: {
                  candidateId: validCandId,
                  jobId: dbJobRecord.id,
                  candidateJobId: jobId,
                  createdByUserId: evalOwner,
                  evaluatedBy: evalOwner,
                  organizationId: orgId,
                  score: finalScore,
                  atsScore: evalPayload.atsScore ?? finalScore,
                  matchLevel: evalPayload.matchLevel,
                  mandatoryCompliance: complianceStr,
                  mandatoryFailed: Boolean(evalPayload.mandatoryRequirementFailed),
                  decision,
                  status: 'COMPLETED',
                  auditData: evalPayload as any
                }
              }).catch((err) => console.warn('[Evaluation DB Save Notice]:', err));
            }
          }
        }
      } catch (saveEvalErr) {
        console.warn('[Evaluation Persistence Warning]:', saveEvalErr);
      }

      const targetId = candidateRecord.id;
      if (targetJob?.id && targetId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
        const stage = finalScore >= 80 ? 'SHORTLISTED' : (finalScore >= 55 ? 'REVIEW' : 'REJECTED');
        await prisma.candidateApplication.upsert({
          where: {
            job_id_candidate_id: {
              job_id: targetJob.id,
              candidate_id: targetId
            }
          },
          update: { stage, match_score: finalScore, status: 'active' },
          create: { job_id: targetJob.id, candidate_id: targetId, stage, match_score: finalScore, status: 'active' }
        }).catch(() => null);
      }
    }
  } catch (evalErr) {
    console.warn('[CV Upload Automatic Evaluation Notice]:', evalErr);
  }

  return candidateRecord;
}

/**
 * Bulk upload CVs for a specific job
 * POST /api/jobs/:jobId/candidates/upload
 * Supports multi-part form data array of file inputs ('files' or 'files[]')
 */
export const uploadCandidateCVs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const callerRole = req.user?.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user?.email?.toLowerCase().trim() === 'admin@gmail.com';
    const isClientAdmin = callerRole === 'CLIENT_ADMIN' || callerRole === 'ADMIN';
    const userOrgId = req.user?.organizationId || 'org-tasknera';
    const currentUserId = req.user?.userId || req.user?.id || null;
    const defaultUserId = currentUserId;

    const paramJobId = String(req.params.jobId || req.body?.jobId || '').trim();
    const isPoolUpload = !paramJobId || paramJobId.toLowerCase() === 'pool' || paramJobId === 'all';
    const jobId = isPoolUpload ? 'pool' : paramJobId;
    const dbJobId = (!isPoolUpload && jobId && jobId !== 'pool' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) ? jobId : null;

    // Verify job belongs to user's organization
    if (dbJobId) {
      const jobRecord = await prisma.job.findUnique({ where: { id: dbJobId }, select: { created_by: true, organizationId: true } });
      if (!jobRecord) {
        res.status(404).json({ error: 'Job requisition not found' });
        return;
      }
      if (!isSuperAdmin) {
        const jobOrg = jobRecord.organizationId || 'org-tasknera';
        if (jobOrg !== userOrgId) {
          res.status(403).json({ error: 'Forbidden: Cannot upload candidates to another company job requisition.' });
          return;
        }
      }
    }
    
    // Support files from multer array, any fields, or single file fallback
    let files: Express.Multer.File[] = [];
    if (Array.isArray(req.files)) {
      files = req.files;
    } else if (req.files && typeof req.files === 'object') {
      // If multer.fields was used
      const filesObj = req.files as Record<string, Express.Multer.File[]>;
      for (const fieldKey of Object.keys(filesObj)) {
        if (Array.isArray(filesObj[fieldKey])) {
          files.push(...filesObj[fieldKey]);
        }
      }
    } else if (req.file) {
      files = [req.file];
    }

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided for candidate CV upload. Ensure field is named "files" or "files[]"' });
      return;
    }

    console.log(`\n=============================================================`);
    console.log(`[Batch CV Upload] Received ${files.length} file(s) for Job ID: ${jobId}`);
    console.log(`=============================================================`);

    let existingCandidates: CandidateRecord[] = CANDIDATE_STORE.get(jobId) || [];
    if (!existingCandidates.length && DEFAULT_INITIAL_CANDIDATES[jobId]) {
      existingCandidates = [...DEFAULT_INITIAL_CANDIDATES[jobId]];
      CANDIDATE_STORE.set(jobId, existingCandidates);
    }
    // Filter existingCandidates by tenant organization
    existingCandidates = existingCandidates.filter(c => isSuperAdmin || (c.organizationId || 'org-tasknera') === userOrgId);

    // Helper to process a single CV file with incremental persistence and evaluation
    const processSingleCvFile = async (file: Express.Multer.File): Promise<{
      candidate: CandidateRecord;
      candidateId: string;
      singleFileResponse?: { status: number; body: any };
    }> => {
      const fileName = file.originalname || 'uploaded_cv.pdf';
      const fileSize = file.size;
      const fileMime = file.mimetype || 'application/pdf';
      const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const fileMd5 = crypto.createHash('md5').update(file.buffer).digest('hex');

      console.log(`\n--- [Processing File] ${fileName} (${fileSize} bytes, Hash: ${fileHash.substring(0, 10)}) ---`);
      
      // ── DUPLICATE CANDIDATE CHECK (FILE HASH / FILENAME / CLIENT VALIDATION) ──
      const normalizedFileName = fileName.trim().toLowerCase();
      let dbCandidateId: string | null = null;

      const isValidProfile = (p: any): boolean => {
        if (!p) return false;
        const status = p.parsingStatus || p.status || p.parsing_status;
        if (status === 'FAILED' || status === 'failed' || status === 'PROCESSING' || status === 'processing' || status === 'UPLOADED') return false;
        const txt = p.rawText || p.raw_text || '';
        const quality = validateCvTextQuality(txt);
        if (!quality.isValid) return false;
        return true;
      };

      const genericNames = ['candidate', 'candidate profile', 'applicant', 'unknown', 'resume', 'cv'];
      const isGeneric = (n?: string | null): boolean => {
        if (!n) return true;
        const clean = n.trim().toLowerCase();
        return clean.length <= 2 || genericNames.includes(clean);
      };

      let existingInJob: CandidateRecord | undefined = existingCandidates.find(c =>
        (c.fileHash && (c.fileHash === fileHash || c.fileHash === fileMd5)) ||
        (c.fileName && c.fileName.trim().toLowerCase() === normalizedFileName && (c.fileSize ? c.fileSize === fileSize : true)) ||
        (!isGeneric(c.name) && normalizedFileName.replace(/[^a-z0-9]/gi, '').includes((c.name || '').trim().toLowerCase().replace(/[^a-z0-9]/gi, '')) && (c.name || '').trim().length > 4)
      );

      // If candidate in job previously failed, clear it out so it can be cleanly re-parsed with results
      if (existingInJob && !isValidProfile(existingInJob)) {
        existingCandidates = existingCandidates.filter(c => c !== existingInJob);
        CANDIDATE_STORE.set(jobId, existingCandidates);
        existingInJob = undefined;
      }

      let existingDbCandidate: any = null;
      if (!existingInJob) {
        try {
          existingDbCandidate = await prisma.candidate.findFirst({
            where: {
              ...(isSuperAdmin ? {} : { organizationId: userOrgId }),
              OR: [
                { file_hash: fileHash },
                { file_hash: fileMd5 },
                { resume_file_url: fileName }
              ]
            },
            include: {
              applications: true,
              experiences: true,
              education: true,
              skills: true,
            }
          });
        } catch {
          // Fallback to memory store if DB lookup fails
        }
      }

      // If existing DB candidate previously failed or has no text, re-parse with fresh file
      if (existingDbCandidate && !isValidProfile(existingDbCandidate)) {
        dbCandidateId = existingDbCandidate.id;
        existingDbCandidate = null;
      }

      // Authoritative source of truth: PostgreSQL database
      const existingProfile = (existingDbCandidate && isValidProfile(existingDbCandidate)) ? {
        id: existingDbCandidate.id,
        jobId,
        organizationId: userOrgId,
        name: existingDbCandidate.name,
        email: existingDbCandidate.email,
        phone: existingDbCandidate.phone,
        location: existingDbCandidate.location,
        totalExperience: existingDbCandidate.total_experience,
        relevantExperience: existingDbCandidate.total_experience,
        currentTitle: existingDbCandidate.current_title,
        currentCompany: existingDbCandidate.current_company,
        summary: existingDbCandidate.summary,
        professionalSummary: existingDbCandidate.summary,
        skills: existingDbCandidate.skills?.map((s: any) => s.skill) || [],
        technologies: existingDbCandidate.skills?.map((s: any) => s.skill) || [],
        tools: [],
        industries: [],
        education: existingDbCandidate.education?.map((e: any) => ({
          degree: e.degree,
          institution: e.institution,
          field: e.field,
          year: e.start_year ? `${e.start_year}` : undefined,
        })) || [],
        certifications: [],
        languages: [],
        experience: existingDbCandidate.experiences?.map((ex: any) => ({
          title: ex.title,
          company: ex.company,
          startDate: ex.start_date,
          endDate: ex.end_date,
          duration: ex.duration,
          description: ex.description,
        })) || [],
        responsibilities: [],
        achievements: [],
        projects: [],
        rawText: existingDbCandidate.raw_text || '',
        parsingStatus: 'PARSED' as const,
        validationErrors: [],
        parsingMetadata: {
          fileName,
          fileType: fileMime,
          pageCount: 1,
          extractionMethod: 'database-duplicate',
          ocrUsed: false,
          characterCount: (existingDbCandidate.raw_text || '').length,
          wordCount: 0,
        },
        fileName,
        fileSize,
        fileHash,
        uploadedAt: existingDbCandidate.created_at.toISOString(),
        isDuplicate: true,
      } : (existingInJob && isValidProfile(existingInJob) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingInJob.id) ? existingInJob : null);

      if (existingProfile) {
        console.log(`[CV Processing] Existing CV detected for: ${fileName}.`);
        const existingCandId = existingDbCandidate?.id || existingProfile.id;
        
        // 1. If uploading to Talent Pool and candidate already exists:
        if (isPoolUpload) {
          console.log(`[Batch Upload] jobId=${jobId} file=${fileName} size=${fileSize} status=duplicate`);
          const dupCandidate: CandidateRecord = {
            ...existingProfile,
            jobId: 'pool',
            isDuplicate: true,
            parsingStatus: 'DUPLICATE' as any,
            errorMessage: 'Duplicate CV: This candidate already exists in the Talent Pool.',
            fileName,
            fileSize,
            fileHash,
          };
          saveCandidateToPersistentPool(dupCandidate);
          const poolList = CANDIDATE_STORE.get('pool') || [];
          if (!poolList.some(c => c.id === dupCandidate.id)) {
            poolList.unshift(dupCandidate);
            CANDIDATE_STORE.set('pool', poolList);
          }

          if (files.length === 1) {
            return {
              candidate: dupCandidate,
              candidateId: existingCandId,
              singleFileResponse: {
                status: 200,
                body: {
                  status: 'duplicate',
                  message: 'Candidate CV already exists in the Talent Pool',
                  isDuplicate: true,
                  candidate: dupCandidate,
                  candidates: [dupCandidate],
                  allCandidates: existingCandidates
                }
              }
            };
          }
          return { candidate: dupCandidate, candidateId: existingCandId };
        }

        // 2. If uploading to a specific Job:
        const isAlreadyInJob = existingInJob || (existingDbCandidate && (
          existingDbCandidate.job_id === jobId ||
          (existingDbCandidate.applications && existingDbCandidate.applications.some((a: any) => a.job_id === jobId))
        ));

        if (isAlreadyInJob) {
          if (existingProfile && !(existingProfile as any).matchScore && jobId !== 'pool') {
            await evaluateAndEnrichCandidateRecord(existingProfile, jobId, req, defaultUserId);
          }

          console.log(`[Batch Upload] jobId=${jobId} file=${fileName} size=${fileSize} status=duplicate`);
          const dupCandidate: CandidateRecord = {
            ...existingProfile,
            jobId,
            isDuplicate: true,
            parsingStatus: (existingProfile?.parsingStatus || 'PARSED') as any,
            errorMessage: 'This CV is already uploaded to this JD.',
            fileName,
            fileSize,
            fileHash,
          };
          saveCandidateToPersistentPool(dupCandidate);
          const poolList = CANDIDATE_STORE.get('pool') || [];
          if (!poolList.some(c => c.id === dupCandidate.id)) {
            poolList.unshift(dupCandidate);
            CANDIDATE_STORE.set('pool', poolList);
          }

          if (files.length === 1) {
            return {
              candidate: dupCandidate,
              candidateId: existingCandId,
              singleFileResponse: {
                status: 200,
                body: {
                  status: 'duplicate',
                  message: 'This CV is already uploaded to this JD.',
                  isDuplicate: true,
                  candidate: dupCandidate,
                  candidates: [dupCandidate],
                  allCandidates: existingCandidates
                }
              }
            };
          }
          return { candidate: dupCandidate, candidateId: existingCandId };
        }

        // Candidate exists in database / pool but NOT in this job yet -> Link to this job via Application without duplicating candidate row
        try {
          if (existingCandId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingCandId) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
            await (prisma as any).candidateApplication.upsert({
              where: {
                job_id_candidate_id: {
                  job_id: jobId,
                  candidate_id: existingCandId
                }
              },
              update: {
                stage: 'PARSED',
                status: 'active'
              },
              create: {
                job_id: jobId,
                candidate_id: existingCandId,
                stage: 'PARSED',
                status: 'active'
              }
            }).catch(() => null);

            await prisma.candidate.update({
              where: { id: existingCandId },
              data: { job_id: jobId }
            }).catch(() => null);
          }
        } catch (linkErr) {
          console.warn('[CV Upload] Link existing candidate to job note:', linkErr);
        }

        const linkedRecord: CandidateRecord = {
          ...existingProfile,
          jobId,
          organizationId: userOrgId,
          isDuplicate: false,
          parsingStatus: 'PARSED',
          fileName,
          fileSize,
          fileHash,
          uploadedAt: new Date().toISOString()
        };

        // Automatically evaluate linked candidate against this job requisition!
        await evaluateAndEnrichCandidateRecord(linkedRecord, jobId, req, defaultUserId);

        existingCandidates.unshift(linkedRecord);

        if (files.length === 1) {
          return {
            candidate: linkedRecord,
            candidateId: existingCandId,
            singleFileResponse: {
              status: 200,
              body: {
                status: 'success',
                message: 'Candidate added to this position successfully (reused existing verified profile)',
                candidate: linkedRecord,
                candidates: [linkedRecord],
                allCandidates: existingCandidates
              }
            }
          };
        }
        return { candidate: linkedRecord, candidateId: existingCandId };
      }

      const candidateId = `cand-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // Step 0: Record initial candidate in Prisma database with status PROCESSING if not updating existing row
      const dbJobId = (!isPoolUpload && jobId && jobId !== 'pool' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) ? jobId : null;
      if (defaultUserId && !dbCandidateId) {
        try {
          const initialDbCand = await prisma.candidate.create({
            data: {
              job_id: dbJobId,
              name: cleanFileNameForDisplay(fileName),
              resume_file_url: fileName,
              file_hash: fileHash,
              parsing_status: 'PROCESSING',
              created_by: defaultUserId,
              organizationId: userOrgId,
            }
          });
          dbCandidateId = initialDbCand.id;
          console.log(`[Prisma DB] Stored initial candidate record ${dbCandidateId} (job_id: ${dbJobId || 'POOL'}) with status PROCESSING`);
        } catch (dbInitErr) {
          console.warn('[Prisma DB Init Notice] Initial candidate record creation bypassed:', dbInitErr);
        }
      }

      try {
        // Step 1: Extract text via Python FastAPI Document processor
        console.log(`[CV Processing Step 1] Extracting document text for ${fileName}...`);
        const pythonResult: PythonDocumentResponse = await extractDocumentTextViaPython(
          file.buffer,
          fileName,
          fileMime
        );

        let rawText = '';
        let extractionMethod = pythonResult.extractionMethod || 'direct-text';
        let pageCount = pythonResult.pageCount || 1;
        let ocrUsed = pythonResult.ocrUsed || false;
        let charCount = pythonResult.characterCount || 0;
        let wordCount = pythonResult.wordCount || 0;

        if (pythonResult.success && pythonResult.text && pythonResult.text.trim().length > 20) {
          rawText = pythonResult.normalizedText || pythonResult.text;
        }

        // Secondary fallback to local extractor if pythonResult was insufficient or empty
        if (!rawText || rawText.trim().length < 20) {
          console.log(`[CV Processing Fallback] Attempting direct local extraction for ${fileName}...`);
          const localFallback = await extractDocumentTextLocally(file.buffer, fileName, fileMime);
          if (localFallback.text && localFallback.text.trim().length > 20) {
            rawText = localFallback.normalizedText || localFallback.text;
            extractionMethod = localFallback.extractionMethod;
            pageCount = localFallback.pageCount;
            charCount = localFallback.characterCount;
            wordCount = localFallback.wordCount;
            ocrUsed = localFallback.ocrUsed;
          }
        }

        // Step 2: Quality validation of raw extracted text
        const textQuality = validateCvTextQuality(rawText || '');
        console.log(`[CV Processing Step 2] Extracted ${(rawText || '').length} chars. Quality check valid: ${textQuality.isValid} (Reason: ${textQuality.reason || 'OK'})`);

        if (!rawText || !textQuality.isValid) {
          console.warn(`[CV Processing FAILED] Rejected document ${fileName}: ${textQuality.reason || 'Insufficient text'}`);
          const failRecord: CandidateRecord = {
            id: dbCandidateId || candidateId,
            jobId,
            organizationId: userOrgId,
            name: cleanFileNameForDisplay(fileName),
            email: null,
            phone: null,
            location: null,
            currentTitle: null,
            currentCompany: null,
            totalExperience: null,
            relevantExperience: null,
            summary: null,
            skills: [],
            technologies: [],
            tools: [],
            industries: [],
            education: [],
            certifications: [],
            languages: [],
            experience: [],
            responsibilities: [],
            achievements: [],
            projects: [],
            sourceEvidence: {},
            rawText: rawText || '',
            parsingStatus: 'FAILED',
            errorMessage: textQuality.reason || 'Extracted document text was unreadable or failed validation.',
            validationErrors: [textQuality.reason || 'Failed quality threshold check.'],
            parsingMetadata: {
              fileName,
              fileType: fileMime,
              pageCount,
              extractionMethod: `${extractionMethod}-rejected`,
              ocrUsed,
              characterCount: charCount,
              wordCount,
            },
            fileName,
            fileSize,
            fileHash,
            uploadedAt: new Date().toISOString(),
          };

          if (dbCandidateId) {
            await prisma.candidate.update({
              where: { id: dbCandidateId },
              data: {
                parsing_status: 'FAILED',
                error_message: textQuality.reason || 'Extracted document text was unreadable',
                raw_text: rawText || '',
              }
            }).catch(() => null);
          }

          console.warn(`[Batch Upload] jobId=${jobId} file=${fileName} size=${fileSize} status=failed reason="${textQuality.reason || 'Insufficient readable text'}"`);
          existingCandidates.unshift(failRecord);
          return { candidate: failRecord, candidateId: dbCandidateId || candidateId };
        }

        // Step 3: Extract structured fields from validated text
        const structuredProfile = extractStructuredCandidateFromText(rawText, fileName, {
          fileType: fileMime,
          pageCount,
          extractionMethod,
          ocrUsed,
          characterCount: charCount,
          wordCount,
        });

        // Step 3a: Prioritize and blend document processor extractions if available
        if (pythonResult.candidateName && pythonResult.candidateName.trim() && pythonResult.candidateName !== 'Candidate') {
          structuredProfile.name = pythonResult.candidateName.trim();
        }
        if (pythonResult.email && pythonResult.email.includes('@')) {
          structuredProfile.email = pythonResult.email.trim();
        }
        if (pythonResult.phone) {
          structuredProfile.phone = pythonResult.phone.trim();
        }
        if (pythonResult.skills && pythonResult.skills.length > 0) {
          const mergedSkills = Array.from(new Set([...(pythonResult.skills || []), ...structuredProfile.skills]));
          structuredProfile.skills = mergedSkills;
          structuredProfile.technologies = mergedSkills;
        }
        if (pythonResult.yearsOfExperience) {
          const pyYearsMatch = String(pythonResult.yearsOfExperience).match(/(\d+(?:\.\d+)?)/);
          const spYearsMatch = String(structuredProfile.totalExperience || '').match(/(\d+(?:\.\d+)?)/);
          const pyYears = pyYearsMatch ? parseFloat(pyYearsMatch[1]) : 0;
          const spYears = spYearsMatch ? parseFloat(spYearsMatch[1]) : 0;

          if (pyYears > 0 && spYears > 0) {
            const bestYears = Math.max(pyYears, spYears);
            structuredProfile.totalExperience = `${bestYears} yrs`;
            structuredProfile.relevantExperience = `${bestYears} yrs`;
            structuredProfile.totalExperienceYears = bestYears;
            structuredProfile.totalExperienceMonths = Math.round(bestYears * 12);
          } else if (pyYears > 0) {
            structuredProfile.totalExperience = `${pyYears} yrs`;
            structuredProfile.relevantExperience = `${pyYears} yrs`;
            structuredProfile.totalExperienceYears = pyYears;
            structuredProfile.totalExperienceMonths = Math.round(pyYears * 12);
          }
        }
        if (pythonResult.currentTitle) {
          structuredProfile.currentTitle = pythonResult.currentTitle;
        }
        if (pythonResult.currentCompany) {
          structuredProfile.currentCompany = pythonResult.currentCompany;
        }
        if (pythonResult.summary) {
          structuredProfile.summary = pythonResult.summary;
          structuredProfile.professionalSummary = pythonResult.summary;
        }

        // Step 3b: Check if candidate already exists in current job by extracted details
        const dupInJob = existingCandidates.find(ec =>
          (structuredProfile.email && ec.email && ec.email.toLowerCase() === structuredProfile.email.toLowerCase()) ||
          (structuredProfile.phone && ec.phone && ec.phone.replace(/[^0-9]/g, '') === structuredProfile.phone.replace(/[^0-9]/g, '') && structuredProfile.phone.length > 5) ||
          (!isGeneric(structuredProfile.name) && !isGeneric(ec.name) && ec.name!.trim().toLowerCase() === structuredProfile.name!.trim().toLowerCase())
        );

        if (dupInJob) {
          console.log(`[CV Processing] Duplicate candidate profile detected in job for: ${structuredProfile.name}.`);
          if (dbCandidateId) {
            await prisma.candidate.delete({ where: { id: dbCandidateId } }).catch(() => null);
          }

          console.log(`[Batch Upload] jobId=${jobId} file=${fileName} size=${fileSize} status=duplicate`);
          const dupRecord: CandidateRecord = {
            ...dupInJob,
            jobId,
            isDuplicate: true,
            parsingStatus: 'DUPLICATE' as any,
            errorMessage: 'This CV is already uploaded to this JD.',
            fileName,
            fileSize,
            fileHash,
          };

          if (files.length === 1) {
            return {
              candidate: dupRecord,
              candidateId: dupInJob.id,
              singleFileResponse: {
                status: 200,
                body: {
                  status: 'duplicate',
                  message: 'This CV is already uploaded to this JD.',
                  isDuplicate: true,
                  candidate: dupRecord,
                  candidates: [dupRecord],
                  allCandidates: existingCandidates,
                }
              }
            };
          }
          return { candidate: dupRecord, candidateId: dupInJob.id };
        }

        // Check if candidate exists in Prisma DB for this user/client organization
        if (structuredProfile.email || structuredProfile.phone) {
          try {
            const existingByEmailOrPhone = await prisma.candidate.findFirst({
              where: {
                AND: [
                  ...(isSuperAdmin ? [] : [{ organizationId: userOrgId }]),
                  {
                    OR: [
                      ...(structuredProfile.email ? [{ email: { equals: structuredProfile.email, mode: 'insensitive' as const } }] : []),
                      ...(structuredProfile.phone ? [{ phone: structuredProfile.phone }] : [])
                    ]
                  }
                ]
              },
              include: {
                applications: true
              }
            });

            if (existingByEmailOrPhone) {
              const isLinkedToThisJob = existingByEmailOrPhone.job_id === jobId ||
                (existingByEmailOrPhone.applications && existingByEmailOrPhone.applications.some((a: any) => a.job_id === jobId)) ||
                existingCandidates.some(c => c.id === existingByEmailOrPhone.id || (c.email && c.email.toLowerCase() === structuredProfile.email?.toLowerCase()));

              if (isLinkedToThisJob) {
                console.log(`[CV Processing] Candidate already linked to this job (ID: ${existingByEmailOrPhone.id}).`);
                if (dbCandidateId && dbCandidateId !== existingByEmailOrPhone.id) {
                  await prisma.candidate.delete({ where: { id: dbCandidateId } }).catch(() => null);
                }

                const dupRecord: CandidateRecord = {
                  id: existingByEmailOrPhone.id,
                  jobId,
                  organizationId: userOrgId,
                  ...structuredProfile,
                  isDuplicate: true,
                  parsingStatus: 'DUPLICATE' as any,
                  errorMessage: 'This CV is already uploaded to this JD.',
                  fileName,
                  fileSize,
                  fileHash,
                  uploadedAt: existingByEmailOrPhone.created_at.toISOString(),
                };

                console.log(`[Batch Upload] jobId=${jobId} file=${fileName} size=${fileSize} status=duplicate`);

                if (files.length === 1) {
                  return {
                    candidate: dupRecord,
                    candidateId: existingByEmailOrPhone.id,
                    singleFileResponse: {
                      status: 200,
                      body: {
                        status: 'duplicate',
                        message: 'This CV is already uploaded to this JD.',
                        isDuplicate: true,
                        candidate: dupRecord,
                        candidates: [dupRecord],
                        allCandidates: existingCandidates,
                      }
                    }
                  };
                }
                return { candidate: dupRecord, candidateId: existingByEmailOrPhone.id };
              } else {
                // Allowed for this new JD! Link to this position without duplication
                console.log(`[CV Processing] Candidate exists from another JD (ID: ${existingByEmailOrPhone.id}). Linking to new JD: ${jobId}`);
                if (dbCandidateId && dbCandidateId !== existingByEmailOrPhone.id) {
                  await prisma.candidate.delete({ where: { id: dbCandidateId } }).catch(() => null);
                }
                if (dbJobId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingByEmailOrPhone.id)) {
                  await (prisma as any).candidateApplication.upsert({
                    where: {
                      job_id_candidate_id: {
                        job_id: dbJobId,
                        candidate_id: existingByEmailOrPhone.id
                      }
                    },
                    update: { stage: 'PARSED', status: 'active' },
                    create: { job_id: dbJobId, candidate_id: existingByEmailOrPhone.id, stage: 'PARSED', status: 'active' }
                  }).catch(() => null);
                }

                const linkedRecord: CandidateRecord = {
                  id: existingByEmailOrPhone.id,
                  jobId,
                  organizationId: userOrgId,
                  ...structuredProfile,
                  isDuplicate: false,
                  parsingStatus: 'PARSED',
                  fileName,
                  fileSize,
                  fileHash,
                  uploadedAt: new Date().toISOString(),
                };

                await evaluateAndEnrichCandidateRecord(linkedRecord, jobId, req, defaultUserId);

                existingCandidates.unshift(linkedRecord);

                if (files.length === 1) {
                  return {
                    candidate: linkedRecord,
                    candidateId: existingByEmailOrPhone.id,
                    singleFileResponse: {
                      status: 200,
                      body: {
                        status: 'success',
                        message: 'Candidate added to this position successfully',
                        isDuplicate: false,
                        candidate: linkedRecord,
                        candidates: [linkedRecord],
                        allCandidates: existingCandidates,
                      }
                    }
                  };
                }
                return { candidate: linkedRecord, candidateId: existingByEmailOrPhone.id };
              }
            }
          } catch (dupLookupErr) {
            console.warn('[Duplicate Check] Email/Phone lookup note:', dupLookupErr);
          }
        }

        const actualUser = (req as any).user?.userId || (req as any).user?.id;
        const uploaderId = actualUser || defaultUserId || undefined;
        const newRecord: CandidateRecord = {
          id: dbCandidateId || candidateId,
          jobId,
          organizationId: userOrgId,
          ...structuredProfile,
          fileName,
          fileSize,
          fileHash,
          uploadedAt: new Date().toISOString(),
          uploadedBy: uploaderId,
          createdBy: uploaderId,
          source: 'bulk_upload',
        };

        // Cache globally for duplicate detection across jobs
        GLOBAL_CANDIDATES.set(fileHash, newRecord);
        GLOBAL_CANDIDATES.set(newRecord.id, newRecord);

        // Update / Persist full candidate metadata into Prisma database
        try {
          if (dbCandidateId) {
            await (prisma as any).candidate.update({
              where: { id: dbCandidateId },
              data: {
                name: newRecord.name,
                email: newRecord.email,
                phone: newRecord.phone,
                location: newRecord.location,
                total_experience: newRecord.totalExperience,
                current_title: newRecord.currentTitle,
                current_company: newRecord.currentCompany,
                summary: newRecord.summary,
                raw_text: rawText,
                parsing_status: 'PARSED',
                source: 'bulk_upload',
                organizationId: userOrgId,
                job_id: dbJobId,
                resume_file_url: fileName,
              } as any
            });

            // Link candidate to job application record if job exists
            const validJob = await prisma.job.findUnique({ where: { id: jobId } }).catch(() => null);
            if (validJob) {
              await prisma.candidateApplication.upsert({
                where: {
                  job_id_candidate_id: {
                    job_id: validJob.id,
                    candidate_id: dbCandidateId,
                  }
                },
                update: {
                  stage: 'PARSED',
                  status: 'active',
                },
                create: {
                  job_id: validJob.id,
                  candidate_id: dbCandidateId,
                  stage: 'PARSED',
                  status: 'active',
                }
              }).catch(() => null);
            }
          } else if (defaultUserId) {
            const createdDbCand = await prisma.candidate.create({
              data: {
                job_id: jobId.includes('-') && jobId.length === 36 ? jobId : undefined,
                name: newRecord.name,
                email: newRecord.email,
                phone: newRecord.phone,
                location: newRecord.location,
                total_experience: newRecord.totalExperience,
                current_title: newRecord.currentTitle,
                current_company: newRecord.currentCompany,
                summary: newRecord.summary,
                resume_file_url: fileName,
                raw_text: rawText,
                file_hash: fileHash,
                parsing_status: 'PARSED',
                created_by: defaultUserId,
                organizationId: userOrgId,
              }
            });
            newRecord.id = createdDbCand.id;
          }

          const targetId = dbCandidateId || newRecord.id;
          if (targetId && targetId.length === 36) {
            // Save child skills
            if (newRecord.skills && newRecord.skills.length > 0) {
              await prisma.candidateSkill.deleteMany({ where: { candidate_id: targetId } }).catch(() => null);
              await prisma.candidateSkill.createMany({
                data: newRecord.skills.map(s => ({ candidate_id: targetId, skill: s })),
                skipDuplicates: true,
              }).catch(() => null);
            }
            // Save child experiences
            if (newRecord.experience && newRecord.experience.length > 0) {
              await prisma.candidateExperience.deleteMany({ where: { candidate_id: targetId } }).catch(() => null);
              await prisma.candidateExperience.createMany({
                data: newRecord.experience.map(ex => ({
                  candidate_id: targetId,
                  company: ex.company || 'Company',
                  title: ex.title || 'Role',
                  duration: ex.duration || '',
                  description: ex.description || '',
                  start_date: ex.startDate || '',
                  end_date: ex.endDate || '',
                })),
                skipDuplicates: true,
              }).catch(() => null);
            }
            // Save child education
            if (newRecord.education && newRecord.education.length > 0) {
              await prisma.candidateEducation.deleteMany({ where: { candidate_id: targetId } }).catch(() => null);
              await prisma.candidateEducation.createMany({
                data: newRecord.education.map(e => ({
                  candidate_id: targetId,
                  degree: e.degree || 'Degree',
                  institution: e.institution || 'Institution',
                  field: e.field || '',
                })),
                skipDuplicates: true,
              }).catch(() => null);
            }
          }
        } catch (dbSaveErr) {
          console.warn('[Prisma DB Save Notice] Candidate metadata stored in memory cache:', dbSaveErr);
        }

        // Automatically evaluate candidate against job requirements upon upload to requisition
        if (jobId && jobId !== 'pool') {
          try {
            await evaluateAndEnrichCandidateRecord(newRecord, jobId, req, defaultUserId);
          } catch (evalErr) {
            console.warn('[Evaluation Notice] Automatic evaluation error:', evalErr);
          }
        }

        console.log(`[Batch Upload] jobId=${jobId} file=${fileName} size=${fileSize} status=success`);
        existingCandidates.unshift(newRecord);

        // Keep candidate attached to poolStore so it's always queryable in candidate pool
        const poolStore = CANDIDATE_STORE.get('pool') || [];
        const existingIdx = poolStore.findIndex(c => c.id === newRecord.id || (newRecord.fileHash && c.fileHash === newRecord.fileHash));
        if (existingIdx >= 0) {
          poolStore[existingIdx] = { ...poolStore[existingIdx], ...newRecord };
        } else {
          poolStore.unshift({ ...newRecord });
        }
        CANDIDATE_STORE.set('pool', poolStore);
        saveCandidateToPersistentPool(newRecord);
        if (newRecord.fileHash) GLOBAL_CANDIDATES.set(newRecord.fileHash, newRecord);
        GLOBAL_CANDIDATES.set(newRecord.id, newRecord);

        return { candidate: newRecord, candidateId: newRecord.id };
      } catch (err: any) {
        console.error(`[Batch Upload] jobId=${jobId} file=${fileName} size=${fileSize} status=failed reason="${err.message || 'Processing error'}"`);
        const errRecord: CandidateRecord = {
          id: dbCandidateId || candidateId,
          jobId,
          organizationId: userOrgId,
          name: cleanFileNameForDisplay(fileName),
          email: null,
          phone: null,
          location: null,
          currentTitle: null,
          currentCompany: null,
          totalExperience: null,
          relevantExperience: null,
          summary: null,
          skills: [],
          technologies: [],
          tools: [],
          industries: [],
          education: [],
          certifications: [],
          languages: [],
          experience: [],
          responsibilities: [],
          achievements: [],
          projects: [],
          sourceEvidence: {},
          rawText: '',
          parsingStatus: 'FAILED',
          errorMessage: `Processing error: ${err.message || 'Unknown error'}`,
          validationErrors: [err.message || 'Unknown processing error'],
          parsingMetadata: {
            fileName,
            fileType: fileMime,
            pageCount: 0,
            extractionMethod: 'error',
            ocrUsed: false,
            characterCount: 0,
            wordCount: 0,
          },
          fileName,
          fileSize,
          fileHash,
          uploadedAt: new Date().toISOString(),
        };

        if (dbCandidateId) {
          await prisma.candidate.update({
            where: { id: dbCandidateId },
            data: {
              parsing_status: 'FAILED',
              error_message: err.message || 'Processing error',
            }
          }).catch(() => null);
        }

        existingCandidates.unshift(errRecord);
        return { candidate: errRecord, candidateId: dbCandidateId || candidateId };
      }
    };

    // Single-file upload fast-path
    if (files.length === 1) {
      const singleResult = await processSingleCvFile(files[0]);
      if (singleResult.singleFileResponse) {
        res.status(singleResult.singleFileResponse.status).json(singleResult.singleFileResponse.body);
        return;
      }
      CANDIDATE_STORE.set(jobId, existingCandidates);
      res.status(201).json({
        success: true,
        jobId,
        uploadedCount: 1,
        successfulCount: singleResult.candidate.parsingStatus === 'PARSED' ? 1 : 0,
        failedCount: singleResult.candidate.parsingStatus === 'FAILED' ? 1 : 0,
        candidateIds: [singleResult.candidateId],
        processingStatus: 'COMPLETED',
        candidate: singleResult.candidate,
        candidates: [singleResult.candidate],
        allCandidates: existingCandidates
      });
      return;
    }

    // Multi-file bulk upload with bounded concurrency (3 parallel workers)
    const BATCH_CONCURRENCY = Math.min(3, files.length);
    const processedCandidates: CandidateRecord[] = [];
    const candidateIds: string[] = [];
    let cursor = 0;

    console.log(`[Batch Processing] Launching ${BATCH_CONCURRENCY} concurrent workers for ${files.length} CV files...`);

    const worker = async () => {
      while (cursor < files.length) {
        const fileIdx = cursor++;
        const file = files[fileIdx];
        if (!file) break;

        try {
          const result = await processSingleCvFile(file);
          processedCandidates.push(result.candidate);
          candidateIds.push(result.candidateId);
        } catch (fileErr: any) {
          console.error(`[Batch Worker Error] Failed processing ${file.originalname}:`, fileErr);
          const errRec: CandidateRecord = {
            id: `cand-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            jobId,
            organizationId: userOrgId,
            name: cleanFileNameForDisplay(file.originalname),
            email: null,
            phone: null,
            location: null,
            currentTitle: null,
            currentCompany: null,
            totalExperience: null,
            relevantExperience: null,
            summary: null,
            fileName: file.originalname,
            fileSize: file.size,
            uploadedAt: new Date().toISOString(),
            parsingStatus: 'FAILED',
            errorMessage: fileErr.message || 'Processing error',
            validationErrors: [fileErr.message || 'Processing error'],
            skills: [],
            technologies: [],
            tools: [],
            industries: [],
            education: [],
            certifications: [],
            languages: [],
            experience: [],
            responsibilities: [],
            achievements: [],
            projects: [],
            sourceEvidence: {},
            rawText: '',
            parsingMetadata: {
              fileName: file.originalname,
              fileType: file.mimetype || 'application/pdf',
              pageCount: 0,
              extractionMethod: 'error',
              ocrUsed: false,
              characterCount: 0,
              wordCount: 0
            }
          };
          processedCandidates.push(errRec);
        }
      }
    };

    const workers = Array.from({ length: BATCH_CONCURRENCY }, () => worker());
    await Promise.all(workers);

    CANDIDATE_STORE.set(jobId, existingCandidates);

    // Return aggregated response for real-time frontend feedback
    res.status(201).json({
      success: true,
      jobId,
      uploadedCount: processedCandidates.length,
      successfulCount: processedCandidates.filter(c => c.parsingStatus === 'PARSED').length,
      failedCount: processedCandidates.filter(c => c.parsingStatus === 'FAILED').length,
      candidateIds,
      processingStatus: 'COMPLETED',
      candidates: processedCandidates,
      allCandidates: existingCandidates
    });
  } catch (error: any) {
    console.error('Error during bulk CV upload:', error);
    res.status(500).json({ error: 'Bulk CV upload failed on server' });
  }
};

/**
 * Retry parsing a failed candidate
 * POST /api/jobs/:jobId/candidates/:candidateId/retry
 */
export const retryCandidateParsing = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const jobId = String(req.params.jobId || '');
    const candidateId = String(req.params.candidateId || '');
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const userOrgId = req.user?.organizationId || 'org-tasknera';

    // Verify job belongs to organization if jobId provided
    if (jobId && !isSuperAdmin) {
      const job = await getJobFromStoreOrDb(jobId);
      if (job && (job.organizationId || 'org-tasknera') !== userOrgId) {
        res.status(403).json({ error: 'Unauthorized: Cannot access job from another organization' });
        return;
      }
    }

    const candidates = CANDIDATE_STORE.get(jobId);
    if (!candidates) {
      res.status(404).json({ error: 'Job candidate list not found' });
      return;
    }

    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) {
      res.status(404).json({ error: 'Candidate profile not found' });
      return;
    }

    // Verify candidate belongs to organization
    const candOrgId = candidate.organizationId || 'org-tasknera';
    if (!isSuperAdmin && candOrgId !== userOrgId) {
      res.status(403).json({ error: 'Unauthorized: Cannot access candidate from another organization' });
      return;
    }

    if (!candidate.rawText || candidate.rawText.length < 20) {
      res.status(400).json({ error: 'Candidate has no raw text available for retry.' });
      return;
    }

    const recovered = extractStructuredCandidateFromText(candidate.rawText, candidate.fileName, {
      fileType: candidate.parsingMetadata.fileType || 'application/pdf',
      pageCount: Math.max(1, candidate.parsingMetadata.pageCount || 1),
      extractionMethod: 'retry-recovered',
      ocrUsed: true,
      characterCount: candidate.rawText.length,
      wordCount: candidate.rawText.split(/\s+/).filter(Boolean).length,
    });

    Object.assign(candidate, {
      ...recovered,
      errorMessage: undefined,
    });

    res.json({
      success: true,
      jobId,
      candidate,
    });
  } catch (error: any) {
    console.error('Error retrying candidate:', error);
    res.status(500).json({ error: 'Failed to retry candidate parsing' });
  }
};

/**
 * Delete a candidate profile from database & memory store
 * DELETE /api/candidates/:candidateId or DELETE /api/jobs/:jobId/candidates/:candidateId
 */
export const deleteCandidate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const candidateId = String(req.params.candidateId || '');
    const jobId = String(req.params.jobId || '');
    const callerRole = req.user?.role || 'MEMBER';
    const isSuperAdmin = callerRole === 'SUPER_ADMIN' || req.user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || req.user?.email?.toLowerCase().trim() === 'admin@gmail.com';
    const isClientAdmin = callerRole === 'CLIENT_ADMIN' || callerRole === 'ADMIN';
    const userOrgId = req.user?.organizationId || 'org-tasknera';

    if (!candidateId) {
      res.status(400).json({ error: 'Candidate ID is required' });
      return;
    }

    // Check candidate ownership in DB, memory, or persistent pool
    let existingCandidate: any = null;
    const isCandUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);
    if (isCandUuid) {
      try {
        existingCandidate = await prisma.candidate.findUnique({
          where: { id: candidateId },
          include: { user: true }
        });
      } catch (err) {
        console.warn('[Delete Candidate] Prisma find error:', err);
      }
    }

    if (!existingCandidate) {
      existingCandidate = GLOBAL_CANDIDATES.get(candidateId);
    }
    if (!existingCandidate && jobId && CANDIDATE_STORE.has(jobId)) {
      existingCandidate = CANDIDATE_STORE.get(jobId)?.find(c => c.id === candidateId);
    }
    if (!existingCandidate) {
      for (const list of CANDIDATE_STORE.values()) {
        const found = list.find(c => c.id === candidateId);
        if (found) {
          existingCandidate = found;
          break;
        }
      }
    }
    if (!existingCandidate) {
      const poolItems = loadPersistentPool();
      existingCandidate = poolItems.find(c => c.id === candidateId);
    }

    // If candidate exists, verify ownership
    if (existingCandidate && !isSuperAdmin) {
      const candOrgId = existingCandidate.organizationId || existingCandidate.user?.organizationId || 'org-tasknera';
      if (candOrgId !== userOrgId) {
        res.status(403).json({ error: 'Unauthorized: Cannot delete candidate from another organization' });
        return;
      }
    }

    const candFileHash = existingCandidate?.fileHash || existingCandidate?.file_hash;
    const candEmail = existingCandidate?.email;
    const candFileName = existingCandidate?.fileName || existingCandidate?.resume_file_url;

    // 1. Comprehensive cascading delete from Prisma database
    const dbTargetIds = new Set<string>();
    if (isCandUuid) {
      dbTargetIds.add(candidateId);
    }

    // Find any DB candidate rows matching candidate UUID, file_hash, or email
    try {
      const orClauses: any[] = [];
      if (isCandUuid) orClauses.push({ id: candidateId });
      if (candFileHash) orClauses.push({ file_hash: candFileHash });
      if (candEmail && candEmail.includes('@')) orClauses.push({ email: candEmail.toLowerCase().trim() });

      if (orClauses.length > 0) {
        const dbMatches = await prisma.candidate.findMany({
          where: {
            OR: orClauses,
            ...(!isSuperAdmin ? { organizationId: userOrgId } : {})
          },
          select: { id: true }
        });
        for (const m of dbMatches) {
          dbTargetIds.add(m.id);
        }
      }
    } catch (lookupErr) {
      console.warn('[Delete Candidate] DB matching candidate lookup notice:', lookupErr);
    }

    const targetIdsArr = Array.from(dbTargetIds);
    if (targetIdsArr.length > 0) {
      try {
        // Explicitly delete child relations first to prevent foreign key errors
        await prisma.candidateSkill.deleteMany({ where: { candidate_id: { in: targetIdsArr } } }).catch(() => null);
        await prisma.candidateExperience.deleteMany({ where: { candidate_id: { in: targetIdsArr } } }).catch(() => null);
        await prisma.candidateEducation.deleteMany({ where: { candidate_id: { in: targetIdsArr } } }).catch(() => null);
        await prisma.candidateCertification.deleteMany({ where: { candidate_id: { in: targetIdsArr } } }).catch(() => null);
        await prisma.candidateLanguage.deleteMany({ where: { candidate_id: { in: targetIdsArr } } }).catch(() => null);
        await prisma.candidateProject.deleteMany({ where: { candidate_id: { in: targetIdsArr } } }).catch(() => null);
        await prisma.candidateApplication.deleteMany({ where: { candidate_id: { in: targetIdsArr } } }).catch(() => null);
        await prisma.evaluation.deleteMany({
          where: {
            OR: [
              { candidateId: { in: targetIdsArr } },
              { candidateJobId: { in: targetIdsArr } },
              { candidateJobId: candidateId }
            ]
          }
        }).catch(() => null);
        await prisma.candidate.deleteMany({ where: { id: { in: targetIdsArr } } }).catch(() => null);
      } catch (dbErr) {
        console.warn('[Delete Candidate] Prisma cascade delete error:', dbErr);
      }
    }

    // 2. Delete from memory store (across all jobs and talent pool)
    for (const [jId, list] of CANDIDATE_STORE.entries()) {
      CANDIDATE_STORE.set(jId, list.filter(c => {
        if (c.id === candidateId || targetIdsArr.includes(c.id)) return false;
        if (candFileHash && c.fileHash && c.fileHash === candFileHash) return false;
        if (candEmail && c.email && candEmail.includes('@') && c.email.toLowerCase().trim() === candEmail.toLowerCase().trim()) return false;
        return true;
      }));
    }

    GLOBAL_CANDIDATES.delete(candidateId);
    for (const tid of targetIdsArr) GLOBAL_CANDIDATES.delete(tid);
    if (candFileHash) GLOBAL_CANDIDATES.delete(candFileHash);

    // 3. Delete from persistent storage pool file
    deleteCandidateFromPersistentPool(candidateId, candFileHash, candEmail, candFileName, targetIdsArr);

    // 4. Invalidate evaluations in memory cache
    for (const cacheKey of Array.from(EVALUATION_CACHE.keys())) {
      if (cacheKey.includes(candidateId) || targetIdsArr.some(tid => cacheKey.includes(tid))) {
        EVALUATION_CACHE.delete(cacheKey);
      }
    }

    res.json({
      success: true,
      message: 'Candidate and CV deleted successfully from database and candidate pool',
      candidateId,
      deletedIds: targetIdsArr
    });
  } catch (error: any) {
    console.error('Error deleting candidate:', error);
    res.status(500).json({ error: 'Failed to delete candidate' });
  }
};

/**
 * Update candidate decision tag (REVIEW, SUBMIT, REJECT)
 * PATCH /api/jobs/:jobId/candidates/:candidateId/decision
 * PATCH /api/candidates/:candidateId/decision
 */
export const updateCandidateDecision = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const candidateId = String(req.params.candidateId || '');
    const jobId = String(req.params.jobId || '');
    const rawDecision = String(req.body.decision || '').trim().toUpperCase();
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const userOrgId = req.user?.organizationId || 'org-tasknera';

    if (!candidateId) {
      res.status(400).json({ error: 'Candidate ID is required' });
      return;
    }

    if (!['REVIEW', 'SUBMIT', 'REJECT', 'DO NOT SUBMIT', 'ACCEPT'].includes(rawDecision)) {
      res.status(400).json({ error: 'Invalid decision. Must be REVIEW, SUBMIT, or REJECT.' });
      return;
    }

    // Check candidate ownership
    const isCandUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);
    let existingCandidate: any = null;
    if (isCandUuid) {
      try {
        existingCandidate = await prisma.candidate.findUnique({
          where: { id: candidateId },
          include: { user: true }
        });
      } catch (err) {}
    }
    if (!existingCandidate) {
      existingCandidate = await findCandidateRecord(candidateId, jobId);
    }

    if (existingCandidate && !isSuperAdmin) {
      const candOrgId = existingCandidate.organizationId || existingCandidate.user?.organizationId || 'org-tasknera';
      if (candOrgId !== userOrgId) {
        res.status(403).json({ error: 'Unauthorized: Cannot update candidate from another organization' });
        return;
      }
    }

    // Verify jobId if provided
    if (jobId && !isSuperAdmin) {
      const job = await getJobFromStoreOrDb(jobId);
      if (job && (job.organizationId || 'org-tasknera') !== userOrgId) {
        res.status(403).json({ error: 'Unauthorized: Cannot link decision to job from another organization' });
        return;
      }
    }

    const standardDecision: 'REVIEW' | 'SUBMIT' | 'REJECT' =
      (rawDecision === 'ACCEPT' || rawDecision === 'SUBMIT') ? 'SUBMIT' :
      (rawDecision === 'DO NOT SUBMIT' || rawDecision === 'REJECT') ? 'REJECT' : 'REVIEW';

    // 1. Update in-memory stores
    if (jobId && CANDIDATE_STORE.has(jobId)) {
      const list = CANDIDATE_STORE.get(jobId) || [];
      for (const c of list) {
        if (c.id === candidateId) {
          (c as any).decision = standardDecision;
          (c as any).recommendation = standardDecision;
        }
      }
    }
    for (const [jId, list] of CANDIDATE_STORE.entries()) {
      for (const c of list) {
        if (c.id === candidateId) {
          (c as any).decision = standardDecision;
          (c as any).recommendation = standardDecision;
        }
      }
    }
    if (GLOBAL_CANDIDATES.has(candidateId)) {
      const c = GLOBAL_CANDIDATES.get(candidateId);
      if (c) {
        (c as any).decision = standardDecision;
        (c as any).recommendation = standardDecision;
      }
    }

    // 2. Persist to Prisma database if UUID
    if (isCandUuid) {
      try {
        const dbDecision = standardDecision === 'REJECT' ? 'DO NOT SUBMIT' : standardDecision;
        await prisma.evaluation.updateMany({
          where: { candidateId, ...(jobId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId) ? { jobId } : {}) },
          data: { decision: dbDecision, updatedAt: new Date() }
        });

        const stage = standardDecision === 'SUBMIT' ? 'SHORTLISTED' : standardDecision === 'REJECT' ? 'REJECTED' : 'REVIEW';
        await prisma.candidateApplication.updateMany({
          where: { candidate_id: candidateId, ...(jobId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId) ? { job_id: jobId } : {}) },
          data: { stage }
        });
      } catch (dbErr) {
        console.warn('[updateCandidateDecision] DB persistence non-fatal error:', dbErr);
      }
    }

    res.json({
      success: true,
      message: `Candidate decision tag updated to ${standardDecision}`,
      candidateId,
      decision: standardDecision
    });
  } catch (error: any) {
    console.error('Error updating candidate decision:', error);
    res.status(500).json({ error: error.message || 'Failed to update candidate decision' });
  }
};



/**
 * Find candidate record from memory store or DB
 */
export async function findCandidateRecord(candidateId: string, jobId?: string, targetOrgId?: string): Promise<CandidateRecord | null> {
  if (!candidateId) return null;

  // 1. Check memory store by jobId if given
  if (jobId && CANDIDATE_STORE.has(jobId)) {
    const memList = CANDIDATE_STORE.get(jobId);
    const found = memList?.find(c => c.id === candidateId && (!targetOrgId || (c.organizationId || 'org-tasknera') === targetOrgId));
    if (found) return found;
  }

  // 2. Check all job lists in CANDIDATE_STORE
  for (const list of CANDIDATE_STORE.values()) {
    const found = list.find(c => c.id === candidateId && (!targetOrgId || (c.organizationId || 'org-tasknera') === targetOrgId));
    if (found) return found;
  }

  // 3. Check GLOBAL_CANDIDATES
  if (GLOBAL_CANDIDATES.has(candidateId)) {
    const found = GLOBAL_CANDIDATES.get(candidateId)!;
    if (!targetOrgId || (found.organizationId || 'org-tasknera') === targetOrgId) {
      return found;
    }
  }

  // 4. Check Prisma DB if candidateId is a valid UUID
  const isCandidateUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);
  if (isCandidateUuid) {
    try {
      const dbCandidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: {
          experiences: true,
          education: true,
          skills: true,
          certifications: true,
          languages: true,
          projects: true,
          user: true,
        }
      });
      if (dbCandidate) {
        const candOrgId = dbCandidate.organizationId || (dbCandidate as any).user?.organizationId || 'org-tasknera';
        if (targetOrgId && candOrgId !== targetOrgId) {
          return null;
        }
        return mapDbCandidateToRecord(dbCandidate, jobId);
      }
    } catch (err) {
      console.warn('[Candidates] Prisma find candidate error:', err);
    }
  }

  return null;
}

/**
 * Retrieves all candidates from both DB and memory store with their associated jobId
 * Filtered by user or organization if specified
 */
export async function getAllCandidateRecords(userId?: string, organizationId?: string): Promise<Array<{ candidate: CandidateRecord; jobId: string }>> {
  const result: Array<{ candidate: CandidateRecord; jobId: string }> = [];
  const seenIds = new Set<string>();

  // 1. Fetch DB candidates
  try {
    const whereClause: any = {};
    if (organizationId) {
      whereClause.organizationId = organizationId;
    }
    if (userId) {
      whereClause.created_by = userId;
    }
    const dbCandidates = await prisma.candidate.findMany({
      where: whereClause,
      include: {
        experiences: true,
        education: true,
        skills: true,
        certifications: true,
        languages: true,
        projects: true,
      }
    });

    for (const c of dbCandidates) {
      const record = mapDbCandidateToRecord(c);
      const jId = c.job_id || 'pool';
      seenIds.add(record.id);
      result.push({ candidate: record, jobId: jId });
    }
  } catch (err) {
    console.warn('[Candidates] Prisma fetch all error:', err);
  }

  // 2. Add memory store candidates
  for (const [jId, list] of CANDIDATE_STORE.entries()) {
    for (const c of list) {
      if (!seenIds.has(c.id)) {
        if (organizationId && (c.organizationId || 'org-tasknera') !== organizationId) {
          continue;
        }
        if (!userId || c.uploadedBy === userId || c.createdBy === userId) {
          seenIds.add(c.id);
          result.push({ candidate: c, jobId: jId || c.jobId || 'pool' });
        }
      }
    }
  }

  return result;
}
