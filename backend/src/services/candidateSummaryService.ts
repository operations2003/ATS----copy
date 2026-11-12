import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { Response } from 'express';
import prisma from '../config/prisma';
import { understandJobDescriptionWithGemini, PRIMARY_GEMINI_MODEL, FALLBACK_GEMINI_MODEL } from './geminiService';

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

/**
 * Cleanly extract text or default
 */
const cleanVal = (val?: string | null, fallback = 'Not available in resume'): string => {
  if (!val || !val.trim() || val.trim().toLowerCase() === 'null' || val.trim().toLowerCase() === 'undefined') {
    return fallback;
  }
  return val.trim();
};

const isUuid = (val?: string): boolean => {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
};

/**
 * Fetch candidate and related evaluation / job records
 */
async function fetchCandidateAndJobContext(candidateId: string, jobId?: string, userOrgId?: string, isSuperAdmin = false) {
  const candidateIdStr = String(candidateId || '').trim();
  const jobIdStr = jobId ? String(jobId).trim() : undefined;
  if (!candidateIdStr) return null;

  let candidate: any = null;

  if (isUuid(candidateIdStr)) {
    const isJobUuid = isUuid(jobIdStr);
    try {
      candidate = await prisma.candidate.findUnique({
        where: { id: candidateIdStr },
        include: {
          experiences: { orderBy: { created_at: 'asc' } },
          education: { orderBy: { created_at: 'asc' } },
          skills: true,
          projects: true,
          certifications: true,
          job: {
            include: {
              requirements: true
            }
          },
          evaluations: {
            where: isJobUuid ? { jobId: jobIdStr } : undefined,
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              job: {
                include: {
                  requirements: true
                }
              }
            }
          }
        }
      });
    } catch (dbErr) {
      console.warn('[Candidate Summary] Candidate DB lookup error:', dbErr);
    }
  }

  // Fallback to memory store, persistent pool, or global store
  if (!candidate) {
    try {
      const { findCandidateRecord, CANDIDATE_STORE, GLOBAL_CANDIDATES } = require('../controllers/candidateController');
      let candRecord = await findCandidateRecord(candidateIdStr, jobIdStr, userOrgId);

      if (!candRecord) {
        candRecord = GLOBAL_CANDIDATES.get(candidateIdStr);
      }
      if (!candRecord && jobIdStr && CANDIDATE_STORE.has(jobIdStr)) {
        candRecord = CANDIDATE_STORE.get(jobIdStr)?.find((c: any) => c.id === candidateIdStr);
      }
      if (!candRecord) {
        for (const list of CANDIDATE_STORE.values()) {
          const matched = list.find((c: any) => c.id === candidateIdStr);
          if (matched) {
            candRecord = matched;
            break;
          }
        }
      }

      // Check persistent pool file
      if (!candRecord) {
        try {
          const fs = require('fs');
          const path = require('path');
          const poolFile = path.resolve(process.cwd(), 'data', 'candidates_pool.json');
          if (fs.existsSync(poolFile)) {
            const poolList = JSON.parse(fs.readFileSync(poolFile, 'utf-8'));
            if (Array.isArray(poolList)) {
              candRecord = poolList.find((c: any) => c.id === candidateIdStr);
            }
          }
        } catch {}
      }

      if (candRecord) {
        candidate = {
          id: candRecord.id,
          name: candRecord.name,
          email: candRecord.email,
          phone: candRecord.phone,
          location: candRecord.location,
          current_title: candRecord.currentTitle || (candRecord as any).current_title,
          current_company: candRecord.currentCompany || (candRecord as any).current_company,
          total_experience: candRecord.totalExperience || (candRecord as any).total_experience || candRecord.exp,
          organizationId: candRecord.organizationId || 'org-tasknera',
          job_id: candRecord.jobId,
          experiences: (candRecord.experience || (candRecord as any).experiences || []).map((e: any) => ({
            title: e.title || e.role || '',
            company: e.company || '',
            start_date: e.startDate || e.start_date || '',
            end_date: e.endDate || e.end_date || '',
            duration: e.duration || '',
            description: e.description || '',
          })),
          education: (candRecord.education || []).map((ed: any) => ({
            degree: ed.degree || '',
            institution: ed.institution || ed.school || '',
            field: ed.field || ed.major || '',
            start_year: ed.year || ed.start_year || '',
          })),
          skills: (candRecord.skills || []).map((s: any) => ({
            skill: typeof s === 'string' ? s : s.skill || s.skill_name || s.name || '',
          })),
          evaluations: candRecord.evaluation ? [candRecord.evaluation] : [],
        };
      }
    } catch (storeErr) {
      console.warn('[Candidate Summary] Candidate memory lookup error:', storeErr);
    }
  }

  if (!candidate) return null;

  // Multi-tenant check
  if (!isSuperAdmin && userOrgId) {
    const candidateOrg = candidate.organizationId || 'org-tasknera';
    if (candidateOrg !== userOrgId) return null;
  }

  // Determine relevant job and evaluation
  let targetJob: any = candidate.evaluations?.[0]?.job || candidate.job;
  if (!targetJob && jobIdStr) {
    if (isUuid(jobIdStr)) {
      try {
        targetJob = await prisma.job.findUnique({
          where: { id: jobIdStr },
          include: { requirements: true }
        });
      } catch (err) {
        console.warn('[Candidate Summary] Prisma job lookup error:', err);
      }
    }
    if (!targetJob) {
      try {
        const { GLOBAL_JOB_STORE } = require('../controllers/jobController');
        targetJob = GLOBAL_JOB_STORE.get(jobIdStr);
      } catch {}
    }
  }

  const targetEval = candidate.evaluations?.[0] || candidate.evaluation || null;

  return {
    candidate,
    targetJob,
    targetEval
  };
}

