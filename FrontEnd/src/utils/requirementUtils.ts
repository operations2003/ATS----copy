export const SUPPORTED_CATEGORIES = [
  'Experience',
  'Technical Skill',
  'Functional Skill',
  'Technology',
  'Tool',
  'Education',
  'Certification',
  'Industry',
  'Language',
  'Other'
] as const;

export type SupportedCategory = typeof SUPPORTED_CATEGORIES[number];

/**
 * Validates if a string is one of the supported categories
 */
export const isValidCategory = (category: string): boolean => {
  if (!category || typeof category !== 'string') return false;
  return SUPPORTED_CATEGORIES.some(c => c.toLowerCase() === category.trim().toLowerCase());
};

/**
 * Normalizes a category string to the canonical SupportedCategory casing
 */
export const normalizeCategory = (category: string | null | undefined): SupportedCategory => {
  if (!category || typeof category !== 'string') return 'Other';
  const trimmed = category.trim().toLowerCase();
  
  // Mapping synonyms to supported categories
  if (trimmed.includes('exp')) return 'Experience';
  if (trimmed.includes('tech skill') || trimmed.includes('technical skill') || trimmed === 'technical') return 'Technical Skill';
  if (trimmed.includes('func skill') || trimmed.includes('functional skill') || trimmed === 'functional') return 'Functional Skill';
  if (trimmed.includes('tech') || trimmed.includes('technology')) return 'Technology';
  if (trimmed.includes('tool') || trimmed.includes('software')) return 'Tool';
  if (trimmed.includes('edu') || trimmed.includes('degree') || trimmed.includes('education')) return 'Education';
  if (trimmed.includes('certif')) return 'Certification';
  if (trimmed.includes('industr') || trimmed.includes('domain')) return 'Industry';
  if (trimmed.includes('lang')) return 'Language';

  const matched = SUPPORTED_CATEGORIES.find(c => c.toLowerCase() === trimmed);
  return matched || 'Other';
};

/**
 * Verifies if the source evidence string exists in the original JD text.
 * Returns true if evidence is found in raw JD text (normalizing whitespace/casing).
 */
export const verifyEvidenceInJd = (sourceEvidence: string | null | undefined, jdText: string | null | undefined): boolean => {
  if (!sourceEvidence || typeof sourceEvidence !== 'string' || !sourceEvidence.trim()) {
    return false;
  }
  if (!jdText || typeof jdText !== 'string' || !jdText.trim()) {
    return true; // If no JD text is provided, fallback to allow manually supplied sourceEvidence
  }

  const normJd = jdText.toLowerCase().replace(/\s+/g, ' ');
  const normEvidence = sourceEvidence.toLowerCase().replace(/\s+/g, ' ').trim();

  // If evidence substring or major token sequence is present in JD
  if (normJd.includes(normEvidence)) {
    return true;
  }

  // Check if at least 70% of significant words in sourceEvidence appear in JD text
  const evidenceWords = normEvidence.split(' ').filter(w => w.length > 3);
  if (evidenceWords.length === 0) return true;

  const matchedWords = evidenceWords.filter(w => normJd.includes(w));
  return (matchedWords.length / evidenceWords.length) >= 0.7;
};

/**
 * Classifies if a requirement text is Mandatory or Preferred based on explicit indicators.
 * If unclear, returns { isMandatory: false, needsVerification: true }.
 */
export const classifyRequirementMandatory = (text: string): { isMandatory: boolean; needsVerification: boolean } => {
  const lower = text.toLowerCase();

  const mandatoryKeywords = [
    'required',
    'mandatory',
    'must have',
    'essential',
    'minimum',
    'candidate must have',
    'must possess',
    'must be'
  ];

  const preferredKeywords = [
    'preferred',
    'nice to have',
    'desirable',
    'advantage',
    'plus',
    'beneficial',
    'optional'
  ];

  const hasMandatoryIndicator = mandatoryKeywords.some(kw => lower.includes(kw));
  const hasPreferredIndicator = preferredKeywords.some(kw => lower.includes(kw));

  if (hasMandatoryIndicator && !hasPreferredIndicator) {
    return { isMandatory: true, needsVerification: false };
  }

  if (hasPreferredIndicator && !hasMandatoryIndicator) {
    return { isMandatory: false, needsVerification: false };
  }

  // If unclear, default to isMandatory = false and flag needsVerification = true
  return { isMandatory: false, needsVerification: true };
};

/**
 * Detects obvious or potential duplicate requirements in a list.
 * Returns array of warning messages describing potential duplicates.
 */
export const detectDuplicateRequirements = (requirements: Array<{ id?: string; requirement: string }>): string[] => {
  const warnings: string[] = [];
  if (!requirements || requirements.length < 2) return warnings;

  // Helper to get normalized word token set
  const getTokens = (str: string) => {
    return new Set(
      str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !['and', 'for', 'with', 'the', 'in', 'of', 'to'].includes(w))
    );
  };

  for (let i = 0; i < requirements.length; i++) {
    for (let j = i + 1; j < requirements.length; j++) {
      const reqA = requirements[i].requirement.trim();
      const reqB = requirements[j].requirement.trim();

      if (reqA.toLowerCase() === reqB.toLowerCase()) {
        warnings.push(`Exact duplicate detected: "${reqA}"`);
        continue;
      }

      const tokensA = getTokens(reqA);
      const tokensB = getTokens(reqB);

      if (tokensA.size === 0 || tokensB.size === 0) continue;

      let intersectionCount = 0;
      tokensA.forEach(t => {
        if (tokensB.has(t)) intersectionCount++;
      });

      const similarityA = intersectionCount / tokensA.size;
      const similarityB = intersectionCount / tokensB.size;

      if (similarityA >= 0.8 && similarityB >= 0.8) {
        warnings.push(`Potential duplicate detected between "${reqA}" and "${reqB}"`);
      }
    }
  }

  return Array.from(new Set(warnings));
};

/**
 * Formats a Prisma requirement record to match API response schema (Section 4)
 */
export const formatRequirementObject = (req: any) => {
  return {
    id: req.id,
    jobId: req.job_id || req.jobId,
    requirement: req.requirement,
    category: normalizeCategory(req.category),
    weight: typeof req.weight === 'number' ? req.weight : 1.0,
    isMandatory: Boolean(req.is_mandatory ?? req.isMandatory),
    evidenceRequired: Boolean(req.evidence_required ?? req.evidenceRequired),
    recruiterConfirmed: Boolean(req.recruiter_confirmed ?? req.recruiterConfirmed),
    sourceEvidence: req.source_evidence || req.sourceEvidence || req.requirement,
    needsVerification: Boolean(req.needs_verification ?? req.needsVerification),
    createdAt: req.created_at || req.createdAt,
    updatedAt: req.updated_at || req.updatedAt
  };
};

// ── COMPREHENSIVE MATCH SCORE ENGINE ──────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as',
  'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'can\'t',
  'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t',
  'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it',
  'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such',
  'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s',
  'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were',
  'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s',
  'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re',
  'you\'ve', 'your', 'yours', 'yourself', 'yourselves'
]);


