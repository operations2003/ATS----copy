'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Logo from '@/components/Logo';
import { getResolvedBackendUrl } from '@/lib/backendUrl';

interface Requirement {
  id: string;
  requirement: string;
  category?: string;
  is_mandatory?: boolean;
}

interface PublicJob {
  token: string;
  position: string;
  client: string;
  location?: string;
  work_mode?: string;
  salary?: string;
  jd_text?: string;
  requirements?: Requirement[];
}

export default function PublicJobApplyPage() {
  const params = useParams();
  const token = params?.token as string;

  const [job, setJob] = useState<PublicJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAcceptingApplications, setIsAcceptingApplications] = useState(true);
  const [closedMessage, setClosedMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<'idle' | 'uploading' | 'parsing' | 'evaluating' | 'success'>('idle');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState('');
  const [submitError, setSubmitError] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch Public Job Details
  useEffect(() => {
    async function fetchPublicJob() {
      if (!token) return;
      try {
        setIsLoading(true);
        setLoadError('');

        let data: any = null;
        let jobLoaded = false;

        // 1. Try Next.js same-origin API first
        try {
          const res = await fetch(`/api/public/jobs/${token}`);
          if (res.ok) {
            data = await res.json();
            jobLoaded = true;
          }
        } catch {}

        // 2. Try resolved backend URL if not loaded yet
        if (!jobLoaded) {
          const backendUrl = getResolvedBackendUrl();
          if (backendUrl && !backendUrl.startsWith('/api')) {
            try {
              const res = await fetch(`${backendUrl}/public/jobs/${token}`);
              if (res.ok) {
                data = await res.json();
                jobLoaded = true;
              }
            } catch {}
          }
        }

        if (!data) {
          throw new Error('This application link is invalid or may have expired.');
        }

        if (data.isAcceptingApplications === false) {
          setIsAcceptingApplications(false);
          setClosedMessage(data.message || 'This position is no longer accepting applications.');
          if (data.position) {
            setJob({
              token,
              position: data.position,
              client: data.client || 'Hiring Company',
            });
          }
          return;
        }

        setJob(data.job || {
          token,
          position: data.position || 'Open Requisition',
          client: data.client || 'Hiring Organization',
        });
        setIsAcceptingApplications(true);
      } catch (err: any) {
        console.error('Error fetching public job:', err);
        setLoadError(err.message || 'This application link is invalid or may have expired.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchPublicJob();
  }, [token]);

  // File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setSubmitError('');
    const validExtensions = ['.pdf', '.doc', '.docx', '.txt'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validExtensions.includes(ext)) {
      setSubmitError('Please upload a resume in PDF, DOCX, DOC, or TXT format.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setSubmitError('File size exceeds the 25MB limit.');
      return;
    }
    setSelectedFile(file);
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!fullName.trim()) {
      setSubmitError('Please provide your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setSubmitError('Please provide a valid email address.');
      return;
    }
    if (!selectedFile) {
      setSubmitError('Please upload your resume file.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitStage('uploading');

      // Stage progression simulation for smooth UX
      const timer1 = setTimeout(() => setSubmitStage('parsing'), 800);
      const timer2 = setTimeout(() => setSubmitStage('evaluating'), 2200);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', fullName.trim());
      formData.append('email', email.trim().toLowerCase());
      if (phone.trim()) formData.append('phone', phone.trim());

      let res: Response | null = null;
      let data: any = null;

      // 1. Try Next.js same-origin route first
      try {
        res = await fetch(`/api/public/jobs/${token}/apply`, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch {}

      // 2. Try resolved backend URL if Next.js proxy route failed
      if (!data) {
        const backendUrl = getResolvedBackendUrl();
        if (backendUrl && !backendUrl.startsWith('/api')) {
          try {
            res = await fetch(`${backendUrl}/public/jobs/${token}/apply`, {
              method: 'POST',
              body: formData,
            });
            if (res.ok) {
              data = await res.json();
            }
          } catch {}
        }
      }

      clearTimeout(timer1);
      clearTimeout(timer2);

      if (!data && res) {
        data = await res.json().catch(() => ({}));
      }

      if (!res || !res.ok) {
        throw new Error(data?.error || 'Failed to submit application. Please try again.');
      }

      // Store in localStorage so recruiter view reflects application immediately
      if (typeof window !== 'undefined') {
        try {
          const targetJobId = data.jobId || (job as any)?.id || (job as any)?.jobId || `job-${token}`;
          const appliedCandidate = data.candidate || {
            id: `cand-pub-${Date.now()}`,
            jobId: targetJobId,
            name: fullName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            source: 'public_application',
            parsingStatus: 'PARSED',
            matchScore: 80,
            atsScore: 80,
            matchLevel: 'STRONG MATCH',
            decision: 'SUBMIT',
            recommendation: 'SUBMIT',
            uploadedAt: new Date().toISOString(),
          };

          if (targetJobId) {
            const key = `tasknera_candidates_${targetJobId}`;
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            const filtered = existing.filter((c: any) =>
              c.id !== appliedCandidate.id &&
              c.email?.toLowerCase() !== appliedCandidate.email?.toLowerCase()
            );
            filtered.unshift(appliedCandidate);
            localStorage.setItem(key, JSON.stringify(filtered));
            localStorage.setItem(`tasknera_candidates_count_${targetJobId}`, String(filtered.length));
          }

          // Register in global pool of public applied candidates
          const allPublic = JSON.parse(localStorage.getItem('tasknera_public_applied_candidates') || '[]');
          const filteredAll = allPublic.filter((c: any) =>
            c.id !== appliedCandidate.id &&
            c.email?.toLowerCase() !== appliedCandidate.email?.toLowerCase()
          );
          filteredAll.unshift({ ...appliedCandidate, publicToken: token, jobId: targetJobId });
          localStorage.setItem('tasknera_public_applied_candidates', JSON.stringify(filteredAll));

          // Broadcast real-time candidate update event
          window.dispatchEvent(new CustomEvent('tasknera_candidates_updated', {
            detail: { jobId: targetJobId, candidate: appliedCandidate }
          }));
        } catch (storageErr) {
          console.warn('[Apply Page] Error syncing candidate to local cache:', storageErr);
        }
      }

      setSubmitStage('success');
      setSubmitSuccess(true);
      setSubmitSuccessMsg(
        data.message ||
        'Your application has been submitted successfully! Our recruitment team will review your qualifications.'
      );
    } catch (err: any) {
      console.error('Application submission error:', err);
      setSubmitStage('idle');
      setSubmitError(err.message || 'An error occurred while submitting your application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/70 to-slate-100 text-slate-800 flex flex-col justify-between selection:bg-brand-orange selection:text-white">
      {/* Public Top Navbar */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200 py-4 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <Logo href="/home" size="sm" variant="dark" />
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:inline-block">
            Careers Portal
          </span>
        </div>

        {job?.client && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Hiring for:</span>
            <span className="text-xs font-bold text-slate-800 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              {job.client}
            </span>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full flex-1">
        {/* Loading View */}
        {isLoading && (
          <div className="text-center py-24 bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
            <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-700">Loading Job Details...</p>
            <p className="text-xs text-slate-400 mt-1">Fetching position specifications and application requirements</p>
          </div>
        )}

        {/* Load Error View */}
        {loadError && !isLoading && (
          <div className="bg-white border border-rose-200 rounded-3xl p-8 sm:p-12 text-center shadow-sm max-w-xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-extrabold text-slate-800 mb-2">Invalid or Expired Link</h2>
            <p className="text-sm text-slate-500 mb-6">{loadError}</p>
            <div className="text-xs text-slate-400 font-medium bg-slate-50 p-4 rounded-xl border border-slate-100">
              Please check the URL or contact the recruiter who provided this application link.
            </div>
          </div>
        )}

        {/* Position Paused / Closed View */}
        {!isAcceptingApplications && !isLoading && !loadError && (
          <div className="bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-12 text-center shadow-sm max-w-xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            {job?.position && (
              <span className="text-xs font-bold text-brand-orange uppercase tracking-wider block mb-1">
                {job.position}
              </span>
            )}
            <h2 className="text-xl font-extrabold text-slate-800 mb-2">
              Applications Currently Closed
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              {closedMessage || 'This job is no longer accepting new applications.'}
            </p>
            <div className="text-xs text-slate-400 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
              Thank you for your interest. Please check back later or visit the company careers page for upcoming openings.
            </div>
          </div>
        )}

        {/* Application Form & Job Details View */}
        {job && isAcceptingApplications && !isLoading && (
          <div className="space-y-8">
            {/* 1. Job Information Banner */}
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ● Actively Hiring
                    </span>
                    {job.work_mode && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {job.work_mode}
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E293B] tracking-tight">
                    {job.position}
                  </h1>
                  <p className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-2 font-medium">
                    <span className="text-slate-900 font-bold">{job.client}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-slate-600">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {job.location || 'Remote / Hybrid'}
                    </span>
                  </p>
                </div>

                {job.salary && (
                  <div className="sm:text-right bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200/80 shrink-0">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Compensation</span>
                    <span className="text-sm font-extrabold text-emerald-600">{job.salary}</span>
                  </div>
                )}
              </div>

              {/* JD description summary */}
              {job.jd_text && (
                <div className="pt-6">
                  <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                    About The Role
                  </h2>
                  <div className="text-xs sm:text-sm text-slate-600 leading-relaxed max-h-48 overflow-y-auto pr-2 bg-slate-50/60 p-4 rounded-2xl border border-slate-200/60 whitespace-pre-line font-normal">
                    {job.jd_text}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Candidate Application Form Card */}
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm">
              {submitSuccess ? (
                <div className="text-center py-10 px-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-extrabold text-[#1E293B] mb-2">
                    Application Submitted!
                  </h3>
                  <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
                    {submitSuccessMsg}
                  </p>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 max-w-md mx-auto text-xs text-slate-500">
                    A confirmation has been recorded for <strong className="text-slate-800">{fullName}</strong> ({email}).
                    The hiring team for <strong className="text-slate-800">{job.position}</strong> will be in touch with next steps.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-xl font-extrabold text-[#1E293B]">
                      Submit Your Application
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload your resume to apply for this opening. Our system will analyze your skills directly against this requisition.
                    </p>
                  </div>

                  {submitError && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
                      <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <strong className="block font-bold">Please check your submission:</strong>
                        <span>{submitError}</span>
                      </div>
                    </div>
                  )}

                  {/* Personal Information Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        required
                        disabled={isSubmitting}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all font-medium disabled:opacity-60 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. rahul.sharma@example.com"
                        required
                        disabled={isSubmitting}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all font-medium disabled:opacity-60 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      disabled={isSubmitting}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange transition-all font-medium disabled:opacity-60 bg-white"
                    />
                  </div>

                  {/* Resume Upload Zone */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Resume / Curriculum Vitae <span className="text-rose-500">*</span>
                    </label>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={isSubmitting}
                    />

                    {selectedFile ? (
                      <div className="p-4 rounded-2xl bg-orange-50/60 border border-brand-orange/30 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-brand-orange text-white flex items-center justify-center shrink-0 shadow-xs">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {selectedFile.name}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {(selectedFile.size / 1024).toFixed(1)} KB • Ready to submit
                            </p>
                          </div>
                        </div>

                        {!isSubmitting && (
                          <button
                            type="button"
                            onClick={() => setSelectedFile(null)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white transition-colors"
                            title="Remove file"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                          dragOver
                            ? 'border-brand-orange bg-orange-50/50'
                            : 'border-slate-200 hover:border-brand-orange/60 hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-2xl bg-brand-orange-pale text-brand-orange flex items-center justify-center mx-auto mb-3 border border-brand-orange-border">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-slate-800">
                          Click to browse or drag & drop your resume
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Supported formats: PDF, DOCX, DOC, TXT (Maximum file size: 25MB)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Submission Progress State */}
                  {isSubmitting && (
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-brand-orange animate-ping" />
                          {submitStage === 'uploading' && 'Uploading your resume...'}
                          {submitStage === 'parsing' && 'Extracting qualifications & skills...'}
                          {submitStage === 'evaluating' && 'Matching profile against requisition...'}
                        </span>
                        <span className="text-brand-orange">
                          {submitStage === 'uploading' ? '30%' : (submitStage === 'parsing' ? '70%' : '90%')}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-brand-orange h-full rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: submitStage === 'uploading' ? '30%' : (submitStage === 'parsing' ? '70%' : '95%')
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 px-6 rounded-xl text-white text-sm font-bold bg-brand-orange hover:bg-brand-orange-hover transition-all shadow-orange hover:shadow-orange-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Processing Application...</span>
                        </>
                      ) : (
                        <>
                          <span>Submit Application</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-400 text-center mt-2.5">
                      By submitting, you agree to allow {job.client} to store and process your application data for recruitment purposes.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Public Footer */}
      <footer className="w-full border-t border-slate-200 py-6 px-6 sm:px-12 bg-white/80 text-center text-xs text-slate-400">
        <span>Powered by TaskNera ATS Enterprise Recruitment Platform</span>
      </footer>
    </div>
  );
}
