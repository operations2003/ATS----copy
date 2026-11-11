'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { atsStore, JobItem as StoreJobItem } from '@/lib/atsStore';

const STATUS_OPTIONS = [
  'Shared with Client',
  'Round 1 Phase Scheduled',
  'Round 2 Phase Scheduled',
  'Interview Completed',
  'Selected / Offer',
  'Offer Declined',
  'On Hold',
  'Not a Fit',
];

interface CandidateItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  currentTitle: string;
  currentCompany: string;
  totalExperience: string;
  location?: string;
  summary?: string;
  skills: string[];
  atsScore: number;
  matchLevel: string;
  mandatoryPassed: boolean;
  currentStatus: string;
  latestFeedback?: string | null;
  lastUpdatedDate: string;
  latestActivity?: any;
  timeline?: any[];
  hasResume: boolean;
  resumeFileName?: string | null;
  screeningNote?: string;
  screeningEvidence?: { requirement: string; status: 'MET' | 'PARTIAL' | 'MISSING'; evidence: string }[];
  jobId?: string;
  jobTitle?: string;
}

interface ClientPortalJob {
  id: string;
  title: string;
  department?: string;
  client: string;
  location: string;
  workMode: 'Hybrid' | 'Remote' | 'Onsite';
  salary: string;
  status: 'Agency Sourcing Candidates' | 'Active Screening' | 'Shortlist Delivered' | 'Closed';
  sourcedCount: number;
  screenedCount: number;
  submittedCount: number;
  createdAt: string;
  description?: string;
  priority?: 'Standard' | 'High' | 'Urgent';
}

interface TransparencyActivityItem {
  id: string;
  title: string;
  detail: string;
  actor: string;
  actorRole: 'AGENCY' | 'CLIENT';
  timestamp: string;
  badge?: string;
}

function ClientSharePortalContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;

  // 1. Identify Client Identity
  const clientParam = searchParams.get('client') || '';
  const contactParam = searchParams.get('contact') || '';
  const [clientName, setClientName] = useState<string>(clientParam || 'Client Partner');
  const [contactName, setContactName] = useState<string>(contactParam);
  const [welcomeNote, setWelcomeNote] = useState<string>('');
  const [portalToken, setPortalToken] = useState<string>(token || '');

  // 2. Data State
  const [jobs, setJobs] = useState<ClientPortalJob[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [activities, setActivities] = useState<TransparencyActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasAutoPromptedRef = React.useRef(false);

  // 3. Filter & Tab State
  const [activeTab, setActiveTab] = useState<'candidates' | 'jobs' | 'audit'>('candidates');
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 4. Modal 1: Client Upload / Submit New JD Modal
  const [isJdModalOpen, setIsJdModalOpen] = useState(false);
  const [jdTitle, setJdTitle] = useState('');
  const [jdDepartment, setJdDepartment] = useState('');
  const [jdExperience, setJdExperience] = useState('5 - 8 Years');
  const [jdWorkMode, setJdWorkMode] = useState<'Hybrid' | 'Remote' | 'Onsite'>('Hybrid');
  const [jdLocation, setJdLocation] = useState('New York, NY (or Remote)');
  const [jdSalary, setJdSalary] = useState('$130,000 - $160,000');
  const [jdText, setJdText] = useState('');
  const [jdRequirements, setJdRequirements] = useState('');
  const [jdUrgency, setJdUrgency] = useState<'Standard' | 'High' | 'Urgent'>('High');
  const [jdContactName, setJdContactName] = useState('');
  const [jdContactEmail, setJdContactEmail] = useState('');
  const [jdFileName, setJdFileName] = useState<string | null>(null);
  const [isSubmittingJd, setIsSubmittingJd] = useState(false);
  const [jdSuccessBanner, setJdSuccessBanner] = useState<string | null>(null);

  // 5. Modal 2: Schedule Interview Modal
  const [interviewCandidate, setInterviewCandidate] = useState<CandidateItem | null>(null);
  const [interviewRound, setInterviewRound] = useState<'Round 1 Phase' | 'Round 2 Phase'>('Round 1 Phase');
  const [interviewStartAt, setInterviewStartAt] = useState('');
  const [interviewInterviewer, setInterviewInterviewer] = useState('');
  const [interviewMeetingPlace, setInterviewMeetingPlace] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [isSubmittingInterview, setIsSubmittingInterview] = useState(false);

  // 6. Modal 3: Feedback & Decision Modal
  const [feedbackCandidate, setFeedbackCandidate] = useState<CandidateItem | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string>('Shared with Client');
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackNotes, setFeedbackNotes] = useState<string>('');
  const [feedbackClientName, setFeedbackClientName] = useState<string>('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // 7. Download & Toast State
  const [downloadingCandidateId, setDownloadingCandidateId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Initial Data Synchronization
  // ─────────────────────────────────────────────────────────────────────────────
  const loadPortalData = useCallback(() => {
    try {
      setIsLoading(true);

      // Resolve client from token in local storage if not in query param
      let resolvedClient = clientParam;
      let resolvedContact = contactParam;
      let resolvedNote = '';
      if (typeof window !== 'undefined') {
        try {
          const sharesRaw = localStorage.getItem('tasknera_client_portal_shares_v1');
          if (sharesRaw) {
            const parsed = JSON.parse(sharesRaw);
            const found = Array.isArray(parsed) ? parsed.find(s => s.token === token) : null;
            if (found?.clientName && !resolvedClient) {
              resolvedClient = found.clientName;
            }
            if (found?.contactName && !resolvedContact) {
              resolvedContact = found.contactName;
            }
            if (found?.welcomeNote) {
              resolvedNote = found.welcomeNote;
            }
          }
        } catch {}
      }

      if (!resolvedClient) {
        resolvedClient = 'Client Partner';
      }
      setClientName(resolvedClient);
      if (resolvedContact) {
        setContactName(resolvedContact);
        setJdContactName(resolvedContact);
      }
      if (resolvedNote) {
        setWelcomeNote(resolvedNote);
      }

      // Load JDs from ATS Store matching this client
      const storeJobs = atsStore.getJobs();
      const clientStoreJobs = storeJobs.filter(
        j => j.client?.toLowerCase().trim() === resolvedClient.toLowerCase().trim() ||
             j.client?.toLowerCase().includes(resolvedClient.toLowerCase()) ||
             resolvedClient.toLowerCase().includes(j.client?.toLowerCase())
      );

      // Load client-uploaded JDs from local storage
      let uploadedJds: ClientPortalJob[] = [];
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(`tasknera_client_jds_${resolvedClient.replace(/\s+/g, '_')}`);
          if (raw) {
            uploadedJds = JSON.parse(raw);
          }
        } catch {}
      }

      // Merge Store Jobs + Client Uploaded JDs
      const mappedStoreJobs: ClientPortalJob[] = clientStoreJobs.map(sj => ({
        id: sj.id,
        title: sj.title,
        client: sj.client,
        location: sj.location || 'Remote',
        workMode: sj.mode || 'Hybrid',
        salary: sj.salary || 'Competitive',
        status: sj.status === 'Active' ? 'Active Screening' : 'Shortlist Delivered',
        sourcedCount: sj.candidates ? sj.candidates * 2 : 0,
        screenedCount: sj.candidates ? Math.round(sj.candidates * 1.2) : 0,
        submittedCount: sj.candidates || 0,
        createdAt: 'Recently',
        description: sj.description,
        priority: 'High',
      }));

      // Combined unique jobs
      const combinedJobsMap = new Map<string, ClientPortalJob>();
      mappedStoreJobs.forEach(j => combinedJobsMap.set(j.id, j));
      uploadedJds.forEach(j => combinedJobsMap.set(j.id, j));

      const finalJobs = Array.from(combinedJobsMap.values());
      setJobs(finalJobs);

      // Load Screened & Submitted Candidates
      let portalCandidates: CandidateItem[] = [];
      if (typeof window !== 'undefined') {
        try {
          const storedCandsRaw = localStorage.getItem(`tasknera_portal_cands_${resolvedClient.replace(/\s+/g, '_')}`);
          if (storedCandsRaw) {
            portalCandidates = JSON.parse(storedCandsRaw);
          }
        } catch {}
      }

      // Check ATS Store for real candidates associated with this client's requisitions
      if (portalCandidates.length === 0 && finalJobs.length > 0) {
        try {
          const storeCands = atsStore.getCandidates().filter(c => 
            c.client?.toLowerCase().trim() === resolvedClient.toLowerCase().trim() ||
            finalJobs.some(j => j.id === c.jobId)
          );
          if (storeCands.length > 0) {
            portalCandidates = storeCands.map(sc => ({
              id: sc.id,
              name: sc.name,
              email: sc.email,
              phone: sc.phone,
              currentTitle: sc.role,
              currentCompany: sc.currentCompany || 'Verified Candidate',
              totalExperience: sc.exp,
              location: sc.location,
              summary: `Profile screened for ${sc.jobTitle}. Evaluated deterministic score: ${sc.calibratedScore || sc.match}%.`,
              skills: sc.skills || [],
              atsScore: sc.calibratedScore || sc.match,
              matchLevel: (sc.calibratedScore || sc.match) >= 90 ? 'EXCELLENT MATCH' : 'STRONG MATCH',
              mandatoryPassed: !sc.mandatoryFailed,
              currentStatus: sc.decision === 'SUBMIT' ? 'Shared with Client' : 'Active Screening',
              lastUpdatedDate: 'Recently',
              hasResume: true,
              resumeFileName: `${sc.name.replace(/\s+/g, '_')}_CV.pdf`,
              screeningNote: `Agency Screening Verdict: Mandatory requirement compliance: ${sc.mandatoryMatch}. Evaluated by ${sc.assignedRecruiter}.`,
              jobId: sc.jobId,
              jobTitle: sc.jobTitle,
              screeningEvidence: sc.evidenceSnippets || []
            }));
          }
        } catch {}
      }

      setCandidates(portalCandidates);

      // Load Activities
      let portalActivities: TransparencyActivityItem[] = [];
      if (typeof window !== 'undefined') {
        try {
          const actRaw = localStorage.getItem(`tasknera_portal_activities_${resolvedClient.replace(/\s+/g, '_')}`);
          if (actRaw) {
            portalActivities = JSON.parse(actRaw);
          }
        } catch {}
      }

      if (portalActivities.length === 0) {
        portalActivities = [
          {
            id: `act-${Date.now()}`,
            title: 'Hiring Portal Initialized',
            detail: `Secure client portal active for ${resolvedClient}. Upload your Job Descriptions (JDs) to begin recruitment sourcing.`,
            actor: 'HireIQ Transparency Engine',
            actorRole: 'AGENCY',
            timestamp: 'Just now',
            badge: 'Portal Ready'
          }
        ];
      }
      setActivities(portalActivities);

    } catch (e) {
      console.error('[Client Portal] Load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [clientParam, contactParam, token]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  // Prompt the client to upload their JD when entering the portal if no JDs exist yet
  useEffect(() => {
    if (!isLoading && jobs.length === 0 && !hasAutoPromptedRef.current) {
      hasAutoPromptedRef.current = true;
      setIsJdModalOpen(true);
    }
  }, [isLoading, jobs.length]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Action: Submit New JD
  // ─────────────────────────────────────────────────────────────────────────────
  const handleClientSubmitJd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jdTitle.trim()) {
      alert('Please enter a role title for the Job Description.');
      return;
    }

    setIsSubmittingJd(true);
    try {
      const newJobId = `jd-client-${Date.now()}`;
      const newJob: ClientPortalJob = {
        id: newJobId,
        title: jdTitle.trim(),
        department: jdDepartment.trim() || 'Core Team',
        client: clientName,
        location: jdLocation.trim() || 'Remote',
        workMode: jdWorkMode,
        salary: jdSalary.trim() || 'Competitive Market Rate',
        status: 'Agency Sourcing Candidates',
        sourcedCount: 0,
        screenedCount: 0,
        submittedCount: 0,
        createdAt: 'Just now',
        description: jdText.trim() || jdRequirements.trim() || `Client uploaded job requirements for ${jdTitle.trim()}`,
        priority: jdUrgency,
      };

      // 1. Add into ATS Store so recruiters immediately see it in the main ATS
      try {
        atsStore.addJob(
          {
            title: newJob.title,
            client: clientName,
            location: newJob.location,
            mode: newJob.workMode,
            salary: newJob.salary,
            candidates: 0,
            topScore: 0,
            status: 'Active',
            assignedRecruiter: 'Agency Delivery Team',
            pod: 'Client Portal Inflow',
            mandatoryRequirementsCount: 3,
            totalRequirementsCount: 6,
            description: newJob.description,
          },
          jdContactName.trim() || `${clientName} Hiring Manager`,
          'CLIENT'
        );
      } catch (err) {
        console.warn('atsStore addJob fallback:', err);
      }

      // 2. Persist in Client JDs storage
      const updatedJobs = [newJob, ...jobs];
      setJobs(updatedJobs);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            `tasknera_client_jds_${clientName.replace(/\s+/g, '_')}`,
            JSON.stringify(updatedJobs)
          );
        } catch {}
      }

      // 3. Log transparency activity
      const newActivity: TransparencyActivityItem = {
        id: `act-${Date.now()}`,
        title: `New JD Submitted: ${newJob.title}`,
        detail: `Client hiring manager ${jdContactName || clientName} submitted requisition with priority: ${jdUrgency}. Agency recruiters notified to begin sourcing.`,
        actor: jdContactName || `${clientName} Hiring Manager`,
        actorRole: 'CLIENT',
        timestamp: 'Just now',
        badge: 'New Requisition'
      };
      setActivities(prev => {
        const next = [newActivity, ...prev];
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              `tasknera_portal_activities_${clientName.replace(/\s+/g, '_')}`,
              JSON.stringify(next)
            );
          } catch {}
        }
        return next;
      });

      // 4. Reset Form & Show Success Banner
      setIsJdModalOpen(false);
      setJdSuccessBanner(`Job Description for "${newJob.title}" successfully submitted! Our hiring team has been alerted and candidate sourcing is now underway.`);
      setJdTitle('');
      setJdDepartment('');
      setJdText('');
      setJdRequirements('');
      setJdFileName(null);
      showToast('✓ Job Description submitted to agency recruiters!');
    } catch (err: any) {
      alert(err.message || 'Error submitting Job Description.');
    } finally {
      setIsSubmittingJd(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Action: Schedule Interview (Round 1 Phase / Round 2 Phase)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleConfirmInterviewSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interviewCandidate) return;

    if (!interviewStartAt) {
      alert('Please select interview date and time.');
      return;
    }

    setIsSubmittingInterview(true);
    try {
      const scheduledTimeStr = new Date(interviewStartAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      const newStatus = interviewRound === 'Round 2 Phase' ? 'Round 2 Phase Scheduled' : 'Round 1 Phase Scheduled';

      const updatedCandidateList = candidates.map(c => {
        if (c.id === interviewCandidate.id) {
          const updatedTimeline = [
            {
              status: newStatus,
              createdAt: new Date().toISOString(),
              updatedBy: interviewInterviewer || `${clientName} Interviewer`,
              feedback: `Interview scheduled for ${scheduledTimeStr}. Location: ${interviewMeetingPlace || 'Video Conference'}`,
            },
            ...(c.timeline || [])
          ];

          return {
            ...c,
            currentStatus: newStatus,
            latestFeedback: `Scheduled: ${interviewRound} on ${scheduledTimeStr} with ${interviewInterviewer || 'Interviewer'}`,
            lastUpdatedDate: 'Just now',
            timeline: updatedTimeline,
          };
        }
        return c;
      });

      setCandidates(updatedCandidateList);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`tasknera_portal_cands_${clientName.replace(/\s+/g, '_')}`, JSON.stringify(updatedCandidateList));
      }

      // Add to Transparency Activity Feed
      const newActivity: TransparencyActivityItem = {
        id: `act-${Date.now()}`,
        title: `${interviewRound} Scheduled: ${interviewCandidate.name}`,
        detail: `Interview confirmed for ${scheduledTimeStr} with ${interviewInterviewer || 'Client Team'}. Syncing calendar invitations.`,
        actor: interviewInterviewer || `${clientName} Team`,
        actorRole: 'CLIENT',
        timestamp: 'Just now',
        badge: 'Interview Scheduled'
      };
      setActivities(prev => [newActivity, ...prev]);

      setInterviewCandidate(null);
      setInterviewStartAt('');
      setInterviewInterviewer('');
      setInterviewMeetingPlace('');
      setInterviewNotes('');
      showToast(`✓ ${interviewRound} scheduled successfully!`);
    } finally {
      setIsSubmittingInterview(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Action: Save Client Feedback / Status Decision
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSaveFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackCandidate) return;

    setIsSubmittingFeedback(true);
    try {
      const updatedCandidateList = candidates.map(c => {
        if (c.id === feedbackCandidate.id) {
          const updatedTimeline = [
            {
              status: feedbackStatus,
              createdAt: new Date().toISOString(),
              updatedBy: feedbackClientName || `${clientName} Reviewer`,
              feedback: feedbackNotes || `Status updated to ${feedbackStatus} with rating ${feedbackRating}/5 stars.`,
            },
            ...(c.timeline || [])
          ];

          return {
            ...c,
            currentStatus: feedbackStatus,
            latestFeedback: feedbackNotes || `Updated to ${feedbackStatus}`,
            lastUpdatedDate: 'Just now',
            timeline: updatedTimeline,
          };
        }
        return c;
      });

      setCandidates(updatedCandidateList);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`tasknera_portal_cands_${clientName.replace(/\s+/g, '_')}`, JSON.stringify(updatedCandidateList));
      }

      // Add to Activity Feed
      const newActivity: TransparencyActivityItem = {
        id: `act-${Date.now()}`,
        title: `Client Decision: ${feedbackCandidate.name} (${feedbackStatus})`,
        detail: feedbackNotes ? `Feedback: "${feedbackNotes}"` : `Status updated to ${feedbackStatus}`,
        actor: feedbackClientName || `${clientName} Hiring Team`,
        actorRole: 'CLIENT',
        timestamp: 'Just now',
        badge: 'Candidate Review'
      };
      setActivities(prev => [newActivity, ...prev]);

      setFeedbackCandidate(null);
      setFeedbackNotes('');
      showToast('✓ Candidate feedback recorded and shared with agency recruiters!');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Action: Executive Resume Download
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDownloadCandidateCv = (cand: CandidateItem) => {
    setDownloadingCandidateId(cand.id);
    try {
      const summaryText = `EXECUTIVE CANDIDATE SUMMARY • TASKNERA HIREIQ
--------------------------------------------------------------------------------
Candidate Name : ${cand.name}
Target Role    : ${cand.currentTitle}
Current Company: ${cand.currentCompany}
Experience     : ${cand.totalExperience}
Location       : ${cand.location || 'Not Specified'}
ATS Score      : ${cand.atsScore}% Match (Verified Deterministic Evaluation)
Status         : ${cand.currentStatus}

SUMMARY OVERVIEW:
${cand.summary || 'Strong candidate meeting mandatory position requirements.'}

VERIFIED SKILLS:
${cand.skills.join(', ')}

EVIDENCE CITATIONS & SCREENING VERIFICATION:
${cand.screeningEvidence?.map(e => `• [${e.status}] ${e.requirement}: ${e.evidence}`).join('\n') || 'All knockout criteria satisfied.'}

RECRUITER VERDICT:
${cand.screeningNote || 'Recommended for interview scheduling.'}
--------------------------------------------------------------------------------
Generated for: ${clientName} Hiring Account via HireIQ Client Transparency Portal.`;

      const blob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cand.name.replace(/\s+/g, '_')}_Verified_Candidate_Profile.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`✓ Downloaded ${cand.name}'s verified summary.`);
    } catch {
      alert('Unable to download resume file.');
    } finally {
      setTimeout(() => setDownloadingCandidateId(null), 800);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Filter Calculations
  // ─────────────────────────────────────────────────────────────────────────────
  const filteredCandidates = useMemo(() => {
    return candidates.filter(cand => {
      // Job filter
      if (selectedJobId !== 'all' && cand.jobId !== selectedJobId) {
        return false;
      }
      // Status filter
      if (statusFilter === 'submitted' && cand.currentStatus !== 'Shared with Client') return false;
      if (statusFilter === 'scheduled' && !cand.currentStatus.includes('Scheduled') && !cand.currentStatus.includes('Interview')) return false;
      if (statusFilter === 'selected' && !['Selected', 'Selected / Offer', 'Offered', 'Joined'].includes(cand.currentStatus)) return false;
      if (statusFilter === 'not_fit' && cand.currentStatus !== 'Not a Fit' && cand.currentStatus !== 'Rejected') return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inName = cand.name.toLowerCase().includes(q);
        const inTitle = cand.currentTitle.toLowerCase().includes(q);
        const inSkills = cand.skills.some(s => s.toLowerCase().includes(q));
        if (!inName && !inTitle && !inSkills) return false;
      }

      return true;
    });
  }, [candidates, selectedJobId, statusFilter, searchQuery]);

  const totalProfilesScreened = useMemo(() => {
    return jobs.reduce((acc, j) => acc + (j.screenedCount || 0), 0);
  }, [jobs]);

  const totalProfilesSubmitted = candidates.length;
  const inInterviewCount = candidates.filter(c => c.currentStatus.includes('Scheduled') || c.currentStatus.includes('Interview')).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] flex items-center justify-center p-6 text-slate-600">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-[#3563E9] border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-semibold text-[#182230]">Loading client hiring portal...</div>
          <p className="text-xs text-slate-400">Connecting live transparency feed with HireIQ ATS</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#182230] font-sans flex flex-col">
      {/* ─────────────────────────────────────────────────────────────
         1. TOP EXECUTIVE HEADER
      ───────────────────────────────────────────────────────────── */}
      <header className="bg-[#101828] text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-[#3563E9] text-white flex items-center justify-center font-black text-sm shadow-sm">
              HQ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold tracking-tight text-white">
                  {clientName}
                </h1>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-blue-300 border border-slate-700 px-2 py-0.5 rounded-full">
                  Client Portal
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Powered by HireIQ • Agency Talent Sourcing &amp; Screening Transparency
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
         2. SUCCESS BANNER (IF NEW JD WAS SUBMITTED)
      ───────────────────────────────────────────────────────────── */}
      {jdSuccessBanner && (
        <div className="bg-[#ECFDF3] border-b border-[#D1FADF] px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs text-[#15966A] font-semibold">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>{jdSuccessBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setJdSuccessBanner(null)}
              className="text-[#15966A] hover:underline font-bold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         3. HERO TRANSPARENCY STRIP & METRICS
      ───────────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-[#EAECF0] py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#EFF4FF] text-[#3563E9] border border-[#D1E0FF] mb-2">
                <span className="w-2 h-2 rounded-full bg-[#3563E9]" />
                Client-Agency Transparency Bridge
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#101828] tracking-tight">
                Hiring Pipeline for {clientName}
              </h2>
              {contactName && (
                <p className="text-xs text-[#3563E9] font-bold mt-1">
                  Client Contact: {contactName}
                </p>
              )}
              {welcomeNote && (
                <div className="mt-2.5 p-3 rounded-xl bg-[#EFF4FF] border border-[#D1E0FF] text-xs text-[#1E293B]">
                  <span className="font-bold text-[#3563E9]">Message from Agency: </span>
                  {welcomeNote}
                </div>
              )}
              <p className="text-xs sm:text-sm text-[#667085] mt-1 max-w-2xl leading-relaxed">
                Submit job descriptions directly into our recruitment engine, track candidate screening volumes in real time, and review verified profiles shortlisted for your hiring managers.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsJdModalOpen(true)}
                className="px-4 py-2.5 bg-[#101828] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Upload Job Description</span>
              </button>
            </div>
          </div>

          {/* 4 Transparency KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-[#F7F8FC] border border-[#EAECF0] rounded-2xl p-4 shadow-xs">
              <div className="text-xs text-[#667085] font-semibold mb-1">
                Active Requisitions
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#101828]">
                {jobs.length}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Open positions with agency</p>
            </div>

            <div className="bg-[#F7F8FC] border border-[#EAECF0] rounded-2xl p-4 shadow-xs">
              <div className="text-xs text-[#667085] font-semibold mb-1">
                Profiles Screened by Agency
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#101828]">
                {totalProfilesScreened > 0 ? `${totalProfilesScreened}+` : '0'}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Resumes evaluated against criteria</p>
            </div>

            <div className="bg-[#F7F8FC] border border-[#EAECF0] rounded-2xl p-4 shadow-xs">
              <div className="text-xs text-[#667085] font-semibold mb-1">
                Shortlisted &amp; Submitted
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#3563E9]">
                {totalProfilesSubmitted}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Ready for client review</p>
            </div>

            <div className="bg-[#F7F8FC] border border-[#EAECF0] rounded-2xl p-4 shadow-xs">
              <div className="text-xs text-[#667085] font-semibold mb-1">
                Interviews in Progress
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#15966A]">
                {inInterviewCount}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">In Round 1 / Round 2 phase</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
         4. MAIN CONTENT & TABS
      ───────────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">
        {/* Onboarding Banner when no JDs uploaded yet */}
        {jobs.length === 0 && (
          <div className="bg-white border border-[#EAECF0] rounded-3xl p-6 sm:p-10 shadow-sm space-y-8 relative overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(53,99,233,0.05),transparent)]">
            <div className="max-w-2xl mx-auto text-center space-y-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-[#EFF4FF] to-[#D1E0FF]/40 border border-[#D1E0FF] text-[#3563E9] flex items-center justify-center mx-auto shadow-xs">
                <svg className="w-6 h-6 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-[#EFF4FF] text-[#3563E9] border border-[#D1E0FF]/80">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3563E9] animate-pulse" />
                Step 1 • Requisition Intake
              </div>

              <h3 className="text-xl sm:text-2xl font-extrabold text-[#101828] tracking-tight">
                Upload Your Job Description (JD) to Start Candidate Sourcing
              </h3>

              <p className="text-xs sm:text-sm text-[#667085] leading-relaxed max-w-xl mx-auto">
                Welcome to the client hiring &amp; transparency portal for <span className="font-bold text-[#101828]">{clientName}</span>. To start sourcing and screening top talent for your team, please upload your Job Description (JD) or requirement criteria below.
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsJdModalOpen(true)}
                  className="px-6 py-3 bg-[#3563E9] hover:bg-[#2851D6] active:scale-[0.99] text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md shadow-[#3563E9]/20 cursor-pointer flex items-center gap-2 hover:-translate-y-0.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Upload Job Description (JD)</span>
                </button>
              </div>
            </div>

            {/* 3 Step Transparency Process */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8 border-t border-[#EAECF0]">
              {/* Step 1 */}
              <div className="bg-[#F8F9FC] hover:bg-white border border-[#EAECF0] hover:border-[#3563E9]/30 rounded-2xl p-5 transition-all shadow-xs hover:shadow-sm space-y-3 group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#3563E9] bg-[#EFF4FF] border border-[#D1E0FF] px-2 py-0.5 rounded-md">
                    Step 01
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-white border border-[#EAECF0] text-[#3563E9] flex items-center justify-center shadow-xs group-hover:border-[#3563E9]/30 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[#101828] group-hover:text-[#3563E9] transition-colors">
                    Submit Requirements
                  </h4>
                  <p className="text-xs text-[#667085] leading-relaxed mt-1">
                    Upload your JD file (PDF, Word) or paste role criteria, mandatory qualifications, and compensation ranges.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-[#F8F9FC] hover:bg-white border border-[#EAECF0] hover:border-[#3563E9]/30 rounded-2xl p-5 transition-all shadow-xs hover:shadow-sm space-y-3 group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#3563E9] bg-[#EFF4FF] border border-[#D1E0FF] px-2 py-0.5 rounded-md">
                    Step 02
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-white border border-[#EAECF0] text-[#3563E9] flex items-center justify-center shadow-xs group-hover:border-[#3563E9]/30 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[#101828] group-hover:text-[#3563E9] transition-colors">
                    Deterministic Sourcing
                  </h4>
                  <p className="text-xs text-[#667085] leading-relaxed mt-1">
                    HireIQ recruiters source active talent and evaluate mandatory knockout criteria with full evidence citations.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-[#F8F9FC] hover:bg-white border border-[#EAECF0] hover:border-[#3563E9]/30 rounded-2xl p-5 transition-all shadow-xs hover:shadow-sm space-y-3 group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#3563E9] bg-[#EFF4FF] border border-[#D1E0FF] px-2 py-0.5 rounded-md">
                    Step 03
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-white border border-[#EAECF0] text-[#3563E9] flex items-center justify-center shadow-xs group-hover:border-[#3563E9]/30 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-[#101828] group-hover:text-[#3563E9] transition-colors">
                    Review &amp; Schedule
                  </h4>
                  <p className="text-xs text-[#667085] leading-relaxed mt-1">
                    Review verified candidate profiles, download executive summaries, and schedule Round 1 &amp; 2 interviews directly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between gap-4 border-b border-[#EAECF0] pb-2 overflow-x-auto">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('candidates')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'candidates'
                  ? 'bg-[#101828] text-white shadow-xs'
                  : 'bg-white border border-[#EAECF0] text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>Screened Candidates</span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] ${activeTab === 'candidates' ? 'bg-[#3563E9] text-white' : 'bg-slate-100 text-slate-700'}`}>
                {candidates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('jobs')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'jobs'
                  ? 'bg-[#101828] text-white shadow-xs'
                  : 'bg-white border border-[#EAECF0] text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>Job Requisitions ({jobs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'audit'
                  ? 'bg-[#101828] text-white shadow-xs'
                  : 'bg-white border border-[#EAECF0] text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>Agency Activity &amp; Audit Log</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsJdModalOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-[#3563E9] hover:underline cursor-pointer"
          >
            <span>+ Submit another role</span>
          </button>
        </div>

        {/* ── TAB 1: SCREENED & SUBMITTED CANDIDATE PROFILES ── */}
        {activeTab === 'candidates' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-white border border-[#EAECF0] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                <label className="text-xs font-semibold text-slate-500 shrink-0">Filter by Position:</label>
                <select
                  value={selectedJobId}
                  onChange={e => setSelectedJobId(e.target.value)}
                  className="rounded-xl border border-[#EAECF0] bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-[#3563E9] focus:ring-1 focus:ring-[#3563E9]"
                >
                  <option value="all">All Open Positions ({jobs.length})</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1 overflow-x-auto">
                  {[
                    { id: 'all', label: `All (${candidates.length})` },
                    { id: 'submitted', label: 'Ready for Review' },
                    { id: 'scheduled', label: 'Interviews' },
                    { id: 'selected', label: 'Offer / Selected' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        statusFilter === tab.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full md:w-64">
                <input
                  type="text"
                  placeholder="Search name, skills, title..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[#EAECF0] bg-[#F7F8FC] px-3.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[#3563E9] focus:bg-white"
                />
              </div>
            </div>

            {/* Candidate Cards */}
            {jobs.length === 0 ? (
              <div className="bg-white border border-[#EAECF0] rounded-3xl p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center mx-auto border border-[#D1E0FF]">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#101828]">Awaiting Job Description (JD)</h3>
                <p className="text-xs text-[#667085] max-w-sm mx-auto">
                  Please upload your Job Description to initiate talent sourcing. Once uploaded, verified candidate shortlists screened by our agency team will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => setIsJdModalOpen(true)}
                  className="px-5 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Upload Job Description (JD)</span>
                </button>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="bg-white border border-[#EAECF0] rounded-3xl p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center mx-auto border border-[#D1E0FF]">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#101828]">
                  {candidates.length === 0 ? 'Candidate Sourcing & Screening in Progress' : 'No candidates match this filter'}
                </h3>
                <p className="text-xs text-[#667085] max-w-sm mx-auto">
                  {candidates.length === 0
                    ? 'Our agency recruiters have received your requirements and are actively sourcing candidate profiles. As candidates pass mandatory verification, they will be submitted directly to this portal.'
                    : 'Try clearing your filters or search term to see other candidates.'}
                </p>
                {candidates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setSelectedJobId('all'); setStatusFilter('all'); setSearchQuery(''); }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCandidates.map(cand => {
                  const score = cand.atsScore || 85;
                  const isTopScore = score >= 90;

                  return (
                    <div
                      key={cand.id}
                      className="bg-white border border-[#EAECF0] hover:border-[#3563E9]/40 rounded-3xl p-5 sm:p-6 shadow-sm transition-all space-y-4"
                    >
                      {/* Top Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                          {/* Score Badge */}
                          <div className={`px-3 py-1.5 rounded-2xl text-center shrink-0 border ${
                            isTopScore
                              ? 'bg-[#ECFDF3] border-[#D1FADF] text-[#15966A]'
                              : 'bg-[#EFF4FF] border-[#D1E0FF] text-[#3563E9]'
                          }`}>
                            <div className="text-base font-black leading-none">{score}%</div>
                            <div className="text-[9px] font-extrabold uppercase tracking-wider mt-0.5">Match</div>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base font-bold text-[#101828]">{cand.name}</h3>
                              <span className="text-xs text-slate-400">•</span>
                              <span className="text-xs font-semibold text-[#3563E9]">{cand.jobTitle || 'Requisition Role'}</span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                cand.currentStatus.includes('Selected') || cand.currentStatus.includes('Offer')
                                  ? 'bg-[#ECFDF3] text-[#15966A] border-[#D1FADF]'
                                  : cand.currentStatus.includes('Scheduled')
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {cand.currentStatus}
                              </span>
                            </div>
                            <p className="text-xs text-[#667085] mt-1">
                              <span className="font-semibold text-slate-800">{cand.currentTitle}</span>
                              {cand.currentCompany && ` at ${cand.currentCompany}`}
                              {cand.totalExperience && ` • ${cand.totalExperience}`}
                              {cand.location && ` • ${cand.location}`}
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleDownloadCandidateCv(cand)}
                            disabled={downloadingCandidateId === cand.id}
                            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-[#EAECF0] hover:border-slate-300 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                            title="Download verified candidate summary & CV"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>{downloadingCandidateId === cand.id ? 'Downloading...' : 'Download Resume'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setInterviewCandidate(cand);
                              setInterviewRound('Round 1 Phase');
                              setInterviewStartAt('');
                            }}
                            className="px-3.5 py-2 bg-[#101828] hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>Schedule Interview</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setFeedbackCandidate(cand);
                              setFeedbackStatus(cand.currentStatus);
                              setFeedbackNotes(cand.latestFeedback || '');
                            }}
                            className="px-3.5 py-2 bg-[#3563E9] hover:bg-[#2851D6] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            <span>Client Decision</span>
                          </button>
                        </div>
                      </div>

                      {/* Summary */}
                      {cand.summary && (
                        <p className="text-xs text-slate-600 leading-relaxed bg-[#F7F8FC] p-3 rounded-2xl border border-slate-100">
                          {cand.summary}
                        </p>
                      )}

                      {/* Verified Skills */}
                      {cand.skills && cand.skills.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Matched Skills:</span>
                          {cand.skills.map((skill, sIdx) => (
                            <span
                              key={sIdx}
                              className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-semibold border border-slate-200/80"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Agency Screening Transparency Note */}
                      <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="inline-flex items-center gap-1.5 text-[#3563E9]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Agency Screening Verdict &amp; Mandatory Criteria Verification
                          </span>
                          <span className="text-emerald-700 font-extrabold text-[11px] bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            ✓ 100% Mandatory Criteria Met
                          </span>
                        </div>

                        {cand.screeningNote && (
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {cand.screeningNote}
                          </p>
                        )}

                        {cand.screeningEvidence && cand.screeningEvidence.length > 0 && (
                          <div className="space-y-1.5 pt-1 border-t border-blue-100/70">
                            {cand.screeningEvidence.slice(0, 3).map((item, eIdx) => (
                              <div key={eIdx} className="text-[11px] text-slate-600 flex items-start gap-2">
                                <span className="text-emerald-600 font-bold">✓</span>
                                <span className="font-semibold text-slate-800">{item.requirement}:</span>
                                <span className="text-slate-500 italic truncate">{item.evidence}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Latest Client Interaction Note if present */}
                      {cand.latestFeedback && (
                        <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl px-3.5 py-2 text-xs text-amber-900 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">Latest Hiring Note:</span>
                            <span>&ldquo;{cand.latestFeedback}&rdquo;</span>
                          </div>
                          <span className="text-[11px] text-amber-700 shrink-0 font-medium">{cand.lastUpdatedDate}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: JOB REQUISITIONS & SOURCING STATUS ── */}
        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[#101828]">Active Requisitions Assigned to HireIQ</h3>
                <p className="text-xs text-[#667085]">Live status of roles we are actively sourcing and screening for {clientName}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsJdModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <span>+ Upload Another JD</span>
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="bg-white border border-[#EAECF0] rounded-3xl p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center mx-auto border border-[#D1E0FF]">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#101828]">No Job Descriptions Uploaded Yet</h3>
                <p className="text-xs text-[#667085] max-w-sm mx-auto">
                  You haven&apos;t submitted any Job Descriptions yet. Click below to upload your first requisition and initiate talent sourcing.
                </p>
                <button
                  type="button"
                  onClick={() => setIsJdModalOpen(true)}
                  className="px-5 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Upload Job Description (JD)</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {jobs.map(job => (
                  <div key={job.id} className="bg-white border border-[#EAECF0] hover:border-slate-300 rounded-3xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider text-[#3563E9] bg-[#EFF4FF] px-2 py-0.5 rounded-md mb-1.5 border border-[#D1E0FF]">
                            {job.department || 'Active Position'}
                          </span>
                          <h4 className="text-base font-bold text-[#101828]">{job.title}</h4>
                          <div className="text-xs text-[#667085] mt-0.5">
                            {job.location} • {job.workMode} • {job.salary}
                          </div>
                        </div>

                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                          {job.status}
                        </span>
                      </div>

                      {job.description && (
                        <p className="text-xs text-slate-500 mt-3 line-clamp-2 leading-relaxed">
                          {job.description}
                        </p>
                      )}

                      {/* Funnel Transparency Bar */}
                      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-[#F7F8FC] rounded-xl p-2">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Sourced</div>
                          <div className="text-base font-extrabold text-slate-800">{job.sourcedCount}</div>
                        </div>
                        <div className="bg-[#F7F8FC] rounded-xl p-2">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Screened</div>
                          <div className="text-base font-extrabold text-slate-800">{job.screenedCount}</div>
                        </div>
                        <div className="bg-[#EFF4FF] border border-[#D1E0FF] rounded-xl p-2">
                          <div className="text-[10px] font-bold text-[#3563E9] uppercase">Submitted</div>
                          <div className="text-base font-extrabold text-[#3563E9]">{job.submittedCount}</div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Created {job.createdAt}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedJobId(job.id);
                          setActiveTab('candidates');
                        }}
                        className="text-xs font-bold text-[#3563E9] hover:underline cursor-pointer"
                      >
                        View Candidates →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: AGENCY ACTIVITY & AUDIT LOG ── */}
        {activeTab === 'audit' && (
          <div className="bg-white border border-[#EAECF0] rounded-3xl p-6 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#101828]">Agency Screening &amp; Sourcing Activity Ledger</h3>
              <p className="text-xs text-[#667085]">Transparent chronological record of all recruitment activities and candidate submissions</p>
            </div>

            <div className="space-y-3.5 relative border-l-2 border-slate-200 ml-3 pl-4">
              {activities.map((act, aIdx) => (
                <div key={act.id || aIdx} className="relative space-y-1">
                  <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-[#3563E9] border-2 border-white" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#101828]">{act.title}</span>
                    {act.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {act.badge}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400">{act.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {act.detail}
                  </p>
                  <div className="text-[11px] text-slate-400">
                    Logged by <span className="font-semibold text-slate-600">{act.actor}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ─────────────────────────────────────────────────────────────
         MODAL 1: SUBMIT NEW JOB DESCRIPTION (JD)
      ───────────────────────────────────────────────────────────── */}
      {isJdModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center font-bold text-lg border border-[#D1E0FF]">
                  +
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#101828]">Upload Job Description</h3>
                  <p className="text-xs text-[#667085]">Submit requirements directly to HireIQ for candidate sourcing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsJdModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleClientSubmitJd} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Position / Job Title <span className="text-rose-600">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={jdTitle}
                  onChange={e => setJdTitle(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer (Node.js & AWS)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#3563E9] focus:ring-1 focus:ring-[#3563E9] text-xs font-semibold text-slate-900 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Department / Business Unit</label>
                  <input
                    type="text"
                    value={jdDepartment}
                    onChange={e => setJdDepartment(e.target.value)}
                    placeholder="e.g. Core Engineering"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Target Experience</label>
                  <input
                    type="text"
                    value={jdExperience}
                    onChange={e => setJdExperience(e.target.value)}
                    placeholder="e.g. 5 - 8 Years"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Work Mode</label>
                  <select
                    value={jdWorkMode}
                    onChange={e => setJdWorkMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white font-semibold text-slate-800"
                  >
                    <option value="Hybrid">Hybrid</option>
                    <option value="Remote">Remote</option>
                    <option value="Onsite">Onsite</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Location</label>
                  <input
                    type="text"
                    value={jdLocation}
                    onChange={e => setJdLocation(e.target.value)}
                    placeholder="e.g. New York, NY"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Budget / Salary</label>
                  <input
                    type="text"
                    value={jdSalary}
                    onChange={e => setJdSalary(e.target.value)}
                    placeholder="e.g. $140k - $170k"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                  />
                </div>
              </div>

              {/* File Upload Dropzone */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Upload JD Document (PDF, Word, TXT)
                </label>
                <div className="border-2 border-dashed border-slate-300 hover:border-[#3563E9] rounded-2xl p-4 text-center bg-slate-50/50 cursor-pointer transition-colors relative">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setJdFileName(file.name);
                        if (!jdTitle) {
                          setJdTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
                        }
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="mb-2">
                    <svg className="w-8 h-8 text-[#3563E9] mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div className="text-xs font-bold text-slate-700">
                    {jdFileName ? `✓ Selected: ${jdFileName}` : 'Click or drag JD document here'}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Supports PDF, DOCX, and TXT up to 25MB</p>
                </div>
              </div>

              {/* Paste Text Area */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Or Paste Job Description / Must-Have Criteria
                </label>
                <textarea
                  rows={4}
                  value={jdText}
                  onChange={e => setJdText(e.target.value)}
                  placeholder="Paste role responsibilities, required skills, knockout requirements, and team notes..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#3563E9] text-xs text-slate-800 placeholder-slate-400"
                />
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Your Name (Hiring Contact)</label>
                  <input
                    type="text"
                    value={jdContactName}
                    onChange={e => setJdContactName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins (VP Engineering)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Hiring Urgency</label>
                  <select
                    value={jdUrgency}
                    onChange={e => setJdUrgency(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white font-semibold text-slate-800"
                  >
                    <option value="High">High Priority (Shortlists in 48h)</option>
                    <option value="Urgent">Urgent / Critical Need</option>
                    <option value="Standard">Standard Pipeline</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsJdModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingJd}
                  className="px-5 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingJd ? 'Submitting to Agency...' : 'Submit Requisition to Agency'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         MODAL 2: SCHEDULE INTERVIEW (ROUND 1 / ROUND 2)
      ───────────────────────────────────────────────────────────── */}
      {interviewCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="text-base font-bold text-[#101828]">Schedule Client Interview</h3>
                <p className="text-xs text-[#667085]">{interviewCandidate.name} • {interviewCandidate.currentTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setInterviewCandidate(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmInterviewSchedule} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Interview Round</label>
                <select
                  value={interviewRound}
                  onChange={e => setInterviewRound(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800 bg-white"
                >
                  <option value="Round 1 Phase">Round 1 Phase (Initial Technical Screen)</option>
                  <option value="Round 2 Phase">Round 2 Phase (Managerial / Final Round)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Interview Date &amp; Time <span className="text-rose-600">*</span>
                </label>
                <input
                  required
                  type="datetime-local"
                  value={interviewStartAt}
                  onChange={e => setInterviewStartAt(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Interviewer Name / Email</label>
                <input
                  type="text"
                  value={interviewInterviewer}
                  onChange={e => setInterviewInterviewer(e.target.value)}
                  placeholder="e.g. Alex Rivera (Lead Architect)"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Video Call Link or Location</label>
                <input
                  type="text"
                  value={interviewMeetingPlace}
                  onChange={e => setInterviewMeetingPlace(e.target.value)}
                  placeholder="e.g. https://meet.google.com/abc-xyz or Office Room 4B"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Notes for Agency Team</label>
                <textarea
                  rows={2}
                  value={interviewNotes}
                  onChange={e => setInterviewNotes(e.target.value)}
                  placeholder="Optional details or specific topics to assess..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setInterviewCandidate(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInterview}
                  className="px-5 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingInterview ? 'Confirming...' : 'Confirm & Schedule Round'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         MODAL 3: CLIENT DECISION & FEEDBACK
      ───────────────────────────────────────────────────────────── */}
      {feedbackCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="text-base font-bold text-[#101828]">Candidate Review &amp; Decision</h3>
                <p className="text-xs text-[#667085]">{feedbackCandidate.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackCandidate(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFeedback} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Status Decision</label>
                <select
                  value={feedbackStatus}
                  onChange={e => setFeedbackStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800 bg-white"
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Candidate Rating</label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className={`w-8 h-8 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                        feedbackRating >= star
                          ? 'bg-amber-400 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="text-xs font-semibold text-slate-600 ml-2">
                    {feedbackRating === 5 ? 'Exceptional Fit' : feedbackRating === 4 ? 'Strong Fit' : feedbackRating === 3 ? 'Good Fit' : 'Fair / Marginal'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Feedback Notes for Agency Recruiter</label>
                <textarea
                  rows={3}
                  value={feedbackNotes}
                  onChange={e => setFeedbackNotes(e.target.value)}
                  placeholder="Share feedback, team impressions, or instructions for the hiring agency..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#3563E9] text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Your Name</label>
                <input
                  type="text"
                  value={feedbackClientName}
                  onChange={e => setFeedbackClientName(e.target.value)}
                  placeholder="e.g. Hiring Manager"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFeedbackCandidate(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFeedback}
                  className="px-5 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingFeedback ? 'Saving...' : 'Record Decision & Share'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-2xl border border-slate-800">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Clean Enterprise Footer */}
      <footer className="border-t border-[#EAECF0] bg-white py-6 text-center text-xs text-[#667085]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#101828]">HIRE<span className="text-[#3563E9]">IQ</span></span>
            <span>• Transparent Client Hiring &amp; Candidate Intelligence Portal</span>
          </div>
          <div>
            Dedicated for <span className="font-bold text-[#101828]">{clientName}</span> • Zero Login Required
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function ClientSharePortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F7F8FC] flex items-center justify-center p-6 text-slate-600">
        <div className="w-8 h-8 border-3 border-[#3563E9] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ClientSharePortalContent />
    </Suspense>
  );
}
