'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import MatchBadge from '@/components/evaluation/MatchBadge';
import ScoreCard from '@/components/evaluation/ScoreCard';
import RequirementTable from '@/components/evaluation/RequirementTable';
import DecisionTagDropdown from '@/components/evaluation/DecisionTagDropdown';
import HireIQDecisionIntelligence from '@/components/evaluation/HireIQDecisionIntelligence';
import CandidateExecutiveSummary from '@/components/evaluation/CandidateExecutiveSummary';
import {
  computeComprehensiveMatchScore,
  ComprehensiveMatchResult,
  isJunkRequirement,
  safeWordMatch,
  extractContextConcepts,
  areSkillsEquivalent,
} from '@/utils/requirementUtils';
import CandidateLinkModal from '@/components/CandidateLinkModal';
import HireIQCandidateCompareAndSubmitModal, { CandidateComparisonItem } from '@/components/evaluation/HireIQCandidateCompareAndSubmitModal';
import { RequirementStatus, ConfidenceLevel } from '@/types';
import { getResolvedBackendUrl } from '@/lib/backendUrl';


export interface CandidateEducation {
  degree: string;
  field?: string;
  institution: string;
  year?: string;
  details?: string;
}

export interface CandidateExperience {
  title: string;
  company: string;
  duration?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  description?: string;
  highlights?: string[];
  sourceEvidence?: string;
}

export interface CandidateProject {
  name: string;
  description: string;
  technologies?: string[];
  role?: string;
}

export interface CandidateCareerGap {
  fromCompany?: string;
  toCompany?: string;
  startDate: string;
  endDate: string;
  gapMonths: number;
  gapLabel: string;
}

export interface CandidateGapAnalysis {
  hasGap: boolean;
  totalGapMonths: number;
  gaps: CandidateCareerGap[];
  statusText: string;
}

export interface CandidateRecord {
  id: string;
  jobId: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  totalExperience: string;
  totalExperienceMonths?: number;
  totalExperienceYears?: number;
  currentTitle: string;
  currentCompany: string;
  summary?: string;
  professionalSummary?: string;
  skills: string[];
  education: CandidateEducation[];
  certifications: string[];
  experience: CandidateExperience[];
  gapAnalysis?: CandidateGapAnalysis;
  projects: CandidateProject[];
  languages: string[];
  rawText: string;
  parsingStatus: 'PARSED' | 'FAILED' | 'PROCESSING' | 'UPLOADED' | 'UPLOADING' | 'DUPLICATE';
  parsingMetadata: {
    fileName: string;
    fileType: string;
    pageCount: number;
    extractionMethod: string;
    ocrUsed: boolean;
    characterCount: number;
    wordCount: number;
  };
  errorMessage?: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  isDuplicate?: boolean;
  source?: string;
  uploadedAt: string;
  decision?: 'REVIEW' | 'SUBMIT' | 'REJECT' | string;
  matchScore?: number;
  atsScore?: number;
  matchLevel?: string;
  mandatoryCompliance?: any;
  evaluation?: any;
}

export interface UploadQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'PARSED' | 'FAILED' | 'DUPLICATE';
  progress: number;
  error?: string;
  candidateId?: string;
}

interface JobInfo {
  id: string;
  position: string;
  client: string;
  location?: string;
  work_mode?: string;
  requirementsCount: number;
  jd_text?: string;
  requirements?: Array<{ id: string; requirement: string; category?: string; weight?: number; is_mandatory?: boolean; source_evidence?: string; needs_verification?: boolean }>;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
};

const parseMonthsFromText = (text?: string | null): number => {
  if (!text) return 0;
  const t = text.trim();

  // Guard: If string is purely a 4-digit calendar year like "2019" or "2024", return 0
  if (/^\b(19\d\d|20\d\d)\b$/.test(t)) {
    return 0;
  }

  // Pattern 1: Explicit years/months like "7.2 yrs", "10.8 yrs", "6.5 years", "10y 10m", "• 7.2 yrs"
  const yrExplicitMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs|yr)\b/i);
  const moExplicitMatch = t.match(/(\d+)\s*(?:months?|mos|mo)\b/i);

  if (yrExplicitMatch) {
    const yrVal = parseFloat(yrExplicitMatch[1]);
    // Guard against calendar years mistakenly captured
    if (yrVal > 0 && yrVal < 80) {
      let total = yrVal * 12;
      if (moExplicitMatch) {
        const moVal = parseInt(moExplicitMatch[1], 10);
        if (moVal > 0 && moVal < 12) total += moVal;
      }
      return Math.round(total);
    }
  }

  if (moExplicitMatch) {
    const moVal = parseInt(moExplicitMatch[1], 10);
    if (moVal > 0 && moVal < 600) return moVal;
  }

  // Pattern 2: Date range like "Apr 2025 – Nov 2025" or "2021 – 2023" or "Sep 2019 – Present"
  const dateRangePattern = /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*(?:[–—\-]|to)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|Present|Current)\b/i;
  const match = t.match(dateRangePattern);
  if (match) {
    const parseYM = (str: string) => {
      const s = str.trim().toLowerCase();
      if (s === 'present' || s === 'current' || s === 'now') {
        const d = new Date();
        return { y: d.getFullYear(), m: d.getMonth() };
      }
      const mMap: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const m = s.match(/([a-z]{3})[a-z]*\.?\s+(\d{4})/i);
      if (m) {
        return { y: parseInt(m[2], 10), m: mMap[m[1].toLowerCase()] ?? 0 };
      }
      const y = s.match(/\b(19\d\d|20\d\d)\b/);
      if (y) return { y: parseInt(y[1], 10), m: 0 };
      return null;
    };
    const start = parseYM(match[1]);
    const end = parseYM(match[2]);
    if (start && end) {
      const diff = (end.y - start.y) * 12 + (end.m - start.m) + 1;
      return diff > 0 && diff < 600 ? diff : 0;
    }
  }

  return 0;
};

const getNumericExperienceDetails = (cand: { 
  totalExperience?: string | null; 
  totalExperienceMonths?: number; 
  totalExperienceYears?: number; 
  experience?: CandidateExperience[] 
}) => {
  let years = 0;
  let months = 0;

  // 1. Authoritative: Use candidate's verified totalExperienceYears (e.g. 10.8 for Naresh, 6.5 for Shaik)
  if (typeof cand.totalExperienceYears === 'number' && cand.totalExperienceYears > 0 && cand.totalExperienceYears < 80) {
    years = cand.totalExperienceYears;
    months = Math.round(years * 12);
  } else if (typeof cand.totalExperienceMonths === 'number' && cand.totalExperienceMonths > 0 && cand.totalExperienceMonths < 960) {
    months = cand.totalExperienceMonths;
    years = parseFloat((months / 12).toFixed(1));
  } else if (cand.totalExperience) {
    const m = String(cand.totalExperience).match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y\b)?/i);
    if (m) {
      const parsedY = parseFloat(m[1]);
      if (parsedY > 0 && parsedY < 80) {
        years = parsedY;
        months = Math.round(years * 12);
      }
    }
  }

  // 2. Fallback to parsing role durations only if years is still 0
  if (years === 0 && Array.isArray(cand.experience) && cand.experience.length > 0) {
    let roleMonths = 0;
    for (const exp of cand.experience) {
      const durMonths = parseMonthsFromText(exp.duration || (exp.startDate && exp.endDate ? `${exp.startDate} - ${exp.endDate}` : ''));
      if (durMonths > 0 && durMonths < 600) {
        roleMonths += durMonths;
      }
    }
    if (roleMonths > 0) {
      months = roleMonths;
      years = parseFloat((months / 12).toFixed(1));
    }
  }

  let badgeText = '0 yrs';
  let fullLabel = '0 Years';

  if (years > 0) {
    if (years < 1) {
      badgeText = `${months} mos`;
      fullLabel = `${months} Months`;
    } else {
      const yStr = years % 1 === 0 ? `${Math.round(years)}` : `${years}`;
      badgeText = `${yStr} yrs`;
      fullLabel = `${yStr} Years`;
    }
  } else if (cand.totalExperience && cand.totalExperience.trim() && !/^\d{4}$/.test(cand.totalExperience.trim())) {
    badgeText = cand.totalExperience;
    fullLabel = cand.totalExperience;
  }

  return {
    months,
    years,
    badgeText,
    subText: `${months} mos`,
    fullLabel,
  };
};