/**
 * Rule-based deterministic summary builder (Runs when AI is offline or as fast baseline)
 */
function buildDeterministicSummary(
  candidate: any,
  targetJob: any,
  targetEval: any,
  recruiterId?: string
): CandidateSummaryData {
  const atsScore = Math.round(targetEval?.score ?? targetEval?.atsScore ?? 0);
  const candName = cleanVal(candidate.name, 'Candidate');
  const jobTitle = targetJob?.position || 'Requisition Profile';
  const jobClient = targetJob?.client || 'Tasknera Client';
  const nowStr = new Date().toISOString();

  // Primary Skills
  const skillsList = candidate.skills?.map((s: any) => s.skill).filter(Boolean) || [];
  const primarySkills = skillsList.slice(0, 8);

  // Requirements matching from evaluation auditData
  const audit = (targetEval?.auditData as any) || {};
  const reqs = audit.requirements || targetJob?.requirements || [];

  const matchedSkills: SkillItem[] = [];
  const missingSkills: string[] = [];
  const preferredSkills: SkillItem[] = [];

  for (const r of reqs) {
    const reqText = r.requirement || r.name || '';
    const isMandatory = r.isMandatory ?? (r.category?.toLowerCase() === 'mandatory');
    const isMatched = r.status === 'FULLY MET' || r.status === 'MATCHED' || r.score >= 70;

    if (isMandatory) {
      if (isMatched) {
        matchedSkills.push({ name: reqText, evidence: r.evidence || 'Documented in candidate experience profile' });
      } else {
        missingSkills.push(reqText);
      }
    } else {
      if (isMatched) {
        preferredSkills.push({ name: reqText, evidence: r.evidence || 'Evidenced in CV keywords' });
      }
    }
  }

  // Work History mapping
  const roles: ExperienceRole[] = (candidate.experiences || []).map((exp: any) => ({
    title: exp.title || candidate.current_title || 'Professional Role',
    company: exp.company || candidate.current_company || 'Employer',
    period: exp.start_date ? `${exp.start_date} - ${exp.end_date || 'Present'}` : 'Employment Period Documented',
    responsibilities: exp.description ? [exp.description] : ['Responsibilities documented in uploaded resume'],
    technologies: primarySkills.slice(0, 4),
    achievements: []
  }));

  if (roles.length === 0 && (candidate.current_title || candidate.current_company)) {
    roles.push({
      title: cleanVal(candidate.current_title, 'Candidate Role'),
      company: cleanVal(candidate.current_company, 'Organization'),
      period: 'Recent Employment History',
      responsibilities: ['Managed core operational responsibilities as documented in resume.'],
      technologies: primarySkills.slice(0, 4),
      achievements: []
    });
  }

  // Pros / Strengths (4-6)
  const pros: string[] = [];
  if (primarySkills.length > 0) {
    pros.push(`Demonstrated proficiency in core technical domains: ${primarySkills.slice(0, 3).join(', ')}.`);
  }
  if (candidate.total_experience) {
    pros.push(`Solid professional background with documented ${candidate.total_experience} total industry tenure.`);
  }
  if (matchedSkills.length > 0) {
    pros.push(`Satisfies key technical requirements for ${jobTitle} (${matchedSkills.slice(0, 2).map(m => m.name).join(', ')}).`);
  }
  if (candidate.education?.length > 0) {
    const highestEd = candidate.education[0];
    pros.push(`Holds relevant academic qualification (${highestEd.degree || 'Degree'} from ${highestEd.institution || 'Accredited Institution'}).`);
  }
  if (candidate.current_company) {
    pros.push(`Direct enterprise experience at ${candidate.current_company}.`);
  }
  while (pros.length < 4) {
    pros.push(`Documented ATS qualification match supported by resume submission.`);
  }

  // Cons / Potential Gaps (3-5)
  const cons: string[] = [];
  if (missingSkills.length > 0) {
    cons.push(`Mandatory requirement(s) requiring verification: ${missingSkills.slice(0, 3).join(', ')}.`);
  } else {
    cons.push(`Specific depth of advanced architectural experience should be validated during technical interview.`);
  }
  cons.push(`Notice period, current compensation, and relocation flexibility not explicitly detailed in submitted CV.`);
  cons.push(`Hands-on production troubleshooting scale requires verification with candidate.`);

  // Projects
  const projects: ProjectItem[] = (candidate.projects || []).map((p: any) => ({
    name: p.name || 'Enterprise Project Engagement',
    purpose: p.description || 'System development and maintenance initiative',
    role: candidate.current_title || 'Technical Specialist',
    technologies: Array.isArray(p.technologies) ? p.technologies : primarySkills.slice(0, 3),
    contributions: p.description || 'Engineered project deliverables according to technical specifications.',
    outcomes: 'Delivered in production environment.'
  }));

  // Education
  const education: EducationItem[] = (candidate.education || []).map((e: any) => ({
    degree: e.degree || e.field || 'Relevant Qualification',
    institution: cleanVal(e.institution, 'Institution documented in CV'),
    year: e.end_year ? String(e.end_year) : 'Graduated',
    certifications: (candidate.certifications || []).map((c: any) => c.certification || c.name)
  }));

  // Interview Questions
  const interviewQuestions: InterviewQuestion[] = [
    {
      question: `Could you walk us through your most technically complex project involving ${primarySkills[0] || 'your core skills'}?`,
      category: 'Technical',
      whatToVerify: 'Hands-on architectural depth, role ownership, and practical execution capability.'
    },
    {
      question: `How have you collaborated with cross-functional teams in your role at ${candidate.current_company || 'your previous employer'}?`,
      category: 'Project Validation',
      whatToVerify: 'Team communication, agile methodology adherence, and delivery accountability.'
    },
    ...(missingSkills.slice(0, 2).map(skill => ({
      question: `What experience or exposure do you have working with ${skill}, even if not prominently highlighted in your CV?`,
      category: 'Mandatory Skill Check' as const,
      whatToVerify: `Validate whether the candidate possesses unlisted knowledge or fast-ramp capability in ${skill}.`
    }))),
    {
      question: `Describe a challenging production incident or system bottleneck you diagnosed and resolved under tight deadlines.`,
      category: 'Scenario',
      whatToVerify: 'Root cause analysis approach, debugging methodology, and composure under pressure.'
    }
  ];

  // Assessment Classification
  let classification: 'Strong Match' | 'Potential Match' | 'Low Evidence of Match' = 'Potential Match';
  let suggestedNextStep: 'Shortlist for Interview' | 'Recruiter Review Required' | 'Not Recommended for This JD' = 'Recruiter Review Required';

  if (atsScore >= 75) {
    classification = 'Strong Match';
    suggestedNextStep = 'Shortlist for Interview';
  } else if (atsScore < 50) {
    classification = 'Low Evidence of Match';
    suggestedNextStep = 'Not Recommended for This JD';
  }

  const professionalSummary = `${candName} is an experienced professional presenting with ${cleanVal(candidate.total_experience, 'documented')} background in ${cleanVal(candidate.current_title, 'technical engineering')}. Possessing practical expertise in ${primarySkills.slice(0, 4).join(', ') || 'industry competencies'}, the candidate demonstrates aligned background for the ${jobTitle} opening with ${jobClient}. Evaluated at an ATS match score of ${atsScore}%, key strengths encompass documented enterprise experience and aligned qualification background.`;

  return {
    candidateId: candidate.id,
    jobId: targetJob?.id,
    jobTitle,
    jobClient,
    atsScore,
    overview: {
      fullName: candName,
      email: cleanVal(candidate.email),
      phone: cleanVal(candidate.phone),
      location: cleanVal(candidate.location),
      currentDesignation: cleanVal(candidate.current_title),
      currentCompany: cleanVal(candidate.current_company),
      totalExperience: cleanVal(candidate.total_experience),
      relevantExperience: cleanVal(candidate.total_experience),
      highestQualification: education[0]?.degree || 'Professional Qualification Documented',
      primarySkills,
      noticePeriod: 'Not available in resume',
      expectedSalary: 'Not available in resume',
      resumeFileName: candidate.resume_file_url || `${candName.replace(/\s+/g, '_')}_CV.pdf`,
      generatedAt: nowStr
    },
    professionalSummary,
    experienceAnalysis: {
      totalExperience: cleanVal(candidate.total_experience),
      relevantExperience: cleanVal(candidate.total_experience),
      roles
    },
    keySkills: {
      requiredSkillsFound: matchedSkills,
      preferredSkillsFound: preferredSkills,
      additionalRelevantSkills: skillsList.filter((s: string) => !matchedSkills.some(m => m.name.toLowerCase() === s.toLowerCase())).slice(0, 6),
      requiredSkillsNotFound: missingSkills,
      skillsRequiringVerification: missingSkills.slice(0, 3).map(s => ({ name: s, reason: 'Not explicitly documented in submitted resume text.' }))
    },
    pros,
    cons,
    jdMatchAnalysis: {
      atsScore,
      jobTitle,
      requiredSkillsMatched: matchedSkills.map(m => m.name),
      requiredSkillsNotEvidenced: missingSkills,
      preferredSkillsMatched: preferredSkills.map(m => m.name),
      experienceComparison: `Candidate displays ${cleanVal(candidate.total_experience, 'experience')} against ${jobTitle} requisition scope.`,
      educationMatched: education[0]?.degree ? `Academic requirement aligned (${education[0].degree}).` : 'Academic profile requires confirmation.',
      suitabilityExplanation: `Candidate presents an overall ATS alignment score of ${atsScore}%. Strengths include verified competency in ${primarySkills.slice(0, 3).join(', ')}.`
    },
    projects,
    education,
    interviewQuestions,
    finalAssessment: {
      classification,
      topReasons: [
        `Verified capability in primary competencies: ${primarySkills.slice(0, 3).join(', ')}.`,
        `Demonstrated tenure of ${cleanVal(candidate.total_experience, 'relevant experience')} in related domains.`,
        `Overall ATS scoring calibration evaluates at ${atsScore}% alignment.`
      ],
      mainConcerns: missingSkills.length > 0 ? [`Verification needed for unevidenced requirement(s): ${missingSkills.slice(0, 2).join(', ')}.`] : ['Validate notice period and expected compensation.'],
      suggestedNextStep,
      disclaimer: 'This assessment is an assistive recruitment tool grounded strictly in submitted CV and JD evidence. It does not constitute an automated hiring decision.'
    },
    metadata: {
      generatedAt: nowStr,
      generatedBy: recruiterId,
      sourceResumeFile: candidate.resume_file_url || `${candName}_Resume.pdf`,
      aiModel: 'Deterministic ATS Engine',
      isCached: false
    }
  };
}

