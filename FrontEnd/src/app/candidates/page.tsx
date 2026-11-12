'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import HireIQDecisionIntelligence from '@/components/evaluation/HireIQDecisionIntelligence';
import CandidateExecutiveSummary from '@/components/evaluation/CandidateExecutiveSummary';

export interface CandidateItem {
  id: string;
  jobId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  exp: string;
  companyCount: number;
  match: number;
  decision: string;
  jobs: number;
  skills: string[];
  education: Array<{ degree: string; institution: string; field?: string; year?: string }>;
  experience: Array<{ title: string; company: string; duration?: string; startDate?: string; endDate?: string; description?: string }>;
  gapAnalysis?: {
    hasGap: boolean;
    totalGapMonths: number;
    gaps: Array<{
      fromCompany: string;
      toCompany: string;
      startDate: string;
      endDate: string;
      gapMonths: number;
      gapLabel: string;
    }>;
    statusText: string;
  };
  projects?: Array<{ name: string; description: string; technologies?: string[] }>;
  certifications?: string[];
  languages?: string[];
  summary?: string;
  rawText?: string;
  fileName?: string;
  parsingStatus: string;
  rawCandidate?: any;
}

export interface AvailableJob {
  id: string;
  position: string;
  client: string;
  company: string;
  location: string;
  workMode: string;
  status: string;
  salary?: string;
  requirementsCount: number;
  requirementsConfirmed: boolean;
  candidatesCount: number;
}

export interface EvaluationHistoryItem {
  jobId: string;
  jobTitle: string;
  position: string;
  client: string;
  company: string;
  location: string;
  score: number | null;
  matchLevel: string;
  status: string;
  stage: string;
  date: string;
  evaluationId: string;
  alreadyEvaluated: boolean;
}

