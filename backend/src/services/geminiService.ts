/**
 * Gemini Semantic Understanding Service
 *
 * Dedicated backend service that uses Google Gemini 2.5 Flash to understand Job Descriptions (JDs)
 * semantically without hallucination or word-chopping.
 *
 * Capabilities:
 * - Extracts structural JD components: Job title, summary, experience, education, responsibilities.
 * - Categorizes requirements into Mandatory vs Preferred based on natural language context.
 * - Normalizes technology requirements with aliases & related terms (e.g. "React" with aliases ["React.js", "ReactJS"]).
 * - Prevents generic word extraction (e.g. "work", "closely", "team" are ignored).
 * - Enforces structured JSON schema output and provides resilient timeout & error handling.
 */

export interface NormalizedRequirement {
  name: string;
  category:
    | "Technical Skill"
    | "Experience"
    | "Education"
    | "Tool"
    | "Framework"
    | "Database"
    | "Cloud"
    | "Architecture"
    | "Soft Skill"
    | "Certification"
    | "Other";
  description: string;
  aliases: string[];
  related_terms: string[];
  context: string;
  weight?: number;
}

export interface NormalizedJdSchema {
  job_title: string;
  summary: string;
  experience: {
    minimum_years: number | null;
    maximum_years: number | null;
    description: string;
  };
  education: string[];
  mandatory_requirements: NormalizedRequirement[];
  preferred_requirements: NormalizedRequirement[];
  responsibilities: string[];
  technologies: string[];
  certifications: string[];
  domain_knowledge: string[];
  soft_skills: string[];
}

export const PRIMARY_GEMINI_MODEL = "gemini-2.5-flash-lite";
export const FALLBACK_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_TIMEOUT_MS = 45000; // 45-second timeout for large documents (e.g. 7k+ char JDs)

// HTTP Status code classifications
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);
const MAX_ATTEMPTS_PER_MODEL = 5; // 1 initial attempt + up to 4 retries

// In-memory cache for supported models in this API account
let cachedSupportedModels: Set<string> | null = null;
let lastModelCheckTime = 0;
const MODEL_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Checks if a candidate Gemini model is supported by the user's API account.
 * Caches results to prevent repeated API calls.
 */
export async function isGeminiModelSupported(
  modelName: string,
  apiKey: string,
): Promise<boolean> {
  const now = Date.now();
  if (cachedSupportedModels && now - lastModelCheckTime < MODEL_CACHE_TTL_MS) {
    return (
      cachedSupportedModels.has(modelName) ||
      cachedSupportedModels.has(`models/${modelName}`)
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      {
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data.models)) {
        const supported = new Set<string>();
        for (const m of data.models) {
          const rawName = String(m.name || "").replace(/^models\//, "");
          const methods = Array.isArray(m.supportedGenerationMethods)
            ? m.supportedGenerationMethods
            : [];
          if (methods.includes("generateContent")) {
            supported.add(rawName);
            supported.add(`models/${rawName}`);
          }
        }
        cachedSupportedModels = supported;
        lastModelCheckTime = now;
        return supported.has(modelName) || supported.has(`models/${modelName}`);
      }
    }
  } catch (err: any) {
    console.warn(
      `[Gemini] Model capability check warning: ${err?.message || err}`,
    );
  }

  // Safe heuristic fallback for confirmed supported models if query fails
  const knownSupported = new Set([
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
  ]);
  return knownSupported.has(modelName);
}

/**
 * Computes exponential backoff delay with random jitter.
 * Sequence:
 * Attempt 1 retry: wait ~1s
 * Attempt 2 retry: wait ~2s
 * Attempt 3 retry: wait ~4s
 * Attempt 4 retry: wait ~8s
 */
function getBackoffDelayMs(attempt: number): number {
  const baseMs = 1000 * Math.pow(2, attempt - 1);
  const jitterMs = Math.floor(Math.random() * 500); // 0-500ms random jitter
  return baseMs + jitterMs;
}

