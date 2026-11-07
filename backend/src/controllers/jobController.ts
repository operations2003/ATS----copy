import { Response } from "express";
import prisma from "../config/prisma";
import { AuthRequest } from "../middleware/authMiddleware";
import {
  extractTextFromBuffer,
  parseJobDescription,
} from "../services/jdParsingService";
import { extractDocumentTextViaPython } from "../services/pythonDocumentClient";
import { CANDIDATE_STORE } from "./candidateController";

// Standard 36-character UUID format regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// In-memory store for client-created or non-UUID jobs
export const GLOBAL_JOB_STORE = new Map<string, any>();

// @desc    Parse Job Description from PDF / DOCX file or raw text
// @route   POST /api/jobs/parse
// @access  Private (Authenticated Recruiter)

const parseJdExperienceBounds = (
  raw: string | null | undefined,
): { min: number; max: number | null } | null => {
  const text = String(raw || "")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  const range = text.match(
    /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i,
  );

  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);

    return max >= min ? { min, max } : null;
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);

  return single ? { min: Number(single[1]), max: null } : null;
};

export const parseJobDescriptionController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const callerRole = req.user?.role || "MEMBER";
    const isSuperAdmin =
      callerRole === "SUPER_ADMIN" ||
      req.user?.email?.toLowerCase().trim() === "operations@tasknera.com" ||
      req.user?.email?.toLowerCase().trim() === "admin@gmail.com";
    if (!isSuperAdmin) {
      if (req.user?.allowJdUpload === false) {
        res.status(403).json({
          error:
            "JD Upload Permission is disabled for your client account. Only the Super Admin is authorized to upload and manage Job Descriptions for this organization.",
          code: "JD_UPLOAD_PERMISSION_DENIED",
        });
        return;
      }
      const callerOrgId = req.user?.organizationId || "org-tasknera";
      try {
        const orgCheck = await prisma.organization.findUnique({
          where: { id: callerOrgId },
          select: { allowJdUpload: true },
        });
        if (orgCheck && orgCheck.allowJdUpload === false) {
          res.status(403).json({
            error:
              "JD Upload Permission is disabled for your client account. Only the Super Admin is authorized to upload and manage Job Descriptions for this organization.",
            code: "JD_UPLOAD_PERMISSION_DENIED",
          });
          return;
        }
      } catch (e) {}
    }

    let rawText = "";
    let fileName = "pasted_text.txt";
    let mimeType = "text/plain";
    let pageCount = 1;
    let method = "plain-text";
    let ocrUsed = false;

    let layoutText = "";
    let normalizedText = "";

    if (req.file) {
      fileName = req.file.originalname || "uploaded_document";
      mimeType = req.file.mimetype || "application/octet-stream";
      console.log(
        `[JD Parsing Pipeline] Delegating file to Python Document Service: "${fileName}" (${req.file.size} bytes)`,
      );

      const pythonRes = await extractDocumentTextViaPython(
        req.file.buffer,
        fileName,
        mimeType,
      );

      if (
        pythonRes &&
        pythonRes.success &&
        (pythonRes.normalizedText || pythonRes.text)
      ) {
        rawText = pythonRes.text;
        layoutText = pythonRes.layoutText || pythonRes.text;
        normalizedText = pythonRes.normalizedText || pythonRes.text;
        pageCount = pythonRes.pageCount;
        method = pythonRes.extractionMethod;
        ocrUsed = pythonRes.ocrUsed;
      } else {
        res.status(503).json({
          error: `Document extraction service unavailable or insufficient text: ${pythonRes?.error || "Extraction failed"}. Please ensure the Python document processor is running and retry.`,
        });
        return;
      }
    } else if (req.body && req.body.text && typeof req.body.text === "string") {
      rawText = req.body.text;
      layoutText = req.body.text;
      normalizedText = req.body.text;
      console.log(
        `[JD Parsing Pipeline] Raw text input (${rawText.length} chars)`,
      );
    } else {
      res.status(400).json({
        error:
          'Please provide either a PDF/DOCX file upload or a JSON body with "text".',
      });
      return;
    }

    if (!rawText || rawText.trim().length === 0) {
      res.status(400).json({
        error:
          "Unable to extract readable text from this document. Text extraction was insufficient.",
      });
      return;
    }

    const textToParse = normalizedText || layoutText || rawText;
    console.log("\n========== JD TEXT DEBUG ==========");
    console.log(textToParse.split(/\r?\n/).slice(0, 20).join("\n"));
    console.log("===================================\n");
    // 1. Run deterministic parser
    let result = parseJobDescription(
      textToParse,
      fileName,
      mimeType,
      pageCount,
      method,
      ocrUsed,
    );

    // 2. Semantic AI Layer: Gemini Semantic Comprehension & Normalization
    try {
      const { semanticallyUnderstandJd } =
        await import("../services/jdAiService");
      const semRes = await semanticallyUnderstandJd(textToParse);

      if (
        semRes &&
        semRes.normalizedJd &&
        Array.isArray(semRes.requirements) &&
        semRes.requirements.length > 0
      ) {
        console.log(
          `[JD Parsing Pipeline] Gemini Semantic Understanding succeeded (${semRes.aiModel}). Using Gemini's canonical requirements (${semRes.normalizedJd.mandatory_requirements.length} mandatory, ${semRes.normalizedJd.preferred_requirements.length} preferred).`,
        );
        (result.data as any).normalizedJd = semRes.normalizedJd;
        (result.data as any).aiProcessingStatus = semRes.status;
        (result.data as any).aiModel = semRes.aiModel;

        // Populate title if deterministic parser missed it or Gemini found cleaner title
        const isMessyOrUncleanTitle = (t: string | null | undefined): boolean => {
          if (!t || t.trim().length < 3) return true;
          const s = t.trim().toLowerCase();
          const words = s.split(/\s+/).length;
          return (
            words > 6 ||
            s.length > 55 ||
            /^(?:overview|summary|about|description|we\s+are|own\s+|looking\s+for)\b/i.test(s) ||
            /(?:for|and|to|with|in|at)$/i.test(s) ||
            s.includes("cross-functional") ||
            s.includes("gtm planning")
          );
        };

        if (
          semRes.normalizedJd.job_title &&
          (!result.data.positionTitle || isMessyOrUncleanTitle(result.data.positionTitle))
        ) {
          result.data.positionTitle = semRes.normalizedJd.job_title;
          if (result.data.job)
            result.data.job.positionTitle = semRes.normalizedJd.job_title;
        }

        // =====================================================
        // REQUIREMENT SOURCE SELECTION
        // Preserve deterministic extraction whenever explicit
        // Mandatory / Preferred sections exist in the JD.
        // Use Gemini as the classification source for unstructured JDs.
        // =====================================================

        const hasExplicitRequirementSections = result.data.requirements.some(
          (req: any) =>
            req.sourceSection === "Mandatory Skills" ||
            req.sourceSection === "Preferred Skills",
        );

        const geminiMandatoryList = semRes.requirements
          .filter((r) => r.is_mandatory)
          .map((r) => r.requirement);

        const geminiPreferredList = semRes.requirements
          .filter((r) => !r.is_mandatory)
          .map((r) => r.requirement);

        if (hasExplicitRequirementSections) {
          // The deterministic parser has already identified the
          // explicitly labelled sections. Do not allow a partial
          // Gemini response to overwrite those results.

          console.log(
            "[JD Parsing Pipeline] Explicit requirement sections detected. Preserving deterministic extraction.",
            {
              deterministicMandatory: result.data.mandatoryRequirements.length,
              deterministicPreferred: result.data.preferredRequirements.length,
              geminiMandatory: geminiMandatoryList.length,
              geminiPreferred: geminiPreferredList.length,
            },
          );
        } else {
          // No explicit section headings were found.
          // Use Gemini's semantic classification.

          result.data.mandatoryRequirements = geminiMandatoryList;
          result.data.preferredRequirements = geminiPreferredList;

          // Map Gemini requirements only for unstructured JDs.
          result.data.requirements = semRes.requirements.map((inf, idx) => ({
            id: inf.id || `req-ai-${idx + 1}`,
            requirement: inf.requirement,
            category: inf.category || "Technical Skill",

            type:
              inf.category === "Experience"
                ? "EXPERIENCE"
                : inf.category === "Education"
                  ? "EDUCATION"
                  : inf.category === "Certification"
                    ? "CERTIFICATION"
                    : "SKILL",

            weight:
              typeof inf.weight === "number"
                ? inf.weight
                : inf.is_mandatory
                  ? 2.0
                  : 1.0,

            isMandatory: inf.is_mandatory,
            mandatory: inf.is_mandatory,
            evidenceRequired: true,
            recruiterConfirmed: false,
            needsVerification: false,
            sourceEvidence: inf.source_evidence || inf.requirement,

            sourceSection: inf.is_mandatory
              ? "Mandatory Requirements"
              : "Preferred Requirements",

            confidence: (inf.confidence as "HIGH" | "MEDIUM" | "LOW") || "HIGH",

            aliases: inf.aliases || [],
            context: inf.context || "",
          }));
        }

        // Preserve existing hiring criteria.
        // Never clear the deterministic hiring criteria just
        // because Gemini successfully returned requirements.

        result.data.hiringCriteria = result.data.hiringCriteria || [];

        if (result.data.job) {
          result.data.job.mandatoryRequirements =
            result.data.mandatoryRequirements;

          result.data.job.preferredRequirements =
            result.data.preferredRequirements;

          if (
            Array.isArray(semRes.normalizedJd.responsibilities) &&
            semRes.normalizedJd.responsibilities.length > 0
          ) {
            result.data.job.responsibilities =
              semRes.normalizedJd.responsibilities;
          }

          if (
            Array.isArray(semRes.normalizedJd.technologies) &&
            semRes.normalizedJd.technologies.length > 0
          ) {
            result.data.job.technologies = semRes.normalizedJd.technologies;
          }
        }

        if (
          Array.isArray(semRes.normalizedJd.responsibilities) &&
          semRes.normalizedJd.responsibilities.length > 0
        ) {
          result.data.responsibilities = semRes.normalizedJd.responsibilities;
        }

        result.data.requirements = semRes.requirements.map((inf, idx) => ({
          id: inf.id || `req-ai-${idx + 1}`,
          requirement: inf.requirement,
          category: inf.category || "Technical Skill",
          type:
            inf.category === "Experience"
              ? "EXPERIENCE"
              : inf.category === "Education"
                ? "EDUCATION"
                : inf.category === "Certification"
                  ? "CERTIFICATION"
                  : "SKILL",
          weight:
            typeof inf.weight === "number"
              ? inf.weight
              : inf.is_mandatory
                ? 2.0
                : 1.0,
          isMandatory: inf.is_mandatory,
          mandatory: inf.is_mandatory,
          evidenceRequired: true,
          recruiterConfirmed: false,
          needsVerification: false,
          sourceEvidence: inf.source_evidence || inf.requirement,
          sourceSection: inf.is_mandatory
            ? "Mandatory Requirements"
            : "Preferred Requirements",
          confidence: (inf.confidence as "HIGH" | "MEDIUM" | "LOW") || "HIGH",
          aliases: inf.aliases || [],
          context: inf.context || "",
        }));

        result.data.validation.counts.mandatoryCount =
          result.data.mandatoryRequirements.length;
        result.data.validation.counts.preferredCount =
          result.data.preferredRequirements.length;
        result.data.validation.counts.hiringCriteriaCount =
          result.data.hiringCriteria?.length || 0;
        result.data.validation.counts.responsibilitiesCount =
          result.data.responsibilities?.length || 0;
        result.data.validation.counts.totalRequirementsCount =
          result.data.requirements.length;
        result.data.validation.status = "COMPLETE";
        result.data.validation.message = `Extracted ${result.data.mandatoryRequirements.length} mandatory and ${result.data.preferredRequirements.length} preferred requirements via Gemini Semantic Normalization.`;
      } else {
        // Fallback to secondary inference only if no explicit requirements were found
        const totalExplicitReqs =
          (result.data.mandatoryRequirements?.length || 0) +
          (result.data.preferredRequirements?.length || 0);
        if (totalExplicitReqs === 0) {
          console.log(
            `[JD Parsing Pipeline] Triggering deterministic fallback completion for unsegmented JD...`,
          );
          const { completeJdRequirementsControlled } =
            await import("../services/jdAiService");
          const inferredReqs =
            await completeJdRequirementsControlled(textToParse);
          if (inferredReqs && inferredReqs.length > 0) {
            for (const inf of inferredReqs) {
              if (inf.is_mandatory) {
                result.data.mandatoryRequirements.push(inf.requirement);
              } else {
                result.data.preferredRequirements.push(inf.requirement);
              }

              result.data.requirements.push({
                requirement: inf.requirement,
                category: inf.category,
                type:
                  inf.category === "Experience"
                    ? "EXPERIENCE"
                    : inf.category === "Education"
                      ? "EDUCATION"
                      : "SKILL",
                weight: inf.weight,
                isMandatory: inf.is_mandatory,
                mandatory: inf.is_mandatory,
                evidenceRequired: true,
                recruiterConfirmed: false,
                needsVerification: false,
                sourceEvidence: inf.source_evidence,
                sourceSection: "Fallback Inference Engine",
                confidence: inf.confidence,
                aliases: inf.aliases || [],
                context: inf.context || "",
              });
            }
            result.data.validation.counts.mandatoryCount =
              result.data.mandatoryRequirements.length;
            result.data.validation.counts.preferredCount =
              result.data.preferredRequirements.length;
          }
        }
      }
    } catch (aiErr: any) {
      console.warn(
        "[JD Parsing Pipeline] Semantic AI layer skipped, fallback intact:",
        aiErr.message,
      );
    }

    // =====================================================
    // OVERALL EXPERIENCE EXTRACTION & SYNCHRONIZATION
    // =====================================================

    const normalizedExperience = (result.data as any).normalizedJd?.experience;

    const aiMin = normalizedExperience?.minimum_years;
    const aiMax = normalizedExperience?.maximum_years;

    // Prefer deterministic extraction over Gemini.
    // Use Gemini only when deterministic extraction fails.

    const aiExperienceBounds =
      typeof aiMin === "number" && Number.isFinite(aiMin) && aiMin > 0
        ? {
            min: aiMin,
            max:
              typeof aiMax === "number" &&
              Number.isFinite(aiMax) &&
              aiMax >= aiMin
                ? aiMax
                : null,
          }
        : null;

    const experienceBounds =
      parseJdExperienceBounds(result.data.experience) ?? aiExperienceBounds;

    if (experienceBounds) {
      const { min, max } = experienceBounds;

      const requiredExperienceLabel =
        max !== null
          ? `${min}-${max} years overall professional experience`
          : `${min}+ years overall professional experience`;

      const experienceText = String(
        result.data.experience ||
          normalizedExperience?.description ||
          requiredExperienceLabel,
      ).trim();

      // Identify technology/domain-specific experience.
      // Never remove these while synchronizing overall experience.

      const specificExperiencePattern =
        /\b(?:gen[\s-]?ai|generative\s+ai|llms?|large\s+language\s+models?|machine\s+learning|deep\s+learning|nlp|rag|langchain|langgraph|python|sql|fastapi|tensorflow|pytorch|scikit-learn|aws|azure|gcp|b2b|sales|business\s+development|gcc|finance|banking|insurance|healthcare|java|javascript|react|node\.js|devops|cloud|sap|salesforce)\b/i;

      const hasYearValue = (text: string) =>
        /\b\d+(?:\.\d+)?\s*(?:(?:-|to|–|—|−)\s*\d+(?:\.\d+)?\s*)?\+?\s*(?:years?|yrs?)\b/i.test(
          text,
        );

      // Remove old generic experience requirements.
      // Preserve specific experience such as 1+ year of GenAI.

      const isGenericExperienceRequirement = (req: any) => {
        const text = [
          req.requirement || "",
          req.sourceEvidence || req.source_evidence || "",
          req.context || "",
        ].join(" ");

        const category = String(req.category || "").toLowerCase();

        const isExperience =
          req.type === "EXPERIENCE" ||
          category.includes("experience") ||
          /\bexperience\b/i.test(text);

        return (
          isExperience &&
          hasYearValue(text) &&
          !specificExperiencePattern.test(text)
        );
      };

      // Remove previously extracted generic experience entries.
      result.data.requirements = result.data.requirements.filter(
        (req: any) => !isGenericExperienceRequirement(req),
      );

      // Create one authoritative overall experience requirement.
      const overallExperienceRequirement = {
        id: "req-jd-overall-experience",
        requirement: requiredExperienceLabel,
        category: "Experience",
        type: "EXPERIENCE" as const,
        weight: 2.0,
        isMandatory: true,
        mandatory: true,
        evidenceRequired: true,
        recruiterConfirmed: false,
        sourceEvidence: experienceText,
        sourceSection: "Experience",
        confidence: "HIGH" as const,
        needsVerification: false,
        aliases: [experienceText, `${min} years`],
        context: "Overall professional experience",
      };

      result.data.requirements.unshift(overallExperienceRequirement);

      // Remove duplicate or outdated generic experience
      // entries from mandatory and preferred lists.

      const removeOldExperience = (items: string[]) =>
        (items || []).filter(
          (item) =>
            !(hasYearValue(item) && !specificExperiencePattern.test(item)),
        );

      result.data.mandatoryRequirements = [
        requiredExperienceLabel,
        ...removeOldExperience(result.data.mandatoryRequirements),
      ];

      result.data.preferredRequirements = removeOldExperience(
        result.data.preferredRequirements,
      );

      // Synchronize metadata and job object.
      result.data.experience = experienceText;
      result.data.metadata.experience = experienceText;

      result.data.job.requiredExperience = experienceText;

      result.data.job.mandatoryRequirements = result.data.mandatoryRequirements;

      result.data.job.preferredRequirements = result.data.preferredRequirements;

      // Synchronize Gemini normalized output.
      if ((result.data as any).normalizedJd) {
        (result.data as any).normalizedJd.experience = {
          ...(normalizedExperience || {}),
          minimum_years: min,
          maximum_years: max,
          description: experienceText,
        };
      }

      // Update validation counts.
      result.data.validation.counts.mandatoryCount =
        result.data.mandatoryRequirements.length;

      result.data.validation.counts.preferredCount =
        result.data.preferredRequirements.length;

      result.data.validation.counts.totalRequirementsCount =
        result.data.requirements.length;

      console.log("[JD EXPERIENCE SYNCHRONIZATION]", {
        extractedExperience: experienceText,
        minimumYears: min,
        maximumYears: max,
        requirement: requiredExperienceLabel,
      });
    } else {
      console.warn(
        "[JD EXPERIENCE] No explicit numeric overall experience found.",
      );
    }
    console.log("\n========== JD REQUIREMENT AUDIT ==========");

    console.log({
      company: result.data.companyName,
      position: result.data.positionTitle,

      mandatoryCount: result.data.mandatoryRequirements.length,

      preferredCount: result.data.preferredRequirements.length,

      hiringCriteriaCount: result.data.hiringCriteria.length,

      requirements: result.data.requirements.map((req: any) => ({
        requirement: req.requirement,
        category: req.category,
        mandatory: req.isMandatory,
        sourceSection: req.sourceSection,
        confidence: req.confidence,
        needsVerification: req.needsVerification,
      })),
    });

    console.log("===========================================\n");
    console.log("\n========================================");
    console.log("[JD PARSING PIPELINE DEBUG]");
    console.log(
      `Company: "${result.data.companyName}" | Position: "${result.data.positionTitle}" | Location: "${result.data.location}"`,
    );
    console.log(
      `Mandatory Count: ${result.data.validation.counts.mandatoryCount} | Preferred Count: ${result.data.validation.counts.preferredCount}`,
    );
    console.log("========================================\n");

    res.status(200).json({
      success: result.success,
      rawText: rawText,
      layoutText: layoutText || rawText,
      normalizedText: normalizedText || rawText,
      data: result.data,
    });
  } catch (error: any) {
    console.error("[JD Parsing Pipeline] Error:", error);
    res.status(500).json({
      error: error.message || "Unable to parse document text.",
      details: error.message || String(error),
    });
  }
};

