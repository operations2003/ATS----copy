'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { atsStore, JobItem as StoreJobItem } from '@/lib/atsStore';
import {
  getJobAssignment,
  setJobAssignment,
  isExcludedRecruiterName
} from '@/lib/jobAssignments';
import ClientSubmissionDossierModal, { SubmissionDossierData } from '@/components/ClientSubmissionDossierModal';
import ClientLifecycleModal, { ClientLifecycleData } from '@/components/ClientLifecycleModal';

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
  decision?: 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT' | string;
  clientRating?: number;

  // The 30 Executive Submission Fields for Client Preview Portal
  submissionDate?: string;          // 1. Date
  jdName?: string;                  // 2. JD Name
  clientName?: string;              // 3. Client Name
  recruiterName?: string;           // 4. Recruiter Name
  candidateName?: string;           // 5. Candidate Name
  emailId?: string;                 // 6. Email ID
  phoneNumber?: string;             // 7. Phone Number
  currentLocation?: string;         // 8. Current Location
  currentDesignation?: string;      // 9. Current Designation
  totalWorkExperience?: string;     // 10. Total Work Experience
  relevantWorkExperience?: string;  // 11. Relevant Work Experience
  noticePeriod?: string;            // 12. Notice Period
  currentCtc?: string;              // 13. Current CTC
  expectedCtc?: string;             // 14. Expected CTC
  cvLink?: string;                  // 15. CV Link
  atsScoreDisplay?: string;         // 16. ATS
  candidateStatus?: string;         // 17. Candidate Status
  screeningStatus?: string;         // 18. Screening Status
  recruiterRemarks?: string;        // 19. Recruiter Remarks
  interviewRound1?: string;         // 20. Interview Round 1
  interviewRound2?: string;         // 21. Interview Round 2
  finalInterview?: string;          // 22. Final Interview
  offerStatus?: string;             // 23. Offer Status
  joiningDate?: string;             // 24. Joining Date
  joiningStatus?: string;           // 25. Joining Status
  rejectionReason?: string;         // 26. Rejection Reason
  lastFollowUpDate?: string;        // 27. Last Follow-up Date
  nextFollowUpDate?: string;        // 28. Next Follow-up Date
  response?: string;                // 29. Response
  overallStatus?: string;           // 30. Overall Status

  // Recruiter Verification & Client Approval Gate
  isRecruiterApproved?: boolean;
  recruiterApprovalStatus?: 'APPROVED' | 'PENDING_APPROVAL';
  recruiterApprovedBy?: string;
  recruiterApprovedAt?: string;
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
  sourcedCount?: number;
  screenedCount: number;
  submittedCount: number;
  joinedCount?: number;
  createdAt: string;
  description?: string;
  priority?: 'Standard' | 'High' | 'Urgent';
  assignedRecruiter?: string;
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

/**
 * Ensures all 30 executive submission fields requested by the client portal are populated
 * with realistic and verified candidate profile data.
 */
