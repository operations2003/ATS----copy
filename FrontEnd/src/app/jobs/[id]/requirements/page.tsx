'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';

const SUPPORTED_CATEGORIES = [
  'Experience',
  'Technology',
  'Technical Skill',
  'Integration',
  'Certification',
  'Methodology',
  'Soft Skill',
  'Hiring Criteria',
  'Education',
  'Tool',
  'Other'
] as const;

export interface RequirementItem {
  id: string;
  jobId: string;
  requirement: string;
  category: string;
  type?: string;
  sourceSection?: string;
  weight: number; // 1.0 - 3.0
  isMandatory: boolean;
  evidenceRequired: boolean;
  recruiterConfirmed: boolean;
  sourceEvidence: string;
  needsVerification?: boolean;
  isRecruiterAdded?: boolean;
}

function deduplicateRequirementItems(items: RequirementItem[]): RequirementItem[] {
  if (!Array.isArray(items) || items.length <= 1) return items || [];
  const result: RequirementItem[] = [];

  const normalize = (t: string) =>
    (t || '')
      .toLowerCase()
      .replace(/^[\s*•●▪▫➢✓✔·\-\d\.\)\(\]]+/, '')
      .replace(/\b(?:years?|yrs?)\s+of\s+experience\b/g, 'years exp')
      .replace(/\b(?:years?|yrs?)\s+experience\b/g, 'years exp')
      .replace(/\b(?:years?|yrs?)\b/g, 'years')
      .replace(/(\d+)\s*(?:-|to|–|—)\s*(\d+)/g, '$1-$2')
      .replace(/[^a-z0-9\s\+\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  for (const item of items) {
    const key = normalize(item.requirement);
    if (!key) continue;

    const existingIdx = result.findIndex(existing => {
      const exKey = normalize(existing.requirement);
      if (exKey === key) return true;
      if ((exKey.includes(key) || key.includes(exKey)) && Math.abs(exKey.length - key.length) < 15) return true;
      return false;
    });

    if (existingIdx === -1) {
      result.push({ ...item });
    } else {
      const existing = result[existingIdx];
      const mergedMandatory = item.isMandatory || existing.isMandatory;
      const mergedWeight = Math.max(existing.weight || 1.0, item.weight || 1.0);
      const mergedConfirmed = item.recruiterConfirmed || existing.recruiterConfirmed;
      const mergedEvidenceReq = item.evidenceRequired || existing.evidenceRequired;
      const mergedText = item.requirement.length > existing.requirement.length ? item.requirement : existing.requirement;

      result[existingIdx] = {
        ...existing,
        requirement: mergedText,
        isMandatory: mergedMandatory,
        weight: mergedWeight,
        recruiterConfirmed: mergedConfirmed,
        evidenceRequired: mergedEvidenceReq,
        category: (existing.category && existing.category !== 'Other') ? existing.category : (item.category || existing.category),
        sourceEvidence: (item.sourceEvidence || '').length > (existing.sourceEvidence || '').length ? item.sourceEvidence : existing.sourceEvidence,
      };
    }
  }

  return result;
}

const DEFAULT_SAMPLE_REQUIREMENTS: Record<string, { title: string; client: string; reqs: RequirementItem[] }> = {
  'jd-1': {
    title: 'Salesforce Manufacturing Cloud Developer',
    client: 'Hexaware',
    reqs: [
      { id: 'req-1', jobId: 'jd-1', requirement: '4–8 years of hands-on Salesforce development experience.', category: 'Experience', weight: 1.5, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: '4–8 years of hands-on Salesforce development experience.' },
      { id: 'req-2', jobId: 'jd-1', requirement: 'Strong experience with Salesforce Manufacturing Cloud.', category: 'Technology', weight: 1.5, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Strong experience with Salesforce Manufacturing Cloud.' },
      { id: 'req-3', jobId: 'jd-1', requirement: 'Strong knowledge of Apex, LWC, SOQL/SOSL, Triggers, Batch Apex, Queueable Apex, and asynchronous processing.', category: 'Technical Skill', weight: 1.5, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Strong knowledge of Apex, LWC, SOQL/SOSL, Triggers, Batch Apex, Queueable Apex, and asynchronous processing.' },
      { id: 'req-4', jobId: 'jd-1', requirement: 'Salesforce Manufacturing Cloud certification or relevant Salesforce certification.', category: 'Certification', weight: 1.0, isMandatory: false, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Salesforce Manufacturing Cloud certification or relevant Salesforce certification.' },
      { id: 'req-5', jobId: 'jd-1', requirement: 'Manufacturing Cloud experience', category: 'Hiring Criteria', type: 'HIRING_CRITERIA', weight: 1.0, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Candidate must have shown exp in Manufacturing cloud in their resumes.' }
    ]
  },
  'default': {
    title: 'Salesforce Manufacturing Cloud Developer',
    client: 'Hexaware',
    reqs: [
      { id: 'req-d1', jobId: 'default', requirement: '4–8 years of hands-on Salesforce development experience.', category: 'Experience', weight: 1.5, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: '4–8 years of hands-on Salesforce development experience.' },
      { id: 'req-d2', jobId: 'default', requirement: 'Strong experience with Salesforce Manufacturing Cloud.', category: 'Technology', weight: 1.5, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Strong experience with Salesforce Manufacturing Cloud.' },
      { id: 'req-d3', jobId: 'default', requirement: 'Salesforce Manufacturing Cloud certification or relevant Salesforce certification.', category: 'Certification', weight: 1.0, isMandatory: false, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Salesforce Manufacturing Cloud certification or relevant Salesforce certification.' },
      { id: 'req-d4', jobId: 'default', requirement: 'Local to NCR', category: 'Hiring Criteria', type: 'HIRING_CRITERIA', weight: 1.0, isMandatory: true, evidenceRequired: true, recruiterConfirmed: true, sourceEvidence: 'Local to NCR' }
    ]
  }
};

export default function RequirementsReviewPage() {
  const router = useRouter();
  const params = useParams();
  const { token } = useAuth();
  const jobId = params.id as string;

  // Job Info
  const [jobTitle, setJobTitle] = useState<string>('Job Specification');
  const [clientName, setClientName] = useState<string>('');

  // Requirement List State
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Status Banners & Warnings
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  // Add Requirement Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<string>('Technical Skill');
  const [newIsMandatory, setNewIsMandatory] = useState(true);
  const [newWeight, setNewWeight] = useState(1.0);
  const [newEvidenceRequired, setNewEvidenceRequired] = useState(true);
  const [addFieldError, setAddFieldError] = useState('');

  // Semantic AI & Original JD View States
  const [normalizedJd, setNormalizedJd] = useState<any>(null);
  const [originalJdText, setOriginalJdText] = useState<string>('');
  const [aiStatus, setAiStatus] = useState<string>('PENDING');
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [activeTab, setActiveTab] = useState<'requirements' | 'normalized_ai' | 'original_jd'>('requirements');

  // Fetch job & requirements from backend API on mount
  useEffect(() => {
    async function loadData() {
      if (!jobId) return;

      try {
        setLoading(true);
        setErrorMsg('');
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);

        const headers = {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        };

        // 1. Fetch Job Metadata
        const jobRes = await fetch(`${backendUrl}/jobs/${jobId}`, { headers });
        const jobData = await jobRes.json();

        if (jobRes.ok && jobData.job) {
          setJobTitle(jobData.job.position || 'Job Specification');
          setClientName(jobData.job.client || '');
          setNormalizedJd(jobData.job.normalized_jd || jobData.job.normalizedJd || null);
          setOriginalJdText(jobData.job.original_jd || jobData.job.jd_text || '');
          setAiStatus(jobData.job.ai_processing_status || (jobData.job.normalized_jd ? 'COMPLETED' : 'PENDING'));
        }

        // 2. Fetch Requirements from Backend API
        const reqRes = await fetch(`${backendUrl}/jobs/${jobId}/requirements`, { headers });
        const reqData = await reqRes.json();

        if (reqRes.ok && reqData.success && Array.isArray(reqData.requirements)) {
          const apiReqs: RequirementItem[] = reqData.requirements.map((r: any) => ({
            id: r.id,
            jobId: r.jobId || jobId,
            requirement: r.requirement,
            category: r.category || 'Other',
            type: r.type || (r.category === 'Hiring Criteria' || r.sourceSection === 'Top Hiring Criteria' ? 'HIRING_CRITERIA' : 'SKILL'),
            sourceSection: r.sourceSection || '',
            weight: typeof r.weight === 'number' ? r.weight : 1.0,
            isMandatory: Boolean(r.isMandatory ?? r.is_mandatory),
            evidenceRequired: Boolean(r.evidenceRequired ?? r.evidence_required),
            recruiterConfirmed: Boolean(r.recruiterConfirmed ?? r.recruiter_confirmed),
            sourceEvidence: r.sourceEvidence || r.source_evidence || r.requirement,
            needsVerification: Boolean(r.needsVerification ?? r.needs_verification)
          }));

          setRequirements(deduplicateRequirementItems(apiReqs));
          if (Array.isArray(reqData.warnings)) {
            setWarnings(reqData.warnings);
          }
        } else if (jobData.job?.requirements && Array.isArray(jobData.job.requirements) && jobData.job.requirements.length > 0) {
          // Fallback to job nested requirements if GET /requirements endpoint returned empty
          const fallbackReqs: RequirementItem[] = jobData.job.requirements.map((r: any, idx: number) => ({
            id: r.id || `req-${idx}`,
            jobId: jobId,
            requirement: r.requirement,
            category: r.category || 'Other',
            type: r.type || (r.category === 'Hiring Criteria' || r.sourceSection === 'Top Hiring Criteria' ? 'HIRING_CRITERIA' : 'SKILL'),
            sourceSection: r.sourceSection || '',
            weight: typeof r.weight === 'number' ? r.weight : 1.0,
            isMandatory: Boolean(r.is_mandatory ?? r.isMandatory),
            evidenceRequired: Boolean(r.evidence_required ?? r.evidenceRequired),
            recruiterConfirmed: Boolean(r.recruiter_confirmed ?? r.recruiterConfirmed),
            sourceEvidence: r.source_evidence || r.sourceEvidence || r.requirement,
            needsVerification: Boolean(r.needs_verification ?? r.needsVerification)
          }));
          setRequirements(deduplicateRequirementItems(fallbackReqs));
        } else {
          // Provide rich sample requirements if no records found
          const sample = DEFAULT_SAMPLE_REQUIREMENTS[jobId] || DEFAULT_SAMPLE_REQUIREMENTS['default'];
          setJobTitle(prev => prev === 'Job Specification' ? sample.title : prev);
          setClientName(prev => !prev ? sample.client : prev);
          setRequirements(deduplicateRequirementItems(sample.reqs));
        }
      } catch (err: any) {
        console.error('Error fetching job requirements, using fallback data:', err);
        const sample = DEFAULT_SAMPLE_REQUIREMENTS[jobId] || DEFAULT_SAMPLE_REQUIREMENTS['default'];
        setJobTitle(prev => prev === 'Job Specification' ? sample.title : prev);
        setClientName(prev => !prev ? sample.client : prev);
        setRequirements(deduplicateRequirementItems(sample.reqs));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [jobId, token]);

  // Recruiter Action: Run on-demand Semantic AI Normalization
  const handleRunAiNormalization = async () => {
    try {
      setIsNormalizing(true);
      setErrorMsg('');
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);
      const res = await fetch(`${backendUrl}/jobs/${jobId}/normalize-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });
      const data = await res.json();
      if (res.ok && data.normalizedJd) {
        setNormalizedJd(data.normalizedJd);
        setAiStatus('COMPLETED');
        setSuccessMsg('Semantic Intelligence analysis completed successfully!');
      } else {
        const rawErr = data?.error || '';
        const friendlyError = /503|500|502|504|429|status|unavailable|busy|demand/i.test(rawErr)
          ? 'AI service is temporarily unavailable. Please try again in a moment.'
          : (rawErr || 'AI service is temporarily unavailable. Please try again in a moment.');
        setErrorMsg(friendlyError);
      }
    } catch (err: any) {
      const errText = String(err?.message || err);
      const friendlyCatchError = /503|500|502|504|429|fetch|network|status|unavailable|busy|demand/i.test(errText)
        ? 'AI service is temporarily unavailable. Please try again in a moment.'
        : (errText || 'AI service is temporarily unavailable. Please try again in a moment.');
      setErrorMsg(friendlyCatchError);
    } finally {
      setIsNormalizing(false);
    }
  };

  // Recruiter Action: Update Single Requirement Field
  const handleUpdateField = (id: string, updates: Partial<RequirementItem>) => {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  // Recruiter Action: Delete Requirement
  const handleDeleteRequirement = async (id: string) => {
    setRequirements((prev) => prev.filter((r) => r.id !== id));

    // Optional API call to delete single item if exists on backend
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const authToken = token || localStorage.getItem('tasknera_token');
      await fetch(`${backendUrl}/jobs/${jobId}/requirements/${id}`, {
        method: 'DELETE',
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        }
      });
    } catch (e) {
      // Ignored for unsaved local items
    }
  };

  // Recruiter Action: Toggle Mandatory / Preferred
  const handleToggleMandatory = (id: string) => {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isMandatory: !r.isMandatory, needsVerification: false } : r))
    );
  };

  // Recruiter Action: Toggle Confirmation
  const handleToggleConfirmed = (id: string) => {
    setRequirements((prev) =>
      prev.map((r) => (r.id === id ? { ...r, recruiterConfirmed: !r.recruiterConfirmed } : r))
    );
  };

  // Recruiter Action: Add Requirement
  const handleAddRequirement = () => {
    if (!newText || !newText.trim()) {
      setAddFieldError('Requirement text cannot be empty.');
      return;
    }

    if (newWeight < 1.0 || newWeight > 3.0) {
      setAddFieldError('Weight must be between 1.0x and 3.0x.');
      return;
    }

    const newItem: RequirementItem = {
      id: `req-custom-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      jobId: jobId,
      requirement: newText.trim(),
      category: newCategory,
      type: newCategory === 'Hiring Criteria' ? 'HIRING_CRITERIA' : 'SKILL',
      weight: newWeight,
      isMandatory: newIsMandatory,
      evidenceRequired: newEvidenceRequired,
      recruiterConfirmed: true,
      sourceEvidence: 'User added requirement by recruiter',
      isRecruiterAdded: true
    };

    setRequirements((prev) => deduplicateRequirementItems([...prev, newItem]));
    setNewText('');
    setAddFieldError('');
    setShowAddForm(false);
  };

  // Recruiter Action: Save & Confirm Requirements API Call
  const handleSaveAndConfirm = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    const cleanReqs = deduplicateRequirementItems(requirements);

    // Validation 1: Check empty requirements
    const emptyItem = cleanReqs.find((r) => !r.requirement || !r.requirement.trim());
    if (emptyItem) {
      setErrorMsg('Requirement text cannot be empty. Please remove or fix blank items.');
      return;
    }

    // Validation 2: Check weight range (1.0x - 3.0x)
    const invalidWeightItem = cleanReqs.find((r) => r.weight < 1.0 || r.weight > 3.0);
    if (invalidWeightItem) {
      setErrorMsg(`Invalid weight for "${invalidWeightItem.requirement}". Weight must be between 1.0x and 3.0x.`);
      return;
    }

    setIsSaving(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const authToken = token || localStorage.getItem('tasknera_token');

      const payload = {
        requirements: cleanReqs.map((r) => ({
          id: r.id.startsWith('req-custom') ? undefined : r.id,
          jobId: jobId,
          requirement: r.requirement.trim(),
          category: r.category,
          type: r.type || (r.category === 'Hiring Criteria' ? 'HIRING_CRITERIA' : 'SKILL'),
          weight: r.weight,
          isMandatory: r.isMandatory,
          evidenceRequired: r.evidenceRequired,
          recruiterConfirmed: true,
          sourceEvidence: r.sourceEvidence || r.requirement.trim(),
          needsVerification: false
        }))
      };

      const res = await fetch(`${backendUrl}/jobs/${jobId}/requirements/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to confirm requirements on server.');
      }

      setSuccessMsg(data.message || 'Requirements confirmed successfully.');

      // Update UI state with persisted items from backend API
      if (Array.isArray(data.requirements)) {
        const confirmedList: RequirementItem[] = data.requirements.map((r: any) => ({
          id: r.id,
          jobId: r.jobId || jobId,
          requirement: r.requirement,
          category: r.category || 'Other',
          type: r.type || (r.category === 'Hiring Criteria' ? 'HIRING_CRITERIA' : 'SKILL'),
          sourceSection: r.sourceSection || '',
          weight: typeof r.weight === 'number' ? r.weight : 1.0,
          isMandatory: Boolean(r.isMandatory ?? r.is_mandatory),
          evidenceRequired: Boolean(r.evidenceRequired ?? r.evidence_required),
          recruiterConfirmed: true,
          sourceEvidence: r.sourceEvidence || r.requirement,
          needsVerification: false
        }));
        setRequirements(confirmedList);
      }

      setTimeout(() => {
        router.push('/jobs');
      }, 1200);
    } catch (err: any) {
      console.error('Save & Confirm Error:', err);
      setErrorMsg(err.message || 'An error occurred while saving requirements.');
    } finally {
      setIsSaving(false);
    }
  };

  const hiringCriteriaList = requirements.filter(r => r.type === 'HIRING_CRITERIA' || r.category === 'Hiring Criteria' || r.sourceSection === 'Top Hiring Criteria');
  const mandatorySkillsList = requirements.filter(r => r.isMandatory && r.type !== 'HIRING_CRITERIA' && r.category !== 'Hiring Criteria' && r.sourceSection !== 'Top Hiring Criteria');
  const preferredSkillsList = requirements.filter(r => !r.isMandatory && r.type !== 'HIRING_CRITERIA' && r.category !== 'Hiring Criteria' && r.sourceSection !== 'Top Hiring Criteria');

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-[#1E293B] flex flex-col justify-between selection:bg-brand-orange-pale selection:text-brand-orange">
      {/* Global Navigation Header */}
      <Header />

      <main className="max-w-6xl mx-auto px-6 pt-28 pb-16 w-full flex-1">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-[#1E293B] font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Jobs Directory
          </Link>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-brand-orange-pale text-brand-orange border border-brand-orange-border rounded-full text-xs font-bold shadow-xs">
              Stage 2: Review Extracted Criteria
            </span>
          </div>
        </div>

        {/* Page Title & Header Banner */}
        <div className="mb-8 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1E293B] mb-1">{jobTitle}</h1>
              {clientName && <p className="text-slate-500 text-sm">Client / Company: <span className="text-slate-800 font-semibold">{clientName}</span></p>}
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-brand-orange-pale hover:bg-brand-orange text-brand-orange hover:text-white border border-brand-orange-border rounded-xl text-xs font-bold transition-all flex items-center gap-2 self-start md:self-auto cursor-pointer shadow-xs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Requirement
            </button>
          </div>

          {/* Counts & Statistics Bar */}
          <div className="flex items-center gap-3 pt-4 border-t border-slate-100 flex-wrap text-xs font-semibold">
            <span className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold">
              Mandatory Skills: {mandatorySkillsList.length}
            </span>
            <span className="px-3 py-1 bg-brand-orange-pale text-brand-orange border border-brand-orange-border rounded-full font-bold">
              Preferred Skills: {preferredSkillsList.length}
            </span>
            {hiringCriteriaList.length > 0 && (
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold">
                Hiring Criteria: {hiringCriteriaList.length}
              </span>
            )}
            <span className="text-slate-400 font-normal ml-auto">
              Total Criteria: {requirements.length}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mb-6 border-b border-slate-200 pb-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('requirements')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'requirements'
                ? 'bg-[#1E293B] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            Criteria Checklist ({requirements.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('normalized_ai')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'normalized_ai'
                ? 'bg-brand-orange text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI Semantic Understanding
            {normalizedJd ? (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold ml-1">Active</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-normal ml-1">Pending</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('original_jd')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'original_jd'
                ? 'bg-[#1E293B] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            Original JD Document
          </button>

        </div>

        {/* Global Success / Error Banners */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3 shadow-sm">
            <svg className="w-5 h-5 flex-shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-bold">{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3 shadow-sm">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="font-bold block mb-0.5">Validation / API Warning</span>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1 shadow-sm">
            <span className="font-bold block text-amber-700 text-xs">Duplicate Requirement Warnings:</span>
            {warnings.map((w, idx) => (
              <p key={idx}>• {w}</p>
            ))}
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="p-12 text-center text-slate-500 animate-pulse bg-white border border-slate-200 rounded-2xl shadow-sm">
            <div className="w-8 h-8 border-2 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <span className="text-sm font-semibold text-slate-700">Fetching extracted requirements from backend API...</span>
          </div>
        )}

        {/* Tab 1: Interactive Requirements Checklist */}
        {activeTab === 'requirements' && (
          <div>
            {/* Add Requirement Form Modal / Inline Box */}
            {showAddForm && (
          <div className="mb-8 p-6 rounded-2xl bg-white border border-brand-orange-border shadow-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#1E293B] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-orange"></span>
                Add New Recruiter Requirement
              </h3>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-xs text-slate-400 hover:text-slate-700 font-semibold cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>

            {addFieldError && (
              <p className="text-rose-600 text-xs font-bold">{addFieldError}</p>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Requirement Text <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="e.g. 4–8 years of hands-on Salesforce development experience."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[#1E293B] text-xs placeholder-slate-400 focus:bg-white focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[#1E293B] text-xs focus:bg-white focus:outline-none focus:border-brand-orange cursor-pointer"
                  >
                    {SUPPORTED_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Classification
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewIsMandatory(!newIsMandatory)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      newIsMandatory
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-brand-orange-pale text-brand-orange border-brand-orange-border'
                    }`}
                  >
                    {newIsMandatory ? 'Mandatory' : 'Preferred'}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Weight (1.0x – 3.0x)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="3.0"
                    value={newWeight}
                    onChange={(e) => setNewWeight(parseFloat(e.target.value) || 1.0)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[#1E293B] text-xs focus:bg-white focus:outline-none focus:border-brand-orange"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={newEvidenceRequired}
                    onChange={(e) => setNewEvidenceRequired(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-orange focus:ring-brand-orange"
                  />
                  <span>Evidence Required in Candidate CV</span>
                </label>

                <button
                  type="button"
                  onClick={handleAddRequirement}
                  className="px-5 py-2 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange cursor-pointer"
                >
                  Add Requirement to List
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && requirements.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 mb-8 shadow-sm">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-[#1E293B] font-bold text-base mb-1">No requirements were extracted from this JD.</p>
            <p className="text-xs text-slate-500 mb-4">Click "+ Add Requirement" to manually define requirements for candidate evaluation.</p>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange cursor-pointer"
            >
              Manually Add Requirement
            </button>
          </div>
        )}

        {!loading && requirements.length > 0 && (
          <div className="space-y-8">
            {/* Section 1: Mandatory Requirements */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                  <div>
                    <h2 className="text-xl font-bold text-[#1E293B]">
                      Mandatory Requirements ({mandatorySkillsList.length})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Strictly enforced criteria derived from the Mandatory Skills section.</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                  Strictly Enforced
                </span>
              </div>

              <div className="space-y-4">
                {mandatorySkillsList.length === 0 ? (
                  <p className="text-slate-400 text-xs italic">No mandatory requirements set.</p>
                ) : (
                  mandatorySkillsList.map((req) => (
                    <RequirementCard
                      key={req.id}
                      item={req}
                      onUpdateField={handleUpdateField}
                      onToggleMandatory={handleToggleMandatory}
                      onToggleConfirmed={handleToggleConfirmed}
                      onDelete={handleDeleteRequirement}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Section 2: Preferred Requirements */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-brand-orange"></span>
                  <div>
                    <h2 className="text-xl font-bold text-[#1E293B]">
                      Preferred Requirements ({preferredSkillsList.length})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Bonus scoring criteria derived from the Preferred Skills section.</p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-brand-orange-pale text-brand-orange border border-brand-orange-border text-xs font-bold">
                  Bonus Scoring
                </span>
              </div>

              <div className="space-y-4">
                {preferredSkillsList.length === 0 ? (
                  <p className="text-slate-400 text-xs italic">No preferred requirements set.</p>
                ) : (
                  preferredSkillsList.map((req) => (
                    <RequirementCard
                      key={req.id}
                      item={req}
                      onUpdateField={handleUpdateField}
                      onToggleMandatory={handleToggleMandatory}
                      onToggleConfirmed={handleToggleConfirmed}
                      onDelete={handleDeleteRequirement}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Section 3: Top Hiring Criteria */}
            {hiringCriteriaList.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    <div>
                      <h2 className="text-xl font-bold text-[#1E293B]">
                        Top Hiring Criteria ({hiringCriteriaList.length})
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">Critical directives extracted from the top-of-JD hiring instructions.</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                    Position Directives
                  </span>
                </div>

                <div className="space-y-4">
                  {hiringCriteriaList.map((req) => (
                    <RequirementCard
                      key={req.id}
                      item={req}
                      onUpdateField={handleUpdateField}
                      onToggleMandatory={handleToggleMandatory}
                      onToggleConfirmed={handleToggleConfirmed}
                      onDelete={handleDeleteRequirement}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="flex items-center justify-between pt-4">
              <Link
                href="/jobs"
                className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-700 text-sm font-bold rounded-xl transition-colors border border-slate-200 shadow-xs"
              >
                Back to Jobs
              </Link>

              <button
                type="button"
                onClick={handleSaveAndConfirm}
                disabled={isSaving || requirements.length === 0}
                className="px-8 py-3.5 bg-brand-orange hover:bg-brand-orange-hover disabled:bg-slate-300 disabled:text-slate-500 text-white text-sm font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg flex items-center gap-2 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Saving & Confirming Requirements...</span>
                  </>
                ) : (
                  <>
                    <span>Save & Confirm Requirements</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    )}

        {/* Tab 2: AI Semantic Understanding */}
        {activeTab === 'normalized_ai' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                      Enterprise Semantic Intelligence Layer
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      aiStatus === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      Status: {aiStatus}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-[#1E293B]">Normalized Semantic JD Representation</h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                    Understands technological concepts across naming variants (e.g. React.js ≈ ReactJS), differentiates mandatory vs. preferred requirements, and extracts experience without word-chopping.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRunAiNormalization}
                  disabled={isNormalizing}
                  className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange flex items-center gap-2 self-start sm:self-auto cursor-pointer disabled:opacity-50"
                >
                  {isNormalizing ? (
                    <>
                      <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>AI service analyzing... (retrying automatically if busy)</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>{normalizedJd ? 'Re-run Semantic Analysis' : 'Run Semantic Understanding'}</span>
                    </>
                  )}
                </button>
              </div>

              {normalizedJd ? (
                <div className="mt-6 space-y-6">
                  {/* Summary & Experience Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Target Position</span>
                      <h3 className="text-base font-bold text-[#1E293B]">{normalizedJd.job_title || jobTitle}</h3>
                      {normalizedJd.summary && (
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{normalizedJd.summary}</p>
                      )}
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Experience Baseline</span>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-bold text-xs">
                          {normalizedJd.experience?.minimum_years ? `${normalizedJd.experience.minimum_years}+ Years Minimum` : 'Flexible / Unspecified'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {normalizedJd.experience?.description || 'General professional background as stated in JD.'}
                      </p>

                    </div>
                  </div>

                  {/* Mandatory Normalized Requirements */}
                  <div>
                    <h3 className="text-sm font-bold text-[#1E293B] flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      Mandatory Requirements & Recognized Aliases ({normalizedJd.mandatory_requirements?.length || 0})
                    </h3>
                    <div className="space-y-3">
                      {(normalizedJd.mandatory_requirements || []).map((nr: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-xl bg-rose-50/30 border border-rose-100 hover:border-rose-200 transition-colors space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">{nr.name}</span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              {nr.category || 'Mandatory Skill'}
                            </span>
                          </div>
                          {nr.description && nr.description !== nr.name && (
                            <p className="text-xs text-slate-600 leading-relaxed">{nr.description}</p>
                          )}
                          {nr.aliases && nr.aliases.length > 1 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-rose-100/60">
                              <span className="text-[10px] font-semibold text-slate-500">Recognized Aliases:</span>
                              {nr.aliases.map((a: string, aIdx: number) => (
                                <span key={aIdx} className="px-2 py-0.5 rounded-md text-[10px] bg-white border border-rose-200 text-rose-700 font-mono">
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preferred Normalized Requirements */}
                  <div>
                    <h3 className="text-sm font-bold text-[#1E293B] flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-brand-orange"></span>
                      Preferred & Nice-to-Have Requirements ({normalizedJd.preferred_requirements?.length || 0})
                    </h3>
                    <div className="space-y-3">
                      {(normalizedJd.preferred_requirements || []).map((nr: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-xl bg-amber-50/30 border border-amber-100 hover:border-amber-200 transition-colors space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">{nr.name}</span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              {nr.category || 'Preferred Skill'}
                            </span>
                          </div>
                          {nr.description && nr.description !== nr.name && (
                            <p className="text-xs text-slate-600 leading-relaxed">{nr.description}</p>
                          )}
                          {nr.aliases && nr.aliases.length > 1 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-amber-100/60">
                              <span className="text-[10px] font-semibold text-slate-500">Recognized Aliases:</span>
                              {nr.aliases.map((a: string, aIdx: number) => (
                                <span key={aIdx} className="px-2 py-0.5 rounded-md text-[10px] bg-white border border-amber-200 text-amber-800 font-mono">
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Responsibilities */}
                  {normalizedJd.responsibilities && normalizedJd.responsibilities.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-[#1E293B] mb-2">Core Responsibilities</h3>
                      <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-700">
                        {normalizedJd.responsibilities.map((resp: string, rIdx: number) => (
                          <li key={rIdx} className="leading-relaxed">{resp}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Detected Technologies */}
                  {normalizedJd.technologies && normalizedJd.technologies.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-[#1E293B] mb-2">Detected Technology Stack</h3>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {normalizedJd.technologies.map((tech: string, tIdx: number) => (
                          <span key={tIdx} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 text-xs font-semibold">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-brand-orange-pale text-brand-orange flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-bold text-[#1E293B] mb-1">No AI Semantic Breakdown Available Yet</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                    Run Semantic Understanding to extract normalized criteria, technology aliases, and experience targets for accurate candidate matching.
                  </p>
                  <button
                    type="button"
                    onClick={handleRunAiNormalization}
                    disabled={isNormalizing}
                    className="px-6 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange flex items-center gap-2 mx-auto cursor-pointer"
                  >
                    Run Semantic Understanding
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Original JD Document */}
        {activeTab === 'original_jd' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div>
                <h3 className="text-base font-bold text-[#1E293B]">Preserved Original Job Description</h3>
                <p className="text-xs text-slate-500">Unaltered raw text exactly as provided by the hiring manager or recruiter.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (originalJdText) {
                    navigator.clipboard.writeText(originalJdText);
                    setSuccessMsg('Original JD copied to clipboard!');
                    setTimeout(() => setSuccessMsg(''), 2500);
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Copy Text
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
              {originalJdText || 'No original JD text recorded for this job.'}
            </div>

          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

// Requirement Card Component matching Section 2 of Task 2
function RequirementCard({
  item,
  onUpdateField,
  onToggleMandatory,
  onToggleConfirmed,
  onDelete
}: {
  item: RequirementItem;
  onUpdateField: (id: string, updates: Partial<RequirementItem>) => void;
  onToggleMandatory: (id: string) => void;
  onToggleConfirmed: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showSource, setShowSource] = useState(false);

  return (
    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all space-y-3 shadow-xs">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mandatory / Preferred Status Button */}
          <button
            type="button"
            onClick={() => onToggleMandatory(item.id)}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
              item.isMandatory
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                : 'bg-brand-orange-pale text-brand-orange border-brand-orange-border hover:bg-brand-orange/10'
            }`}
          >
            {item.isMandatory ? 'Mandatory' : 'Preferred'}
          </button>

          {/* Unclear Classification Flag */}
          {item.needsVerification && (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
              Needs Verification
            </span>
          )}

          {/* Recruiter Added Flag */}
          {item.isRecruiterAdded && (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
              Recruiter Added
            </span>
          )}

          {/* Recruiter Confirmed Toggle Badge */}
          <button
            type="button"
            onClick={() => onToggleConfirmed(item.id)}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
              item.recruiterConfirmed
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
            }`}
          >
            Recruiter Confirmed: {item.recruiterConfirmed ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Delete Action Button */}
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="text-slate-400 hover:text-rose-600 text-xs font-bold transition-colors flex items-center gap-1 self-end sm:self-auto cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span>Delete</span>
        </button>
      </div>

      {/* Requirement Text Input */}
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
          Requirement
        </label>
        <input
          type="text"
          value={item.requirement}
          onChange={(e) => onUpdateField(item.id, { requirement: e.target.value })}
          className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-[#1E293B] text-xs font-semibold focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20"
        />
      </div>

      {/* Grid Controls: Category, Weight, Evidence Required */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
        {/* Category Dropdown */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Category
          </label>
          <select
            value={item.category}
            onChange={(e) => onUpdateField(item.id, { category: e.target.value })}
            className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[#1E293B] text-xs focus:outline-none focus:border-brand-orange cursor-pointer"
          >
            {SUPPORTED_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Weight Selector */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Weight ({item.weight.toFixed(1)}x)
          </label>
          <input
            type="number"
            step="0.1"
            min="1.0"
            max="3.0"
            value={item.weight}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                onUpdateField(item.id, { weight: val });
              }
            }}
            className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[#1E293B] text-xs focus:outline-none focus:border-brand-orange"
          />
        </div>

        {/* Evidence Required Checkbox */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Evidence Required
          </label>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={item.evidenceRequired}
              onChange={(e) => onUpdateField(item.id, { evidenceRequired: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-brand-orange focus:ring-brand-orange"
            />
            <span className="font-semibold">{item.evidenceRequired ? 'ON (Required)' : 'OFF (Optional)'}</span>
          </label>
        </div>
      </div>

      {/* Read-Only Informational Source Evidence Block */}
      {item.sourceEvidence && (
        <div className="pt-2 border-t border-slate-200">
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700">
            <span className="text-slate-400 block text-[10px] uppercase font-bold mb-0.5 tracking-wider">Source Evidence (Extracted from JD):</span>
            <p className="italic text-slate-700 text-xs font-mono">"{item.sourceEvidence}"</p>
          </div>
        </div>
      )}
    </div>
  );
}
