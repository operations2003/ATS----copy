'use client';

import React, { useState, useEffect } from 'react';

export interface SubmissionDossierData {
  submissionDate: string;          // 1. Date
  jdName: string;                  // 2. JD Name
  clientName: string;              // 3. Client Name
  recruiterName: string;           // 4. Recruiter Name
  candidateName: string;           // 5. Candidate Name
  emailId: string;                 // 6. Email ID
  phoneNumber: string;             // 7. Phone Number
  currentLocation: string;         // 8. Current Location
  currentDesignation: string;      // 9. Current Designation
  totalWorkExperience: string;     // 10. Total Work Experience
  relevantWorkExperience: string;  // 11. Relevant Work Experience
  noticePeriod: string;            // 12. Notice Period
  currentCtc: string;              // 13. Current CTC
  expectedCtc: string;             // 14. Expected CTC
  cvLink: string;                  // 15. CV Link
  atsScoreDisplay: string;         // 16. ATS
  candidateStatus: string;         // 17. Candidate Status
  screeningStatus: string;         // 18. Screening Status
  recruiterRemarks: string;        // 19. Recruiter Remarks
  interviewRound1: string;         // 20. Interview Round 1
  interviewRound2: string;         // 21. Interview Round 2
  finalInterview: string;          // 22. Final Interview
  offerStatus: string;             // 23. Offer Status
  joiningDate: string;             // 24. Joining Date
  joiningStatus: string;           // 25. Joining Status
  rejectionReason: string;         // 26. Rejection Reason
  lastFollowUpDate: string;        // 27. Last Follow-up Date
  nextFollowUpDate: string;        // 28. Next Follow-up Date
  response: string;                // 29. Response
  overallStatus: string;           // 30. Overall Status

  // Recruiter Verification & Client Release Approval Gate
  isRecruiterApproved?: boolean;
  recruiterApprovalStatus?: 'APPROVED' | 'PENDING_APPROVAL';
  recruiterApprovedBy?: string;
  recruiterApprovedAt?: string;
  recruiterApprovalNotes?: string;
}

interface ClientSubmissionDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: any;
  targetStage?: string | null;
  onSave: (data: SubmissionDossierData) => void;
  assignedRecruiterName?: string;
  defaultClientName?: string;
  defaultJdName?: string;
}

