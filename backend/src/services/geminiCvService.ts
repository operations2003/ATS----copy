/**
 * Gemini CV Structured Extraction Service
 *
 * Enterprise-grade structured candidate resume extraction with:
 * - Leaky-bucket / Token rate limiting respecting RPM and TPM quotas
 * - Bounded concurrency control (configurable via GEMINI_MAX_CONCURRENCY)
 * - Exponential backoff with jitter on 429, 500, 502, 503, 504
 * - Retry-After header parsing and respect
 * - Quota exhaustion detection (distinguishing temporary rate limits from exhausted daily quotas)
 * - Strict JSON schema validation matching CandidateParsedProfile
 * - Deterministic fallback if Gemini is unavailable, rate-limited, or exhausted
 * - Field-level warning detection and extraction confidence scoring
 * - Safe error reporting without leaking PII or secrets
 */

import { CandidateParsedProfile, CandidateExperience, CandidateEducation, CandidateProject, CandidateCertification } from './cvParsingService';
import { isGeminiModelSupported, PRIMARY_GEMINI_MODEL, FALLBACK_GEMINI_MODEL } from './geminiService';

// Configurable environment parameters
const GEMINI_RPM = parseInt(process.env.GEMINI_RPM || '15', 10); // Free tier: ~15 RPM
const GEMINI_MAX_CONCURRENCY = parseInt(process.env.GEMINI_MAX_CONCURRENCY || '2', 10);
const GEMINI_MAX_RETRIES = parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10);
const GEMINI_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS || '40000', 10);

// Status code classifications
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

// ── Rate Limiter & Concurrency Controller ────────────────────────────────────
class GeminiRateLimiter {
  private activeCount = 0;
  private queue: Array<() => void> = [];
  private requestTimestamps: number[] = [];

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      const tryExecute = () => {
        const now = Date.now();
        // Clear timestamps older than 60 seconds
        this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60000);

        const underRpm = this.requestTimestamps.length < GEMINI_RPM;
        const underConcurrency = this.activeCount < GEMINI_MAX_CONCURRENCY;

        if (underRpm && underConcurrency) {
          this.activeCount++;
          this.requestTimestamps.push(now);
          resolve();
        } else {
          // Wait and retry
          const delay = underRpm ? 250 : Math.max(500, 60000 - (now - this.requestTimestamps[0]) + 100);
          setTimeout(tryExecute, Math.min(delay, 2000));
        }
      };

      tryExecute();
    });
  }

  release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
  }
}

const rateLimiter = new GeminiRateLimiter();

// ── System Prompt for Resume Extraction ─────────────────────────────────────
const CV_EXTRACTION_SYSTEM_PROMPT = `You are a precision CV/Resume Structured Extraction Engine for an enterprise ATS.
Your task is to extract all verifiable professional details from the candidate resume text into a strict, validated JSON schema.

CRITICAL EXTRACTION RULES:
1. STRICT EVIDENCE-BASED EXTRACTION:
   - Extract ONLY information that is explicitly stated or directly verifiable in the resume.
   - NEVER invent, hallucinate, assume, or fabricate companies, dates, degrees, skills, or titles.
   - If a field is not present in the resume, return null (for strings) or empty array [] (for lists).
   - Distinguish missing information from extraction errors.

2. EXPERIENCE TENURE & DATES:
   - Extract each job role separately with exact start_date and end_date as written (e.g., "Jan 2021", "2019", "Present").
   - Extract company name and job title cleanly without prefixes.
   - Calculate total_experience_years accurately from career timeline. Do not count education as professional experience.
   - Avoid double-counting overlapping jobs.

3. SKILLS & TECHNOLOGIES:
   - Extract technical skills, programming languages, frameworks, cloud tools, and platforms as distinct clean items.
   - Do NOT include generic filler words (e.g., "responsible", "hardworking", "tools", "work").

4. CONTACT INFORMATION & LOCATION:
   - Extract email address and phone number cleanly.
   - Extract current location (City, State/Country) if mentioned.

5. SALARY & NOTICE PERIOD:
   - Notice period / availability: extract only if explicitly stated (e.g. "30 days", "Immediate", "2 months"). Otherwise null.
   - Current salary and expected salary: extract only if explicitly stated. Otherwise null.

EXPECTED JSON SCHEMA:
{
  "name": "Full Name string or null",
  "email": "Valid email string or null",
  "phone": "Phone number string or null",
  "location": "Current location string or null",
  "current_title": "Most recent job title or null",
  "current_company": "Most recent employer or null",
  "total_experience_years": 5.5,
  "summary": "Professional summary or null",
  "skills": ["React", "Node.js", "TypeScript"],
  "technologies": ["PostgreSQL", "Docker", "AWS"],
  "tools": ["Git", "Jira"],
  "industries": ["Fintech", "E-commerce"],
  "education": [
    {
      "degree": "B.Tech in Computer Science",
      "institution": "University Name",
      "field": "Computer Science",
      "year": "2019"
    }
  ],
  "experience": [
    {
      "title": "Senior Software Engineer",
      "company": "Tech Corp",
      "start_date": "Jan 2021",
      "end_date": "Present",
      "duration": "3 yrs",
      "description": "Responsibilities and achievements",
      "technologies": ["React", "TypeScript"]
    }
  ],
  "certifications": [
    {
      "name": "AWS Certified Solutions Architect",
      "issuer": "Amazon Web Services",
      "year": "2022"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Project summary",
      "technologies": ["Node.js", "MongoDB"]
    }
  ],
  "languages": ["English"],
  "notice_period": "30 days or null",
  "current_salary": "Amount or null",
  "expected_salary": "Amount or null"
}

RETURN ONLY VALID JSON. No conversational commentary.`;