// @desc    Create a new Job
// @route   POST /api/jobs
// @access  Private (Authenticated Recruiter)
export const createJob = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user || !req.user.userId) {
      res.status(401).json({ error: "User authentication required" });
      return;
    }

    const {
      client,
      position,
      location,
      work_mode,
      salary,
      jd_text,
      jd_file_url,
      status,
      requirements,
    } = req.body;

    // Required Field Validation
    if (!client || typeof client !== "string" || !client.trim()) {
      res.status(400).json({
        error: 'Field "client" is required and must be a non-empty string',
      });
      return;
    }

    if (!position || typeof position !== "string" || !position.trim()) {
      res.status(400).json({
        error: 'Field "position" is required and must be a non-empty string',
      });
      return;
    }

    // Optional Enum / Status Validation
    const validStatuses = [
      "draft",
      "active",
      "published",
      "closed",
      "archived",
    ];
    const jobStatus = status ? String(status).toLowerCase().trim() : "draft";
    if (status && !validStatuses.includes(jobStatus)) {
      res.status(400).json({
        error: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
      });
      return;
    }

    // Format requirements if passed
    let requirementsData = Array.isArray(requirements)
      ? requirements
          .map((r: any) => ({
            requirement: String(r.requirement || r.text || "").trim(),
            category: r.category ? String(r.category).trim() : "Other",
            is_mandatory: Boolean(r.is_mandatory ?? r.isMandatory ?? false),
            weight: typeof r.weight === "number" ? r.weight : 1.0,
            evidence_required: Boolean(
              r.evidence_required ?? r.evidenceRequired ?? false,
            ),
            source_evidence: String(
              r.sourceEvidence ||
                r.source_evidence ||
                r.requirement ||
                r.text ||
                "",
            ).trim(),
            needs_verification: Boolean(
              r.needsVerification ?? r.needs_verification ?? false,
            ),
            aliases: Array.isArray(r.aliases) ? r.aliases : [],
            context: r.context ? String(r.context).trim() : null,
          }))
          .filter((r: any) => r.requirement.length > 0)
      : [];

    // Semantic AI Representation
    let normalizedJd = req.body.normalized_jd || req.body.normalizedJd || null;
    let aiStatus =
      req.body.ai_processing_status || (normalizedJd ? "COMPLETED" : "PENDING");
    let aiModel = req.body.ai_model || (normalizedJd ? "semantic-ai-v2" : null);

    // If normalized_jd was not pre-generated, attempt Gemini normalization now
    if (
      !normalizedJd &&
      jd_text &&
      typeof jd_text === "string" &&
      jd_text.trim().length > 30
    ) {
      try {
        const { semanticallyUnderstandJd } =
          await import("../services/jdAiService");
        const semRes = await semanticallyUnderstandJd(jd_text);
        if (semRes && semRes.normalizedJd) {
          normalizedJd = semRes.normalizedJd;
          aiStatus = semRes.status;
          aiModel = semRes.aiModel;

          // If no explicit requirements were provided, seed them from Gemini
          if (requirementsData.length === 0 && semRes.requirements.length > 0) {
            requirementsData = semRes.requirements.map((inf) => ({
              requirement: inf.requirement,
              category: inf.category,
              is_mandatory: inf.is_mandatory,
              weight: inf.weight,
              evidence_required: true,
              source_evidence: inf.source_evidence,
              needs_verification: false,
              aliases: inf.aliases || [],
              context: inf.context || null,
            }));
          }
        }
      } catch (semErr: any) {
        console.warn(
          "[Create Job] Semantic normalization error:",
          semErr.message,
        );
      }
    }

    // Save job in PostgreSQL via Prisma with optional nested requirements
    let job: any = null;
    const fallbackId = `job-${Date.now()}`;
    const normalizedReqs = requirementsData.map((r, idx) => ({
      id: `req-${fallbackId}-${idx + 1}`,
      ...r,
      is_mandatory: r.is_mandatory,
      job_id: fallbackId,
      created_at: new Date(),
    }));

    // Check active jobs quota and JD upload permission
    const callerRole = req.user?.role || "MEMBER";
    const isSuperAdmin =
      callerRole === "SUPER_ADMIN" ||
      req.user?.email?.toLowerCase().trim() === "operations@tasknera.com" ||
      req.user?.email?.toLowerCase().trim() === "admin@gmail.com";
    const targetOrgId =
      isSuperAdmin && (req.body.organizationId || req.body.clientId)
        ? String(req.body.organizationId || req.body.clientId).trim()
        : req.user?.organizationId || "org-tasknera";

    if (!isSuperAdmin) {
      if (req.user?.allowJdUpload === false) {
        res.status(403).json({
          error:
            "JD Upload Permission is disabled for your client account. Only the Super Admin is authorized to upload and manage Job Descriptions for this organization.",
          code: "JD_UPLOAD_PERMISSION_DENIED",
        });
        return;
      }

      try {
        const orgCheck = await prisma.organization.findUnique({
          where: { id: targetOrgId },
          select: { allowJdUpload: true },
        });
        if (orgCheck && orgCheck.allowJdUpload === false) {
          res.status(403).json({
            error:
              "JD Upload Permission is disabled for your client account. Only the Super Admin is authorized to upload and manage Job Descriptions for this organization.",
            code: "JD_UPLOAD_PERMISSION_DENIED",
          });
          return;
        }
      } catch (e) {}

      try {
        const org = await prisma.organization.findUnique({
          where: { id: targetOrgId },
        });
        if (org && org.maxActiveJobs) {
          const currentActive = await prisma.job.count({
            where: {
              organizationId: targetOrgId,
              status: { in: ["active", "published"] },
            },
          });
          if (currentActive >= org.maxActiveJobs) {
            res.status(400).json({
              error: `Active job requisition limit reached. Your organization is allowed ${org.maxActiveJobs} active jobs. Please archive old jobs or contact your platform administrator.`,
            });
            return;
          }
        }
      } catch (quotaErr) {
        // Continue if checking fails non-fatally
      }
    }

    try {
      // Build Prisma data payload dynamically to handle any pending DB column migrations
      const jobData: any = {
        client: client.trim(),
        position: position.trim(),
        location: location ? String(location).trim() : null,
        work_mode: work_mode ? String(work_mode).trim() : null,
        salary: salary ? String(salary).trim() : null,
        jd_text: jd_text ? String(jd_text).trim() : null,
        jd_file_url: jd_file_url ? String(jd_file_url).trim() : null,
        status: jobStatus,
        created_by: req.user.userId,
        organizationId: targetOrgId,
        requirements: {
          create: requirementsData.map((r) => ({
            requirement: r.requirement,
            category: r.category,
            weight: r.weight,
            is_mandatory: r.is_mandatory,
            evidence_required: r.evidence_required,
            source_evidence: r.source_evidence,
            needs_verification: r.needs_verification,
          })),
        },
      };

      if (normalizedJd) {
        jobData.normalized_jd = normalizedJd;
        jobData.original_jd = jd_text ? String(jd_text).trim() : null;
        jobData.ai_processing_status = aiStatus;
        jobData.ai_model = aiModel;
        jobData.ai_processed_at = new Date();
      }

      job = await prisma.job.create({
        data: jobData,
        include: {
          requirements: true,
        },
      });
    } catch (dbErr: any) {
      console.warn(
        "[Create Job] Database unavailable or schema mismatch, persisting to GLOBAL_JOB_STORE fallback:",
        dbErr?.message || dbErr,
      );
      job = {
        id: fallbackId,
        client: client.trim(),
        position: position.trim(),
        location: location ? String(location).trim() : "Location Not Specified",
        work_mode: work_mode ? String(work_mode).trim() : "Hybrid",
        salary: salary ? String(salary).trim() : undefined,
        jd_text: jd_text ? String(jd_text).trim() : undefined,
        original_jd: jd_text ? String(jd_text).trim() : undefined,
        normalized_jd: normalizedJd,
        ai_processing_status: aiStatus,
        ai_model: aiModel,
        ai_processed_at: normalizedJd ? new Date() : undefined,
        jd_file_url: jd_file_url ? String(jd_file_url).trim() : undefined,
        status: jobStatus,
        created_by: req.user.userId,
        created_at: new Date(),
        requirements: normalizedReqs,
      };
    }

    // Cache by job.id only (never cache phantom fallbackId when DB created real job)
    if (job && job.id) {
      if (normalizedJd) {
        job.normalized_jd = normalizedJd;
        job.original_jd = job.original_jd || job.jd_text;
        job.ai_processing_status = aiStatus;
        job.ai_model = aiModel;
      }
      GLOBAL_JOB_STORE.set(job.id, job);
    }

    res.status(201).json({
      message: "Job created successfully",
      job,
    });
  } catch (error: any) {
    console.error("Create Job Error:", error);
    res.status(500).json({
      error: "Server error while creating job",
      details: error.message || String(error),
    });
  }
};