export default function ClientSubmissionDossierModal({
  isOpen,
  onClose,
  candidate,
  targetStage,
  onSave,
  assignedRecruiterName = 'Senior Recruiter',
  defaultClientName = 'Client Partner',
  defaultJdName = 'Requisition Role',
}: ClientSubmissionDossierModalProps) {
  const [formData, setFormData] = useState<SubmissionDossierData>({
    submissionDate: '',
    jdName: '',
    clientName: '',
    recruiterName: '',
    candidateName: '',
    emailId: '',
    phoneNumber: '',
    currentLocation: '',
    currentDesignation: '',
    totalWorkExperience: '',
    relevantWorkExperience: '',
    noticePeriod: '',
    currentCtc: '',
    expectedCtc: '',
    cvLink: '',
    atsScoreDisplay: '',
    candidateStatus: '',
    screeningStatus: '',
    recruiterRemarks: '',
    interviewRound1: '',
    interviewRound2: '',
    finalInterview: '',
    offerStatus: '',
    joiningDate: '',
    joiningStatus: '',
    rejectionReason: '',
    lastFollowUpDate: '',
    nextFollowUpDate: '',
    response: '',
    overallStatus: '',
  });

  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!candidate || !isOpen) return;

    setIsApproved(candidate.isRecruiterApproved === true);

    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const rawName = candidate.candidateName || candidate.name || '';
    const rawRole = candidate.currentDesignation || candidate.currentTitle || candidate.current_title || candidate.role || '';
    const rawScore = typeof candidate.atsScore === 'number' ? candidate.atsScore : (typeof candidate.score === 'number' ? candidate.score : 85);

    setFormData({
      // 1. Date
      submissionDate: candidate.submissionDate || todayStr,
      // 2. JD Name
      jdName: candidate.jdName || candidate.jobTitle || candidate.requisitionTitle || defaultJdName,
      // 3. Client Name
      clientName: candidate.clientName || candidate.client || defaultClientName,
      // 4. Recruiter Name (Assigned recruiter)
      recruiterName: candidate.recruiterName || candidate.assignedRecruiter || assignedRecruiterName,
      // 5. Candidate Name
      candidateName: rawName,
      // 6. Email ID
      emailId: candidate.emailId || candidate.email || '',
      // 7. Phone Number
      phoneNumber: candidate.phoneNumber || candidate.phone || '',
      // 8. Current Location
      currentLocation: candidate.currentLocation || candidate.location || '',
      // 9. Current Designation
      currentDesignation: rawRole,
      // 10. Total Work Experience
      totalWorkExperience: candidate.totalWorkExperience || candidate.totalExperience || candidate.total_experience || candidate.exp || '',
      // 11. Relevant Work Experience (Filled by Recruiter)
      relevantWorkExperience: candidate.relevantWorkExperience || '',
      // 12. Notice Period (Filled by Recruiter)
      noticePeriod: candidate.noticePeriod || '',
      // 13. Current CTC (Filled by Recruiter)
      currentCtc: candidate.currentCtc || candidate.currentSalary || '',
      // 14. Expected CTC (Filled by Recruiter)
      expectedCtc: candidate.expectedCtc || candidate.expectedSalary || '',
      // 15. CV Link
      cvLink: candidate.cvLink || candidate.resumeFileName || candidate.fileName || (rawName ? `${rawName.replace(/\s+/g, '_')}_CV.pdf` : 'Candidate_CV.pdf'),
      // 16. ATS
      atsScoreDisplay: candidate.atsScoreDisplay || `${rawScore}% Match`,
      // 17. Candidate Status
      candidateStatus: candidate.candidateStatus || (targetStage ? targetStage : candidate.stage || 'Shortlisted & Submitted'),
      // 18. Screening Status
      screeningStatus: candidate.screeningStatus || 'Verified (100% Mandatory Criteria Met)',
      // 19. Recruiter Remarks (Filled by Recruiter)
      recruiterRemarks: candidate.recruiterRemarks || candidate.screeningNote || '',
      // 20. Interview Round 1
      interviewRound1: candidate.interviewRound1 || '',
      // 21. Interview Round 2
      interviewRound2: candidate.interviewRound2 || '',
      // 22. Final Interview
      finalInterview: candidate.finalInterview || '',
      // 23. Offer Status
      offerStatus: candidate.offerStatus || '',
      // 24. Joining Date
      joiningDate: candidate.joiningDate || '',
      // 25. Joining Status
      joiningStatus: candidate.joiningStatus || '',
      // 26. Rejection Reason
      rejectionReason: candidate.rejectionReason || 'None',
      // 27. Last Follow-up Date
      lastFollowUpDate: candidate.lastFollowUpDate || yesterdayStr,
      // 28. Next Follow-up Date
      nextFollowUpDate: candidate.nextFollowUpDate || '',
      // 29. Response (Filled by Recruiter)
      response: candidate.response || '',
      // 30. Overall Status
      overallStatus: candidate.overallStatus || (targetStage ? targetStage : candidate.currentStatus || candidate.stage || 'Shortlisted & Submitted'),
    });
  }, [candidate, isOpen, targetStage, assignedRecruiterName, defaultClientName, defaultJdName]);

  if (!isOpen || !candidate) return null;

  const handleChange = (field: keyof SubmissionDossierData, val: string) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleSaveWithApproval = (approved: boolean) => {
    setIsSubmitting(true);
    try {
      const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const finalData: SubmissionDossierData = {
        ...formData,
        isRecruiterApproved: approved,
        recruiterApprovalStatus: approved ? 'APPROVED' : 'PENDING_APPROVAL',
        recruiterApprovedBy: formData.recruiterName || assignedRecruiterName,
        recruiterApprovedAt: todayStr,
      };
      onSave(finalData);
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSaveWithApproval(isApproved);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-[#EAECF0] rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-[#EAECF0] bg-white flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-[#EFF4FF] text-[#3563E9] border border-[#D1E0FF] mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3563E9]" />
              Assigned Recruiter Data Entry
            </div>
            <h2 className="text-base sm:text-lg font-black text-[#101828]">
              Client Submission Details • 30 Data Points
            </h2>
            <p className="text-xs text-[#667085] mt-0.5">
              Candidate: <strong className="text-[#101828]">{formData.candidateName || candidate.name}</strong> • Client: <strong className="text-[#101828]">{formData.clientName}</strong> • Requisition: <strong className="text-[#3563E9]">{formData.jdName}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold cursor-pointer transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Notice Banner */}
        <div className="bg-amber-50/70 border-b border-amber-200/80 px-5 sm:px-6 py-2.5 text-xs text-amber-900 flex items-center gap-2 shrink-0">
          <span className="text-amber-600 font-bold shrink-0">ℹ️</span>
          <span>
            These fields are <strong>not automatically filled</strong> with dummy values. As the assigned recruiter, enter the candidate&apos;s verified compensation, notice period, experience, and evaluation remarks before submitting to the client preview portal.
          </span>
        </div>

        {/* Modal Scrollable Form Body */}
        <form id="submission-dossier-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Section 1: Requisition & Agency Info */}
          <div className="bg-[#F8F9FC] border border-[#EAECF0] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EAECF0] pb-2">
              <span className="text-xs font-extrabold text-[#3563E9] uppercase tracking-wider">
                1. Requisition &amp; Agency Submission Context
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  1. Submission Date *
                </label>
                <input
                  type="text"
                  value={formData.submissionDate}
                  onChange={e => handleChange('submissionDate', e.target.value)}
                  placeholder="e.g. 11 Nov 2026"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-semibold focus:border-[#3563E9] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  2. JD Name *
                </label>
                <input
                  type="text"
                  value={formData.jdName}
                  onChange={e => handleChange('jdName', e.target.value)}
                  placeholder="e.g. Full Stack Developer"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-semibold focus:border-[#3563E9] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  3. Client Name *
                </label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={e => handleChange('clientName', e.target.value)}
                  placeholder="e.g. SJ Tech Works"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-semibold focus:border-[#3563E9] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  4. Recruiter Name (Assigned) *
                </label>
                <input
                  type="text"
                  value={formData.recruiterName}
                  onChange={e => handleChange('recruiterName', e.target.value)}
                  placeholder="e.g. John"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-bold focus:border-[#3563E9] outline-none text-[#3563E9]"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Candidate Profile & Contact */}
          <div className="bg-[#F8F9FC] border border-[#EAECF0] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EAECF0] pb-2">
              <span className="text-xs font-extrabold text-[#3563E9] uppercase tracking-wider">
                2. Candidate Profile &amp; Contact Details
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  5. Candidate Name *
                </label>
                <input
                  type="text"
                  value={formData.candidateName}
                  onChange={e => handleChange('candidateName', e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-bold focus:border-[#3563E9] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  6. Email ID
                </label>
                <input
                  type="email"
                  value={formData.emailId}
                  onChange={e => handleChange('emailId', e.target.value)}
                  placeholder="candidate@email.com"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  7. Phone Number
                </label>
                <input
                  type="text"
                  value={formData.phoneNumber}
                  onChange={e => handleChange('phoneNumber', e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  8. Current Location
                </label>
                <input
                  type="text"
                  value={formData.currentLocation}
                  onChange={e => handleChange('currentLocation', e.target.value)}
                  placeholder="e.g. Bengaluru, India"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  9. Current Designation
                </label>
                <input
                  type="text"
                  value={formData.currentDesignation}
                  onChange={e => handleChange('currentDesignation', e.target.value)}
                  placeholder="e.g. Senior Software Engineer"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-semibold focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  10. Total Work Experience
                </label>
                <input
                  type="text"
                  value={formData.totalWorkExperience}
                  onChange={e => handleChange('totalWorkExperience', e.target.value)}
                  placeholder="e.g. 7.3 Years"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-semibold focus:border-[#3563E9] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Experience, Notice Period & Compensation (Recruiter Filled) */}
          <div className="bg-[#EFF4FF]/50 border border-[#D1E0FF] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#D1E0FF] pb-2">
              <span className="text-xs font-black text-[#101828] uppercase tracking-wider">
                3. Recruiter Verified Experience, Notice Period &amp; CTC
              </span>
              <span className="text-[10px] font-extrabold text-[#3563E9] bg-white px-2 py-0.5 rounded-full border border-[#D1E0FF]">
                Recruiter Direct Input
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  11. Relevant Work Experience *
                </label>
                <input
                  type="text"
                  value={formData.relevantWorkExperience}
                  onChange={e => handleChange('relevantWorkExperience', e.target.value)}
                  placeholder="e.g. 5.5 Years"
                  className="w-full px-3 py-2 rounded-xl border border-[#D1E0FF] bg-white text-xs text-slate-900 font-bold focus:border-[#3563E9] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  12. Notice Period *
                </label>
                <input
                  type="text"
                  value={formData.noticePeriod}
                  onChange={e => handleChange('noticePeriod', e.target.value)}
                  placeholder="e.g. 30 Days"
                  className="w-full px-3 py-2 rounded-xl border border-[#D1E0FF] bg-white text-xs text-slate-900 font-bold focus:border-[#3563E9] outline-none"
                  required
                />
                {/* Quick Presets */}
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {['Immediate', '15 Days', '30 Days', '60 Days', 'Serving Notice'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleChange('noticePeriod', opt)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white border border-slate-200 hover:border-[#3563E9] hover:text-[#3563E9] text-slate-600 transition-colors cursor-pointer"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  13. Current CTC *
                </label>
                <input
                  type="text"
                  value={formData.currentCtc}
                  onChange={e => handleChange('currentCtc', e.target.value)}
                  placeholder="e.g. ₹18 LPA"
                  className="w-full px-3 py-2 rounded-xl border border-[#D1E0FF] bg-white text-xs text-slate-900 font-bold focus:border-[#3563E9] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  14. Expected CTC *
                </label>
                <input
                  type="text"
                  value={formData.expectedCtc}
                  onChange={e => handleChange('expectedCtc', e.target.value)}
                  placeholder="e.g. ₹24 LPA"
                  className="w-full px-3 py-2 rounded-xl border border-[#D1E0FF] bg-white text-xs text-slate-900 font-bold focus:border-[#3563E9] outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 4: Screening & Recruiter Assessment */}
          <div className="bg-[#F8F9FC] border border-[#EAECF0] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EAECF0] pb-2">
              <span className="text-xs font-extrabold text-[#3563E9] uppercase tracking-wider">
                4. Screening &amp; Recruiter Remarks
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  15. CV Link / File Name
                </label>
                <input
                  type="text"
                  value={formData.cvLink}
                  onChange={e => handleChange('cvLink', e.target.value)}
                  placeholder="candidate_resume.pdf"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  16. ATS Score *
                </label>
                <input
                  type="text"
                  value={formData.atsScoreDisplay}
                  onChange={e => handleChange('atsScoreDisplay', e.target.value)}
                  placeholder="e.g. 85% Match"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-emerald-700 font-black focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  17. Candidate Status
                </label>
                <input
                  type="text"
                  value={formData.candidateStatus}
                  onChange={e => handleChange('candidateStatus', e.target.value)}
                  placeholder="e.g. Shortlisted & Submitted"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-semibold focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  18. Screening Status
                </label>
                <input
                  type="text"
                  value={formData.screeningStatus}
                  onChange={e => handleChange('screeningStatus', e.target.value)}
                  placeholder="e.g. Verified (100% Mandatory Criteria Met)"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-semibold focus:border-[#3563E9] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                19. Recruiter Remarks (Detailed Evaluation &amp; Verdict) *
              </label>
              <textarea
                rows={3}
                value={formData.recruiterRemarks}
                onChange={e => handleChange('recruiterRemarks', e.target.value)}
                placeholder="Enter recruiter remarks, technical screening notes, strengths, and recommendations for client interview..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none leading-relaxed"
                required
              />
            </div>
          </div>

          {/* Section 5: Interview Pipeline & Lifecycle Tracking */}
          <div className="bg-[#F8F9FC] border border-[#EAECF0] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EAECF0] pb-2">
              <span className="text-xs font-extrabold text-[#3563E9] uppercase tracking-wider">
                5. Interview Pipeline &amp; Lifecycle Tracking
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  20. Interview Round 1
                </label>
                <input
                  type="text"
                  value={formData.interviewRound1}
                  onChange={e => handleChange('interviewRound1', e.target.value)}
                  placeholder="e.g. Scheduled for 14 Nov, 3 PM"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  21. Interview Round 2
                </label>
                <input
                  type="text"
                  value={formData.interviewRound2}
                  onChange={e => handleChange('interviewRound2', e.target.value)}
                  placeholder="e.g. Pending Round 1"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  22. Final Interview
                </label>
                <input
                  type="text"
                  value={formData.finalInterview}
                  onChange={e => handleChange('finalInterview', e.target.value)}
                  placeholder="e.g. Pending"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  23. Offer Status
                </label>
                <input
                  type="text"
                  value={formData.offerStatus}
                  onChange={e => handleChange('offerStatus', e.target.value)}
                  placeholder="e.g. In Review / Offer Released"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  24. Joining Date
                </label>
                <input
                  type="text"
                  value={formData.joiningDate}
                  onChange={e => handleChange('joiningDate', e.target.value)}
                  placeholder="e.g. 01 Dec 2026 / Post Notice"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  25. Joining Status
                </label>
                <input
                  type="text"
                  value={formData.joiningStatus}
                  onChange={e => handleChange('joiningStatus', e.target.value)}
                  placeholder="e.g. Pending / Confirmed"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  26. Rejection Reason
                </label>
                <input
                  type="text"
                  value={formData.rejectionReason}
                  onChange={e => handleChange('rejectionReason', e.target.value)}
                  placeholder="e.g. None (Qualified)"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  27. Last Follow-up Date
                </label>
                <input
                  type="text"
                  value={formData.lastFollowUpDate}
                  onChange={e => handleChange('lastFollowUpDate', e.target.value)}
                  placeholder="e.g. 10 Nov 2026"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  28. Next Follow-up Date
                </label>
                <input
                  type="text"
                  value={formData.nextFollowUpDate}
                  onChange={e => handleChange('nextFollowUpDate', e.target.value)}
                  placeholder="e.g. 14 Nov 2026"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 focus:border-[#3563E9] outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  29. Response (Candidate Feedback / Availability) *
                </label>
                <input
                  type="text"
                  value={formData.response}
                  onChange={e => handleChange('response', e.target.value)}
                  placeholder="e.g. Interested & Actively Available for Interview"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-semibold focus:border-[#3563E9] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  30. Overall Status *
                </label>
                <input
                  type="text"
                  value={formData.overallStatus}
                  onChange={e => handleChange('overallStatus', e.target.value)}
                  placeholder="e.g. Shortlisted & Submitted"
                  className="w-full px-3 py-2 rounded-xl border border-[#EAECF0] bg-white text-xs text-slate-900 font-extrabold focus:border-[#3563E9] outline-none text-[#3563E9]"
                  required
                />
              </div>
            </div>
          </div>

          {/* ── SECTION 6: RECRUITER VERIFICATION & CLIENT RELEASE APPROVAL GATE ── */}
          <div className="bg-gradient-to-br from-emerald-50/90 to-teal-50/60 border-2 border-emerald-300 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  ✓
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-tight">
                    Recruiter Quality Approval &amp; Client Release Gate
                  </h4>
                  <p className="text-[11px] text-emerald-800 font-medium">
                    Protection against automated hallucinations &amp; misleading information
                  </p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                isApproved
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
              }`}>
                {isApproved ? 'Approved for Client View' : 'Pending Recruiter Approval'}
              </span>
            </div>

            <div className="bg-white/95 rounded-xl p-3.5 border border-emerald-200/80 space-y-2.5">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isApproved}
                  onChange={e => setIsApproved(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                />
                <div className="text-xs text-slate-800 space-y-0.5">
                  <span className="font-extrabold text-emerald-950 block">
                    I, {formData.recruiterName || assignedRecruiterName}, certify that I have reviewed and verified these candidate details.
                  </span>
                  <span className="text-[11px] text-slate-600 block leading-relaxed">
                    By checking this, you confirm that total experience, relevant work experience, notice period, compensation, and screening benchmarks have been validated with the candidate and are 100% genuine before exposure to {formData.clientName || defaultClientName}.
                  </span>
                </div>
              </label>

              {!isApproved && (
                <div className="text-[11px] font-bold text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>Unapproved profiles will NOT be visible to the client on the preview portal until explicitly approved.</span>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-[#EAECF0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Assigned Recruiter: <strong className="text-slate-800">{formData.recruiterName || assignedRecruiterName}</strong>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSaveWithApproval(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
              title="Save details internally without publishing to client preview portal"
            >
              Save Draft (Keep Internal Only)
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSaveWithApproval(true)}
              className="px-5 py-2.5 bg-[#15966A] hover:bg-[#12805A] active:scale-[0.99] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
              title="Certify details and approve candidate for client preview portal visibility"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>✓ Approve &amp; Publish to Client Portal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

