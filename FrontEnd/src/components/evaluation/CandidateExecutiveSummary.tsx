'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
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
}

export default function CandidateExecutiveSummary({
  candidateId,
  jobId,
  candidateName
}: CandidateExecutiveSummaryProps) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<CandidateSummaryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
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
    try {
      if (forceRegen) {
        setIsGenerating(true);
      } else {
        setLoading(true);
      }
      setErrorMsg('');

      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const primaryBase = getResolvedBackendUrl();
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';

      // Multi-layer endpoint candidates (Next.js same-origin proxy on Vercel -> Normalized Remote Backend -> Fallback URL)
      const candidateUrls = [
        `/api/candidates/${encodeURIComponent(candidateId)}/summary${query}`,
        `${primaryBase}/candidates/${encodeURIComponent(candidateId)}/summary${query}`,
        `https://ats-d4tv.onrender.com/api/candidates/${encodeURIComponent(candidateId)}/summary${query}`,
        `https://ats-d4tv.onrender.com/candidates/${encodeURIComponent(candidateId)}/summary${query}`,
      ];

      let lastError: any = null;
      let fetchedSuccessfully = false;

      for (const targetUrl of candidateUrls) {
        try {
          let res: Response;
          if (forceRegen) {
            res = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({ jobId, regenerate: true })
            });
          } else {
            res = await fetch(targetUrl, { headers });
          }

          if (res.ok) {
            const data = await res.json();
            if (data.summary) {
              setSummary(data.summary);
              fetchedSuccessfully = true;
              break;
            }
          }
        } catch (fetchErr: any) {
          lastError = fetchErr;
        }
      }

      if (!fetchedSuccessfully) {
        setErrorMsg(lastError?.message || 'Unable to connect to candidate summary service. Please try again.');
      }
    } catch (err: any) {
      console.error('[Candidate Summary Error]:', err);
      setErrorMsg(err?.message || 'Network error loading executive summary');
    } finally {
      setLoading(false);
      setIsGenerating(false);
    }
  }, [candidateId, jobId]);

  useEffect(() => {
    fetchSummary(false);
  }, [fetchSummary]);

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

  const handlePrint = () => {
    window.print();
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

  const atsScore = summary.atsScore || 0;
  const isHighFit = atsScore >= 70;
  const isLowFit = atsScore < 50;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:border-none print:shadow-none space-y-6 p-6 sm:p-8">
      {/* ── ACTION BAR (Header) ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200/80 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-orange animate-pulse" />
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Candidate Executive Summary</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {summary.metadata.aiModel}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Evidence-grounded recruitment synthesis • Generated on {new Date(summary.metadata.generatedAt).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Regenerate Button */}
          <button
            onClick={() => fetchSummary(true)}
            disabled={isGenerating}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer flex items-center gap-1.5"
            title="Re-run synthesis against latest CV and JD requirements"
          >
            <span className={isGenerating ? 'animate-spin' : ''}>🔄</span>
            <span>{isGenerating ? 'Generating...' : 'Regenerate'}</span>
          </button>

          {/* Download PDF Button */}
          <button
            onClick={() => handleDownload('pdf')}
            disabled={downloadingFormat === 'pdf'}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
            title="Download clean multi-page PDF executive report"
          >
            <span>📄</span>
            <span>{downloadingFormat === 'pdf' ? 'Exporting PDF...' : 'Download PDF'}</span>
          </button>

          {/* Download DOCX Button */}
          <button
            onClick={() => handleDownload('docx')}
            disabled={downloadingFormat === 'docx'}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
            title="Download editable Microsoft Word document"
          >
            <span>📝</span>
            <span>{downloadingFormat === 'docx' ? 'Exporting DOCX...' : 'Download DOCX'}</span>
          </button>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-slate-200"
            title="Print or Save via Browser"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>
        </div>
      </div>

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

        {/* ATS Score Gauge Box */}
        <div className="flex-shrink-0 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 text-center min-w-[130px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 block mb-1">
            ATS Score
          </span>
          <span className={`text-3xl font-black font-mono block ${
            isHighFit ? 'text-emerald-400' : isLowFit ? 'text-rose-400' : 'text-amber-400'
          }`}>
            {atsScore}%
          </span>
          <span className="text-[10px] font-bold text-slate-300 block mt-1">
            {summary.jobTitle || 'Requisition Profile'}
          </span>
        </div>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {/* Matched Required Skills */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">
              ✓ Required Skills Evidenced ({summary.keySkills.requiredSkillsFound.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
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

          {/* Missing Required Skills */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 block">
              ✗ Missing / Unverified Skills ({summary.keySkills.requiredSkillsNotFound.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
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

          {/* Additional Skills */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 block">
              💡 Additional Tech Skills ({summary.keySkills.additionalRelevantSkills.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {summary.keySkills.additionalRelevantSkills.map((s, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-white text-slate-700 border border-slate-200">
                  {s}
                </span>
              ))}
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

      {/* ── SECTION 6: FINAL ASSESSMENT & NEXT STEP ── */}
      <div className="p-5 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <span>🏁</span>
            <span>Final Recruiter Assessment &amp; Recommendation</span>
          </h4>
          <span className="px-3 py-1 rounded-xl text-xs font-black bg-brand-orange text-white">
            {summary.finalAssessment.suggestedNextStep}
          </span>
        </div>

        <div className="space-y-1.5 text-xs text-slate-300">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Top Supporting Reasons:</span>
          {summary.finalAssessment.topReasons.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-brand-orange font-bold">✓</span>
              <span>{r}</span>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-slate-400 pt-2 border-t border-white/10 italic">
          {summary.finalAssessment.disclaimer}
        </p>
      </div>
    </div>
  );
}