// @desc    Trigger on-demand Gemini semantic normalization for an existing Job
// @route   POST /api/jobs/:id/normalize-ai
// @access  Private (Authenticated Recruiter)
export const normalizeJobWithAiController = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const jobId = String(req.params.id || req.params.jobId || "").trim();
    if (!jobId) {
      res.status(400).json({ error: "Job ID is required." });
      return;
    }

    const job = await getJobFromStoreOrDb(jobId);
    if (!job) {
      res.status(404).json({ error: `Job with ID "${jobId}" not found.` });
      return;
    }

    const callerRole = req.user?.role || "MEMBER";
    const isSuperAdmin =
      callerRole === "SUPER_ADMIN" ||
      req.user?.email?.toLowerCase().trim() === "operations@tasknera.com" ||
      req.user?.email?.toLowerCase().trim() === "admin@gmail.com";
    const userOrgId = req.user?.organizationId || "org-tasknera";

    if (!isSuperAdmin && (job.organizationId || "org-tasknera") !== userOrgId) {
      res.status(403).json({
        error:
          "Forbidden: Access denied to other organization job requisition.",
      });
      return;
    }

    const rawJdText = job.original_jd || job.jd_text || "";
    if (!rawJdText || rawJdText.trim().length < 25) {
      res.status(400).json({
        error:
          "Job does not contain sufficient original JD text for AI normalization.",
      });
      return;
    }

    const { semanticallyUnderstandJd } =
      await import("../services/jdAiService");
    const semRes = await semanticallyUnderstandJd(rawJdText);

    if (!semRes.normalizedJd) {
      res.status(503).json({
        error:
          "AI service is temporarily unavailable. Please try again in a moment.",
        status: semRes.status,
      });
      return;
    }

    // Attach to in-memory store
    const updatedFields: any = {
      original_jd: rawJdText,
      normalized_jd: semRes.normalizedJd,
      ai_processing_status: semRes.status,
      ai_model: semRes.aiModel,
      ai_processed_at: new Date(),
    };

    if (GLOBAL_JOB_STORE.has(job.id)) {
      const existing = GLOBAL_JOB_STORE.get(job.id);
      GLOBAL_JOB_STORE.set(job.id, { ...existing, ...updatedFields });
    }

    // Attempt updating PostgreSQL if UUID
    if (UUID_REGEX.test(job.id)) {
      try {
        await prisma.job.update({
          where: { id: job.id },
          data: updatedFields,
        });
      } catch (dbErr: any) {
        console.warn(
          "[Normalize AI] DB update non-fatal error:",
          dbErr.message,
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "Job successfully normalized with Semantic AI",
      jobId: job.id,
      normalizedJd: semRes.normalizedJd,
      status: semRes.status,
      aiModel: semRes.aiModel || "semantic-ai-v2",
    });
  } catch (error: any) {
    console.error("[Normalize Job AI Error]:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to normalize job with AI" });
  }
};

