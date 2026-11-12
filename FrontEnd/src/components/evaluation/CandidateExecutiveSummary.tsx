'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { buildExecutiveSummaryPdf } from '@/lib/clientPdfGenerator';

export interface CandidateOverview {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  currentDesignation: string;
  currentCompany: string;
  totalExperience: string;
  relevantExperience: string;
  highestQualification: string;
  primarySkills: string[];
  noticePeriod: string;
  expectedSalary: string;
  resumeFileName: string;
  generatedAt: string;
}

export interface ExperienceRole {
  title: string;
  company: string;
  period: string;
  responsibilities: string[];
  technologies: string[];
  achievements: string[];
}

export interface SkillItem {
  name: string;
  evidence: string;
}

export interface KeySkillsSection {
  requiredSkillsFound: SkillItem[];
  preferredSkillsFound: SkillItem[];
  additionalRelevantSkills: string[];
  requiredSkillsNotFound: string[];
  skillsRequiringVerification: { name: string; reason: string }[];
}

export interface ProjectItem {
  name: string;
  purpose: string;
  role: string;
  technologies: string[];
  contributions: string;
  outcomes: string;
}

export interface EducationItem {
  degree: string;
  institution: string;
  year: string;
  certifications: string[];
}

export interface InterviewQuestion {
  question: string;
  category: 'Technical' | 'Project Validation' | 'Mandatory Skill Check' | 'Scenario';
  whatToVerify: string;
}

export interface FinalAssessment {
  classification: 'Strong Match' | 'Potential Match' | 'Low Evidence of Match';
  topReasons: string[];
  mainConcerns: string[];
  suggestedNextStep: 'Shortlist for Interview' | 'Recruiter Review Required' | 'Not Recommended for This JD';
  disclaimer: string;
}

export interface CandidateSummaryData {
  candidateId: string;
  jobId?: string;
  jobTitle?: string;
  jobClient?: string;
  atsScore: number;
  overview: CandidateOverview;
  professionalSummary: string;
  experienceAnalysis: {
    totalExperience: string;
    relevantExperience: string;
    roles: ExperienceRole[];
  };
  keySkills: KeySkillsSection;
  pros: string[];
  cons: string[];
  jdMatchAnalysis: {
    atsScore: number;
    jobTitle: string;
    requiredSkillsMatched: string[];
    requiredSkillsNotEvidenced: string[];
    preferredSkillsMatched: string[];
    experienceComparison: string;
    educationMatched: string;
    suitabilityExplanation: string;
  };
  projects: ProjectItem[];
  education: EducationItem[];
  interviewQuestions: InterviewQuestion[];
  finalAssessment: FinalAssessment;
  metadata: {
    generatedAt: string;
    generatedBy?: string;
    sourceResumeFile: string;
    aiModel: string;
    isCached: boolean;
  };
}

interface CandidateExecutiveSummaryProps {
  candidateId: string;
  jobId?: string;
  candidateName?: string;
  fallbackCandidate?: Record<string, any>;
}

const summaryCache = new Map<string, CandidateSummaryData>();
const summaryRequests = new Map<string, Promise<CandidateSummaryData>>();

function getSummaryCacheKey(candidateId: string, jobId?: string) {
  return `${candidateId}:${jobId || 'candidate'}`;
}

