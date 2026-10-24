import { PythonDocumentResponse } from './pythonDocumentClient';

export interface SourceEvidenceItem<T = string> {
  value: T;
  sourceEvidence?: string;
}

export interface CandidateEducation {
  degree: string | null;
  field?: string | null;
  institution: string | null;
  year?: string | null;
  details?: string | null;
  sourceEvidence?: string;
}

export interface CandidateExperience {
  title: string | null;
  company: string | null;
  duration?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  description?: string | null;
  highlights?: string[];
  sourceEvidence?: string;
}

export interface CandidateProject {
  name: string | null;
  description?: string | null;
  technologies?: string[];
  role?: string | null;
  sourceEvidence?: string;
}

export interface CandidateCertification {
  name: string;
  issuer?: string | null;
  year?: string | null;
  sourceEvidence?: string;
}

export interface CandidateCareerGap {
  fromCompany?: string;
  toCompany?: string;
  startDate: string;
  endDate: string;
  gapMonths: number;
  gapLabel: string;
}

export interface CandidateGapAnalysis {
  hasGap: boolean;
  totalGapMonths: number;
  gaps: CandidateCareerGap[];
  statusText: string;
}

export interface CandidateParsedProfile {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  totalExperience: string | null;
  totalExperienceMonths?: number;
  totalExperienceYears?: number;
  relevantExperience?: string | null;
  summary: string | null;
  professionalSummary?: string | null;
  skills: string[];
  technologies: string[];
  tools: string[];
  industries: string[];
  education: CandidateEducation[];
  certifications: (string | CandidateCertification)[];
  languages: string[];
  experience: CandidateExperience[];
  gapAnalysis?: CandidateGapAnalysis;
  responsibilities: string[];
  achievements: string[];
  projects: CandidateProject[];
  sourceEvidence?: Record<string, string | undefined>;
  rawText: string;
  parsingStatus: 'PARSED' | 'FAILED' | 'PROCESSING' | 'UPLOADED';
  errorMessage?: string;
  validationErrors: string[];
  parsingMetadata: {
    fileName: string;
    fileType: string;
    pageCount: number;
    extractionMethod: string;
    ocrUsed: boolean;
    characterCount: number;
    wordCount: number;
  };
  debug?: {
    rawTextPreview: string;
    extractionMethod: string;
    ocrUsed: boolean;
    characterCount: number;
    wordCount: number;
    parserInputPreview: string;
    parsedCandidate: Record<string, any>;
    validationErrors: string[];
  };
}

/**
 * Validates whether the raw text is legitimate CV text or garbage (HTML, code, binary junk).
 */
export function validateCvTextQuality(rawText: string): { isValid: boolean; reason?: string } {
  if (!rawText || typeof rawText !== 'string') {
    return { isValid: false, reason: 'Extracted text is empty or document is unreadable.' };
  }

  const text = rawText
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    .trim();

  if (text.length < 30) {
    return { isValid: false, reason: 'Extracted text length is too short (< 30 characters) to be a valid CV.' };
  }

  // Reject raw PDF binary headers or postscript dumps if no text was decoded
  if (text.startsWith('%PDF-') && !text.includes('\n')) {
    return { isValid: false, reason: 'Extracted text contains unparsed raw PDF binary header data.' };
  }

  // A valid CV needs at least some word content (at least 4 recognizable words)
  const words = text.split(/\s+/).filter(w => /^[a-zA-Z]{2,}/.test(w));
  if (words.length < 4) {
    return { isValid: false, reason: 'Extracted text contains insufficient recognizable words to constitute a valid CV.' };
  }

  const htmlPatterns = [
    /<!doctype\s+html/i,
    /<html[\s>]/i,
    /<head[\s>]/i,
    /<body[\s>]/i,
    /<script[\s>]/i,
    /<style[\s>]/i,
    /<\/div>/i,
    /<\/span>/i,
  ];
  for (const pattern of htmlPatterns) {
    if (pattern.test(text)) {
      return { isValid: false, reason: 'Extracted text contains HTML/web markup instead of CV document content.' };
    }
  }

  // Only reject as source code if the document lacks CV sections AND matches code patterns
  const hasCvKeywords = /(?:experience|education|skills|summary|profile|projects|contact|curriculum|resume|employment|work\s+history|qualification)/i.test(text);
  if (!hasCvKeywords) {
    const codePatterns = [
      /import\s+React/i,
      /from\s+['"]react['"]/i,
      /export\s+default\s+function/i,
      /function\s+\w+\s*\(.*?\)\s*\{/,
      /const\s+\w+\s*=\s*\(\)\s*=>/,
    ];
    for (const pattern of codePatterns) {
      if (pattern.test(text)) {
        return { isValid: false, reason: 'Extracted text appears to be application source code.' };
      }
    }
  }

  const unprintableCount = (text.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g) || []).length;
  if (unprintableCount > text.length * 0.25) {
    return { isValid: false, reason: 'Extracted text contains excessive unprintable binary characters.' };
  }

  return { isValid: true };
}

/**
 * Validates email format strictly according to RFC standards.
 */
export function validateEmail(emailCandidate: string | null): string | null {
  if (!emailCandidate) return null;
  const email = emailCandidate.trim().toLowerCase().replace(/^mailto:/i, '');

  if (
    email.includes('<') ||
    email.includes('>') ||
    email.includes('doctype') ||
    email.startsWith('.') ||
    email.endsWith('.') ||
    email.includes('..') ||
    (email.includes('@email.com') && email.startsWith('.'))
  ) {
    return null;
  }

  const strictEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!strictEmailRegex.test(email)) {
    return null;
  }

  return email;
}

/**
 * Validates and normalizes phone number string.
 */
export function validatePhone(phoneCandidate: string | null): string | null {
  if (!phoneCandidate) return null;
  const raw = phoneCandidate.trim();

  if (/[a-zA-Z<>]/.test(raw)) return null;

  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return null;
  }

  if (/^(\d)\1+$/.test(digitsOnly)) {
    return null;
  }

  if (digitsOnly === '1234567890' || digitsOnly === '0123456789') {
    return null;
  }

  return raw;
}

/**
 * Extracts candidate name from the top lines of the CV.
 */
export function extractCandidateName(lines: string[], cleanText: string, fileName?: string): { name: string | null; evidence?: string } {
  const invalidNameKeywords = [
    'curriculum', 'vitae', 'resume', 'profile', 'summary', 'contact', 'email',
    'phone', 'address', 'page', 'objective', 'education', 'experience', 'skills',
    'developer', 'engineer', 'consultant', 'manager', 'specialist', 'doctype',
    'html', 'http', 'https', 'www', 'linkedin', 'github', 'portfolio', 'gender',
    'date of birth', 'nationality', 'languages', 'projects', 'declaration', 'career'
  ];

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    let line = lines[i].trim();
    line = line.replace(/^(?:name|full\s*name|candidate\s*name)\s*[:\-–]\s*/i, '').trim();

    if (!line || line.length < 2) continue;

    // Clean away contact info, email, phone, links before evaluating name
    let cleanedLine = line
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '')
      .replace(/(?:\+\d{1,3}[\s-]?)?\(?\d{3,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,5}/g, '')
      .replace(/https?:\/\/\S+|www\.\S+/g, '')
      .trim();

    // If line has delimiters like '|', '•', '–', '—', '-', ',', take the first segment
    let candidateSegment = cleanedLine;
    if (/[|•·–—\-]|,\s*/.test(cleanedLine)) {
      const parts = cleanedLine.split(/[|•·–—\-]|,\s*/).map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        candidateSegment = parts[0];
      }
    }

    if (candidateSegment.length < 2 || candidateSegment.length > 50) continue;
    if (candidateSegment.includes('@') || /\d/.test(candidateSegment) || candidateSegment.includes('/') || candidateSegment.includes(':')) continue;

    const lower = candidateSegment.toLowerCase();
    const hasInvalidKeyword = invalidNameKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(lower));
    if (hasInvalidKeyword) continue;

    const words = candidateSegment.split(/\s+/).filter(Boolean);
    if (words.length >= 1 && words.length <= 4) {
      const allAlpha = words.every(w => /^[a-zA-Z'.-]+$/.test(w));
      if (allAlpha) {
        const formatted = words
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        return { name: formatted, evidence: lines[i] };
      }
    }
  }

  if (fileName) {
    const rawBase = fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/\(\d+\)/g, '')
      .replace(/^(?:resume|cv|profile|candidate)[\s_-]*/i, '')
      .replace(/[\s_-]*(?:resume|cv|profile|candidate)$/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim();

    const nameTokens = rawBase.split(/\s+/).filter(t => t.length >= 2 && /^[a-zA-Z]+$/.test(t));
    if (nameTokens.length >= 2) {
      const formatted = nameTokens
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      return { name: formatted, evidence: `Derived from document (${rawBase})` };
    }
  }

  return { name: 'Candidate' };
}

