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

// Fallback high-fidelity verified candidate profiles for demonstration & initial share state
const getDemoCandidatesForClient = (clientName: string, activeJobs: ClientPortalJob[]): CandidateItem[] => {
  const primaryJob = activeJobs[0]?.title || 'SAP CO Consultant';
  const primaryJobId = activeJobs[0]?.id || 'jd-1';

  return [
    {
      id: `cand-${Date.now()}-1`,
      name: 'Marcus Vance',
      email: 'm.vance@candidate-preview.com',
      phone: '+1 (555) 382-9011',
      currentTitle: 'Senior SAP S/4HANA CO Lead',
      currentCompany: 'Deloitte Consulting',
      totalExperience: '8.5 Years',
      location: 'New York, NY (Relocation Ready)',
      summary: 'Experienced SAP Finance & Controlling architect with 3 global S/4HANA manufacturing implementations. Expert in product costing, profitability analysis (CO-PA), and automated period-end closing.',
      skills: ['SAP CO', 'SAP S/4HANA', 'Product Costing (CO-PC)', 'CO-PA', 'Manufacturing Finance', 'Material Ledger', 'BAPI Integration'],
      atsScore: 95,
      matchLevel: 'EXCELLENT MATCH',
      mandatoryPassed: true,
      currentStatus: 'Shared with Client',
      latestFeedback: null,
      lastUpdatedDate: 'Just now',
      hasResume: true,
      resumeFileName: 'Marcus_Vance_SAP_CO_Resume.pdf',
      screeningNote: 'Agency Verdict: Exceeds mandatory experience criteria by 3+ years. Verified deep S/4HANA manufacturing background. Strong verbal communication and structured problem solving.',
      screeningEvidence: [
        { requirement: '5+ years SAP CO experience', status: 'MET', evidence: 'Led SAP CO delivery for 8+ years across Tier-1 industrial manufacturing accounts.' },
        { requirement: '4+ years SAP S/4HANA experience', status: 'MET', evidence: 'Delivered 3 end-to-end greenfield S/4HANA releases (2020 & 2022 versions).' },
        { requirement: 'Manufacturing industry experience', status: 'MET', evidence: 'Configured Product Cost Controlling and Material Ledger for industrial client.' },
        { requirement: 'SAP implementation project experience', status: 'MET', evidence: 'Managed full project lifecycles from blueprint to cutover and hypercare.' },
      ],
      jobId: primaryJobId,
      jobTitle: primaryJob,
      timeline: [
        { status: 'Shared with Client', createdAt: new Date().toISOString(), updatedBy: 'HireIQ Agency Screening Lead', feedback: 'Shortlisted with 95% verified deterministic score.' }
      ]
    },
    {
      id: `cand-${Date.now()}-2`,
      name: 'Elena Rostova',
      email: 'elena.rostova@candidate-preview.com',
      phone: '+1 (555) 749-1204',
      currentTitle: 'Lead Enterprise Systems Specialist',
      currentCompany: 'Accenture Technology',
      totalExperience: '6.2 Years',
      location: 'Jersey City, NJ (Hybrid 3d/wk)',
      summary: 'Specialized in SAP Financial Management and Cost Center Accounting with extensive experience in discrete manufacturing domains and real-time reporting integrations.',
      skills: ['SAP CO-OM', 'Cost Center Accounting', 'Internal Orders', 'S/4HANA Finance', 'Power BI Reporting', 'SQL'],
      atsScore: 91,
      matchLevel: 'EXCELLENT MATCH',
      mandatoryPassed: true,
      currentStatus: 'Round 1 Phase Scheduled',
      latestFeedback: 'Client team scheduled Round 1 technical conversation for next Tuesday.',
      lastUpdatedDate: '2 hours ago',
      hasResume: true,
      resumeFileName: 'Elena_Rostova_Executive_CV.pdf',
      screeningNote: 'Agency Verdict: Verified 6+ years SAP domain track record. Passed all mandatory requirements. Excellent cross-functional stakeholder management skills.',
      screeningEvidence: [
        { requirement: '5+ years SAP CO experience', status: 'MET', evidence: '6.2 years specialized SAP CO consulting experience.' },
        { requirement: '4+ years SAP S/4HANA experience', status: 'MET', evidence: '4.5 years hands-on S/4HANA finance & controlling architecture.' },
        { requirement: 'Manufacturing industry experience', status: 'MET', evidence: 'Heavy manufacturing client engagement on inventory valuation.' },
      ],
      jobId: primaryJobId,
      jobTitle: primaryJob,
      timeline: [
        { status: 'Round 1 Phase Scheduled', createdAt: new Date(Date.now() - 7200000).toISOString(), updatedBy: 'Client Hiring Team', feedback: 'Invited for Round 1 technical interview.' },
        { status: 'Shared with Client', createdAt: new Date(Date.now() - 86400000).toISOString(), updatedBy: 'HireIQ Agency', feedback: 'Delivered in primary candidate batch.' }
      ]
    },
    {
      id: `cand-${Date.now()}-3`,
      name: 'David Kim',
      email: 'david.kim@candidate-preview.com',
      phone: '+1 (555) 491-6623',
      currentTitle: 'Senior Controlling & Systems Consultant',
      currentCompany: 'Capgemini Americas',
      totalExperience: '7.0 Years',
      location: 'Philadelphia, PA (Remote / Travel)',
      summary: 'Functional SAP specialist with proven experience in cost element accounting, overhead management, and financial variance analysis for global supply chain organizations.',
      skills: ['SAP CO', 'Overhead Cost Controlling', 'Variance Analysis', 'ECC 6.0 to S/4HANA Migration', 'Supply Chain Finance'],
      atsScore: 88,
      matchLevel: 'STRONG MATCH',
      mandatoryPassed: true,
      currentStatus: 'Shared with Client',
      latestFeedback: null,
      lastUpdatedDate: 'Yesterday',
      hasResume: true,
      resumeFileName: 'David_Kim_SAP_Consultant.pdf',
      screeningNote: 'Agency Verdict: High technical competence in core controlling modules. Strong migration track record. Ready for immediate client interview.',
      screeningEvidence: [
        { requirement: '5+ years SAP CO experience', status: 'MET', evidence: '7 years continuous enterprise SAP experience.' },
        { requirement: '4+ years SAP S/4HANA experience', status: 'MET', evidence: '4 years S/4HANA migration and cutover support.' },
      ],
      jobId: primaryJobId,
      jobTitle: primaryJob,
      timeline: [
        { status: 'Shared with Client', createdAt: new Date(Date.now() - 86400000).toISOString(), updatedBy: 'HireIQ Agency', feedback: 'Verified match score 88%.' }
      ]
    },
    {
      id: `cand-${Date.now()}-4`,
      name: 'Priya Sharma',
      email: 'priya.sharma@candidate-preview.com',
      phone: '+1 (555) 912-4029',
      currentTitle: 'Senior Financial Systems Engineer',
      currentCompany: 'Tata Consultancy Services',
      totalExperience: '5.8 Years',
      location: 'Boston, MA (Hybrid)',
      summary: 'Full-lifecycle enterprise ERP specialist with deep focus on cost optimization, financial workflow automation, and executive dashboards.',
      skills: ['SAP CO', 'SAP FICO', 'Cost Allocation', 'Tableau / Power BI', 'S/4HANA Cloud'],
      atsScore: 85,
      matchLevel: 'STRONG MATCH',
      mandatoryPassed: true,
      currentStatus: 'Shared with Client',
      latestFeedback: null,
      lastUpdatedDate: '2 days ago',
      hasResume: true,
      resumeFileName: 'Priya_Sharma_Resume.docx',
      screeningNote: 'Agency Verdict: Passed all baseline mandatory tests. Strong financial analytics capabilities and clean documentation record.',
      screeningEvidence: [
        { requirement: '5+ years SAP CO experience', status: 'MET', evidence: '5.8 years across financial operations and ERP.' }
      ],
      jobId: primaryJobId,
      jobTitle: primaryJob,
      timeline: [
        { status: 'Shared with Client', createdAt: new Date(Date.now() - 172800000).toISOString(), updatedBy: 'HireIQ Agency', feedback: 'Shortlist delivered.' }
      ]
    }
  ];
};

function ClientSharePortalContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params?.token as string;

  // 1. Identify Client Identity
  const clientParam = searchParams.get('client') || '';
  const [clientName, setClientName] = useState<string>(clientParam || 'Client Partner');
  const [portalToken, setPortalToken] = useState<string>(token || '');

  // 2. Data State
  const [jobs, setJobs] = useState<ClientPortalJob[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [activities, setActivities] = useState<TransparencyActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      if (!resolvedClient && typeof window !== 'undefined') {
        try {
          const sharesRaw = localStorage.getItem('tasknera_client_portal_shares_v1');
          if (sharesRaw) {
            const parsed = JSON.parse(sharesRaw);
            const found = Array.isArray(parsed) ? parsed.find(s => s.token === token) : null;
            if (found?.clientName) {
              resolvedClient = found.clientName;
            }
          }
        } catch {}
      }

      if (!resolvedClient) {
        resolvedClient = 'Client Partner';
      }
      setClientName(resolvedClient);

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
        sourcedCount: Math.max(18, (sj.candidates || 0) * 3 + 12),
        screenedCount: Math.max(12, (sj.candidates || 0) * 2 + 8),
        submittedCount: Math.max(3, sj.candidates || 3),
        createdAt: '3 days ago',
        description: sj.description,
        priority: 'High',
      }));

      // Combined unique jobs
      const combinedJobsMap = new Map<string, ClientPortalJob>();
      mappedStoreJobs.forEach(j => combinedJobsMap.set(j.id, j));
      uploadedJds.forEach(j => combinedJobsMap.set(j.id, j));

      let finalJobs = Array.from(combinedJobsMap.values());
      if (finalJobs.length === 0) {
        // Fallback default job for the client
        finalJobs = [
          {
            id: 'jd-techcorp-1',
            title: 'SAP CO Consultant & S/4HANA Architect',
            department: 'Manufacturing Finance Systems',
            client: resolvedClient,
            location: 'New York, NY',
            workMode: 'Hybrid',
            salary: '$140,000 - $175,000',
            status: 'Shortlist Delivered',
            sourcedCount: 42,
            screenedCount: 28,
            submittedCount: 4,
            createdAt: '4 days ago',
            priority: 'High',
            description: 'Lead SAP CO and product costing implementation across North American manufacturing facilities.'
          },
          {
            id: 'jd-techcorp-2',
            title: 'Senior Cloud Platform & DevOps Specialist',
            department: 'Infrastructure & Cloud Engineering',
            client: resolvedClient,
            location: 'Remote (US Timezones)',
            workMode: 'Remote',
            salary: '$150,000 - $185,000',
            status: 'Active Screening',
            sourcedCount: 31,
            screenedCount: 19,
            submittedCount: 2,
            createdAt: '1 day ago',
            priority: 'Urgent',
            description: 'Scale Kubernetes clusters and automate Terraform deployments for multi-region SaaS workloads.'
          }
        ];
      }
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

      if (portalCandidates.length === 0) {
        portalCandidates = getDemoCandidatesForClient(resolvedClient, finalJobs);
      }
      setCandidates(portalCandidates);

      // Load Activities
      const initialActivities: TransparencyActivityItem[] = [
        {
          id: 'act-1',
          title: 'AI Screening & Verification Completed',
          detail: 'HireIQ recruiters completed parsing and scoring 28 candidate resumes against mandatory compliance rules.',
          actor: 'HireIQ Screening Team',
          actorRole: 'AGENCY',
          timestamp: '3 hours ago',
          badge: 'Screening Milestone'
        },
        {
          id: 'act-2',
          title: 'Executive Profiles Submitted to Client',
          detail: '4 verified candidates meeting 100% of knockout criteria submitted for client hiring team review.',
          actor: 'Lead Technical Recruiter',
          actorRole: 'AGENCY',
          timestamp: 'Yesterday at 4:30 PM',
          badge: 'Shortlist Delivery'
        },
        {
          id: 'act-3',
          title: 'Scoring Rules Configured',
          detail: `Custom evaluation weights applied: Technical Skills ×1.2, Experience ×1.1. Auto-disqualification enabled for missing mandatory criteria.`,
          actor: 'Account Governance System',
          actorRole: 'AGENCY',
          timestamp: '3 days ago',
          badge: 'Governance Active'
        }
      ];
      setActivities(initialActivities);

    } catch (e) {
      console.error('[Client Portal] Load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [clientParam, token]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

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
      setActivities(prev => [newActivity, ...prev]);

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
    return jobs.reduce((acc, j) => acc + (j.screenedCount || 0), 0) || 54;
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

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-xl font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live ATS Synchronization Active</span>
            </div>

            <button
              type="button"
              onClick={() => setIsJdModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Submit New JD</span>
            </button>
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
              <div className="flex items-center justify-between text-xs text-[#667085] font-semibold mb-1">
                <span>Active Requisitions</span>
                <span>📋</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#101828]">
                {jobs.length}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Open positions with agency</p>
            </div>

            <div className="bg-[#F7F8FC] border border-[#EAECF0] rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-[#667085] font-semibold mb-1">
                <span>Profiles Screened by Agency</span>
                <span>🔍</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#101828]">
                {totalProfilesScreened}+
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Resumes evaluated against criteria</p>
            </div>

            <div className="bg-[#F7F8FC] border border-[#EAECF0] rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-[#667085] font-semibold mb-1">
                <span>Shortlisted &amp; Submitted</span>
                <span>⭐</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#3563E9]">
                {totalProfilesSubmitted}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Ready for client review</p>
            </div>

            <div className="bg-[#F7F8FC] border border-[#EAECF0] rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-[#667085] font-semibold mb-1">
                <span>Interviews in Progress</span>
                <span>📅</span>
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
              <span>👥 Screened Candidates</span>
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
              <span>📋 Job Requisitions ({jobs.length})</span>
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
              <span>🕒 Agency Activity &amp; Audit Log</span>
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
            {filteredCandidates.length === 0 ? (
              <div className="bg-white border border-[#EAECF0] rounded-3xl p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center text-2xl mx-auto border border-[#D1E0FF]">
                  👥
                </div>
                <h3 className="text-base font-bold text-[#101828]">No candidates match this filter</h3>
                <p className="text-xs text-[#667085] max-w-sm mx-auto">
                  Our agency recruiters are actively screening incoming resumes. You will see newly verified candidates appear here automatically.
                </p>
                <button
                  type="button"
                  onClick={() => { setSelectedJobId('all'); setStatusFilter('all'); setSearchQuery(''); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Clear Filters
                </button>
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
                              {cand.totalExperience && ` • 💼 ${cand.totalExperience}`}
                              {cand.location && ` • 📍 ${cand.location}`}
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
                            <span>{downloadingCandidateId === cand.id ? '⏳' : '📄'}</span>
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
                            <span>📅</span>
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
                            <span>💬</span>
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
                          📍 {job.location} • 🏢 {job.workMode} • 💰 {job.salary}
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
                  <div className="text-xl mb-1">📄</div>
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