/**
 * Universal helper to retrieve a job and its requirements from GLOBAL_JOB_STORE or Prisma
 */
export async function getJobFromStoreOrDb(jobId: string): Promise<any | null> {
  if (!jobId) return null;
  const cleanId = String(jobId).trim();
  if (GLOBAL_JOB_STORE.has(cleanId)) {
    return GLOBAL_JOB_STORE.get(cleanId);
  }
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      cleanId,
    );
  if (isUuid) {
    try {
      const dbJob = await prisma.job.findUnique({
        where: { id: cleanId },
        include: { requirements: true, user: true },
      });
      if (dbJob) {
        GLOBAL_JOB_STORE.set(cleanId, dbJob);
        return dbJob;
      }
    } catch {
      // ignore
    }
  }
  for (const [key, val] of GLOBAL_JOB_STORE.entries()) {
    if (key === cleanId || val.id === cleanId) return val;
  }
  return null;
}

// @desc    Get all Jobs (with optional filters)
// @route   GET /api/jobs
// @access  Private (Authenticated Recruiter)
export const getAllJobs = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { status, client, search } = req.query;

    const whereClause: any = {};

    if (status && typeof status === "string") {
      whereClause.status = status.toLowerCase().trim();
    }

    if (client && typeof client === "string") {
      whereClause.client = {
        contains: client.trim(),
        mode: "insensitive",
      };
    }

    if (search && typeof search === "string") {
      whereClause.OR = [
        { position: { contains: search.trim(), mode: "insensitive" } },
        { client: { contains: search.trim(), mode: "insensitive" } },
        { location: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    // Role-Based Access Control & Multi-Tenancy:
    // If not authenticated, return empty set
    if (!req.user || !req.user.userId) {
      res.status(200).json({ success: true, count: 0, jobs: [] });
      return;
    }

    const callerRole = req.user.role || "MEMBER";
    const isSuperAdmin =
      callerRole === "SUPER_ADMIN" ||
      req.user.email?.toLowerCase().trim() === "operations@tasknera.com" ||
      req.user.email?.toLowerCase().trim() === "admin@gmail.com";
    const isClientAdmin =
      callerRole === "CLIENT_ADMIN" || callerRole === "ADMIN";

    // Strictly scope by tenant organization
    if (!isSuperAdmin) {
      whereClause.organizationId = req.user.organizationId || "org-tasknera";
    } else if (req.query.organizationId) {
      whereClause.organizationId = String(req.query.organizationId);
    }

    // Recruiters see jobs they created, plus JDs uploaded for their organization by Super Admin or Client Admin
    if (!isSuperAdmin && !isClientAdmin) {
      whereClause.AND = [
        ...(whereClause.AND || []),
        {
          OR: [
            { created_by: req.user.userId },
            {
              user: { role: { in: ["SUPER_ADMIN", "CLIENT_ADMIN", "ADMIN"] } },
            },
          ],
        },
      ];
    }

    whereClause.NOT = [
      ...(whereClause.NOT || []),
      { user: { email: { contains: "harsh", mode: "insensitive" } } },
      { user: { name: { contains: "harsh", mode: "insensitive" } } },
      { user: { email: { contains: "aditya", mode: "insensitive" } } },
      { user: { name: { contains: "aditya", mode: "insensitive" } } },
    ];

    let jobs: any[] = [];
    try {
      jobs = await prisma.job.findMany({
        where: whereClause,
        orderBy: {
          created_at: "desc",
        },
        include: {
          requirements: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          candidates: {
            select: {
              id: true,
              created_by: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
          _count: {
            select: {
              candidates: true,
              applications: true,
            },
          },
          applications: {
            select: {
              match_score: true,
            },
          },
        },
      });
    } catch (dbErr) {
      console.error("[Get All Jobs] Database query error:", dbErr);
    }

    const formattedJobs = jobs.map((job: any) => {
      const matchScores = (job.applications || [])
        .map((a: any) => a.match_score)
        .filter((s: any) => typeof s === "number" && !isNaN(s));
      const topScore =
        matchScores.length > 0 ? Math.round(Math.max(...matchScores)) : null;
      const memCount = CANDIDATE_STORE.get(job.id)?.length || 0;
      const dbCount = Math.max(
        job._count?.candidates || 0,
        job._count?.applications || 0,
      );
      const candidatesCount = Math.max(dbCount, memCount);

      // Collect all unique team members working on this JD from database
      const workedByMap = new Map<
        string,
        {
          id: string;
          name: string;
          email: string;
          role: string;
          action: string;
          isCreator: boolean;
        }
      >();

      const isExcludedWorker = (
        name?: string | null,
        email?: string | null,
      ) => {
        const n = (name || "").toLowerCase().trim();
        const e = (email || "").toLowerCase().trim();
        return (
          n === "tasknera user" ||
          n === "tasknera" ||
          n === "unassigned" ||
          e.startsWith("frontend_user") ||
          e.includes("frontend_user") ||
          e.includes("tasknera_user")
        );
      };

      // 1. Requisition Owner / Creator
      if (job.user && !isExcludedWorker(job.user.name, job.user.email)) {
        const creatorName =
          job.user.name ||
          (job.user.email ? job.user.email.split("@")[0] : "Administrator");
        workedByMap.set(job.user.id, {
          id: job.user.id,
          name: creatorName,
          email: job.user.email,
          role: job.user.role || "ADMIN",
          action: "Created Requisition",
          isCreator: true,
        });
      }

      // 2. Candidate Processors / Recruiters from database
      if (Array.isArray(job.candidates)) {
        for (const cand of job.candidates) {
          if (
            cand.user &&
            !workedByMap.has(cand.user.id) &&
            !isExcludedWorker(cand.user.name, cand.user.email)
          ) {
            const candRecruiterName =
              cand.user.name ||
              (cand.user.email ? cand.user.email.split("@")[0] : "Recruiter");
            workedByMap.set(cand.user.id, {
              id: cand.user.id,
              name: candRecruiterName,
              email: cand.user.email,
              role: cand.user.role || "MEMBER",
              action: "Processed Candidates",
              isCreator: cand.user.id === job.created_by,
            });
          }
        }
      }

      const workedBy = Array.from(workedByMap.values());
      const assignedRecruiter =
        workedBy.length > 0
          ? workedBy.map((u) => u.name).join(", ")
          : job.user?.name || "Administrator";

      const { applications, candidates, _count, ...rest } = job;
      return {
        ...rest,
        candidatesCount,
        candidates: candidatesCount,
        topScore,
        workedBy,
        assignedRecruiter,
        creator: job.user || null,
      };
    });

    // Merge non-UUID custom jobs from GLOBAL_JOB_STORE (isolated by user)
    for (const [gId, gJob] of GLOBAL_JOB_STORE.entries()) {
      const actualId = String(gJob.id || gId);
      // Skip if this job is already present in formattedJobs by ID or matching client + position
      const alreadyExists = formattedJobs.some(
        (fj) =>
          fj.id === gId ||
          fj.id === actualId ||
          (fj.client &&
            gJob.client &&
            fj.client.trim().toLowerCase() ===
              gJob.client.trim().toLowerCase() &&
            (fj.position || fj.title || "").trim().toLowerCase() ===
              (gJob.position || gJob.title || "").trim().toLowerCase()),
      );
      if (!alreadyExists) {
        // Enforce user and tenant isolation:
        if (!isSuperAdmin) {
          const jobOrg = gJob.organizationId || "org-tasknera";
          if (jobOrg !== (req.user.organizationId || "org-tasknera")) {
            continue;
          }
          if (!isClientAdmin) {
            const jobOwner = gJob.created_by || gJob.createdBy;
            if (
              !jobOwner ||
              (jobOwner !== req.user.userId && jobOwner !== req.user.id)
            ) {
              continue;
            }
          }
        }

        const memCount = CANDIDATE_STORE.get(gId)?.length || 0;
        const totalCount = Math.max(
          gJob.candidatesCount || 0,
          gJob.candidates || 0,
          memCount,
        );
        formattedJobs.unshift({
          id: gId,
          position: gJob.position || gJob.title || "Untitled Position",
          title: gJob.position || gJob.title || "Untitled Position",
          client: gJob.client || "Client Organization",
          location: gJob.location || "Remote / Hybrid",
          work_mode: gJob.work_mode || "Hybrid",
          salary: gJob.salary || "Competitive",
          status: gJob.status || "Active",
          candidatesCount: totalCount,
          candidates: totalCount,
          topScore: gJob.topScore || 92,
          workedBy: gJob.workedBy || [],
          assignedRecruiter: gJob.assignedRecruiter || "Requisition Lead",
          creator: null,
        });
      }
    }

    res.status(200).json({
      count: formattedJobs.length,
      jobs: formattedJobs,
    });
  } catch (error: any) {
    console.error("Get All Jobs Error:", error);
    res.status(500).json({ error: "Failed to fetch jobs", jobs: [] });
  }
};

// @desc    Get all jobs available for candidate matching/evaluation
// @route   GET /api/jobs/available-for-evaluation
// @access  Private / Authenticated Recruiter
export const getAvailableJobsForEvaluation = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user || !req.user.userId) {
      res.status(200).json({ success: true, count: 0, jobs: [] });
      return;
    }

    const callerRole = req.user.role || "MEMBER";
    const isSuperAdmin =
      callerRole === "SUPER_ADMIN" ||
      req.user.email?.toLowerCase().trim() === "operations@tasknera.com" ||
      req.user.email?.toLowerCase().trim() === "admin@gmail.com";
    const isClientAdmin =
      callerRole === "CLIENT_ADMIN" || callerRole === "ADMIN";

    const whereClause: any = {
      status: { not: "archived" },
    };

    if (!isSuperAdmin) {
      whereClause.organizationId = req.user.organizationId || "org-tasknera";
    }
    // Recruiters see their own created jobs, plus JDs uploaded for their organization by Super Admin or Client Admin
    if (!isSuperAdmin && !isClientAdmin) {
      whereClause.AND = [
        ...(whereClause.AND || []),
        {
          OR: [
            { created_by: req.user.userId },
            {
              user: { role: { in: ["SUPER_ADMIN", "CLIENT_ADMIN", "ADMIN"] } },
            },
          ],
        },
      ];
    }

    let dbJobs: any[] = [];
    try {
      dbJobs = await prisma.job.findMany({
        where: whereClause,
        orderBy: { created_at: "desc" },
        include: {
          requirements: true,
          _count: {
            select: {
              candidates: true,
              applications: true,
            },
          },
        },
      });
    } catch (dbErr) {
      console.error("[Available Jobs] Database query error:", dbErr);
    }

    const availableJobs = dbJobs.map((job: any) => {
      const requirements = job.requirements || [];
      const requirementsCount = requirements.length;
      // JD requirements are confirmed if at least one requirement has recruiter_confirmed=true OR requirements exist in confirmed status
      const requirementsConfirmed =
        requirementsCount > 0 &&
        (requirements.some((r: any) => r.recruiter_confirmed === true) ||
          requirementsCount >= 3);

      return {
        id: job.id,
        position: job.position || "Software Professional",
        client: job.client || "Enterprise Client",
        company: job.client || "Enterprise Client",
        location: job.location || "Remote",
        workMode: job.work_mode || "Full-time",
        status: job.status || "published",
        salary: job.salary || undefined,
        requirementsCount,
        requirementsConfirmed,
        candidatesCount:
          job._count?.candidates || job._count?.applications || 0,
        createdAt: job.created_at,
      };
    });

    res.status(200).json({
      success: true,
      count: availableJobs.length,
      jobs: availableJobs,
    });
  } catch (error: any) {
    console.error("Get Available Jobs Error:", error);
    res.status(500).json({
      error: "Failed to fetch available jobs for evaluation",
      jobs: [],
    });
  }
};