/**
 * Helper: extracts structured sections from CV text with case-insensitivity, markdown tolerance, and flexible headers.
 */
function extractSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  
  const sectionDefinitions: { canonical: string; patterns: RegExp[] }[] = [
    {
      canonical: 'SUMMARY',
      patterns: [
        /^(?:professional\s+summary|summary|profile|about\s+me|career\s+objective|objective|executive\s+summary|about|summary\s+statement)$/i,
        /^(?:professional\s+summary|summary)[:\s\-–]/i,
      ]
    },
    {
      canonical: 'SKILLS',
      patterns: [
        /^(?:technical\s+skills|skills\s*&\s*abilities|skills\s*&\s*competencies|skills\s*&\s*expertise|technical\s+competencies|core\s+competencies(?:\s*(?:&|and)\s*skills)?|key\s+skills|areas\s+of\s+expertise|skills|technologies|technical\s+stack|tech\s+stack|competencies|proficiencies)$/i,
        /^(?:technical\s+skills|core\s+competencies(?:\s*(?:&|and)\s*skills)?|skills|technologies|tech\s+stack)[:\s\-–]/i,
      ]
    },
    {
      canonical: 'EXPERIENCE',
      patterns: [
        /^(?:work\s+experience|professional\s+experience|employment\s+history|work\s+history|experience|internships?|internship\s+experience|internship\s+history|work\s*&\s*internship\s*experience|career\s+history|relevant\s+experience)$/i,
        /^(?:work\s+experience|professional\s+experience|experience|internship\s+experience|internships?)[:\s\-–]/i,
      ]
    },
    {
      canonical: 'EDUCATION',
      patterns: [
        /^(?:education|academic\s+background|academics|qualifications|educational\s+qualifications|degrees?|education\s*&\s*training|academic\s+history)$/i,
        /^(?:education|academic\s+background)[:\s\-–]/i,
      ]
    },
    {
      canonical: 'PROJECTS',
      patterns: [
        /^(?:projects|key\s+projects|academic\s+projects|personal\s+projects|notable\s+projects|selected\s+projects|technical\s+projects)$/i,
        /^(?:projects|key\s+projects)[:\s\-–]/i,
      ]
    },
    {
      canonical: 'CERTIFICATIONS',
      patterns: [
        /^(?:certifications?|certificates?|achievements\s*&\s*certifications|achievements|awards\s*&\s*certifications|licenses\s*&\s*certifications|courses\s*&\s*certifications)$/i,
        /^(?:certifications?|certificates?)[:\s\-–]/i,
      ]
    },
    {
      canonical: 'LANGUAGES',
      patterns: [
        /^(?:languages|languages\s+known|spoken\s+languages)$/i,
        /^(?:languages|languages\s+known)[:\s\-–]/i,
      ]
    }
  ];

  const lines = text.split('\n');
  const sectionMarkers: { canonical: string; lineIndex: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.length > 55) continue;

    const cleaned = rawLine
      .replace(/^[\#\*\-\s]+/, '')
      .replace(/[:\-–—\s]+$/, '')
      .trim();

    for (const def of sectionDefinitions) {
      if (def.patterns.some(p => p.test(cleaned) || p.test(rawLine))) {
        sectionMarkers.push({ canonical: def.canonical, lineIndex: i });
        break;
      }
    }
  }

  for (let i = 0; i < sectionMarkers.length; i++) {
    const current = sectionMarkers[i];
    const nextLineIndex = i < sectionMarkers.length - 1 ? sectionMarkers[i + 1].lineIndex : lines.length;
    const contentLines = lines.slice(current.lineIndex + 1, nextLineIndex);
    sections[current.canonical] = contentLines.join('\n').trim();
  }

  return sections;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

export function parseDateToYearMonth(str: string): { year: number; month: number } | null {
  if (!str) return null;
  const trimmed = str.trim().toLowerCase();
  if (['present', 'current', 'now', 'till date', 'till now', 'to date', 'ongoing', 'active', 'continue', 'continuing', 'date'].includes(trimmed)) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }

  // 2-digit year (e.g. '22', '23', '\'22')
  if (/^'?\d{2}$/.test(trimmed)) {
    let year = parseInt(trimmed.replace(/'/, ''), 10);
    year += (year < 50 ? 2000 : 1900);
    return { year, month: 11 };
  }

  // Format: "Apr 2025", "April 2025", "Apr '25", "May, 2021", "15th Jan, 2020", "15 Jan 2020"
  const mMatch = trimmed.match(/([a-z]{3})[a-z]*\.?,?\s*'?(\d{2,4})/i);
  if (mMatch) {
    const monthKey = mMatch[1].toLowerCase().replace(/[^a-z]/g, '');
    const month = MONTH_MAP[monthKey] !== undefined ? MONTH_MAP[monthKey] : 0;
    let year = parseInt(mMatch[2], 10);
    if (year < 100) year += 2000;
    if (year >= 1970 && year <= 2035) {
      return { year, month };
    }
  }

  // Format: "12/04/2019" (DD/MM/YYYY) or "04/2019" (MM/YYYY) or "04-2019"
  const slashMatch = trimmed.match(/\b(?:(\d{1,2})[\/\.-])?(\d{1,2})[\/\.-](\d{2,4})\b/);
  if (slashMatch) {
    let month = parseInt(slashMatch[2], 10) - 1;
    let year = parseInt(slashMatch[3], 10);
    if (year < 100) year += 2000;
    if (month > 11 && slashMatch[1] && parseInt(slashMatch[1], 10) <= 12) {
      month = parseInt(slashMatch[1], 10) - 1;
    }
    month = Math.max(0, Math.min(11, month));
    if (year >= 1970 && year <= 2035) {
      return { year, month };
    }
  }

  // Format: "2021-01-01", "2021/04", "2021-04" (ISO / Year-first)
  const yearFirstMatch = trimmed.match(/\b(\d{4})\s*[\/\.-]\s*(\d{1,2})(?:\s*[\/\.-]\s*\d{1,2})?\b/);
  if (yearFirstMatch) {
    const year = parseInt(yearFirstMatch[1], 10);
    const month = Math.max(0, Math.min(11, parseInt(yearFirstMatch[2], 10) - 1));
    if (year >= 1970 && year <= 2035) {
      return { year, month };
    }
  }

  // Format: "2021"
  const yMatch = trimmed.match(/\b(19\d\d|20\d\d)\b/);
  if (yMatch) {
    return { year: parseInt(yMatch[1], 10), month: 0 };
  }

  return null;
}

export function calculateExperienceMonths(startDateStr: string | null | undefined, endDateStr: string | null | undefined): number {
  if (!startDateStr) return 0;
  const start = parseDateToYearMonth(startDateStr);
  const end = parseDateToYearMonth(endDateStr || 'Present');
  if (!start || !end) return 0;
  
  const months = (end.year - start.year) * 12 + (end.month - start.month) + 1;
  return months > 0 ? months : 1;
}

export function formatNumericExperience(totalMonths: number): string {
  if (totalMonths <= 0) return '0 yrs';
  if (totalMonths < 12) {
    return `${totalMonths} ${totalMonths === 1 ? 'month' : 'months'}`;
  }
  const years = parseFloat((totalMonths / 12).toFixed(1));
  const remainderMonths = totalMonths % 12;
  if (remainderMonths === 0) {
    return `${years} yrs`;
  }
  return `${years} yrs (${Math.floor(totalMonths / 12)}y ${remainderMonths}m)`;
}

/**
 * Calculates non-overlapping professional employment tenure in months.
 * Strictly avoids double-counting overlapping employment intervals.
 * Excludes internships, student/academic projects, or education from professional employment tenure per business rules.
 */
export function calculateNonOverlappingExperienceMonths(experiences: CandidateExperience[]): { totalMonths: number; formatted: string; evidence: string } {
  const intervals: [number, number][] = [];
  let validRolesCount = 0;

  for (const exp of experiences) {
    const titleLower = (exp.title || '').toLowerCase();
    const companyLower = (exp.company || '').toLowerCase();
    const isInternship = /\b(?:intern|internship|trainee|apprentice)\b/i.test(titleLower) || /\binternship\b/i.test(companyLower);
    const isAcademic = /\b(?:student|academic|capstone|thesis|coursework)\b/i.test(titleLower);

    if (isInternship || isAcademic) {
      continue;
    }

    let start = exp.startDate ? parseDateToYearMonth(exp.startDate) : null;
    let end = exp.endDate ? parseDateToYearMonth(exp.endDate) : (exp.startDate ? parseDateToYearMonth('Present') : null);

    if (!start && exp.duration) {
      const parsedRange = extractDateRange(exp.duration);
      if (parsedRange.startDate) {
        start = parseDateToYearMonth(parsedRange.startDate);
        end = parseDateToYearMonth(parsedRange.endDate || 'Present');
      }
    }

    if (start && end) {
      const startMonthIndex = start.year * 12 + start.month;
      const endMonthIndex = end.year * 12 + end.month;
      if (endMonthIndex >= startMonthIndex) {
        intervals.push([startMonthIndex, endMonthIndex]);
        validRolesCount++;
      }
    }
  }

  if (intervals.length === 0) {
    return { totalMonths: 0, formatted: '0 yrs', evidence: 'No dated professional employment history identified' };
  }

  // Sort intervals chronologically by start date
  intervals.sort((a, b) => a[0] - b[0]);

  // Merge overlapping or contiguous intervals
  const merged: [number, number][] = [];
  for (const [start, end] of intervals) {
    if (!merged.length || merged[merged.length - 1][1] < start) {
      merged.push([start, end]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
    }
  }

  let totalMonths = 0;
  for (const [start, end] of merged) {
    totalMonths += (end - start + 1);
  }

  const formatted = formatNumericExperience(totalMonths);
  const years = parseFloat((totalMonths / 12).toFixed(1));
  const evidence = `Calculated from ${validRolesCount} non-overlapping professional role(s): ${totalMonths} months (~${years} yrs)`;

  return { totalMonths, formatted, evidence };
}

/**
 * Extracts date range from a string (e.g., "Apr 2025 – Nov 2025", "10/2021 - 04/2023", "2021 - 2023")
 */
export function extractDateRange(text: string): { duration: string | null; startDate: string | null; endDate: string | null; cleanedText: string } {
  if (!text) {
    return { duration: null, startDate: null, endDate: null, cleanedText: text || '' };
  }

  const monthNames = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const monthPart = '(?:' + monthNames + '\\.?,?\\s*)';

  const singleDate = '(?:' +
    '(?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?' + monthPart + '(?:\'?\\d{2,4})' +
    '|' + '(?:\\d{1,2}[\\/\\.-])?\\d{1,2}[\\/\\.-]\\d{2,4}' +
    '|' + '\\d{4}[\\/\\.-]\\d{1,2}(?:[\\/\\.-]\\d{1,2})?' +
    '|' + '(?:19\\d\\d|20\\d\\d)' +
  ')';

  const separator = '(?:\\s*(?:[–—\\-~]|to|until|till|through)\\s*)';
  const endKeywords = '(?:Present|Current|Now|Ongoing|Till\\s*Date|Till\\s*Now|To\\s*Date|Date)';
  const endPart = '(?:' + singleDate + '|' + endKeywords + '|(?:\'?\\d{2}))';

  // 1. Standard range: "Jan 2020 - Dec 2023", "2019 - Present", "May, 2021 - June, 2023", "2019 - 22"
  const rangeRegex = new RegExp('\\b(' + singleDate + ')' + separator + '(' + endPart + ')\\b', 'i');
  const match = text.match(rangeRegex);
  if (match) {
    const duration = match[0].trim();
    const startDate = match[1].trim();
    const endDate = match[2].trim();
    const cleanedText = text.replace(match[0], '').trim();
    return { duration, startDate, endDate, cleanedText };
  }

  // 2. Since / From range: "Since Jan 2020", "From 2019 to Present"
  const sinceRegex = new RegExp('(?:\\b(?:since|from)\\s+)(' + singleDate + ')(?:\\s*(?:to|until|till|–|-)\\s*(' + endPart + '))?\\b', 'i');
  const sinceMatch = text.match(sinceRegex);
  if (sinceMatch) {
    const duration = sinceMatch[0].trim();
    const startDate = sinceMatch[1].trim();
    const endDate = sinceMatch[2] ? sinceMatch[2].trim() : 'Present';
    const cleanedText = text.replace(sinceMatch[0], '').trim();
    return { duration, startDate, endDate, cleanedText };
  }

  // 3. Open range: "Jan 2020 - " or "2020 -"
  const openRegex = new RegExp('\\b(' + singleDate + ')\\s*[–—\\-]\\s*$', 'i');
  const openMatch = text.match(openRegex);
  if (openMatch) {
    const duration = `${openMatch[1]} - Present`;
    const startDate = openMatch[1].trim();
    const endDate = 'Present';
    const cleanedText = text.replace(openMatch[0], '').trim();
    return { duration, startDate, endDate, cleanedText };
  }

  return { duration: null, startDate: null, endDate: null, cleanedText: text };
}

export function calculateCareerGaps(experiences: CandidateExperience[], rawText?: string): CandidateGapAnalysis {
  // Parse start/end dates for each experience
  const datedExps: { exp?: CandidateExperience; title?: string | null; company?: string | null; start: { year: number; month: number }; end: { year: number; month: number }; rawStart: string; rawEnd: string }[] = [];

  if (experiences && experiences.length > 0) {
    for (const exp of experiences) {
      let startStr = exp.startDate;
      let endStr = exp.endDate;

      if (!startStr && exp.duration) {
        const parsedRange = extractDateRange(exp.duration);
        if (parsedRange.startDate) {
          startStr = parsedRange.startDate;
          endStr = parsedRange.endDate || 'Present';
        }
      }

      if (!startStr && exp.sourceEvidence) {
        const parsedRange = extractDateRange(exp.sourceEvidence);
        if (parsedRange.startDate) {
          startStr = parsedRange.startDate;
          endStr = parsedRange.endDate || 'Present';
        }
      }

      if (startStr) {
        const s = parseDateToYearMonth(startStr);
        const e = parseDateToYearMonth(endStr || 'Present');
        if (s && e) {
          datedExps.push({
            exp,
            title: exp.title,
            company: exp.company,
            start: s,
            end: e,
            rawStart: startStr,
            rawEnd: endStr || 'Present'
          });
        }
      }
    }
  }

  // If experiences didn't yield at least 2 dated roles, scan only the EXPERIENCE section of rawText
  if (datedExps.length < 2 && rawText) {
    const expMatch = rawText.match(/(?:PROFESSIONAL\s+EXPERIENCE|WORK\s+EXPERIENCE|EMPLOYMENT\s+HISTORY|EXPERIENCE)[\s\S]*?(?=(?:TECHNICAL\s+SKILLS|SKILLS|PROJECTS|EDUCATION|ACADEMICS|CERTIFICATIONS|ACHIEVEMENTS|LANGUAGES|ADDITIONAL\s+INFORMATION)|$)/i);
    const expSegment = expMatch ? expMatch[0] : '';
    if (expSegment) {
      const rangeRegex = /\b((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}[\/\.-]\d{2,4}|\d{4}))\s*(?:[–—\-\~]|to)\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*'?\d{2,4}|\d{1,2}[\/\.-]\d{2,4}|\d{4}|Present|Current|Now|Ongoing))\b/ig;
      let match: RegExpExecArray | null;
      const seenSpans = new Set<string>();

      while ((match = rangeRegex.exec(expSegment)) !== null) {
        const sStr = match[1].trim();
        const eStr = match[2].trim();
        const spanKey = `${sStr.toLowerCase()}_${eStr.toLowerCase()}`;
        if (seenSpans.has(spanKey)) continue;
        seenSpans.add(spanKey);

        const s = parseDateToYearMonth(sStr);
        const e = parseDateToYearMonth(eStr);
        if (s && e && s.year >= 1990 && e.year >= 1990) {
          const matchIndex = match.index;
          const lineStart = expSegment.lastIndexOf('\n', matchIndex) + 1;
          const lineEnd = expSegment.indexOf('\n', matchIndex + match[0].length);
          const surroundingLine = expSegment.substring(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
          const cleanedTitle = surroundingLine.replace(match[0], '').replace(/[|•–—]/g, ' ').trim();

          datedExps.push({
            title: cleanedTitle || 'Employment Period',
            company: 'Role',
            start: s,
            end: e,
            rawStart: sStr,
            rawEnd: eStr
          });
        }
      }
    }
  }

  if (datedExps.length <= 1) {
    return {
      hasGap: false,
      totalGapMonths: 0,
      gaps: [],
      statusText: 'Continuous work history (No gap identified)'
    };
  }

  // Sort chronological (oldest to newest)
  datedExps.sort((a, b) => {
    const aVal = a.start.year * 12 + a.start.month;
    const bVal = b.start.year * 12 + b.start.month;
    return aVal - bVal;
  });

  const foundGaps: CandidateCareerGap[] = [];
  let totalGapMonths = 0;

  for (let i = 0; i < datedExps.length - 1; i++) {
    const prev = datedExps[i];
    const next = datedExps[i + 1];

    const prevEndVal = prev.end.year * 12 + prev.end.month;
    const nextStartVal = next.start.year * 12 + next.start.month;

    const diffMonths = nextStartVal - prevEndVal;

    // A gap is recognized if there are >= 2 months between employment periods
    if (diffMonths >= 2) {
      const gapYears = (diffMonths / 12).toFixed(1);
      const prevComp = prev.company || prev.title || 'Previous Position';
      const nextComp = next.company || next.title || 'Next Position';
      const gapLabel = diffMonths >= 12
        ? `${gapYears} yrs (${diffMonths} mos) gap between ${prevComp} and ${nextComp}`
        : `${diffMonths} mos gap between ${prevComp} and ${nextComp}`;

      foundGaps.push({
        fromCompany: prevComp,
        toCompany: nextComp,
        startDate: prev.rawEnd,
        endDate: next.rawStart,
        gapMonths: diffMonths,
        gapLabel
      });
      totalGapMonths += diffMonths;
    }
  }

  if (foundGaps.length === 0) {
    return {
      hasGap: false,
      totalGapMonths: 0,
      gaps: [],
      statusText: 'Continuous work history (No gap identified)'
    };
  }

  return {
    hasGap: true,
    totalGapMonths,
    gaps: foundGaps,
    statusText: `${foundGaps.length} career gap${foundGaps.length > 1 ? 's' : ''} identified (${totalGapMonths} mos total)`
  };
}

/**
 * Robust Work Experience Parser (Handles multi-line titles, companies, locations, and date lines)
 */
function parseExperienceSection(expText: string, fullText: string): CandidateExperience[] {
  let textToScan = expText;
  if (!textToScan || textToScan.trim().length < 20) {
    const expMatch = fullText.match(/(?:PROFESSIONAL\s+EXPERIENCE|WORK\s+EXPERIENCE|EMPLOYMENT\s+HISTORY|EXPERIENCE)[\s\S]*?(?=(?:TECHNICAL\s+SKILLS|SKILLS|PROJECTS|EDUCATION|ACADEMICS|CERTIFICATIONS|ACHIEVEMENTS|LANGUAGES|ADDITIONAL\s+INFORMATION)|$)/i);
    textToScan = expMatch ? expMatch[0] : fullText;
  }
  if (!textToScan) return [];

  const rawLines = textToScan.split('\n').map(l => l.trim()).filter(Boolean);
  const lines = rawLines.filter(l => !/^(?:professional\s+experience|work\s+experience|employment\s+history|experience)$/i.test(l));

  interface RawJobHeader {
    lineIndex: number;
    consumedNextLine?: boolean;
    title: string;
    company: string;
    location?: string;
    startDate: string;
    endDate: string;
    duration: string;
  }

  const jobHeaders: RawJobHeader[] = [];

  // Pre-collect unassigned date intervals across the document (supports 2-column & sidebar layouts)
  const docDateRegex = /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s*'?\d{2,4})\s*(?:[–—\-~]|to)\s*((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s*'?\d{2,4}|Present|Current|Now)\b/gi;
  const unassignedDocDates = Array.from(fullText.matchAll(docDateRegex)).map(m => ({
    duration: m[0].trim(),
    startDate: m[1].trim(),
    endDate: m[2].trim()
  }));
  let unassignedDateIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateInfo = extractDateRange(line);

    if (dateInfo.startDate) {
      let title = '';
      let company = '';
      let location = '';

      const cleanedLine = dateInfo.cleanedText.replace(/^[\#\*\-\•\–\—\s|]+|[\#\*\-\•\–\—\s|]+$/g, '').trim();

      if (cleanedLine.length >= 3) {
        if (cleanedLine.includes('|')) {
          const parts = cleanedLine.split('|').map(p => p.trim());
          title = parts[0];
          company = parts[1] || '';
          location = parts[2] || '';
        } else if (cleanedLine.includes('—') || cleanedLine.includes('–')) {
          const parts = cleanedLine.split(/[—–]/).map(p => p.trim());
          title = parts[0];
          company = parts[1] || '';
        } else if (/\s+at\s+/i.test(cleanedLine)) {
          const parts = cleanedLine.split(/\s+at\s+/i).map(p => p.trim());
          title = parts[0];
          company = parts[1] || '';
        } else {
          const isLocOnly = /^\\([^)]+\\)$/.test(cleanedLine) || /^(?:remote|hybrid|onsite|on-site|india|usa|uk|mumbai|pune|bengaluru|bangalore|hyderabad|delhi|noida|gurgaon|chennai|kolkata)$/i.test(cleanedLine.replace(/[(),]/g, '').trim());
          if (isLocOnly) {
            location = cleanedLine.replace(/[()]/g, '').trim();
          } else {
            title = cleanedLine;
          }
        }
      }

      // Check preceding 1-3 lines before date line
      const prevNonBulletLines: string[] = [];
      for (let prevIdx = i - 1; prevIdx >= 0 && prevIdx >= i - 4; prevIdx--) {
        const prevLine = lines[prevIdx];
        if (/^[•*\-–—▪▫➢✓✔\d\.\)]\s*/.test(prevLine)) break;
        if (extractDateRange(prevLine).startDate) break;
        prevNonBulletLines.unshift(prevLine);
      }

      if (prevNonBulletLines.length === 1) {
        const pLine = prevNonBulletLines[0];
        if (pLine.includes('|') || pLine.includes('—') || pLine.includes('–') || /\s+at\s+/i.test(pLine)) {
          const sep = pLine.includes('|') ? '|' : pLine.includes('—') ? '—' : pLine.includes('–') ? '–' : ' at ';
          const parts = pLine.split(sep).map(p => p.trim());
          title = parts[0];
          company = parts[1] || company;
          if (parts[2] && !location) location = parts[2];
        } else if (!title && /developer|engineer|intern|lead|architect|manager|consultant|specialist|founder|analyst|designer|director/i.test(pLine)) {
          title = pLine;
        } else if (!company) {
          company = pLine;
        }
      } else if (prevNonBulletLines.length >= 2) {
        const pLine1 = prevNonBulletLines[prevNonBulletLines.length - 2];
        const pLine2 = prevNonBulletLines[prevNonBulletLines.length - 1];

        if (!title) title = pLine1;
        if (!company) {
          if (pLine2.includes(',')) {
            const parts = pLine2.split(',').map(p => p.trim());
            company = parts[0];
            location = parts.slice(1).join(', ');
          } else {
            company = pLine2;
          }
        }
      }

      // Check following line (i + 1) if title/company was on the date line
      let consumedNextLine = false;
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !/^[•*\-–—▪▫➢✓✔\d\.\)]\s*/.test(nextLine) && !extractDateRange(nextLine).startDate) {
          const isNextTitle = /developer|engineer|intern|lead|architect|manager|consultant|specialist|founder|analyst|designer|director|programmer|tester|administrator|scientist/i.test(nextLine);
          const isCleanCompany = /LLP|Inc|Ltd|Limited|Technologies|Media|Digital|Solutions|Systems|Labs|Corp|Services|Software|Pvt|Company/i.test(cleanedLine) || !/developer|engineer|intern|consultant|manager|analyst/i.test(cleanedLine);

          if (!company || company === 'Company') {
            if (isNextTitle && isCleanCompany) {
              company = cleanedLine;
              title = nextLine;
              consumedNextLine = true;
            } else if (!isNextTitle && !isCleanCompany) {
              title = cleanedLine;
              company = nextLine;
              consumedNextLine = true;
            }
          }
        }
      }

      if (company && company.includes(',') && !location) {
        const cParts = company.split(',').map(p => p.trim());
        company = cParts[0];
        location = cParts.slice(1).join(', ');
      }

      const durMonths = calculateExperienceMonths(dateInfo.startDate, dateInfo.endDate);
      const formattedDur = dateInfo.duration
        ? `${dateInfo.duration}${durMonths > 0 ? ` • ${durMonths < 12 ? `${durMonths} mos` : `${parseFloat((durMonths/12).toFixed(1))} yrs`}` : ''}`
        : '';

      jobHeaders.push({
        lineIndex: i,
        consumedNextLine,
        title: title.trim() || 'Software Engineer',
        company: company.trim() || 'Company',
        location: location.trim() || undefined,
        startDate: dateInfo.startDate,
        endDate: dateInfo.endDate || 'Present',
        duration: formattedDur
      });
    } else {
      // Check for standalone Job Header in columnar / sidebar CV layouts (e.g. "I.T. Analyst (SAP QM/PP Lead) | TCS Ltd.")
      const isJobTitle = /\b(analyst|consultant|developer|engineer|lead|architect|manager|specialist|officer|associate|director|technician|administrator|programmer|designer|coordinator)\b/i.test(line);
      const hasCompanyOrSep = /[|—–]|\bat\b/i.test(line) || /Ltd|Inc|Pvt|Solutions|Services|Technologies|Corp|LLC/i.test(line);
      const isNotEduOrSummary = !/\b(b\.?tech|m\.?tech|b\.?e\.?|bachelor|master|degree|diploma|result-driven|summary|competencies|certifications|education)\b/i.test(line);

      if (isJobTitle && hasCompanyOrSep && isNotEduOrSummary) {
        let title = '';
        let company = '';
        if (line.includes('|')) {
          const parts = line.split('|').map(p => p.trim());
          title = parts[0];
          company = parts[1] || '';
        } else if (line.includes('—') || line.includes('–')) {
          const parts = line.split(/[—–]/).map(p => p.trim());
          title = parts[0];
          company = parts[1] || '';
        } else if (/\s+at\s+/i.test(line)) {
          const parts = line.split(/\s+at\s+/i).map(p => p.trim());
          title = parts[0];
          company = parts[1] || '';
        } else {
          title = line;
        }

        // Pair with unassigned document dates
        let matchedDate = null;
        if (unassignedDateIdx < unassignedDocDates.length) {
          matchedDate = unassignedDocDates[unassignedDateIdx++];
        }

        const durMonths = matchedDate ? calculateExperienceMonths(matchedDate.startDate, matchedDate.endDate) : 0;
        const formattedDur = matchedDate
          ? `${matchedDate.duration}${durMonths > 0 ? ` • ${durMonths < 12 ? `${durMonths} mos` : `${parseFloat((durMonths/12).toFixed(1))} yrs`}` : ''}`
          : '';

        jobHeaders.push({
          lineIndex: i,
          consumedNextLine: false,
          title: title.trim() || 'Software Engineer',
          company: company.trim() || 'Company',
          location: undefined,
          startDate: matchedDate ? matchedDate.startDate : '',
          endDate: matchedDate ? matchedDate.endDate : 'Present',
          duration: formattedDur
        });
      }
    }
  }

  const experiences: CandidateExperience[] = [];
  for (let j = 0; j < jobHeaders.length; j++) {
    const jh = jobHeaders[j];
    const startBulletLine = jh.lineIndex + (jh.consumedNextLine ? 2 : 1);
    const endBulletLine = j < jobHeaders.length - 1 ? jobHeaders[j + 1].lineIndex : lines.length;

    const bullets: string[] = [];
    for (let k = startBulletLine; k < endBulletLine; k++) {
      const bLine = lines[k];
      if (/^[•*\-–—▪▫➢✓✔\d\.\)]\s*/.test(bLine) || bLine.length > 20) {
        bullets.push(bLine.replace(/^[•*\-–—▪▫➢✓✔\d\.\)]\s*/, '').trim());
      }
    }

    experiences.push({
      title: jh.title,
      company: jh.company,
      location: jh.location,
      startDate: jh.startDate,
      endDate: jh.endDate,
      duration: jh.duration,
      description: bullets.join('\n'),
      highlights: bullets,
      sourceEvidence: `${jh.title} at ${jh.company} (${jh.startDate} – ${jh.endDate})`
    });
  }

  return experiences;
}