function buildProfileSummary(
  candidateId: string,
  jobId: string | undefined,
  candidateName: string | undefined,
  source: Record<string, any>
): CandidateSummaryData {
  const candidate = source.rawCandidate || source;
  const rawSkills = Array.isArray(candidate.skills) && candidate.skills.length ? candidate.skills : source.skills || [];
  const skills = (Array.isArray(rawSkills) ? rawSkills : [])
    .map((item: any) => typeof item === 'string' ? item : item?.skill || item?.skill_name || item?.name)
    .filter((item: any): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item: string) => item.trim());
  const rawExperience = candidate.experiences?.length ? candidate.experiences : candidate.experience?.length ? candidate.experience : source.experience || [];
  const rawEducation = candidate.education?.length ? candidate.education : source.education || [];
  const rawProjects = candidate.projects || source.projects || [];
  const fullName = candidate.name || source.name || candidateName || 'Candidate';
  const currentDesignation = candidate.current_title || candidate.currentTitle || candidate.role || source.role || 'Not listed';
  const currentCompany = candidate.current_company || candidate.currentCompany || source.currentCompany || 'Not listed';
  const totalExperience = String(candidate.totalExperienceYears ?? candidate.total_experience ?? candidate.totalExperience ?? source.totalExperience ?? source.exp ?? 'Not listed');
  const score = Number(candidate.atsScore ?? candidate.matchScore ?? candidate.match ?? source.atsScore ?? source.matchScore ?? 0) || 0;
  const education = Array.isArray(rawEducation) ? rawEducation : [];
  const experience = Array.isArray(rawExperience) ? rawExperience : [];
  const qualification = education[0]?.degree || education[0]?.qualification || 'Not listed';
  const primarySkills = skills.slice(0, 6);
  const generatedAt = new Date().toISOString();
  const profileSummary = candidate.professionalSummary || candidate.summary || source.summary;
  const classification: FinalAssessment['classification'] = score >= 80 ? 'Strong Match' : score >= 60 ? 'Potential Match' : 'Low Evidence of Match';
  const suggestedNextStep: FinalAssessment['suggestedNextStep'] = score >= 80 ? 'Shortlist for Interview' : score >= 60 ? 'Recruiter Review Required' : 'Not Recommended for This JD';

  return {
    candidateId,
    jobId,
    jobTitle: candidate.jobTitle || candidate.job?.position || source.jobTitle,
    jobClient: candidate.jobClient || candidate.job?.client,
    atsScore: score,
    overview: {
      fullName,
      email: candidate.email || source.email || 'Not listed',
      phone: candidate.phone || source.phone || 'Not listed',
      location: candidate.location || source.location || 'Not listed',
      currentDesignation,
      currentCompany,
      totalExperience,
      relevantExperience: 'Not assessed against a requisition',
      highestQualification: qualification,
      primarySkills,
      noticePeriod: 'Not listed',
      expectedSalary: 'Not listed',
      resumeFileName: candidate.fileName || candidate.resume_file_url || source.fileName || 'Not listed',
      generatedAt,
    },
    professionalSummary: typeof profileSummary === 'string' && profileSummary.trim()
      ? profileSummary.trim()
      : `${fullName} is listed as ${currentDesignation} at ${currentCompany}. The available profile records ${totalExperience} of experience${primarySkills.length ? ` and skills including ${primarySkills.join(', ')}` : ''}. Verify these details against the original CV and active job requirements.`,
    experienceAnalysis: {
      totalExperience,
      relevantExperience: 'Not assessed against a requisition',
      roles: experience.map((role: any) => ({
        title: role.title || role.role || role.position || 'Role not listed',
        company: role.company || 'Company not listed',
        period: role.duration || [role.startDate || role.start_date, role.endDate || role.end_date].filter(Boolean).join(' – ') || 'Dates not listed',
        responsibilities: Array.isArray(role.highlights) ? role.highlights : Array.isArray(role.responsibilities) ? role.responsibilities : [],
        technologies: Array.isArray(role.technologies) ? role.technologies : [],
        achievements: Array.isArray(role.achievements) ? role.achievements : [],
      })),
    },
    keySkills: { requiredSkillsFound: [], preferredSkillsFound: [], additionalRelevantSkills: skills, requiredSkillsNotFound: [], skillsRequiringVerification: [] },
    pros: [
      ...(primarySkills.length ? [`Profile lists skills including ${primarySkills.join(', ')}.`] : []),
      ...(experience.length ? [`Profile contains ${experience.length} experience record${experience.length === 1 ? '' : 's'}.`] : []),
      ...(qualification !== 'Not listed' ? [`Education listed: ${qualification}.`] : []),
    ],
    cons: ['Verify experience, skills, and education against the original CV and job requirements.'],
    jdMatchAnalysis: {
      atsScore: score,
      jobTitle: candidate.jobTitle || candidate.job?.position || source.jobTitle || 'Not linked',
      requiredSkillsMatched: [],
      requiredSkillsNotEvidenced: [],
      preferredSkillsMatched: [],
      experienceComparison: 'Not assessed against a requisition',
      educationMatched: 'Not assessed against a requisition',
      suitabilityExplanation: 'A job-specific assessment is not available for this locally stored candidate profile.',
    },
    projects: Array.isArray(rawProjects) ? rawProjects : [],
    education: education.map((item: any) => ({
      degree: item.degree || item.qualification || 'Qualification not listed',
      institution: item.institution || item.school || 'Institution not listed',
      year: String(item.year || item.graduation_date || ''),
      certifications: [],
    })),
    interviewQuestions: [],
    finalAssessment: {
      classification,
      topReasons: ['Based on candidate profile information currently available in this workspace.'],
      mainConcerns: ['Review the original CV and confirm fit against the requisition before making a decision.'],
      suggestedNextStep,
      disclaimer: 'Profile-based summary only. It is not a substitute for a job-specific evaluation or review of the original CV.',
    },
    metadata: { generatedAt, sourceResumeFile: candidate.fileName || candidate.resume_file_url || source.fileName || 'Not listed', aiModel: 'Candidate Profile Summary', isCached: false },
  };
}