/**
 * 1. Skills Match Score (Weight ~40%)
 */
export const calculateSkillsScore = (
  candidateSkills: string[] = [],
  requiredSkills: string[] = []
): { score: number; matchedSkills: string[]; missingSkills: string[] } => {
  const normCand = candidateSkills.map(s => s.trim().toLowerCase());
  const normReq = requiredSkills.map(s => s.trim().toLowerCase()).filter(Boolean);

  if (normReq.length === 0) {
    // If no explicit JD skills required, evaluate based on candidate skill breadth (up to 90)
    const baseScore = Math.min(95, Math.max(60, candidateSkills.length * 12));
    return {
      score: baseScore,
      matchedSkills: candidateSkills,
      missingSkills: []
    };
  }

  const matched: string[] = [];
  const missing: string[] = [];

  requiredSkills.forEach(reqSkill => {
    const rLower = reqSkill.trim().toLowerCase();
    const isMatched = normCand.some(c => c === rLower || c.includes(rLower) || rLower.includes(c));
    if (isMatched) {
      matched.push(reqSkill);
    } else {
      missing.push(reqSkill);
    }
  });

  const matchRatio = matched.length / normReq.length;
  // Base score from required matches + bonus for extra candidate tech skills
  const bonus = Math.min(15, (candidateSkills.length - matched.length) * 1.5);
  const score = Math.min(100, Math.round(matchRatio * 85 + (bonus > 0 ? bonus : 0)));

  return {
    score,
    matchedSkills: matched,
    missingSkills: missing
  };
};

/**
 * 2. Experience Match Score (Weight ~30%)
 */
export const parseExperienceYearsNumber = (exp: string | number | null | undefined): number => {
  if (typeof exp === 'number') return exp;
  if (!exp) return 0;
  const str = String(exp).toLowerCase().trim();

  // Pattern: "X years Y months" or "X.Y years"
  const yrMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i);
  const moMatch = str.match(/(\d+)\s*(?:months?|mos?)/i);

  let total = 0;
  if (yrMatch) total += parseFloat(yrMatch[1]);
  if (moMatch) total += parseInt(moMatch[1], 10) / 12;

  if (total > 0) return parseFloat(total.toFixed(1));

  // Fallback pattern: standalone number
  const numMatch = str.match(/(\d+(?:\.\d+)?)/);
  return numMatch ? parseFloat(numMatch[1]) : 0;
};

/**
 * Extracts required years of experience from job requirements list or JD text.
 * Returns the extracted number of years (e.g. 6.0), or defaultYears (3.0) if unspecified.
 */
export const extractRequiredExperienceYears = (
  job?: {
    requirements?: Array<{ requirement?: string; category?: string }>;
    jd_text?: string;
    position?: string;
  } | null,
  defaultYears: number = 3.0
): number => {
  if (!job) return defaultYears;

  let foundYears: number | null = null;

  // 1. Scan requirements array for explicit experience years
  const reqs = job.requirements || [];
  for (const req of reqs) {
    const text = (req?.requirement || '').trim();
    const cat = (req?.category || '').toLowerCase();
    const isExpReq = cat.includes('exp') || /\b(?:experience|exp|tenure|years?|yrs?)\b/i.test(text);
    if (!isExpReq) continue;

    // "6-8 years", "6 to 8 years", "6 – 8 years"
    const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i);
    if (rangeMatch) {
      const val = parseFloat(rangeMatch[1]);
      if (!isNaN(val) && val > 0) {
        foundYears = Math.max(foundYears ?? 0, val);
        continue;
      }
    }

    // "6+ years", "6 years", "minimum 6 yrs"
    const singleMatch = text.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i);
    if (singleMatch) {
      const val = parseFloat(singleMatch[1]);
      if (!isNaN(val) && val > 0) {
        foundYears = Math.max(foundYears ?? 0, val);
      }
    }
  }

  if (foundYears !== null && foundYears > 0) {
    return foundYears;
  }

  // 2. Scan jd_text and position for experience requirements
  const fullText = `${job.position || ''}\n${job.jd_text || ''}`;
  if (fullText.trim()) {
    const patterns = [
      /(?:experience|tenure|work history)\s*(?:required|requirement|level)?\s*[:\-–]\s*(?:minimum|min|at least)?\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i,
      /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|work\s+|professional\s+|industry\s+|hands-on\s+)?(?:experience|exp)\b/i,
      /(?:minimum|min|at least|requires?|required)\s+(?:of\s+)?(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i,
      /(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+|work\s+|professional\s+)?(?:experience|exp)\b/i,
    ];

    for (const pattern of patterns) {
      const match = fullText.match(pattern);
      if (match) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val > 0 && val <= 30) {
          return val;
        }
      }
    }
  }

  return defaultYears;
};

export const calculateExperienceScore = (
  candidateExp: string | number | null | undefined,
  requiredExp: string | number | null | undefined
): { score: number; candidateYears: number; requiredYears: number } => {
  const candidateYears = parseExperienceYearsNumber(candidateExp);
  const requiredYears = parseExperienceYearsNumber(requiredExp) || 3.0; // Default 3 years if unspecified

  if (requiredYears <= 0) {
    return { score: 100, candidateYears, requiredYears: 0 };
  }

  if (candidateYears >= requiredYears) {
    return { score: 100, candidateYears, requiredYears };
  }

  // Linear match calculation: e.g. 3 years vs 6 required = 50 score
  const score = Math.min(100, Math.max(0, Math.round((candidateYears / requiredYears) * 100)));
  return { score, candidateYears, requiredYears };
};

/**
 * 3. Education Match Score (Weight ~15%)
 */
const DEGREE_TIERS: Record<string, number> = {
  phd: 4,
  doctorate: 4,
  master: 3,
  ms: 3,
  mtech: 3,
  mba: 3,
  mca: 3,
  bachelor: 2,
  be: 2,
  btech: 2,
  bs: 2,
  bsc: 2,
  bca: 2,
  diploma: 1,
  associate: 1,
};

export const calculateEducationScore = (
  candidateEdu: any[] = [],
  requiredEdu: string | string[] = []
): { score: number; candidateDegrees: string[]; requiredDegrees: string[] } => {
  const candDegrees = candidateEdu.map(e => (typeof e === 'string' ? e : e.degree || '')).filter(Boolean);
  const reqDegrees = Array.isArray(requiredEdu) ? requiredEdu : [requiredEdu].filter(Boolean);

  let maxCandTier = 1;
  for (const deg of candDegrees) {
    const dLower = deg.toLowerCase().replace(/[^a-z]/g, '');
    for (const [key, tier] of Object.entries(DEGREE_TIERS)) {
      if (dLower.includes(key) && tier > maxCandTier) {
        maxCandTier = tier;
      }
    }
  }

  let reqTier = 2; // Default Bachelor's required
  if (reqDegrees.length > 0) {
    for (const req of reqDegrees) {
      const rLower = req.toLowerCase().replace(/[^a-z]/g, '');
      for (const [key, tier] of Object.entries(DEGREE_TIERS)) {
        if (rLower.includes(key)) {
          reqTier = Math.max(reqTier, tier);
        }
      }
    }
  }

  let score = 75;
  if (maxCandTier >= reqTier) {
    score = 100;
  } else if (maxCandTier === reqTier - 1) {
    score = 80;
  } else {
    score = 60;
  }

  if (candDegrees.length === 0) score = 65;

  return {
    score,
    candidateDegrees: candDegrees.length > 0 ? candDegrees : ['Degree Listed in Profile'],
    requiredDegrees: reqDegrees.length > 0 ? reqDegrees : ['Bachelor\'s Degree in relevant field']
  };
};

