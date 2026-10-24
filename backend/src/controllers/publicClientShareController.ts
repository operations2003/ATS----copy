import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import prisma from '../config/prisma';
import { hashShareToken } from './clientShareController';

const ALLOWED_STATUSES = [
  'Shared with Client',
  'Interview Scheduled',
  'Interview Completed',
  'Selected',
  'Rejected',
  'Offered',
  'Offer Declined',
  'Joined',
  'On Hold',
];

/**
 * Sanitize text to prevent script or HTML injection
 */
const sanitizeText = (str: any): string => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '')
    .trim();
};

/**
 * Safely parse date or return null if invalid
 */
const parseSafeDate = (d: any): Date | null => {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Validates share token and returns share record if active and unexpired
 */
const validateActiveShare = async (token: string) => {
  if (!token || typeof token !== 'string') return null;

  const cleanToken = token.trim();
  const tokenHash = hashShareToken(cleanToken);

  const share = await prisma.clientCandidateShare.findFirst({
    where: {
      OR: [
        { tokenHash },
        { rawToken: cleanToken },
      ],
    },
    include: {
      job: true,
      items: {
        where: { isActive: true },
        select: { candidateId: true },
      },
    },
  });

  if (!share) return null;

  // Check revoked
  if (share.status !== 'active') {
    return { error: 'revoked', share };
  }

  // Check expired
  if (share.expiresAt && share.expiresAt < new Date()) {
    return { error: 'expired', share };
  }

  return { share };
};

/**
 * GET /api/public/client-shares/:token
 * Public endpoint for clients to view their assigned candidate shortlist
 */
export const getPublicClientShare = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const validation = await validateActiveShare(token);

    if (!validation) {
      res.status(404).json({
        error: 'Invalid or unknown candidate sharing link. Please contact the recruiter.',
      });
      return;
    }

    if (validation.error === 'revoked') {
      res.status(403).json({
        error: 'This candidate sharing link has been revoked by the recruitment team.',
      });
      return;
    }

    if (validation.error === 'expired') {
      res.status(410).json({
        error: 'This candidate sharing link has expired. Please request a new link from the recruiter.',
      });
      return;
    }

    const { share } = validation;

    // Async record last accessed timestamp
    prisma.clientCandidateShare
      .update({
        where: { id: share.id },
        data: { lastAccessedAt: new Date() },
      })
      .catch(() => {});

    // Retrieve active candidate IDs in this share
    const candidateIds = share.items.map(item => item.candidateId);

    // Fetch candidate details with evaluations and skills
    const candidates = await prisma.candidate.findMany({
      where: {
        id: { in: candidateIds },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        total_experience: true,
        current_title: true,
        current_company: true,
        location: true,
        summary: true,
        resume_file_url: true,
        raw_text: true,
        skills: {
          select: { skill: true },
        },
        experiences: {
          take: 3,
          orderBy: { created_at: 'desc' },
          select: {
            title: true,
            company: true,
            duration: true,
            description: true,
          },
        },
        education: {
          take: 2,
          select: {
            degree: true,
            institution: true,
            field: true,
          },
        },
        evaluations: {
          where: { jobId: share.jobId },
          select: {
            score: true,
            atsScore: true,
            matchLevel: true,
            mandatoryCompliance: true,
            mandatoryFailed: true,
          },
          take: 1,
        },
      },
    });

    // Fetch all hiring activity records for these candidates under this job
    const activities = await prisma.candidateHiringActivity.findMany({
      where: {
        jobId: share.jobId,
        candidateId: { in: candidateIds },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format candidates for client review
    const formattedCandidates = candidates.map(c => {
      const candActivities = activities.filter(a => a.candidateId === c.id);
      const latestActivity = candActivities[0] || null;
      const evalItem = c.evaluations[0] || null;

      const score = Math.round(evalItem?.atsScore ?? evalItem?.score ?? 88);

      let resolvedName = cleanResumeText(c.name);
      if (c.raw_text) {
        const rawLines = c.raw_text.split('\n').map(l => l.trim()).filter(Boolean);
        if (rawLines.length > 0) {
          const firstLineClean = cleanResumeText(rawLines[0]);
          if (
            firstLineClean &&
            firstLineClean.length < 50 &&
            !firstLineClean.toLowerCase().includes('resume') &&
            !firstLineClean.toLowerCase().includes('curriculum')
          ) {
            resolvedName = firstLineClean;
          }
        }
      }
      resolvedName = resolvedName.replace(/\bResume\s+Copy\b/gi, '').replace(/\s+/g, ' ').trim() || c.name || 'Candidate';

      return {
        id: c.id,
        name: resolvedName,
        email: c.email || undefined,
        currentTitle: cleanResumeText(c.current_title) || 'Experienced Professional',
        currentCompany: cleanResumeText(c.current_company) || '',
        totalExperience: c.total_experience || '',
        location: cleanResumeText(c.location) || '',
        summary: cleanResumeText(c.summary) || '',
        skills: c.skills.map(s => cleanResumeText(s.skill)).filter(Boolean),
        experienceHighlights: c.experiences.map(e => ({
          title: cleanResumeText(e.title) || '',
          company: cleanResumeText(e.company) || '',
          duration: cleanResumeText(e.duration) || '',
        })),
        educationHighlights: c.education
          .filter(e => e.degree && e.degree.length < 90)
          .map(e => `${cleanResumeText(e.degree)} ${e.institution && e.institution !== 'University / Institute' ? `(${cleanResumeText(e.institution)})` : ''}`.trim()),
        atsScore: score,
        matchLevel: evalItem?.matchLevel || (score >= 90 ? 'EXCELLENT' : score >= 80 ? 'STRONG' : 'MODERATE'),
        mandatoryPassed: !evalItem?.mandatoryFailed,
        currentStatus: latestActivity?.status || 'Shared with Client',
        latestFeedback: latestActivity?.feedback || null,
        lastUpdatedDate: latestActivity?.createdAt || share.createdAt,
        latestActivity: latestActivity
          ? {
              status: latestActivity.status,
              feedback: latestActivity.feedback,
              interviewDate: latestActivity.interviewDate,
              interviewRound: latestActivity.interviewRound,
              interviewerName: latestActivity.interviewerName,
              rejectionReason: latestActivity.rejectionReason,
              expectedJoiningDate: latestActivity.expectedJoiningDate,
              nextInterviewDate: latestActivity.nextInterviewDate,
              updatedBy: latestActivity.updatedBy,
              updatedByRole: latestActivity.updatedByRole,
              createdAt: latestActivity.createdAt,
            }
          : null,
        timeline: candActivities.map(a => ({
          id: a.id,
          status: a.status,
          previousStatus: a.previousStatus,
          feedback: a.feedback,
          interviewDate: a.interviewDate,
          interviewRound: a.interviewRound,
          interviewerName: a.interviewerName,
          rejectionReason: a.rejectionReason,
          expectedJoiningDate: a.expectedJoiningDate,
          nextInterviewDate: a.nextInterviewDate,
          updatedBy: a.updatedBy,
          updatedByRole: a.updatedByRole,
          createdAt: a.createdAt,
        })),
        hasResume: Boolean(c.resume_file_url || c.raw_text),
        resumeFileName: c.resume_file_url || null,
      };
    });

    res.status(200).json({
      success: true,
      share: {
        id: share.id,
        clientName: share.clientName || share.job.client,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
        job: {
          id: share.job.id,
          position: share.job.position,
          client: share.job.client,
          location: share.job.location,
          workMode: share.job.work_mode,
          salary: share.job.salary,
        },
        candidates: formattedCandidates,
      },
    });
  } catch (error: any) {
    console.error('[Get Public Client Share Error]:', error);
    res.status(500).json({
      error: 'Failed to load candidate shortlist.',
      details: error?.message || 'Internal error',
    });
  }
};

/**
 * POST /api/public/client-shares/:token/candidates/:candidateId/status
 * Client updates interview/hiring status and comments for a shared candidate
 */
export const updateCandidateStatusAndFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, candidateId } = req.params;
    const validation = await validateActiveShare(token);

    if (!validation) {
      res.status(404).json({ error: 'Sharing link is invalid or does not exist.' });
      return;
    }

    if (validation.error) {
      res.status(403).json({ error: `Sharing link is ${validation.error}.` });
      return;
    }

    const { share } = validation;

    // Verify candidate is authorized in this share
    const isCandidateShared = share.items.some(item => item.candidateId === candidateId);
    if (!isCandidateShared) {
      res.status(403).json({
        error: 'Candidate is not authorized or not included in this sharing link.',
      });
      return;
    }

    const {
      status,
      feedback,
      interviewDate,
      interviewRound,
      interviewerName,
      rejectionReason,
      expectedJoiningDate,
      nextInterviewDate,
      clientName,
    } = req.body;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      res.status(400).json({
        error: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`,
      });
      return;
    }

    // Retrieve previous status from latest activity
    const lastActivity = await prisma.candidateHiringActivity.findFirst({
      where: {
        jobId: share.jobId,
        candidateId,
      },
      orderBy: { createdAt: 'desc' },
    });

    const previousStatus = lastActivity?.status || 'Shared with Client';

    // Sanitize client-entered inputs
    const cleanFeedback = sanitizeText(feedback);
    const cleanInterviewer = sanitizeText(interviewerName);
    const cleanRound = sanitizeText(interviewRound);
    const cleanRejection = sanitizeText(rejectionReason);
    const clientActor = sanitizeText(clientName) || share.clientName || 'Client';

    const newActivity = await prisma.candidateHiringActivity.create({
      data: {
        organizationId: share.organizationId,
        jobId: share.jobId,
        candidateId,
        shareId: share.id,
        status,
        previousStatus,
        feedback: cleanFeedback || null,
        interviewerName: cleanInterviewer || null,
        interviewRound: cleanRound || null,
        rejectionReason: cleanRejection || null,
        interviewDate: parseSafeDate(interviewDate),
        expectedJoiningDate: parseSafeDate(expectedJoiningDate),
        nextInterviewDate: parseSafeDate(nextInterviewDate),
        updatedBy: clientActor,
        updatedByRole: 'CLIENT',
      },
    });

    // Also synchronize CandidateApplication stage so existing ATS pipeline reflects the progress
    let applicationStage = 'INTERVIEWING';
    if (['Selected', 'Offered'].includes(status)) applicationStage = 'OFFER';
    if (status === 'Joined') applicationStage = 'HIRED';
    if (status === 'Rejected') applicationStage = 'REJECTED';
    if (status === 'On Hold') applicationStage = 'ON_HOLD';

    await prisma.candidateApplication
      .updateMany({
        where: {
          job_id: share.jobId,
          candidate_id: candidateId,
        },
        data: {
          stage: applicationStage,
        },
      })
      .catch(() => {});

    res.status(200).json({
      success: true,
      activity: newActivity,
      message: `Candidate status successfully updated to "${status}".`,
    });
  } catch (error: any) {
    console.error('[Update Candidate Status Error]:', error);
    res.status(500).json({
      error: 'Failed to update candidate status.',
      details: error?.message || 'Internal error',
    });
  }
};

/**
 * Helper to strip markdown and regex escapes from raw parsed CV strings
 */
const cleanResumeText = (text?: string | null): string => {
  if (!text) return '';
  return text
    .replace(/\\([.+()\-*_{}[\]])/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\*\s*\*__\*?/g, '')
    .replace(/__+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * GET /api/public/client-shares/:token/candidates/:candidateId/cv
 * Securely download candidate CV (original file if stored, or generated standard CV in PDF or DOCX)
 */
export const downloadCandidateCv = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, candidateId } = req.params;
    const format = String(req.query.format || '').toLowerCase(); // 'pdf' or 'docx'
    const validation = await validateActiveShare(token);

    if (!validation) {
      res.status(404).json({ error: 'Sharing link is invalid or does not exist.' });
      return;
    }

    if (validation.error) {
      res.status(403).json({ error: `Sharing link is ${validation.error}.` });
      return;
    }

    const { share } = validation;

    // Verify candidate is authorized in this share
    const isCandidateShared = share.items.some(item => item.candidateId === candidateId);
    if (!isCandidateShared) {
      res.status(403).json({
        error: 'Candidate is not authorized or not included in this sharing link.',
      });
      return;
    }

    // Retrieve candidate details
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        skills: true,
        experiences: { orderBy: { created_at: 'asc' } },
        education: { orderBy: { created_at: 'asc' } },
        bulkItems: {
          where: { storagePath: { not: null } },
          select: { storagePath: true, fileName: true, fileMime: true },
          take: 1,
        },
      },
    });

    if (!candidate) {
      res.status(404).json({ error: 'Candidate record not found.' });
      return;
    }

    // ── 1. CHECK IF STORED ORIGINAL FILE EXISTS ON DISK ──
    let storedFilePath: string | null = null;
    let storedMime = 'application/pdf';
    let storedOriginalName = candidate.resume_file_url || `${candidate.name || 'Candidate'}_CV.pdf`;

    // 1a. Check bulkItems storagePath
    if (candidate.bulkItems?.[0]?.storagePath && fs.existsSync(candidate.bulkItems[0].storagePath)) {
      storedFilePath = candidate.bulkItems[0].storagePath;
      storedMime = candidate.bulkItems[0].fileMime || 'application/octet-stream';
      storedOriginalName = candidate.bulkItems[0].fileName || storedOriginalName;
    }

    // 1b. Check uploads/resumes and fallback search dirs
    if (!storedFilePath) {
      const searchDirs = [
        path.resolve(process.cwd(), 'uploads', 'resumes'),
        path.resolve(process.cwd(), 'uploads', 'batches'),
        path.resolve(process.cwd(), 'uploads'),
        'C:\\Users\\saksh\\Downloads',
      ];

      const exts = ['.pdf', '.docx', '.doc', '.txt'];
      const baseName = candidate.resume_file_url ? path.basename(candidate.resume_file_url) : null;

      for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;

        // Check by exact candidate ID: <candidateId>.<ext>
        for (const ext of exts) {
          const candFile = path.join(dir, `${candidate.id}${ext}`);
          if (fs.existsSync(candFile) && fs.statSync(candFile).isFile()) {
            storedFilePath = candFile;
            storedOriginalName = baseName || `${candidate.name || 'Candidate'}_CV${ext}`;
            break;
          }
        }
        if (storedFilePath) break;

        // Check by candidateId_filename
        if (baseName) {
          const candNamedFile = path.join(dir, `${candidate.id}_${baseName}`);
          if (fs.existsSync(candNamedFile) && fs.statSync(candNamedFile).isFile()) {
            storedFilePath = candNamedFile;
            storedOriginalName = baseName;
            break;
          }

          // Check by exact original filename
          const directFile = path.join(dir, baseName);
          if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
            storedFilePath = directFile;
            storedOriginalName = baseName;
            break;
          }
        }

        // Check by file_hash
        if (candidate.file_hash) {
          for (const ext of exts) {
            const hashFile = path.join(dir, `${candidate.file_hash}${ext}`);
            if (fs.existsSync(hashFile) && fs.statSync(hashFile).isFile()) {
              storedFilePath = hashFile;
              storedOriginalName = baseName || `${candidate.name || 'Candidate'}_CV${ext}`;
              break;
            }
          }
        }
        if (storedFilePath) break;
      }
    }

    if (storedFilePath) {
      const ext = (path.extname(storedOriginalName) || path.extname(storedFilePath)).toLowerCase();
      if (ext === '.pdf') storedMime = 'application/pdf';
      else if (ext === '.docx') storedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === '.doc') storedMime = 'application/msword';
      else if (ext === '.txt') storedMime = 'text/plain';

      const safeAsciiName = storedOriginalName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
      res.setHeader('Content-Type', storedMime);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(storedOriginalName)}`
      );
      const fileStream = fs.createReadStream(storedFilePath);
      fileStream.pipe(res);
      return;
    }

    // ── 2. PREPARE HIGH-QUALITY STRUCTURED CANDIDATE DATA ──
    let resolvedName = cleanResumeText(candidate.name);
    let resolvedEmail = candidate.email;
    let resolvedPhone = candidate.phone;

    // Extract true name, email, phone from raw_text if missing or generic
    if (candidate.raw_text) {
      const rawLines = candidate.raw_text.split('\n').map(l => l.trim()).filter(Boolean);
      if (rawLines.length > 0) {
        const firstLineClean = cleanResumeText(rawLines[0]);
        if (
          firstLineClean &&
          firstLineClean.length < 50 &&
          !firstLineClean.toLowerCase().includes('resume') &&
          !firstLineClean.toLowerCase().includes('curriculum')
        ) {
          resolvedName = firstLineClean;
        }
      }
      const unescapedRaw = candidate.raw_text.replace(/\\([.+()\-*_{}[\]])/g, '$1');
      if (!resolvedEmail) {
        const em = unescapedRaw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (em) resolvedEmail = em[0];
      }
      if (!resolvedPhone) {
        const ph = unescapedRaw.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,6}/);
        if (ph) resolvedPhone = ph[0].trim();
      }
    }

    resolvedName = resolvedName.replace(/\bResume\s+Copy\b/gi, '').replace(/\s+/g, ' ').trim() || 'Candidate';
    const safeBaseName = resolvedName.replace(/[^a-zA-Z0-9_-]/g, '_');

    const cleanTitle = cleanResumeText(candidate.current_title) || 'Experienced Professional';
    const cleanCompany = cleanResumeText(candidate.current_company);
    const cleanLocation = cleanResumeText(candidate.location);
    const cleanSummary = cleanResumeText(candidate.summary);

    const cleanSkills = (candidate.skills || [])
      .map(s => cleanResumeText(s.skill))
      .filter((s, idx, arr) => s && arr.indexOf(s) === idx);

    const cleanExperiences = (candidate.experiences || []).map(exp => ({
      title: cleanResumeText(exp.title) || 'Role',
      company: cleanResumeText(exp.company),
      duration: cleanResumeText(exp.duration),
      description: cleanResumeText(exp.description),
    }));

    // Filter out invalid/misclassified education entries
    const cleanEducation = (candidate.education || [])
      .filter(edu => {
        const degree = edu.degree || '';
        if (degree.length > 90) return false;
        if (
          edu.institution === 'University / Institute' &&
          !degree.match(/\b(mba|btech|b\.tech|be|b\.e|bsc|b\.sc|msc|m\.sc|mca|bca|bachelor|master|diploma|phd)\b/i)
        ) {
          return false;
        }
        if (
          degree.includes('Project Lifecycle') ||
          degree.includes('Master Data') ||
          degree.includes('Plant Maintenance')
        ) {
          return false;
        }
        return true;
      })
      .map(edu => {
        const deg = cleanResumeText(edu.degree);
        const inst = cleanResumeText(edu.institution);
        return [deg, inst && inst !== 'University / Institute' ? `- ${inst}` : null].filter(Boolean).join(' ');
      });

    const isDocxRequested =
      format === 'docx' ||
      (format !== 'pdf' && candidate.resume_file_url?.toLowerCase().endsWith('.docx'));

    // ── 3. GENERATE WORD DOCX IF REQUESTED ──
    if (isDocxRequested) {
      const docxFileName = `${safeBaseName}_Resume.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${docxFileName}"; filename*=UTF-8''${encodeURIComponent(docxFileName)}`
      );

      const docxChildren: any[] = [
        new Paragraph({
          text: resolvedName,
          heading: HeadingLevel.TITLE,
        }),
        new Paragraph({
          children: [
            new TextRun({ text: cleanTitle, bold: true, color: '0F172A' }),
            ...(cleanCompany ? [new TextRun({ text: ` at ${cleanCompany}`, color: '475569' })] : []),
            ...(cleanLocation ? [new TextRun({ text: ` • 📍 ${cleanLocation}`, color: '64748B' })] : []),
          ],
        }),
      ];

      const contactLine = [resolvedEmail, resolvedPhone].filter(Boolean).join('  •  ');
      if (contactLine) {
        docxChildren.push(
          new Paragraph({
            children: [new TextRun({ text: contactLine, italics: true, color: '475569' })],
          })
        );
      }

      docxChildren.push(new Paragraph({ text: '' }));

      if (cleanSummary) {
        docxChildren.push(new Paragraph({ text: 'PROFESSIONAL SUMMARY', heading: HeadingLevel.HEADING_1 }));
        docxChildren.push(new Paragraph({ text: cleanSummary }));
        docxChildren.push(new Paragraph({ text: '' }));
      }

      if (cleanSkills.length > 0) {
        docxChildren.push(new Paragraph({ text: 'KEY TECHNICAL COMPETENCIES', heading: HeadingLevel.HEADING_1 }));
        docxChildren.push(new Paragraph({ text: cleanSkills.join('  •  ') }));
        docxChildren.push(new Paragraph({ text: '' }));
      }

      if (cleanExperiences.length > 0) {
        docxChildren.push(new Paragraph({ text: 'WORK EXPERIENCE', heading: HeadingLevel.HEADING_1 }));
        cleanExperiences.forEach(exp => {
          docxChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: exp.title, bold: true }),
                ...(exp.company || exp.duration
                  ? [new TextRun({ text: ` — ${[exp.company, exp.duration].filter(Boolean).join(' | ')}`, italics: true, color: '64748B' })]
                  : []),
              ],
            })
          );
          if (exp.description) {
            docxChildren.push(new Paragraph({ text: exp.description }));
          }
          docxChildren.push(new Paragraph({ text: '' }));
        });
      }

      if (cleanExperiences.length === 0 && candidate.raw_text) {
        docxChildren.push(new Paragraph({ text: 'EXPERIENCE & BACKGROUND', heading: HeadingLevel.HEADING_1 }));
        docxChildren.push(new Paragraph({ text: cleanResumeText(candidate.raw_text).substring(0, 3500) }));
        docxChildren.push(new Paragraph({ text: '' }));
      }

      if (cleanEducation.length > 0) {
        docxChildren.push(new Paragraph({ text: 'EDUCATION', heading: HeadingLevel.HEADING_1 }));
        cleanEducation.forEach(edu => {
          docxChildren.push(new Paragraph({ text: `• ${edu}` }));
        });
        docxChildren.push(new Paragraph({ text: '' }));
      }

      docxChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Candidate Profile for ${share.clientName || 'Client Review'} • HireIQ`,
              italics: true,
              color: '94A3B8',
            }),
          ],
        })
      );

      const docxDoc = new Document({
        sections: [{ properties: {}, children: docxChildren }],
      });

      const buffer = await Packer.toBuffer(docxDoc);
      res.send(buffer);
      return;
    }

    // ── 4. GENERATE HIGH-QUALITY CANDIDATE CV PDF DOCUMENT ──
    const pdfFileName = `${safeBaseName}_Resume.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdfFileName}"; filename*=UTF-8''${encodeURIComponent(pdfFileName)}`
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    doc.pipe(res);

    // Header styling
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#0f172a').text(resolvedName);
    doc.moveDown(0.2);

    const headerParts = [cleanTitle, cleanCompany ? `at ${cleanCompany}` : null, cleanLocation].filter(Boolean);
    doc.fontSize(10).font('Helvetica').fillColor('#475569').text(headerParts.join(' • ') || 'Candidate Profile');

    const contactParts = [resolvedEmail, resolvedPhone].filter(Boolean);
    if (contactParts.length > 0) {
      doc.moveDown(0.15);
      doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(contactParts.join('  •  '));
    }
    doc.moveDown(0.4);

    // Separator line
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.7);

    // Professional Summary
    if (cleanSummary) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('PROFESSIONAL SUMMARY');
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').fillColor('#334155').text(cleanSummary, { align: 'justify', lineGap: 2 });
      doc.moveDown(0.7);
    }

    // Key Skills
    if (cleanSkills.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('KEY SKILLS');
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').fillColor('#334155').text(cleanSkills.join('  •  '), { lineGap: 2 });
      doc.moveDown(0.7);
    }

    // Work Experience
    if (cleanExperiences.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('WORK EXPERIENCE');
      doc.moveDown(0.3);

      cleanExperiences.forEach(exp => {
        if (doc.y > 720) doc.addPage();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text(exp.title);
        const compLine = [exp.company, exp.duration].filter(Boolean).join(' | ');
        if (compLine) {
          doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#64748b').text(compLine);
        }
        if (exp.description) {
          doc.moveDown(0.2);
          doc.fontSize(8.5).font('Helvetica').fillColor('#334155').text(exp.description, { lineGap: 1.5 });
        }
        doc.moveDown(0.5);
      });
      doc.moveDown(0.3);
    } else if (candidate.raw_text) {
      if (doc.y > 680) doc.addPage();
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('EXPERIENCE & BACKGROUND');
      doc.moveDown(0.3);
      doc.fontSize(8.5).font('Helvetica').fillColor('#334155').text(cleanResumeText(candidate.raw_text).substring(0, 3500), { lineGap: 1.5 });
      doc.moveDown(0.5);
    }

    // Education
    if (cleanEducation.length > 0) {
      if (doc.y > 700) doc.addPage();
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('EDUCATION');
      doc.moveDown(0.3);

      cleanEducation.forEach(eduStr => {
        doc.fontSize(9).font('Helvetica').fillColor('#334155').text(`• ${eduStr}`);
      });
      doc.moveDown(0.7);
    }

    // Clean footer on all pages
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(7.5).fillColor('#94a3b8').text(
        `Candidate Profile for ${share.clientName || 'Client Review'} • HireIQ • Page ${i + 1} of ${range.count}`,
        40,
        doc.page.height - 25,
        { align: 'center', width: doc.page.width - 80, lineBreak: false }
      );
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
  } catch (error: any) {
    console.error('[Download Candidate CV Error]:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to download candidate CV document.',
        details: error?.message || 'Internal error',
      });
    }
  }
};