function parseYearMonth(str: string): { year: number; month: number } | null {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  if (s === 'present' || s === 'current' || s === 'now' || s === 'ongoing') {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
    october: 10, nov: 11, november: 11, dec: 12, december: 12
  };
  const namedMatch = s.match(/([a-z]+)\.?\s*'?(\d{2,4})/i);
  if (namedMatch) {
    const m = months[namedMatch[1].toLowerCase()];
    let y = parseInt(namedMatch[2], 10);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    if (m && y) return { year: y, month: m };
  }
  const numMatch = s.match(/(\d{1,2})[\/\.-](\d{2,4})/);
  if (numMatch) {
    let m = parseInt(numMatch[1], 10);
    let y = parseInt(numMatch[2], 10);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const yearMatch = s.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    return { year: parseInt(yearMatch[1], 10), month: 6 };
  }
  return null;
}

function computeCareerGaps(experiences: any[]): {
  hasGap: boolean;
  totalGapMonths: number;
  gaps: Array<{ fromCompany: string; toCompany: string; startDate: string; endDate: string; gapMonths: number; gapLabel: string }>;
  statusText: string;
} {
  if (!experiences || experiences.length < 2) {
    return { hasGap: false, totalGapMonths: 0, gaps: [], statusText: 'Continuous work history (No gap identified)' };
  }

  const parsed = experiences.map(exp => {
    let sStr = exp.startDate || '';
    let eStr = exp.endDate || '';
    if (!sStr && exp.duration) {
      const parts = exp.duration.split(/[-–—to]/i);
      if (parts.length >= 2) {
        sStr = parts[0].trim();
        eStr = parts[1].trim();
      }
    }
    const s = parseYearMonth(sStr);
    const e = parseYearMonth(eStr || 'Present');
    return {
      title: exp.title || '',
      company: exp.company || 'Company',
      s,
      e,
      rawStart: sStr || 'Start',
      rawEnd: eStr || 'Present'
    };
  }).filter(p => p.s && p.e);

  if (parsed.length < 2) {
    return { hasGap: false, totalGapMonths: 0, gaps: [], statusText: 'Continuous work history (No gap identified)' };
  }

  parsed.sort((a, b) => (a.s!.year * 12 + a.s!.month) - (b.s!.year * 12 + b.s!.month));

  const gaps: Array<{ fromCompany: string; toCompany: string; startDate: string; endDate: string; gapMonths: number; gapLabel: string }> = [];
  let totalGapMonths = 0;

  for (let i = 0; i < parsed.length - 1; i++) {
    const prev = parsed[i];
    const next = parsed[i + 1];

    const prevEndVal = prev.e!.year * 12 + prev.e!.month;
    const nextStartVal = next.s!.year * 12 + next.s!.month;

    const diffMonths = nextStartVal - prevEndVal;
    if (diffMonths >= 2) {
      const gapYears = (diffMonths / 12).toFixed(1);
      const gapLabel = diffMonths >= 12
        ? `${gapYears} yrs (${diffMonths} mos) gap between ${prev.company} and ${next.company}`
        : `${diffMonths} mos gap between ${prev.company} and ${next.company}`;

      gaps.push({
        fromCompany: prev.company,
        toCompany: next.company,
        startDate: prev.rawEnd,
        endDate: next.rawStart,
        gapMonths: diffMonths,
        gapLabel
      });
      totalGapMonths += diffMonths;
    }
  }

  return {
    hasGap: gaps.length > 0,
    totalGapMonths,
    gaps,
    statusText: gaps.length > 0
      ? `${totalGapMonths} months total career gap identified across ${gaps.length} career transitions.`
      : 'Continuous work history (No gap identified)'
  };
}

const decisionStyle = (d: string) =>
  d === 'SUBMIT'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : d === 'REVIEW'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-rose-50 text-rose-700 border-rose-200';

const avatarColor = (name: string) => {
  const colors = [
    'bg-brand-orange-pale text-brand-orange border-brand-orange-border',
    'bg-blue-50 text-blue-600 border-blue-200',
    'bg-emerald-50 text-emerald-600 border-emerald-200',
    'bg-purple-50 text-purple-600 border-purple-200',
    'bg-amber-50 text-amber-600 border-amber-200',
    'bg-rose-50 text-rose-600 border-rose-200',
    'bg-teal-50 text-teal-600 border-teal-200',
  ];
  return colors[Math.abs((name || 'A').charCodeAt(0)) % colors.length];
};

export default function CandidatesPage() {
  const router = useRouter();
  const { user, token } = useAuth();

  // Central candidate pool states
  const [allCandidates, setAllCandidates] = useState<CandidateItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT'>('All');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isLoading, setIsLoading] = useState(true);

  // Candidate Profile Slide-over Drawer States
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateItem | null>(null);
  const [activeTab, setActiveTab] = useState<'decision' | 'summary' | 'overview' | 'history' | 'experience' | 'skills' | 'resume'>('decision');
  const [decisionJobId, setDecisionJobId] = useState<string | null>(null);
  const [copiedContact, setCopiedContact] = useState(false);
  const [candidateHistory, setCandidateHistory] = useState<EvaluationHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Delete modal state
  const [candidateToDelete, setCandidateToDelete] = useState<CandidateItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Match With JD Modal States (ENTRY POINT 2)
  const [matchingCandidate, setMatchingCandidate] = useState<CandidateItem | null>(null);
  const [matchModalStep, setMatchModalStep] = useState<'select-job' | 'confirm' | 'processing' | 'already-evaluated'>('select-job');
  const [availableJobs, setAvailableJobs] = useState<AvailableJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [jobSearch, setJobSearch] = useState('');
  const [evaluationProcessingStage, setEvaluationProcessingStage] = useState<'cv' | 'matching' | 'scoring'>('cv');
  const [existingEvaluationData, setExistingEvaluationData] = useState<any>(null);
  const [matchingError, setMatchingError] = useState<string | null>(null);

  // Upload Resumes Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setUploadFiles(prev => [...prev, ...selected]);
      setIsUploadModalOpen(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = Array.from(e.dataTransfer.files).filter(f =>
        f.name.toLowerCase().endsWith('.pdf') ||
        f.name.toLowerCase().endsWith('.docx') ||
        f.name.toLowerCase().endsWith('.txt')
      );
      if (dropped.length > 0) {
        setUploadFiles(prev => [...prev, ...dropped]);
        setIsUploadModalOpen(true);
      }
    }
  };

  const removeUploadFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getHeaders = useCallback(() => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
    return {
      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
    };
  }, [token]);

  const executeCvUpload = async () => {
    if (uploadFiles.length === 0) return;
    try {
      setIsUploading(true);
      setUploadError(null);

      const backendUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? '/api' : 'http://localhost:5000/api');
      const filesToProcess = [...uploadFiles];
      const totalFiles = filesToProcess.length;
      let completedCount = 0;
      let successCount = 0;
      let duplicateCount = 0;
      const failedFiles: { file: File; reason: string }[] = [];

      const CONCURRENCY = 4; // Process up to 4 files concurrently for instant 4-CV batch parsing
      let cursor = 0;

      const worker = async (): Promise<void> => {
        while (cursor < filesToProcess.length) {
          const fileIndex = cursor++;
          const currentFile = filesToProcess[fileIndex];
          if (!currentFile) break;

          setUploadStatusMsg(`Processing CV ${completedCount + 1} of ${totalFiles}: "${currentFile.name}"...`);

          try {
            const formData = new FormData();
            formData.append('files', currentFile);
            formData.append('jobId', 'pool');

            let res = await fetch(`${backendUrl}/candidates/upload`, {
              method: 'POST',
              headers: getHeaders(),
              body: formData,
            }).catch(() => null);

            if (!res || !res.ok) {
              res = await fetch('/api/candidates/upload', {
                method: 'POST',
                headers: getHeaders(),
                body: formData,
              }).catch(() => null);
            }

            if (!res) {
              throw new Error('Unable to contact candidate upload server.');
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data.error || `Server error (${res.status})`);
            }

            const isDuplicate = data.status === 'duplicate' || data.isDuplicate || data.candidates?.[0]?.isDuplicate || data.candidates?.[0]?.status === 'duplicate';
            const isFailed = data.candidates?.[0]?.parsingStatus === 'FAILED' || data.candidates?.[0]?.status === 'failed';

            if (isDuplicate) {
              duplicateCount++;
              console.log(`[Batch Pool Upload] file=${currentFile.name} size=${currentFile.size} status=duplicate`);
            } else if (isFailed) {
              const reason = data.candidates?.[0]?.errorMessage || 'Parsing failed';
              failedFiles.push({ file: currentFile, reason });
              console.warn(`[Batch Pool Upload] file=${currentFile.name} size=${currentFile.size} status=failed reason="${reason}"`);
            } else {
              successCount++;
              console.log(`[Batch Pool Upload] file=${currentFile.name} size=${currentFile.size} status=success`);
            }
          } catch (fileErr: any) {
            console.error(`[Batch Pool Upload] file=${currentFile.name} size=${currentFile.size} status=failed reason="${fileErr.message}"`);
            failedFiles.push({ file: currentFile, reason: fileErr.message || 'Upload error' });
          } finally {
            completedCount++;
            setUploadStatusMsg(`Processed ${completedCount} of ${totalFiles} CVs (${successCount} added, ${duplicateCount} duplicate, ${failedFiles.length} failed)`);
          }
        }
      };

      // Run workers concurrently
      const workers = Array.from({ length: Math.min(CONCURRENCY, filesToProcess.length) }, () => worker());
      await Promise.all(workers);

      // Refresh candidate list so any successful candidates appear immediately
      fetchCandidates();

      if (failedFiles.length === 0) {
        setUploadStatusMsg(`✓ All ${totalFiles} CVs processed successfully (${successCount} added${duplicateCount > 0 ? `, ${duplicateCount} already existed` : ''})!`);
        setTimeout(() => {
          setIsUploadModalOpen(false);
          setUploadFiles([]);
          setUploadStatusMsg('');
        }, 1200);
      } else {
        setUploadError(`${failedFiles.length} of ${totalFiles} CV(s) failed: ${failedFiles.map(f => `"${f.file.name}" (${f.reason})`).join(', ')}. Successful candidates have been saved.`);
        setUploadFiles(failedFiles.map(f => f.file));
      }
    } catch (err: any) {
      console.error('Batch CV upload error:', err);
      setUploadError(err.message || 'Error occurred while uploading CVs.');
    } finally {
      setIsUploading(false);
    }
  };

  // Fetch all candidate records from database and local caches
  const fetchCandidates = useCallback(async () => {
    try {
      setIsLoading(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const headers = getHeaders();

      let res = await fetch(`${backendUrl}/candidates`, { headers }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${backendUrl}/jobs/all/candidates`, { headers }).catch(() => null);
      }
      if (!res || !res.ok) {
        res = await fetch('/api/candidates', { headers }).catch(() => null);
      }

      let rawList: any[] = [];
      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        rawList = data.candidates || data.data || [];
      }

      // Merge candidates saved in browser localStorage across jobs and pool
      // Merge candidates saved in browser localStorage only if belonging to current organization
      const currentOrgId = user?.organizationId || 'org-tasknera';
      const isSuperAdmin = user?.role === 'SUPER_ADMIN';

      if (typeof window !== 'undefined') {
        try {
          const localPool = JSON.parse(localStorage.getItem('tasknera_candidates_pool') || '[]');
          if (Array.isArray(localPool)) {
            for (const lc of localPool) {
              const lcOrgId = lc.organizationId || 'org-tasknera';
              if (!isSuperAdmin && lcOrgId !== currentOrgId) continue;
              if (!rawList.some((r: any) => r.id === lc.id || (r.fileName && r.fileName === lc.fileName))) {
                rawList.unshift(lc);
              }
            }
          }

          // Check all job-specific candidate storage keys
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('tasknera_candidates_') && key !== 'tasknera_candidates_pool') {
              try {
                const jobCands = JSON.parse(localStorage.getItem(key) || '[]');
                if (Array.isArray(jobCands)) {
                  for (const jc of jobCands) {
                    const jcOrgId = jc.organizationId || 'org-tasknera';
                    if (!isSuperAdmin && jcOrgId !== currentOrgId) continue;
                    if (!rawList.some((r: any) => r.id === jc.id || (r.fileName && r.fileName === jc.fileName))) {
                      rawList.push(jc);
                    }
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      if (rawList && rawList.length > 0) {
        const mapped: CandidateItem[] = rawList.map((c: any) => {
          const skillsList = Array.isArray(c.skills)
            ? c.skills.map((s: any) => (typeof s === 'string' ? s : s.skill_name || s.name || ''))
            : [];

          const expList = Array.isArray(c.experiences || c.experience)
            ? (c.experiences || c.experience).map((e: any) => ({
              title: e.title || e.role || 'Software Role',
              company: e.company || 'Company',
              duration: e.duration || (e.start_date ? `${e.start_date} - ${e.end_date || 'Present'}` : ''),
              startDate: e.startDate || e.start_date || '',
              endDate: e.endDate || e.end_date || '',
              description: e.description || e.responsibilities || ''
            }))
            : [];

          const eduList = Array.isArray(c.education)
            ? c.education.map((ed: any) => ({
              degree: ed.degree || 'Degree',
              institution: ed.institution || ed.school || 'University',
              field: ed.field || ed.major || '',
              year: ed.year || (ed.graduation_date ? String(ed.graduation_date) : '')
            }))
            : [];

          const uniqueCompanies = new Set(expList.map((e: any) => (e.company || '').trim().toLowerCase()).filter(Boolean));
          const companyCount = uniqueCompanies.size > 0 ? uniqueCompanies.size : (c.companyCount || 1);

          const computedGaps = computeCareerGaps(expList);
          const gapAnalysis = c.gapAnalysis || computedGaps;

          return {
            id: c.id || Math.random().toString(),
            jobId: c.job_id || c.jobId || 'jd-1',
            name: c.name || c.fileName || 'Candidate Profile',
            role: c.current_title || c.currentTitle || c.role || 'Software Professional',
            email: c.email || 'N/A',
            phone: c.phone || 'N/A',
            location: c.location || 'Remote',
            exp: typeof c.totalExperienceYears === 'number' && c.totalExperienceYears > 0
              ? `${c.totalExperienceYears} yrs`
              : (c.totalExperience || c.total_experience || c.exp || `${Math.max(1, expList.length * 2)} yrs`),
            companyCount,
            match: typeof c.matchScore === 'number' ? c.matchScore : (c.match || 75),
            decision: c.recommendation || c.decision || 'REVIEW',
            jobs: c.applicationsCount || c.jobs || 1,
            skills: skillsList.length > 0 ? skillsList : ['Problem Solving', 'Communication', 'Software Development'],
            education: eduList,
            experience: expList,
            gapAnalysis,
            certifications: Array.isArray(c.certifications) ? c.certifications.map((ct: any) => typeof ct === 'string' ? ct : ct.name) : [],
            languages: Array.isArray(c.languages) ? c.languages.map((l: any) => typeof l === 'string' ? l : l.name) : [],
            summary: c.summary || '',
            rawText: c.raw_text || c.rawText || '',
            fileName: c.fileName || c.resume_file_url || '',
            parsingStatus: c.parsing_status || c.parsingStatus || 'PARSED',
            rawCandidate: c
          };
        });

        // Deduplicate mapped candidates by id or fileName
        const seen = new Set<string>();
        const uniqueMapped: CandidateItem[] = [];
        for (const item of mapped) {
          const key = (item.email && item.email !== 'N/A' ? item.email.toLowerCase() : '') || item.fileName || item.id;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueMapped.push(item);
          }
        }

        setAllCandidates(uniqueMapped);
      } else {
        setAllCandidates([]);
      }
    } catch (err) {
      console.error('Failed to fetch candidate pool from database:', err);
      setAllCandidates([]);
    } finally {
      setIsLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Fetch Candidate Evaluation History for the Profile Drawer
  const fetchCandidateHistory = useCallback(async (candidateId: string) => {
    try {
      setIsLoadingHistory(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const res = await fetch(`${backendUrl}/candidates/${candidateId}/evaluations`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCandidateHistory(data.evaluations || []);
      } else {
        setCandidateHistory([]);
      }
    } catch (err) {
      console.error('Failed to fetch candidate evaluation history:', err);
      setCandidateHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [getHeaders]);

  // When drawer opens, load history if history tab or default
  useEffect(() => {
    if (selectedCandidate?.id) {
      fetchCandidateHistory(selectedCandidate.id);
    } else {
      setCandidateHistory([]);
    }
  }, [selectedCandidate, fetchCandidateHistory]);

  // Prompt delete
  const promptDeleteCandidate = (candidate: CandidateItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCandidateToDelete(candidate);
  };

  // Confirm delete candidate
  const confirmDeleteCandidate = async () => {
    if (!candidateToDelete) return;
    try {
      setIsDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const res = await fetch(`${backendUrl}/candidates/${candidateToDelete.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      if (!res.ok) {
        await fetch(`${backendUrl}/jobs/${candidateToDelete.jobId}/candidates/${candidateToDelete.id}`, {
          method: 'DELETE',
          headers: getHeaders(),
        }).catch(() => null);
      }

      setAllCandidates(prev => prev.filter(c => c.id !== candidateToDelete.id));
      if (selectedCandidate?.id === candidateToDelete.id) {
        setSelectedCandidate(null);
      }

      // Synchronize and clean up local storage caches for this candidate across jobs
      if (typeof window !== 'undefined') {
        try {
          if (candidateToDelete.jobId) {
            const jobCandKey = `tasknera_candidates_${candidateToDelete.jobId}`;
            const existing = JSON.parse(localStorage.getItem(jobCandKey) || '[]');
            const filtered = existing.filter((c: any) => c.id !== candidateToDelete.id);
            localStorage.setItem(jobCandKey, JSON.stringify(filtered));
            localStorage.setItem(`tasknera_candidates_count_${candidateToDelete.jobId}`, String(filtered.length));
            localStorage.removeItem(`tasknera_decision_${candidateToDelete.jobId}_${candidateToDelete.id}`);
          }
          localStorage.removeItem(`tasknera_decision_${candidateToDelete.id}`);
        } catch {}
      }

      setCandidateToDelete(null);
    } catch (err) {
      console.error('Failed to delete candidate:', err);
      alert('Failed to delete candidate. Please check server logs.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open "Match with JD" Modal (ENTRY POINT 2)
  const openMatchWithJdModal = async (candidate: CandidateItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMatchingCandidate(candidate);
    setSelectedJobId('');
    setMatchModalStep('select-job');
    setMatchingError(null);
    setJobSearch('');
    setExistingEvaluationData(null);

    try {
      setIsLoadingJobs(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const res = await fetch(`${backendUrl}/jobs/available-for-evaluation`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAvailableJobs(data.jobs || []);
      } else {
        const fallbackRes = await fetch(`${backendUrl}/jobs`, { headers: getHeaders() });
        if (fallbackRes.ok) {
          const fbData = await fallbackRes.json();
          const mappedJobs: AvailableJob[] = (fbData.jobs || []).map((j: any) => ({
            id: j.id,
            position: j.position || 'Software Role',
            client: j.client || 'Enterprise Client',
            company: j.client || 'Enterprise Client',
            location: j.location || 'Remote',
            workMode: j.work_mode || 'Full-time',
            status: j.status || 'published',
            requirementsCount: j.requirements ? j.requirements.length : 0,
            requirementsConfirmed: Boolean(j.requirements && j.requirements.length > 0),
            candidatesCount: j.candidatesCount || 0
          }));
          setAvailableJobs(mappedJobs);
        }
      }
    } catch (err) {
      console.error('Failed to load available jobs:', err);
      setAvailableJobs([]);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  // Execute Match Evaluation against selected Job Description
  const executeMatchEvaluation = async (forceReevaluate = false) => {
    if (!matchingCandidate || !selectedJobId) return;

    try {
      setMatchModalStep('processing');
      setMatchingError(null);
      setEvaluationProcessingStage('cv');

      // Visual stage progression
      setTimeout(() => setEvaluationProcessingStage('matching'), 500);
      setTimeout(() => setEvaluationProcessingStage('scoring'), 1000);

      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const res = await fetch(`${backendUrl}/candidates/${matchingCandidate.id}/match-with-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({
          jobId: selectedJobId,
          reevaluate: forceReevaluate
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setMatchingError(data.message || data.error || 'Failed to evaluate candidate against job requirements.');
        setMatchModalStep('select-job');
        return;
      }

      if (data.alreadyEvaluated && !forceReevaluate) {
        setExistingEvaluationData(data);
        setMatchModalStep('already-evaluated');
        return;
      }

      // Evaluation complete -> navigate to Job Evaluation Workspace
      setTimeout(() => {
        const targetJobId = selectedJobId;
        const targetCandId = matchingCandidate.id;
        setMatchingCandidate(null);
        router.push(`/jobs/${targetJobId}/candidates?candidateId=${targetCandId}`);
      }, 1400);
    } catch (err: any) {
      console.error('Match evaluation failed:', err);
      setMatchingError(err.message || 'Network error communicating with the ATS evaluation engine.');
      setMatchModalStep('select-job');
    }
  };

  // Filtered candidates in Pool
  const filtered = useMemo(() => {
    return allCandidates.filter(c => {
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.role.toLowerCase().includes(search.toLowerCase()) ||
        c.skills.some(s => s.toLowerCase().includes(search.toLowerCase())) ||
        c.location.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'All' || c.decision === filter;
      return matchSearch && matchFilter;
    });
  }, [allCandidates, search, filter]);

  // Filtered available jobs in Match Modal
  const filteredAvailableJobs = useMemo(() => {
    return availableJobs.filter(j => {
      const q = jobSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        j.position.toLowerCase().includes(q) ||
        (j.client && j.client.toLowerCase().includes(q)) ||
        (j.company && j.company.toLowerCase().includes(q)) ||
        (j.location && j.location.toLowerCase().includes(q))
      );
    });
  }, [availableJobs, jobSearch]);

  const selectedJobObject = useMemo(() => {
    return availableJobs.find(j => j.id === selectedJobId) || null;
  }, [availableJobs, selectedJobId]);

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-800 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#1E293B]">
                Central Candidate Pool
              </h1>
              <span className="px-3 py-1 bg-brand-orange-pale text-brand-orange text-xs font-bold rounded-full border border-brand-orange-border">
                {allCandidates.length} Resumes in Database
              </span>
            </div>
            <p className="text-slate-500 text-xs md:text-sm mt-1">
              Browse candidate profiles parsed across all jobs & JDs. Select any candidate to evaluate specifically against a Job Description.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl transition-all shadow-orange hover:shadow-orange-lg hover:-translate-y-0.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Upload Resumes / Add CVs</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-4 md:p-5 mb-8 shadow-xs">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">

            {/* Search Input */}
            <div className="relative flex-1">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search candidates by name, role, skills, or location..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#F8FAFC] border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-orange focus:bg-white transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-[#F8FAFC] p-1 rounded-2xl border border-slate-200 self-end md:self-auto">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white text-brand-orange shadow-2xs' : 'text-slate-400 hover:text-slate-600'
                  }`}
                title="Table View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white text-brand-orange shadow-2xs' : 'text-slate-400 hover:text-slate-600'
                  }`}
                title="Grid Cards View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white border border-slate-200/90 rounded-3xl p-16 text-center shadow-xs">
            <div className="w-10 h-10 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-500 font-bold text-xs">Loading Candidate Pool from PostgreSQL...</p>
          </div>
        )}

        {/* Candidate Table View */}
        {!isLoading && viewMode === 'table' && filtered.length > 0 && (
          <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-[#F8FAFC] text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-4">Candidate</th>
                    <th className="px-6 py-4">Experience</th>
                    <th className="px-6 py-4">Extracted Skills</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filtered.map((c, idx) => (
                    <tr
                      key={`${c.id}-${idx}`}
                      className="hover:bg-amber-50/30 transition-colors group cursor-pointer"
                      onClick={() => setSelectedCandidate(c)}
                    >
                      {/* Candidate Column */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-2xl font-extrabold text-sm flex items-center justify-center ${avatarColor(c.name)} shadow-2xs border flex-shrink-0`}>
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-[#1E293B] text-sm group-hover:text-brand-orange transition-colors">
                              {c.name}
                            </div>
                            <div className="text-slate-500 text-[11px] font-medium">
                              {c.role} • <span className="text-slate-400">{c.location}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Experience Column */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">{c.exp}</div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {c.companyCount} {c.companyCount === 1 ? 'Company' : 'Companies'}
                          {c.gapAnalysis?.hasGap && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                              ⚠️ Gap
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Skills Column */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {c.skills.slice(0, 5).map((s, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700"
                            >
                              {s}
                            </span>
                          ))}
                          {c.skills.length > 5 && (
                            <span className="px-2 py-0.5 bg-slate-200 rounded-md text-[10px] font-bold text-slate-600">
                              +{c.skills.length - 5}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action Column — MATCH WITH JD primary action */}
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => openMatchWithJdModal(c, e)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl transition-all shadow-orange cursor-pointer hover:shadow-orange-lg hover:-translate-y-0.5"
                            title="Evaluate candidate specifically against a Job Description"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span>MATCH WITH JD</span>
                          </button>

                          <button
                            onClick={() => setSelectedCandidate(c)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-200 cursor-pointer"
                            title="View candidate details and history"
                          >
                            View Profile
                          </button>

                          <button
                            onClick={(e) => promptDeleteCandidate(c, e)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                            title="Delete candidate profile from database"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Candidate Grid View */}
        {!isLoading && viewMode === 'grid' && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((c, idx) => (
              <div key={`${c.id}-${idx}`} className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl font-extrabold text-base flex items-center justify-center ${avatarColor(c.name)} shadow-2xs border`}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-[#1E293B] text-base">{c.name}</h3>
                        <p className="text-xs text-slate-500">{c.role}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-slate-200 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Experience & Companies:</span>
                      <span className="font-bold text-slate-800">
                        {c.exp} • ({c.companyCount} {c.companyCount === 1 ? 'Company' : 'Companies'})
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Extracted Skills</div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.skills.slice(0, 6).map((s, i) => (
                        <span key={i} className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
                          {s}
                        </span>
                      ))}
                      {c.skills.length > 6 && (
                        <span className="px-2 py-1 bg-slate-200 rounded-lg text-xs font-bold text-slate-600">
                          +{c.skills.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 font-medium truncate max-w-[100px]">{c.location}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => openMatchWithJdModal(c, e)}
                      className="px-3 py-1.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl transition-all shadow-orange cursor-pointer flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>MATCH</span>
                    </button>
                    <button
                      onClick={() => setSelectedCandidate(c)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-200 cursor-pointer"
                    >
                      Profile
                    </button>
                    <button
                      onClick={(e) => promptDeleteCandidate(c, e)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-slate-200"
                      title="Delete candidate profile from database"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filtered.length === 0 && (
          <div className="bg-white border border-slate-200/90 rounded-3xl text-center py-20 shadow-xs mt-4 px-6">
            <div className="w-16 h-16 rounded-3xl bg-brand-orange-pale text-brand-orange flex items-center justify-center mx-auto mb-4 border border-brand-orange-border">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#1E293B] mb-1">
              {allCandidates.length === 0 ? 'No CVs uploaded in the database yet' : 'No matching candidate profiles found'}
            </h3>
            <p className="text-slate-500 text-xs max-w-md mx-auto">
              {allCandidates.length === 0
                ? 'Upload resume files to any active job opening using the button above. They will be stored in PostgreSQL and listed in this central candidate pool.'
                : 'Try adjusting your search terms.'}
            </p>
          </div>
        )}

        {/* ── MATCH CANDIDATE WITH JD MODAL (ENTRY POINT 2) ── */}
        {matchingCandidate && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-scaleUp flex flex-col max-h-[90vh]">

              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 bg-[#F8FAFC] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold text-brand-orange uppercase tracking-wider block">
                    Candidate Pool Matching Workflow
                  </span>
                  <h2 className="text-lg font-black text-slate-900 mt-0.5">
                    Match Candidate with Job Description
                  </h2>
                </div>
                {matchModalStep !== 'processing' && (
                  <button
                    onClick={() => setMatchingCandidate(null)}
                    className="w-8 h-8 rounded-xl bg-slate-200/70 text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center text-sm cursor-pointer transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Candidate Info Banner */}
              <div className="px-6 py-3.5 bg-amber-50/50 border-b border-amber-100/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center ${avatarColor(matchingCandidate.name)} border`}>
                    {matchingCandidate.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">{matchingCandidate.name}</span>
                    <span className="text-slate-500 text-[11px] font-medium">{matchingCandidate.role} • {matchingCandidate.exp}</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-extrabold uppercase tracking-wider">
                  CV Ready ({matchingCandidate.skills.length} Skills)
                </span>
              </div>

              {/* Error Notice */}
              {matchingError && (
                <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
                  <span className="text-rose-600 font-bold">⚠️</span>
                  <span>{matchingError}</span>
                </div>
              )}

              {/* ── STEP 1: SELECT JOB DESCRIPTION ── */}
              {matchModalStep === 'select-job' && (
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                      Select Job Description to evaluate against:
                    </label>
                    <div className="relative">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        value={jobSearch}
                        onChange={(e) => setJobSearch(e.target.value)}
                        placeholder="Search jobs by position title, client, or location..."
                        className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-brand-orange"
                      />
                    </div>
                  </div>

                  {isLoadingJobs ? (
                    <div className="py-12 text-center">
                      <div className="w-8 h-8 border-2 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-xs text-slate-500 font-medium">Fetching authorized jobs & JDs...</p>
                    </div>
                  ) : filteredAvailableJobs.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="text-xs font-bold text-slate-600 mb-1">No matching Job Descriptions found</p>
                      <p className="text-[11px] text-slate-400">Upload a Job Description (JD) with confirmed requirements to enable evaluation.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {filteredAvailableJobs.map(job => {
                        const isSelected = selectedJobId === job.id;
                        const isConfirmed = job.requirementsConfirmed && job.requirementsCount > 0;

                        return (
                          <div
                            key={job.id}
                            onClick={() => {
                              if (isConfirmed) setSelectedJobId(job.id);
                            }}
                            className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${!isConfirmed
                                ? 'bg-slate-50/70 border-slate-200 opacity-60 cursor-not-allowed'
                                : isSelected
                                  ? 'bg-amber-50/60 border-brand-orange shadow-xs cursor-pointer ring-1 ring-brand-orange'
                                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 cursor-pointer'
                              }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="radio"
                                name="selectedJob"
                                checked={isSelected}
                                disabled={!isConfirmed}
                                onChange={() => {
                                  if (isConfirmed) setSelectedJobId(job.id);
                                }}
                                className="mt-1 accent-brand-orange cursor-pointer"
                              />
                              <div>
                                <h4 className="font-extrabold text-sm text-slate-900">{job.position}</h4>
                                <div className="text-xs font-bold text-brand-orange mt-0.5">{job.client || job.company}</div>
                                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                                  <span>📍 {job.location || 'Remote'}</span>
                                  <span>•</span>
                                  <span>💼 {job.workMode || 'Full-time'}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right flex-shrink-0">
                              {isConfirmed ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-extrabold">
                                  ✓ {job.requirementsCount} Requirements
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-[10px] font-extrabold">
                                  ⚠️ Requirements Not Confirmed
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Modal Step 1 Footer */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setMatchingCandidate(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!selectedJobId}
                      onClick={() => setMatchModalStep('confirm')}
                      className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-all shadow-orange cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Continue to Confirmation</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 2: CONFIRMATION / READY TO EVALUATE ── */}
              {matchModalStep === 'confirm' && selectedJobObject && (
                <div className="p-6 space-y-5">
                  <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-5 space-y-3">
                    <div className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                      Evaluation Job Summary
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                      <div>
                        <span className="text-slate-400 font-bold block text-[11px]">Candidate:</span>
                        <span className="font-extrabold text-slate-900 text-sm">{matchingCandidate.name}</span>
                        <span className="text-slate-500 block text-[11px]">{matchingCandidate.role}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[11px]">Target Job:</span>
                        <span className="font-extrabold text-slate-900 text-sm">{selectedJobObject.position}</span>
                        <span className="text-brand-orange font-bold block text-[11px]">{selectedJobObject.client || selectedJobObject.company}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">Confirmed JD Criteria:</span>
                      <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-900 font-black rounded-md text-[11px] border border-emerald-300">
                        {selectedJobObject.requirementsCount} Confirmed Requirements
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
                    <div className="font-black text-amber-950 flex items-center gap-1.5">
                      ⚡ Deterministic ATS Evaluation Pipeline
                    </div>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      The candidate's existing parsed CV profile will be evaluated specifically against the confirmed requirements of this Job Description without modifying or reparsing existing documents.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setMatchModalStep('select-job')}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      ← Back to Job Selection
                    </button>
                    <button
                      type="button"
                      onClick={() => executeMatchEvaluation(false)}
                      className="px-6 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl transition-all shadow-orange cursor-pointer flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Evaluate Candidate</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: PROCESSING STATE ── */}
              {matchModalStep === 'processing' && (
                <div className="p-10 text-center space-y-6">
                  <div className="w-14 h-14 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto" />

                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Evaluating {matchingCandidate.name}...
                    </h3>
                    <p className="text-xs text-brand-orange font-bold mt-0.5">
                      Against: {selectedJobObject?.position} ({selectedJobObject?.client})
                    </p>
                  </div>

                  <div className="max-w-sm mx-auto bg-[#F8FAFC] p-4 rounded-2xl border border-slate-200 text-left space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">1. Parsed CV Evidence Profile</span>
                      <span className="font-black text-emerald-600">✓ Loaded</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">2. JD Requirement Matching</span>
                      <span className={`font-black ${evaluationProcessingStage === 'cv' ? 'text-slate-400' : 'text-amber-600 animate-pulse'}`}>
                        {evaluationProcessingStage === 'cv' ? 'Waiting...' : 'Processing...'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">3. Deterministic ATS Scoring</span>
                      <span className={`font-black ${evaluationProcessingStage === 'scoring' ? 'text-amber-600 animate-pulse' : 'text-slate-400'}`}>
                        {evaluationProcessingStage === 'scoring' ? 'Computing...' : 'Waiting...'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 4: ALREADY EVALUATED STATE ── */}
              {matchModalStep === 'already-evaluated' && existingEvaluationData && (
                <div className="p-6 space-y-5">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 space-y-1">
                    <div className="font-black text-blue-950 flex items-center gap-1.5 text-sm">
                      ℹ️ Existing Evaluation Found
                    </div>
                    <p className="text-blue-800 leading-relaxed font-medium">
                      This candidate has already been evaluated against <strong className="text-blue-950 font-bold">"{selectedJobObject?.position}"</strong>.
                    </p>
                  </div>

                  <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Latest Recorded Score</span>
                      <span className="text-2xl font-black text-slate-900">
                        {Math.round(existingEvaluationData.overallScore)}%
                      </span>
                      <span className="text-xs font-bold text-slate-600 ml-2">
                        ({existingEvaluationData.matchLevel || 'EVALUATED'})
                      </span>
                    </div>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-xs rounded-xl">
                      ✓ Ready in Workspace
                    </span>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setMatchingCandidate(null)}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Close
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => executeMatchEvaluation(true)}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        ⚡ Re-evaluate Candidate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetJobId = selectedJobId;
                          const targetCandId = matchingCandidate.id;
                          setMatchingCandidate(null);
                          router.push(`/jobs/${targetJobId}/candidates?candidateId=${targetCandId}`);
                        }}
                        className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl transition-all shadow-orange cursor-pointer"
                      >
                        View Existing Evaluation →
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── CANDIDATE PROFILE SLIDE-OVER DRAWER ── */}
        {selectedCandidate && (
          <div
            className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex justify-end animate-fadeIn"
            onClick={() => setSelectedCandidate(null)}
          >
            <div
              className="w-full max-w-5xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                {/* Modal Header */}
                <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-[#F8FAFC] sticky top-0 z-10">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setSelectedCandidate(null)}
                      className="p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors flex items-center justify-center cursor-pointer"
                      title="Back to Candidate Pool"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </button>
                    <div className={`w-14 h-14 rounded-2xl font-extrabold text-xl flex items-center justify-center ${avatarColor(selectedCandidate.name)} shadow-2xs border`}>
                      {selectedCandidate.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-extrabold text-[#1E293B]">{selectedCandidate.name}</h2>
                      </div>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        {selectedCandidate.role} • {selectedCandidate.location}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setSelectedCandidate(null)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                      title="Back to Candidate Pool"
                    >
                      <span>←</span>
                      <span>Back</span>
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${selectedCandidate.name} | ${selectedCandidate.email} | ${selectedCandidate.phone}`);
                        setCopiedContact(true);
                        setTimeout(() => setCopiedContact(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      title="Copy contact information"
                    >
                      {copiedContact ? '✓ Copied' : 'Copy Contact'}
                    </button>
                    <button
                      onClick={() => setSelectedCandidate(null)}
                      className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center text-sm cursor-pointer transition-colors"
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Quick Info */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-6 border-b border-slate-100 bg-white text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Experience</span>
                    <span className="font-bold text-slate-800 mt-0.5 block">{selectedCandidate.exp}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Email</span>
                    <span className="font-bold text-slate-800 mt-0.5 block truncate" title={selectedCandidate.email}>{selectedCandidate.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone</span>
                    <span className="font-bold text-slate-800 mt-0.5 block truncate">{selectedCandidate.phone}</span>
                  </div>
                </div>

                {/* Tab Switcher */}
                <div className="px-6 pt-4 flex items-center gap-4 border-b border-slate-100 overflow-x-auto">
                  {[
                    { id: 'decision', label: 'Decision Intelligence' },
                    { id: 'summary', label: 'Executive Summary' },
                    { id: 'history', label: `Job Evaluations (${candidateHistory.length})` },
                    { id: 'experience', label: `Work History (${selectedCandidate.experience.length})` },
                    { id: 'skills', label: `Skills (${selectedCandidate.skills.length})` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`pb-3 text-xs font-bold transition-colors relative cursor-pointer whitespace-nowrap ${activeTab === tab.id ? 'text-brand-orange' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                      {tab.label}
                      {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-orange rounded-full" />}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="p-6">

                  {/* Decision Intelligence Tab */}
                  {activeTab === 'decision' && (
                    <div className="space-y-4">
                      {candidateHistory.length > 1 && (
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-xs">
                          <span className="font-bold text-slate-700">Requisition Context:</span>
                          <select
                            value={decisionJobId || (candidateHistory[0]?.jobId || '')}
                            onChange={(e) => setDecisionJobId(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer"
                          >
                            {candidateHistory.map((h, i) => (
                              <option key={i} value={h.jobId}>
                                {h.jobTitle || h.position} ({h.score !== null ? `${Math.round(h.score)}% ATS` : 'Pending'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <HireIQDecisionIntelligence
                        candidateId={selectedCandidate.id}
                        jobId={decisionJobId || (candidateHistory.length > 0 ? candidateHistory[0].jobId : selectedCandidate.jobId || undefined)}
                        fallbackCandidateName={selectedCandidate.name}
                        fallbackJobTitle={candidateHistory.length > 0 ? (candidateHistory[0].jobTitle || candidateHistory[0].position) : selectedCandidate.role}
                        fallbackScore={candidateHistory.length > 0 && candidateHistory[0].score !== null ? Math.round(candidateHistory[0].score) : undefined}
                        fallbackRecommendation={selectedCandidate.decision}
                      />
                    </div>
                  )}

                  {/* Executive Summary Tab */}
                  {activeTab === 'summary' && (
                    <div className="space-y-4">
                      {candidateHistory.length > 1 && (
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-xs mb-4">
                          <span className="font-bold text-slate-700">Requisition Context:</span>
                          <select
                            value={decisionJobId || (candidateHistory[0]?.jobId || '')}
                            onChange={(e) => setDecisionJobId(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer"
                          >
                            {candidateHistory.map((h, i) => (
                              <option key={i} value={h.jobId}>
                                {h.jobTitle || h.position} ({h.score !== null ? `${Math.round(h.score)}% ATS` : 'Pending'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <CandidateExecutiveSummary
                        candidateId={selectedCandidate.id}
                        jobId={decisionJobId || (candidateHistory.length > 0 ? candidateHistory[0].jobId : selectedCandidate.jobId || undefined)}
                        candidateName={selectedCandidate.name}
                        fallbackCandidate={selectedCandidate}
                      />
                    </div>
                  )}

                  {/* Overview Tab */}
                  {activeTab === 'overview' && (
                    <div className="space-y-6">
                      {selectedCandidate.summary && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Professional Summary</h4>
                          <p className="text-xs leading-relaxed text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200 whitespace-pre-line">
                            {selectedCandidate.summary}
                          </p>
                        </div>
                      )}

                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Education</h4>
                        {selectedCandidate.education.length > 0 ? (
                          <div className="space-y-3">
                            {selectedCandidate.education.map((edu, i) => (
                              <div key={i} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
                                <div className="font-bold text-[#1E293B]">{edu.degree}</div>
                                <div className="text-slate-600 mt-0.5 font-medium">{edu.institution} {edu.field ? `• ${edu.field}` : ''}</div>
                                {edu.year && <div className="text-[11px] text-slate-400 mt-1">Class of {edu.year}</div>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No formal education entries recorded.</p>
                        )}
                      </div>

                      {selectedCandidate.certifications && selectedCandidate.certifications.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Certifications</h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedCandidate.certifications.map((cert, i) => (
                              <span key={i} className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold">
                                🎖 {cert}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── JOB EVALUATION HISTORY TAB (MULTI-JOB ATS SCORES) ── */}
                  {activeTab === 'history' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                            Job-Specific ATS Evaluations
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            ATS match scores are specifically evaluated against each individual Job Description (JD).
                          </p>
                        </div>
                        <button
                          onClick={(e) => openMatchWithJdModal(selectedCandidate, e)}
                          className="px-3 py-1.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl transition-all shadow-orange cursor-pointer flex items-center gap-1"
                        >
                          <span>+ Match with New JD</span>
                        </button>
                      </div>

                      {isLoadingHistory ? (
                        <div className="py-8 text-center">
                          <div className="w-6 h-6 border-2 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <p className="text-xs text-slate-400">Loading evaluation history...</p>
                        </div>
                      ) : candidateHistory.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto font-black text-sm">
                            ⚡
                          </div>
                          <div>
                            <h5 className="font-bold text-slate-800 text-xs">No Job Evaluations Yet</h5>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              This candidate has not yet been matched against any confirmed Job Descriptions.
                            </p>
                          </div>
                          <button
                            onClick={(e) => openMatchWithJdModal(selectedCandidate, e)}
                            className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-extrabold rounded-xl transition-all shadow-orange cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <span>Match with a Job Description</span>
                            <span>→</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {candidateHistory.map((item, idx) => {
                            const scoreVal = item.score !== null ? Math.round(item.score) : null;
                            const scoreBadgeColor = scoreVal !== null
                              ? scoreVal >= 80
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : scoreVal >= 55
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-rose-100 text-rose-900 border-rose-300'
                              : 'bg-slate-100 text-slate-700 border-slate-200';

                            return (
                              <div
                                key={idx}
                                className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs hover:border-slate-300 transition-all flex items-center justify-between gap-4"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h5 className="font-extrabold text-slate-900 text-sm">{item.jobTitle || item.position}</h5>
                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                      {item.date}
                                    </span>
                                  </div>
                                  <div className="text-xs font-bold text-brand-orange mt-0.5">
                                    {item.client || item.company} • <span className="text-slate-500 font-normal">{item.location}</span>
                                  </div>
                                  <div className="mt-2 flex items-center gap-2">
                                    {scoreVal !== null ? (
                                      <>
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${scoreBadgeColor}`}>
                                          {scoreVal}% ATS
                                        </span>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                          scoreVal >= 70
                                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                            : scoreVal < 50
                                            ? 'bg-rose-100 text-rose-900 border-rose-300'
                                            : 'bg-amber-100 text-amber-900 border-amber-300'
                                        }`}>
                                          {scoreVal >= 70 ? '✓ ACCEPT' : scoreVal < 50 ? '✕ REJECT' : '⏳ REVIEW'}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                        Pending Evaluation
                                      </span>
                                    )}
                                    <span className="text-[11px] font-bold text-slate-500">
                                      Stage: {item.status || item.stage}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    onClick={() => {
                                      setDecisionJobId(item.jobId);
                                      setActiveTab('decision');
                                    }}
                                    className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                    title="View HireIQ Decision Intelligence breakdown"
                                  >
                                    <span>⚡ Intelligence</span>
                                  </button>
                                  <Link
                                    href={`/jobs/${item.jobId}/candidates?candidateId=${selectedCandidate.id}`}
                                    className="px-3.5 py-2 bg-slate-100 hover:bg-brand-orange hover:text-white text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-200 hover:border-transparent flex-shrink-0 cursor-pointer"
                                  >
                                    View Candidate →
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Experience Tab with Inline Between-Company Gap Display */}
                  {activeTab === 'experience' && (
                    <div className="space-y-4">
                      {selectedCandidate.gapAnalysis?.hasGap && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900 shadow-2xs">
                          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black flex-shrink-0 mt-0.5 border border-amber-200">
                            ⚠️
                          </div>
                          <div className="space-y-1">
                            <div className="font-black text-sm text-amber-950">
                              Career Gap Identified ({selectedCandidate.gapAnalysis.totalGapMonths} Months Total)
                            </div>
                            <div className="text-amber-800 leading-relaxed font-medium">
                              {selectedCandidate.gapAnalysis.statusText}
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedCandidate.experience.length > 0 ? (
                        selectedCandidate.experience.map((exp, i) => {
                          const nextExp = selectedCandidate.experience[i + 1];
                          const matchingGap = selectedCandidate.gapAnalysis?.gaps?.find(g => {
                            if (!g) return false;
                            const currentMatch = exp.company && g.fromCompany &&
                              (g.fromCompany.toLowerCase().includes(exp.company.toLowerCase()) || exp.company.toLowerCase().includes(g.fromCompany.toLowerCase()));
                            const nextMatch = nextExp?.company && g.toCompany &&
                              (g.toCompany.toLowerCase().includes(nextExp.company.toLowerCase()) || nextExp.company.toLowerCase().includes(g.toCompany.toLowerCase()));
                            return currentMatch || nextMatch;
                          });

                          return (
                            <React.Fragment key={i}>
                              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1.5 hover:border-slate-300 transition-colors">
                                <div className="flex items-center justify-between">
                                  <span className="font-extrabold text-[#1E293B] text-sm">{exp.title}</span>
                                  <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                    {exp.duration || (exp.startDate ? `${exp.startDate} - ${exp.endDate || 'Present'}` : 'Recorded Experience')}
                                  </span>
                                </div>
                                <div className="font-bold text-brand-orange">{exp.company}</div>
                                {exp.description && (
                                  <p className="text-slate-600 mt-2 leading-relaxed whitespace-pre-line text-xs">
                                    {exp.description}
                                  </p>
                                )}
                              </div>

                              {matchingGap && (
                                <div className="my-2 p-3 bg-amber-50/90 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-amber-900 shadow-2xs">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-lg bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                      ⏸
                                    </span>
                                    <div>
                                      <span className="font-black text-amber-950">
                                        {matchingGap.gapMonths} Months Career Gap
                                      </span>
                                      <span className="text-amber-800 ml-1.5 font-medium">
                                        ({matchingGap.startDate} → {matchingGap.endDate}) between {matchingGap.fromCompany} and {matchingGap.toCompany}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded-md text-[10px] font-extrabold uppercase tracking-wider">
                                    Gap Detected
                                  </span>
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-400 italic">No detailed work experience parsed.</p>
                      )}
                    </div>
                  )}

                  {/* Skills Tab */}
                  {activeTab === 'skills' && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">All Extracted Competencies</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedCandidate.skills.map((skill, i) => (
                          <span key={i} className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw Resume Text Tab */}
                  {activeTab === 'resume' && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Original Extracted Document Text</h4>
                      <pre className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-[11px] font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed border border-slate-800">
                        {selectedCandidate.rawText || 'No raw text stream available for this record.'}
                      </pre>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-100 bg-[#F8FAFC] flex items-center justify-between gap-3">
                <button
                  onClick={() => promptDeleteCandidate(selectedCandidate)}
                  className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Delete from Database</span>
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedCandidate(null)}
                    className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>← Close</span>
                  </button>
                  <button
                    onClick={(e) => {
                      const cand = selectedCandidate;
                      setSelectedCandidate(null);
                      openMatchWithJdModal(cand, e);
                    }}
                    className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl transition-all shadow-orange cursor-pointer flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>MATCH WITH JD</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── DATABASE DELETION CONFIRMATION CARD MODAL ── */}
        {candidateToDelete && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-100 animate-scaleUp">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-5 border border-rose-100 shadow-2xs">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>

              <h3 className="text-xl font-black text-slate-900 mb-2">Delete from Database?</h3>

              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                Are you sure you want to permanently delete candidate profile <strong className="text-slate-900 font-bold">"{candidateToDelete.name}"</strong>?
              </p>

              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 mb-6 text-xs text-amber-900 space-y-1">
                <div className="font-extrabold flex items-center gap-1.5 text-amber-950">
                  <svg className="w-4 h-4 text-amber-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Permanent PostgreSQL Deletion
                </div>
                <div className="text-amber-800 leading-normal">
                  All extracted skills, work experiences, and parsed resume data for this candidate will be deleted from the database.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCandidateToDelete(null)}
                  disabled={isDeleting}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteCandidate}
                  disabled={isDeleting}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Deleting from DB...</span>
                    </>
                  ) : (
                    <span>Yes, Delete Data</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── UPLOAD RESUMES / ADD CVS MODAL ── */}
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-slate-100 animate-scaleUp">

              <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Add CVs to Candidate Pool</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Upload resume files to parse and store candidate profiles.</p>
                </div>
                {!isUploading && (
                  <button
                    onClick={() => {
                      setIsUploadModalOpen(false);
                      setUploadFiles([]);
                      setUploadError(null);
                    }}
                    className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {uploadError && (
                <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-2">
                  <span className="text-rose-600 font-bold">⚠️</span>
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Drag & Drop Area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-brand-orange bg-[#F8FAFC] hover:bg-amber-50/40 rounded-2xl p-8 text-center cursor-pointer transition-all mb-5 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-brand-orange-pale text-brand-orange flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h4 className="text-xs font-black text-slate-900 mb-1">
                  Click to browse or drag & drop resume files
                </h4>
                <p className="text-[11px] text-slate-400">
                  Supported formats: PDF, DOCX, TXT (Up to 25MB each)
                </p>
              </div>

              {/* Selected Files List */}
              {uploadFiles.length > 0 && (
                <div className="mb-5 space-y-2 max-h-48 overflow-y-auto pr-1">
                  <div className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                    Selected Files ({uploadFiles.length})
                  </div>
                  {uploadFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                          📄
                        </span>
                        <span className="font-bold text-slate-800 truncate max-w-[240px]" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          ({(file.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>
                      {!isUploading && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeUploadFile(idx);
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Progress Feedback */}
              {uploadStatusMsg && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 text-center flex items-center justify-center gap-2">
                  {isUploading && <div className="w-3.5 h-3.5 border-2 border-brand-orange border-t-transparent rounded-full animate-spin" />}
                  <span>{uploadStatusMsg}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    setUploadFiles([]);
                    setUploadError(null);
                  }}
                  disabled={isUploading}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeCvUpload}
                  disabled={uploadFiles.length === 0 || isUploading}
                  className="px-6 py-2.5 bg-brand-orange hover:bg-brand-orange-hover disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-all shadow-orange cursor-pointer flex items-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Parsing & Storing...</span>
                    </>
                  ) : (
                    <span>Upload & Parse CVs ({uploadFiles.length})</span>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