export interface ExtractedCvResult {
  success: boolean;
  profile?: Partial<CandidateParsedProfile> & {
    noticePeriod?: string | null;
    currentSalary?: string | null;
    expectedSalary?: string | null;
  };
  modelUsed?: string;
  isFallback: boolean;
  isQuotaExhausted?: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NEEDS_REVIEW';
  fieldWarnings: Record<string, string>;
  error?: string;
}

/**
 * Computes exponential backoff delay with random jitter.
 */
function getBackoffDelay(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec && retryAfterSec > 0 && retryAfterSec < 60) {
    return (retryAfterSec * 1000) + Math.floor(Math.random() * 500);
  }
  const baseMs = 1200 * Math.pow(2, attempt - 1);
  const jitterMs = Math.floor(Math.random() * 600);
  return Math.min(baseMs + jitterMs, 30000);
}

/**
 * Parse Retry-After header safely.
 */
function parseRetryAfter(response: Response): number | undefined {
  const retryHeader = response.headers.get('Retry-After');
  if (!retryHeader) return undefined;
  const parsed = parseInt(retryHeader, 10);
  if (!isNaN(parsed) && parsed > 0) return parsed;
  return undefined;
}

/**
 * Extracts structured candidate profile using Gemini API with rate limiting,
 * exponential backoff, model fallback, and output validation.
 */