/**
 * Generate Candidate Summary using Gemini with Fallback
 */
export async function generateOrGetCandidateSummary(
  candidateId: string,
  jobId?: string,
  userOrgId?: string,
  recruiterId?: string,
  isSuperAdmin = false,
  forceRegenerate = false
): Promise<CandidateSummaryData | null> {
  const context = await fetchCandidateAndJobContext(candidateId, jobId, userOrgId, isSuperAdmin);
  if (!context) return null;

  const { candidate, targetJob, targetEval } = context;

  // 1. Check if cached summary exists in evaluation auditData
  const audit = (targetEval?.auditData as any) || {};
  if (!forceRegenerate && audit.executiveSummary && typeof audit.executiveSummary === 'object') {
    return {
      ...(audit.executiveSummary as CandidateSummaryData),
      metadata: {
        ...(audit.executiveSummary.metadata || {}),
        isCached: true
      }
    };
  }

  // 2. Build baseline deterministic summary
  const baseline = buildDeterministicSummary(candidate, targetJob, targetEval, recruiterId);

  // 3. Attempt Gemini Enhancement if API key is configured
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (apiKey && (candidate.raw_text || targetJob?.jd_text)) {
    try {
      const prompt = `You are a Senior Talent Acquisition Executive. Generate a factual, strictly evidence-grounded Executive Candidate Summary for this candidate against the specified Job Description.

STRICT ACCURACY RULES:
1. NEVER hallucinate employers, degree titles, skills, or metrics not evidenced in the CV.
2. If notice period, salary, or contact details are missing, use "Not available in resume".
3. Do not modify the existing official ATS Score: ${baseline.atsScore}%.
4. Professional Summary must be 80-150 words.
5. Provide 4-6 concise Pros (Strengths) and 3-5 Potential Gaps & Verification Points.
6. Provide 5-8 role-specific Interview Questions with what to verify.
7. Return ONLY clean JSON matching this exact structure:
{
  "professionalSummary": "...",
  "pros": ["..."],
  "cons": ["..."],
  "interviewQuestions": [
    { "question": "...", "category": "Technical", "whatToVerify": "..." }
  ],
  "topReasons": ["..."],
  "mainConcerns": ["..."]
}

--- CANDIDATE RESUME EXCERPT ---
Name: ${candidate.name}
Title: ${candidate.current_title}
Company: ${candidate.current_company}
Experience: ${candidate.total_experience}
Skills: ${(candidate.skills || []).map((s: any) => s.skill).join(', ')}
Resume Text: ${(candidate.raw_text || '').substring(0, 4000)}

--- JOB DESCRIPTION ---
Title: ${targetJob?.position || 'Requisition'}
Client: ${targetJob?.client || 'Tasknera'}
JD Text: ${(targetJob?.jd_text || '').substring(0, 3000)}
--- END INPUTS ---`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_GEMINI_MODEL}:generateContent?key=${apiKey}`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
        })
      });

      if (geminiRes.ok) {
        const jsonRes: any = await geminiRes.json();
        const text = jsonRes?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed.professionalSummary) baseline.professionalSummary = parsed.professionalSummary;
          if (Array.isArray(parsed.pros) && parsed.pros.length >= 3) baseline.pros = parsed.pros;
          if (Array.isArray(parsed.cons) && parsed.cons.length >= 2) baseline.cons = parsed.cons;
          if (Array.isArray(parsed.interviewQuestions) && parsed.interviewQuestions.length >= 3) {
            baseline.interviewQuestions = parsed.interviewQuestions;
          }
          if (Array.isArray(parsed.topReasons)) baseline.finalAssessment.topReasons = parsed.topReasons;
          if (Array.isArray(parsed.mainConcerns)) baseline.finalAssessment.mainConcerns = parsed.mainConcerns;
          baseline.metadata.aiModel = PRIMARY_GEMINI_MODEL;
        }
      }
    } catch (aiErr: any) {
      console.warn('[Candidate Summary AI Notice]: Falling back to deterministic summary:', aiErr?.message || aiErr);
    }
  }

  // 4. Cache summary in Evaluation.auditData if evaluation exists
  if (targetEval?.id) {
    try {
      const updatedAudit = { ...audit, executiveSummary: baseline };
      await prisma.evaluation.update({
        where: { id: targetEval.id },
        data: { auditData: updatedAudit }
      });
    } catch (cacheErr) {
      console.warn('[Candidate Summary Cache Notice]: Could not persist to evaluation:', cacheErr);
    }
  }

  return baseline;
}

/**
 * Generate PDF stream using PDFKit
 */
export function streamCandidateSummaryPdf(summary: CandidateSummaryData, res: Response): void {
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    bufferPages: true
  });

  const filename = `Candidate_Summary_${summary.overview.fullName.replace(/\s+/g, '_')}_${summary.jobTitle?.replace(/\s+/g, '_') || 'Profile'}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  doc.pipe(res);

  const primaryColor = '#0F172A'; // Slate-900
  const orangeColor = '#EA580C';  // Brand Orange
  const grayText = '#475569';      // Slate-600
  const lightBg = '#F8FAFC';       // Slate-50
  const borderColor = '#E2E8F0';   // Slate-200

      // ── HEADER BRANDING ──
  doc.rect(40, 40, doc.page.width - 80, 5).fill(orangeColor);
  doc.moveDown(0.8);

  doc.fontSize(18).fillColor(primaryColor).font('Helvetica-Bold').text('EXECUTIVE CANDIDATE EVALUATION REPORT', 40, 55);
  doc.fontSize(9).fillColor(orangeColor).font('Helvetica-Bold').text('TASKNERA ATS • EVIDENCE-GROUNDED CANDIDATE SUMMARY', 40, 78, { characterSpacing: 1 });

  // ── CANDIDATE OVERVIEW & ATS SCORE CARD ──
  const cardTop = 98;
  doc.roundedRect(40, cardTop, doc.page.width - 80, 95, 8).fillAndStroke(lightBg, borderColor);

  // Left column: Candidate details
  doc.fillColor(primaryColor).fontSize(14).font('Helvetica-Bold').text(summary.overview.fullName, 55, cardTop + 14);
  doc.fontSize(9).font('Helvetica').fillColor(grayText);
  doc.text(`Target Requisition: ${summary.jobTitle || 'Active Pool'} (${summary.jobClient || 'Client'})`, 55, cardTop + 34);
  doc.text(`Location: ${summary.overview.location} • Experience: ${summary.overview.totalExperience}`, 55, cardTop + 48);
  doc.text(`Current: ${summary.overview.currentDesignation} at ${summary.overview.currentCompany}`, 55, cardTop + 62);
  doc.text(`Contact: ${summary.overview.email} | ${summary.overview.phone}`, 55, cardTop + 76);

  // Right column: Prominent ATS Score Gauge
  const scoreBoxX = doc.page.width - 150;
  doc.roundedRect(scoreBoxX, cardTop + 12, 95, 70, 6).fill(primaryColor);
  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica-Bold').text('ATS MATCH SCORE', scoreBoxX + 8, cardTop + 22, { width: 80, align: 'center' });
  doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text(`${summary.atsScore}%`, scoreBoxX + 8, cardTop + 36, { width: 80, align: 'center' });
  
  const fitColor = summary.atsScore >= 70 ? '#34D399' : summary.atsScore >= 50 ? '#FBBF24' : '#F87171';
  doc.fillColor(fitColor).fontSize(8).font('Helvetica-Bold').text(summary.finalAssessment.classification.toUpperCase(), scoreBoxX + 8, cardTop + 64, { width: 80, align: 'center' });

  doc.y = cardTop + 105;

  // ── SECTION 1: PROFESSIONAL SUMMARY ──
  doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('1. PROFESSIONAL SUMMARY', 40, doc.y);
  const sumY = doc.y + 4;
  const sumHeight = Math.max(65, doc.heightOfString(summary.professionalSummary, { width: doc.page.width - 100, lineGap: 3 }) + 16);
  doc.roundedRect(40, sumY, doc.page.width - 80, sumHeight, 6).fillAndStroke('#FFFFFF', borderColor);
  doc.fillColor(grayText).fontSize(8.5).font('Helvetica').text(summary.professionalSummary, 50, sumY + 10, {
    width: doc.page.width - 100,
    lineGap: 3
  });
  doc.y = sumY + sumHeight + 14;

  // ── SECTION 2 & 3: PROS & GAPS (TWO COLUMNS) ──
  const splitY = doc.y;
  const colWidth = (doc.page.width - 90) / 2;

  // Pros Column
  doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('2. KEY STRENGTHS & EVIDENCE', 40, splitY);
  let prosY = splitY + 18;
  (summary.pros || []).slice(0, 4).forEach((pro) => {
    doc.circle(46, prosY + 4, 2.5).fill(orangeColor);
    doc.fillColor(grayText).fontSize(8).font('Helvetica').text(pro, 55, prosY, { width: colWidth - 25, lineGap: 2 });
    prosY = doc.y + 6;
  });

  // Cons / Gaps Column
  const rightColX = 40 + colWidth + 10;
  doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('3. POTENTIAL GAPS & VERIFICATION', rightColX, splitY);
  let consY = splitY + 18;
  (summary.cons || []).slice(0, 4).forEach((con) => {
    doc.circle(rightColX + 6, consY + 4, 2.5).fill('#DC2626');
    doc.fillColor(grayText).fontSize(8).font('Helvetica').text(con, rightColX + 16, consY, { width: colWidth - 25, lineGap: 2 });
    consY = doc.y + 6;
  });

  doc.y = Math.max(prosY, consY) + 12;

  // ── SECTION 4: KEY SKILLS BREAKDOWN ──
  if (doc.y > 660) doc.addPage();
  doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('4. REQUISITION SKILLS MATRIX', 40, doc.y);
  doc.moveDown(0.4);

  const matchedSkillsText = (summary.keySkills?.requiredSkillsFound || []).map((s) => s.name).join(', ') || 'Aligned through relevant experience';
  const missingSkillsText = (summary.keySkills?.requiredSkillsNotFound || []).join(', ') || 'None identified';
  const additionalSkillsText = (summary.keySkills?.additionalRelevantSkills || []).join(', ') || 'Standard tech stack';

  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor).text('Required Skills Evidenced: ', 45, doc.y, { continued: true });
  doc.font('Helvetica').fillColor('#15803D').text(matchedSkillsText);
  doc.moveDown(0.3);

  doc.font('Helvetica-Bold').fillColor(primaryColor).text('Missing / Unverified Skills: ', 45, doc.y, { continued: true });
  doc.font('Helvetica').fillColor('#B91C1C').text(missingSkillsText);
  doc.moveDown(0.3);

  doc.font('Helvetica-Bold').fillColor(primaryColor).text('Additional Candidate Skills: ', 45, doc.y, { continued: true });
  doc.font('Helvetica').fillColor(grayText).text(additionalSkillsText);
  doc.moveDown(0.8);

  // ── SECTION 5: INTERVIEW QUESTIONS ──
  if (doc.y > 620) doc.addPage();
  doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('5. ROLE-SPECIFIC INTERVIEW QUESTIONS FOR RECRUITER', 40, doc.y);
  doc.moveDown(0.5);

  (summary.interviewQuestions || []).slice(0, 5).forEach((q, idx) => {
    if (doc.y > 720) doc.addPage();
    doc.fillColor(primaryColor).fontSize(8.5).font('Helvetica-Bold').text(`Q${idx + 1} (${q.category}): `, 45, doc.y, { continued: true });
    doc.font('Helvetica').fillColor(primaryColor).text(q.question);
    doc.fontSize(7.5).font('Helvetica-Oblique').fillColor(grayText).text(`Verification Focus: ${q.whatToVerify}`, 55, doc.y + 2, { lineGap: 1 });
    doc.moveDown(0.5);
  });

  // ── SECTION 6: FINAL ASSESSMENT & NEXT STEP ──
  if (doc.y > 680) doc.addPage();
  doc.moveDown(0.6);
  const assessTop = doc.y;
  doc.roundedRect(40, assessTop, doc.page.width - 80, 65, 6).fillAndStroke(lightBg, borderColor);

  doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('6. FINAL RECRUITER ASSESSMENT', 50, assessTop + 10);
  doc.fontSize(8.5).font('Helvetica').fillColor(grayText);
  doc.text(`Classification: ${summary.finalAssessment?.classification || 'Assessed'} | Suggested Action: `, 50, assessTop + 24, { continued: true });
  doc.font('Helvetica-Bold').fillColor(orangeColor).text(summary.finalAssessment?.suggestedNextStep || 'Recruiter Review');
  
  doc.font('Helvetica').fontSize(7.5).fillColor(grayText).text(
    summary.finalAssessment?.disclaimer || 'Assistive recruitment evaluation strictly grounded in submitted evidence.',
    50,
    assessTop + 40,
    { width: doc.page.width - 100 }
  );

  // ── FOOTERS ON ALL PAGES ──
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const oldMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // Prevent auto-adding blank page
    doc.fontSize(7).fillColor('#94A3B8').text(
      `Tasknera ATS Report • Generated: ${new Date(summary.metadata?.generatedAt || Date.now()).toLocaleDateString()} • Page ${i + 1} of ${range.count} • Strictly Confidential`,
      40,
      doc.page.height - 25,
      { align: 'center', width: doc.page.width - 80, lineBreak: false }
    );
    doc.page.margins.bottom = oldMargin;
  }

  doc.end();
}