const JD_UNDERSTANDING_SYSTEM_PROMPT = `You are a specialized Job Description (JD) Semantic Understanding and Normalization Engine for an enterprise ATS.
Your mission is to analyze the provided Job Description text and produce a comprehensive, structured semantic interpretation.

CRITICAL EXTRACTION RULES:
1. STRICT MANDATORY FIELD FILTERING (CRITICAL FOR ACCURATE MATCHING):
   - In "mandatory_requirements", extract ONLY criteria that are truly CRUCIAL and DECISIVE for candidate qualification / knockout.
   - What BELONGS in "mandatory_requirements":
     * Core Technologies: Primary programming languages (e.g. Python, Java, TypeScript), primary frameworks (e.g. React, Spring Boot, FastAPI), primary databases (e.g. PostgreSQL, MongoDB), or primary cloud platforms (e.g. AWS, Azure, GCP).
     * Hard Technical Architecture: Core paradigms explicitly demanded (e.g. REST API design, Microservices, Distributed Systems).
     * Mandatory Domain/Experience: Concrete required years of experience (e.g. "4+ years software engineering").
   - What MUST NEVER be in "mandatory_requirements":
     * DO NOT put Soft Skills (e.g., "strong communication", "team player", "proactive", "fast learner", "problem-solving", "passionate", "attention to detail") in mandatory requirements. Place them in "soft_skills".
     * DO NOT put generic company/process boilerplate (e.g., "work in an agile team", "participate in standups", "write clean code", "cross-functional collaboration", "follow best practices") in mandatory requirements. Place them in "responsibilities".
     * DO NOT put secondary/auxiliary utility tools (e.g., Git, Jira, Slack, Postman, Trello, Confluence) in mandatory requirements unless explicitly stated as a non-negotiable dealbreaker. Place them in "preferred_requirements".
   - Keep "mandatory_requirements" focused on the high-signal, core 3 to 7 decisive criteria that determine candidate fit.

2. NEVER CHOP WORDS: Do NOT extract random generic words like "work", "closely", "team", "develop", "maintain", "scalable" as standalone requirements or skills. Complete duty statements belong in "responsibilities".

3. PREFERRED VS MANDATORY DISTINCTION:
   - Mandatory: Non-negotiable core technical prerequisites, foundational skills, and experience minimums.
   - Preferred: "Nice to have", "plus", secondary tools, auxiliary libraries, and optional domain knowledge.

4. NORMALIZATION & ALIASES (Essential for semantic matching):
   - Group naming variants under ONE normalized concept name with clean aliases.
   - For example:
     * name: "React", aliases: ["React.js", "ReactJS", "React framework"]
     * name: "Node.js", aliases: ["NodeJS", "Node", "Node runtime"]
     * name: "PostgreSQL", aliases: ["Postgres", "psql", "PostgreSQL database"]
     * name: "REST API", aliases: ["RESTful API", "REST web services", "RESTful web services", "REST APIs"]
     * name: "Kubernetes", aliases: ["K8s", "k8s cluster"]
     * name: "Docker", aliases: ["containerization", "containers"]
     * name: "AWS", aliases: ["Amazon Web Services", "Amazon cloud", "AWS cloud"]

5. EXPERIENCE:
   - Extract overall professional experience separately from technology-specific experience.

- Prioritize explicit fields such as:
  "Experience", "Experience Required",
  "Overall Experience", and "Total Experience".

- If the JD states "4-6 years", extract:
  minimum_years = 4
  maximum_years = 6

- If the JD states "9+ years", extract:
  minimum_years = 9
  maximum_years = null

- NEVER calculate the average of an experience range.

- NEVER default to 3 years or any other fixed number.

- A requirement such as "1+ year of hands-on experience in GenAI/LLM projects" is a separate technology-specific requirement. DO NOT use it to overwrite overall professional experience.

- If overall experience is not explicitly specified, return null for both minimum_years and maximum_years. Do not invent an experience threshold.

6. RESPONSIBILITIES:
   - Extract complete duty statements (e.g. "Design, build, and maintain scalable RESTful microservices").

EXPECTED JSON SCHEMA FORMAT:
{
  "job_title": "String",
  "summary": "String",
  "experience": {
    "minimum_years": null,
    "maximum_years": null,
    "description": ""
  },
  "education": ["String"],
  "mandatory_requirements": [
    {
      "name": "Normalized skill/tech name (e.g. React)",
      "category": "Technical Skill | Tool | Database | Cloud | Architecture | Experience | Education",
      "description": "Specific context from JD",
      "aliases": ["React.js", "ReactJS"],
      "related_terms": ["Next.js", "Redux"],
      "context": "Frontend web development"
    }
  ],
  "preferred_requirements": [
    {
      "name": "Normalized skill/tech name (e.g. Docker)",
      "category": "Tool | Cloud | Technical Skill",
      "description": "Specific context from JD",
      "aliases": ["containerization", "containers"],
      "related_terms": ["Kubernetes"],
      "context": "Containerized deployment"
    }
  ],
  "responsibilities": ["Full duty statements"],
  "technologies": ["List of all detected tech keywords"],
  "certifications": [],
  "domain_knowledge": [],
  "soft_skills": []
}

RETURN ONLY VALID JSON conforming to this schema. No conversational text.`;