const parseDateToYMClient = (str: string) => {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  if (['present', 'current', 'now', 'till date', 'ongoing', 'active', 'continue', 'continuing'].includes(s)) {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  }
  const mMap: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  
  // Format: "Apr 2025", "April 2025", "Apr '25", "Apr 25"
  const mMatch = s.match(/([a-z]{3})[a-z]*\.?\s*'?(\d{2,4})/i);
  if (mMatch) {
    let year = parseInt(mMatch[2], 10);
    if (year < 100) year += 2000;
    return { y: year, m: mMap[mMatch[1].toLowerCase()] ?? 0 };
  }

  // Format: "04/2021", "4/2021", "04-2021", "04.2021"
  const slashMatch = s.match(/(\d{1,2})\s*[\/\.-]\s*(\d{2,4})/);
  if (slashMatch) {
    const month = Math.max(0, Math.min(11, parseInt(slashMatch[1], 10) - 1));
    let year = parseInt(slashMatch[2], 10);
    if (year < 100) year += 2000;
    return { y: year, m: month };
  }

  // Format: "2021/04", "2021-04"
  const yearFirstMatch = s.match(/(\d{4})\s*[\/\.-]\s*(\d{1,2})/);
  if (yearFirstMatch) {
    const year = parseInt(yearFirstMatch[1], 10);
    const month = Math.max(0, Math.min(11, parseInt(yearFirstMatch[2], 10) - 1));
    return { y: year, m: month };
  }

  // Format: "2021"
  const yMatch = s.match(/\b(19\d\d|20\d\d)\b/);
  if (yMatch) return { y: parseInt(yMatch[1], 10), m: 0 };

  return null;
};

const getCandidateCareerGaps = (cand: CandidateRecord): CandidateGapAnalysis => {
  if (cand.gapAnalysis && cand.gapAnalysis.hasGap && cand.gapAnalysis.gaps && cand.gapAnalysis.gaps.length > 0) {
    const hasMeaningfulGaps = cand.gapAnalysis.gaps.every(g => g.fromCompany !== 'Role' && g.toCompany !== 'Role');
    if (hasMeaningfulGaps) {
      return cand.gapAnalysis;
    }
  }

  const exps = cand.experience || [];
  const dated: { exp?: CandidateExperience; title?: string; company?: string; start: { y: number; m: number }; end: { y: number; m: number }; rawStart: string; rawEnd: string }[] = [];

  for (const exp of exps) {
    let startStr = exp.startDate;
    let endStr = exp.endDate;

    if (!startStr && exp.duration) {
      const rangeMatch = exp.duration.match(/\b((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}[\/\.-]\d{2,4}|\d{4}))\s*(?:[–—\-\~]|to)\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}[\/\.-]\d{2,4}|\d{4}|Present|Current|Now|Ongoing))\b/i);
      if (rangeMatch) {
        startStr = rangeMatch[1].trim();
        endStr = rangeMatch[2].trim();
      }
    }

    if (!startStr && exp.sourceEvidence) {
      const rangeMatch = exp.sourceEvidence.match(/\b((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}[\/\.-]\d{2,4}|\d{4}))\s*(?:[–—\-\~]|to)\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}[\/\.-]\d{2,4}|\d{4}|Present|Current|Now|Ongoing))\b/i);
      if (rangeMatch) {
        startStr = rangeMatch[1].trim();
        endStr = rangeMatch[2].trim();
      }
    }

    if (startStr) {
      const s = parseDateToYMClient(startStr);
      const e = parseDateToYMClient(endStr || 'Present');
      if (s && e) {
        dated.push({
          exp,
          title: exp.title,
          company: exp.company,
          start: s,
          end: e,
          rawStart: startStr,
          rawEnd: endStr || 'Present'
        });
      }
    }
  }

  // Fallback: Scan ONLY the EXPERIENCE section of rawText
  if (dated.length < 2 && cand.rawText) {
    const expMatch = cand.rawText.match(/(?:PROFESSIONAL\s+EXPERIENCE|WORK\s+EXPERIENCE|EMPLOYMENT\s+HISTORY|EXPERIENCE)[\s\S]*?(?=(?:TECHNICAL\s+SKILLS|SKILLS|PROJECTS|EDUCATION|ACADEMICS|CERTIFICATIONS|ACHIEVEMENTS|LANGUAGES|ADDITIONAL\s+INFORMATION)|$)/i);
    const expSegment = expMatch ? expMatch[0] : '';
    if (expSegment) {
      const rangeRegex = /\b((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}[\/\.-]\d{2,4}|\d{4}))\s*(?:[–—\-\~]|to)\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}[\/\.-]\d{2,4}|\d{4}|Present|Current|Now|Ongoing))\b/ig;
      let match: RegExpExecArray | null;
      const seenSpans = new Set<string>();

      while ((match = rangeRegex.exec(expSegment)) !== null) {
        const sStr = match[1].trim();
        const eStr = match[2].trim();
        const spanKey = `${sStr.toLowerCase()}_${eStr.toLowerCase()}`;
        if (seenSpans.has(spanKey)) continue;
        seenSpans.add(spanKey);

        const s = parseDateToYMClient(sStr);
        const e = parseDateToYMClient(eStr);
        if (s && e && s.y >= 1990 && e.y >= 1990) {
          const matchIndex = match.index;
          const lineStart = expSegment.lastIndexOf('\n', matchIndex) + 1;
          const lineEnd = expSegment.indexOf('\n', matchIndex + match[0].length);
          const surroundingLine = expSegment.substring(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
          const cleanedTitle = surroundingLine.replace(match[0], '').replace(/[|•–—]/g, ' ').trim();

          dated.push({
            title: cleanedTitle || 'Employment Period',
            company: 'Previous Position',
            start: s,
            end: e,
            rawStart: sStr,
            rawEnd: eStr
          });
        }
      }
    }
  }

  if (dated.length <= 1) {
    return {
      hasGap: false,
      totalGapMonths: 0,
      gaps: [],
      statusText: 'Continuous work history (No gap identified)'
    };
  }

  dated.sort((a, b) => (a.start.y * 12 + a.start.m) - (b.start.y * 12 + b.start.m));

  const foundGaps: CandidateCareerGap[] = [];
  let totalGapMonths = 0;

  for (let i = 0; i < dated.length - 1; i++) {
    const prev = dated[i];
    const next = dated[i + 1];
    const prevEnd = prev.end.y * 12 + prev.end.m;
    const nextStart = next.start.y * 12 + next.start.m;
    const diff = nextStart - prevEnd;

    if (diff >= 2) {
      const gapYears = (diff / 12).toFixed(1);
      const prevComp = prev.company && prev.company !== 'Role' ? prev.company : (prev.title || 'Previous Position');
      const nextComp = next.company && next.company !== 'Role' ? next.company : (next.title || 'Next Position');
      const gapLabel = diff >= 12
        ? `${gapYears} yrs (${diff} mos) gap between ${prevComp} and ${nextComp}`
        : `${diff} mos gap between ${prevComp} and ${nextComp}`;

      foundGaps.push({
        fromCompany: prevComp,
        toCompany: nextComp,
        startDate: prev.rawEnd,
        endDate: next.rawStart,
        gapMonths: diff,
        gapLabel
      });
      totalGapMonths += diff;
    }
  }

  if (foundGaps.length === 0) {
    return {
      hasGap: false,
      totalGapMonths: 0,
      gaps: [],
      statusText: 'Continuous work history (No gap identified)'
    };
  }

  return {
    hasGap: true,
    totalGapMonths,
    gaps: foundGaps,
    statusText: `${foundGaps.length} career gap${foundGaps.length > 1 ? 's' : ''} identified (${totalGapMonths} mos total)`
  };
};

const getEffectiveSkills = (cand: CandidateRecord, jobReqs?: any[]): string[] => {
  const existing = Array.isArray(cand.skills) ? cand.skills : [];
  const text = `${cand.summary || ''} ${cand.professionalSummary || ''} ${cand.rawText || ''}`;
  const catalog = [
    'React', 'React.js', 'Next.js', 'TypeScript', 'JavaScript', 'HTML5', 'HTML', 'CSS3', 'CSS', 'Tailwind CSS',
    'Tailwind', 'Redux', 'Node.js', 'Express', 'Express.js', 'Python', 'Java', 'FastAPI', 'Django', 'Flask',
    'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Supabase', 'Firebase', 'AWS', 'Docker', 'Git', 'GitHub',
    'REST APIs', 'REST API', 'Prisma ORM', 'Prisma', 'GraphQL', 'Microservices', 'Postman', 'Vercel', 'Figma',
    'Azure', 'GCP', 'Kubernetes', 'CI/CD', 'Jenkins', 'Terraform', 'Angular', 'Vue.js', 'Vue', 'SolidJS',
    'Svelte', 'WebRTC', 'Socket.io', 'NestJS', 'Go', 'Golang', 'Rust', 'Ruby', 'PHP', 'Laravel',
    'C#', 'C++', 'Unity', 'Unreal', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-Learn', 'D3.js',
    'Three.js', 'OpenGL', 'WebAssembly', 'Electron', 'React Native', 'Flutter', 'Swift', 'Kotlin', 'Android', 'iOS',
    'Salesforce', 'Apex', 'LWC', 'Lightning Web Components', 'Flow Automation', 'Flows', 'Process Builder',
    'Manufacturing Cloud', 'Sales Cloud', 'Service Cloud', 'Marketing Cloud', 'Experience Cloud', 'Health Cloud',
    'Financial Services Cloud', 'Visualforce', 'SOQL', 'SOSL', 'Aura Components', 'OmniStudio', 'Vlocity', 'CPQ',
    'Platform Developer', 'Platform Developer I', 'Platform Developer II', 'Salesforce Certified Administrator',
    'Salesforce Admin', 'Agile', 'Scrum', 'Sprint Execution', 'Jira', 'Confluence', 'Snowflake', 'Databricks',
    'SAP', 'Workday', 'PowerBI', 'Tableau'
  ];
  const matched = new Set<string>(existing);
  for (const s of catalog) {
    const esc = s.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
    if (new RegExp(`(?:^|[^a-zA-Z0-9_])${esc}(?:[^a-zA-Z0-9_]|$)`, 'i').test(text)) {
      matched.add(s);
    }
  }

  // Also extract keywords mentioned in job requirements if present in CV text
  if (jobReqs && jobReqs.length > 0) {
    for (const r of jobReqs) {
      const phrase = (r.requirement || r.text || '').trim();
      if (phrase.length > 2) {
        const clean = phrase.replace(/(\d+\+?\s*years?|experience|minimum|required|hands-on|relevant|professional|industry|proven|in|with|of|for|and|to)/gi, ' ').trim();
        const tokens = clean.split(/[\s,;/()\[\]{}*+?^$|\\]+/).filter((t: string) => t.length > 2);
        for (const tok of tokens) {
          if (tok.length >= 3) {
            try {
              const escTok = tok.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
              if (new RegExp(`(?:^|[^a-zA-Z0-9_])${escTok}(?:[^a-zA-Z0-9_]|$)`, 'i').test(text)) {
                matched.add(tok);
              }
            } catch (err) {
              // Ignore any malformed pattern
            }
          }
        }
      }
    }
  }

  return Array.from(matched);
};

const avatarColor = (name?: string | null) => {
  const safeName = (name || 'Candidate').trim();
  const colors = [
    'bg-brand-orange-pale text-brand-orange',
    'bg-blue-50 text-blue-600',
    'bg-emerald-50 text-emerald-600',
    'bg-purple-50 text-purple-600',
    'bg-amber-50 text-amber-600',
    'bg-rose-50 text-rose-600',
    'bg-teal-50 text-teal-600',
  ];
  return colors[Math.abs(safeName.charCodeAt(0) || 0) % colors.length];
};


const statusBadge = (status: string) => {
  switch (status) {
    case 'PARSED':
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        label: 'Parsed & Scored',
      };
    case 'DUPLICATE':
      return {
        bg: 'bg-amber-50 text-amber-800 border-amber-300',
        dot: 'bg-amber-500',
        label: 'Duplicate (Skipped)',
      };
    case 'PROCESSING':
      return {
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        dot: 'bg-blue-500 animate-pulse',
        label: 'Processing CV',
      };
    case 'FAILED':
      return {
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
        label: 'Parsing Failed',
      };
    default:
      return {
        bg: 'bg-slate-50 text-slate-700 border-slate-200',
        dot: 'bg-slate-400',
        label: status || 'Uploaded',
      };
  }
};