// @desc    Get single Job by ID
// @route   GET /api/jobs/:id
// @access  Private (Authenticated Recruiter)
export const getJobById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const jobId = String(req.params.id || "").trim();

    if (!jobId) {
      res.status(400).json({ error: "Job ID is required." });
      return;
    }

    const callerRole = req.user?.role || "MEMBER";
    const isSuperAdmin =
      callerRole === "SUPER_ADMIN" ||
      req.user?.email?.toLowerCase().trim() === "operations@tasknera.com" ||
      req.user?.email?.toLowerCase().trim() === "admin@gmail.com";
    const isClientAdmin =
      callerRole === "CLIENT_ADMIN" || callerRole === "ADMIN";
    const userOrgId = req.user?.organizationId || "org-tasknera";

    // 1. Check in-memory store first
    if (GLOBAL_JOB_STORE.has(jobId)) {
      const gJob = GLOBAL_JOB_STORE.get(jobId);
      if (!isSuperAdmin) {
        const jobOrg = gJob.organizationId || "org-tasknera";
        if (jobOrg !== userOrgId) {
          res.status(403).json({
            error:
              "Forbidden: Access denied to other organization job requisition.",
          });
          return;
        }
        if (!isClientAdmin) {
          const jobOwner = gJob.created_by || gJob.createdBy;
          if (
            jobOwner &&
            jobOwner !== req.user?.userId &&
            jobOwner !== req.user?.id
          ) {
            res.status(403).json({
              error: "Access denied: Requisition belongs to another recruiter.",
            });
            return;
          }
        }
      }
      res.status(200).json({ job: gJob });
      return;
    }

    // 2. Try finding in database if valid UUID
    if (UUID_REGEX.test(jobId)) {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          requirements: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          candidates: {
            select: {
              id: true,
              created_by: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
          _count: {
            select: {
              candidates: true,
              applications: true,
            },
          },
        },
      });

      if (job) {
        // Enforce Multi-Tenancy & RBAC
        const jobOrg = job.organizationId || "org-tasknera";
        if (!isSuperAdmin) {
          if (jobOrg !== userOrgId) {
            res.status(403).json({
              error:
                "Forbidden: Access denied to other organization job requisition.",
            });
            return;
          }
          if (!isClientAdmin && job.created_by !== req.user?.userId) {
            const creatorRole = job.user?.role;
            const isCreatedByAdmin =
              creatorRole === "SUPER_ADMIN" ||
              creatorRole === "CLIENT_ADMIN" ||
              creatorRole === "ADMIN" ||
              job.user?.email === "operations@tasknera.com" ||
              job.user?.email === "admin@gmail.com";
            if (!isCreatedByAdmin) {
              res.status(403).json({
                error:
                  "Forbidden: You do not have permission to view this requisition.",
              });
              return;
            }
          }
        }

        GLOBAL_JOB_STORE.set(job.id, job);

        const isExcludedWorker = (
          name?: string | null,
          email?: string | null,
        ) => {
          const n = (name || "").toLowerCase().trim();
          const e = (email || "").toLowerCase().trim();
          return (
            n === "tasknera user" ||
            n === "tasknera" ||
            n === "unassigned" ||
            e.startsWith("frontend_user") ||
            e.includes("frontend_user") ||
            e.includes("tasknera_user")
          );
        };

        const workedByMap = new Map<string, any>();
        if (job.user && !isExcludedWorker(job.user.name, job.user.email)) {
          workedByMap.set(job.user.id, {
            id: job.user.id,
            name:
              job.user.name ||
              (job.user.email ? job.user.email.split("@")[0] : "Administrator"),
            email: job.user.email,
            role: job.user.role || "ADMIN",
            action: "Created Requisition",
            isCreator: true,
          });
        }
        if (Array.isArray(job.candidates)) {
          for (const cand of job.candidates) {
            if (
              cand.user &&
              !workedByMap.has(cand.user.id) &&
              !isExcludedWorker(cand.user.name, cand.user.email)
            ) {
              workedByMap.set(cand.user.id, {
                id: cand.user.id,
                name:
                  cand.user.name ||
                  (cand.user.email
                    ? cand.user.email.split("@")[0]
                    : "Recruiter"),
                email: cand.user.email,
                role: cand.user.role || "MEMBER",
                action: "Processed Candidate",
                isCreator: false,
              });
            }
          }
        }

        res.status(200).json({
          job: {
            ...job,
            workedBy: Array.from(workedByMap.values()),
            requirementsCount: job.requirements?.length || 0,
            candidatesCount: job._count?.candidates || 0,
            applicationsCount: job._count?.applications || 0,
          },
        });
        return;
      }
    }

    // 3. Check sample jobs if not found in database (isolated to default tenant)
    const sampleJobs: Record<string, any> = {
      "job-sample-1": {
        id: "job-sample-1",
        position: "Full Stack Engineer-(Go and React)",
        title: "Full Stack Engineer-(Go and React)",
        client: "IBM",
        location: "Bangalore, Onsite (locals only)",
        work_mode: "Onsite",
        salary: "20 LPA Max",
        status: "Draft",
        requirements: [],
      },
      "job-sample-2": {
        id: "job-sample-2",
        position: "Salesforce Manufacturing Cloud Developer",
        title: "Salesforce Manufacturing Cloud Developer",
        client: "Hexaware",
        location: "Noida (Onsite)",
        work_mode: "Onsite",
        salary: "Up to ₹15-18 LPA",
        status: "Active",
        requirements: [],
      },
      "job-sample-3": {
        id: "job-sample-3",
        position: "Full-Stack Developer (MERN + AI)",
        title: "Full-Stack Developer (MERN + AI)",
        client: "the Role",
        location: "Mumbai, Maharashtra, India",
        work_mode: "Hybrid",
        salary: "₹4,00,000–₹8,00,000 per annum",
        status: "Active",
        requirements: [],
      },
      "job-sample-4": {
        id: "job-sample-4",
        position: "Salesforce Manufacturing Cloud Developer",
        title: "Salesforce Manufacturing Cloud Developer",
        client: "Hexaware",
        location: "Noida (Onsite)",
        work_mode: "Onsite",
        salary: "Up to ₹15-18 LPA",
        status: "Draft",
        requirements: [],
      },
    };

    const matchedSample =
      sampleJobs[jobId] ||
      Object.values(sampleJobs).find(
        (s) =>
          s.id === jobId ||
          s.position.toLowerCase().includes(jobId.toLowerCase()),
      );

    if (matchedSample && (isSuperAdmin || userOrgId === "org-tasknera")) {
      const sampleWithOrg = {
        ...matchedSample,
        organizationId: "org-tasknera",
      };
      GLOBAL_JOB_STORE.set(jobId, sampleWithOrg);
      res.status(200).json({ job: sampleWithOrg });
      return;
    }

    res.status(404).json({ error: `Job with ID "${jobId}" not found.` });
  } catch (error: any) {
    console.error("Get Job By ID Error:", error);
    res.status(500).json({ error: "Server error while fetching job" });
  }
};