/**
 * Calls Gemini to analyze and normalize a Job Description.
 * Returns null if the API is unavailable, times out, or returns malformed data.
 */
export async function understandJobDescriptionWithGemini(
  jdText: string,
): Promise<NormalizedJdSchema | null> {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ""
  ).trim();

  if (!apiKey) {
    console.warn(
      "[Gemini] GEMINI_API_KEY is not configured in environment variables.",
    );
    return null;
  }

  if (!jdText || jdText.trim().length < 25) {
    console.warn(
      "[Gemini] Provided JD text is too short for semantic analysis.",
    );
    return null;
  }

  console.log("[Gemini] Request started");

  const prompt = `Analyze this Job Description and return a complete, normalized semantic representation:\n\n--- JOB DESCRIPTION ---\n${jdText}\n--- END JOB DESCRIPTION ---`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: JD_UNDERSTANDING_SYSTEM_PROMPT }],
    },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      topP: 0.8,
    },
  };

  // Build model execution sequence: Primary model first, verified Fallback second
  const candidateModels: string[] = [PRIMARY_GEMINI_MODEL];

  // Verify that the fallback model is supported by the user's API account before scheduling it
  const isFallbackSupported = await isGeminiModelSupported(
    FALLBACK_GEMINI_MODEL,
    apiKey,
  );
  if (isFallbackSupported) {
    candidateModels.push(FALLBACK_GEMINI_MODEL);
  } else {
    console.warn(
      `[Gemini] Fallback model ${FALLBACK_GEMINI_MODEL} is unavailable in this API account. Checking alternative fallback...`,
    );
    const isAltSupported = await isGeminiModelSupported(
      "gemini-2.5-flash",
      apiKey,
    );
    if (isAltSupported) {
      candidateModels.push("gemini-2.5-flash");
    }
  }

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const modelName = candidateModels[mIdx];
    const isFallback = mIdx > 0;

    if (isFallback) {
      console.log("[Gemini] Fallback model activated");
    }

    console.log(`[Gemini] Model: ${modelName}`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    let shouldTryNextModel = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      console.log(`[Gemini] Attempt: ${attempt}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const jsonRes: any = await response.json();
          const rawContent =
            jsonRes?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!rawContent) {
            console.warn(
              `[Gemini] Empty candidate content returned from ${modelName}.`,
            );
            shouldTryNextModel = true;
            break;
          }

          let parsed: NormalizedJdSchema;
          try {
            parsed = JSON.parse(rawContent);
          } catch (parseErr: any) {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsed = JSON.parse(jsonMatch[0]);
            } else {
              throw parseErr;
            }
          }

          console.log(
            `[Gemini] Successfully received response from ${modelName}`,
          );
          // Sanitize & Validate output structure
          return sanitizeNormalizedJd(parsed, jdText);
        }

        const statusCode = response.status;
        const errText = await response.text().catch(() => "");

        // Non-retryable client errors (HTTP 400, 401, 403, 404): Stop immediately
        if (NON_RETRYABLE_STATUS_CODES.has(statusCode)) {
          console.error(
            `[Gemini] Non-retryable error received (${statusCode}). Halting request.`,
          );
          return null;
        }

        // Retryable temporary errors (HTTP 503, 500, 502, 504, 429)
        if (RETRYABLE_STATUS_CODES.has(statusCode)) {
          console.warn(`[Gemini] ${statusCode} received`);

          if (attempt < MAX_ATTEMPTS_PER_MODEL) {
            const delayMs = getBackoffDelayMs(attempt);
            const delaySec = (delayMs / 1000).toFixed(1);
            console.log(`[Gemini] Retrying in ${delaySec} seconds`);
            await new Promise((res) => setTimeout(res, delayMs));
            continue; // retry next attempt
          } else {
            console.warn(
              `[Gemini] Max attempts (${MAX_ATTEMPTS_PER_MODEL}) reached for model ${modelName}.`,
            );
            shouldTryNextModel = true;
            break; // switch to fallback model
          }
        }

        // Other unexpected HTTP status: log and switch model if available
        console.warn(
          `[Gemini] Unexpected status ${statusCode} from ${modelName}`,
        );
        shouldTryNextModel = true;
        break;
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err.name === "AbortError") {
          console.warn(
            `[Gemini] Model ${modelName} timed out after ${GEMINI_TIMEOUT_MS}ms.`,
          );
        } else {
          console.warn(
            `[Gemini] Network error on model ${modelName}:`,
            err?.message || err,
          );
        }

        if (attempt < MAX_ATTEMPTS_PER_MODEL) {
          const delayMs = getBackoffDelayMs(attempt);
          const delaySec = (delayMs / 1000).toFixed(1);
          console.log(`[Gemini] Retrying in ${delaySec} seconds`);
          await new Promise((res) => setTimeout(res, delayMs));
          continue;
        } else {
          shouldTryNextModel = true;
          break;
        }
      }
    }

    if (!shouldTryNextModel) {
      break;
    }
  }

  console.error(
    "[Gemini] All retry and fallback attempts exhausted. Returning graceful fallback.",
  );
  return null;
}

/**
 * Validates and normalizes the output returned by Gemini to guarantee strict types and safety.
 */
function sanitizeNormalizedJd(
  data: any,
  originalText: string,
): NormalizedJdSchema {
  const sanitizeReqList = (list: any[]): NormalizedRequirement[] => {
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (item) =>
          item && typeof item === "object" && (item.name || item.requirement),
      )
      .map((item) => {
        const name = String(item.name || item.requirement || "").trim();
        const aliases = Array.isArray(item.aliases)
          ? item.aliases.map((a: any) => String(a).trim()).filter(Boolean)
          : [];
        const related = Array.isArray(item.related_terms)
          ? item.related_terms.map((r: any) => String(r).trim()).filter(Boolean)
          : [];

        // Always ensure self-name is included in aliases for consistent lookup
        const aliasSet = new Set([
          name.toLowerCase(),
          ...aliases.map((a: string) => a.toLowerCase()),
        ]);
        const cleanAliases = Array.from(aliasSet);

        return {
          name,
          category: item.category || "Technical Skill",
          description: String(item.description || name).trim(),
          aliases: cleanAliases,
          related_terms: related,
          context: String(item.context || "").trim(),
          weight: typeof item.weight === "number" ? item.weight : 1.5,
        };
      })
      .filter((item) => item.name.length > 1);
  };

  const minExp =
    typeof data?.experience?.minimum_years === "number"
      ? data.experience.minimum_years
      : null;
  const maxExp =
    typeof data?.experience?.maximum_years === "number"
      ? data.experience.maximum_years
      : null;

  return {
    job_title: String(data?.job_title || "").trim(),
    summary: String(data?.summary || "").trim(),
    experience: {
      minimum_years: minExp,
      maximum_years: maxExp,
      description: String(data?.experience?.description || "").trim(),
    },
    education: Array.isArray(data?.education)
      ? data.education.map(String).filter(Boolean)
      : [],
    mandatory_requirements: sanitizeReqList(data?.mandatory_requirements || []),
    preferred_requirements: sanitizeReqList(data?.preferred_requirements || []),
    responsibilities: Array.isArray(data?.responsibilities)
      ? data.responsibilities.map(String).filter(Boolean)
      : [],
    technologies: Array.isArray(data?.technologies)
      ? data.technologies.map(String).filter(Boolean)
      : [],
    certifications: Array.isArray(data?.certifications)
      ? data.certifications.map(String).filter(Boolean)
      : [],
    domain_knowledge: Array.isArray(data?.domain_knowledge)
      ? data.domain_knowledge.map(String).filter(Boolean)
      : [],
    soft_skills: Array.isArray(data?.soft_skills)
      ? data.soft_skills.map(String).filter(Boolean)
      : [],
  };
}