/**
 * 4. Keyword Cosine Similarity & Semantic Overlap Score (Weight ~15%)
 */
export const calculateCosineSimilarity = (
  text1: string = '',
  text2: string = ''
): { cosine: number; topMatchedTerms: string[] } => {
  const tokenize = (text: string): Map<string, number> => {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    const freqMap = new Map<string, number>();
    for (const w of words) {
      freqMap.set(w, (freqMap.get(w) || 0) + 1);
    }
    return freqMap;
  };

  const map1 = tokenize(text1);
  const map2 = tokenize(text2);

  if (map1.size === 0 || map2.size === 0) {
    return { cosine: 0.5, topMatchedTerms: [] };
  }

  let dotProduct = 0;
  const matchedTerms: string[] = [];

  for (const [term, count1] of map1.entries()) {
    if (map2.has(term)) {
      const count2 = map2.get(term)!;
      dotProduct += count1 * count2;
      matchedTerms.push(term);
    }
  }

  let mag1 = 0;
  for (const count of map1.values()) mag1 += count * count;

  let mag2 = 0;
  for (const count of map2.values()) mag2 += count * count;

  const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
  const cosine = magnitude > 0 ? dotProduct / magnitude : 0;

  return {
    cosine: Math.min(1.0, parseFloat(cosine.toFixed(4))),
    topMatchedTerms: matchedTerms.slice(0, 10)
  };
};

export const calculateKeywordOverlapScore = (
  candidateText: string = '',
  jdText: string = ''
): { score: number; cosineSimilarity: number; topMatchedTerms: string[] } => {
  const { cosine, topMatchedTerms } = calculateCosineSimilarity(candidateText, jdText);

  // Resume/JD cosine similarity typically ranges from 0.15 to 0.70; scale naturally to 0-100
  const scaledScore = Math.min(100, Math.max(30, Math.round(cosine * 140)));

  return {
    score: scaledScore,
    cosineSimilarity: cosine,
    topMatchedTerms
  };
};

export interface MatchScoreBreakdown {
  mandatoryCompliance?: {
    score: number;
    weight: number;
    passed: boolean;
    failedCount: number;
  };
  technicalSkills?: {
    score: number;
    weight: number;
    matchedSkills: string[];
    missingSkills: string[];
  };
  relevantExperience?: {
    score: number;
    weight: number;
    candidateYears: number;
    requiredYears: number;
  };
  responsibilities?: {
    score: number;
    weight: number;
  };
  domainFit?: {
    score: number;
    weight: number;
  };
  skills: {
    score: number;
    weight: number;
    matchedSkills: string[];
    missingSkills: string[];
  };
  experience: {
    score: number;
    weight: number;
    candidateYears: number;
    requiredYears: number;
  };
  education: {
    score: number;
    weight: number;
    candidateDegrees: string[];
    requiredDegrees: string[];
  };
  keywords: {
    score: number;
    weight: number;
    cosineSimilarity: number;
    topMatchedTerms: string[];
  };
  keywordMatchScore?: number;
  experienceRelevanceScore?: number;
  educationCertificationScore?: number;
  parsabilityScore?: number;
  jobTitleAlignmentScore?: number;
  preferredCompliance?: {
    score: number;
    coverage: number;
    bonus: number;
    totalPreferred: number;
    matchedPreferred: number;
  };
  noGapBonus?: number;
  baseATSScore?: number;
}

export interface ComprehensiveMatchResult {
  overallScore: number; // 0 - 100
  matchLevel: 'STRONG MATCH' | 'GOOD MATCH' | 'MODERATE MATCH' | 'LOW FIT';
  mandatoryRequirementFailed: boolean;
  breakdown: MatchScoreBreakdown;
  summary: string;
}

/**
 * Detect junk / non-requirement sentences (recruiter commercials, company blurbs, exclusions, perks)
 */