/**
 * Generate DOCX stream using `docx`
 */
export async function streamCandidateSummaryDocx(summary: CandidateSummaryData, res: Response): Promise<void> {
  const filename = `Candidate_Summary_${summary.overview.fullName.replace(/\s+/g, '_')}_${summary.jobTitle?.replace(/\s+/g, '_') || 'Profile'}.docx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'TASKNERA ATS • EXECUTIVE CANDIDATE EVALUATION REPORT',
            heading: HeadingLevel.TITLE
          }),
          new Paragraph({
            text: `Candidate: ${summary.overview.fullName} | Target Role: ${summary.jobTitle || 'Profile'} (${summary.jobClient || 'Client'})`,
            style: 'Subtitle'
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `ATS Match Score: ${summary.atsScore}%  |  Classification: ${summary.finalAssessment.classification}`, bold: true, color: 'EA580C' })
            ]
          }),
          new Paragraph({ text: '' }),

          new Paragraph({ text: '1. Professional Summary', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: summary.professionalSummary }),
          new Paragraph({ text: '' }),

          new Paragraph({ text: '2. Candidate Overview', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `• Total Experience: ${summary.overview.totalExperience}` }),
          new Paragraph({ text: `• Current Role: ${summary.overview.currentDesignation} at ${summary.overview.currentCompany}` }),
          new Paragraph({ text: `• Location: ${summary.overview.location}` }),
          new Paragraph({ text: `• Contact: ${summary.overview.email} | ${summary.overview.phone}` }),
          new Paragraph({ text: `• Highest Qualification: ${summary.overview.highestQualification}` }),
          new Paragraph({ text: '' }),

          new Paragraph({ text: '3. Key Strengths & Evidence', heading: HeadingLevel.HEADING_1 }),
          ...summary.pros.map(pro => new Paragraph({ text: `✓ ${pro}` })),
          new Paragraph({ text: '' }),

          new Paragraph({ text: '4. Potential Gaps & Verification Points', heading: HeadingLevel.HEADING_1 }),
          ...summary.cons.map(con => new Paragraph({ text: `• ${con}` })),
          new Paragraph({ text: '' }),

          new Paragraph({ text: '5. Interview Questions for Recruiter', heading: HeadingLevel.HEADING_1 }),
          ...summary.interviewQuestions.map((q, idx) => new Paragraph({
            children: [
              new TextRun({ text: `Q${idx + 1} (${q.category}): `, bold: true }),
              new TextRun({ text: q.question }),
              new TextRun({ text: ` (Verify: ${q.whatToVerify})`, italics: true, color: '64748B' })
            ]
          })),
          new Paragraph({ text: '' }),

          new Paragraph({ text: '6. Final Recruiter Assessment', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `Suggested Next Step: ${summary.finalAssessment.suggestedNextStep}` }),
          new Paragraph({ children: [new TextRun({ text: summary.finalAssessment.disclaimer, italics: true, color: '64748B' })] })
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  res.send(buffer);
}