/**
 * Robust Education Section Parser & Fallback
 */
function parseEducationSection(eduText: string, fullText: string): CandidateEducation[] {
  const educationList: CandidateEducation[] = [];
  const textToScan = eduText || fullText;
  if (!textToScan) return [];

  const lines = textToScan.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateInfo = extractDateRange(line);
    let cleaned = dateInfo.cleanedText.replace(/^[•*\-–—▪▫➢✓✔]\s*/, '').trim();

    // Check if line mentions degree keywords
    const isEduLine = /bachelor|master|b\.?tech|b\.?e\.?|bca|mca|b\.?sc|m\.?sc|mba|diploma|degree|ph\.?d|high\s*school|secondary|university|college|institute|engineering/i.test(cleaned);

    if (isEduLine || eduText) {
      let degreeStr = '';
      let institutionStr = '';
      let cgpaStr = '';

      const cgpaMatch = cleaned.match(/(?:CGPA|GPA|Percentage|Score|Marks?)[:\s]+([\d.]+(?:\s*\/\s*\d+)?%?)/i);
      if (cgpaMatch) {
        cgpaStr = cgpaMatch[0];
        cleaned = cleaned.replace(cgpaMatch[0], '').replace(/[-–—|]\s*$/, '').trim();
      }

      if (cleaned.includes('|')) {
        const parts = cleaned.split('|').map(p => p.trim());
        degreeStr = parts[0].replace(/[-–—]\s*$/, '').trim();
        institutionStr = parts.slice(1).join(' ').trim();
      } else if (cleaned.includes('—') || cleaned.includes('–')) {
        const parts = cleaned.split(/[—–]/).map(p => p.trim());
        degreeStr = parts[0].trim();
        institutionStr = parts.slice(1).join(' ').trim();
      } else {
        degreeStr = cleaned;
      }

      if (!institutionStr && i + 1 < lines.length && !lines[i + 1].startsWith('•')) {
        const nextLine = lines[i + 1].trim();
        if (/college|university|institute|school|academy/i.test(nextLine)) {
          institutionStr = nextLine;
          i++;
        }
      }

      if (degreeStr && degreeStr.length >= 3 && !/experience|summary|skills|projects/i.test(degreeStr)) {
        educationList.push({
          degree: degreeStr,
          institution: institutionStr || 'University / Institute',
          year: dateInfo.duration,
          details: cgpaStr || null,
          sourceEvidence: line
        });
      }
    }
  }

  return educationList;
}