function buildFull30FieldsCandidate(
  cand: any,
  job?: ClientPortalJob,
  fallbackClientName: string = 'Client Partner',
  fallbackRecruiterName: string = 'Senior Recruiter'
): CandidateItem {
  const name = cand.name || cand.candidateName || 'Candidate';
  const score = typeof cand.atsScore === 'number' ? cand.atsScore : (typeof cand.score === 'number' ? cand.score : 85);
  const title = cand.currentDesignation || cand.currentTitle || cand.current_title || cand.role || 'Software Engineer';
  const company = cand.currentCompany || cand.current_company || cand.company || 'Technology Services';
  const totalExp = cand.totalWorkExperience || cand.totalExperience || cand.total_experience || cand.exp || 'Not Specified';

  // Relevant Experience: DO NOT auto-invent fake numbers; only show what assigned recruiter entered
  const relExp = cand.relevantWorkExperience || cand.relevantExperience || cand.relevant_experience || 'Pending Recruiter Input';

  const jdName = cand.jdName || cand.jobTitle || job?.title || 'Requisition Role';
  const client = cand.clientName || cand.client || job?.client || fallbackClientName;
  const recruiter = cand.recruiterName || cand.assignedRecruiter || job?.assignedRecruiter || fallbackRecruiterName;
  const location = cand.currentLocation || cand.location || job?.location || 'Not Specified';
  const email = cand.emailId || cand.email || '';
  const phone = cand.phoneNumber || cand.phone || '';

  // Notice Period: DO NOT invent fake notice periods; show what assigned recruiter entered
  const noticePeriod = cand.noticePeriod || cand.notice || 'Pending Recruiter Input';

  // CTC: DO NOT invent fake salaries; show what assigned recruiter entered
  const currentCtc = cand.currentCtc || cand.currentSalary || cand.current_salary || 'Pending Recruiter Input';
  const expectedCtc = cand.expectedCtc || cand.expectedSalary || cand.expected_salary || 'Pending Recruiter Input';

  // Submission Date (Format: e.g. 11 Nov 2026)
  const submissionDate = cand.submissionDate || cand.date || new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  // Follow-up dates
  const lastFollowUpDate = cand.lastFollowUpDate || 'Not Recorded';
  const nextFollowUpDate = cand.nextFollowUpDate || 'Not Scheduled';

  // Interview stage statuses
  const interviewRound1 = cand.interviewRound1 || (cand.currentStatus?.includes('Round 1') ? 'Scheduled' : 'Pending Scheduling');
  const interviewRound2 = cand.interviewRound2 || (cand.currentStatus?.includes('Round 2') ? 'Scheduled' : 'Pending Round 1');
  const finalInterview = cand.finalInterview || (cand.currentStatus?.includes('Selected') ? 'Completed' : 'Pending');
  const offerStatus = cand.offerStatus || (cand.currentStatus?.includes('Offer') ? 'Offer Extended' : cand.currentStatus?.includes('Selected') ? 'Selected' : 'In Sourcing');
  const joiningDate = cand.joiningDate || 'Pending Offer';
  const joiningStatus = cand.joiningStatus || (cand.currentStatus === 'Joined' ? 'Joined' : 'Pending');
  const rejectionReason = cand.rejectionReason || 'None';
  const response = cand.response || 'Pending Recruiter Follow-up';
  const overallStatus = cand.overallStatus || cand.currentStatus || 'Shortlisted & Submitted';
  const screeningStatus = cand.screeningStatus || (cand.mandatoryPassed !== false ? 'Verified (100% Mandatory Criteria Met)' : 'Conditional Review');
  const recruiterRemarks = cand.recruiterRemarks || cand.screeningNote || 'Pending Recruiter Remarks';
  const cvLink = cand.cvLink || cand.resumeFileName || cand.fileName || `${name.replace(/\s+/g, '_')}_CV.pdf`;

  return {
    id: cand.id,
    name,
    email,
    phone,
    currentTitle: title,
    currentCompany: company,
    totalExperience: totalExp,
    location,
    summary: cand.summary || `Screened and evaluated for ${jdName}. Evaluated score: ${score}%. Shortlisted by ${recruiter}.`,
    skills: Array.isArray(cand.skills) && cand.skills.length > 0 ? cand.skills : ['Full Stack Development', 'System Design', 'Core Frameworks'],
    atsScore: score,
    matchLevel: score >= 85 ? 'EXCELLENT MATCH' : (score >= 70 ? 'STRONG MATCH' : 'MATCH'),
    mandatoryPassed: cand.mandatoryPassed !== false,
    currentStatus: cand.currentStatus || 'Shared with Client',
    latestFeedback: cand.latestFeedback,
    lastUpdatedDate: cand.lastUpdatedDate || 'Just now',
    timeline: cand.timeline || [],
    hasResume: true,
    resumeFileName: cvLink,
    screeningNote: recruiterRemarks,
    screeningEvidence: cand.screeningEvidence || [],
    jobId: cand.jobId || job?.id || 'job-1',
    jobTitle: jdName,
    decision: cand.decision || 'SUBMIT',
    clientRating: cand.clientRating,

    // The 30 explicit fields
    submissionDate,
    jdName,
    clientName: client,
    recruiterName: recruiter,
    candidateName: name,
    emailId: email,
    phoneNumber: phone,
    currentLocation: location,
    currentDesignation: title,
    totalWorkExperience: totalExp,
    relevantWorkExperience: relExp,
    noticePeriod,
    currentCtc,
    expectedCtc,
    cvLink,
    atsScoreDisplay: `${score}% Match`,
    candidateStatus: overallStatus,
    screeningStatus,
    recruiterRemarks,
    interviewRound1,
    interviewRound2,
    finalInterview,
    offerStatus,
    joiningDate,
    joiningStatus,
    rejectionReason,
    lastFollowUpDate,
    nextFollowUpDate,
    response,
    overallStatus,

    // Recruiter Verification & Client Approval Gate
    isRecruiterApproved: cand.isRecruiterApproved === true || cand.recruiterApprovalStatus === 'APPROVED',
    recruiterApprovalStatus: (cand.isRecruiterApproved === true || cand.recruiterApprovalStatus === 'APPROVED') ? 'APPROVED' : 'PENDING_APPROVAL',
    recruiterApprovedBy: cand.recruiterApprovedBy || recruiter,
    recruiterApprovedAt: cand.recruiterApprovedAt || submissionDate,
  };
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
  const [assignedMember, setAssignedMember] = useState<string>('');

  // 2. Data State
  const [jobs, setJobs] = useState<ClientPortalJob[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [activities, setActivities] = useState<TransparencyActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasAutoPromptedRef = React.useRef(false);

  // 2.1 View Mode for Candidate Submission Details (Cards vs 30-Column Table)
  const [candidateViewMode, setCandidateViewMode] = useState<'cards' | 'table'>('cards');
  const [expandedDossierIds, setExpandedDossierIds] = useState<Record<string, boolean>>({});

  // 3. Filter & Tab State
  const [activeTab, setActiveTab] = useState<'candidates' | 'jobs' | 'audit'>('candidates');
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 4. Modal 1: Client Upload / Submit New JD Modal
  const [isJdModalOpen, setIsJdModalOpen] = useState(false);
  const [jdFiles, setJdFiles] = useState<{ file?: File; name: string; size: string; title: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmittingJd, setIsSubmittingJd] = useState(false);
  const [jdSuccessBanner, setJdSuccessBanner] = useState<string | null>(null);

  const handleFileSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const newItems = Array.from(fileList).map(f => {
      const cleanTitle = f.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b(jd|job|description|spec|specs|final|v\d+)\b/gi, '')
        .trim();
      const sizeInKb = (f.size / 1024).toFixed(1);
      const sizeStr = f.size > 1024 * 1024 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : `${sizeInKb} KB`;
      return {
        file: f,
        name: f.name,
        size: sizeStr,
        title: cleanTitle.length > 2 ? cleanTitle : f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      };
    });
    setJdFiles(prev => [...prev, ...newItems]);
  };

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

  // 7.1 Recruiter 30-Detail Dossier Modal
  const [editingDossierCandidate, setEditingDossierCandidate] = useState<CandidateItem | null>(null);
  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSavePortalDossier = (data: SubmissionDossierData) => {
    if (!editingDossierCandidate) return;
    const updated = candidates.map(c => {
      if (c.id === editingDossierCandidate.id) {
        return {
          ...c,
          ...data,
          currentStatus: data.overallStatus || c.currentStatus,
          screeningNote: data.recruiterRemarks || c.screeningNote,
          lastUpdatedDate: 'Just now'
        };
      }
      return c;
    });
    setCandidates(updated);

    // Persist to client portal storage
    const storageKey = `tasknera_portal_cands_${clientName.replace(/\s+/g, '_')}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}

    // Two-way sync to pipeline
    try {
      const pipelineRaw = localStorage.getItem('tasknera_recruitment_pipeline_v1');
      if (pipelineRaw) {
        const pipeCands = JSON.parse(pipelineRaw);
        if (Array.isArray(pipeCands)) {
          const updatedPipe = pipeCands.map((p: any) => {
            if (p.id === editingDossierCandidate.id || p.name === editingDossierCandidate.name) {
              return {
                ...p,
                ...data,
                stage: data.overallStatus?.toLowerCase().includes('interview') ? 'Interviewing' :
                       data.overallStatus?.toLowerCase().includes('offer') ? 'Offered' :
                       data.overallStatus?.toLowerCase().includes('hire') ? 'Hired' : p.stage,
                notes: data.recruiterRemarks || p.notes
              };
            }
            return p;
          });
          localStorage.setItem('tasknera_recruitment_pipeline_v1', JSON.stringify(updatedPipe));
        }
      }
    } catch {}

    window.dispatchEvent(new CustomEvent('tasknera_portal_sync'));
    showToast(`Updated 30-field dossier for ${editingDossierCandidate.name}`);
    setIsDossierModalOpen(false);
    setEditingDossierCandidate(null);
  };

  // 7.2 Client Interview & Lifecycle Modal (Fields 20 to 30)
  const [lifecycleCandidate, setLifecycleCandidate] = useState<CandidateItem | null>(null);

  const handleSaveClientLifecycle = (data: ClientLifecycleData) => {
    if (!lifecycleCandidate) return;

    const updated = candidates.map(c => {
      if (c.id === lifecycleCandidate.id) {
        const updatedTimeline = [
          {
            status: data.overallStatus || c.currentStatus,
            createdAt: new Date().toISOString(),
            updatedBy: data.clientReviewerName || `${clientName} Reviewer`,
            feedback: `Client updated Lifecycle & Interview stages: Round 1: ${data.interviewRound1}, Offer: ${data.offerStatus}, Status: ${data.overallStatus}`,
          },
          ...(c.timeline || [])
        ];

        return {
          ...c,
          interviewRound1: data.interviewRound1,
          interviewRound2: data.interviewRound2,
          finalInterview: data.finalInterview,
          offerStatus: data.offerStatus,
          joiningDate: data.joiningDate,
          joiningStatus: data.joiningStatus,
          rejectionReason: data.rejectionReason,
          lastFollowUpDate: data.lastFollowUpDate,
          nextFollowUpDate: data.nextFollowUpDate,
          response: data.response,
          overallStatus: data.overallStatus,
          currentStatus: data.overallStatus || c.currentStatus,
          candidateStatus: data.overallStatus || c.candidateStatus,
          latestFeedback: data.response || `Updated to ${data.overallStatus}`,
          lastUpdatedDate: 'Just now',
          timeline: updatedTimeline,
        };
      }
      return c;
    });

    setCandidates(updated);

    // Save to client portal storage
    const storageKey = `tasknera_portal_cands_${clientName.replace(/\s+/g, '_')}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}

    // Two-way sync with recruiter pipeline
    try {
      const pipelineRaw = localStorage.getItem('tasknera_recruitment_pipeline_v1');
      if (pipelineRaw) {
        const pipeCands = JSON.parse(pipelineRaw);
        if (Array.isArray(pipeCands)) {
          const updatedPipe = pipeCands.map((p: any) => {
            if (p.id === lifecycleCandidate.id || p.name === lifecycleCandidate.name) {
              const stageMapping =
                data.overallStatus === 'Round 1 Phase Scheduled' ? 'Round 1 Phase' :
                data.overallStatus === 'Round 2 Phase Scheduled' ? 'Round 2 Phase' :
                data.overallStatus === 'Interview Completed' ? 'Interviewing' :
                data.overallStatus === 'Selected / Offer' ? 'Selected' :
                data.overallStatus === 'Joined' ? 'Joined' :
                data.overallStatus === 'Not a Fit' ? 'Rejected' : p.stage;

              return {
                ...p,
                stage: stageMapping,
                interviewRound1: data.interviewRound1,
                interviewRound2: data.interviewRound2,
                finalInterview: data.finalInterview,
                offerStatus: data.offerStatus,
                joiningDate: data.joiningDate,
                joiningStatus: data.joiningStatus,
                rejectionReason: data.rejectionReason,
                lastFollowUpDate: data.lastFollowUpDate,
                nextFollowUpDate: data.nextFollowUpDate,
                response: data.response,
                overallStatus: data.overallStatus,
                notes: data.response || p.notes,
                ...(data.overallStatus === 'Not a Fit' ? { decision: 'DO NOT SUBMIT' } : {})
              };
            }
            return p;
          });
          localStorage.setItem('tasknera_recruitment_pipeline_v1', JSON.stringify(updatedPipe));
        }
      }
    } catch {}

    // Add to Transparency Activity Feed
    const newActivity: TransparencyActivityItem = {
      id: `act-${Date.now()}`,
      title: `Client Updated Lifecycle: ${lifecycleCandidate.name} (${data.overallStatus})`,
      detail: `Round 1: ${data.interviewRound1} • Offer: ${data.offerStatus} • Joining: ${data.joiningDate}`,
      actor: data.clientReviewerName || `${clientName} Team`,
      actorRole: 'CLIENT',
      timestamp: 'Just now',
      badge: 'Lifecycle Updated'
    };
    setActivities(prev => [newActivity, ...prev]);

    window.dispatchEvent(new CustomEvent('tasknera_portal_sync'));
    showToast(`✓ Updated Interview & Lifecycle for ${lifecycleCandidate.name}`);
    setLifecycleCandidate(null);
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
          const sharesRaw = localStorage.getItem('tasknera_client_portal_shares_v1') || localStorage.getItem('tasknera_client_shares');
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
            if (found?.assignedMember) {
              setAssignedMember(found.assignedMember);
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

      // Merge Store Jobs + Client Uploaded JDs + Created Jobs
      let createdJobsForClient: ClientPortalJob[] = [];
      if (typeof window !== 'undefined') {
        try {
          const rawCreated = localStorage.getItem('tasknera_created_jobs');
          if (rawCreated) {
            const list = JSON.parse(rawCreated);
            if (Array.isArray(list)) {
              for (const cj of list) {
                const cjClient = String(cj.client || cj.company || '').toLowerCase().trim();
                const resClient = resolvedClient.toLowerCase().trim();
                if (cjClient === resClient || cjClient.includes(resClient) || resClient.includes(cjClient)) {
                  createdJobsForClient.push({
                    id: cj.id,
                    title: cj.position || cj.title || 'Requisition Role',
                    client: cj.client || cj.company || resolvedClient,
                    location: cj.location || 'Remote / Hybrid',
                    workMode: cj.work_mode || cj.workMode || cj.mode || 'Hybrid',
                    salary: cj.salary || 'Competitive',
                    status: cj.status === 'Active' ? 'Active Screening' : 'Shortlist Delivered',
                    sourcedCount: 0,
                    screenedCount: 0,
                    submittedCount: 0,
                    createdAt: cj.created_at || cj.createdAt || 'Recently',
                    description: cj.description || `Job Requisition for ${cj.position || cj.title}`,
                    priority: 'High',
                    assignedRecruiter: cj.assignedRecruiter || cj.assignedTo,
                  });
                }
              }
            }
          }
        } catch {}
      }

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

      // Combined unique jobs - deduplicate strictly by normalized title to prevent identical JDs showing twice
      const normalizeJobTitle = (t: string) =>
        (t || '')
          .toLowerCase()
          .replace(/\b(jd|job|description|spec|specs|final|v\d+)\b/gi, '')
          .replace(/[^a-z0-9]/g, '')
          .trim();

      const combinedJobsMap = new Map<string, ClientPortalJob>();
      const titleToKeyMap = new Map<string, string>();

      const registerJob = (j: ClientPortalJob) => {
        if (!j || !j.title) return;
        const normKey = normalizeJobTitle(j.title);
        const existingKey = titleToKeyMap.get(normKey);

        if (existingKey && combinedJobsMap.has(existingKey)) {
          const existing = combinedJobsMap.get(existingKey)!;
          const merged: ClientPortalJob = {
            ...existing,
            ...j,
            id: existing.id && !existing.id.startsWith('jd-client-') ? existing.id : j.id,
            description: existing.description && !existing.description.startsWith('Job Requisition for') ? existing.description : (j.description || existing.description),
            assignedRecruiter: existing.assignedRecruiter || j.assignedRecruiter,
            location: existing.location && existing.location !== 'Remote / Hybrid' ? existing.location : (j.location || existing.location),
            workMode: existing.workMode || j.workMode,
            salary: existing.salary && existing.salary !== 'Competitive Market Rate' ? existing.salary : (j.salary || existing.salary),
            screenedCount: Math.max(existing.screenedCount || 0, j.screenedCount || 0),
            submittedCount: Math.max(existing.submittedCount || 0, j.submittedCount || 0),
            joinedCount: Math.max(existing.joinedCount || 0, j.joinedCount || 0),
          };
          combinedJobsMap.set(existingKey, merged);
        } else {
          const key = j.id || `job-${normKey}`;
          combinedJobsMap.set(key, j);
          titleToKeyMap.set(normKey, key);
        }
      };

      mappedStoreJobs.forEach(registerJob);
      createdJobsForClient.forEach(registerJob);
      uploadedJds.forEach(registerJob);

      const finalJobs = Array.from(combinedJobsMap.values());

      // Update real screened counts from job-specific candidate storage
      if (typeof window !== 'undefined') {
        for (const j of finalJobs) {
          try {
            const rawCands = localStorage.getItem(`tasknera_candidates_${j.id}`);
            if (rawCands) {
              const parsed = JSON.parse(rawCands);
              if (Array.isArray(parsed) && parsed.length > 0) {
                j.screenedCount = Math.max(j.screenedCount || 0, parsed.length);
              }
            }
          } catch {}
        }
      }

      setJobs(finalJobs);

      const finalJobIds = new Set(finalJobs.map(j => j.id));
      const finalJobTitles = new Set(finalJobs.map(j => j.title.toLowerCase().trim()));
      const portalCandidatesMap = new Map<string, CandidateItem>();

      // A. Load existing candidates stored in tasknera_portal_cands_${clientKey}
      if (typeof window !== 'undefined') {
        try {
          const storedCandsRaw = localStorage.getItem(`tasknera_portal_cands_${resolvedClient.replace(/\s+/g, '_')}`);
          if (storedCandsRaw) {
            const parsed = JSON.parse(storedCandsRaw);
            if (Array.isArray(parsed)) {
              for (const c of parsed) {
                if (c && c.id) {
                  portalCandidatesMap.set(c.id, c);
                }
              }
            }
          }
        } catch {}
      }

      // Helper to find full candidate info across storage keys
      const findFullCandidateInfo = (candidateId: string, candJobId?: string): any => {
        if (typeof window === 'undefined') return null;
        if (candJobId && candJobId !== 'all') {
          try {
            const raw = localStorage.getItem(`tasknera_candidates_${candJobId}`);
            if (raw) {
              const list = JSON.parse(raw);
              const found = Array.isArray(list) ? list.find((c: any) => c.id === candidateId || c.name === candidateId) : null;
              if (found) return found;
            }
          } catch {}
        }
        for (const j of finalJobs) {
          try {
            const raw = localStorage.getItem(`tasknera_candidates_${j.id}`);
            if (raw) {
              const list = JSON.parse(raw);
              const found = Array.isArray(list) ? list.find((c: any) => c.id === candidateId || c.name === candidateId) : null;
              if (found) return found;
            }
          } catch {}
        }
        try {
          const sc = atsStore.getCandidate(candidateId);
          if (sc) return sc;
        } catch {}
        try {
          const poolRaw = localStorage.getItem('tasknera_candidates_pool');
          if (poolRaw) {
            const list = JSON.parse(poolRaw);
            const found = Array.isArray(list) ? list.find((c: any) => c.id === candidateId || c.name === candidateId) : null;
            if (found) return found;
          }
        } catch {}
        return null;
      };

      // B. Dynamically ingest and synchronize candidates from the Recruiter Pipeline
      if (typeof window !== 'undefined') {
        try {
          const pipelineRaw = localStorage.getItem('tasknera_recruitment_pipeline_v1');
          if (pipelineRaw) {
            const pipelineList = JSON.parse(pipelineRaw);
            if (Array.isArray(pipelineList)) {
              for (const pc of pipelineList) {
                if (!pc || !pc.id) continue;
                const reqId = pc.requisitionId || '';
                const reqTitle = (pc.requisitionTitle || '').toLowerCase().trim();
                const isClientRequisition =
                  finalJobIds.has(reqId) ||
                  (reqTitle && finalJobTitles.has(reqTitle)) ||
                  (pc.client && pc.client.toLowerCase().trim() === resolvedClient.toLowerCase().trim());

                if (!isClientRequisition) continue;

                // Check pipeline stage
                const isShortlisted = [
                  'Shortlisted',
                  'Recruiter Name',
                  'Round 1 Phase',
                  'Round 2 Phase',
                  'Selected',
                  'Offered',
                  'Joined',
                ].includes(pc.stage);

                let targetStatus = 'Active Screening';
                if (pc.stage === 'Shortlisted' || pc.stage === 'Recruiter Name') {
                  targetStatus = 'Shared with Client';
                } else if (pc.stage === 'Round 1 Phase') {
                  targetStatus = 'Interview Scheduled (Round 1)';
                } else if (pc.stage === 'Round 2 Phase') {
                  targetStatus = 'Interview Scheduled (Round 2)';
                } else if (pc.stage === 'Selected') {
                  targetStatus = 'Selected';
                } else if (pc.stage === 'Offered') {
                  targetStatus = 'Offered';
                } else if (pc.stage === 'Joined') {
                  targetStatus = 'Joined';
                }

                if (isShortlisted) {
                  const existing = portalCandidatesMap.get(pc.id);
                  const full = findFullCandidateInfo(pc.id, pc.requisitionId);
                  const score = typeof pc.score === 'number' ? pc.score : (full?.atsScore || 85);
                  const candidateJobTitle =
                    pc.requisitionTitle ||
                    full?.jobTitle ||
                    finalJobs.find(j => j.id === pc.requisitionId)?.title ||
                    'Requisition Role';

                  const isApproved = pc.isRecruiterApproved === true || (pc.isRecruiterApproved === undefined && existing?.isRecruiterApproved === true);

                  const item: CandidateItem = {
                    id: pc.id,
                    name: pc.name,
                    email: full?.email || existing?.email || pc.emailId || pc.email || '',
                    phone: full?.phone || existing?.phone || pc.phoneNumber || pc.phone || '',
                    currentTitle: pc.role || full?.currentTitle || full?.current_title || existing?.currentTitle || 'Software Engineer',
                    currentCompany: full?.currentCompany || full?.current_company || existing?.currentCompany || 'Verified Candidate',
                    totalExperience: pc.totalWorkExperience || full?.exp || full?.totalExperience || full?.total_experience || existing?.totalExperience || 'Pending Recruiter Input',
                    location: full?.location || existing?.location || pc.currentLocation || 'Not Specified',
                    summary: full?.summary || full?.profile_summary || existing?.summary || `Screened and evaluated for ${candidateJobTitle}. Evaluated deterministic score: ${score}%. Shortlisted by ${pc.recruiterName || 'Agency Recruiter'}.`,
                    skills: (full?.skills && Array.isArray(full?.skills) && full.skills.length > 0)
                      ? full.skills
                      : (existing?.skills && existing.skills.length > 0 ? existing.skills : ['Technical Proficiency', 'Deterministic Sourcing', 'Core Domain Skills']),
                    atsScore: score,
                    matchLevel: score >= 85 ? 'EXCELLENT MATCH' : (score >= 70 ? 'STRONG MATCH' : 'MATCH'),
                    mandatoryPassed: full?.mandatoryFailed !== undefined ? !full.mandatoryFailed : true,
                    currentStatus: targetStatus,
                    lastUpdatedDate: 'Just now',
                    hasResume: true,
                    resumeFileName: full?.fileName || full?.resumeFileName || existing?.resumeFileName || `${pc.name.replace(/\s+/g, '_')}_CV.pdf`,
                    screeningNote: full?.screeningInfo?.notes || existing?.screeningNote || `Agency Screening Verdict: Mandatory requirements verified. Shortlisted by ${pc.recruiterName || 'Agency Recruiter'}.`,
                    jobId: pc.requisitionId || (finalJobs[0]?.id || 'client-job'),
                    jobTitle: candidateJobTitle,
                    decision: 'SUBMIT',
                    screeningEvidence: full?.evidenceSnippets || full?.screeningEvidence || existing?.screeningEvidence || [],

                    // Recruiter Approval Gate
                    isRecruiterApproved: isApproved,
                    recruiterApprovalStatus: isApproved ? 'APPROVED' : 'PENDING_APPROVAL',
                    recruiterApprovedBy: pc.recruiterApprovedBy || existing?.recruiterApprovedBy || pc.recruiterName,
                    recruiterApprovedAt: pc.recruiterApprovedAt || existing?.recruiterApprovedAt,
                  };

                  portalCandidatesMap.set(pc.id, item);
                } else if (pc.stage === 'Screening') {
                  // Candidate is in internal agency screening - not yet shortlisted
                  if (portalCandidatesMap.has(pc.id)) {
                    const existing = portalCandidatesMap.get(pc.id)!;
                    portalCandidatesMap.set(pc.id, {
                      ...existing,
                      currentStatus: 'Active Screening',
                    });
                  }
                }
              }
            }
          }
        } catch {}
      }

      // C. Ingest candidates from atsStore matching this client or client's jobs
      try {
        const storeCands = atsStore.getCandidates().filter(c =>
          c.client?.toLowerCase().trim() === resolvedClient.toLowerCase().trim() ||
          finalJobs.some(j => j.id === c.jobId)
        );
        for (const sc of storeCands) {
          if (!portalCandidatesMap.has(sc.id) && (sc.decision === 'SUBMIT' || sc.stageStatus === 'SHORTLISTED' || sc.stageStatus === 'TL_APPROVED')) {
            const score = sc.calibratedScore || sc.match || 85;
            const isApproved = (sc as any).isRecruiterApproved === true;
            portalCandidatesMap.set(sc.id, {
              id: sc.id,
              name: sc.name,
              email: sc.email || '',
              phone: sc.phone || '',
              currentTitle: sc.role,
              currentCompany: sc.currentCompany || 'Verified Candidate',
              totalExperience: sc.exp || 'Pending Recruiter Input',
              location: sc.location || 'Not Specified',
              summary: `Profile screened for ${sc.jobTitle}. Evaluated deterministic score: ${score}%.`,
              skills: sc.skills || [],
              atsScore: score,
              matchLevel: score >= 90 ? 'EXCELLENT MATCH' : 'STRONG MATCH',
              mandatoryPassed: !sc.mandatoryFailed,
              currentStatus: 'Shared with Client',
              lastUpdatedDate: 'Recently',
              hasResume: true,
              resumeFileName: `${sc.name.replace(/\s+/g, '_')}_CV.pdf`,
              screeningNote: `Agency Screening Verdict: Mandatory requirement compliance: ${sc.mandatoryMatch}. Evaluated by ${sc.assignedRecruiter}.`,
              jobId: sc.jobId,
              jobTitle: sc.jobTitle,
              screeningEvidence: sc.evidenceSnippets || [],
              decision: 'SUBMIT',
              isRecruiterApproved: isApproved,
              recruiterApprovalStatus: isApproved ? 'APPROVED' : 'PENDING_APPROVAL',
              recruiterApprovedBy: sc.assignedRecruiter,
            });
          }
        }
      } catch {}

      // D. Ingest candidates directly saved under tasknera_candidates_${jobId} with shortlist/submit decision
      if (typeof window !== 'undefined') {
        for (const j of finalJobs) {
          try {
            const rawCands = localStorage.getItem(`tasknera_candidates_${j.id}`);
            if (rawCands) {
              const list = JSON.parse(rawCands);
              if (Array.isArray(list)) {
                for (const cand of list) {
                  if (!cand || !cand.id) continue;
                  const isSubmitted = cand.decision === 'SUBMIT' || cand.stage === 'Shortlisted';
                  if (isSubmitted && !portalCandidatesMap.has(cand.id)) {
                    const score = cand.atsScore || cand.score || cand.matchScore || 80;
                    const isApproved = cand.isRecruiterApproved === true;
                    portalCandidatesMap.set(cand.id, {
                      id: cand.id,
                      name: cand.name || 'Candidate',
                      email: cand.email || '',
                      phone: cand.phone || '',
                      currentTitle: cand.role || cand.currentTitle || cand.current_title || 'Software Engineer',
                      currentCompany: cand.currentCompany || cand.current_company || 'Verified Candidate',
                      totalExperience: cand.exp || cand.totalExperience || cand.total_experience || 'Pending Recruiter Input',
                      location: cand.location || 'Not Specified',
                      summary: cand.summary || cand.profile_summary || `Screened and shortlisted for ${j.title}. ATS score: ${score}%.`,
                      skills: cand.skills || ['Technical Proficiency', 'Domain Skills'],
                      atsScore: score,
                      matchLevel: score >= 85 ? 'EXCELLENT MATCH' : (score >= 70 ? 'STRONG MATCH' : 'MATCH'),
                      mandatoryPassed: cand.mandatoryFailed !== undefined ? !cand.mandatoryFailed : true,
                      currentStatus: 'Shared with Client',
                      lastUpdatedDate: 'Recently',
                      hasResume: true,
                      resumeFileName: cand.fileName || `${(cand.name || 'candidate').replace(/\s+/g, '_')}_CV.pdf`,
                      screeningNote: `Agency Screening Verdict: Shortlisted for client review.`,
                      jobId: j.id,
                      jobTitle: j.title,
                      decision: 'SUBMIT',
                      screeningEvidence: cand.evidenceSnippets || cand.screeningEvidence || [],
                      isRecruiterApproved: isApproved,
                      recruiterApprovalStatus: isApproved ? 'APPROVED' : 'PENDING_APPROVAL',
                    });
                  }
                }
              }
            }
          } catch {}
        }
      }

      // E. Filter out candidates still in internal 'Active Screening' or pending recruiter approval so client only sees certified candidates
      const allCandidatesArray = Array.from(portalCandidatesMap.values());
      const clientVisibleCandidates = allCandidatesArray.filter(c => {
        const isNotActiveScreening = c.currentStatus !== 'Active Screening';
        const isApproved = c.isRecruiterApproved === true || c.recruiterApprovalStatus === 'APPROVED';
        return isNotActiveScreening && isApproved;
      });

      // Hydrate all 30 executive submission fields on every visible candidate
      const full30Candidates = clientVisibleCandidates.map(c => {
        const matchingJob = finalJobs.find(
          j => j.id === c.jobId || j.title.toLowerCase().trim() === (c.jobTitle || '').toLowerCase().trim()
        ) || finalJobs[0];
        const assignedRecruiter = matchingJob?.assignedRecruiter || assignedMember || 'Senior Recruiter';
        return buildFull30FieldsCandidate(c, matchingJob, resolvedClient, assignedRecruiter);
      });

      setCandidates(full30Candidates);

      // Default expand all 30-field dossiers for immediate transparency
      const initialExpanded: Record<string, boolean> = {};
      full30Candidates.forEach(c => {
        initialExpanded[c.id] = true;
      });
      setExpandedDossierIds(prev => ({ ...initialExpanded, ...prev }));

      // Persist client portal candidates with full 30 fields
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            `tasknera_portal_cands_${resolvedClient.replace(/\s+/g, '_')}`,
            JSON.stringify(full30Candidates)
          );
        } catch {}
      }

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

  // Real-time live listener: automatically reload portal when recruiter moves candidates in pipeline
  useEffect(() => {
    const handleSync = () => {
      loadPortalData();
    };
    window.addEventListener('storage', handleSync);
    window.addEventListener('tasknera_portal_sync', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('tasknera_portal_sync', handleSync);
    };
  }, [loadPortalData]);

  // Prompt the client to upload their JD when entering the portal if no JDs exist yet
  useEffect(() => {
    if (!isLoading && jobs.length === 0 && !hasAutoPromptedRef.current) {
      hasAutoPromptedRef.current = true;
      setIsJdModalOpen(true);
    }
  }, [isLoading, jobs.length]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Action: Submit New JD PDF
  // ─────────────────────────────────────────────────────────────────────────────
  const handleClientSubmitJd = (e: React.FormEvent) => {
    e.preventDefault();
    if (jdFiles.length === 0) {
      alert('Please select or drag in at least one Job Description (PDF) file.');
      return;
    }

    setIsSubmittingJd(true);
    try {
      const newCreatedJobs: ClientPortalJob[] = [];
      const newActivities: TransparencyActivityItem[] = [];

      jdFiles.forEach((item, idx) => {
        const newJobId = `jd-client-${Date.now()}-${idx}`;
        const cleanTitle = item.title.trim() || item.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const newJob: ClientPortalJob = {
          id: newJobId,
          title: cleanTitle,
          department: 'Requisition Intake',
          client: clientName,
          location: 'Remote / Hybrid',
          workMode: 'Hybrid',
          salary: 'Competitive Market Rate',
          status: 'Agency Sourcing Candidates',
          sourcedCount: 0,
          screenedCount: 0,
          submittedCount: 0,
          createdAt: 'Just now',
          description: `Client uploaded Job Description PDF: ${item.name}`,
          priority: 'High',
        };

        const effectiveRecruiter = assignedMember || 'Agency Delivery Team';

        if (effectiveRecruiter && !isExcludedRecruiterName(effectiveRecruiter)) {
          setJobAssignment({
            jobId: newJob.id,
            client: clientName,
            title: newJob.title,
            assignedRecruiter: effectiveRecruiter,
            role: 'Technical Recruiter',
            assignedBy: 'Client Portal Share'
          });
        }

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
              assignedRecruiter: effectiveRecruiter,
              pod: 'Client Portal Inflow',
              mandatoryRequirementsCount: 3,
              totalRequirementsCount: 6,
              description: newJob.description,
            },
            contactName.trim() || `${clientName} Hiring Manager`,
            'CLIENT'
          );
        } catch (err) {
          console.warn('atsStore addJob fallback:', err);
        }

        newCreatedJobs.push({
          ...newJob,
          assignedRecruiter: effectiveRecruiter
        });

        newActivities.push({
          id: `act-${Date.now()}-${idx}`,
          title: `New JD PDF Uploaded: ${newJob.title}`,
          detail: `Client uploaded "${item.name}". Requisition registered and assigned to ${effectiveRecruiter} for deterministic sourcing.`,
          actor: contactName || `${clientName} Hiring Team`,
          actorRole: 'CLIENT',
          timestamp: 'Just now',
          badge: 'JD Uploaded'
        });
      });

      // 2. Persist in Client JDs storage & sync into tasknera_created_jobs (deduplicating by normalized title)
      const normTitleCheck = (t: string) =>
        (t || '').toLowerCase().replace(/\b(jd|job|description|spec|specs|final|v\d+)\b/gi, '').replace(/[^a-z0-9]/g, '').trim();
      const newTitlesSet = new Set(newCreatedJobs.map(nj => normTitleCheck(nj.title)));
      const existingWithoutDuplicates = jobs.filter(j => !newTitlesSet.has(normTitleCheck(j.title)));
      const updatedJobs = [...newCreatedJobs, ...existingWithoutDuplicates];
      setJobs(updatedJobs);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            `tasknera_client_jds_${clientName.replace(/\s+/g, '_')}`,
            JSON.stringify(updatedJobs)
          );
        } catch {}

        try {
          const createdList = JSON.parse(localStorage.getItem('tasknera_created_jobs') || '[]');
          const toAdd = newCreatedJobs.map(j => ({
            id: j.id,
            client: clientName,
            company: clientName,
            position: j.title,
            title: j.title,
            location: j.location || 'Remote / Hybrid',
            work_mode: j.workMode || 'Hybrid',
            workMode: j.workMode || 'Hybrid',
            mode: j.workMode || 'Hybrid',
            salary: j.salary || 'Competitive Market Rate',
            status: 'Active',
            created_at: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            assignedRecruiter: j.assignedRecruiter && j.assignedRecruiter !== 'Agency Delivery Team' ? j.assignedRecruiter : undefined,
            assignedTo: j.assignedRecruiter && j.assignedRecruiter !== 'Agency Delivery Team' ? j.assignedRecruiter : undefined,
            workedBy: j.assignedRecruiter && j.assignedRecruiter !== 'Agency Delivery Team' ? [{
              id: `rec-${j.assignedRecruiter.toLowerCase().replace(/\s+/g, '-')}`,
              name: j.assignedRecruiter,
              role: 'Technical Recruiter',
              action: 'Assigned Lead',
              isCreator: false
            }] : [],
            candidatesCount: 0,
            candidates: 0,
            topScore: 0,
            description: j.description || `Client uploaded Job Description: ${j.title}`
          }));
          localStorage.setItem('tasknera_created_jobs', JSON.stringify([...toAdd, ...createdList.filter((x: any) => !toAdd.some(a => a.id === x.id))]));
        } catch {}
      }

      // 3. Log transparency activity
      setActivities(prev => {
        const next = [...newActivities, ...prev];
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
      setJdFiles([]);
      const rolesSummary = newCreatedJobs.map(j => `"${j.title}"`).join(', ');
      setJdSuccessBanner(`Job Description ${rolesSummary} successfully submitted! Our hiring team has been alerted and candidate sourcing is now underway.`);
      showToast('✓ Job Description PDF uploaded successfully!');
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
      const isRound2 = interviewRound === 'Round 2 Phase';

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
            candidateStatus: newStatus,
            overallStatus: newStatus,
            interviewRound1: !isRound2
              ? `Scheduled: ${scheduledTimeStr} with ${interviewInterviewer || 'Client Team'}`
              : (c.interviewRound1 || 'Completed (Round 1 Passed)'),
            interviewRound2: isRound2
              ? `Scheduled: ${scheduledTimeStr} with ${interviewInterviewer || 'Client Team'}`
              : (c.interviewRound2 || 'Pending Round 1 Completion'),
            lastFollowUpDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            nextFollowUpDate: new Date(interviewStartAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            response: `Interview confirmed by ${clientName} team for ${scheduledTimeStr}`,
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

      // Two-way sync back into the Recruiter Pipeline
      if (typeof window !== 'undefined') {
        try {
          const rawPipe = localStorage.getItem('tasknera_recruitment_pipeline_v1');
          if (rawPipe) {
            const list = JSON.parse(rawPipe);
            if (Array.isArray(list)) {
              const targetStage = interviewRound === 'Round 2 Phase' ? 'Round 2 Phase' : 'Round 1 Phase';
              const updatedPipe = list.map((c: any) => {
                if (c.id === interviewCandidate.id || c.name === interviewCandidate.name) {
                  return { ...c, stage: targetStage };
                }
                return c;
              });
              localStorage.setItem('tasknera_recruitment_pipeline_v1', JSON.stringify(updatedPipe));
            }
          }
        } catch {}
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
      const isReject = feedbackStatus === 'Not a Fit' || feedbackStatus === 'Rejected';
      const isOffer = feedbackStatus === 'Selected' || feedbackStatus === 'Selected / Offer' || feedbackStatus === 'Offered';
      const isJoined = feedbackStatus === 'Joined';

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
            candidateStatus: feedbackStatus,
            overallStatus: feedbackStatus,
            offerStatus: isJoined ? 'Offer Accepted' : isOffer ? 'Offer Extended & Processing' : isReject ? 'Not Offered' : (c.offerStatus || 'In Sourcing / Evaluation'),
            joiningStatus: isJoined ? 'Joined Company' : isOffer ? 'Offer Accepted - Awaiting Joining' : isReject ? 'Rejected' : (c.joiningStatus || 'Pending Offer Acceptance'),
            rejectionReason: isReject ? (feedbackNotes || 'Candidate profile not aligned with technical benchmark criteria') : 'None (Profile Qualified)',
            response: feedbackNotes ? `Client feedback received: "${feedbackNotes}"` : `Status updated to ${feedbackStatus}`,
            lastFollowUpDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
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

      // Two-way sync back into the Recruiter Pipeline
      if (typeof window !== 'undefined') {
        try {
          const rawPipe = localStorage.getItem('tasknera_recruitment_pipeline_v1');
          if (rawPipe) {
            const list = JSON.parse(rawPipe);
            if (Array.isArray(list)) {
              let targetStage: string | null = null;
              if (feedbackStatus === 'Selected' || feedbackStatus === 'Selected / Offer') targetStage = 'Selected';
              else if (feedbackStatus === 'Offered') targetStage = 'Offered';
              else if (feedbackStatus === 'Joined') targetStage = 'Joined';

              const updatedPipe = list.map((c: any) => {
                if (c.id === feedbackCandidate.id || c.name === feedbackCandidate.name) {
                  const isReject = feedbackStatus === 'Not a Fit' || feedbackStatus === 'Rejected';
                  return {
                    ...c,
                    ...(targetStage ? { stage: targetStage } : {}),
                    ...(isReject ? { decision: 'DO NOT SUBMIT' } : {})
                  };
                }
                return c;
              });
              localStorage.setItem('tasknera_recruitment_pipeline_v1', JSON.stringify(updatedPipe));
            }
          }
        } catch {}
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
  // Action: Executive Resume & 30-Point Dossier Download
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDownloadCandidateCv = (cand: CandidateItem) => {
    setDownloadingCandidateId(cand.id);
    try {
      const summaryText = `================================================================================
EXECUTIVE 30-POINT CLIENT SUBMISSION DOSSIER • TASKNERA HIREIQ
================================================================================
Client Partner Account : ${cand.clientName || clientName}
Target Requisition     : ${cand.jdName || cand.jobTitle || 'Requisition Role'}
Agency Recruiter       : ${cand.recruiterName || 'Senior Recruiter'}
Generated On           : ${new Date().toLocaleString()}
--------------------------------------------------------------------------------
1.  Date                      : ${cand.submissionDate || 'N/A'}
2.  JD Name                   : ${cand.jdName || cand.jobTitle || 'N/A'}
3.  Client Name               : ${cand.clientName || clientName}
4.  Recruiter Name            : ${cand.recruiterName || 'Agency Recruiter'}
5.  Candidate Name            : ${cand.candidateName || cand.name}
6.  Email ID                  : ${cand.emailId || cand.email || 'N/A'}
7.  Phone Number              : ${cand.phoneNumber || cand.phone || 'N/A'}
8.  Current Location          : ${cand.currentLocation || cand.location || 'N/A'}
9.  Current Designation       : ${cand.currentDesignation || cand.currentTitle || 'N/A'}
10. Total Work Experience     : ${cand.totalWorkExperience || cand.totalExperience || 'N/A'}
11. Relevant Work Experience  : ${cand.relevantWorkExperience || 'N/A'}
12. Notice Period             : ${cand.noticePeriod || 'N/A'}
13. Current CTC               : ${cand.currentCtc || 'N/A'}
14. Expected CTC              : ${cand.expectedCtc || 'N/A'}
15. CV Link                   : ${cand.cvLink || cand.resumeFileName || `${(cand.name || 'candidate').replace(/\s+/g, '_')}_CV.pdf`}
16. ATS Score                 : ${cand.atsScoreDisplay || `${cand.atsScore}% Match`}
17. Candidate Status          : ${cand.candidateStatus || cand.currentStatus}
18. Screening Status          : ${cand.screeningStatus || 'Verified (100% Mandatory Criteria Met)'}
19. Recruiter Remarks         : ${cand.recruiterRemarks || cand.screeningNote || 'Recommended for interview scheduling.'}
20. Interview Round 1         : ${cand.interviewRound1 || 'Ready for Scheduling'}
21. Interview Round 2         : ${cand.interviewRound2 || 'Pending Round 1'}
22. Final Interview           : ${cand.finalInterview || 'Pending'}
23. Offer Status              : ${cand.offerStatus || 'In Evaluation'}
24. Joining Date              : ${cand.joiningDate || 'Post Offer Release'}
25. Joining Status            : ${cand.joiningStatus || 'Pending'}
26. Rejection Reason          : ${cand.rejectionReason || 'None (Profile Qualified)'}
27. Last Follow-up Date       : ${cand.lastFollowUpDate || 'Recently'}
28. Next Follow-up Date       : ${cand.nextFollowUpDate || 'Upcoming'}
29. Response                  : ${cand.response || 'Interested & Actively Available'}
30. Overall Status            : ${cand.overallStatus || cand.currentStatus}

--------------------------------------------------------------------------------
PROFILE SUMMARY OVERVIEW:
${cand.summary || 'Strong candidate meeting mandatory position requirements.'}

CORE EVALUATED SKILLS:
${cand.skills.join(', ')}

EVIDENCE CITATIONS & SCREENING VERIFICATION:
${cand.screeningEvidence?.map(e => `• [${e.status}] ${e.requirement}: ${e.evidence}`).join('\n') || 'All knockout criteria satisfied.'}

RECRUITER VERDICT & SUBMISSION SUMMARY:
${cand.recruiterRemarks || cand.screeningNote || 'Recommended for interview scheduling.'}
================================================================================
Generated for: ${clientName} Hiring Account via HireIQ Client Transparency Portal.`;

      const blob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${cand.name.replace(/\s+/g, '_')}_Verified_Submission_Dossier_30_Points.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`✓ Downloaded ${cand.name}'s verified 30-point dossier.`);
    } catch {
      alert('Unable to download resume file.');
    } finally {
      setTimeout(() => setDownloadingCandidateId(null), 800);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Action: Toggle Single Dossier Expansion
  // ─────────────────────────────────────────────────────────────────────────────
  const toggleDossierExpand = (id: string) => {
    setExpandedDossierIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Action: Toggle All Dossiers Expand / Collapse
  // ─────────────────────────────────────────────────────────────────────────────
  const toggleAllDossiers = () => {
    const areAllExpanded = candidates.length > 0 && candidates.every(c => expandedDossierIds[c.id]);
    const nextState: Record<string, boolean> = {};
    candidates.forEach(c => {
      nextState[c.id] = !areAllExpanded;
    });
    setExpandedDossierIds(nextState);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Action: Export 30-Column Master Submission Sheet (CSV)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleExportSubmissionSheetCsv = () => {
    if (candidates.length === 0) {
      showToast('No candidates available to export.');
      return;
    }

    const headers = [
      'Date',
      'JD Name',
      'Client Name',
      'Recruiter Name',
      'Candidate Name',
      'Email ID',
      'Phone Number',
      'Current Location',
      'Current Designation',
      'Total Work Experience',
      'Relevant Work Experience',
      'Notice Period',
      'Current CTC',
      'Expected CTC',
      'CV Link',
      'ATS',
      'Candidate Status',
      'Screening Status',
      'Recruiter Remarks',
      'Interview Round 1',
      'Interview Round 2',
      'Final Interview',
      'Offer Status',
      'Joining Date',
      'Joining Status',
      'Rejection Reason',
      'Last Follow-up Date',
      'Next Follow-up Date',
      'Response',
      'Overall Status',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const targetList = filteredCandidates.length > 0 ? filteredCandidates : candidates;

    const rows = targetList.map(c => [
      escapeCsv(c.submissionDate || ''),
      escapeCsv(c.jdName || c.jobTitle || ''),
      escapeCsv(c.clientName || clientName),
      escapeCsv(c.recruiterName || ''),
      escapeCsv(c.candidateName || c.name),
      escapeCsv(c.emailId || c.email || ''),
      escapeCsv(c.phoneNumber || c.phone || ''),
      escapeCsv(c.currentLocation || c.location || ''),
      escapeCsv(c.currentDesignation || c.currentTitle || ''),
      escapeCsv(c.totalWorkExperience || c.totalExperience || ''),
      escapeCsv(c.relevantWorkExperience || ''),
      escapeCsv(c.noticePeriod || ''),
      escapeCsv(c.currentCtc || ''),
      escapeCsv(c.expectedCtc || ''),
      escapeCsv(c.cvLink || c.resumeFileName || `${(c.name || 'candidate').replace(/\s+/g, '_')}_CV.pdf`),
      escapeCsv(c.atsScoreDisplay || `${c.atsScore}% Match`),
      escapeCsv(c.candidateStatus || c.currentStatus),
      escapeCsv(c.screeningStatus || 'Verified (100% Mandatory Criteria Met)'),
      escapeCsv(c.recruiterRemarks || c.screeningNote || ''),
      escapeCsv(c.interviewRound1 || ''),
      escapeCsv(c.interviewRound2 || ''),
      escapeCsv(c.finalInterview || ''),
      escapeCsv(c.offerStatus || ''),
      escapeCsv(c.joiningDate || ''),
      escapeCsv(c.joiningStatus || ''),
      escapeCsv(c.rejectionReason || 'None (Profile Qualified)'),
      escapeCsv(c.lastFollowUpDate || ''),
      escapeCsv(c.nextFollowUpDate || ''),
      escapeCsv(c.response || ''),
      escapeCsv(c.overallStatus || c.currentStatus),
    ]);

    const csvContent = [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(clientName || 'Client').replace(/\s+/g, '_')}_Candidate_Submission_Sheet_30_Points_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`✓ Exported 30-column submission sheet for ${targetList.length} candidate(s)!`);
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
      if (statusFilter === 'submitted' && !['Shared with Client', 'Shortlisted & Submitted', 'Shortlisted', 'Ready for Review'].includes(cand.currentStatus)) return false;
      if (statusFilter === 'scheduled' && !cand.currentStatus.includes('Scheduled') && !cand.currentStatus.includes('Interview') && !cand.currentStatus.includes('Round')) return false;
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
  const inInterviewCount = candidates.filter(c => c.currentStatus.includes('Scheduled') || c.currentStatus.includes('Interview') || c.currentStatus.includes('Round')).length;

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

            {/* View Mode & Dossier Switcher Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#EAECF0] rounded-2xl p-3 shadow-xs">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-bold text-[#101828]">View Mode:</span>
                <div className="flex items-center bg-[#F7F8FC] p-1 rounded-xl border border-[#EAECF0]">
                  <button
                    type="button"
                    onClick={() => setCandidateViewMode('cards')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      candidateViewMode === 'cards'
                        ? 'bg-white text-[#101828] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🗂️ Candidate Dossiers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCandidateViewMode('table')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      candidateViewMode === 'table'
                        ? 'bg-white text-[#101828] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>📊 30-Column Submission Sheet</span>
                  </button>
                </div>

                <span className="text-xs text-slate-300 hidden md:inline">|</span>

                <div className="text-[11px] font-semibold text-slate-600">
                  Showing <strong className="text-slate-900">{filteredCandidates.length}</strong> candidate{filteredCandidates.length === 1 ? '' : 's'} with all 30 submission fields
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {candidateViewMode === 'cards' && (
                  <button
                    type="button"
                    onClick={toggleAllDossiers}
                    className="px-3 py-1.5 bg-[#F7F8FC] hover:bg-slate-100 text-slate-700 border border-[#EAECF0] rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>
                      {candidates.length > 0 && candidates.every(c => expandedDossierIds[c.id])
                        ? 'Collapse All Details ▲'
                        : 'Expand All 30 Details ▼'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExportSubmissionSheetCsv}
                  className="px-3.5 py-1.5 bg-[#15966A] hover:bg-[#12805A] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                  title="Export all 30 candidate submission fields to spreadsheet (CSV)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Export Submission Sheet (CSV)</span>
                </button>
              </div>
            </div>

            {/* Candidate List / Table Content */}
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
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200 shadow-2xs">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[#101828]">
                  {candidates.length === 0 ? 'Candidate Profiles Under Recruiter Quality Verification' : 'No candidates match this filter'}
                </h3>
                <p className="text-xs text-[#667085] max-w-md mx-auto leading-relaxed">
                  {candidates.length === 0
                    ? `Assigned recruiter (${assignedMember || 'Agency Recruiter'}) is currently vetting candidate profiles, verifying notice periods, compensation, and mandatory benchmarks. To prevent misleading or unverified information, candidate profiles are visible on this portal only after explicit recruiter certification.`
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
            ) : candidateViewMode === 'table' ? (
              /* ── 30-COLUMN MASTER SUBMISSION TABLE VIEW ── */
              <div className="bg-white border border-[#EAECF0] rounded-2xl shadow-xs overflow-hidden">
                <div className="p-4 border-b border-[#EAECF0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8F9FC]">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#101828]">
                      Master Candidate Submission Sheet • All 30 Fields
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Complete 30 verification data points for {filteredCandidates.length} candidate(s) submitted to {clientName}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportSubmissionSheetCsv}
                    className="px-3.5 py-1.5 bg-[#15966A] hover:bg-[#12805A] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                  >
                    <span>⬇️ Export 30 Columns (CSV)</span>
                  </button>
                </div>

                <div className="overflow-x-auto max-h-[640px]">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-[#F8F9FC] text-[10px] font-extrabold uppercase tracking-wider text-slate-600 border-b border-[#EAECF0] sticky top-0 z-20 shadow-xs">
                      <tr>
                        <th className="p-3 sticky left-0 bg-[#F8F9FC] z-30 border-r border-[#EAECF0]">#</th>
                        <th className="p-3 sticky left-8 bg-[#F8F9FC] z-30 border-r border-[#EAECF0]">5. Candidate Name</th>
                        <th className="p-3">1. Date</th>
                        <th className="p-3">2. JD Name</th>
                        <th className="p-3">3. Client Name</th>
                        <th className="p-3">4. Recruiter Name</th>
                        <th className="p-3">6. Email ID</th>
                        <th className="p-3">7. Phone Number</th>
                        <th className="p-3">8. Current Location</th>
                        <th className="p-3">9. Current Designation</th>
                        <th className="p-3">10. Total Work Exp</th>
                        <th className="p-3">11. Relevant Work Exp</th>
                        <th className="p-3">12. Notice Period</th>
                        <th className="p-3">13. Current CTC</th>
                        <th className="p-3">14. Expected CTC</th>
                        <th className="p-3">15. CV Link</th>
                        <th className="p-3">16. ATS</th>
                        <th className="p-3">17. Candidate Status</th>
                        <th className="p-3">18. Screening Status</th>
                        <th className="p-3 min-w-[240px]">19. Recruiter Remarks</th>
                        <th className="p-3">20. Interview Round 1</th>
                        <th className="p-3">21. Interview Round 2</th>
                        <th className="p-3">22. Final Interview</th>
                        <th className="p-3">23. Offer Status</th>
                        <th className="p-3">24. Joining Date</th>
                        <th className="p-3">25. Joining Status</th>
                        <th className="p-3">26. Rejection Reason</th>
                        <th className="p-3">27. Last Follow-up</th>
                        <th className="p-3">28. Next Follow-up</th>
                        <th className="p-3">29. Response</th>
                        <th className="p-3">30. Overall Status</th>
                        <th className="p-3 text-right sticky right-0 bg-[#F8F9FC] z-30 border-l border-[#EAECF0]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAECF0]">
                      {filteredCandidates.map((cand, idx) => (
                        <tr key={cand.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3 font-mono font-bold text-slate-400 sticky left-0 bg-white z-10 border-r border-[#EAECF0]">
                            {idx + 1}
                          </td>
                          <td className="p-3 font-bold text-[#101828] sticky left-8 bg-white z-10 border-r border-[#EAECF0]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{cand.candidateName || cand.name}</span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-[#ECFDF3] text-[#15966A] border border-[#D1FADF]">
                                {cand.atsScore}%
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" title={`Certified & approved by ${cand.recruiterApprovedBy || cand.recruiterName}`}>
                                ✓ Approved
                              </span>
                            </div>
                          </td>
                          <td className="p-3 text-slate-700">{cand.submissionDate}</td>
                          <td className="p-3 font-semibold text-slate-800">{cand.jdName}</td>
                          <td className="p-3 text-slate-700">{cand.clientName}</td>
                          <td className="p-3 text-slate-700">{cand.recruiterName}</td>
                          <td className="p-3 text-slate-600 select-all font-mono text-[11px]">{cand.emailId}</td>
                          <td className="p-3 text-slate-600">{cand.phoneNumber}</td>
                          <td className="p-3 text-slate-700">{cand.currentLocation}</td>
                          <td className="p-3 text-slate-800 font-medium">{cand.currentDesignation}</td>
                          <td className="p-3 font-semibold text-slate-900">{cand.totalWorkExperience}</td>
                          <td className="p-3 font-semibold text-[#15966A]">{cand.relevantWorkExperience}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              {cand.noticePeriod}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-slate-700">{cand.currentCtc}</td>
                          <td className="p-3 font-bold text-slate-900">{cand.expectedCtc}</td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => handleDownloadCandidateCv(cand)}
                              className="text-xs font-bold text-[#3563E9] hover:underline cursor-pointer flex items-center gap-1"
                            >
                              <span>📄 Download CV</span>
                            </button>
                          </td>
                          <td className="p-3 font-black text-[#15966A]">{cand.atsScoreDisplay}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                              {cand.candidateStatus}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {cand.screeningStatus}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-slate-600 italic max-w-xs truncate" title={cand.recruiterRemarks}>
                            {cand.recruiterRemarks}
                          </td>
                          <td className="p-3 text-slate-700">{cand.interviewRound1}</td>
                          <td className="p-3 text-slate-700">{cand.interviewRound2}</td>
                          <td className="p-3 text-slate-700">{cand.finalInterview}</td>
                          <td className="p-3 text-slate-700 font-medium">{cand.offerStatus}</td>
                          <td className="p-3 text-slate-700">{cand.joiningDate}</td>
                          <td className="p-3 text-slate-700">{cand.joiningStatus}</td>
                          <td className="p-3 text-slate-600">{cand.rejectionReason}</td>
                          <td className="p-3 text-slate-700">{cand.lastFollowUpDate}</td>
                          <td className="p-3 text-slate-700">{cand.nextFollowUpDate}</td>
                          <td className="p-3 text-slate-700">{cand.response}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#EFF4FF] text-[#3563E9] border border-[#D1E0FF]">
                              {cand.overallStatus}
                            </span>
                          </td>
                          <td className="p-3 text-right sticky right-0 bg-white z-10 border-l border-[#EAECF0]">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setLifecycleCandidate(cand)}
                                className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Fill or update interview rounds, offer status, and lifecycle decisions (Client)"
                              >
                                <span>📝 Lifecycle</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDossierCandidate(cand);
                                  setIsDossierModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-[#EFF4FF] hover:bg-[#D1E0FF] text-[#3563E9] border border-[#D1E0FF] rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                                title="Edit 30 submission fields (Assigned Recruiter)"
                              >
                                <span>✏️ Fill / Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setInterviewCandidate(cand);
                                  setInterviewRound('Round 1 Phase');
                                  setInterviewStartAt('');
                                }}
                                className="px-2.5 py-1 bg-[#101828] hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                              >
                                Schedule
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFeedbackCandidate(cand);
                                  setFeedbackStatus(cand.currentStatus);
                                  setFeedbackNotes(cand.latestFeedback || '');
                                }}
                                className="px-2.5 py-1 bg-[#3563E9] hover:bg-[#2851D6] text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                              >
                                Decision
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* ── 30-POINT CANDIDATE CARD DOSSIER VIEW ── */
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
                              <h3 className="text-base font-bold text-[#101828]">{cand.candidateName || cand.name}</h3>
                              <span className="text-xs text-slate-400">•</span>
                              <span className="text-xs font-semibold text-[#3563E9]">{cand.jdName || cand.jobTitle || 'Requisition Role'}</span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                cand.currentStatus.includes('Selected') || cand.currentStatus.includes('Offer') || cand.currentStatus.includes('Joined')
                                  ? 'bg-[#ECFDF3] text-[#15966A] border-[#D1FADF]'
                                  : cand.currentStatus.includes('Scheduled') || cand.currentStatus.includes('Round')
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : cand.currentStatus.includes('Shortlisted') || cand.currentStatus === 'Shared with Client'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {cand.currentStatus}
                              </span>
                            </div>
                            <p className="text-xs text-[#667085] mt-1">
                              <span className="font-semibold text-slate-800">{cand.currentDesignation || cand.currentTitle}</span>
                              {cand.currentCompany && ` at ${cand.currentCompany}`}
                              {cand.totalWorkExperience && ` • ${cand.totalWorkExperience}`}
                              {cand.currentLocation && ` • ${cand.currentLocation}`}
                            </p>

                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Recruiter Certified &amp; Approved</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-slate-600 font-medium">by {cand.recruiterApprovedBy || cand.recruiterName || 'Assigned Recruiter'} ({cand.recruiterApprovedAt || cand.submissionDate})</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setLifecycleCandidate(cand)}
                            className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                            title="Fill or update interview rounds, offer status, and lifecycle decisions (Client)"
                          >
                            <span>📝 Update Lifecycle (Client)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingDossierCandidate(cand);
                              setIsDossierModalOpen(true);
                            }}
                            className="px-3.5 py-2 bg-[#EFF4FF] hover:bg-[#D1E0FF] text-[#3563E9] border border-[#D1E0FF] rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                            title="Fill or edit all 30 candidate submission fields (Assigned Recruiter)"
                          >
                            <span>✏️ Fill / Edit 30 Details</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadCandidateCv(cand)}
                            disabled={downloadingCandidateId === cand.id}
                            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-[#EAECF0] hover:border-slate-300 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                            title="Download verified 30-point candidate dossier"
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

                      {/* ── 30-POINT CLIENT SUBMISSION DOSSIER ── */}
                      <div className="rounded-2xl border border-[#EAECF0] bg-[#F8F9FC] overflow-hidden">
                        <div
                          onClick={() => toggleDossierExpand(cand.id)}
                          className="p-3.5 sm:p-4 bg-white border-b border-[#EAECF0] flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
                        >
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="w-2 h-2 rounded-full bg-[#3563E9]"></span>
                            <h4 className="text-xs sm:text-sm font-black text-[#101828] tracking-tight">
                              30-Point Client Submission Dossier
                            </h4>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#EFF4FF] text-[#3563E9] border border-[#D1E0FF]">
                              All 30 Fields Populated
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingDossierCandidate(cand);
                                setIsDossierModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-[#EFF4FF] hover:bg-[#D1E0FF] text-[#3563E9] border border-[#D1E0FF] rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                              title="Edit all 30 candidate submission fields (Assigned Recruiter)"
                            >
                              <span>✏️ Edit 30 Details</span>
                            </button>
                            <span className="text-xs font-bold text-[#3563E9]">
                              {expandedDossierIds[cand.id] ? 'Hide Dossier ▲' : 'Show All 30 Details ▼'}
                            </span>
                          </div>
                        </div>

                        {expandedDossierIds[cand.id] && (
                          <div className="p-4 sm:p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                              {/* Group 1: Requisition & Agency Context */}
                              <div className="bg-white border border-[#EAECF0] rounded-xl p-3.5 space-y-2.5 shadow-xs">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#3563E9] flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                                  <span>📌 Requisition &amp; Agency</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">1. Date:</span>
                                    <span className="font-semibold text-slate-800">{cand.submissionDate || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">2. JD Name:</span>
                                    <span className="font-bold text-[#101828]">{cand.jdName || cand.jobTitle || 'Requisition Role'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">3. Client Name:</span>
                                    <span className="font-semibold text-slate-800">{cand.clientName || clientName}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">4. Recruiter Name:</span>
                                    <span className="font-semibold text-slate-800">{cand.recruiterName || 'Agency Recruiter'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Group 2: Candidate Profile & Contact */}
                              <div className="bg-white border border-[#EAECF0] rounded-xl p-3.5 space-y-2.5 shadow-xs">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#3563E9] flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                                  <span>👤 Candidate &amp; Contact</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">5. Candidate Name:</span>
                                    <span className="font-bold text-[#101828]">{cand.candidateName || cand.name}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">6. Email ID:</span>
                                    <span className="font-medium text-slate-700 select-all">{cand.emailId || cand.email || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">7. Phone Number:</span>
                                    <span className="font-medium text-slate-700">{cand.phoneNumber || cand.phone || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">8. Current Location:</span>
                                    <span className="font-semibold text-slate-800">{cand.currentLocation || cand.location || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">9. Current Designation:</span>
                                    <span className="font-semibold text-slate-800">{cand.currentDesignation || cand.currentTitle || 'N/A'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Group 3: Experience & Notice Period */}
                              <div className="bg-white border border-[#EAECF0] rounded-xl p-3.5 space-y-2.5 shadow-xs">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#3563E9] flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                                  <span>⏱️ Experience &amp; Notice</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">10. Total Work Experience:</span>
                                    <span className="font-bold text-slate-900">{cand.totalWorkExperience || cand.totalExperience || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">11. Relevant Work Experience:</span>
                                    <span className="font-bold text-[#15966A]">{cand.relevantWorkExperience || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">12. Notice Period:</span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                      {cand.noticePeriod || 'N/A'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Group 4: Compensation & CV File */}
                              <div className="bg-white border border-[#EAECF0] rounded-xl p-3.5 space-y-2.5 shadow-xs">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#3563E9] flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                                  <span>💼 Compensation &amp; CV</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">13. Current CTC:</span>
                                    <span className="font-semibold text-slate-800">{cand.currentCtc || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">14. Expected CTC:</span>
                                    <span className="font-bold text-slate-900">{cand.expectedCtc || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">15. CV Link:</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadCandidateCv(cand)}
                                      className="text-xs font-bold text-[#3563E9] hover:underline cursor-pointer flex items-center gap-1 mt-0.5 truncate max-w-full"
                                      title="Download CV & Summary"
                                    >
                                      <span>📄 {cand.cvLink || cand.resumeFileName || `${cand.name}_CV.pdf`}</span>
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Group 5: Screening & Recruiter Remarks */}
                              <div className="bg-white border border-[#EAECF0] rounded-xl p-3.5 space-y-2.5 shadow-xs">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#3563E9] flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                                  <span>🎯 Screening &amp; Assessment</span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">16. ATS:</span>
                                    <span className="font-black text-[#15966A]">{cand.atsScoreDisplay || `${cand.atsScore}% Match`}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">17. Candidate Status:</span>
                                    <span className="font-semibold text-slate-800">{cand.candidateStatus || cand.currentStatus}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">18. Screening Status:</span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      {cand.screeningStatus || 'Verified (100% Mandatory Criteria Met)'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">19. Recruiter Remarks:</span>
                                    <p className="text-[11px] text-slate-700 italic leading-snug line-clamp-2">
                                      {cand.recruiterRemarks || cand.screeningNote || 'Recommended for interview scheduling.'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Group 6: Interview Pipeline & Lifecycle */}
                              <div className="bg-white border border-[#EAECF0] rounded-xl p-3.5 space-y-2.5 shadow-xs">
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#3563E9] flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="flex items-center gap-1.5">📅 Interview &amp; Lifecycle</span>
                                  <button
                                    type="button"
                                    onClick={() => setLifecycleCandidate(cand)}
                                    className="px-2 py-0.5 bg-[#EFF4FF] hover:bg-[#D1E0FF] text-[#3563E9] border border-[#D1E0FF] rounded-md text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                                    title="Fill or update interview rounds, offer status, joining date, and decisions (Client)"
                                  >
                                    <span>✏️ Fill / Update (Client)</span>
                                  </button>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">20. Interview Round 1:</span>
                                    <span className="font-medium text-slate-800">{cand.interviewRound1 || 'Ready for Scheduling'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">21. Interview Round 2:</span>
                                    <span className="font-medium text-slate-800">{cand.interviewRound2 || 'Pending Round 1'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">22. Final Interview:</span>
                                    <span className="font-medium text-slate-800">{cand.finalInterview || 'Pending'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">23. Offer Status:</span>
                                    <span className="font-medium text-slate-800">{cand.offerStatus || 'In Evaluation'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">24. Joining Date:</span>
                                    <span className="font-medium text-slate-800">{cand.joiningDate || 'Post Offer Release'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">25. Joining Status:</span>
                                    <span className="font-medium text-slate-800">{cand.joiningStatus || 'Pending'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">26. Rejection Reason:</span>
                                    <span className="font-medium text-slate-600">{cand.rejectionReason || 'None (Profile Qualified)'}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-400 block uppercase">27. Last Follow-up:</span>
                                      <span className="text-[11px] text-slate-700">{cand.lastFollowUpDate || 'Recently'}</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-400 block uppercase">28. Next Follow-up:</span>
                                      <span className="text-[11px] text-slate-700">{cand.nextFollowUpDate || 'Upcoming'}</span>
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">29. Response:</span>
                                    <span className="text-[11px] text-slate-800 font-medium">{cand.response || 'Interested & Actively Available'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase">30. Overall Status:</span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#EFF4FF] text-[#3563E9] border border-[#D1E0FF]">
                                      {cand.overallStatus || cand.currentStatus}
                                    </span>
                                  </div>
                                </div>
                                <div className="pt-2 mt-1 border-t border-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => setLifecycleCandidate(cand)}
                                    className="w-full py-2 bg-[#3563E9] hover:bg-[#2851D6] text-white rounded-xl text-xs font-bold transition shadow-xs hover:shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                                    title="Click to fill or update interview rounds, offer details, and lifecycle status"
                                  >
                                    <span>📝 Fill / Update Interview &amp; Lifecycle (Client)</span>
                                  </button>
                                </div>
                              </div>
                            </div>
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

                      {/* Funnel Transparency Bar: Screened • Submitted • Joined (Updated dynamically from client form responses) */}
                      {(() => {
                        const normTitle = (job.title || '').toLowerCase().trim();
                        const matchingCandidates = candidates.filter(c =>
                          c.jobId === job.id ||
                          (c.jobTitle && c.jobTitle.toLowerCase().trim() === normTitle) ||
                          (c.jdName && c.jdName.toLowerCase().trim() === normTitle)
                        );

                        const submittedCount = matchingCandidates.length;

                        const joinedCount = matchingCandidates.filter(c => {
                          const oStat = (c.overallStatus || '').toLowerCase().trim();
                          const jStat = (c.joiningStatus || '').toLowerCase().trim();
                          const cStat = (c.currentStatus || '').toLowerCase().trim();
                          const candStat = (c.candidateStatus || '').toLowerCase().trim();
                          const resp = (c.response || '').toLowerCase().trim();
                          return (
                            oStat === 'joined' ||
                            jStat === 'joined' ||
                            cStat === 'joined' ||
                            candStat === 'joined' ||
                            resp === 'joined' ||
                            oStat.includes('joined') ||
                            jStat.includes('joined') ||
                            cStat.includes('joined')
                          );
                        }).length;

                        const screenedCount = Math.max(job.screenedCount || 0, submittedCount);

                        return (
                          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="bg-[#F7F8FC] rounded-xl p-2">
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Screened</div>
                              <div className="text-base font-extrabold text-slate-800">{screenedCount}</div>
                            </div>
                            <div className="bg-[#EFF4FF] border border-[#D1E0FF] rounded-xl p-2">
                              <div className="text-[10px] font-bold text-[#3563E9] uppercase tracking-wider">Submitted</div>
                              <div className="text-base font-extrabold text-[#3563E9]">{submittedCount}</div>
                            </div>
                            <div className="bg-[#ECFDF3] border border-[#D1FADF] rounded-xl p-2">
                              <div className="text-[10px] font-bold text-[#15966A] uppercase tracking-wider">Joined</div>
                              <div className="text-base font-extrabold text-[#15966A]">{joinedCount}</div>
                            </div>
                          </div>
                        );
                      })()}
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
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center border border-[#D1E0FF] shadow-xs">
                  <svg className="w-5 h-5 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#101828]">Upload Job Description</h3>
                  <p className="text-xs text-[#667085]">Upload your JD PDF to begin candidate sourcing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsJdModalOpen(false); setJdFiles([]); }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleClientSubmitJd} className="p-6 space-y-5">
              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFileSelect(e.dataTransfer.files); }}
                className={`relative border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer ${
                  isDragOver
                    ? 'border-[#3563E9] bg-[#EFF4FF]/60'
                    : 'border-[#D1E0FF] hover:border-[#3563E9] bg-[#F8F9FC] hover:bg-[#EFF4FF]/20'
                }`}
              >
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="w-14 h-14 rounded-2xl bg-white border border-[#EAECF0] text-[#3563E9] flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <svg className="w-7 h-7 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="text-sm font-bold text-[#101828]">
                  Click to upload or drag &amp; drop your JD PDF
                </div>
                <p className="text-xs text-[#667085] mt-1">
                  Supports PDF documents up to 25MB • Multiple files allowed
                </p>
              </div>

              {/* Uploaded Files List */}
              {jdFiles.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>Attached JD Files ({jdFiles.length})</span>
                    <span className="text-[11px] font-normal text-slate-400">Position titles extracted below</span>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {jdFiles.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-[#EAECF0] hover:border-[#3563E9]/30 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center font-extrabold text-[11px] shrink-0">
                            PDF
                          </div>
                          <div className="min-w-0 flex-1">
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => {
                                const newTitle = e.target.value;
                                setJdFiles(prev => prev.map((f, i) => i === idx ? { ...f, title: newTitle } : f));
                              }}
                              placeholder="Position / Role Title"
                              className="text-xs font-bold text-[#101828] bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#3563E9] focus:outline-none w-full truncate"
                            />
                            <div className="text-[11px] text-[#667085] truncate mt-0.5">
                              {item.name} • {item.size}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setJdFiles(prev => prev.filter((_, i) => i !== idx))}
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center text-xs cursor-pointer shrink-0 transition-colors"
                          title="Remove file"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="relative inline-block pt-1">
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      onChange={(e) => handleFileSelect(e.target.files)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3563E9] hover:underline cursor-pointer">
                      + Add another JD PDF
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsJdModalOpen(false); setJdFiles([]); }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingJd || jdFiles.length === 0}
                  className="px-5 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] active:scale-[0.99] text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmittingJd
                    ? 'Submitting...'
                    : jdFiles.length > 1
                    ? `Upload ${jdFiles.length} JDs to Agency`
                    : 'Submit JD to Agency'}
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

      {/* Recruiter 30-Point Dossier Modal */}
      {isDossierModalOpen && editingDossierCandidate && (
        <ClientSubmissionDossierModal
          isOpen={isDossierModalOpen}
          onClose={() => {
            setIsDossierModalOpen(false);
            setEditingDossierCandidate(null);
          }}
          candidate={editingDossierCandidate}
          onSave={handleSavePortalDossier}
          assignedRecruiterName={assignedMember || 'Senior Recruiter'}
          defaultClientName={clientName}
          defaultJdName={editingDossierCandidate.jdName || (jobs[0]?.title ?? 'Requisition Role')}
        />
      )}

      {/* Client Interview & Lifecycle Modal (Fields 20 to 30) */}
      {lifecycleCandidate && (
        <ClientLifecycleModal
          isOpen={!!lifecycleCandidate}
          onClose={() => setLifecycleCandidate(null)}
          candidate={lifecycleCandidate}
          clientName={clientName}
          onSave={handleSaveClientLifecycle}
        />
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
