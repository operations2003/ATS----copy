'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import HireIQHiringReality from '@/components/jobs/HireIQHiringReality';

interface ExtractedRequirement {
  id: string;
  requirement: string;
  category: string;
  mandatory: boolean;
  type?: string;
  weight: number;
  sourceEvidence?: string;
  sourceSection?: string;
}

interface DocumentMetrics {
  fileName: string;
  fileType: string;
  pageCount: number;
  extractionMethod: string;
  ocrUsed: boolean;
  textLength: number;
  wordCount: number;
  lineCount: number;
}

function CreateJobContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, token } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const orgParam = searchParams.get('organizationId') || searchParams.get('orgId') || '';
  const clientParam = searchParams.get('client') || searchParams.get('clientName') || '';

  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.email?.toLowerCase().trim() === 'operations@tasknera.com' || user?.email?.toLowerCase().trim() === 'admin@gmail.com';
  let canUploadJd = isSuperAdmin || user?.allowJdUpload !== false;
  if (!isSuperAdmin && typeof window !== 'undefined') {
    try {
      const overrides = JSON.parse(localStorage.getItem('tasknera_org_jd_permissions') || '{}');
      const orgId = user?.organizationId;
      const uEmail = user?.email?.toLowerCase().trim();
      if (orgId && overrides[orgId] !== undefined) {
        canUploadJd = overrides[orgId] === true;
      } else if (uEmail && overrides[uEmail] !== undefined) {
        canUploadJd = overrides[uEmail] === true;
      }
    } catch {}
  }

  // Form State
  const [client, setClient] = useState(clientParam || '');

  React.useEffect(() => {
    if (clientParam && !client) {
      setClient(clientParam);
    }
  }, [clientParam]);
  const [position, setPosition] = useState('');
  const [location, setLocation] = useState('');
  const [workMode, setWorkMode] = useState<'Remote' | 'Hybrid' | 'Onsite'>('Hybrid');
  const [salary, setSalary] = useState('');
  const [jdText, setJdText] = useState('');

  // Debug & Metrics State
  const [rawText, setRawText] = useState('');
  const [layoutText, setLayoutText] = useState('');
  const [normalizedText, setNormalizedText] = useState('');
  const [docMetrics, setDocMetrics] = useState<DocumentMetrics | null>(null);
  const [showRawTextDrawer, setShowRawTextDrawer] = useState(false);
  const [showHiringReality, setShowHiringReality] = useState(true);

  // File Upload State
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>('');
  const [scanComplete, setScanComplete] = useState(false);

  // Scanned Requirements State
  const [requirements, setRequirements] = useState<ExtractedRequirement[]>([]);
  const [newReqText, setNewReqText] = useState('');
  const [newReqMandatory, setNewReqMandatory] = useState(true);

  React.useEffect(() => {
    if (typeof window === 'undefined' || searchParams.get('fromGenerated') !== '1') return;
    try {
      const raw = sessionStorage.getItem('tasknera_generated_jd');
      if (!raw) return;
      const generated = JSON.parse(raw);
      setPosition(generated.position || '');
      setLocation(generated.location || '');
      setWorkMode(['Remote', 'Hybrid', 'Onsite'].includes(generated.workMode) ? generated.workMode : 'Hybrid');
      setSalary(generated.salary || '');
      setJdText(generated.jdText || '');
      if (generated.client) setClient(generated.client);
      setRequirements((generated.requirements || []).map((item: any, index: number) => ({
        id: `generated-${index + 1}`,
        requirement: item.requirement || '',
        category: 'Role Requirement',
        mandatory: Boolean(item.mandatory),
        weight: item.mandatory ? 2 : 1,
        type: 'SKILL',
      })).filter((item: ExtractedRequirement) => item.requirement));
      setActiveTab('text');
      sessionStorage.removeItem('tasknera_generated_jd');
    } catch { /* Keep the standard create form available if the saved draft is malformed. */ }
  }, [searchParams]);

  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ client?: string; position?: string }>({});

  // Backend Parsing API Integration
  const sendToBackendParseApi = async (fileOrText: File | string) => {
    if (!canUploadJd) {
      setErrorMsg('JD Upload Permission is disabled for your client account. Only the Super Admin is authorized to upload and manage Job Descriptions for this organization.');
      return;
    }
    setIsScanning(true);
    setScanComplete(false);
    setErrorMsg('');
    setDocMetrics(null);
    setScanStep('Sending document to backend parsing pipeline...');

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const authToken = token || localStorage.getItem('tasknera_token');

      let response: Response;

      if (typeof fileOrText === 'string') {
        setScanStep('Executing backend text extraction & section detection...');
        response = await fetch(`${backendUrl}/jobs/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          },
          body: JSON.stringify({ text: fileOrText })
        });
      } else {
        setScanStep('Extracting PDF/Word document bytes & running Quality Assessment / OCR...');
        const formData = new FormData();
        formData.append('file', fileOrText);

        response = await fetch(`${backendUrl}/jobs/parse`, {
          method: 'POST',
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          },
          body: formData
        });
      }

      let resData: any = {};
      try {
        resData = await response.json();
      } catch {
        setIsScanning(false);
        setErrorMsg('Server returned an unreadable response. Please check your network and try again.');
        return;
      }

      if (!response.ok || !resData.success) {
        setIsScanning(false);
        setErrorMsg(resData.error || 'Unable to extract readable text from this document. Text extraction was insufficient.');
        return;
      }

      setScanStep('Validating metadata & extracting individual criteria...');

      const payload = resData.data || resData || {};
      const extractedReqs = payload.requirements || payload.hiringCriteria || [];
      const docInfo = payload.document || null;

      if (docInfo) {
        setDocMetrics(docInfo);
      }

      // Populate extracted metadata cleanly with multi-field fallback
      const extractedCompany = payload.companyName || payload.job?.company || payload.job?.client || payload.metadata?.client || payload.metadata?.companyName || '';
      const extractedPosition = payload.positionTitle || payload.job?.jobTitle || payload.job?.position || payload.metadata?.position || payload.metadata?.positionTitle || '';
      const extractedLocation = payload.location || payload.job?.location || payload.metadata?.location || '';
      const extractedSalary = payload.salary || payload.job?.salary || payload.metadata?.budget || payload.metadata?.salary || '';
      const extractedWorkMode = payload.workMode || payload.job?.workMode || payload.metadata?.workMode || '';

      setPosition(extractedPosition);
      setClient(extractedCompany);
      setLocation(extractedLocation);
      setSalary(extractedSalary);
      if (extractedWorkMode && ['Remote', 'Hybrid', 'Onsite'].includes(extractedWorkMode)) {
        setWorkMode(extractedWorkMode as any);
      }

      setRawText(resData.rawText || '');
      setLayoutText(resData.layoutText || resData.rawText || '');
      setNormalizedText(resData.normalizedText || resData.rawText || '');
      setJdText(resData.rawText || '');

      const cleanRequirementText = (str: string): string => {
        if (!str) return '';
        return str
          .replace(/\$\\le\$/gi, '≤')
          .replace(/\\le\b/gi, '≤')
          .replace(/\$\\ge\$/gi, '≥')
          .replace(/\\ge\b/gi, '≥')
          .replace(/\$\\sim\$/gi, '~')
          .replace(/^#{1,6}\s*/, '')
          .replace(/^\s*\*\*(.*?)\*\*\s*$/, '$1')
          .replace(/^\s*\[\s*[xX✓✔]?\s*\]\s*/, '')
          .replace(/^\s*\(\s*[xX✓✔]?\s*\)\s*/, '')
          .replace(/^\s*(?:(?:\d+|[a-zA-Z])[\.\)]|\(\d+\))\s+/, '')
          .replace(/^\s*[•●*▪▫➢✓✔·\u2022\u2023\u25E6\u2043\u2219]\s*/, '')
          .replace(/^\s*[-–—:]\s+/, '')
          .replace(/\[\s*[xX✓✔]?\s*\]/g, '')
          .trim();
      };

      // Format requirements
      const formattedReqs: ExtractedRequirement[] = Array.isArray(extractedReqs)
        ? extractedReqs.map((r: any, idx: number) => {
            const cleanText = cleanRequirementText(r.requirement);
            const cleanEvidence = cleanRequirementText(r.sourceEvidence || r.requirement);
            return {
              id: `req-${Date.now()}-${idx}`,
              requirement: cleanText,
              category: r.category || 'Technical Skill',
              mandatory: Boolean(r.isMandatory ?? r.mandatory ?? r.is_mandatory),
              type: r.type || (r.category === 'Hiring Criteria' || r.sourceSection === 'Top Hiring Criteria' ? 'HIRING_CRITERIA' : 'SKILL'),
              weight: r.weight || (Boolean(r.isMandatory ?? r.mandatory ?? r.is_mandatory) ? 1.5 : 1.0),
              sourceEvidence: cleanEvidence,
              sourceSection: r.sourceSection || ''
            };
          }).filter(r => r.requirement && r.requirement.length >= 2)
        : [];

      setRequirements(formattedReqs);
      setIsScanning(false);
      setScanComplete(true);
    } catch (err: any) {
      console.error('Backend parse error:', err);
      setIsScanning(false);
      setErrorMsg(err.message || 'Unable to extract structured data from document.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      setUploadedFile(file);
      setIsScanning(false);
      setErrorMsg(`"${file.name}" is an empty file (0.0 KB). Please select a valid document with readable content.`);
      return;
    }

    setUploadedFile(file);
    sendToBackendParseApi(file);
  };

  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setUploadedFile(null);
    setJdText('');
    setRawText('');
    setLayoutText('');
    setNormalizedText('');
    setDocMetrics(null);
    setScanComplete(false);
    setScanStep('');
    setRequirements([]);
    setClient('');
    setPosition('');
    setLocation('');
    setSalary('');
    setWorkMode('Hybrid');
  };

  const handleAddCustomRequirement = () => {
    if (!newReqText || !newReqText.trim()) return;

    const newReq: ExtractedRequirement = {
      id: `req-custom-${Date.now()}`,
      requirement: newReqText.trim(),
      category: 'General',
      mandatory: newReqMandatory,
      weight: newReqMandatory ? 5 : 2,
      sourceEvidence: 'User added custom requirement'
    };

    setRequirements(prev => [...prev, newReq]);
    setNewReqText('');
  };

  const handleRemoveRequirement = (id: string) => {
    setRequirements(prev => prev.filter(r => r.id !== id));
  };

  const handleToggleMandatory = (id: string) => {
    setRequirements(prev => prev.map(r => r.id === id ? { ...r, mandatory: !r.mandatory } : r));
  };

  const validateForm = () => {
    const errors: { client?: string; position?: string } = {};
    if (!client || !client.trim()) {
      errors.client = 'Client / Company name is required';
    }
    if (!position || !position.trim()) {
      errors.position = 'Position title is required';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!canUploadJd) {
      setErrorMsg('JD Upload Permission is disabled for your client account. Only the Super Admin is authorized to upload and manage Job Descriptions for this organization.');
      return;
    }

    if (isSubmitting) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    setIsSubmitting(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const authToken = token || localStorage.getItem('tasknera_token');

      const response = await fetch(`${backendUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          organizationId: (isSuperAdmin && orgParam) ? orgParam : undefined,
          client: client.trim(),
          position: position.trim(),
          location: location.trim() || undefined,
          work_mode: workMode,
          salary: salary.trim() || undefined,
          jd_text: jdText.trim() || undefined,
          jd_file_url: uploadedFile ? uploadedFile.name : undefined,
          status: 'active',
          requirements: requirements.map(r => ({
            requirement: r.requirement,
            category: r.category,
            is_mandatory: r.mandatory,
            weight: r.weight,
          }))
        })
      });

      let resData: any = {};
      try {
        resData = await response.json();
      } catch (e) {
        console.warn('Response json parse error', e);
      }

      const createdJob = {
        ...(resData?.job || resData?.data || {}),
        id: resData?.job?.id || resData?.data?.id || `job-${Date.now()}`,
        client: client.trim(),
        position: position.trim(),
        location: location.trim() || 'Location Not Specified',
        work_mode: workMode,
        salary: salary.trim() || undefined,
        status: 'Active',
        created_at: new Date().toISOString(),
        created_by: user?.id,
        createdBy: user?.id,
        creatorEmail: user?.email,
        user: user ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        } : undefined,
        workedBy: user ? [{
          id: user.id,
          name: user.name || (user.email ? user.email.split('@')[0] : 'Ram Charan'),
          email: user.email,
          role: user.role || 'MEMBER',
          action: 'Uploaded JD',
          isCreator: true
        }] : [],
        requirements: requirements,
      };

      if (typeof window !== 'undefined') {
        try {
          const existing = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
          const isBad = (x: any) => {
            const c = String(x?.client || '').toLowerCase().trim();
            const p = String(x?.position || '').toLowerCase().trim();
            return c.includes('test client') || p.includes('test engineer');
          };
          const updated = [createdJob, ...existing.filter((x: any) => String(x.id) !== String(createdJob.id) && !isBad(x))];
          localStorage.setItem('tasknera_created_jobs', JSON.stringify(updated));
        } catch (e) {}
      }

      router.push('/jobs');
    } catch (err: any) {
      console.error('Job creation error:', err);
      setErrorMsg(err.message || 'An error occurred while creating the job.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hiringCriteriaList = requirements.filter(r => r.type === 'HIRING_CRITERIA' || r.category === 'Hiring Criteria' || r.sourceSection === 'Top Hiring Criteria');
  const mandatorySkillsList = requirements.filter(r => r.mandatory && r.type !== 'HIRING_CRITERIA' && r.category !== 'Hiring Criteria' && r.sourceSection !== 'Top Hiring Criteria');
  const preferredSkillsList = requirements.filter(r => !r.mandatory && r.type !== 'HIRING_CRITERIA' && r.category !== 'Hiring Criteria' && r.sourceSection !== 'Top Hiring Criteria');

  const mandatoryCount = mandatorySkillsList.length;
  const preferredCount = preferredSkillsList.length;
  const hiringCriteriaCount = hiringCriteriaList.length;

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-[#1E293B] flex flex-col selection:bg-brand-orange-pale selection:text-brand-orange">
      {/* Global Header */}
      <Header />

      <main className="max-w-5xl mx-auto px-6 pt-28 pb-16 w-full flex-1">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-orange transition-colors group"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Jobs
          </Link>
        </div>

        {/* Page Title Header Card */}
        <div className="mb-8 bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-orange-pale border border-brand-orange-border flex items-center justify-center text-brand-orange shadow-xs flex-shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1E293B]">
                  Upload Job Description (JD)
                </h1>
                <p className="text-slate-500 text-sm mt-0.5 max-w-2xl">
                  Upload a Job Description or paste the text
                </p>
              </div>
            </div>
          </div>


          {/* Super Admin Client Context Banner */}
          {isSuperAdmin && (orgParam || clientParam) && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-between text-xs text-violet-800 font-medium">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-600 animate-pulse"></span>
                <span>Uploading JD on behalf of client: <strong>{clientParam || orgParam}</strong></span>
              </div>
              <span className="text-[11px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-mono">Org ID: {orgParam}</span>
            </div>
          )}

          {/* JD Upload Restricted Banner */}
          {!canUploadJd && (
            <div className="mb-6 p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 shadow-sm flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base text-amber-900 mb-1">JD Upload Restricted</h3>
                <p className="text-sm text-amber-800 leading-relaxed">
                  Only the Super Admin is authorized to upload and create Job Descriptions for this organization. You can view, evaluate candidates, and manage applications for existing jobs from the Jobs Dashboard.
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => router.push('/jobs')}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                  >
                    View Existing Jobs & Candidates →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Workflow Stepper */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-6">
            {/* Step 1 */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-orange-pale/40 border border-brand-orange-border">
              <div className="w-8 h-8 rounded-lg bg-brand-orange text-white font-extrabold text-xs flex items-center justify-center shadow-xs flex-shrink-0">
                1
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-[#1E293B] truncate">Upload & Parse JD</p>
                <p className="text-[11px] font-semibold text-brand-orange hidden sm:block">In Progress</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center flex-shrink-0">
                2
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-slate-600 truncate">Review Criteria</p>
                <p className="text-[11px] text-slate-400 hidden sm:block">Next Step</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center flex-shrink-0">
                3
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-slate-600 truncate">Candidate Pipeline</p>
                <p className="text-[11px] text-slate-400 hidden sm:block">Final Step</p>
              </div>
            </div>
          </div>
        </div>

        {/* Global Error State Banner */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3 shadow-sm">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="font-bold block mb-0.5">Extraction / Parsing Warning</span>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Section 1: Document Upload & Scanner Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-orange"></span>
                <h2 className="text-lg font-bold text-[#1E293B]">Job Description Document & Parser</h2>
              </div>

              {/* Mode Tabs */}
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('file')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'file' ? 'bg-brand-orange text-white shadow-sm' : 'text-slate-600 hover:text-[#1E293B]'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload File (.pdf, .docx)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('text')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'text' ? 'bg-brand-orange text-white shadow-sm' : 'text-slate-600 hover:text-[#1E293B]'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Paste Text Directly
                </button>
              </div>
            </div>

            {/* File Upload Zone */}
            {activeTab === 'file' ? (
              <div className="relative border-2 border-dashed border-slate-200 hover:border-brand-orange rounded-2xl p-8 text-center transition-all bg-slate-50/70 hover:bg-brand-orange-pale/20 group">
                {!uploadedFile && (
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                )}
                <div className="flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-brand-orange-pale border border-brand-orange-border text-brand-orange flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shadow-xs">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  {uploadedFile ? (
                    <div className="relative z-20 flex flex-col items-center">
                      <p className="text-[#1E293B] font-bold text-sm mb-2">Uploaded Document:</p>
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-orange-pale border border-brand-orange-border text-brand-orange text-xs font-mono mb-3">
                        <svg className="w-4 h-4 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="font-semibold">{uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer z-30"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Remove File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[#1E293B] font-bold text-sm mb-1">Click to upload or drag and drop your JD file</p>
                      <p className="text-slate-500 text-xs">Supports PDF, Word (.docx, .doc), or TXT • OCR engine automatically extracts requirements</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <textarea
                  rows={6}
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste complete job description text here..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-[#1E293B] placeholder-slate-400 focus:bg-white focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 transition-all text-xs font-mono resize-none mb-3"
                />
                <button
                  type="button"
                  onClick={() => sendToBackendParseApi(jdText)}
                  disabled={!jdText.trim() || isScanning}
                  className="px-4 py-2.5 bg-brand-orange hover:bg-brand-orange-hover disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-orange"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Parse Job Description Text
                </button>
              </div>
            )}

            {/* Live Scanning Progress Indicator */}
            {isScanning && (
              <div className="mt-6 p-4 rounded-xl bg-brand-orange-pale border border-brand-orange-border flex items-center gap-4 animate-pulse">
                <div className="w-6 h-6 border-2 border-brand-orange border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <div>
                  <span className="text-brand-orange font-bold text-xs block mb-0.5">Processing Pipeline</span>
                  <span className="text-slate-700 text-xs font-mono">{scanStep}</span>
                </div>
              </div>
            )}

            {/* Scan Success Summary */}
            {scanComplete && (
              <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2 text-emerald-800 flex-wrap">
                  <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-bold">Extraction Complete:</span>
                  <span>{mandatoryCount} Mandatory Skills</span>
                  <span>•</span>
                  <span>{preferredCount} Preferred Skills</span>
                  {hiringCriteriaCount > 0 && (
                    <>
                      <span>•</span>
                      <span>{hiringCriteriaCount} Hiring Criteria</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowHiringReality(prev => !prev)}
                    className="text-xs text-brand-orange hover:text-brand-orange-hover font-bold flex items-center gap-1.5 cursor-pointer bg-brand-orange/10 px-3 py-1.5 rounded-xl border border-brand-orange/20 transition-all hover:bg-brand-orange/15 shadow-2xs"
                  >
                    <span>⚡</span>
                    <span>{showHiringReality ? 'Hide Hiring Reality Stress Test' : 'Run Hiring Reality Stress Test'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRawTextDrawer(!showRawTextDrawer)}
                    className="text-xs text-slate-500 hover:text-slate-800 font-bold underline flex items-center gap-1 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    {showRawTextDrawer ? 'Hide Debug Drawer' : 'View Extracted Raw Text & Metrics'}
                  </button>
                </div>
              </div>
            )}

            {/* Collapsible RAW DOCUMENT TEXT & Diagnostic Drawer */}
            {showRawTextDrawer && (
              <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
                <div className="flex items-center justify-between mb-3 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800 pb-2">
                  <span className="text-brand-orange-light font-bold flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Document Diagnostic Summary
                  </span>
                  <button onClick={() => setShowRawTextDrawer(false)} className="hover:text-white cursor-pointer">Close [✕]</button>
                </div>

                {docMetrics && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 p-3 bg-slate-800/80 rounded-lg border border-slate-700 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Document Name:</span>
                      <span className="text-slate-100 font-semibold truncate block">{docMetrics.fileName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">File Type:</span>
                      <span className="text-slate-100 font-semibold truncate block">{docMetrics.fileType}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Page Count:</span>
                      <span className="text-slate-100 font-semibold block">{docMetrics.pageCount} page(s)</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Extraction Method:</span>
                      <span className="text-brand-orange font-semibold uppercase block">{docMetrics.extractionMethod}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">OCR Used:</span>
                      <span className={`font-bold block ${docMetrics.ocrUsed ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {docMetrics.ocrUsed ? 'YES (Image OCR Fallback)' : 'NO (Native Text Stream)'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Extracted Characters:</span>
                      <span className="text-slate-100 font-semibold block">{docMetrics.textLength} chars</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Extracted Words:</span>
                      <span className="text-slate-100 font-semibold block">{docMetrics.wordCount} words</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Non-empty Lines:</span>
                      <span className="text-slate-100 font-semibold block">{docMetrics.lineCount} lines</span>
                    </div>
                  </div>
                )}

                <div className="text-slate-400 text-[11px] mb-1 font-semibold uppercase">--------------------------------<br />RAW DOCUMENT TEXT<br />--------------------------------</div>
                <pre className="whitespace-pre-wrap text-slate-300 max-h-60 overflow-y-auto leading-relaxed">{rawText || '(No raw text available)'}</pre>
              </div>
            )}
          </div>

          {/* HireIQ Hiring Reality Stress Test (Phase 2) */}
          {(scanComplete || requirements.length > 0) && showHiringReality && (
            <div className="animate-fadeIn">
              <HireIQHiringReality
                jobTitle={position || 'Position Requisition'}
                client={client || 'Client Organization'}
                location={location}
                workMode={workMode}
                salary={salary}
                jdText={jdText || rawText}
                requirements={requirements}
              />
            </div>
          )}

          {/* Section 2: Extracted Job Specifications Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
            <h2 className="text-lg font-bold text-[#1E293B] mb-6 pb-4 border-b border-slate-100 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-orange"></span>
              Job Specifications & Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Client */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Company / Client Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value);
                    if (fieldErrors.client) setFieldErrors(prev => ({ ...prev, client: undefined }));
                  }}
                  placeholder="e.g. BlueOrbit Technologies (or Not specified in JD)"
                  className={`w-full px-4 py-3 rounded-xl bg-slate-50/70 border text-[#1E293B] text-sm placeholder-slate-400 focus:bg-white focus:outline-none transition-all ${
                    fieldErrors.client ? 'border-rose-500 focus:ring-2 focus:ring-rose-200' : 'border-slate-200 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20'
                  }`}
                />
                {fieldErrors.client && <p className="text-rose-500 text-xs mt-1 font-semibold">{fieldErrors.client}</p>}
              </div>

              {/* Position */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Position Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => {
                    setPosition(e.target.value);
                    if (fieldErrors.position) setFieldErrors(prev => ({ ...prev, position: undefined }));
                  }}
                  placeholder="e.g. Senior SAP CO Consultant"
                  className={`w-full px-4 py-3 rounded-xl bg-slate-50/70 border text-[#1E293B] text-sm placeholder-slate-400 focus:bg-white focus:outline-none transition-all ${
                    fieldErrors.position ? 'border-rose-500 focus:ring-2 focus:ring-rose-200' : 'border-slate-200 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20'
                  }`}
                />
                {fieldErrors.position && <p className="text-rose-500 text-xs mt-1 font-semibold">{fieldErrors.position}</p>}
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. New York, NY (or Remote)"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-[#1E293B] text-sm placeholder-slate-400 focus:bg-white focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 transition-all"
                />
              </div>

              {/* Work Mode */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Workplace Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value as 'Remote' | 'Hybrid' | 'Onsite')}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-[#1E293B] text-sm focus:bg-white focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 transition-all cursor-pointer"
                >
                  <option value="Remote">Remote</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Onsite">On-site</option>
                </select>
              </div>

              {/* Salary */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Compensation Range
                </label>
                <input
                  type="text"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder="e.g. $130,000 – $170,000 / year (Leave empty if not specified)"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 text-[#1E293B] text-sm placeholder-slate-400 focus:bg-white focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Extracted Requirements Panel */}
          {requirements.length > 0 && (
            <div className="space-y-6">
              {/* Header Stats */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[#1E293B]">Candidate Evaluation Criteria ({requirements.length})</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Section-aware classification automatically derived from Job Description.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                    Mandatory Skills: {mandatoryCount}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-brand-orange-pale text-brand-orange border border-brand-orange-border font-bold">
                    Preferred Skills: {preferredCount}
                  </span>
                  {hiringCriteriaCount > 0 && (
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                      Hiring Criteria: {hiringCriteriaCount}
                    </span>
                  )}
                </div>
              </div>

              {/* 1. Mandatory Skills Section */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                    <h3 className="text-base font-bold text-[#1E293B]">Mandatory Requirements ({mandatorySkillsList.length})</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                    Strictly Enforced
                  </span>
                </div>

                <div className="space-y-3">
                  {mandatorySkillsList.length === 0 ? (
                    <p className="text-slate-400 text-xs italic">No mandatory requirements found.</p>
                  ) : (
                    mandatorySkillsList.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-4 group hover:border-slate-300 transition-all"
                      >
                        <div className="flex items-start gap-3 flex-1">
                          <button
                            type="button"
                            onClick={() => handleToggleMandatory(req.id)}
                            className="mt-0.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 cursor-pointer flex-shrink-0"
                          >
                            ✓ Mandatory
                          </button>
                          <div>
                            <span className="text-xs font-semibold text-slate-800 block leading-relaxed">{req.requirement}</span>
                            {req.sourceEvidence && (
                              <span className="text-[10px] text-slate-500 block italic mt-1">
                                Source Evidence: "{req.sourceEvidence}"
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 font-medium">
                            {req.category}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRequirement(req.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 2. Preferred Skills Section */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-orange"></span>
                    <h3 className="text-base font-bold text-[#1E293B]">Preferred Requirements ({preferredSkillsList.length})</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-brand-orange-pale text-brand-orange border border-brand-orange-border text-[11px] font-bold">
                    Bonus Scoring
                  </span>
                </div>

                <div className="space-y-3">
                  {preferredSkillsList.length === 0 ? (
                    <p className="text-slate-400 text-xs italic">No preferred requirements found.</p>
                  ) : (
                    preferredSkillsList.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-4 group hover:border-slate-300 transition-all"
                      >
                        <div className="flex items-start gap-3 flex-1">
                          <button
                            type="button"
                            onClick={() => handleToggleMandatory(req.id)}
                            className="mt-0.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border bg-brand-orange-pale text-brand-orange border-brand-orange-border hover:bg-brand-orange/10 cursor-pointer flex-shrink-0"
                          >
                            Preferred
                          </button>
                          <div>
                            <span className="text-xs font-semibold text-slate-800 block leading-relaxed">{req.requirement}</span>
                            {req.sourceEvidence && (
                              <span className="text-[10px] text-slate-500 block italic mt-1">
                                Source Evidence: "{req.sourceEvidence}"
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 font-medium">
                            {req.category}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRequirement(req.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 3. Hiring Criteria Section */}
              {hiringCriteriaList.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <h3 className="text-base font-bold text-[#1E293B]">Top Hiring Criteria ({hiringCriteriaList.length})</h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                      Position Directives
                    </span>
                  </div>

                  <div className="space-y-3">
                    {hiringCriteriaList.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-xl bg-emerald-50/40 border border-emerald-200/80 flex items-start justify-between gap-4 group hover:border-emerald-300 transition-all"
                      >
                        <div className="flex items-start gap-3 flex-1">
                          <span className="mt-0.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-emerald-100 text-emerald-800 border-emerald-300 flex-shrink-0">
                            ✓ Mandatory
                          </span>
                          <div>
                            <span className="text-xs font-semibold text-slate-800 block leading-relaxed">{req.requirement}</span>
                            {req.sourceEvidence && (
                              <span className="text-[10px] text-slate-500 block italic mt-1">
                                Source Evidence: "{req.sourceEvidence}"
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200 font-medium">
                            {req.category}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRequirement(req.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Custom Requirement Box */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">Add Custom Evaluation Criterion</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newReqText}
                    onChange={(e) => setNewReqText(e.target.value)}
                    placeholder="e.g. 5+ years experience with Salesforce Apex & LWC..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50/70 border border-slate-200 text-[#1E293B] text-xs placeholder-slate-400 focus:bg-white focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20"
                  />
                  <button
                    type="button"
                    onClick={() => setNewReqMandatory(!newReqMandatory)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border cursor-pointer ${
                      newReqMandatory ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-brand-orange-pale text-brand-orange border-brand-orange-border'
                    }`}
                  >
                    {newReqMandatory ? 'Mandatory' : 'Preferred'}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomRequirement}
                    className="px-4 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-4">
            <Link
              href="/jobs"
              className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-700 text-sm font-bold rounded-xl transition-colors border border-slate-200 shadow-xs"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSubmitting || isScanning || !canUploadJd}
              className="px-8 py-3.5 bg-brand-orange hover:bg-brand-orange-hover disabled:bg-slate-300 disabled:text-slate-500 text-white text-sm font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Saving JD & Criteria...</span>
                </>
              ) : (
                <>
                  <span>Save JD & Continue</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>

          </div>
        </form>
      </main>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="signin"
      />

      <Footer />
    </div>
  );
}

export default function CreateJobPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#EEF2F6] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CreateJobContent />
    </React.Suspense>
  );
}