export default function JobCandidatesPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuth();
  const jobId = (params?.id as string) || 'jd-1';

  const [job, setJob] = useState<JobInfo | null>(null);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Bulk Upload State
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newlyAddedCandidateId, setNewlyAddedCandidateId] = useState<string | null>(null);
  const candidatesTableRef = useRef<HTMLDivElement>(null);

  const scrollToCandidateTable = (candidateId?: string) => {
    setShowUploadZone(false);
    if (candidateId) {
      setNewlyAddedCandidateId(candidateId);
      setTimeout(() => setNewlyAddedCandidateId(null), 5000);
    }
    setTimeout(() => {
      const tableEl = document.getElementById('candidates-table') || candidatesTableRef.current;
      if (tableEl) {
        tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Filters, Sort & Selected Candidate Drawer
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'STRONG_MATCH' | 'GOOD_MATCH' | 'LOW_FIT' | 'PARSED' | 'FAILED'>('ALL');
  const [sortField, setSortField] = useState<'score' | 'date' | 'name' | 'experience'>('score');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'decision' | 'summary'>('decision');
  const [isMounted, setIsMounted] = useState(false);

  // Manual Candidate Decision Tags ('REVIEW' | 'SUBMIT' | 'REJECT')
  const [candidateDecisions, setCandidateDecisions] = useState<Record<string, 'REVIEW' | 'SUBMIT' | 'REJECT'>>({});

  // Inline Company & Position editing states
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [editCompanyInput, setEditCompanyInput] = useState('');
  const [isEditingPosition, setIsEditingPosition] = useState(false);
  const [editPositionInput, setEditPositionInput] = useState('');
  const [isCandidateLinkOpen, setIsCandidateLinkOpen] = useState(false);

  // Candidate Selection for Comparison & Client Submission
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [compareModalTab, setCompareModalTab] = useState<'compare' | 'submit'>('compare');

  const handleToggleSelectCandidate = (candId: string) => {
    setSelectedCandidateIds(prev =>
      prev.includes(candId) ? prev.filter(id => id !== candId) : [...prev, candId]
    );
  };

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined' && window.location.hash === '#candidates-table') {
      setTimeout(() => {
        const tableEl = document.getElementById('candidates-table') || candidatesTableRef.current;
        if (tableEl) {
          tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 400);
    }
  }, []);

  // Lock background window scroll when candidate modal drawer is open
  useEffect(() => {
    if (selectedCandidate) {
      const prevBodyOverflow = document.body.style.overflow;
      const prevHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevBodyOverflow;
        document.documentElement.style.overflow = prevHtmlOverflow;
      };
    }
  }, [selectedCandidate]);

  const backendUrl = getResolvedBackendUrl();

  // Lazy fetch full candidate record (rawText, projects, certifications, etc.) when drawer is opened
  useEffect(() => {
    if (!selectedCandidate?.id || !jobId) return;
    // Only fetch if rawText is missing (since candidate list endpoint omits heavy raw_text and deep relations)
    if (selectedCandidate.rawText === undefined || selectedCandidate.rawText === '') {
      const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
      fetch(`${backendUrl}/jobs/${jobId}/candidates/${selectedCandidate.id}`, {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
      })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data?.candidate) {
            const freshScore = Math.round(data.candidate.atsScore ?? data.candidate.matchScore ?? 0);
            setSelectedCandidate((prev: any) => {
              if (prev && prev.id === selectedCandidate.id) {
                return {
                  ...prev,
                  ...data.candidate,
                  matchScore: freshScore > 0 ? freshScore : prev.matchScore,
                  atsScore: freshScore > 0 ? freshScore : prev.atsScore,
                };
              }
              return prev;
            });
            if (freshScore > 0) {
              setCandidates((prev) =>
                prev.map((c) =>
                  c.id === selectedCandidate.id
                    ? { ...c, matchScore: freshScore, atsScore: freshScore }
                    : c
                )
              );
            }
          }
        })
        .catch(() => {});
    }
  }, [selectedCandidate?.id, jobId, token, backendUrl]);

  // Helper to get effective decision tag for a candidate ('REVIEW' | 'SUBMIT' | 'REJECT')
  const getCandidateDecision = useCallback((c: any): 'REVIEW' | 'SUBMIT' | 'REJECT' => {
    if (!c) return 'REVIEW';
    if (c.id && candidateDecisions[c.id]) return candidateDecisions[c.id];
    const score = Number(c.atsScore ?? c.matchScore ?? c.evaluation?.atsScore ?? c.evaluation?.score);
    if (Number.isFinite(score)) return score >= 80 ? 'SUBMIT' : score >= 60 ? 'REVIEW' : 'REJECT';
    const raw = String(c.decision || c.recommendation || '').toUpperCase();
    if (raw === 'ACCEPT' || raw === 'SUBMIT') return 'SUBMIT';
    if (raw === 'REJECT' || raw === 'DO NOT SUBMIT') return 'REJECT';
    return 'REVIEW';
  }, [candidateDecisions, jobId]);

  // Handler to update candidate decision tag manually via dropdown
  const handleUpdateDecision = async (candidateId: string, newDecision: 'REVIEW' | 'SUBMIT' | 'REJECT') => {
    setCandidateDecisions(prev => ({ ...prev, [candidateId]: newDecision }));
    setCandidates(prev => prev.map(cand => (cand.id === candidateId ? { ...cand, decision: newDecision } : cand)));
    if (selectedCandidate?.id === candidateId) {
      setSelectedCandidate((prev: any) => (prev ? { ...prev, decision: newDecision } : null));
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`tasknera_decision_${jobId}_${candidateId}`, newDecision);
        localStorage.setItem(`tasknera_decision_${candidateId}`, newDecision);

        // Synchronize with recruitment pipeline and client portal
        const targetCand = candidates.find(c => c.id === candidateId);
        const resolvedClient = job?.client || (job as any)?.company || localStorage.getItem(`tasknera_company_${jobId}`) || '';

        // Update pipeline stage
        const rawPipe = localStorage.getItem('tasknera_recruitment_pipeline_v1');
        let pipeList: any[] = [];
        if (rawPipe) {
          try {
            pipeList = JSON.parse(rawPipe);
          } catch {}
        }
        if (Array.isArray(pipeList)) {
          const newStage = newDecision === 'SUBMIT' ? 'Shortlisted' : 'Screening';
          const existingIdx = pipeList.findIndex(c => c.id === candidateId || (targetCand?.name && c.name === targetCand.name));
          if (existingIdx >= 0) {
            pipeList[existingIdx] = { ...pipeList[existingIdx], stage: newStage, decision: newDecision };
          } else if (targetCand) {
            pipeList.unshift({
              id: candidateId,
              name: targetCand.name || 'Candidate',
              role: targetCand.currentTitle || (targetCand as any).role || job?.position || 'Software Engineer',
              score: targetCand.atsScore || targetCand.matchScore || 80,
              stage: newStage,
              requisitionId: jobId,
              requisitionTitle: job?.position || 'Requisition Role',
              decision: newDecision,
              recruiterName: user?.name || user?.email || 'Recruiter',
            });
          }
          localStorage.setItem('tasknera_recruitment_pipeline_v1', JSON.stringify(pipeList));
        }

        // Update client portal candidates
        if (resolvedClient && targetCand) {
          const clientKey = resolvedClient.trim().replace(/\s+/g, '_');
          const portalStorageKey = `tasknera_portal_cands_${clientKey}`;
          const rawPortal = localStorage.getItem(portalStorageKey);
          let portalCands = rawPortal ? JSON.parse(rawPortal) : [];
          if (!Array.isArray(portalCands)) portalCands = [];

          const existingPortalIdx = portalCands.findIndex((c: any) => c.id === candidateId || c.name === targetCand.name);
          if (newDecision === 'SUBMIT') {
            const score = targetCand.atsScore || targetCand.matchScore || 80;
            const newPortalCand = {
              id: candidateId,
              name: targetCand.name || 'Candidate',
              email: targetCand.email || `${(targetCand.name || 'cand').toLowerCase().replace(/[^a-z0-9]/g, '.')}@candidate-profile.com`,
              phone: targetCand.phone || '+1 (555) 234-5678',
              currentTitle: targetCand.currentTitle || 'Software Engineer',
              currentCompany: targetCand.currentCompany || 'Verified Candidate',
              totalExperience: targetCand.totalExperience || '5+ Years',
              location: targetCand.location || 'Remote / Hybrid',
              summary: targetCand.summary || `Candidate screened and shortlisted for ${job?.position || 'role'}. Deterministic score: ${score}%.`,
              skills: targetCand.skills || ['Technical Proficiency'],
              atsScore: score,
              matchLevel: score >= 85 ? 'EXCELLENT MATCH' : 'STRONG MATCH',
              mandatoryPassed: true,
              currentStatus: (targetCand as any).isRecruiterApproved === true ? 'Shared with Client' : 'Active Screening',
              lastUpdatedDate: 'Just now',
              hasResume: true,
              resumeFileName: targetCand.fileName || `${(targetCand.name || 'candidate').replace(/\s+/g, '_')}_CV.pdf`,
              screeningNote: `Agency Screening Verdict: Mandatory requirements satisfied. Shortlisted by recruiter.`,
              jobId: jobId,
              jobTitle: job?.position || 'Requisition Role',
              decision: 'SUBMIT',
              screeningEvidence: (targetCand as any).evidenceSnippets || (targetCand as any).evaluation?.evidence || [],
              isRecruiterApproved: (targetCand as any).isRecruiterApproved === true,
              recruiterApprovalStatus: (targetCand as any).isRecruiterApproved === true ? 'APPROVED' : 'PENDING_APPROVAL',
              recruiterApprovedBy: (targetCand as any).recruiterApprovedBy,
              recruiterApprovedAt: (targetCand as any).recruiterApprovedAt,
            };

            if (existingPortalIdx >= 0) {
              portalCands[existingPortalIdx] = {
                ...portalCands[existingPortalIdx],
                ...newPortalCand,
                currentStatus: (targetCand as any).isRecruiterApproved === true ? 'Shared with Client' : (portalCands[existingPortalIdx].isRecruiterApproved ? 'Shared with Client' : 'Active Screening')
              };
            } else {
              portalCands.unshift(newPortalCand);
            }

            // Log activity
            const actStorageKey = `tasknera_portal_activities_${clientKey}`;
            const rawActs = localStorage.getItem(actStorageKey);
            let portalActs = rawActs ? JSON.parse(rawActs) : [];
            if (!Array.isArray(portalActs)) portalActs = [];
            portalActs.unshift({
              id: `act-${Date.now()}`,
              title: `Candidate Shortlisted: ${targetCand.name}`,
              detail: `${user?.name || 'Agency Recruiter'} shortlisted ${targetCand.name} for ${job?.position || 'open position'} with ATS Score ${score}%. Profile submitted for client review.`,
              actor: user?.name || 'Agency Recruiter',
              actorRole: 'AGENCY',
              timestamp: 'Just now',
              badge: 'Shortlisted',
            });
            localStorage.setItem(actStorageKey, JSON.stringify(portalActs.slice(0, 40)));
          } else {
            if (existingPortalIdx >= 0) {
              portalCands[existingPortalIdx] = { ...portalCands[existingPortalIdx], currentStatus: 'Active Screening' };
            }
          }
          localStorage.setItem(portalStorageKey, JSON.stringify(portalCands));
        }

        window.dispatchEvent(new CustomEvent('tasknera_portal_sync', { detail: { candidateId, decision: newDecision } }));
      } catch (err) {
        console.warn('Sync error in handleUpdateDecision:', err);
      }
    }

    try {
      const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
      await fetch(`${backendUrl}/jobs/${jobId}/candidates/${candidateId}/decision`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ decision: newDecision })
      });
    } catch (e) {
      console.warn('Could not persist decision to backend:', e);
    }
  };

  // Handler to delete a candidate
  const handleDeleteCandidate = async (candidateId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to remove this candidate?')) return;

    try {
      const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
      
      // Delete candidate from job requisition and platform
      const res = await fetch(`${backendUrl}/jobs/${jobId}/candidates/${candidateId}`, {
        method: 'DELETE',
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });

      // Also call /candidates/:candidateId to ensure global candidate pool is also synchronized
      if (!res.ok) {
        await fetch(`${backendUrl}/candidates/${candidateId}`, {
          method: 'DELETE',
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          }
        }).catch(() => null);
      }

      setCandidates(prev => {
        const updated = prev.filter(c => c.id !== candidateId);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`tasknera_candidates_${jobId}`, JSON.stringify(updated));
          localStorage.setItem(`tasknera_candidates_count_${jobId}`, String(updated.length));
          const created = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
          const updatedCreated = created.map((cj: any) => {
            if (String(cj.id) === String(jobId)) {
              return { ...cj, candidatesCount: updated.length, candidates: updated.length };
            }
            return cj;
          });
          localStorage.setItem('tasknera_created_jobs', JSON.stringify(updatedCreated));
          try {
            localStorage.removeItem(`tasknera_decision_${jobId}_${candidateId}`);
            localStorage.removeItem(`tasknera_decision_${candidateId}`);
          } catch {}
        }
        return updated;
      });

      if (selectedCandidate?.id === candidateId) {
        setSelectedCandidate(null);
      }
    } catch (err) {
      console.error('Failed to delete candidate:', err);
    }
  };


  // Handler to persist edited company name
  const handleSaveCompany = async (newCompany: string) => {
    const trimmed = newCompany.trim();
    if (!trimmed) return;
    setJob((prev: any) => (prev ? { ...prev, client: trimmed } : null));
    setIsEditingCompany(false);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`tasknera_company_${jobId}`, trimmed);
        const specificJob = { ...(job || {}), id: jobId, client: trimmed };
        localStorage.setItem(`tasknera_job_${jobId}`, JSON.stringify(specificJob));

        const createdJobs = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
        const updatedCreated = createdJobs.map((cj: any) =>
          String(cj.id) === String(jobId) ? { ...cj, client: trimmed } : cj
        );
        localStorage.setItem('tasknera_created_jobs', JSON.stringify(updatedCreated));
      } catch {}
    }

    try {
      const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
      await fetch(`${backendUrl}/jobs/${jobId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ client: trimmed })
      });
    } catch (e) {
      console.warn('Could not persist company name to backend:', e);
    }
  };

  // Handler to persist edited position title
  const handleSavePosition = async (newPosition: string) => {
    const trimmed = newPosition.trim();
    if (!trimmed) return;
    setJob((prev: any) => (prev ? { ...prev, position: trimmed } : null));
    setIsEditingPosition(false);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`tasknera_position_${jobId}`, trimmed);
        const specificJob = { ...(job || {}), id: jobId, position: trimmed };
        localStorage.setItem(`tasknera_job_${jobId}`, JSON.stringify(specificJob));

        const createdJobs = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
        const updatedCreated = createdJobs.map((cj: any) =>
          String(cj.id) === String(jobId) ? { ...cj, position: trimmed } : cj
        );
        localStorage.setItem('tasknera_created_jobs', JSON.stringify(updatedCreated));
      } catch {}
    }

    try {
      const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
      await fetch(`${backendUrl}/jobs/${jobId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({ position: trimmed })
      });
    } catch (e) {
      console.warn('Could not persist position title to backend:', e);
    }
  };

  // ── Fetch Job Details & Candidates from Backend ─────────────────────────────
  const fetchJobAndCandidates = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);

      // 1. Locate Job from local stores, cache, or sample mappings
      let localJob: any = null;
      let cachedCompany = '';
      let cachedPosition = '';

      if (typeof window !== 'undefined') {
        try {
          cachedCompany = localStorage.getItem(`tasknera_company_${jobId}`) || '';
          cachedPosition = localStorage.getItem(`tasknera_position_${jobId}`) || '';

          const directJob = JSON.parse(localStorage.getItem(`tasknera_job_${jobId}`) || 'null');
          if (directJob) localJob = directJob;

          if (!localJob) {
            const allLocal = JSON.parse(localStorage.getItem('tasknera_all_jobs') || '[]');
            localJob = allLocal.find((j: any) => String(j.id) === String(jobId));
          }

          if (!localJob) {
            const createdJobs = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
            localJob = createdJobs.find((j: any) => String(j.id) === String(jobId));
            if (!localJob && createdJobs.length > 0 && jobId.startsWith('job-')) {
              localJob = createdJobs[0];
            }
          }

          if (!localJob) {
            const savedJobs = JSON.parse(localStorage.getItem('tasknera_jobs') || '[]');
            localJob = savedJobs.find((j: any) => String(j.id) === String(jobId));
          }

          if (!localJob) {
            const atsJobs = JSON.parse(localStorage.getItem('tasknera_ats_jobs') || '[]');
            localJob = atsJobs.find((j: any) => String(j.id) === String(jobId));
            if (!localJob && atsJobs.length > 0 && jobId.startsWith('job-')) {
              localJob = atsJobs[0];
            }
          }

          if (!localJob) {
            const parsedJd = JSON.parse(localStorage.getItem('tasknera_parsed_jd') || 'null');
            if (parsedJd?.company || parsedJd?.client || parsedJd?.companyName) {
              localJob = {
                client: parsedJd.company || parsedJd.client || parsedJd.companyName,
                position: parsedJd.position || parsedJd.jobTitle || parsedJd.positionTitle,
                ...parsedJd
              };
            }
          }
        } catch {}
      }

      // Sample Fallback Presets if not found in localStorage
      const samplePresets: Record<string, Partial<JobInfo>> = {
        'job-sample-1': {
          position: 'Full Stack Engineer-(Go and React)',
          client: 'IBM',
          location: 'Bangalore, Onsite (locals only)',
          work_mode: 'Onsite',
        },
        'job-sample-2': {
          position: 'Salesforce Manufacturing Cloud Developer',
          client: 'Hexaware',
          location: 'Noida (Onsite)',
          work_mode: 'Onsite',
        },
        'job-sample-3': {
          position: 'Full-Stack Developer (MERN + AI)',
          client: 'the Role',
          location: 'Mumbai, Maharashtra, India',
          work_mode: 'Hybrid',
        },
        'job-sample-4': {
          position: 'Salesforce Manufacturing Cloud Developer',
          client: 'Hexaware',
          location: 'Noida (Onsite)',
          work_mode: 'Onsite',
        },
      };

      const preset = samplePresets[jobId] || (
        jobId.includes('react') || jobId.includes('fullstack') || jobId.includes('golang')
          ? samplePresets['job-sample-1']
          : jobId.includes('mern')
          ? samplePresets['job-sample-3']
          : jobId.includes('salesforce')
          ? samplePresets['job-sample-2']
          : undefined
      );

      const resolvedLocalTitle = cachedPosition || localJob?.title || localJob?.position || preset?.position;
      const dynamicTitle = resolvedLocalTitle || (
        jobId.includes('-') && !jobId.startsWith('job-sample') && jobId.length > 20
          ? 'Job Evaluation Pipeline'
          : jobId.replace(/[_-]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
      );

      const resolvedLocalClient = cachedCompany || localJob?.client || localJob?.company || localJob?.companyName || preset?.client || 'Hiring Organization';

      let jobInfo: JobInfo = {
        id: jobId,
        position: dynamicTitle,
        client: resolvedLocalClient,
        location: localJob?.location || preset?.location || 'Remote / Hybrid',
        work_mode: localJob?.mode || localJob?.work_mode || localJob?.workMode || preset?.work_mode || 'Hybrid',
        requirementsCount: localJob?.requirements?.length || 8,
        jd_text: localJob?.jd_text || dynamicTitle,
        requirements: localJob?.requirements || [],
      };

      try {
        const jobRes = await fetch(`${backendUrl}/jobs/${jobId}`, {
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          }
        });
        if (jobRes.ok) {
          const jobData = await jobRes.json();
          const j = jobData.job || jobData.data;
          if (j) {
            const isGenericClient = !j.client || j.client === 'Enterprise Client' || j.client === 'Client Organization' || j.client === 'Company Requisition';
            const isGenericPosition = !j.position || /^Job \d+$/i.test(j.position) || j.position === 'Job Position' || j.position.startsWith('Job 1788');

            const finalPosition = (!isGenericPosition && j.position)
              ? j.position
              : (resolvedLocalTitle || jobInfo.position);

            const finalClient = (!isGenericClient && j.client)
              ? j.client
              : (resolvedLocalClient !== 'Hiring Organization' ? resolvedLocalClient : (j.client || jobInfo.client));

            jobInfo = {
              id: j.id || jobId,
              position: finalPosition,
              client: finalClient,
              location: j.location || jobInfo.location,
              work_mode: j.work_mode || j.workMode || jobInfo.work_mode,
              requirementsCount: j.requirements?.length || jobInfo.requirementsCount,
              jd_text: j.jd_text || j.position || jobInfo.jd_text,
              requirements: (j.requirements && j.requirements.length > 0) ? j.requirements : (localJob?.requirements || jobInfo.requirements),
            };
          }
        }
      } catch {
        console.warn('Backend unavailable, using cached job profile');
      }
      setJob(jobInfo);

      // 2. Fetch Candidates
      let fetchedCandidates: any[] = [];
      let backendSuccessful = false;

      // 2a. Try Next.js same-origin API route (/api/jobs/${jobId}/candidates)
      try {
        const nextApiRes = await fetch(`/api/jobs/${jobId}/candidates`, {
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          }
        });
        if (nextApiRes.ok) {
          const nextData = await nextApiRes.json();
          if (Array.isArray(nextData.candidates)) {
            fetchedCandidates = nextData.candidates;
            backendSuccessful = true;
          }
        }
      } catch {}

      // 2b. If not loaded or empty, try resolved backend URL
      if (!backendSuccessful) {
        try {
          const candRes = await fetch(`${backendUrl}/jobs/${jobId}/candidates`, {
            headers: {
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            }
          });
          if (candRes.ok) {
            const candData = await candRes.json();
            const list = Array.isArray(candData.candidates) ? candData.candidates : [];
            if (list.length > 0 || fetchedCandidates.length === 0) {
              fetchedCandidates = list;
              backendSuccessful = true;
            }
          }
        } catch {}
      }

      // 2c. Merge with localStorage cache
      let localSaved: any[] = [];
      try {
        localSaved = JSON.parse(localStorage.getItem(`tasknera_candidates_${jobId}`) || '[]');
      } catch {}

      // 2d. Check global public applied candidates for this job
      let publicApplied: any[] = [];
      try {
        const allPublic = JSON.parse(localStorage.getItem('tasknera_public_applied_candidates') || '[]');
        publicApplied = allPublic.filter((c: any) =>
          String(c.jobId) === String(jobId) ||
          String(c.job_id) === String(jobId) ||
          (jobInfo.id && String(c.jobId) === String(jobInfo.id))
        );
      } catch {}

      // Combine and deduplicate across all sources
      const candidateMap = new Map<string, any>();
      for (const c of localSaved) {
        const key = (c.email && c.email.trim().toLowerCase()) || (c.fileHash && c.fileHash.trim()) || c.id;
        if (key) candidateMap.set(key, c);
      }
      for (const c of publicApplied) {
        const key = (c.email && c.email.trim().toLowerCase()) || (c.fileHash && c.fileHash.trim()) || c.id;
        if (key) {
          candidateMap.set(key, { ...(candidateMap.get(key) || {}), ...c });
        }
      }
      for (const c of fetchedCandidates) {
        const key = (c.email && c.email.trim().toLowerCase()) || (c.fileHash && c.fileHash.trim()) || c.id;
        if (key) {
          candidateMap.set(key, { ...(candidateMap.get(key) || {}), ...c });
        }
      }

      const finalList = Array.from(candidateMap.values());
      setCandidates(finalList);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`tasknera_candidates_${jobId}`, JSON.stringify(finalList));
          localStorage.setItem(`tasknera_candidates_count_${jobId}`, String(finalList.length));
        } catch {}
      }
    } catch (err: any) {
      console.error('Error loading candidates:', err);
      setErrorMsg(err.message || 'Unable to connect to backend server');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, jobId, token]);

  useEffect(() => {
    fetchJobAndCandidates();
  }, [fetchJobAndCandidates]);

  // Real-time synchronization when candidates apply via public link or in another tab
  useEffect(() => {
    const handleCandidatesUpdate = (event: any) => {
      if (!event.detail?.jobId || String(event.detail.jobId) === String(jobId)) {
        fetchJobAndCandidates();
      }
    };
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `tasknera_candidates_${jobId}` || e.key === 'tasknera_public_applied_candidates') {
        fetchJobAndCandidates();
      }
    };

    window.addEventListener('tasknera_candidates_updated', handleCandidatesUpdate as EventListener);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('tasknera_candidates_updated', handleCandidatesUpdate as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [fetchJobAndCandidates, jobId]);

  // Lock background scroll when modal drawer is open
  useEffect(() => {
    if (selectedCandidate) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedCandidate]);

  // ── Compute Match Scores & Rank Candidates (Unique candidates only) ─────────
  const uniqueCandidates = useMemo(() => {
    const seen = new Set<string>();
    const list: CandidateRecord[] = [];
    for (const c of candidates) {
      const key = (c.email && c.email.trim().toLowerCase()) ||
                  (c.fileHash && c.fileHash.trim()) ||
                  (c.fileName && c.fileName.trim().toLowerCase()) ||
                  (c.name && c.name.trim().toLowerCase()) ||
                  c.id;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(c);
      }
    }
    return list;
  }, [candidates]);

  const candidatesWithMatch = useMemo(() => {
    return uniqueCandidates.map(c => {
      const effectiveCandidateSkills = getEffectiveSkills(c, job?.requirements);
      const computedGapAnalysis = getCandidateCareerGaps(c);

      const matchResult = computeComprehensiveMatchScore(
        {
          skills: effectiveCandidateSkills,
          totalExperience: c.totalExperience || c.totalExperienceYears,
          totalExperienceYears: c.totalExperienceYears,
          education: c.education || [],
          rawText: c.rawText || '',
          summary: c.summary || c.professionalSummary || '',
          currentTitle: c.currentTitle || '',
          certifications: c.certifications || [],
          experience: c.experience || [],
          parsingMetadata: c.parsingMetadata,
          parsingStatus: c.parsingStatus,
        },
        {
          position: job?.position || 'Job Position',
          jd_text: job?.jd_text || job?.position || '',
          requirements: (job?.requirements || []).map(r => ({
            id: r.id,
            requirement: r.requirement,
            category: r.category,
            is_mandatory: r.is_mandatory,
            weight: r.weight,
            source_evidence: (r as any).source_evidence || (r as any).sourceEvidence,
            sourceEvidence: (r as any).source_evidence || (r as any).sourceEvidence,
          })),
        }
      );


      // Build requirement evaluation structure for RequirementTable (filtering out junk/commercial lines)
      const validRequirements = (job?.requirements || []).filter(req => req.requirement && !isJunkRequirement(req.requirement));

      const requirementEvals = (c.evaluation?.requirementEvaluations && c.evaluation.requirementEvaluations.length > 0)
        ? c.evaluation.requirementEvaluations
        : (validRequirements.length > 0)
        ? validRequirements.map(req => {
          const reqLower = req.requirement.toLowerCase();
          const sourceEvidence = String((req as any).source_evidence || (req as any).sourceEvidence || '').trim();
          const reqCategory = (req.category || '').toLowerCase();
          const isMandatory = Boolean(req.is_mandatory);

          // Context deconstruction for requirement and mandatory source evidence
          const reqCtx = extractContextConcepts(req.requirement);
          const srcCtx = sourceEvidence ? extractContextConcepts(sourceEvidence) : null;

          // Standard synonyms and extracted aliases
          const knownSynonyms: Record<string, string[]> = {
            'sap mm': ['sap materials management', 'materials management', 'purchasing and procurement', 'procurement', 'purchasing', 'sap mm solutioning', 'vendor management', 'materials management solutioning'],
            'purchasing and procurement': ['sap mm', 'sap materials management', 'materials management', 'procurement', 'purchasing', 'sap mm solutioning', 'sourcing'],
            'procurement': ['sap mm', 'purchasing', 'purchasing and procurement', 'materials management', 'sap materials management', 'sourcing'],
            'purchasing': ['sap mm', 'procurement', 'purchasing and procurement', 'materials management'],
            'sap ibp': ['integrated business planning', 'sap integrated business planning', 'supply chain planning', 'demand planning'],
            'stakeholder management': ['client management', 'stakeholder engagement', 'cross-functional collaboration'],
            'react': ['reactjs', 'react.js'],
            'react.js': ['react', 'reactjs'],
            'reactjs': ['react', 'react.js'],
            'node.js': ['node', 'nodejs'],
            'nodejs': ['node', 'node.js'],
            'express': ['expressjs', 'express.js'],
            'express.js': ['express', 'expressjs'],
            'postgresql': ['postgres', 'psql'],
            'postgres': ['postgresql', 'psql'],
            'mongodb': ['mongo'],
            'mongo': ['mongodb'],
            'kubernetes': ['k8s'],
            'k8s': ['kubernetes'],
            'typescript': ['ts'],
            'javascript': ['js'],
            'golang': ['go'],
          };

          const nonEquivalents: Record<string, string[]> = {
            'react': ['angular', 'vue', 'vuejs'],
            'angular': ['react', 'vue', 'vuejs'],
            'vue': ['react', 'angular'],
            'postgresql': ['mysql', 'mongodb', 'oracle'],
            'mysql': ['postgresql', 'mongodb'],
            'mongodb': ['postgresql', 'mysql'],
            'python': ['java', 'c#', 'php', 'ruby'],
            'java': ['python', 'c#', 'php', 'ruby'],
            'docker': ['kubernetes', 'k8s'],
          };

          // Combine aliases from requirement object, normalized JD, and known synonyms
          const explicitAliases: string[] = Array.isArray((req as any).aliases) ? (req as any).aliases : [];
          const synonymAliases: string[] = [];
          for (const [techKey, syns] of Object.entries(knownSynonyms)) {
            if (reqLower.includes(techKey)) {
              synonymAliases.push(...syns);
            }
          }
          const allAliases = Array.from(new Set([...explicitAliases, ...synonymAliases]));

          // Check if experience requirement (Contextual Tenure Evaluation)
          const yearsPattern = reqLower.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i);
          const srcYears = srcCtx?.years;
          const isExpReq = Boolean(yearsPattern) || srcYears !== undefined || reqCategory.includes('exp') || reqLower.includes('experience');

          let hasSkill = false;
          let matchedAlias = '';
          let matchReason = '';
          let failureReason = '';
          let matchPercent = 0;

          if (isExpReq) {
            const requiredYears = (isMandatory && srcYears !== undefined)
              ? srcYears
              : (yearsPattern ? parseFloat(yearsPattern[1]) : (matchResult.breakdown.experience.requiredYears || 3.0));
            const candExp = c.totalExperienceYears || parseFloat(String(c.totalExperience || '0').replace(/[^0-9.]/g, '')) || 0;
            if (candExp >= requiredYears) {
              hasSkill = true;
              matchPercent = 100;
              matchReason = isMandatory && sourceEvidence
                ? `Candidate has ${candExp} years of verified experience, satisfying mandatory criteria ("${sourceEvidence}").`
                : `Candidate has ${candExp} years of verified experience (meets/exceeds ${requiredYears} years required).`;
            } else if (requiredYears > 0) {
              matchPercent = Math.min(100, Math.max(0, Math.round((candExp / requiredYears) * 100)));
              hasSkill = matchPercent >= 50;
              matchReason = `Candidate has ${candExp} of ${requiredYears} years required.`;
              if (isMandatory) {
                failureReason = `Lacks required tenure: Candidate has ${candExp} yrs vs ${requiredYears} yrs mandated by JD source evidence: "${sourceEvidence || req.requirement}".`;
              }
            } else {
              hasSkill = true;
              matchPercent = 100;
            }
          } else {
            // Check strict non-equivalence (e.g. MySQL when PostgreSQL required)
            let detectedNonEq = '';
            for (const [reqTech, forbiddenList] of Object.entries(nonEquivalents)) {
              if (reqLower.includes(reqTech)) {
                // If candidate mentions forbidden tech but NOT the required tech
                const candRawLower = (c.rawText || '').toLowerCase();
                const hasReqTech = candRawLower.includes(reqTech) || allAliases.some(a => candRawLower.includes(a.toLowerCase()));
                if (!hasReqTech) {
                  for (const forb of forbiddenList) {
                    if (candRawLower.includes(forb) || effectiveCandidateSkills.some(s => s.toLowerCase() === forb)) {
                      detectedNonEq = forb;
                      break;
                    }
                  }
                }
              }
            }

            if (detectedNonEq) {
              hasSkill = false;
              matchPercent = 0;
              failureReason = `Strict Technology Boundary: Candidate demonstrates ${detectedNonEq}, which is not interchangeable with required ${req.requirement}.`;
            } else {
              // Contextual concept and token match (No whole-line string matching)
              const cleanTokens = reqLower
                .replace(/(\d+\+?\s*years?|experience|minimum|required|hands-on|relevant|professional|industry|proven|in|with|of|for|and|to)/gi, ' ')
                .split(/[\s,;/]+/)
                .map((w: string) => w.trim().toLowerCase().replace(/^[^a-zA-Z0-9+#.-]+|[^a-zA-Z0-9+#.-]+$/g, ''))
                .filter((w: string) => w.length >= 3 && !['years', 'work', 'skills', 'tools', 'high', 'level'].includes(w));

              const allTokens = Array.from(new Set([
                ...cleanTokens,
                ...(srcCtx ? srcCtx.cleanTokens : [])
              ]));
              const allConcepts = Array.from(new Set([
                ...reqCtx.concepts,
                ...(srcCtx ? srcCtx.concepts : [])
              ]));

              const directMatch = effectiveCandidateSkills.some(cs => {
                const csLow = cs.toLowerCase();
                return csLow === reqLower ||
                       safeWordMatch(csLow, reqLower) ||
                       safeWordMatch(reqLower, csLow) ||
                       areSkillsEquivalent(csLow, reqLower) ||
                       allConcepts.some(con => csLow === con || safeWordMatch(con, csLow) || safeWordMatch(csLow, con) || areSkillsEquivalent(csLow, con)) ||
                       allTokens.some((tok: string) => csLow === tok || safeWordMatch(tok, csLow) || safeWordMatch(csLow, tok) || areSkillsEquivalent(csLow, tok));
              }) || allConcepts.some((con: string) => {
                return safeWordMatch(con, c.rawText || '') ||
                       effectiveCandidateSkills.some(cs => areSkillsEquivalent(cs, con) || safeWordMatch(con, cs.toLowerCase()) || safeWordMatch(cs.toLowerCase(), con));
              }) || allTokens.some((tok: string) => {
                return effectiveCandidateSkills.some(cs => cs.toLowerCase() === tok || areSkillsEquivalent(cs, tok) || safeWordMatch(tok, cs.toLowerCase()) || safeWordMatch(cs.toLowerCase(), tok)) ||
                       safeWordMatch(tok, c.rawText || '');
              });

              if (directMatch) {
                hasSkill = true;
                matchPercent = 100;
                matchReason = isMandatory && sourceEvidence
                  ? `Verified match against mandatory JD source criteria ("${sourceEvidence}"): Candidate demonstrates verified alignment.`
                  : `Direct match found in candidate competencies or resume context.`;
              } else {
                // 2. Semantic Alias Match (e.g. ReactJS -> React.js)
                for (const alias of allAliases) {
                  const aliasLow = alias.toLowerCase();
                  const aliasFound = effectiveCandidateSkills.some(cs => cs.toLowerCase() === aliasLow || safeWordMatch(aliasLow, cs.toLowerCase())) ||
                                     safeWordMatch(aliasLow, c.rawText || '');
                  if (aliasFound) {
                    hasSkill = true;
                    matchPercent = 100;
                    matchedAlias = alias;
                    matchReason = isMandatory && sourceEvidence
                      ? `Semantic AI match: Verified "${alias}" fulfilling mandatory criteria ("${sourceEvidence}").`
                      : `Semantic AI match: Found equivalent alias "${alias}" in candidate CV.`;
                    break;
                  }
                }
              }

              if (!hasSkill && !failureReason) {
                failureReason = isMandatory && sourceEvidence
                  ? `Mandatory requirement not met: Candidate CV does not demonstrate verified context for "${sourceEvidence}".`
                  : `Candidate CV does not contain evidence for "${req.requirement}" or recognized equivalents.`;
              }
            }
          }

          const status = matchPercent >= 80 ? RequirementStatus.FULLY_MET : (matchPercent > 0 ? RequirementStatus.PARTIALLY_MET : RequirementStatus.NOT_MET);
          return {
            id: req.id,
            requirement: {
              id: req.id,
              text: req.requirement,
              category: req.category || 'Technical Skill',
              isMandatory,
              weight: req.weight || 1.0,
              aliases: allAliases.length > 0 ? allAliases : undefined,
              sourceEvidence: sourceEvidence || undefined,
              extractedFrom: sourceEvidence || undefined,
            },
            sourceEvidence: sourceEvidence || undefined,
            status,
            confidence: ConfidenceLevel.HIGH,
            pointsAwarded: Math.round((matchPercent / 100) * 10),
            maxPoints: 10,
            matchPercentage: matchPercent,
            matchedAlias: matchedAlias || undefined,
            matchReason: matchReason || undefined,
            failureReason: failureReason || undefined,
            hasEvidence: Boolean(hasSkill || matchPercent > 0),
            evidence: [
              {
                id: `ev-${req.id}`,
                type: matchedAlias ? 'Semantic' : 'Explicit',
                source: 'Candidate Profile & CV Text',
                text: hasSkill
                  ? (matchedAlias ? `Semantic match: Recognized "${matchedAlias}" satisfying criteria ("${sourceEvidence || req.requirement}").` : `Verified match: Candidate profile & CV document alignment for "${sourceEvidence || req.requirement}".`)
                  : (failureReason || `Not met: Candidate does not demonstrate required criteria for "${req.requirement}".`),
                matchStrength: matchPercent,
              },
            ],
          };
        })
        : [
          {
            id: 'req-core-skills',
            requirement: { id: 'req-1', text: 'Core Required Technical Stack', category: 'Technical Skill', isMandatory: true, weight: 1.5 },
            status: matchResult.breakdown.skills.score >= 70 ? RequirementStatus.FULLY_MET : RequirementStatus.PARTIALLY_MET,
            confidence: ConfidenceLevel.HIGH,
            pointsAwarded: Math.round(matchResult.breakdown.skills.score / 10),
            maxPoints: 10,
            matchPercentage: matchResult.breakdown.skills.score,
            hasEvidence: true,
            evidence: [{
              id: 'ev-1',
              type: 'Explicit',
              source: 'Extracted Skills',
              text: `Matched ${matchResult.breakdown.skills.matchedSkills.length} competencies (${matchResult.breakdown.skills.matchedSkills.slice(0, 5).join(', ')}).`,
              matchStrength: matchResult.breakdown.skills.score,
            }],
          },
          {
            id: 'req-exp',
            requirement: { id: 'req-2', text: 'Relevant Years of Professional Experience', category: 'Experience', isMandatory: true, weight: 1.2 },
            status: matchResult.breakdown.experience.score >= 80 ? RequirementStatus.FULLY_MET : RequirementStatus.PARTIALLY_MET,
            confidence: ConfidenceLevel.HIGH,
            pointsAwarded: Math.round(matchResult.breakdown.experience.score / 10),
            maxPoints: 10,
            matchPercentage: matchResult.breakdown.experience.score,
            hasEvidence: true,
            evidence: [{
              id: 'ev-2',
              type: 'Explicit',
              source: 'Work History',
              text: `Candidate has ${matchResult.breakdown.experience.candidateYears} years of experience vs ${matchResult.breakdown.experience.requiredYears} years required.`,
              matchStrength: matchResult.breakdown.experience.score,
            }],
          },
        ];

      // Authoritative ATS Score: Read official evaluated ATS score directly from backend
      const storedScore = (c as any).atsScore ?? (c as any).matchScore ?? (c as any).evaluation?.atsScore ?? (c as any).evaluation?.score ?? (c as any).score;
      const hasStoredScore = typeof storedScore === 'number' && !isNaN(storedScore);
      const finalScore = hasStoredScore ? Math.round(storedScore) : matchResult.overallScore;

      const finalLevel = (c as any).matchLevel || (c as any).evaluation?.matchLevel || (
        finalScore >= 85 ? 'EXCELLENT MATCH' :
        finalScore >= 70 ? 'STRONG MATCH' :
        finalScore >= 50 ? 'MODERATE MATCH' :
        finalScore >= 35 ? 'LOW MATCH' :
        'MINIMAL MATCH'
      );

      const autoDecision: 'SUBMIT' | 'REVIEW' | 'REJECT' =
        finalScore >= 80 ? 'SUBMIT' :
        finalScore >= 60 ? 'REVIEW' :
        'REJECT';

      const effectiveDecision = autoDecision;

      const expDetails = getNumericExperienceDetails(c);

      return {
        ...c,
        totalExperience: expDetails.badgeText,
        totalExperienceYears: expDetails.years,
        totalExperienceMonths: expDetails.months,
        matchScore: finalScore,
        atsScore: finalScore,
        matchLevel: finalLevel,
        matchBreakdown: matchResult.breakdown,
        matchSummary: matchResult.summary,
        matchResult,
        requirementEvals,
        decision: effectiveDecision,
        recommendation: (c as any).recommendation || (effectiveDecision === 'SUBMIT' ? 'ACCEPT' : effectiveDecision === 'REJECT' ? 'REJECT' : 'REVIEW'),
      };
    });
  }, [uniqueCandidates, job]);

  // ── Handle File Selection (Supports batch of 10+ PDFs/DOCX with duplicate prevention) ──
  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const allowedExts = ['.pdf', '.docx', '.doc', '.txt'];
    const newItems: UploadQueueItem[] = [];
    const duplicateFiles: string[] = [];
    const seenBatchKeys = new Set<string>();

    Array.from(fileList).forEach((file, index) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedExts.includes(ext)) {
        alert(`File format "${file.name}" is not supported. Please upload PDF, DOCX, or TXT.`);
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds maximum allowed size of 25MB.`);
        return;
      }

      const normName = file.name.trim().toLowerCase();
      const batchKey = `${normName}_${file.size}`;

      // Check duplicates in the same selected batch
      if (seenBatchKeys.has(batchKey)) {
        duplicateFiles.push(file.name);
        return;
      }
      seenBatchKeys.add(batchKey);

      // Check if file is already in current candidates list for this job (allow re-upload if previous attempt failed)
      const alreadyInCandidates = candidates.some(c => {
        const matches = c.fileName && c.fileName.trim().toLowerCase() === normName && (c.fileSize ? c.fileSize === file.size : true);
        if (!matches) return false;
        const isFailed = c.parsingStatus === 'FAILED' || (c as any).status === 'FAILED' || (!c.skills?.length && (!c.rawText || c.rawText.length < 30));
        return !isFailed;
      });

      // Check if file is already in the upload queue
      const alreadyInQueue = uploadQueue.some(q => q.name.trim().toLowerCase() === normName && q.size === file.size && q.status !== 'FAILED');

      if (alreadyInCandidates || alreadyInQueue) {
        duplicateFiles.push(file.name);
        return;
      }

      newItems.push({
        id: `upload-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        status: 'UPLOADING',
        progress: 10,
      });
    });

    // Reset file input so user can repeatedly select files
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (duplicateFiles.length > 0) {
      alert(`The following CV(s) were already uploaded for this job and skipped to prevent duplicates:\n• ${duplicateFiles.join('\n• ')}`);
    }

    if (newItems.length > 0) {
      setUploadQueue(prev => [...newItems, ...prev]);
      processUploadBatch(newItems);
    }
  };

  // ── Process Upload Queue in Batch ───────────────────────────────────────────
  const processUploadBatch = async (items: UploadQueueItem[]) => {
    setIsUploading(true);
    let latestParsedCandidateId: string | undefined;

    try {
      const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
      const CHUNK_SIZE = 5;
      const chunks: UploadQueueItem[][] = [];
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        chunks.push(items.slice(i, i + CHUNK_SIZE));
      }

      for (const chunk of chunks) {
        const formData = new FormData();
        formData.append('jobId', jobId);
        if (job?.position) formData.append('jobPosition', job.position);
        if (job?.client) formData.append('jobClient', job.client);
        if (job?.requirements && Array.isArray(job.requirements)) {
          formData.append('requirements', JSON.stringify(job.requirements));
        }
        chunk.forEach(item => {
          formData.append('files', item.file);
        });

        setUploadQueue(prev =>
          prev.map(q =>
            chunk.some(it => it.id === q.id)
              ? { ...q, status: 'PROCESSING', progress: 50 }
              : q
          )
        );

        try {
          const res = await fetch(`${backendUrl}/jobs/${jobId}/candidates/upload`, {
            method: 'POST',
            headers: {
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            },
            body: formData,
          });

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || `Server responded with HTTP ${res.status}`);
          }

          const result = await res.json();

          if (result.candidates && result.candidates.length > 0) {
            latestParsedCandidateId = result.candidates[0]?.id;
          }

          setUploadQueue(prev =>
            prev.map(q => {
              const matchedCandidate = result.candidates?.find(
                (c: CandidateRecord) => (c.fileName && c.fileName.toLowerCase() === q.name.toLowerCase())
              );
              if (matchedCandidate) {
                const isDup = matchedCandidate.isDuplicate || matchedCandidate.parsingStatus === 'DUPLICATE';
                return {
                  ...q,
                  status: isDup ? 'DUPLICATE' : matchedCandidate.parsingStatus,
                  progress: 100,
                  error: isDup ? (matchedCandidate.errorMessage || 'This CV is already uploaded to this JD.') : matchedCandidate.errorMessage,
                  candidateId: matchedCandidate.id,
                };
              }
              return q;
            })
          );

          if (result.candidates && result.candidates.length > 0) {
            setCandidates(prevCandidates => {
              const map = new Map<string, CandidateRecord>();
              for (const c of result.candidates) {
                const key = (c.fileName || c.id || `${c.name}_${c.email}`).toLowerCase();
                map.set(key, c);
              }
              for (const c of prevCandidates) {
                const key = (c.fileName || c.id || `${c.name}_${c.email}`).toLowerCase();
                if (!map.has(key)) map.set(key, c);
              }
              const updatedList = Array.from(map.values());

              if (typeof window !== 'undefined') {
                try {
                  localStorage.setItem(`tasknera_candidates_${jobId}`, JSON.stringify(updatedList));
                  localStorage.setItem(`tasknera_candidates_count_${jobId}`, String(updatedList.length));

                  const poolSaved = JSON.parse(localStorage.getItem('tasknera_candidates_pool') || '[]');
                  for (const fc of updatedList) {
                    if (!poolSaved.some((c: any) => c.id === fc.id || (c.fileName && c.fileName === fc.fileName))) {
                      poolSaved.unshift(fc);
                    }
                  }
                  localStorage.setItem('tasknera_candidates_pool', JSON.stringify(poolSaved));
                } catch {}
              }

              return updatedList;
            });
          }
        } catch (chunkErr: any) {
          console.error('[Chunk Upload Error]:', chunkErr);
          setUploadQueue(prev =>
            prev.map(q =>
              chunk.some(it => it.id === q.id)
                ? { ...q, status: 'FAILED', progress: 100, error: chunkErr.message || 'Parsing failed on server' }
                : q
            )
          );
        }
      }

      await fetchJobAndCandidates();

      // Automatically shift screen directly to candidate table after CV upload
      if (latestParsedCandidateId) {
        setTimeout(() => {
          scrollToCandidateTable(latestParsedCandidateId);
        }, 800);
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadQueue(prev =>
        prev.map(q =>
          items.some(it => it.id === q.id)
            ? { ...q, status: 'FAILED', progress: 100, error: err.message || 'Upload & parsing failed' }
            : q
        )
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetryCandidate = async (candidateId: string) => {
    try {
      const res = await fetch(`${backendUrl}/jobs/${jobId}/candidates/${candidateId}/retry`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.candidate) {
          setCandidates(prev =>
            prev.map(c => (c.id === candidateId ? data.candidate : c))
          );
          if (selectedCandidate?.id === candidateId) {
            setSelectedCandidate(data.candidate);
          }
        }
      } else {
        alert('Retry attempt failed. Please check document text readability.');
      }
    } catch (err) {
      console.error('Error retrying candidate:', err);
      alert('Network error while attempting retry.');
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesSelected(e.dataTransfer.files);
  };

  // ── Filtered & Ranked Candidate List ────────────────────────────────────────
  const filteredCandidates = candidatesWithMatch
    .filter(c => {
      const q = (searchQuery || '').trim().toLowerCase();
      if (q) {
        const nameMatches = c.name ? c.name.toLowerCase().includes(q) : false;
        const titleMatches = c.currentTitle ? c.currentTitle.toLowerCase().includes(q) : false;
        const companyMatches = c.currentCompany ? c.currentCompany.toLowerCase().includes(q) : false;
        const emailMatches = c.email ? c.email.toLowerCase().includes(q) : false;
        const skillMatches = c.skills ? c.skills.some(s => s && s.toLowerCase().includes(q)) : false;

        const matchesSearch = nameMatches || titleMatches || companyMatches || emailMatches || skillMatches;
        if (!matchesSearch) return false;
      }

      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'STRONG_MATCH') return (c.matchScore ?? 0) >= 80;
      if (statusFilter === 'GOOD_MATCH') return (c.matchScore ?? 0) >= 60 && (c.matchScore ?? 0) < 80;
      if (statusFilter === 'LOW_FIT') return (c.matchScore ?? 0) < 60;
      return c.parsingStatus === statusFilter;
    })

    .sort((a, b) => {
      let comparison = 0;
      if (sortField === 'score') {
        comparison = (b.matchScore ?? 0) - (a.matchScore ?? 0);
      } else if (sortField === 'date') {
        comparison = new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime();
      } else if (sortField === 'name') {
        comparison = (a.name || '').localeCompare(b.name || '');
      } else if (sortField === 'experience') {
        const expA = a.totalExperienceYears || parseMonthsFromText(a.totalExperience) / 12;
        const expB = b.totalExperienceYears || parseMonthsFromText(b.totalExperience) / 12;
        comparison = expB - expA;
      }
      return sortDirection === 'desc' ? comparison : -comparison;
    });

  const comparisonCandidates: CandidateComparisonItem[] = useMemo(() => {
    return filteredCandidates
      .filter(c => selectedCandidateIds.includes(c.id))
      .map(c => {
        const expInfo = getNumericExperienceDetails(c);
        const gapInfo = getCandidateCareerGaps(c);
        return {
          id: c.id,
          name: c.name || c.fileName || 'Candidate',
          email: c.email,
          phone: c.phone,
          currentTitle: c.currentTitle,
          currentCompany: c.currentCompany,
          location: c.location,
          totalExperienceYears: expInfo.years || 0,
          score: c.matchScore ?? 0,
          decisionTag: getCandidateDecision(c),
          matchResult: (c as any).matchResult,
          skills: c.skills || [],
          noticePeriod: (c as any).noticePeriod || '30 Days',
          expectedSalary: (c as any).expectedSalary,
          currentSalary: (c as any).currentSalary,
          gapAnalysis: {
            hasGap: gapInfo.hasGap,
            totalGapMonths: gapInfo.totalGapMonths,
            statusText: gapInfo.statusText,
          },
        };
      });
  }, [filteredCandidates, selectedCandidateIds, getCandidateDecision]);

  const parsedCount = candidates.filter(c => c.parsingStatus === 'PARSED').length;
  const strongMatchCount = candidatesWithMatch.filter(c => (c.matchScore ?? 0) >= 80).length;
  const avgMatch = candidatesWithMatch.length > 0
    ? Math.round(candidatesWithMatch.reduce((acc, c) => acc + (c.matchScore ?? 0), 0) / candidatesWithMatch.length)
    : 0;

  const rawPosition = job?.position || 'Job Position';
  let cleanPosition = rawPosition.trim();
  if (/gtm\s+planning/i.test(cleanPosition)) {
    cleanPosition = 'Demand Generation & GTM Lead';
  } else {
    cleanPosition = cleanPosition
      .replace(/^(?:overview\s+own\s+|role\s+overview:\s*|job\s+overview:\s*|overview:\s*|overview\s+|role:\s*|position:\s*)/i, '')
      .replace(/\s+(?:for|and|to|with|in|at)$/i, '')
      .replace(/^own\s+/i, '')
      .trim() || rawPosition;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col selection:bg-orange-500 selection:text-white antialiased">
      <Header />

      <main className="max-w-7xl mx-auto px-6 pt-24 pb-20 flex-1 w-full">

        {/* ── BREADCRUMB & NAVIGATION ── */}
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-6">
          <Link href="/jobs" className="hover:text-slate-900 transition-colors">Jobs Directory</Link>
          <span>/</span>
          <Link href={`/jobs/${jobId}`} className="hover:text-slate-900 transition-colors truncate max-w-[280px]">
            {job?.client ? `${job.client} — ${job.position}` : (job?.position || 'Job Position')}
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">Candidate Pipeline & Sourcing</span>
        </div>

        {/* ── EXECUTIVE HERO BANNER ── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-900 border border-slate-800 p-6 sm:p-7 shadow-xl text-white mb-8">
          {/* Ambient subtle glow lights */}
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-orange-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="max-w-3xl">
              {/* Status & Criteria Badges (Clean, no redundant buzzwords) */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-[11px] font-bold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active
                </span>
                {job?.requirementsCount ? (
                  <span className="inline-flex items-center px-2 py-0.5 bg-white/10 border border-white/10 rounded-full text-[11px] font-medium text-slate-300">
                    {job.requirementsCount} Criteria
                  </span>
                ) : null}
              </div>

              {/* Position Title with inline edit & sanitized clamp */}
              {isEditingPosition ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSavePosition(editPositionInput);
                  }}
                  className="flex items-center gap-2 my-1"
                >
                  <input
                    type="text"
                    value={editPositionInput}
                    onChange={(e) => setEditPositionInput(e.target.value)}
                    placeholder="Enter Job Role / Position..."
                    autoFocus
                    className="px-3 py-1.5 text-lg sm:text-xl font-bold bg-slate-900 border border-orange-500 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-orange-400 w-80 sm:w-96"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded-lg cursor-pointer transition shadow"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingPosition(false)}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg cursor-pointer transition"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex items-start gap-2.5 group">
                  <h1
                    className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight line-clamp-2"
                    title={rawPosition}
                  >
                    {cleanPosition}
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setEditPositionInput(job?.position || '');
                      setIsEditingPosition(true);
                    }}
                    className="mt-1 p-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white transition-all cursor-pointer text-xs shrink-0"
                    title="Edit Position Title"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Company & Location Metadata Row (Clean inline without floating hanging bullets) */}
              <div className="flex items-center gap-2.5 text-xs text-slate-300 mt-2.5 flex-wrap font-medium">
                {isEditingCompany ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveCompany(editCompanyInput);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={editCompanyInput}
                      onChange={(e) => setEditCompanyInput(e.target.value)}
                      placeholder="Enter Company Name..."
                      autoFocus
                      className="px-2.5 py-1 text-xs bg-slate-900 border border-orange-500 rounded text-white focus:outline-none focus:ring-1 focus:ring-orange-400 w-52 font-semibold"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded cursor-pointer transition shadow"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingCompany(false)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded cursor-pointer transition"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 text-white font-semibold">
                      <svg className="w-3.5 h-3.5 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      {job?.client || 'Hiring Organization'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditCompanyInput(job?.client && job.client !== 'Enterprise Client' ? job.client : '');
                        setIsEditingCompany(true);
                      }}
                      className="text-[10px] text-orange-400 hover:text-orange-300 font-semibold hover:underline cursor-pointer ml-0.5"
                      title="Edit company name"
                    >
                      Edit
                    </button>
                  </div>
                )}

                {job?.location && (
                  <>
                    <span className="text-white/20 select-none">•</span>
                    <span className="flex items-center gap-1 text-slate-300">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{job.location}</span>
                    </span>
                  </>
                )}

                {job?.work_mode && (
                  <>
                    <span className="text-white/20 select-none">•</span>
                    <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[11px] font-semibold">
                      {job.work_mode}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons: Clean, concise & aligned */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsCandidateLinkOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl border border-white/15 transition-all cursor-pointer backdrop-blur-sm"
                title="Candidate application link"
              >
                <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>Candidate Link</span>
              </button>
              {candidates.length > 0 && (
                <button
                  onClick={() => setShowUploadZone(prev => !prev)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-orange-500/20 hover:-translate-y-0.5 cursor-pointer"
                >
                  {showUploadZone ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                  <span>{showUploadZone ? 'Close Dropzone' : 'Upload CVs'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── STATS SUMMARY CARDS WITH MATCH METRICS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: 'Total Applicants',
              value: candidates.length,
              color: 'text-slate-900',
              bg: 'bg-slate-100 text-slate-700',
              border: 'border-slate-200/90',
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ),
            },
            {
              label: 'Top Matches (≥80%)',
              value: strongMatchCount,
              color: 'text-emerald-700',
              bg: 'bg-emerald-50 text-emerald-700',
              border: 'border-emerald-200/80',
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
            },
            {
              label: 'Avg Match Score',
              value: `${avgMatch}%`,
              color: 'text-amber-800',
              bg: 'bg-amber-50 text-amber-700',
              border: 'border-amber-200/80',
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              ),
            },
            {
              label: 'Parsed & Evaluated',
              value: parsedCount,
              color: 'text-slate-900',
              bg: 'bg-slate-100 text-slate-700',
              border: 'border-slate-200/90',
              icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
            },
          ].map((st, i) => (
            <div key={i} className={`bg-white border ${st.border} rounded-xl p-5 shadow-2xs transition-all hover:shadow-xs hover:-translate-y-0.5`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{st.label}</span>
                <span className={`w-7 h-7 rounded-lg ${st.bg} flex items-center justify-center font-bold text-xs`}>
                  {st.icon}
                </span>
              </div>
              <div className={`text-2xl font-mono font-bold tracking-tight ${st.color}`}>{st.value}</div>
            </div>
          ))}
        </div>

        {/* ── BULK CV UPLOAD DROPZONE ── */}
        {showUploadZone && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 mb-8 shadow-sm transition-all animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">Bulk Candidate CV Upload</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload multiple resumes for <strong className="text-slate-800">{job?.position}</strong>. Resumes will be extracted and scored across all criteria automatically.
                </p>
              </div>
              <button
                onClick={() => setShowUploadZone(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-brand-orange bg-orange-50/50 scale-[0.99]'
                  : 'border-slate-300 hover:border-brand-orange bg-slate-50/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={e => handleFilesSelected(e.target.files)}
              />

              <div className="w-12 h-12 bg-orange-100 text-brand-orange rounded-xl flex items-center justify-center mx-auto mb-3 shadow-xs">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>

              <h3 className="text-sm font-bold text-slate-900 mb-1">Drag & Drop Candidate Resumes Here</h3>
              <p className="text-xs text-slate-500 mb-3">or click to browse files from your computer</p>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600">
                <span>PDF</span>
                <span>•</span>
                <span>DOCX</span>
                <span>•</span>
                <span>TXT</span>
                <span>(Max 15MB per file)</span>
              </div>
            </div>

            {/* Upload Queue Section */}
            {uploadQueue.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Upload Queue ({uploadQueue.length} items)
                  </h4>
                  {uploadQueue.some(q => q.status === 'PARSED' || q.status === 'DUPLICATE' || q.status === 'FAILED') && (
                    <button
                      onClick={() => setUploadQueue(prev => prev.filter(q => q.status !== 'PARSED' && q.status !== 'DUPLICATE'))}
                      className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                    >
                      Clear Completed
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {uploadQueue.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                      <div className="flex items-center gap-3 truncate">
                        <span className="font-bold text-slate-800 truncate">{item.name}</span>
                        <span className="text-[10px] text-slate-400">{formatBytes(item.size)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                          item.status === 'PARSED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                          item.status === 'DUPLICATE' ? 'bg-amber-50 text-amber-800 border border-amber-300' :
                          item.status === 'FAILED' ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}>
                          {item.status === 'DUPLICATE' ? 'ALREADY UPLOADED (SKIPPED)' : item.status}
                        </span>
                        {item.status === 'PARSED' && (
                          <button
                            type="button"
                            onClick={() => scrollToCandidateTable(item.candidateId)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#3563E9] text-white hover:bg-[#2851D6] transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                            title="Shift view directly to this candidate in the table"
                          >
                            <span>View in Table</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {uploadQueue.some(q => q.status === 'PARSED') && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      Parsing complete. Viewing candidate results below.
                    </span>
                    <button
                      type="button"
                      onClick={() => scrollToCandidateTable()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                    >
                      <span>Jump to Candidates Table ↓</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── QUICK FILTER & SORT TOOLBAR ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-6 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full md:max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search candidate name, role, skills, or email..."
              suppressHydrationWarning
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-orange focus:bg-white transition-colors font-medium"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap justify-between md:justify-end">
            {/* Status & Match Filters */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {[
                { id: 'ALL', label: 'All Candidates' },
                { id: 'STRONG_MATCH', label: '≥80% Match' },
                { id: 'GOOD_MATCH', label: '60-79%' },
                { id: 'LOW_FIT', label: '<60%' },
                { id: 'PARSED', label: 'Parsed' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id as any)}
                  suppressHydrationWarning
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    statusFilter === f.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Sort Toolbar */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sort:</span>
              <select
                value={sortField}
                onChange={e => setSortField(e.target.value as any)}
                suppressHydrationWarning
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:border-brand-orange cursor-pointer"
              >
                <option value="score">Match Score (Ranked)</option>
                <option value="date">Date Added</option>
                <option value="name">Candidate Name</option>
                <option value="experience">Total Experience</option>
              </select>
              <button
                onClick={() => setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                title={sortDirection === 'desc' ? 'Descending' : 'Ascending'}
                suppressHydrationWarning
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
              >
                {sortDirection === 'desc' ? '↓' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* ── CANDIDATES RANKED TABLE ── */}
        {filteredCandidates.length > 0 ? (
          <div id="candidates-table" ref={candidatesTableRef} className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden mb-8 scroll-mt-24">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="px-4 py-3.5 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={filteredCandidates.length > 0 && selectedCandidateIds.length === filteredCandidates.length}
                        onChange={() => {
                          if (selectedCandidateIds.length === filteredCandidates.length) {
                            setSelectedCandidateIds([]);
                          } else {
                            setSelectedCandidateIds(filteredCandidates.map(c => c.id));
                          }
                        }}
                        className="rounded text-brand-orange focus:ring-brand-orange h-4 w-4 cursor-pointer"
                        title="Select all candidates for comparison or submission"
                      />
                    </th>
                    <th className="px-6 py-3.5">Candidate Profile</th>
                    <th className="px-6 py-3.5">Experience & History</th>
                    <th className="px-6 py-3.5 hidden lg:table-cell">Current Role</th>
                    <th className="px-6 py-3.5 text-center">ATS Score</th>
                    <th className="px-6 py-3.5 text-center">Decision Tag</th>
                    <th className="px-6 py-3.5 text-center">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredCandidates.map((c) => {
                    const badge = statusBadge(c.parsingStatus);
                    const isNewlyAdded = c.id === newlyAddedCandidateId;
                    return (
                      <tr key={c.id} className={`transition-all duration-700 group ${isNewlyAdded ? 'bg-emerald-50/80 ring-2 ring-emerald-500/60 shadow-xs' : 'hover:bg-slate-50/70'}`}>
                        {/* Selection Checkbox */}
                        <td className="px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedCandidateIds.includes(c.id)}
                            onChange={() => handleToggleSelectCandidate(c.id)}
                            className="rounded text-brand-orange focus:ring-brand-orange h-4 w-4 cursor-pointer"
                            title={`Select ${c.name || 'candidate'}`}
                          />
                        </td>
                        {/* Candidate Name & Avatar (No # badge) */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 rounded-xl font-mono font-bold text-sm flex items-center justify-center flex-shrink-0 bg-slate-900 text-white shadow-2xs">
                              {(c.name || 'Candidate').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => {
                                    setSelectedCandidate(c);
                                    setActiveModalTab('decision');
                                  }}
                                  className="font-extrabold text-slate-900 group-hover:text-brand-orange transition-colors text-left cursor-pointer text-sm tracking-tight"
                                >
                                  {c.name || c.fileName || 'Unnamed Candidate'}
                                </button>
                                {isNewlyAdded && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0 animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Newly Parsed
                                  </span>
                                )}
                                {c.source === 'public_application' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200 shrink-0" title="Applied via public job link">
                                    Public Applicant
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 truncate max-w-[200px] font-medium mt-0.5">
                                {c.location || c.email || 'Verified Candidate'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Experience & Career History */}
                        <td className="px-6 py-4 text-xs font-semibold text-slate-800">
                          {(() => {
                            const expInfo = getNumericExperienceDetails(c);
                            const gapInfo = getCandidateCareerGaps(c);
                            const expList = Array.isArray(c.experience) ? c.experience : [];
                            const companies = new Set<string>();
                            if (c.currentCompany && !['company', 'the role', 'role', 'experience'].includes(c.currentCompany.toLowerCase())) {
                              companies.add(c.currentCompany);
                            }
                            for (const ex of expList) {
                              if (ex.company && !['company', 'the role', 'role', 'experience'].includes(ex.company.toLowerCase())) {
                                companies.add(ex.company);
                              }
                            }
                            const companyCount = Math.max(companies.size, expList.length > 0 ? expList.length : 1);

                            return (
                              <div className="flex flex-col items-start gap-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-slate-100 text-slate-900 border border-slate-200 whitespace-nowrap">
                                    {expInfo.badgeText}
                                  </span>
                                  {gapInfo.hasGap && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-900 font-extrabold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 whitespace-nowrap">
                                      ⚠️ {gapInfo.totalGapMonths}m Gap
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 flex-wrap">
                                  <span>{companyCount} {companyCount === 1 ? 'Company' : 'Companies'}</span>
                                  <span className="text-slate-300">•</span>
                                  <span>{gapInfo.hasGap ? `${gapInfo.gaps.length} Gap` : 'Continuous history'}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Current Title & Company */}
                        <td className="px-6 py-4 hidden lg:table-cell text-xs">
                          <div className="font-bold text-slate-900">{c.currentTitle || '—'}</div>
                          <div className="text-slate-500 text-[11px] font-medium mt-0.5">{c.currentCompany || '—'}</div>
                        </td>

                        {/* ATS Score (Not auto deciding the decision tag) */}
                        <td className="px-6 py-4 text-center">
                          {(() => {
                            const score = Math.round(c.matchScore ?? (c as any).atsScore ?? 0);
                            const isHigh = score >= 80;
                            const isLow = score < 60;
                            return (
                              <div className="inline-flex items-center justify-center">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black font-mono border shadow-2xs ${
                                  isHigh
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : isLow
                                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}>
                                  <span className={`w-2 h-2 rounded-full ${
                                    isHigh ? 'bg-emerald-500' : isLow ? 'bg-rose-500' : 'bg-amber-500'
                                  }`} />
                                  {score}% ATS
                                </span>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Manual Decision Tag Dropdown: Review, Submit, Reject */}
                        <td className="px-6 py-4 text-center">
                          <DecisionTagDropdown
                            value={getCandidateDecision(c)}
                            onChange={(newVal) => handleUpdateDecision(c.id, newVal)}
                          />
                        </td>

                        {/* Parsing Status */}
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold border ${badge.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {badge.label}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedCandidate(c);
                                setActiveModalTab('decision');
                              }}
                              className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-2xs hover:shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <span>View Profile</span>
                              <span className="text-slate-400">→</span>
                            </button>
                            <button
                              onClick={(e) => handleDeleteCandidate(c.id, e)}
                              className="p-2 text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-200 cursor-pointer"
                              title="Delete candidate"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-2xs mb-8">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto mb-3 font-bold text-lg">
              🔍
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              {searchQuery ? 'No matching candidates found' : 'No CVs uploaded for this job yet.'}
            </h3>
            <p className="text-slate-500 text-xs max-w-md mx-auto mb-6">
              {searchQuery
                ? 'Try adjusting your search keywords or clear the active status filter.'
                : 'Upload resumes (PDF, DOCX, TXT) to evaluate and score candidates deterministically against this job.'}
            </p>
            {searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowUploadZone(prev => !prev);
                  if (!showUploadZone) {
                    setTimeout(() => {
                      window.scrollTo({ top: 160, behavior: 'smooth' });
                    }, 50);
                  }
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-orange-500/20 hover:-translate-y-0.5 cursor-pointer"
              >
                {showUploadZone ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                <span>{showUploadZone ? 'Close Dropzone' : 'Upload CVs'}</span>
              </button>
            )}
          </div>
        )}

        {/* ── CANDIDATE PROFILE & MATCH CRITERIA DETAILS MODAL ── */}
        {selectedCandidate && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedCandidate(null);
            }}
            className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex justify-end overflow-hidden overscroll-none"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, height: '100vh', width: '100vw' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-5xl bg-white flex flex-col shadow-2xl border-l border-slate-200 overflow-hidden relative overscroll-none select-text"
              style={{ height: '100vh', maxHeight: '100vh' }}
            >
              {/* 1. PERMANENTLY FIXED TOP HEADER SECTION */}
              <div className="flex-shrink-0 bg-white border-b border-slate-200 shadow-xs z-30 select-none">
                {/* Modal Header */}
                <div className="p-4 sm:p-5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/80">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl font-mono font-bold text-base flex items-center justify-center bg-slate-900 text-white shadow-xs">
                      {(selectedCandidate.name || 'Candidate').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                        {selectedCandidate.name || selectedCandidate.fileName || 'Candidate Profile'}
                      </h2>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        {selectedCandidate.currentTitle || 'Candidate'} • <span className="text-slate-700 font-semibold">{selectedCandidate.currentCompany || 'Experience History'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center flex-shrink-0">
                    <button
                      onClick={(e) => handleDeleteCandidate(selectedCandidate.id, e)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                      title="Delete candidate"
                    >
                      <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Segmented Pill Tab Switcher */}
                <div className="px-6 py-2.5 bg-slate-50/70 flex items-center justify-between">
                  <div className="inline-flex p-1 bg-slate-200/70 rounded-xl border border-slate-200 gap-1 flex-wrap">
                    <button
                      onClick={() => setActiveModalTab('decision')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeModalTab === 'decision'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-700 hover:text-slate-900 bg-white/50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
                      <span>Decision Intelligence</span>
                    </button>
                    <button
                      onClick={() => setActiveModalTab('summary')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeModalTab === 'summary'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 bg-white/50'
                      }`}
                    >
                      <span>Executive Summary</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable Tab Content Body (ONLY this scrolls) */}
              <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 bg-slate-50/20 p-6 space-y-6 scroll-smooth">
                {/* Tab 0: HireIQ Decision Intelligence */}
                {activeModalTab === 'decision' && (
                  <HireIQDecisionIntelligence
                    candidateId={selectedCandidate.id}
                    jobId={jobId as string}
                    fallbackCandidateName={selectedCandidate.name}
                    fallbackJobTitle={job?.position}
                    fallbackScore={Math.round(selectedCandidate.matchScore ?? selectedCandidate.atsScore ?? 0)}
                    fallbackRecommendation={getCandidateDecision(selectedCandidate)}
                    fallbackCandidate={selectedCandidate}
                  />
                )}

                {/* Tab: Candidate Executive Summary */}
                {activeModalTab === 'summary' && (
                  <CandidateExecutiveSummary
                    candidateId={selectedCandidate.id}
                    jobId={jobId as string}
                    candidateName={selectedCandidate.name}
                    fallbackCandidate={selectedCandidate}
                  />
                )}


              </div>


              {/* 3. PERMANENTLY FIXED BOTTOM FOOTER CONTROLS */}
              <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between flex-shrink-0 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] select-none">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Evaluation Status:</span>
                  <MatchBadge score={selectedCandidate.matchScore} size="sm" />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRetryCandidate(selectedCandidate.id)}
                    className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-all shadow-2xs cursor-pointer"
                  >
                    Re-Audit Criteria
                  </button>
                  <button
                    onClick={() => setSelectedCandidate(null)}
                    className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Public Candidate Application Link Modal */}
        <CandidateLinkModal
          isOpen={isCandidateLinkOpen}
          onClose={() => setIsCandidateLinkOpen(false)}
          jobId={jobId}
          jobTitle={job?.position || 'Job Requisition'}
        />

        {/* Floating Selection Toolbar for Compare & Client Submission */}
        {selectedCandidateIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-200">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-brand-orange text-white text-xs font-mono font-bold flex items-center justify-center">
                {selectedCandidateIds.length}
              </span>
              <span className="text-xs font-bold text-slate-200">
                Candidate{selectedCandidateIds.length === 1 ? '' : 's'} Selected
              </span>
            </div>

            <div className="h-4 w-px bg-slate-700" />

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setCompareModalTab('compare');
                  setIsCompareModalOpen(true);
                }}
                disabled={selectedCandidateIds.length < 2}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedCandidateIds.length >= 2
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                }`}
                title={selectedCandidateIds.length < 2 ? 'Select at least 2 candidates to compare' : 'Compare candidates side-by-side'}
              >
                <span>📊 Compare Matrix</span>
                {selectedCandidateIds.length >= 2 && (
                  <span className="text-[10px] bg-blue-700 px-1.5 py-0.2 rounded-full">
                    ({selectedCandidateIds.length})
                  </span>
                )}
              </button>


              <button
                onClick={() => {
                  setCompareModalTab('submit');
                  setIsCompareModalOpen(true);
                }}
                className="px-3.5 py-1.5 bg-brand-orange hover:bg-brand-orange-hover text-white rounded-xl text-xs font-extrabold transition-all shadow-orange cursor-pointer flex items-center gap-1.5"
              >
                <span>📨 Client Submission</span>
              </button>

              <button
                onClick={() => setSelectedCandidateIds([])}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="Deselect all"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* HireIQ Candidate Compare & Client Submission Modal */}
        <HireIQCandidateCompareAndSubmitModal
          isOpen={isCompareModalOpen}
          onClose={() => setIsCompareModalOpen(false)}
          job={{
            id: jobId as string,
            position: job?.position || 'Job Requisition',
            client: job?.client || 'Hiring Organization',
            location: job?.location,
            salary: (job as any)?.salary,
            requirements: ((job as any)?.requirements || []).map((r: any) => ({
              id: r.id,
              requirement: r.requirement,
              isMandatory: Boolean(r.is_mandatory ?? r.isMandatory),
            })),
          }}
          selectedCandidates={comparisonCandidates}
          defaultTab={compareModalTab}
        />

      </main>

      <Footer />
    </div>
  );
}