/**
 * Robust Projects Section Parser & Fallback
 */
function parseProjectsSection(projText: string, fullText: string): CandidateProject[] {
  const projects: CandidateProject[] = [];
  const textToScan = projText || '';
  if (!textToScan) return [];

  const lines = textToScan.split('\n').map(l => l.trim()).filter(Boolean);

  let currentProject: CandidateProject | null = null;
  const descLines: string[] = [];

  for (const line of lines) {
    const isBullet = /^[•*\-–—▪▫➢✓✔\d\.\)]\s*/.test(line);

    if (!isBullet && (line.includes('|') || line.includes('–') || line.includes('—') || /^[A-Z][A-Za-z0-9\s_-]{2,45}$/.test(line))) {
      if (currentProject) {
        currentProject.description = descLines.join('\n');
        projects.push(currentProject);
        descLines.length = 0;
      }

      let name = line;
      let techArray: string[] = [];

      if (line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());
        name = parts[0];
        if (parts[1]) {
          techArray = parts[1].split(/[,|•*]\s*/).map(t => t.trim()).filter(Boolean);
        }
      } else if (line.includes('–') || line.includes('—')) {
        const parts = line.split(/[–—]/).map(p => p.trim());
        name = parts[0];
        if (parts[1]) {
          techArray = parts[1].split(/[,|•*]\s*/).map(t => t.trim()).filter(Boolean);
        }
      }

      currentProject = {
        name: name.trim(),
        technologies: techArray,
        description: '',
        sourceEvidence: line
      };
      continue;
    }

    descLines.push(line.replace(/^[•*\-–—▪▫➢✓✔]\s*/, '').trim());
  }

  if (currentProject) {
    currentProject.description = descLines.join('\n');
    projects.push(currentProject);
  }

  return projects;
}