export const isJunkRequirement = (text: string): boolean => {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim();
  if (t.length < 5) return true;

  // 1. Recruiter billing, commission, CTC, agency commercials
  if (/(?:fixed\s+ctc|freelance\s+recruiter|total\s+billing|billing\s+payables?|replacement\s+guarantee|placement\s+fee|incentive\s*[-:]|recruiter\s+margin|invoice\s+submission|payment\s+terms|commercials)/i.test(t)) {
    return true;
  }

  // 2. Company pitch, marketing, background blurbs
  if (/(?:bootstrapped\s+company|customers?\s+in\s+\d+\s+countries|chance\s+to\s+build\s+the\s+sales\s+motion|we(?:'re|\s+are)\s+looking\s+for\s+someone\s+climbing|founded\s+in\s+\d+|our\s+mission\s+is|about\s+(?:the\s+)?company|why\s+join\s+us|a\s+profitable\s+bootstrapped)/i.test(t)) {
    return true;
  }

  // 3. Exclusions / negative requirements ("What we're not asking for", "An MBA. Five-plus years...")
  if (/(?:what\s+we(?:'re|\s+are)\s+not\s+asking|not\s+asking\s+for|what\s+you\s+don't\s+need|who\s+this\s+is\s+not\s+for|an\s+mba\.?\s+five-plus\s+years|big-logo\s+cv|don't\s+apply\s+if)/i.test(t)) {
    return true;
  }

  // 4. Perks, benefits, compensation packages
  if (/(?:what\s+you\s+get|what\s+we\s+offer|perks\s+and\s+benefits|health\s+insurance|unlimited\s+pto|esops?|equity\s+grant|gym\s+membership|free\s+lunch)/i.test(t)) {
    return true;
  }

  return false;
};

/**
 * Safely tests if needle appears as a distinct word/token inside haystack.
 * Automatically cleans special characters and wraps in try-catch to prevent any RegExp runtime errors.
 */
export const safeWordMatch = (needle: string, haystack: string): boolean => {
  if (!needle || !haystack) return false;
  // Clean needle to strip leading/trailing non-alphanumeric punctuation
  const cleanNeedle = needle.toLowerCase().replace(/^[^a-zA-Z0-9+#.-]+|[^a-zA-Z0-9+#.-]+$/g, '').trim();
  if (cleanNeedle.length < 2) return false;

  try {
    const escaped = cleanNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`(?:^|[^a-zA-Z0-9+#.-])${escaped}(?:$|[^a-zA-Z0-9+#.-])`, 'i');
    return rx.test(haystack);
  } catch {
    return haystack.toLowerCase().includes(cleanNeedle);
  }
};

/**
 * Normalizes common tech aliases (e.g. ReactJS -> react, NodeJS -> node.js)
 */
export const normalizeSkillAlias = (token: string): string => {
  if (!token) return '';
  const low = token.toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    'reactjs': 'react',
    'react.js': 'react',
    'react js': 'react',
    'nodejs': 'node.js',
    'node.js': 'node.js',
    'node js': 'node.js',
    'mongodb': 'mongodb',
    'mongo db': 'mongodb',
    'mongo': 'mongodb',
    'expressjs': 'express.js',
    'express.js': 'express.js',
    'express js': 'express.js',
    'postgresql': 'postgresql',
    'postgres': 'postgresql',
    'postgres sql': 'postgresql',
    'nextjs': 'next.js',
    'next.js': 'next.js',
    'next js': 'next.js',
    'vuejs': 'vue',
    'vue.js': 'vue',
    'vue js': 'vue',
    'angularjs': 'angular',
    'angular.js': 'angular',
    'angular js': 'angular',
    'typescript': 'typescript',
    'ts': 'typescript',
    'javascript': 'javascript',
    'js': 'javascript',
    'golang': 'go',
    'k8s': 'kubernetes',
    'gcp': 'google cloud',
    'aws': 'aws',
    'azure': 'azure',
    'docker': 'docker',
    'rest api': 'rest api',
    'restful api': 'rest api',
    'rest apis': 'rest api',
    'graphql': 'graphql',
    'ci/cd': 'ci/cd',
    'cicd': 'ci/cd',
    // ERP, Supply Chain & Procurement
    'sap mm': 'sap mm',
    'sap materials management': 'sap mm',
    'materials management': 'sap mm',
    'sap mm solutioning': 'sap mm',
    'purchasing and procurement': 'procurement',
    'procurement and purchasing': 'procurement',
    'purchasing': 'procurement',
    'procurement': 'procurement',
    'sourcing and procurement': 'procurement',
    'strategic sourcing': 'procurement',
    'sap ibp': 'sap ibp',
    'integrated business planning': 'sap ibp',
    'sap integrated business planning': 'sap ibp',
    'supply chain planning': 'sap ibp',
    'supply chain': 'supply chain',
    'supply chain management': 'supply chain',
    'scm': 'supply chain',
    'vendor management': 'vendor management',
    'supplier management': 'vendor management',
    'stakeholder management': 'stakeholder management',
    'stakeholder engagement': 'stakeholder management',
  };
  return aliasMap[low] || low;
};

const EQUIVALENT_SKILL_DOMAINS: string[][] = [
  ['sap mm', 'sap materials management', 'materials management', 'purchasing and procurement', 'procurement', 'purchasing', 'sourcing and procurement', 'sap mm solutioning', 'vendor management', 'materials management solutioning'],
  ['sap ibp', 'integrated business planning', 'sap integrated business planning', 'supply chain planning', 'demand planning'],
  ['stakeholder management', 'client management', 'stakeholder engagement', 'cross-functional collaboration'],
  ['react', 'react.js', 'reactjs'],
  ['node.js', 'nodejs', 'node'],
  ['express', 'express.js', 'expressjs'],
  ['postgresql', 'postgres', 'psql'],
  ['mongodb', 'mongo'],
  ['kubernetes', 'k8s'],
  ['typescript', 'ts'],
  ['javascript', 'js'],
  ['golang', 'go'],
  ['docker', 'containerization'],
  ['aws', 'amazon web services'],
  ['gcp', 'google cloud platform', 'google cloud'],
];

export const areSkillsEquivalent = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const aClean = a.toLowerCase().trim();
  const bClean = b.toLowerCase().trim();
  const aNorm = normalizeSkillAlias(aClean);
  const bNorm = normalizeSkillAlias(bClean);
  if (aNorm === bNorm || aClean === bClean) return true;

  return EQUIVALENT_SKILL_DOMAINS.some(group => {
    if (group.includes(aNorm) && group.includes(bNorm)) return true;
    if (group.includes(aClean) && group.includes(bClean)) return true;
    const aHasDomain = group.some(alias => safeWordMatch(alias, aClean) || aClean.includes(alias) || safeWordMatch(alias, aNorm));
    const bHasDomain = group.some(alias => safeWordMatch(alias, bClean) || bClean.includes(alias) || safeWordMatch(alias, bNorm));
    return aHasDomain && bHasDomain;
  });
};

/**
 * 4. Parsability & Formatting Score (Weight: 15%)
 * Evaluates ATS readability, document structure, standard headings,
 * chronological date patterns, and parsing health.
 */
export const calculateParsabilityScore = (
  rawText: string = '',
  parsingMetadata?: { wordCount?: number; characterCount?: number; pageCount?: number; extractionMethod?: string } | null,
  parsingStatus?: string
): number => {
  if (parsingStatus === 'FAILED') return 20;

  const text = (rawText || '').trim();
  const wordCount = parsingMetadata?.wordCount || (text ? text.split(/\s+/).filter(Boolean).length : 0);

  // Very short text or empty text means poor parsability / image-only / corrupted
  if (wordCount < 30) return 30;
  if (wordCount < 80) return 55;
  if (wordCount < 150) return 75;

  let score = 100;

  // 1. Check for standard section headings
  const hasExperience = /(?:work\s+experience|professional\s+experience|employment\s+history|work\s+history|experience\b)/i.test(text);
  const hasEducation = /(?:education|academic\s+background|qualifications|degrees?|academic\s+history)/i.test(text);
  const hasSkills = /(?:technical\s+skills|core\s+skills|skills|technologies|competencies|tools\s*(?:&|and)\s*technologies)/i.test(text);
  const hasSummaryOrProjects = /(?:summary|professional\s+summary|profile|about\s+me|projects|certifications)/i.test(text);

  let missingHeadingsCount = 0;
  if (!hasExperience) missingHeadingsCount++;
  if (!hasEducation) missingHeadingsCount++;
  if (!hasSkills) missingHeadingsCount++;
  if (!hasSummaryOrProjects) missingHeadingsCount++;

  if (missingHeadingsCount === 1) score -= 5;
  else if (missingHeadingsCount === 2) score -= 12;
  else if (missingHeadingsCount >= 3) score -= 25;

  // 2. Chronological employment dates pattern
  const hasDates = /\b(?:19\d{2}|20\d{2})\b/.test(text) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(?:19\d{2}|20\d{2})/i.test(text) ||
    /\b(?:present|current)\b/i.test(text);

  if (!hasDates) {
    score -= 10;
  }

  // 3. Document text structure (has line breaks and readable paragraphs)
  const lineCount = text.split('\n').filter(l => l.trim().length > 0).length;
  if (lineCount < 8) {
    score -= 10;
  }

  return Math.min(100, Math.max(0, score));
};

/**
 * Evaluates candidate's job title alignment against target JD role.
 * Considers candidate's current title and past experience titles.
 * Exact match = 100%, highly related = 75-85%, related = 50-70%, distant/unrelated = 25-35%.
 */
export const calculateJobTitleAlignmentScore = (
  jobPosition: string = '',
  currentTitle: string = '',
  experienceTitles: string[] = [],
  rawText: string = ''
): number => {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(?:senior|sr|junior|jr|lead|principal|intern|associate|staff|entry\s+level|director|head\s+of|manager)\b/gi, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim();

  const targetClean = norm(jobPosition);
  if (!targetClean) return 80;

  const targetTokens = targetClean
    .split(/\s+/)
    .filter(w => w.length > 2 && !['and', 'for', 'with', 'the'].includes(w));

  const allTitles = [currentTitle, ...experienceTitles].filter(Boolean);

  let bestTitleScore = 30; // base unrelated

  for (const rawT of allTitles) {
    const tClean = norm(rawT);
    if (!tClean) continue;

    // Exact title match (ignoring seniority)
    if (tClean === targetClean || targetClean.includes(tClean) || tClean.includes(targetClean)) {
      bestTitleScore = Math.max(bestTitleScore, 100);
      break;
    }

    // Token overlap
    if (targetTokens.length > 0) {
      const matched = targetTokens.filter(tok => tClean.includes(tok));
      const overlapRatio = matched.length / targetTokens.length;

      if (overlapRatio >= 0.75) {
        bestTitleScore = Math.max(bestTitleScore, 85);
      } else if (overlapRatio >= 0.5) {
        bestTitleScore = Math.max(bestTitleScore, 70);
      } else if (overlapRatio >= 0.25) {
        bestTitleScore = Math.max(bestTitleScore, 50);
      }
    }
  }

  // If no candidate title list matched, check rawText
  if (bestTitleScore <= 35 && rawText) {
    const rawLower = rawText.toLowerCase();
    if (rawLower.includes(targetClean)) {
      bestTitleScore = 65;
    } else if (targetTokens.length > 0) {
      const inRaw = targetTokens.filter(tok => safeWordMatch(tok, rawLower));
      if (inRaw.length === targetTokens.length) {
        bestTitleScore = 55;
      }
    }
  }

  return bestTitleScore;
};

/**
 * 3. Education & Certifications Score (Weight: 12.5%)
 * Evaluates candidate degree against required degree (60%)
 * and certification credentials against JD certifications (40%).
 */
export const calculateEducationAndCertScore = (
  candidateEdu: any[] = [],
  candidateCerts: any[] = [],
  jobRequirements: Array<{ requirement?: string; category?: string; is_mandatory?: boolean }> = [],
  rawText: string = '',
  jdText: string = ''
): { score: number; degreeScore: number; certScore: number; candidateDegrees: string[]; requiredDegrees: string[] } => {
  const eduResult = calculateEducationScore(candidateEdu, ['Bachelor']);
  const degreeScore = eduResult.score;

  // Check if JD mentions or requires certifications
  const certReqs = jobRequirements.filter(r =>
    (r?.category || '').toLowerCase().includes('certif') ||
    /\b(?:certified|certification|license|credential)\b/i.test(r?.requirement || '')
  );

  const candCertStrings: string[] = [];
  if (Array.isArray(candidateCerts)) {
    for (const c of candidateCerts) {
      if (typeof c === 'string') candCertStrings.push(c);
      else if (c && typeof c === 'object' && (c.name || c.title)) candCertStrings.push(c.name || c.title);
    }
  }

  let certScore = 80; // default baseline when no explicit certs required

  if (certReqs.length > 0) {
    let matchedCerts = 0;
    for (const cr of certReqs) {
      const crText = (cr.requirement || '').toLowerCase();
      const isMatched = candCertStrings.some(cc => safeWordMatch(cc.toLowerCase(), crText) || safeWordMatch(crText, cc.toLowerCase())) ||
        safeWordMatch(crText, rawText.toLowerCase());
      if (isMatched) matchedCerts++;
    }
    const certRatio = matchedCerts / certReqs.length;
    certScore = Math.round(certRatio * 100);
    const combined = Math.round((degreeScore * 0.60) + (certScore * 0.40));
    return {
      score: Math.min(100, Math.max(0, combined)),
      degreeScore,
      certScore,
      candidateDegrees: eduResult.candidateDegrees,
      requiredDegrees: eduResult.requiredDegrees,
    };
  }

  if (candCertStrings.length > 0) {
    certScore = 100;
  }
  const combined = degreeScore >= 80 ? degreeScore : Math.round((degreeScore * 0.8) + (certScore * 0.2));
  return {
    score: Math.min(100, Math.max(0, combined)),
    degreeScore,
    certScore,
    candidateDegrees: eduResult.candidateDegrees,
    requiredDegrees: eduResult.requiredDegrees,
  };
};

export const extractContextConcepts = (text: string): { concepts: string[]; cleanTokens: string[]; years?: number } => {
  if (!text) return { concepts: [], cleanTokens: [] };
  const yrMatch = text.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i);
  const years = yrMatch ? parseFloat(yrMatch[1]) : undefined;

  const clean = text
    .replace(/\b(?:minimum|at least|proven track record of|proven track record|hands-on experience|hands-on|deep knowledge of|deep knowledge|strong knowledge of|knowledge of|proficient in|proficiency in|strong understanding of|understanding of|familiarity with|expertise in|must have|should have|ability to|responsible for|working with|working knowledge of|proven ability to|experience with|experience in|strong|solid|demonstrated|track record of|required|preferred|bonus|plus)\b/gi, ' ')
    .toLowerCase();

  const parts = clean.split(/[,;/]|\b(?:and|with|as well as|including)\b/);
  const stopWords = new Set([
    'the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'by', 'from', 'is', 'are', 'be',
    'with', 'as', 'or', 'and', 'years', 'year', 'yrs', 'role', 'team', 'project', 'work',
    'candidate', 'environment', 'solutions', 'applications', 'systems', 'processes', 'proficient',
    'proficiency', 'experience', 'knowledge', 'required', 'preferred'
  ]);

  const concepts: string[] = [];
  const cleanTokens: string[] = [];

  for (const p of parts) {
    const pTrim = p.replace(/[^a-zA-Z0-9+#.-]/g, ' ').trim();
    const words = pTrim.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));
    if (words.length > 0) {
      const cStr = words.join(' ');
      if (cStr.length >= 3 && !concepts.includes(cStr)) concepts.push(cStr);
      for (const w of words) {
        if (w.length >= 3 && !cleanTokens.includes(w)) cleanTokens.push(w);
      }
    }
  }

  return { concepts, cleanTokens, years };
};

export const computeComprehensiveMatchScore = (
  candidate: {
    skills: string[];
    totalExperience?: string | number;
    totalExperienceYears?: number;
    education?: { degree?: string; field?: string; institution?: string }[];
    rawText?: string;
    summary?: string;
    currentTitle?: string;
    certifications?: string[] | { name?: string; title?: string }[];
    experience?: Array<{ title?: string; company?: string; description?: string; duration?: string }>;
    parsingMetadata?: any;
    parsingStatus?: string;
  },
  job: {
    position: string;
    jd_text?: string;
    requirements?: {
      id?: string;
      requirement?: string;
      category?: string;
      is_mandatory?: boolean;
      weight?: number;
      source_evidence?: string;
      sourceEvidence?: string;
    }[];
  }
): ComprehensiveMatchResult => {
  const rawText = candidate.rawText || '';
  const jdFullText = job.jd_text || job.position || '';
  const candSkills = (candidate.skills || []).map(s => (s || '').toLowerCase().trim()).filter(Boolean);
  const normalizedCandSkills = candSkills.map(s => normalizeSkillAlias(s));

  // Extract candidate experience titles and descriptions for contextual matching
  const expTitles = (candidate.experience || []).map(e => e.title || '').filter(Boolean);
  const expDescriptions = (candidate.experience || []).map(e => `${e.title || ''} ${e.company || ''} ${e.description || ''}`).join(' ');

  // Extract required experience years from JD requirements or JD text
  const finalRequiredYears = extractRequiredExperienceYears(job, 3.0);

  // Parse candidate career years — use the robust parser to handle "8-10 months", "1.5 years", etc.
  let totalCareerYears = 0;
  if (typeof candidate.totalExperienceYears === 'number' && !isNaN(candidate.totalExperienceYears)) {
    totalCareerYears = candidate.totalExperienceYears;
  } else if (candidate.totalExperience) {
    totalCareerYears = parseExperienceYearsNumber(candidate.totalExperience);
  }

  // Filter out junk / commercial / exclusion requirements from evaluation
  const rawRequirements = (job.requirements && job.requirements.length > 0) ? job.requirements : [];
  const requirements = rawRequirements.filter(r => r.requirement && !isJunkRequirement(r.requirement));

  // Check if job has explicit mandatory requirements defined
  const hasExplicitMandatory = requirements.some(r =>
    Boolean(r.is_mandatory) ||
    (r.category || '').toLowerCase().includes('mandat') ||
    /\b(?:mandatory|must have|must-have|strictly required|essential|minimum requirement|required)\b/i.test(r.requirement || '')
  );

  let mandatoryRequirementFailed = false;
  let totalMandatoryWeight = 0;
  let earnedMandatoryWeight = 0;
  let mandatoryMatchedCount = 0;
  let mandatoryPartialCount = 0;
  let mandatoryMissingCount = 0;
  let mandatoryTotalCount = 0;

  let totalPreferredWeight = 0;
  let earnedPreferredWeight = 0;
  let preferredMatchedCount = 0;
  let preferredTotalCount = 0;

  let totalTechWeight = 0;
  let earnedTechWeight = 0;

  let totalExpWeight = 0;
  let earnedExpWeight = 0;

  const matchedSkillsList: string[] = [];
  const missingSkillsList: string[] = [];

  // Evaluate requirements deterministically with contextual weighting (No whole-line string matching)
  for (const req of requirements) {
    const reqText = req.requirement || '';
    const sourceEvidence = String(req.source_evidence || (req as any).sourceEvidence || '').trim();
    const reqCategory = (req.category || '').toLowerCase();
    const weight = typeof req.weight === 'number' && req.weight > 0 ? req.weight : 1.0;
    const reqLower = reqText.toLowerCase();

    // Context deconstruction for requirement and mandatory source evidence
    const reqCtx = extractContextConcepts(reqText);
    const srcCtx = sourceEvidence ? extractContextConcepts(sourceEvidence) : null;

    // 1. Identify Preferred vs Mandatory vs General
    const isPreferred = !req.is_mandatory && (
      reqCategory.includes('pref') ||
      reqCategory.includes('option') ||
      reqCategory.includes('bonus') ||
      reqCategory.includes('nice') ||
      reqCategory.includes('plus') ||
      /\b(?:preferred|nice to have|nice-to-have|good to have|optional|bonus|plus|advantageous|would be a plus)\b/i.test(reqText)
    );

    const isMandatory = !isPreferred && (
      hasExplicitMandatory
        ? Boolean(
            req.is_mandatory ||
            reqCategory.includes('mandat') ||
            /\b(?:mandatory|must have|must-have|strictly required|essential|minimum requirement|required)\b/i.test(reqText)
          )
        : (weight >= 1.0 || reqCategory.includes('exp') || reqCategory.includes('skill'))
    );

    if (isPreferred) {
      preferredTotalCount++;
      totalPreferredWeight += weight;
    } else if (isMandatory) {
      mandatoryTotalCount++;
      totalMandatoryWeight += weight;
    }

    // 2. Experience Requirements (Contextual Tenure Evaluation)
    const yearsPattern = reqLower.match(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i);
    const srcYears = srcCtx?.years;
    const requiredYears = (isMandatory && srcYears !== undefined)
      ? srcYears
      : (yearsPattern ? parseFloat(yearsPattern[1]) : (finalRequiredYears || 3.0));

    if (yearsPattern || srcYears !== undefined || reqCategory.includes('exp') || reqLower.includes('experience')) {
      const expKeywords = [
        ...reqCtx.cleanTokens,
        ...(srcCtx ? srcCtx.cleanTokens : [])
      ].filter(w => w.length > 3 && !['years', 'year', 'work', 'role', 'team', 'candidate', 'ability'].includes(w));

      let domainMatch = true;
      if (expKeywords.length > 0) {
        domainMatch = expKeywords.some(kw =>
          candSkills.some(s => s === kw || s.includes(kw)) ||
          safeWordMatch(kw, rawText) ||
          safeWordMatch(kw, expDescriptions)
        );
      }

      const candidateRelevantExp = domainMatch ? totalCareerYears : (totalCareerYears > 0 ? totalCareerYears * 0.5 : 0);
      totalExpWeight += weight;

      if (requiredYears > 0) {
        if (candidateRelevantExp >= requiredYears) {
          earnedExpWeight += (1.0 * weight);
          if (isMandatory) {
            earnedMandatoryWeight += (1.0 * weight);
            mandatoryMatchedCount++;
          } else if (isPreferred) {
            earnedPreferredWeight += (1.0 * weight);
            preferredMatchedCount++;
          }
        } else if (candidateRelevantExp >= requiredYears * 0.5) {
          const ratio = candidateRelevantExp / requiredYears;
          earnedExpWeight += (ratio * weight);
          if (isMandatory) {
            earnedMandatoryWeight += (ratio * weight);
            mandatoryPartialCount++;
            mandatoryRequirementFailed = true; // Strict mandatory knockout
          } else if (isPreferred) {
            earnedPreferredWeight += (ratio * weight);
          }
        } else {
          // Severely lacking experience
          if (isMandatory) {
            mandatoryMissingCount++;
            mandatoryRequirementFailed = true;
          }
        }
      } else {
        earnedExpWeight += (1.0 * weight);
        if (isMandatory) {
          earnedMandatoryWeight += (1.0 * weight);
          mandatoryMatchedCount++;
        } else if (isPreferred) {
          earnedPreferredWeight += (1.0 * weight);
          preferredMatchedCount++;
        }
      }
      continue;
    }

    // 3. Technical Skills, Tools, Methodologies, Certifications (Context-Aware Matching)
    if (
      reqCategory.includes('skill') ||
      reqCategory.includes('tech') ||
      reqCategory.includes('tool') ||
      reqCategory.includes('certif') ||
      reqCategory.includes('function') ||
      isPreferred ||
      isMandatory
    ) {
      // Gather contextual tokens and concepts from both requirement and source evidence
      const allTokens = Array.from(new Set([
        ...reqCtx.cleanTokens,
        ...(srcCtx ? srcCtx.cleanTokens : [])
      ]));
      const allConcepts = Array.from(new Set([
        ...reqCtx.concepts,
        ...(srcCtx ? srcCtx.concepts : [])
      ]));

      totalTechWeight += weight;
      const normReq = normalizeSkillAlias(reqText.toLowerCase());

      // Contextual evidence checking:
      // In professional experience / projects clauses = 1.0
      // In skills inventory list = 0.90
      // In summary / rawText clauses = 0.85
      // Partial token overlap = 0.50
      let evidenceFactor = 0.0;

      const inExp = expDescriptions && (
        safeWordMatch(normReq, expDescriptions) ||
        safeWordMatch(reqText.toLowerCase(), expDescriptions) ||
        allConcepts.some(c => safeWordMatch(c, expDescriptions)) ||
        allTokens.some(tok => safeWordMatch(tok, expDescriptions)) ||
        EQUIVALENT_SKILL_DOMAINS.some(group => (group.includes(normReq) || allConcepts.some(c => group.includes(c)) || group.some(alias => safeWordMatch(alias, reqText.toLowerCase()))) && group.some(alias => safeWordMatch(alias, expDescriptions)))
      );

      const inSkills = normalizedCandSkills.some(s => {
        if (!s || s.length < 2) return false;
        const sNorm = normalizeSkillAlias(s);
        return (
          normReq === s ||
          normReq === sNorm ||
          safeWordMatch(normReq, s) ||
          safeWordMatch(s, normReq) ||
          safeWordMatch(reqText.toLowerCase(), s) ||
          safeWordMatch(s, reqText.toLowerCase()) ||
          areSkillsEquivalent(s, normReq) ||
          areSkillsEquivalent(s, reqText.toLowerCase()) ||
          allConcepts.some(c => s === c || safeWordMatch(c, s) || safeWordMatch(s, c) || areSkillsEquivalent(s, c)) ||
          allTokens.some(tok => s === tok || safeWordMatch(tok, s) || safeWordMatch(s, tok) || normalizeSkillAlias(tok) === s || areSkillsEquivalent(s, tok))
        );
      }) || candSkills.some(s => {
        if (!s || s.length < 2) return false;
        return (
          safeWordMatch(normReq, s) ||
          safeWordMatch(s, normReq) ||
          safeWordMatch(reqText.toLowerCase(), s) ||
          safeWordMatch(s, reqText.toLowerCase()) ||
          areSkillsEquivalent(s, normReq) ||
          areSkillsEquivalent(s, reqText.toLowerCase()) ||
          allConcepts.some(c => safeWordMatch(c, s) || safeWordMatch(s, c) || areSkillsEquivalent(c, s) || areSkillsEquivalent(s, c)) ||
          allTokens.some(tok => safeWordMatch(tok, s) || safeWordMatch(s, tok) || areSkillsEquivalent(s, tok))
        );
      });

      const inRaw = safeWordMatch(normReq, rawText) ||
        safeWordMatch(reqText.toLowerCase(), rawText) ||
        allConcepts.some(c => safeWordMatch(c, rawText)) ||
        allTokens.some(tok => safeWordMatch(tok, rawText)) ||
        EQUIVALENT_SKILL_DOMAINS.some(group => (group.includes(normReq) || allConcepts.some(c => group.includes(c)) || group.some(alias => safeWordMatch(alias, reqText.toLowerCase()))) && group.some(alias => safeWordMatch(alias, rawText)));

      if (inExp) {
        evidenceFactor = 1.0;
      } else if (inSkills) {
        evidenceFactor = 0.90;
      } else if (inRaw) {
        evidenceFactor = 0.85;
      } else {
        const isPartial = allTokens.some(tok => candSkills.some(cs => cs.includes(tok) || tok.includes(cs) || areSkillsEquivalent(cs, tok)));
        if (isPartial) {
          evidenceFactor = 0.50;
        }
      }

      if (evidenceFactor >= 0.85) {
        matchedSkillsList.push(reqText);
        earnedTechWeight += (evidenceFactor * weight);
        if (isMandatory) {
          earnedMandatoryWeight += (1.0 * weight);
          mandatoryMatchedCount++;
        } else if (isPreferred) {
          earnedPreferredWeight += (1.0 * weight);
          preferredMatchedCount++;
        }
      } else if (evidenceFactor > 0) {
        missingSkillsList.push(reqText);
        earnedTechWeight += (evidenceFactor * weight);
        if (isMandatory) {
          earnedMandatoryWeight += (0.5 * weight);
          mandatoryPartialCount++;
        } else if (isPreferred) {
          earnedPreferredWeight += (0.5 * weight);
        }
      } else {
        missingSkillsList.push(reqText);
        if (isMandatory) {
          mandatoryMissingCount++;
        }
      }
    }
  }

  // ── PILLAR 1: Keyword & Hard Skill Matching (Weight: 35%) ───────────────────
  let keywordScore = 0;
  if (totalTechWeight > 0) {
    keywordScore = Math.min(100, Math.max(0, Math.round((earnedTechWeight / totalTechWeight) * 100)));
  } else if (requirements.length === 0) {
    const rawOverlap = calculateKeywordOverlapScore(rawText, jdFullText);
    keywordScore = rawOverlap.score;
  } else {
    keywordScore = 80;
  }

  // ── PILLAR 2: Job Title & Experience Relevance (Weight: 30%) ──────────────
  const titleAlignmentScore = calculateJobTitleAlignmentScore(job.position, candidate.currentTitle, expTitles, rawText);

  let expTenureScore = 85;
  if (finalRequiredYears > 0) {
    if (totalCareerYears >= finalRequiredYears) {
      // Meeting tenure requirement awards solid base (90) + incremental depth for relevant seniority up to 100
      const extraYears = totalCareerYears - finalRequiredYears;
      expTenureScore = Math.min(100, Math.round(90 + Math.min(extraYears * 2, 10)));
    } else {
      expTenureScore = Math.min(85, Math.max(0, Math.round((totalCareerYears / finalRequiredYears) * 85)));
    }
  } else if (totalExpWeight > 0) {
    expTenureScore = Math.min(100, Math.round((earnedExpWeight / totalExpWeight) * 92));
  } else {
    expTenureScore = totalCareerYears >= 5 ? 90 : 75;
  }

  // Combined Experience Relevance Score (Tenure 75% + Title Alignment 25%)
  // When tenure requirement is 100% satisfied (e.g. 6y / 6y), ensure experience score has a calibrated floor of at least 86%
  let experienceRelevanceScore = Math.min(100, Math.max(0, Math.round((expTenureScore * 0.75) + (titleAlignmentScore * 0.25))));
  if (finalRequiredYears > 0 && totalCareerYears >= finalRequiredYears) {
    experienceRelevanceScore = Math.max(86, experienceRelevanceScore);
  }

  // ── PILLAR 3: Semantic Overlap & Contextual Relevance (Weight: 20%) ─────────
  // Genuine semantic text similarity between candidate CV and JD context
  const keywordsResult = calculateKeywordOverlapScore(rawText, jdFullText);
  const semanticScore = Math.min(100, Math.max(25, keywordsResult.score));

  // ── PILLAR 4: Education & Certifications (Weight: 10%) ─────────────────────
  const eduCertResult = calculateEducationAndCertScore(
    candidate.education || [],
    candidate.certifications || [],
    requirements,
    rawText,
    jdFullText
  );
  const educationCertificationScore = eduCertResult.score;

  // ── PILLAR 5: Parsability & Formatting (Weight: 5%) ─────────────────────────
  const parsabilityScore = calculateParsabilityScore(rawText, candidate.parsingMetadata, candidate.parsingStatus);

  // ── FINAL ATS SCORE CALCULATION ─────────────────────────────────────────────
  // 5 Genuine Pillars:
  // Core Skills: 35%, Experience: 30%, Semantic Overlap: 20%, Education: 10%, Parsability: 5%
  const rawATSScore =
    (keywordScore * 0.35) +
    (experienceRelevanceScore * 0.30) +
    (semanticScore * 0.20) +
    (educationCertificationScore * 0.10) +
    (parsabilityScore * 0.05);

  let finalATSScore = Math.min(100, Math.max(0, Math.round(rawATSScore)));

  // ── GRADUATED MANDATORY COMPLIANCE (NO ARTIFICIAL 40% CLAMP) ────────────────
  // Never brutally reject or clamp to 40% on an isolated single gap.
  // Instead, apply a calibrated deduction proportional to mandatory compliance.
  const totalMandatoryEvaluated = mandatoryMatchedCount + mandatoryPartialCount + mandatoryMissingCount;

  if (mandatoryMissingCount === 1 && mandatoryPartialCount === 0) {
    // Exactly 1 isolated mandatory gap: Deduct 8-10 points from raw score.
    // The candidate remains in REVIEW (e.g. 72%-76%) with clear advisory.
    finalATSScore = Math.max(45, Math.round(finalATSScore - 10));
  } else if (mandatoryMissingCount === 1 && mandatoryPartialCount > 0) {
    finalATSScore = Math.max(40, Math.round(finalATSScore - 15));
  } else if (mandatoryMissingCount === 2) {
    // 2 mandatory gaps: Moderate deduction
    finalATSScore = Math.max(35, Math.min(finalATSScore - 20, 58));
  } else if (mandatoryMissingCount >= 3 || (totalMandatoryEvaluated > 0 && (mandatoryMissingCount / totalMandatoryEvaluated) >= 0.6)) {
    // 3+ mandatory gaps or majority missing: Genuine low fit
    finalATSScore = Math.min(finalATSScore - 28, 42);
  } else if (mandatoryPartialCount === 1 && mandatoryMissingCount === 0) {
    finalATSScore = Math.max(50, Math.round(finalATSScore - 4));
  }

  finalATSScore = Math.min(100, Math.max(15, finalATSScore));

  // Mandatory requirements score for compliance reporting
  let mandatoryScore = 100;
  if (totalMandatoryWeight > 0) {
    mandatoryScore = Math.round((earnedMandatoryWeight / totalMandatoryWeight) * 100);
  }

  // Interpretation Bands
  let matchLevel: 'STRONG MATCH' | 'GOOD MATCH' | 'MODERATE MATCH' | 'LOW FIT' = 'MODERATE MATCH';
  if (finalATSScore >= 80 && mandatoryMissingCount === 0) matchLevel = 'STRONG MATCH';
  else if (finalATSScore >= 68) matchLevel = 'GOOD MATCH';
  else if (finalATSScore >= 52) matchLevel = 'MODERATE MATCH';
  else matchLevel = 'LOW FIT';

  const preferredCoverage = totalPreferredWeight > 0 ? (earnedPreferredWeight / totalPreferredWeight) : 0;

  // Preserve existing UI display cards (skills, experience, education, keywords) while reflecting new metrics
  const breakdown: MatchScoreBreakdown = {
    mandatoryCompliance: {
      score: mandatoryScore,
      weight: 20,
      passed: mandatoryMissingCount === 0,
      failedCount: mandatoryMissingCount,
    },
    technicalSkills: {
      score: keywordScore,
      weight: 35,
      matchedSkills: matchedSkillsList,
      missingSkills: missingSkillsList,
    },
    relevantExperience: {
      score: experienceRelevanceScore,
      weight: 30,
      candidateYears: totalCareerYears,
      requiredYears: finalRequiredYears,
    },
    responsibilities: {
      score: 85,
      weight: 10,
    },
    domainFit: {
      score: titleAlignmentScore,
      weight: 5,
    },
    skills: {
      score: keywordScore,
      weight: 35,
      matchedSkills: matchedSkillsList,
      missingSkills: missingSkillsList,
    },
    experience: {
      score: experienceRelevanceScore,
      weight: 30,
      candidateYears: totalCareerYears,
      requiredYears: finalRequiredYears,
    },
    education: {
      score: educationCertificationScore,
      weight: 10,
      candidateDegrees: eduCertResult.candidateDegrees,
      requiredDegrees: eduCertResult.requiredDegrees,
    },
    keywords: {
      score: semanticScore,
      weight: 20,
      cosineSimilarity: keywordsResult.cosineSimilarity,
      topMatchedTerms: keywordsResult.topMatchedTerms,
    },
    keywordMatchScore: keywordScore,
    experienceRelevanceScore,
    educationCertificationScore,
    parsabilityScore,
    jobTitleAlignmentScore: titleAlignmentScore,
    preferredCompliance: {
      score: Math.round(preferredCoverage * 100),
      coverage: parseFloat(preferredCoverage.toFixed(2)),
      bonus: 0,
      totalPreferred: preferredTotalCount,
      matchedPreferred: preferredMatchedCount,
    },
    noGapBonus: 0,
    baseATSScore: finalATSScore,
  };

  const summary = `${matchLevel} (${finalATSScore}% overall). 5-Pillar ATS: Core Skills (35%): ${keywordScore}%, Experience & Title (30%): ${experienceRelevanceScore}%, Semantic Overlap (20%): ${semanticScore}%, Education & Certs (10%): ${educationCertificationScore}%, Parsability (5%): ${parsabilityScore}%.`;

  return {
    overallScore: finalATSScore,
    matchLevel,
    mandatoryRequirementFailed: mandatoryMissingCount >= 2,
    breakdown,
    summary,
  };
};
