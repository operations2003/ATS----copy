/**
 * Controlled AI Integration: AI-Assisted JD Requirement & Normalization Service
 * - Uses Gemini 2.5 Flash-Lite as primary semantic understanding engine with Gemini 3.5 Flash-Lite fallback.
 * - Extracts structured JD components: Role, mandatory vs preferred requirements, aliases, responsibilities, experience.
 * - 100% Graceful Fallback: If Gemini is unavailable, times out, or errors, falls back to the deterministic
 *   document processor parsing without breaking the upload flow or losing the original JD.
 */

import http from "http";
import https from "https";
import { getPythonServiceConfig } from "./pythonDocumentClient";
import {
  understandJobDescriptionWithGemini,
  NormalizedJdSchema,
  NormalizedRequirement,
} from "./geminiService";

export interface ControlledAiRequirement {
  id: string;
  requirement: string;
  category: string;
  source_evidence: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  is_inferred: boolean;
  is_mandatory: boolean;
  weight: number;
  aliases?: string[];
  related_terms?: string[];
  context?: string;
}

export interface AiParsedJd {
  companyName: string | null;
  positionTitle: string | null;
  location: string | null;
  workMode: "Remote" | "Hybrid" | "Onsite" | null;
  salary: string | null;
  experience: string | null;
  mandatoryRequirements: Array<{
    requirement: string;
    category: string;
    sourceEvidence?: string;
    aliases?: string[];
    context?: string;
  }>;
  preferredRequirements: Array<{
    requirement: string;
    category: string;
    sourceEvidence?: string;
    aliases?: string[];
    context?: string;
  }>;
  responsibilities: string[];
  inferredRequirements?: ControlledAiRequirement[];
  normalizedJd?: NormalizedJdSchema | null;
}

export const sanitizeAiText = (str: string | null | undefined): string => {
  if (!str) return "";
  return str.replace(/\s+/g, " ").trim();
};

const AI_TIMEOUT_MS = parseInt(process.env.PYTHON_TIMEOUT_MS || "15000", 10);

/**
 * Executes full semantic JD comprehension via Gemini with automatic fallback
 */
export async function semanticallyUnderstandJd(jdText: string): Promise<{
  normalizedJd: NormalizedJdSchema | null;
  requirements: ControlledAiRequirement[];
  aiModel: string;
  status: "COMPLETED" | "FALLBACK";
}> {
  if (!jdText || jdText.trim().length < 25) {
    return {
      normalizedJd: null,
      requirements: [],
      aiModel: "none",
      status: "FALLBACK",
    };
  }

  // 1. Primary: Google Gemini 2.5 Flash Semantic Comprehension
  try {
    const geminiResult = await understandJobDescriptionWithGemini(jdText);
    if (geminiResult) {
      console.log(
        `[JD AI Service] Successfully semantically analyzed JD with Gemini. Found ${geminiResult.mandatory_requirements.length} mandatory, ${geminiResult.preferred_requirements.length} preferred requirements.`,
      );

      const mappedRequirements: ControlledAiRequirement[] = [];

      // Map Gemini's canonical requirements directly without modifying Gemini's semantic classification
      // Add mandatory requirements exactly as extracted by Gemini
      geminiResult.mandatory_requirements.forEach((req, idx) => {
        mappedRequirements.push({
          id: `req-ai-m-${idx + 1}`,
          requirement: req.name,
          category: req.category || "Technical Skill",
          source_evidence: req.description || req.context || req.name,
          confidence: "HIGH",
          is_inferred: false,
          is_mandatory: true,
          weight: req.weight || 2.0,
          aliases: req.aliases || [],
          related_terms: req.related_terms || [],
          context: req.context || "",
        });
      });

      // Add preferred requirements exactly as extracted by Gemini
      geminiResult.preferred_requirements.forEach((req, idx) => {
        mappedRequirements.push({
          id: `req-ai-p-${idx + 1}`,
          requirement: req.name,
          category: req.category || "Technical Skill",
          source_evidence: req.description || req.context || req.name,
          confidence: "HIGH",
          is_inferred: false,
          is_mandatory: false,
          weight: req.weight || 1.0,
          aliases: req.aliases || [],
          related_terms: req.related_terms || [],
          context: req.context || "",
        });
      });

      // Overall experience must be included even when other
      // technical requirements have already been extracted.

      const minimumYears = geminiResult.experience?.minimum_years;
      const maximumYears = geminiResult.experience?.maximum_years;

      const specificExperiencePattern =
        /\b(?:gen\s?ai|generative\s+ai|llms?|machine learning|deep learning|nlp|rag|langchain|langgraph|python|sql|fastapi|tensorflow|pytorch|aws|azure|gcp|sales|b2b)\b/i;

      const hasOverallExperienceRequirement = mappedRequirements.some((req) => {
        const text = `${req.requirement} ${req.source_evidence} ${req.context || ""}`;

        const hasYears =
          /\b\d+(?:\.\d+)?\s*(?:\+|[-–—]|to)?\s*\d*(?:\.\d+)?\s*(?:years?|yrs?)\b/i.test(
            text,
          );

        const isExperience =
          /experience/i.test(req.category) || /\bexperience\b/i.test(text);

        return (
          hasYears && isExperience && !specificExperiencePattern.test(text)
        );
      });

      if (
        typeof minimumYears === "number" &&
        !hasOverallExperienceRequirement
      ) {
        const experienceLabel =
          maximumYears !== null
            ? `${minimumYears}-${maximumYears} years overall professional experience`
            : `${minimumYears}+ years overall professional experience`;

        mappedRequirements.unshift({
          id: "req-ai-overall-exp",
          requirement: experienceLabel,
          category: "Experience",
          source_evidence:
            geminiResult.experience.description || experienceLabel,
          confidence: "HIGH",
          is_inferred: false,
          is_mandatory: true,
          weight: 2.0,
          aliases: [`${minimumYears} years`, `${minimumYears}+ yrs`],
          context: "Overall professional experience",
        });
      }

      return {
        normalizedJd: geminiResult,
        requirements: mappedRequirements,
        aiModel: "semantic-ai-v2",
        status: "COMPLETED",
      };
    }
  } catch (err: any) {
    console.warn(
      "[JD AI Service] Gemini comprehension skipped due to error, invoking fallback:",
      err?.message || err,
    );
  }

  // 2. Secondary Fallback: Deterministic Python Document Processor extraction
  console.log(
    "[JD AI Service] Invoking secondary deterministic fallback for JD comprehension...",
  );
  const fallbackReqs = await completeJdRequirementsControlled(jdText);

  return {
    normalizedJd: null,
    requirements: fallbackReqs,
    aiModel: "deterministic-fallback",
    status: "FALLBACK",
  };
}