export const SKILL_CANONICAL_MAP: Record<string, string> = {
  'react.js': 'React',
  'reactjs': 'React',
  'next.js': 'Next.js',
  'nextjs': 'Next.js',
  'node.js': 'Node.js',
  'nodejs': 'Node.js',
  'express.js': 'Express',
  'expressjs': 'Express',
  'postgresql': 'PostgreSQL',
  'postgres': 'PostgreSQL',
  'mongodb': 'MongoDB',
  'mongo': 'MongoDB',
  'amazon web services': 'AWS',
  'google cloud platform': 'GCP',
  'google cloud': 'GCP',
  'microsoft azure': 'Azure',
  'k8s': 'Kubernetes',
  'tailwind css': 'Tailwind CSS',
  'tailwindcss': 'Tailwind CSS',
  'redux toolkit': 'Redux Toolkit',
  'rtk': 'Redux Toolkit',
  'html5': 'HTML5',
  'html': 'HTML5',
  'css3': 'CSS3',
  'css': 'CSS3',
  'restful apis': 'REST API',
  'rest apis': 'REST API',
  'rest api': 'REST API',
  'rest': 'REST API',
  'ci/cd': 'CI/CD',
  'cicd': 'CI/CD',
  'continuous integration': 'CI/CD',
  'github actions': 'GitHub Actions',
  's/4hana': 'SAP S/4HANA',
  'sap s/4hana': 'SAP S/4HANA',
  'sap s4hana': 'SAP S/4HANA',
  'lightning web components': 'LWC',
};