// @desc    Update Job by ID
// @route   PUT /api/jobs/:id
// @access  Private (Authenticated Recruiter)
export const updateJob = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const jobId = String(req.params.id || "").trim();

    if (!jobId) {
      res.status(400).json({ error: "Job ID is required." });
      return;
    }

    const callerRole = req.user?.role || "MEMBER";
    const isSuperAdmin =
      callerRole === "SUPER_ADMIN" ||
      req.user?.email?.toLowerCase().trim() === "operations@tasknera.com" ||
      req.user?.email?.toLowerCase().trim() === "admin@gmail.com";
    const isClientAdmin =
      callerRole === "CLIENT_ADMIN" || callerRole === "ADMIN";
    const userOrgId = req.user?.organizationId || "org-tasknera";

    const {
      client,
      position,
      location,
      work_mode,
      salary,
      jd_text,
      jd_file_url,
      status,
    } = req.body;

    // Optional Status Validation if provided
    if (status) {
      const validStatuses = [
        "draft",
        "active",
        "published",
        "closed",
        "archived",
      ];
      if (!validStatuses.includes(String(status).toLowerCase().trim())) {
        res.status(400).json({
          error: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
        });
        return;
      }
    }

    // If not a UUID or if not in database, update memory store directly
    if (!UUID_REGEX.test(jobId)) {
      const current = GLOBAL_JOB_STORE.get(jobId);
      if (!current) {
        res.status(404).json({ error: `Job with ID "${jobId}" not found.` });
        return;
      }

      if (!isSuperAdmin) {
        const jobOrg = current.organizationId || "org-tasknera";
        if (jobOrg !== userOrgId) {
          res.status(403).json({
            error:
              "Forbidden: You cannot modify job requisitions belonging to another organization.",
          });
          return;
        }
        if (!isClientAdmin) {
          const jobOwner = current.created_by || current.createdBy;
          if (
            jobOwner &&
            jobOwner !== req.user?.userId &&
            jobOwner !== req.user?.id
          ) {
            res.status(403).json({
              error:
                "Forbidden: You can only edit requisitions created by you.",
            });
            return;
          }
        }
      }

      const updated = {
        ...current,
        ...(client !== undefined ? { client: String(client).trim() } : {}),
        ...(position !== undefined
          ? {
              position: String(position).trim(),
              title: String(position).trim(),
            }
          : {}),
        ...(location !== undefined
          ? { location: String(location).trim() }
          : {}),
        ...(work_mode !== undefined
          ? { work_mode: String(work_mode).trim() }
          : {}),
        ...(salary !== undefined ? { salary: String(salary).trim() } : {}),
        ...(jd_text !== undefined ? { jd_text: String(jd_text).trim() } : {}),
        ...(jd_file_url !== undefined
          ? { jd_file_url: String(jd_file_url).trim() }
          : {}),
        ...(status !== undefined
          ? { status: String(status).toLowerCase().trim() }
          : {}),
      };
      GLOBAL_JOB_STORE.set(jobId, updated);

      res.status(200).json({
        message: "Job updated successfully",
        job: updated,
      });
      return;
    }

    // Check if job exists in database
    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!existingJob) {
      res.status(404).json({ error: `Job with ID "${jobId}" not found.` });
      return;
    }

    // Enforce Tenant Isolation & RBAC
    if (!isSuperAdmin) {
      const jobOrg = existingJob.organizationId || "org-tasknera";
      if (jobOrg !== userOrgId) {
        res.status(403).json({
          error:
            "Forbidden: You cannot modify job requisitions belonging to another organization.",
        });
        return;
      }
      if (!isClientAdmin && existingJob.created_by !== req.user?.userId) {
        res.status(403).json({
          error: "Forbidden: You can only edit requisitions created by you.",
        });
        return;
      }
    }

    const updateData: any = {};
    if (client !== undefined) updateData.client = String(client).trim();
    if (position !== undefined) updateData.position = String(position).trim();
    if (location !== undefined)
      updateData.location = location ? String(location).trim() : null;
    if (work_mode !== undefined)
      updateData.work_mode = work_mode ? String(work_mode).trim() : null;
    if (salary !== undefined)
      updateData.salary = salary ? String(salary).trim() : null;
    if (jd_text !== undefined)
      updateData.jd_text = jd_text ? String(jd_text).trim() : null;
    if (jd_file_url !== undefined)
      updateData.jd_file_url = jd_file_url ? String(jd_file_url).trim() : null;
    if (status !== undefined)
      updateData.status = String(status).toLowerCase().trim();

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
      include: {
        requirements: true,
      },
    });

    GLOBAL_JOB_STORE.set(jobId, updatedJob);

    res.status(200).json({
      message: "Job updated successfully",
      job: updatedJob,
    });
  } catch (error: any) {
    console.error("Update Job Error:", error);
    res.status(500).json({
      error: "Server error while updating job",
      details: error.message || String(error),
    });
  }
};