/**
 * Deterministic / Local extraction fallback
 */
export const completeJdRequirementsControlled = async (
  jdText: string,
): Promise<ControlledAiRequirement[]> => {
  if (!jdText || jdText.trim().length < 20) {
    return [];
  }

  return new Promise((resolve) => {
    try {
      const config = getPythonServiceConfig();
      if (!config) {
        return resolve([]);
      }
      const httpModule = config.isHttps ? https : http;
      const payload = JSON.stringify({ jd_text: jdText });
      const reqPath = `${config.basePath}/parse-jd-ai`;

      const req = httpModule.request(
        {
          hostname: config.hostname,
          port: config.port,
          path: reqPath,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: AI_TIMEOUT_MS,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              if (res.statusCode === 200) {
                const parsed = JSON.parse(data);
                resolve(parsed.requirements || []);
              } else {
                console.warn(
                  `[Controlled AI] JD completion returned status ${res.statusCode}. Falling back gracefully.`,
                );
                resolve([]);
              }
            } catch (err) {
              console.warn(
                "[Controlled AI] Parse error on JD completion response. Falling back gracefully.",
              );
              resolve([]);
            }
          });
        },
      );

      req.on("error", (err) => {
        console.warn(
          `[Controlled AI] Service unavailable (${err.message}). Graceful fallback.`,
        );
        resolve([]);
      });

      req.on("timeout", () => {
        req.destroy();
        console.warn(
          "[Controlled AI] JD completion timed out. Graceful fallback.",
        );
        resolve([]);
      });

      req.write(payload);
      req.end();
    } catch (err: any) {
      console.warn(
        `[Controlled AI] Unexpected error (${err.message}). Falling back.`,
      );
      resolve([]);
    }
  });
};

export const parseJdWithAi = async (
  rawText: string,
): Promise<AiParsedJd | null> => {
  try {
    const semanticRes = await semanticallyUnderstandJd(rawText);
    const inferred = semanticRes.requirements;
    if (!inferred || inferred.length === 0) return null;

    return {
      companyName: null,
      positionTitle: semanticRes.normalizedJd?.job_title || null,
      location: null,
      workMode: null,
      salary: null,
      experience: semanticRes.normalizedJd?.experience?.description || null,
      mandatoryRequirements: inferred
        .filter((r) => r.is_mandatory)
        .map((r) => ({
          requirement: r.requirement,
          category: r.category,
          sourceEvidence: r.source_evidence,
          aliases: r.aliases,
          context: r.context,
        })),
      preferredRequirements: inferred
        .filter((r) => !r.is_mandatory)
        .map((r) => ({
          requirement: r.requirement,
          category: r.category,
          sourceEvidence: r.source_evidence,
          aliases: r.aliases,
          context: r.context,
        })),
      responsibilities:
        semanticRes.normalizedJd?.responsibilities ||
        inferred
          .filter((r) => r.category === "Responsibility")
          .map((r) => r.requirement),
      inferredRequirements: inferred,
      normalizedJd: semanticRes.normalizedJd,
    };
  } catch {
    return null;
  }
};