export default function CandidateExecutiveSummary({
  candidateId,
  jobId,
  candidateName,
  fallbackCandidate,
}: CandidateExecutiveSummaryProps) {
  const cacheKey = getSummaryCacheKey(candidateId, jobId);
  const [summary, setSummary] = useState<CandidateSummaryData | null>(() => summaryCache.get(cacheKey) || null);
  const [loading, setLoading] = useState<boolean>(() => !summaryCache.has(cacheKey));
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [downloadingFormat, setDownloadingFormat] = useState<'pdf' | 'docx' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  function getResolvedBackendUrl(): string {
    let url = (process.env.NEXT_PUBLIC_API_URL || '').trim();

    // If running in browser on a remote/production domain (e.g. Vercel, Netlify, custom domain)
    // and env var is missing or contains localhost, fallback to deployed backend
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
      if (!url || (!isLocal && url.includes('localhost'))) {
        url = 'https://ats-d4tv.onrender.com/api';
      }
    }

    if (!url) {
      url = 'http://localhost:5000/api';
    }

    // Strip trailing slashes
    url = url.replace(/\/+$/, '');

    // Ensure /api is appended if omitted
    if (!url.endsWith('/api')) {
      url = `${url}/api`;
    }

    return url;
  }

  const fetchSummary = useCallback(async (forceRegen = false) => {
    if (!candidateId) return;
    const requestKey = getSummaryCacheKey(candidateId, jobId);
    if (!forceRegen) {
      const cachedSummary = summaryCache.get(requestKey);
      if (cachedSummary) {
        setSummary(cachedSummary);
        setErrorMsg('');
        setLoading(false);
        return;
      }
    }

    try {
      if (forceRegen) {
        setIsGenerating(true);
      } else if (!fallbackCandidate) {
        setLoading(true);
      }
      setErrorMsg('');

      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';
      // Use the same API base as the candidate list and history requests. The
      // Next.js proxy can point at a different backend in local deployments.
      const targetUrl = `${getResolvedBackendUrl()}/candidates/${encodeURIComponent(candidateId)}/summary${query}`;
      const token = localStorage.getItem('tasknera_token');
      const request = async () => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 20000);
        try {
          const res = await fetch(targetUrl, {
            method: forceRegen ? 'POST' : 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            ...(forceRegen ? { body: JSON.stringify({ jobId, regenerate: true }) } : {}),
            signal: controller.signal,
            cache: 'no-store',
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.summary) {
            throw new Error(data.error || `Summary request failed (${res.status})`);
          }
          return data.summary as CandidateSummaryData;
        } finally {
          window.clearTimeout(timeoutId);
        }
      };

      let result: CandidateSummaryData;
      if (!forceRegen && summaryRequests.has(requestKey)) {
        result = await summaryRequests.get(requestKey)!;
      } else {
        const pending = request();
        if (!forceRegen) summaryRequests.set(requestKey, pending);
        try {
          result = await pending;
        } finally {
          if (summaryRequests.get(requestKey) === pending) summaryRequests.delete(requestKey);
        }
      }
      summaryCache.set(requestKey, result);
      setSummary(result);
    } catch (err: any) {
      console.warn('[Candidate Summary Error]:', err);
      if (!forceRegen && fallbackCandidate) {
        const localSummary = buildProfileSummary(candidateId, jobId, candidateName, fallbackCandidate);
        summaryCache.set(requestKey, localSummary);
        setSummary(localSummary);
        setErrorMsg('');
        return;
      }
      setErrorMsg(err?.name === 'AbortError'
        ? 'The summary service took too long to respond. Please try again.'
        : err?.message || 'Network error loading executive summary');
    } finally {
      setLoading(false);
      setIsGenerating(false);
    }
  }, [candidateId, jobId, candidateName, fallbackCandidate]);

  useEffect(() => {
    const cachedSummary = summaryCache.get(cacheKey) || null;
    const initialSummary = cachedSummary || (fallbackCandidate
      ? buildProfileSummary(candidateId, jobId, candidateName, fallbackCandidate)
      : null);
    setSummary(initialSummary);
    setErrorMsg('');
    setLoading(!initialSummary);
    if (!cachedSummary) fetchSummary(false);
  }, [cacheKey, candidateId, jobId, candidateName, fallbackCandidate, fetchSummary]);

  const handleDownload = async (format: 'pdf' | 'docx') => {
    try {
      setDownloadingFormat(format);

      // Instant, 100% reliable client-side vector PDF generation (visually identical to localhost)
      if (format === 'pdf' && summary) {
        try {
          const pdfBytes = buildExecutiveSummaryPdf(summary);
          const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const namePart = (summary?.overview?.fullName || candidateName || 'Candidate').replace(/\s+/g, '_');
          a.download = `Candidate_Summary_${namePart}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
          setDownloadingFormat(null);
          return;
        } catch (pdfGenErr) {
          console.warn('[Client PDF Generation Warning, falling back to server endpoints]:', pdfGenErr);
        }
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const headers: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const primaryBase = getResolvedBackendUrl();
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';

      // Multi-layer fallback sequence to guarantee download on Vercel
      const candidateUrls = [
        // 1. Next.js same-origin API proxy (eliminates CORS & mixed content on Vercel)
        `/api/candidates/${encodeURIComponent(candidateId)}/summary/${format}${query}`,
        // 2. Primary configured/normalized backend URL
        `${primaryBase}/candidates/${encodeURIComponent(candidateId)}/summary/${format}${query}`,
        // 3. Direct Render backend with /api
        `https://ats-d4tv.onrender.com/api/candidates/${encodeURIComponent(candidateId)}/summary/${format}${query}`,
        // 4. Direct Render backend root mount
        `https://ats-d4tv.onrender.com/candidates/${encodeURIComponent(candidateId)}/summary/${format}${query}`,
      ];

      let downloaded = false;

      // 1. Direct same-origin PDFKit generation on Vercel/Next.js using current summary state (instant, identical layout)
      if (summary) {
        try {
          const directRes = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/summary/${format}${query}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ summary })
          });

          if (directRes.ok) {
            const blob = await directRes.blob();
            if (blob.size > 200) {
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const namePart = (summary?.overview?.fullName || candidateName || 'Candidate').replace(/\s+/g, '_');
              a.download = `Candidate_Summary_${namePart}.${format}`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.URL.revokeObjectURL(url);
              downloaded = true;
            }
          }
        } catch (postErr) {
          console.warn('[Direct PDFKit Post Warning]:', postErr);
        }
      }

      // 2. Fallback to GET streaming endpoints if direct POST generation was not completed
      if (!downloaded) {
        for (const targetUrl of candidateUrls) {
          try {
            const res = await fetch(targetUrl, { headers });
            if (res.ok) {
              const blob = await res.blob();
              if (blob.size > 200) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const namePart = (summary?.overview?.fullName || candidateName || 'Candidate').replace(/\s+/g, '_');
                a.download = `Candidate_Summary_${namePart}.${format}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                downloaded = true;
                break;
              }
            }
          } catch (fetchErr) {
            console.warn(`[Download Attempt Failed for ${targetUrl}]:`, fetchErr);
          }
        }
      }

      if (!downloaded) {
        alert(`Failed to download ${format.toUpperCase()} report. Please check server connection and try again.`);
      }
    } catch (err) {
      console.error(`[Download Error ${format}]:`, err);
      alert(`Error downloading ${format.toUpperCase()} file. Please try again.`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-6 animate-pulse">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="space-y-2">
            <div className="h-6 w-56 bg-slate-200 rounded-lg" />
            <div className="h-4 w-40 bg-slate-100 rounded-md" />
          </div>
          <div className="h-10 w-28 bg-slate-200 rounded-xl" />
        </div>
        <div className="h-28 bg-slate-50 rounded-2xl border border-slate-100" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-40 bg-slate-50 rounded-2xl border border-slate-100" />
          <div className="h-40 bg-slate-50 rounded-2xl border border-slate-100" />
        </div>
      </div>
    );
  }

  if (errorMsg && !summary) {
    return (
      <div className="p-8 bg-white rounded-2xl border border-rose-200 shadow-2xs text-center space-y-4">
        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto text-xl font-bold">
          ⚠️
        </div>
        <h3 className="text-base font-black text-slate-900">Summary Not Available</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">{errorMsg}</p>
        <button
          onClick={() => fetchSummary(true)}
          disabled={isGenerating}
          className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl transition-all shadow-orange cursor-pointer"
        >
          {isGenerating ? 'Generating Summary...' : 'Generate Executive Summary Now'}
        </button>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:border-none print:shadow-none space-y-6 p-6 sm:p-8">
      {/* ── CANDIDATE OVERVIEW & ATS SCORE CARD ── */}
      <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">{summary.overview.fullName}</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-white/10 text-white border border-white/20">
              {summary.finalAssessment.classification}
            </span>
          </div>
          <p className="text-xs text-slate-300 font-semibold">
            {summary.overview.currentDesignation} • {summary.overview.currentCompany}
          </p>
          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap pt-1">
            <span>📍 {summary.overview.location}</span>
            <span>⏱️ {summary.overview.totalExperience} Experience</span>
          <span>{summary.overview.highestQualification}</span>
            <span>✉️ {summary.overview.email}</span>
            <span>📞 {summary.overview.phone}</span>
          </div>
        </div>

        <button
          onClick={() => handleDownload('pdf')}
          disabled={downloadingFormat === 'pdf'}
          className="flex-shrink-0 px-4 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-2 print:hidden"
          title="Download executive summary as PDF"
        >
          <span>📄</span>
          <span>{downloadingFormat === 'pdf' ? 'Preparing...' : 'Download PDF'}</span>
        </button>
      </div>

      {/* ── SECTION 1: PROFESSIONAL SUMMARY ── */}
      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
          <span>📋</span>
          <span>Professional Background Summary</span>
        </h4>
        <p className="text-xs text-slate-700 leading-relaxed font-medium">
          {summary.professionalSummary}
        </p>
      </div>

      {/* ── SECTION 2 & 3: PROS (STRENGTHS) & GAPS (TWO COLUMNS) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Pros / Strengths */}
        <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
            <span>✓</span>
            <span>Key Strengths &amp; Evidence ({summary.pros.length})</span>
          </h4>
          <ul className="space-y-2 text-xs">
            {summary.pros.map((pro, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-700 font-medium">
                <span className="text-emerald-600 font-black mt-0.5">•</span>
                <span>{pro}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Cons / Gaps / Verification Points */}
        <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-200/80 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Potential Gaps &amp; Verification Points ({summary.cons.length})</span>
          </h4>
          <ul className="space-y-2 text-xs">
            {summary.cons.map((con, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-700 font-medium">
                <span className="text-amber-600 font-black mt-0.5">•</span>
                <span>{con}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── SECTION 4: SKILLS MATCH BREAKDOWN ── */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
          <span>🎯</span>
          <span>Requisition Technical Skills Matrix</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-stretch">
          {/* Matched Required Skills */}
          <div className="h-40 min-h-40 p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col overflow-hidden">
            <span className="min-h-8 text-[10px] font-black uppercase tracking-wider text-emerald-700 block">
              ✓ Required Skills Evidenced ({summary.keySkills.requiredSkillsFound.length})
            </span>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <div className="flex flex-wrap content-start gap-1.5">
                {summary.keySkills.requiredSkillsFound.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {s.name}
                  </span>
                ))}
                {summary.keySkills.requiredSkillsFound.length === 0 && (
                  <span className="text-slate-400 text-xs">None explicitly evidenced</span>
                )}
              </div>
            </div>
          </div>

          {/* Missing Required Skills */}
          <div className="h-40 min-h-40 p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col overflow-hidden">
            <span className="min-h-8 text-[10px] font-black uppercase tracking-wider text-rose-700 block">
              ✗ Missing / Unverified Skills ({summary.keySkills.requiredSkillsNotFound.length})
            </span>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <div className="flex flex-wrap content-start gap-1.5">
                {summary.keySkills.requiredSkillsNotFound.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    {s}
                  </span>
                ))}
                {summary.keySkills.requiredSkillsNotFound.length === 0 && (
                  <span className="text-emerald-700 text-xs font-bold">All mandatory skills matched</span>
                )}
              </div>
            </div>
          </div>

          {/* Additional Skills */}
          <div className="h-40 min-h-40 p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col overflow-hidden">
            <span className="min-h-8 text-[10px] font-black uppercase tracking-wider text-slate-600 block">
              💡 Additional Tech Skills ({summary.keySkills.additionalRelevantSkills.length})
            </span>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <div className="flex flex-wrap content-start gap-1.5">
                {summary.keySkills.additionalRelevantSkills.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-white text-slate-700 border border-slate-200">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 5: ROLE-SPECIFIC INTERVIEW QUESTIONS ── */}
      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
          <span>💬</span>
          <span>Role-Specific Interview Questions for Recruiter ({summary.interviewQuestions.length})</span>
        </h4>

        <div className="space-y-2.5">
          {summary.interviewQuestions.map((q, idx) => (
            <div key={idx} className="p-3.5 bg-white rounded-xl border border-slate-200/80 space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900">
                  <span className="text-brand-orange font-black">Q{idx + 1}. </span>
                  {q.question}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex-shrink-0">
                  {q.category}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                <span className="font-bold text-slate-700">What to verify: </span>
                {q.whatToVerify}
              </p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