export async function extractCvWithGemini(
  rawText: string,
  fileName: string
): Promise<ExtractedCvResult> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();

  if (!apiKey) {
    return {
      success: false,
      isFallback: true,
      confidence: 'LOW',
      fieldWarnings: { general: 'GEMINI_API_KEY is not configured.' },
      error: 'GEMINI_API_KEY not configured',
    };
  }

  if (!rawText || rawText.trim().length < 25) {
    return {
      success: false,
      isFallback: true,
      confidence: 'LOW',
      fieldWarnings: { general: 'CV text is too short for extraction.' },
      error: 'CV text insufficient',
    };
  }

  // Build candidate models: Primary then Fallback
  const candidateModels: string[] = [PRIMARY_GEMINI_MODEL];
  const isFallbackSupported = await isGeminiModelSupported(FALLBACK_GEMINI_MODEL, apiKey);
  if (isFallbackSupported) {
    candidateModels.push(FALLBACK_GEMINI_MODEL);
  } else {
    const isAltSupported = await isGeminiModelSupported('gemini-2.5-flash', apiKey);
    if (isAltSupported) candidateModels.push('gemini-2.5-flash');
  }

  const prompt = `Extract all structured fields from this candidate resume:\n\n--- RESUME TEXT (${fileName}) ---\n${rawText}\n--- END RESUME TEXT ---`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: CV_EXTRACTION_SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      topP: 0.8,
    },
  };

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const modelName = candidateModels[mIdx];
    const isModelFallback = mIdx > 0;

    for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      await rateLimiter.acquire();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        rateLimiter.release();

        if (response.ok) {
          const jsonRes: any = await response.json();
          const rawContent = jsonRes?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!rawContent) {
            console.warn(`[Gemini CV] Model ${modelName} returned empty text.`);
            break; // Try next model
          }

          let parsedJson: any;
          try {
            parsedJson = JSON.parse(rawContent);
          } catch {
            const match = rawContent.match(/\{[\s\S]*\}/);
            if (match) parsedJson = JSON.parse(match[0]);
            else throw new Error('Malformed JSON output from model');
          }

          const validated = validateAndSanitizeCvJson(parsedJson, rawText);
          return {
            success: true,
            profile: validated.profile,
            modelUsed: modelName,
            isFallback: isModelFallback,
            confidence: validated.confidence,
            fieldWarnings: validated.warnings,
          };
        }

        const statusCode = response.status;
        const retryAfter = parseRetryAfter(response);

        // Check if daily quota is completely exhausted
        if (statusCode === 429) {
          const errBody = await response.text().catch(() => '');
          const isDailyQuotaExhausted = errBody.includes('Quota exceeded') ||
                                        errBody.includes('RESOURCE_EXHAUSTED') ||
                                        errBody.includes('daily limit');

          if (isDailyQuotaExhausted) {
            console.warn(`[Gemini CV] Daily quota exhausted on ${modelName}. Flagging quota exhaustion.`);
            return {
              success: false,
              isFallback: true,
              isQuotaExhausted: true,
              confidence: 'LOW',
              fieldWarnings: { quota: 'Gemini daily API quota exhausted. Retry available once quota resets.' },
              error: 'QUOTA_EXHAUSTED',
            };
          }
        }

        if (RETRYABLE_STATUS_CODES.has(statusCode)) {
          if (attempt < GEMINI_MAX_RETRIES) {
            const delay = getBackoffDelay(attempt, retryAfter);
            console.log(`[Gemini CV] Status ${statusCode} on ${modelName}. Retrying in ${Math.round(delay / 1000)}s...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
        }

        if (NON_RETRYABLE_STATUS_CODES.has(statusCode)) {
          console.warn(`[Gemini CV] Non-retryable status ${statusCode} from ${modelName}.`);
          break; // Try next model or fallback
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        rateLimiter.release();

        if (attempt < GEMINI_MAX_RETRIES) {
          const delay = getBackoffDelay(attempt);
          console.warn(`[Gemini CV] Network/timeout error (${err?.message}). Retrying in ${Math.round(delay / 1000)}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
    }
  }

  return {
    success: false,
    isFallback: true,
    confidence: 'LOW',
    fieldWarnings: { general: 'Gemini extraction attempts exhausted. Engaging deterministic fallback.' },
    error: 'ALL_GEMINI_ATTEMPTS_EXHAUSTED',
  };
}

/**
 * Validates and sanitizes structured CV fields returned by Gemini.
 * Identifies field-level anomalies, contradictory dates, or missing critical fields.
 */