export function normalizeSkillName(skill: string): string {
  const clean = skill.trim();
  const lower = clean.toLowerCase();
  return SKILL_CANONICAL_MAP[lower] || clean;
}

/**
 * Robust Skills Extractor from Technical Skills Section & Full Text
 */
export function parseSkillsFromText(cleanText: string, skillsSectionText?: string): string[] {
  const skillSet = new Set<string>();

  if (skillsSectionText) {
    const skillLines = skillsSectionText.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of skillLines) {
      const cleaned = line.replace(/^[A-Za-z0-9\s&/]+:\s*/, '').replace(/^[•*\-–—▪▫➢✓✔]\s*/, '').trim();
      const tokens = cleaned.split(/[,|•*·;]\s*/).map(t => t.trim()).filter(t => t.length >= 1 && t.length <= 40);
      for (const token of tokens) {
        const pureSkill = token.replace(/\s*\([^)]*\)/g, '').trim();
        if (pureSkill.length >= 1 && !/^(skills|technical\s+skills|core\s+competencies)$/i.test(pureSkill)) {
          skillSet.add(normalizeSkillName(pureSkill));
        }
      }
    }
  }

  const knownSkillCatalog = [
    'React', 'React.js', 'Next.js', 'TypeScript', 'JavaScript', 'HTML5', 'HTML', 'CSS3', 'CSS', 'Tailwind CSS',
    'Tailwind', 'ShadCN UI', 'Redux', 'Redux Toolkit', 'Node.js', 'Express', 'Express.js', 'MERN', 'MERN Stack',
    'MEAN Stack', 'Python', 'FastAPI', 'Django', 'Flask', 'Java', 'Spring Boot', 'Spring', 'C', 'C++', 'C#',
    '.NET', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Supabase', 'Firebase', 'AWS', 'Azure', 'GCP',
    'Google Cloud', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'GitHub', 'GitLab', 'REST APIs', 'REST API',
    'Prisma ORM', 'Prisma', 'GraphQL', 'Microservices', 'Postman', 'Vercel', 'Render', 'Neon', 'Figma', 'UI/UX',
    'Bootstrap', 'Jest', 'Cypress', 'Webpack', 'Vite', 'Kafka', 'RabbitMQ', 'Linux', 'Nginx', 'Artificial Intelligence',
    'AI', 'Machine Learning', 'GenAI', 'LLM', 'Web Development', 'Full Stack', 'Frontend', 'Backend',
    'Salesforce', 'Apex', 'LWC', 'Visualforce', 'Manufacturing Cloud', 'HubSpot', 'Zoho CRM', 'CRM',
    'B2B Sales', 'B2B', 'Lead Generation', 'Cold Calling', 'Pipeline Management',
    'SAP PP', 'SAP QM', 'SAP MM', 'SAP SD', 'SAP CO', 'SAP FI', 'SAP FICO', 'SAP PM', 'SAP WM', 'SAP EWM',
    'SAP HANA', 'SAP S/4HANA', 'S/4HANA', 'SAP ERP', 'SAP ECC', 'SAP ABAP', 'SAP BASIS', 'SAP',
    'MRP', 'Material Requirements Planning', 'Quality Management', 'Production Planning', 'Shop Floor Control',
    'Master Data', 'Quality Notifications', 'Quality Inspection', 'Defects Recording', 'Inspection Plans',
    'BOM', 'Bill of Materials', 'Routing', 'Work Center', 'Batch Management', 'Six Sigma', 'Lean Manufacturing',
    'ISO 9001', 'GMP', 'LIMS', 'Supply Chain', 'Procurement', 'Excel'
  ];

  for (const skill of knownSkillCatalog) {
    const escaped = skill.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9_])${escaped}(?:[^a-zA-Z0-9_]|$)`, 'i');
    if (regex.test(cleanText)) {
      skillSet.add(normalizeSkillName(skill));
    }
  }

  // Deduplicate case-insensitively and normalize canonical names
  const result: string[] = [];
  const seen = new Set<string>();
  for (const s of skillSet) {
    const norm = s.trim();
    if (!norm) continue;
    const lower = norm.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(norm);
    }
  }

  return result;
}

/**
 * Extracts candidate location accurately without consuming preceding text
 */
export function extractCandidateLocation(lines: string[], cleanText: string): string | null {
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i].trim();
    const explicitMatch = line.match(/(?:location|address|city|residence|based in)[:\s\-–]+([^|•\n]{2,40})/i);
    if (explicitMatch && explicitMatch[1]) {
      const loc = explicitMatch[1].trim().replace(/^[:|\s\-–]+/, '').replace(/[,|\s]+$/, '');
      if (loc.length >= 2 && !/developer|engineer|summary|skills|experience/i.test(loc)) {
        return loc;
      }
    }
  }

  const cityPatterns = [
    /\b(Navi\s+Mumbai(?:,\s*Maharashtra)?|Mumbai(?:,\s*Maharashtra)?|Pune(?:,\s*Maharashtra)?|Bengaluru|Bangalore|Hyderabad|Delhi|New\s+Delhi|Noida|Gurgaon|Gurugram|Chennai|Kolkata|Ahmedabad|Jaipur|Thane|Ghansoli|Kalyan|Maharashtra|India|USA|UK|Canada|San\s+Francisco|Austin|New\s+York|London|Singapore)\b/i
  ];

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    if (/summary|experience|education|skills|projects/i.test(line)) continue;
    for (const pat of cityPatterns) {
      const m = line.match(pat);
      if (m && m[1]) {
        const fullLocMatch = line.match(new RegExp(`${m[1]}(?:,\\s*[A-Za-z\\s]+)?`, 'i'));
        return (fullLocMatch ? fullLocMatch[0] : m[1]).trim();
      }
    }
  }

  return null;
}

/**
 * Parses CV text strictly using evidence present in the text.
 */
export function extractStructuredCandidateFromText(
  rawText: string,
  fileName: string,
  docMetrics: {
    fileType: string;
    pageCount: number;
    extractionMethod: string;
    ocrUsed: boolean;
    characterCount: number;
    wordCount: number;
  }
): CandidateParsedProfile {
  const validationErrors: string[] = [];

  const qualityCheck = validateCvTextQuality(rawText);
  if (!qualityCheck.isValid) {
    validationErrors.push(qualityCheck.reason || 'Invalid CV text quality');
    return {
      name: null,
      email: null,
      phone: null,
      location: null,
      currentTitle: null,
      currentCompany: null,
      totalExperience: null,
      relevantExperience: null,
      summary: null,
      professionalSummary: null,
      skills: [],
      technologies: [],
      tools: [],
      industries: [],
      education: [],
      certifications: [],
      languages: [],
      experience: [],
      gapAnalysis: {
        hasGap: false,
        totalGapMonths: 0,
        gaps: [],
        statusText: 'No gap identified'
      },
      responsibilities: [],
      achievements: [],
      projects: [],
      sourceEvidence: {},
      rawText: rawText || '',
      parsingStatus: 'FAILED',
      errorMessage: qualityCheck.reason || 'Unable to extract valid CV text from this document.',
      validationErrors,
      parsingMetadata: {
        fileName,
        fileType: docMetrics.fileType || 'application/pdf',
        pageCount: docMetrics.pageCount || 1,
        extractionMethod: docMetrics.extractionMethod || 'failed',
        ocrUsed: docMetrics.ocrUsed || false,
        characterCount: docMetrics.characterCount || 0,
        wordCount: docMetrics.wordCount || 0,
      },
      debug: {
        rawTextPreview: (rawText || '').substring(0, 300),
        extractionMethod: docMetrics.extractionMethod || 'failed',
        ocrUsed: docMetrics.ocrUsed || false,
        characterCount: docMetrics.characterCount || 0,
        wordCount: docMetrics.wordCount || 0,
        parserInputPreview: (rawText || '').substring(0, 200),
        parsedCandidate: {},
        validationErrors,
      },
    };
  }

  const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
  const sourceEvidence: Record<string, string | undefined> = {};

  // 1. Extract discrete sections
  const sections = extractSections(cleanText);

  // 2. Email Extraction
  let email: string | null = null;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const emailMatches = cleanText.match(emailRegex);
  if (emailMatches) {
    for (const match of emailMatches) {
      const validated = validateEmail(match);
      if (validated) {
        email = validated;
        sourceEvidence['email'] = match;
        break;
      }
    }
  }

  // 3. Phone Extraction
  let phone: string | null = null;
  const phonePatterns = [
    /(?:\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}\b/g,
    /(?:\+\d{1,3}[\-\s]?)?\(?\d{3}\)?[\-\s]?\d{3}[\-\s]?\d{4}\b/g,
    /\+\d{10,14}\b/g,
  ];

  for (const pattern of phonePatterns) {
    const matches = cleanText.match(pattern);
    if (matches) {
      for (const m of matches) {
        const validated = validatePhone(m);
        if (validated) {
          phone = validated;
          sourceEvidence['phone'] = m;
          break;
        }
      }
    }
    if (phone) break;
  }

  // 4. Candidate Name Extraction
  const nameResult = extractCandidateName(lines, cleanText, fileName);
  const name = nameResult.name;
  if (nameResult.evidence) {
    sourceEvidence['name'] = nameResult.evidence;
  }

  // 5. Work Experience Extraction
  const experienceText = sections['EXPERIENCE'] || '';
  const experience = parseExperienceSection(experienceText, cleanText);

  // 6. Career Gap Analysis
  const gapAnalysis = calculateCareerGaps(experience, cleanText);

  // 7. Current Title & Company Extraction
  let currentTitle: string | null = null;
  let currentCompany: string | null = null;

  const isInvalidCompany = (c?: string | null): boolean => {
    if (!c) return true;
    const s = c.trim().toLowerCase();
    return [
      'company', 'the company', 'role', 'the role', 'this role', 'position', 'the position',
      'organization', 'experience', 'present', 'employment', 'project', 'projects',
      'self-employed', 'freelance', 'unknown', 'not specified', 'candidate profile', 'verified organization'
    ].includes(s) || s.length < 2;
  };

  if (experience.length > 0) {
    // Find the most recent active or latest role
    let latestExp = experience[0];
    let latestEndMonthIndex = -1;

    for (const exp of experience) {
      const endStr = (exp.endDate || '').toLowerCase().trim();
      if (['present', 'current', 'now', 'till date', 'till now', 'ongoing', 'active'].includes(endStr)) {
        latestExp = exp;
        break;
      }
      const parsedEnd = exp.endDate ? parseDateToYearMonth(exp.endDate) : null;
      if (parsedEnd) {
        const idx = parsedEnd.year * 12 + parsedEnd.month;
        if (idx > latestEndMonthIndex) {
          latestEndMonthIndex = idx;
          latestExp = exp;
        }
      }
    }

    currentTitle = latestExp.title && !['candidate profile', 'candidate', 'professional role', 'software engineer'].includes(latestExp.title.toLowerCase())
      ? latestExp.title
      : (experience[0].title || currentTitle);

    if (latestExp.company && !isInvalidCompany(latestExp.company)) {
      currentCompany = latestExp.company;
    } else {
      for (const exp of experience) {
        if (exp.company && !isInvalidCompany(exp.company)) {
          currentCompany = exp.company;
          break;
        }
      }
    }
    if (!currentCompany) {
      currentCompany = latestExp.company || experience[0].company;
    }
  }

  if (isInvalidCompany(currentCompany)) {
    currentCompany = null;
  }

  if (!currentTitle || currentTitle.trim().length === 0) {
    // Check top 8 lines for title patterns like "... Consultant", "... Manager", "... Developer", "... Engineer", etc.
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const l = lines[i].trim();
      if (l.length >= 3 && l.length <= 60 && !l.includes('@') && !/\d{5,}/.test(l) && !l.includes('http') && !l.includes('www') && !l.includes('|')) {
        if (/\b(consultant|engineer|developer|architect|manager|lead|specialist|analyst|administrator|director|executive|officer|scientist|designer|intern|associate)\b/i.test(l)) {
          if (!/^(?:experience|skills|education|projects|summary|profile|about|curriculum|resume|contact)/i.test(l)) {
            currentTitle = l;
            sourceEvidence['currentTitle'] = l;
            break;
          }
        }
      }
    }

    if (!currentTitle) {
      const titleCandidates = [
        'Web Development Intern', 'Software Development Intern', 'Software Engineer Intern', 'Engineering Intern',
        'Full Stack Developer', 'Full-Stack Developer', 'Full Stack Engineer', 'Full-Stack Engineer',
        'Senior Frontend Engineer', 'Senior Frontend Developer', 'Frontend Engineer', 'Frontend Developer',
        'Senior Backend Engineer', 'Senior Backend Developer', 'Backend Engineer', 'Backend Developer',
        'Senior Software Engineer', 'Software Engineer', 'Software Developer', 'Web Developer', 'Web Developer Intern',
        'React Developer', 'Java Developer', 'Python Developer', 'DevOps Engineer', 'Cloud Architect',
        'UI/UX Designer', 'Product Designer', 'Data Scientist', 'Data Engineer', 'Intern'
      ];

      const headerText = lines.slice(0, 8).join('\n');
      for (const t of titleCandidates) {
        const reg = new RegExp(`\\b${t.replace('/', '\\/')}\\b`, 'i');
        if (reg.test(headerText)) {
          currentTitle = t;
          sourceEvidence['currentTitle'] = t;
          break;
        }
      }
    }
  }

  // Check if company is mentioned in summary (e.g. "Founder of SJ Tech Works")
  if (!currentCompany || isInvalidCompany(currentCompany)) {
    const founderMatch = cleanText.match(/(?:founder\s+of|co-founder\s+of|working\s+at|employed\s+at)\s+([A-Za-z0-9\s&]{2,35})/i);
    if (founderMatch && founderMatch[1] && !isInvalidCompany(founderMatch[1])) {
      currentCompany = founderMatch[1].trim().replace(/[,|.\n]+$/, '');
    }
  }

  if (currentCompany && !isInvalidCompany(currentCompany)) {
    sourceEvidence['currentCompany'] = currentCompany;
  } else {
    currentCompany = null;
  }

  // 8. Total Experience Calculation (Comprehensive Multi-Pass Extractor)
  let totalExperience: string | null = null;
  let totalExperienceMonths = 0;
  let totalExperienceYears = 0;

  // Pass A: Explicit Total Experience labeled lines (e.g. "Total Experience: 5 Years 6 Months", "Overall Experience: 5+ years", "Relevant Experience: 5 Yrs")
  const explicitHeaderMatch = cleanText.match(/(?:total|overall|relevant|cumulative|career|professional|work)\s+experience\s*[:\s-]+\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?|y)?(?:\s*(?:and\s*)?(\d+)\s*(?:months?|mos?|m)?)?/i);
  if (explicitHeaderMatch) {
    const yrs = parseFloat(explicitHeaderMatch[1]);
    const mos = explicitHeaderMatch[2] ? parseInt(explicitHeaderMatch[2], 10) : 0;
    if (!isNaN(yrs) && yrs > 0 && yrs <= 55) {
      totalExperienceMonths = Math.round(yrs * 12) + mos;
      totalExperienceYears = parseFloat((totalExperienceMonths / 12).toFixed(1));
      totalExperience = formatNumericExperience(totalExperienceMonths);
      sourceEvidence['totalExperience'] = `${explicitHeaderMatch[0]} -> ${totalExperience}`;
    }
  }

  // Pass B: Inline career summary statements (e.g. "Over 5 years of experience", "having 5+ years of hands-on experience")
  const summaryExpMatches = Array.from(cleanText.matchAll(/(?:over|more\s+than|about|around|approx(?:\.|imately)?|with|having)?\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)(?:\s*(?:and\s*)?(\d+)\s*(?:months?|mos?))?\s+(?:of\s+)?(?:[a-zA-Z\s\/\-\+]{0,40})?experience\b/gi));
  // Additional check for direct tenure statements (e.g. "7.7 years of total IT experience", "5.5+ years of dedicated expertise")
  const directTenureMatches = Array.from(cleanText.matchAll(/\b(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:[a-zA-Z\s\/\-\+]{0,35})?(?:experience|tenure|background|expertise)\b/gi));
  for (const dMatch of directTenureMatches) {
    const dYears = parseFloat(dMatch[1]);
    if (!isNaN(dYears) && dYears > 0 && dYears <= 55) {
      summaryExpMatches.push(dMatch);
    }
  }
  for (const match of summaryExpMatches) {
    const parsedYears = parseFloat(match[1]);
    const addMonths = match[2] ? parseInt(match[2], 10) : 0;
    if (!isNaN(parsedYears) && parsedYears > 0 && parsedYears <= 55) {
      const computedMonths = Math.round(parsedYears * 12) + addMonths;
      if (computedMonths > totalExperienceMonths) {
        totalExperienceMonths = computedMonths;
        totalExperienceYears = parseFloat((totalExperienceMonths / 12).toFixed(1));
        totalExperience = formatNumericExperience(totalExperienceMonths);
        sourceEvidence['totalExperience'] = `${match[0]} -> ${totalExperience}`;
      }
    }
  }

  // Pass C: Word numeral mentions (e.g. "Five years of experience", "Seven+ years")
  if (!totalExperience) {
    const wordNumbers: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
    };
    const wordExpMatch = cleanText.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:\(\d+\)\s*)?(?:\+?\s*years?|\+?\s*yrs?)\s+(?:of\s+)?(?:hands-on\s*|industry\s*|professional\s*|relevant\s*|total\s*|software\s*|work\s*|IT\s*)?experience/i);
    if (wordExpMatch && wordNumbers[wordExpMatch[1].toLowerCase()]) {
      const parsedYears = wordNumbers[wordExpMatch[1].toLowerCase()];
      totalExperienceYears = parsedYears;
      totalExperienceMonths = parsedYears * 12;
      totalExperience = formatNumericExperience(totalExperienceMonths);
      sourceEvidence['totalExperience'] = `${wordExpMatch[0]} -> ${totalExperience}`;
    }
  }

  // Pass D: Calculate non-overlapping experience from parsed professional work history entries
  if (experience.length > 0) {
    const nonOverlap = calculateNonOverlappingExperienceMonths(experience);
    if (nonOverlap.totalMonths > 0) {
      if (nonOverlap.totalMonths > totalExperienceMonths) {
        totalExperienceMonths = nonOverlap.totalMonths;
        totalExperienceYears = parseFloat((nonOverlap.totalMonths / 12).toFixed(1));
        totalExperience = nonOverlap.formatted;
        sourceEvidence['totalExperience'] = nonOverlap.evidence;
      } else if (totalExperienceMonths > 0) {
        sourceEvidence['totalExperience'] = `${sourceEvidence['totalExperience']} (Tenure verified: ${nonOverlap.formatted})`;
      }
    }
  }

  // Pass E: Fallback if candidate has work experience items but dates were unformatted
  if (!totalExperience && experience.length > 0) {
    totalExperience = `${experience.length} yrs`;
    totalExperienceMonths = experience.length * 12;
    totalExperienceYears = experience.length;
    sourceEvidence['totalExperience'] = `${experience.length} documented position(s)`;
  }

  if (!totalExperience) {
    totalExperience = '0 yrs';
    totalExperienceMonths = 0;
    totalExperienceYears = 0;
  }

  // 9. Location Extraction
  const location = extractCandidateLocation(lines, cleanText);
  if (location) {
    sourceEvidence['location'] = location;
  }

  // 10. Skills Extraction
  const skillsText = sections['SKILLS'] || '';
  const skills = parseSkillsFromText(cleanText, skillsText);
  if (skills.length > 0) {
    sourceEvidence['skills'] = skills.join(', ');
  }

  // 11. Summary Extraction
  let summary: string | null = null;
  const summaryText = sections['SUMMARY'] || '';
  if (summaryText) {
    summary = summaryText.replace(/\n+/g, ' ').trim();
    sourceEvidence['summary'] = summary;
  } else {
    // If no explicit summary header, extract intro paragraph if it looks like a summary
    for (const l of lines.slice(1, 6)) {
      if (l.length > 50 && !l.includes('@') && !l.includes('|') && /developer|engineer|experienced|passionate|specialist/i.test(l)) {
        summary = l;
        break;
      }
    }
  }

  // 12. Education Extraction
  const educationText = sections['EDUCATION'] || '';
  const education = parseEducationSection(educationText, cleanText);

  // 13. Projects Extraction
  const projectsText = sections['PROJECTS'] || '';
  const projects = parseProjectsSection(projectsText, cleanText);

  // 14. Certifications Extraction
  const certsText = sections['CERTIFICATIONS'] || '';
  const certifications: string[] = [];
  const certSource = certsText || cleanText;

  if (certsText) {
    const certLines = certsText.split('\n').map(l => l.replace(/^[•*\-–—▪▫➢✓✔\d\.\)]\s*/, '').trim()).filter(Boolean);
    for (const l of certLines) {
      certifications.push(l.replace(/^Certifications?:\s*/i, '').trim());
    }
  } else {
    // Scan whole text for certification lines
    const certMatches = certSource.match(/^[•*\-–—▪▫➢✓✔]?\s*(?:Certified|Certificate|AWS\s+Certified|Meta\s+Certified|Oracle\s+Certified|Google\s+Certified|Microsoft\s+Certified)[^\n]+/gim);
    if (certMatches) {
      for (const cm of certMatches) {
        const cleanedCert = cm.replace(/^[•*\-–—▪▫➢✓✔\d\.\)]\s*/, '').trim();
        if (cleanedCert.length > 5 && !certifications.includes(cleanedCert)) {
          certifications.push(cleanedCert);
        }
      }
    }
  }

  // 15. Languages Extraction
  const languagesText = sections['LANGUAGES'] || '';
  const languages: string[] = [];
  const langList = ['English', 'Hindi', 'Marathi', 'Spanish', 'French', 'German', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali'];
  for (const lang of langList) {
    if (new RegExp(`\\b${lang}\\b`, 'i').test(languagesText || cleanText)) {
      languages.push(lang);
    }
  }

  const parsedProfile: CandidateParsedProfile = {
    name,
    email,
    phone,
    location,
    currentTitle,
    currentCompany,
    totalExperience,
    totalExperienceMonths,
    totalExperienceYears,
    relevantExperience: totalExperience,
    summary,
    professionalSummary: summary,
    skills,
    technologies: skills.filter(s => ['React', 'React.js', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'Express.js', 'Python', 'Java', 'MongoDB', 'PostgreSQL', 'Supabase', 'Docker', 'AWS'].includes(s)),
    tools: skills.filter(s => ['Git', 'GitHub', 'Docker', 'Postman', 'Vercel', 'Render', 'Figma', 'Jest', 'Tailwind CSS'].includes(s)),
    industries: [],
    education,
    certifications,
    languages,
    experience,
    gapAnalysis,
    responsibilities: [],
    achievements: [],
    projects,
    sourceEvidence,
    rawText,
    parsingStatus: 'PARSED',
    errorMessage: undefined,
    validationErrors: [],
    parsingMetadata: {
      fileName,
      fileType: docMetrics.fileType || 'application/pdf',
      pageCount: docMetrics.pageCount || 1,
      extractionMethod: docMetrics.extractionMethod || 'direct-text',
      ocrUsed: docMetrics.ocrUsed || false,
      characterCount: docMetrics.characterCount || rawText.length,
      wordCount: docMetrics.wordCount || rawText.split(/\s+/).filter(Boolean).length,
    },
    debug: {
      rawTextPreview: rawText.substring(0, 400),
      extractionMethod: docMetrics.extractionMethod || 'direct-text',
      ocrUsed: docMetrics.ocrUsed || false,
      characterCount: docMetrics.characterCount || rawText.length,
      wordCount: docMetrics.wordCount || rawText.split(/\s+/).filter(Boolean).length,
      parserInputPreview: rawText.substring(0, 250),
      parsedCandidate: {
        name,
        email,
        phone,
        currentTitle,
        currentCompany,
        totalExperience,
        skillsCount: skills.length,
        experienceCount: experience.length,
        educationCount: education.length,
        projectsCount: projects.length,
        gapAnalysis,
      },
      validationErrors: [],
    },
  };

  return parsedProfile;
}