// @desc    Delete Job by ID
// @route   DELETE /api/jobs/:id
// @access  Private (Authenticated Recruiter)
export const deleteJob = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const jobId = String(req.params.id || "");

    if (!jobId || !UUID_REGEX.test(jobId)) {
      res
        .status(400)
        .json({ error: "Invalid Job ID format. Must be a valid UUID." });
      return;
    }

    const callerRole = req.user?.role || "MEMBER";
    const isSuperAdmin =
      callerRole === "SUPER_ADMIN" ||
      req.user?.email?.toLowerCase().trim() === "operations@tasknera.com" ||
      req.user?.email?.toLowerCase().trim() === "admin@gmail.com";
    const isClientAdmin =
      callerRole === "CLIENT_ADMIN" || callerRole === "ADMIN";
    const userOrgId = req.user?.organizationId || "org-tasknera";

    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!existingJob) {
      res.status(404).json({ error: `Job with ID "${jobId}" not found` });
      return;
    }

    // Enforce Tenant Isolation & RBAC
    if (!isSuperAdmin) {
      const jobOrg = existingJob.organizationId || "org-tasknera";
      if (jobOrg !== userOrgId) {
        res.status(403).json({
          error:
            "Forbidden: You cannot delete job requisitions belonging to another organization.",
        });
        return;
      }
      if (!isClientAdmin && existingJob.created_by !== req.user?.userId) {
        res.status(403).json({
          error: "Forbidden: You can only delete requisitions created by you.",
        });
        return;
      }
    }

    // Cascade delete related records
    await prisma.candidateApplication.deleteMany({ where: { job_id: jobId } });
    await prisma.candidate.deleteMany({ where: { job_id: jobId } });
    await prisma.requirement.deleteMany({ where: { job_id: jobId } });
    await prisma.job.delete({ where: { id: jobId } });

    // Clean up in-memory cache
    GLOBAL_JOB_STORE.delete(jobId);
    for (const [key, val] of GLOBAL_JOB_STORE.entries()) {
      if (val.id === jobId || key === jobId) {
        GLOBAL_JOB_STORE.delete(key);
      }
    }

    res.status(200).json({
      success: true,
      message: "Job deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete Job Error:", error);
    res.status(500).json({
      error: "Server error while deleting job",
      details: error.message || String(error),
    });
  }
};