export function validateAndSanitizeCvJson(
  raw: any,
  originalText: string
): {
  profile: Partial<CandidateParsedProfile> & {
    noticePeriod?: string | null;
    currentSalary?: string | null;
    expectedSalary?: string | null;
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NEEDS_REVIEW';
  warnings: Record<string, string>;
} {
  const warnings: Record<string, string> = {};

  // Clean Name
  let name = typeof raw.name === 'string' && raw.name.trim().length > 1 ? raw.name.trim() : null;
  if (name && ['candidate', 'candidate profile', 'resume', 'cv', 'applicant'].includes(name.toLowerCase())) {
    name = null;
    warnings.name = 'Extracted name appeared to be a generic placeholder.';
  }

  // Clean Email
  let email = typeof raw.email === 'string' && raw.email.includes('@') ? raw.email.trim().toLowerCase() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    warnings.email = 'Extracted email failed format validation.';
    email = null;
  }

  // Clean Phone
  let phone = typeof raw.phone === 'string' && raw.phone.replace(/[^0-9]/g, '').length >= 7 ? raw.phone.trim() : null;

  // Skills
  const rawSkills: string[] = Array.isArray(raw.skills) ? raw.skills : [];
  const rawTech: string[] = Array.isArray(raw.technologies) ? raw.technologies : [];
  const combinedSkills = Array.from(new Set([...rawSkills, ...rawTech]))
    .map((s) => String(s).trim())
    .filter((s) => s.length > 1 && s.length < 50 && !['experience', 'responsible', 'various', 'work'].includes(s.toLowerCase()));

  // Experience
  const experiences: CandidateExperience[] = [];
  if (Array.isArray(raw.experience)) {
    for (const exp of raw.experience) {
      if (exp && (exp.company || exp.title)) {
        experiences.push({
          company: exp.company ? String(exp.company).trim() : null,
          title: exp.title ? String(exp.title).trim() : null,
          startDate: exp.start_date ? String(exp.start_date).trim() : null,
          endDate: exp.end_date ? String(exp.end_date).trim() : null,
          duration: exp.duration ? String(exp.duration).trim() : null,
          description: exp.description ? String(exp.description).trim() : null,
        });
      }
    }
  }

  // Education
  const educations: CandidateEducation[] = [];
  if (Array.isArray(raw.education)) {
    for (const edu of raw.education) {
      if (edu && (edu.degree || edu.institution)) {
        educations.push({
          degree: edu.degree ? String(edu.degree).trim() : null,
          institution: edu.institution ? String(edu.institution).trim() : null,
          field: edu.field ? String(edu.field).trim() : null,
          year: edu.year ? String(edu.year).trim() : null,
        });
      }
    }
  }

  // Projects
  const projects: CandidateProject[] = [];
  if (Array.isArray(raw.projects)) {
    for (const proj of raw.projects) {
      if (proj && proj.name) {
        projects.push({
          name: String(proj.name).trim(),
          description: proj.description ? String(proj.description).trim() : null,
          technologies: Array.isArray(proj.technologies) ? proj.technologies.map((t: any) => String(t).trim()) : [],
        });
      }
    }
  }

  // Certifications
  const certifications: CandidateCertification[] = [];
  if (Array.isArray(raw.certifications)) {
    for (const cert of raw.certifications) {
      const cName = typeof cert === 'string' ? cert : cert?.name;
      if (cName && String(cName).trim().length > 2) {
        certifications.push({
          name: String(cName).trim(),
          issuer: cert?.issuer ? String(cert.issuer).trim() : null,
          year: cert?.year ? String(cert.year).trim() : null,
        });
      }
    }
  }

  // Experience calculation
  let totalYears: number | undefined = undefined;
  if (typeof raw.total_experience_years === 'number' && raw.total_experience_years > 0 && raw.total_experience_years < 60) {
    totalYears = parseFloat(raw.total_experience_years.toFixed(1));
  }

  const expString = totalYears !== undefined ? `${totalYears} yrs` : (experiences.length > 0 ? `${experiences.length} yrs` : null);

  // Confidence assessment
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NEEDS_REVIEW' = 'HIGH';
  if (!name || (!email && !phone)) {
    confidence = 'NEEDS_REVIEW';
    warnings.contact = 'Missing full name or complete contact information.';
  } else if (combinedSkills.length === 0 && experiences.length === 0) {
    confidence = 'NEEDS_REVIEW';
    warnings.content = 'No verified skills or experience entries found.';
  } else if (combinedSkills.length < 3 || experiences.length === 0) {
    confidence = 'MEDIUM';
  }

  return {
    profile: {
      name,
      email,
      phone,
      location: raw.location ? String(raw.location).trim() : null,
      currentTitle: raw.current_title ? String(raw.current_title).trim() : (experiences[0]?.title || null),
      currentCompany: raw.current_company ? String(raw.current_company).trim() : (experiences[0]?.company || null),
      totalExperience: expString,
      totalExperienceYears: totalYears,
      totalExperienceMonths: totalYears ? Math.round(totalYears * 12) : undefined,
      relevantExperience: expString,
      summary: raw.summary ? String(raw.summary).trim() : null,
      skills: combinedSkills,
      technologies: combinedSkills,
      tools: Array.isArray(raw.tools) ? raw.tools.map((t: any) => String(t).trim()) : [],
      industries: Array.isArray(raw.industries) ? raw.industries.map((i: any) => String(i).trim()) : [],
      education: educations,
      experience: experiences,
      projects,
      certifications,
      languages: Array.isArray(raw.languages) ? raw.languages.map((l: any) => String(l).trim()) : [],
      noticePeriod: raw.notice_period ? String(raw.notice_period).trim() : null,
      currentSalary: raw.current_salary ? String(raw.current_salary).trim() : null,
      expectedSalary: raw.expected_salary ? String(raw.expected_salary).trim() : null,
    },
    confidence,
    warnings,
  };
}

