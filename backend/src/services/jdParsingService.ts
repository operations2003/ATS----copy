let PDFParseClass: any = null;
let pdfParseFn: any = null;
try {
  const pkg = require("pdf-parse");
  if (pkg && pkg.PDFParse) {
    PDFParseClass = pkg.PDFParse;
  } else if (typeof pkg === "function") {
    pdfParseFn = pkg;
  }
} catch {}
import zlib from "zlib";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";

export interface DocumentMetrics {
  fileName: string;
  fileType: string;
  pageCount: number;
  extractionMethod: string;
  ocrUsed: boolean;
  textLength: number;
  wordCount: number;
  lineCount: number;
}

export interface SalaryDebugInfo {
  rawMatch: string | null;
  normalizedValue: string | null;
  sourceFound: boolean;
  method: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface ParsedRequirement {
  id?: string;
  requirement: string;
  category: string;
  type:
    | "SKILL"
    | "HIRING_CRITERIA"
    | "EXPERIENCE"
    | "EDUCATION"
    | "CERTIFICATION"
    | "METHODOLOGY"
    | "SOFT_SKILL";
  weight: number;
  isMandatory: boolean;
  mandatory: boolean; // Alias for backward compatibility
  evidenceRequired: boolean;
  recruiterConfirmed: boolean;
  sourceEvidence: string;
  sourceSection: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  needsVerification: boolean;
  aliases?: string[];
  context?: string;
}

export interface ParsedJobMetadata {
  client: string | null;
  companyName: string | null;
  companyNameWarning?: boolean;
  companyNameCandidates?: string[];
  position: string | null;
  positionTitle: string | null;
  location: string | null;
  workMode: string | null;
  employmentType: string | null;
  experience: string | null;
  budget: string | null;
  salary?: string | null;
  interviewProcess: string | null;
}

export interface ParsedJobData {
  jobTitle: string | null;
  positionTitle: string | null;
  company: string | null;
  companyName: string | null;
  client: string | null;
  location: string | null;
  workMode: string | null;
  employmentType: string | null;
  salary: string | null;
  budget: string | null;
  requiredExperience: string | null;
  education: string[];
  certifications: string[];
  technicalSkills: string[];
  functionalSkills: string[];
  tools: string[];
  technologies: string[];
  industries: string[];
  languages: string[];
  responsibilities: string[];
  mandatoryRequirements: string[];
  preferredRequirements: string[];
  niceToHaveRequirements: string[];
}

export interface ValidationReport {
  status: "COMPLETE" | "REQUIRES_REVIEW";
  message: string;
  counts: {
    mandatoryCount: number;
    preferredCount: number;
    hiringCriteriaCount: number;
    responsibilitiesCount: number;
    totalRequirementsCount: number;
  };
}

export interface ParsingResult {
  success: boolean;
  rawText: string;
  data: {
    document: DocumentMetrics;
    metadata: ParsedJobMetadata;
    companyName: string | null;
    positionTitle: string | null;
    location: string | null;
    workMode: string | null;
    experience: string | null;
    salary: string | null;
    hiringCriteria: ParsedRequirement[];
    mandatoryRequirements: string[];
    preferredRequirements: string[];
    responsibilities: string[];
    job: ParsedJobData;
    requirements: ParsedRequirement[];
    warnings: string[];
    validation: ValidationReport;
    salaryDebug?: SalaryDebugInfo;
  };
}

export interface JobSection {
  type:
    | "TOP_HIRING"
    | "SUMMARY"
    | "RESPONSIBILITIES"
    | "MANDATORY_SKILLS"
    | "PREFERRED_SKILLS"
    | "COMMERCIALS"
    | "GENERAL";
  title: string;
  lines: string[];
  rawText: string;
}

/**
 * Helper to extract embedded JPEG image streams from a PDF buffer (scanned PDFs)
 */
export const extractJpegStreamsFromPdf = (buffer: Buffer): Buffer[] => {
  const images: Buffer[] = [];
  if (!buffer || buffer.length < 100) return images;

  const startMarker = Buffer.from([0xff, 0xd8, 0xff]);
  const endMarker = Buffer.from([0xff, 0xd9]);
  let startIdx = 0;

  while ((startIdx = buffer.indexOf(startMarker, startIdx)) !== -1) {
    const endIdx = buffer.indexOf(endMarker, startIdx + 3);
    if (endIdx !== -1) {
      const imgBuf = buffer.subarray(startIdx, endIdx + 2);
      if (imgBuf.length > 1000) {
        images.push(imgBuf);
      }
      startIdx = endIdx + 2;
    } else {
      break;
    }
  }
  return images;
};

/**
 * Perform Optical Character Recognition (OCR) fallback for scanned images and scanned PDFs
 */
export const performOcrFallback = async (buffer: Buffer): Promise<string> => {
  if (!buffer || buffer.length < 20) return "";

  const isImage =
    (buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47) || // PNG
    (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff); // JPEG
  const isPdf =
    buffer.length > 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46; // %PDF

  let imagesToOcr: Buffer[] = [];
  if (isImage) {
    imagesToOcr.push(buffer);
  } else if (isPdf) {
    imagesToOcr = extractJpegStreamsFromPdf(buffer);
  }

  if (imagesToOcr.length === 0) {
    return "";
  }

  try {
    console.log(
      `[OCR Fallback] Initializing Tesseract OCR for ${imagesToOcr.length} image stream(s)...`,
    );
    const path = require("path");
    const fs = require("fs");
    const localTrainedDataDir = path.resolve(__dirname, "../../");
    const hasLocalTrainedData = fs.existsSync(
      path.join(localTrainedDataDir, "eng.traineddata"),
    );

    let worker: any;
    if (hasLocalTrainedData) {
      worker = await createWorker("eng", 1, {
        langPath: localTrainedDataDir,
        gzip: false,
      });
    } else {
      worker = await createWorker("eng");
    }

    const ocrTexts: string[] = [];
    for (const img of imagesToOcr) {
      try {
        const ret = await worker.recognize(img);
        if (ret && ret.data && ret.data.text && ret.data.text.trim()) {
          ocrTexts.push(ret.data.text.trim());
        }
      } catch (pageOcrErr) {
        console.warn("[OCR Page Warning]:", pageOcrErr);
      }
    }
    await worker.terminate();

    const result = ocrTexts.join("\n\n");
    console.log(
      `[OCR Fallback] OCR completed. Extracted ${result.length} characters.`,
    );
    return result;
  } catch (err: any) {
    console.error("[OCR Fallback Error]", err.message || err);
    return "";
  }
};

/**
 * Calculate Document Extraction Quality Metrics
 */
export const calculateDocumentMetrics = (
  rawText: string,
  pageCount: number,
  extractionMethod: string,
  ocrUsed: boolean,
  fileName: string,
  fileType: string,
): DocumentMetrics => {
  const text = rawText || "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return {
    fileName,
    fileType,
    pageCount: pageCount || 1,
    extractionMethod,
    ocrUsed,
    textLength: text.length,
    wordCount: words.length,
    lineCount: lines.length,
  };
};

/**
 * Deep PDF stream text recovery: decompresses FlateDecode streams and parses TJ / Tj operator text.
 * Essential for damaged, linearized, or corrupted xref PDFs (e.g. "Page dictionary kid reference points to wrong type of object").
 */
export const recoverTextFromPdfStreams = (buffer: Buffer): string => {
  try {
    const str = buffer.toString("binary");
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match;
    const textPieces: string[] = [];

    while ((match = streamRegex.exec(str)) !== null) {
      const rawStream = Buffer.from(match[1], "binary");
      let decomp: Buffer | null = null;
      try {
        decomp = zlib.inflateSync(rawStream);
      } catch {
        try {
          decomp = zlib.inflateRawSync(rawStream);
        } catch {}
      }

      if (decomp) {
        const decompStr = decomp.toString("latin1");
        // Match both [(...)...] TJ and (...) Tj
        const tjRegex = /(?:\[([\s\S]*?)\]\s*TJ|\(([\s\S]*?)\)\s*Tj)/g;
        let m;
        while ((m = tjRegex.exec(decompStr)) !== null) {
          if (m[1] !== undefined) {
            // It's a TJ array: extract all ( ... ) strings
            const subRegex = /\(([\s\S]*?)(?<!\\)\)/g;
            let sub;
            let piece = "";
            while ((sub = subRegex.exec(m[1])) !== null) {
              piece += sub[1].replace(/\\([\\()])/g, "$1");
            }
            if (piece && piece.trim()) textPieces.push(piece.trim());
          } else if (m[2] !== undefined) {
            const piece = m[2].replace(/\\([\\()])/g, "$1");
            if (piece && piece.trim()) textPieces.push(piece.trim());
          }
        }
      }
    }

    if (textPieces.length > 5) {
      return textPieces.join(" ");
    }
  } catch (err) {
    console.warn("[PDF Stream Recovery Notice]:", err);
  }
  return "";
};

/**
 * 1. EXTRACT TEXT FROM BUFFER (PDF, DOCX, TXT) WITH STREAM RECOVERY & OCR FALLBACK
 */
export const extractTextFromBuffer = async (
  buffer: Buffer,
  arg2: string,
  arg3: string,
): Promise<{
  text: string;
  pageCount: number;
  method: string;
  ocrUsed: boolean;
}> => {
  let mimeType = (arg2 || "").trim();
  let filename = (arg3 || "").trim();

  // Robust argument auto-detection (handles either (buf, mime, filename) or (buf, filename, mime))
  if (arg2.includes("/") && !arg3.includes("/")) {
    mimeType = arg2;
    filename = arg3;
  } else if (arg3.includes("/") && !arg2.includes("/")) {
    mimeType = arg3;
    filename = arg2;
  } else if (arg2.includes(".") && !arg3.includes(".")) {
    filename = arg2;
    mimeType = arg3;
  }

  const lowerName = filename.toLowerCase();
  let extractedText = "";
  let pageCount = 1;
  let method = "utf8";
  let ocrUsed = false;

  // A. PDF Extraction
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    method = "pdf-parse";
    try {
      if (PDFParseClass) {
        const parser = new PDFParseClass({ data: buffer });
        if (typeof parser.load === "function") {
          await parser.load();
        }
        const result = await parser.getText();
        if (result) {
          extractedText = result.text || "";
          pageCount = result.total || 1;
        }
      } else if (pdfParseFn) {
        const data = await pdfParseFn(buffer);
        if (data) {
          pageCount = data.numpages || 1;
          extractedText = data.text || "";
        }
      }
    } catch (err: any) {
      console.warn(
        "[PDF Extractor] pdf-parse warning, attempting stream recovery:",
        err.message || String(err),
      );
    }

    // Direct Stream Extraction & FlateDecode Stream Recovery if pdf-parse text is insufficient
    if (!extractedText || extractedText.trim().length < 30) {
      method = "pdf-stream-recovery";
      const streamText = recoverTextFromPdfStreams(buffer);
      if (streamText && streamText.trim().length > 30) {
        extractedText = streamText;
      } else {
        try {
          const rawString = buffer.toString("latin1");
          const textChunks: string[] = [];

          const tjMatches =
            rawString.match(/\(([^()]{2,})\)\s*(?:Tj|TJ|\')/g) || [];
          for (const m of tjMatches) {
            const s = m
              .replace(/^\(/, "")
              .replace(/\)\s*(?:Tj|TJ|\')$/, "")
              .trim();
            if (
              s &&
              !s.startsWith("/") &&
              !s.startsWith("%PDF") &&
              !s.includes("FontName")
            ) {
              textChunks.push(s);
            }
          }

          if (textChunks.length > 3) {
            extractedText = textChunks.join("\n");
          }
        } catch (e: any) {
          console.error("[PDF Extractor] Stream fallback error:", e);
        }
      }
    }

    // If PDF was actually a renamed DOCX file or contains Word document payload
    if (
      (!extractedText || extractedText.trim().length < 30) &&
      (lowerName.includes(".docx") || lowerName.includes(".doc"))
    ) {
      try {
        const mammothRes = await mammoth.extractRawText({ buffer });
        if (
          mammothRes &&
          mammothRes.value &&
          mammothRes.value.trim().length > 30
        ) {
          extractedText = mammothRes.value;
          method = "mammoth-docx-fallback";
        }
      } catch {}
    }

    // OCR Fallback if PDF text is still empty or scanned image PDF (< 30 characters or < 8 words)
    const words = extractedText.trim().split(/\s+/).filter(Boolean);
    if (extractedText.trim().length < 30 || words.length < 8) {
      console.log(
        "[Text Quality Check] PDF text is insufficient/scanned image. Triggering Tesseract OCR fallback...",
      );
      const ocrText = await performOcrFallback(buffer);
      if (ocrText && ocrText.trim().length > 30) {
        extractedText = ocrText;
        method = "tesseract-ocr";
        ocrUsed = true;
      }
    }

    return { text: extractedText, pageCount, method, ocrUsed };
  }

  // B. DOCX & Word Extraction
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".doc")
  ) {
    method = "mammoth-docx";
    try {
      // First try Markdown conversion to preserve tables and lists
      const mdResult = await (mammoth as any).convertToMarkdown({ buffer });
      if (mdResult && mdResult.value && mdResult.value.trim().length > 30) {
        extractedText = mdResult.value;
      } else {
        const rawResult = await mammoth.extractRawText({ buffer });
        extractedText = rawResult.value || "";
      }
    } catch (err: any) {
      console.warn(
        "DOCX parsing warning, trying binary text recovery:",
        err.message || String(err),
      );
      // Binary text recovery fallback for legacy .doc (Word 97-2003 OLE) files
      try {
        const rawUtf8 = buffer.toString("utf-8");
        const cleanPrintable = rawUtf8.replace(
          /[\x00-\x08\x0b\x0c\x0e-\x1f]/g,
          " ",
        );
        const words = cleanPrintable.match(/[A-Za-z0-9@+.,\-/\s]{4,}/g) || [];
        const recoveredUtf8 = words
          .map((w) => w.trim())
          .filter((w) => w.length > 3)
          .join("\n");
        if (recoveredUtf8.length > 40) {
          extractedText = recoveredUtf8;
          method = "doc-binary-utf8";
        }
      } catch {}

      if (!extractedText || extractedText.length < 40) {
        try {
          const rawUtf16 = buffer.toString("utf16le");
          const cleanPrintable16 = rawUtf16.replace(
            /[\x00-\x08\x0b\x0c\x0e-\x1f]/g,
            " ",
          );
          const words16 =
            cleanPrintable16.match(/[A-Za-z0-9@+.,\-/\s]{4,}/g) || [];
          const recoveredUtf16 = words16
            .map((w) => w.trim())
            .filter((w) => w.length > 3)
            .join("\n");
          if (recoveredUtf16.length > 40) {
            extractedText = recoveredUtf16;
            method = "doc-binary-utf16";
          }
        } catch {}
      }

      if (!extractedText) {
        // Fallback if file was actually a PDF with a .docx extension
        try {
          if (PDFParseClass) {
            const parser = new PDFParseClass({ data: buffer });
            const res = await parser.getText();
            if (res && res.text) extractedText = res.text;
          }
        } catch {}
        if (!extractedText) {
          extractedText = recoverTextFromPdfStreams(buffer);
        }
      }
    }
    return { text: extractedText, pageCount: 1, method, ocrUsed: false };
  }

  // C. TXT Extraction
  extractedText = buffer.toString("utf-8");
  return {
    text: extractedText,
    pageCount: 1,
    method: "plain-text",
    ocrUsed: false,
  };
};

/**
 * 2. CLEAN AND NORMALIZE TEXT
 * Normalizes Unicode zero-width artifacts, non-breaking spaces, and reattaches lone bullet symbols.
 */
export const cleanAndNormalizeText = (rawText: string): string => {
  if (!rawText) return "";

  return (
    rawText
      // Remove PDF structural header/trailer artifacts
      .replace(/%PDF-[\d.]+/gi, "")
      .replace(/ReportLab Generated PDF document/gi, "")
      .replace(/\/Producer\s*\([^)]*\)/gi, "")
      .replace(/\/Creator\s*\([^)]*\)/gi, "")
      .replace(/\/Title\s*\([^)]*\)/gi, "")
      .replace(/obj[\s\S]*?endobj/gi, "")
      // Remove pdf-parse page artifact lines: e.g. "-- 1 of 2 --"
      .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "")
      // Remove control characters except standard whitespace (\n, \t, \r)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
      // Normalize zero-width and invisible unicode characters to regular spaces
      .replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, " ")
      // Normalize corrupted rupee / currency symbols
      .replace(
        /(?:[■▪●]|\bI)\s*(?=\d{1,3}(?:,\d{2,3})+|\d+\s*(?:lpa|lakh|crore|k|m)\b)/gi,
        "₹",
      )
      .replace(/■(?=\d)/g, "₹")
      // Normalize linebreaks
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Reattach lone bullet characters on their own line to the following bullet text
      .replace(/([●•*\-–—▪▫➢✓✔]|\d+[\.\)])[ \t]*\n+/g, "$1 ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
};

/**
 * DEDICATED DETERMINISTIC SALARY EXTRACTOR & NORMALIZER
 */
export const extractSalary = (
  text: string,
): { salary: string | null; debug: SalaryDebugInfo } => {
  if (!text || typeof text !== "string") {
    return {
      salary: null,
      debug: {
        rawMatch: null,
        normalizedValue: null,
        sourceFound: false,
        method: "deterministic-pattern",
        confidence: "HIGH",
      },
    };
  }

  const normText = text
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212~]/g, "–")
    .replace(/(?:[■▪●]|\bI)\s*(?=\d)/g, "₹")
    .replace(/[ \t]+/g, " ");

  const salaryPatterns: RegExp[] = [
    /(?:Salary|Compensation|Package|Pay|Remuneration|Budget|CTC)?\s*:?\s*((?:Up to\s*)?(?:₹|INR|\$|USD)?\s*\d{1,3}(?:,\d{2,3})*(?:\.\d+)?\s*[-–]\s*(?:₹|INR|\$|USD)?\s*\d{1,3}(?:,\d{2,3})*(?:\.\d+)?(?:\s*(?:LPA|per annum|PA|p\.a\.|yr|year|k|K))?(?:\s*\([^)]*\))?(?:,\s*[^,\n]+)*)/i,
    /\b(\d{1,2}(?:\.\d+)?\s*[-–]\s*\d{1,2}(?:\.\d+)?\s*(?:LPA|per annum|PA|p\.a\.))\b/i,
    /((?:₹|INR|\$|USD)\s*\d{1,2}(?:,\d{2,3})+\s*[-–]\s*(?:₹|INR|\$|USD)?\s*\d{1,2}(?:,\d{2,3})+\s*(?:per annum|PA|p\.a\.|LPA))/i,
    /(?:Salary|Compensation|Package|Budget|CTC)?\s*:?\s*((?:Up to\s*)?(?:₹|INR|\$|USD)\s*\d{1,3}(?:,\d{2,3})*(?:\.\d+)?\s*(?:LPA|per annum|PA|p\.a\.|Lakhs?))/i,
    /\b(\d{1,2}(?:\.\d+)?\s*(?:LPA|per annum|PA|p\.a\.))\b/i,
  ];

  for (const pattern of salaryPatterns) {
    const match = normText.match(pattern);
    if (match && match[1]) {
      let rawMatch = match[1].trim();

      let normalized = rawMatch
        .replace(/\s*[-–]\s*/g, "–")
        .replace(/\s+/g, " ")
        .trim();

      if (/^\$0\d{1,3}$/.test(normalized) || normalized.length < 3) continue;
      if (
        /year|exp|req|joining|date/i.test(normalized) &&
        !/per annum|PA|p\.a\.|yr|LPA|Fixed|Bonus|Payout/i.test(normalized)
      )
        continue;

      if (
        !normalized.startsWith("₹") &&
        !normalized.startsWith("$") &&
        !normalized.startsWith("€") &&
        !normalized.startsWith("£") &&
        !normalized.toLowerCase().startsWith("inr") &&
        !normalized.toLowerCase().startsWith("usd") &&
        !normalized.toLowerCase().startsWith("up to ₹")
      ) {
        if (
          normText.includes("₹") ||
          normText.includes("\u20b9") ||
          /\bLPA\b/i.test(normalized) ||
          /\bLakhs?\b/i.test(normalized) ||
          /,\d{2,3}/.test(normalized)
        ) {
          normalized = normalized.toLowerCase().startsWith("up to")
            ? normalized.replace(/^up to\s*/i, "Up to ₹")
            : "₹" + normalized;
        } else if (normText.includes("$") || /\bUSD\b/i.test(normText)) {
          normalized = "$" + normalized;
        }
      }

      return {
        salary: normalized,
        debug: {
          rawMatch,
          normalizedValue: normalized,
          sourceFound: true,
          method: "deterministic-pattern",
          confidence: "HIGH",
        },
      };
    }
  }

  return {
    salary: null,
    debug: {
      rawMatch: null,
      normalizedValue: null,
      sourceFound: false,
      method: "deterministic-pattern",
      confidence: "HIGH",
    },
  };
};

const KNOWN_FIELD_LABELS = [
  "client / company",
  "company / client",
  "client name",
  "company name",
  "hiring company",
  "hiring organization",
  "position title",
  "job title",
  "work mode",
  "workmode",
  "employment type",
  "workplace type",
  "interview process",
  "company",
  "client",
  "position",
  "location",
  "locations",
  "salary",
  "compensation",
  "package",
  "pay",
  "ctc",
  "budget",
  "job summary",
  "experience",
  "education",
  "certification",
  "skills",
  "responsibilities",
  "requirements",
  "openings",
  "key responsibilities",
  "mandatory skills",
  "preferred skills",
  "core competencies",
  "company overview",
  "recruitment information",
];

const GENERIC_COMPANY_STOP_WORDS = [
  "the company",
  "our client",
  "we",
  "this role",
  "the role",
  "role",
  "the position",
  "position",
  "the job",
  "job",
  "the candidate",
  "the team",
  "not specified",
  "confidential",
  "leading company",
  "top mnc",
  "multinational company",
  "client",
  "company",
  "organization",
  "unknown",
  "job description",
  "jd",
  "job specification",
  "role description",
  "job summary",
  "key responsibilities",
  "mandatory skills",
  "preferred skills",
  "core competencies",
  "company overview",
  "about the role",
  "about the company",
  "recruitment information",
  "location",
  "locations",
  "experience",
  "education",
  "compensation",
  "ctc",
  "salary",
  "openings",
  "candidate profile",
  "verified organization",
];

export const cleanExtractedName = (
  raw: string | null,
  isCompany: boolean = false,
): string | null => {
  if (!raw || typeof raw !== "string") return null;

  let cleaned = raw
    .replace(
      /^(?:client\s*(?:\/|&|and)\s*company|company\s*(?:\/|&|and)\s*client|client\s+name|company\s+name|hiring\s+company|hiring\s+organization|job\s+description|position\s+title|job\s+title|client|company|employer|organization|position|role|designation|title)\s*[:\-–]\s*/i,
      "",
    )
    .replace(/^[:\s–\-•●*|]+|[:\s–\-•●*|]+$/g, "")
    .replace(
      /\s*[-–|:]\s*(?:job\s+description|job\s+specification|role\s+description|jd)\s*$/i,
      "",
    )
    .replace(
      /\s*[•●*|]\s*(?:employment\s+type|work\s+mode|workplace\s+type|budget|salary|compensation|experience\s+required|experience)[\s\S]*/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  // Strip wrapping quotes
  cleaned = cleaned.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();

  if (isCompany) {
    if (
      GENERIC_COMPANY_STOP_WORDS.includes(cleaned.toLowerCase()) ||
      cleaned.length < 2
    ) {
      return null;
    }
  } else {
    // Strip leading overview labels if present
    cleaned = cleaned
      .replace(
        /^(?:overview\s+own\s+|role\s+overview:\s*|job\s+overview:\s*|overview:\s*|overview\s+|summary:\s*|about\s+the\s+role:\s*)/i,
        "",
      )
      .trim();

    const lowerCleaned = cleaned.toLowerCase();
    const wordCount = cleaned.split(/\s+/).length;

    if (
      ["not specified", "unknown", "n/a", "na", "none"].includes(lowerCleaned) ||
      cleaned.length < 2 ||
      cleaned.length > 75 ||
      wordCount > 8 ||
      /^(?:own\s+|responsible\s+for|managing\s+|we\s+are|looking\s+for|execute\s+|to\s+lead)\b/i.test(
        lowerCleaned,
      ) ||
      /(?:for|and|to|with|in|at)$/i.test(cleaned) ||
      lowerCleaned.includes("cross-functional") ||
      lowerCleaned.includes("demand generation,")
    ) {
      return null;
    }
  }

  return cleaned;
};

const POSITION_KEYWORDS = [
  "developer",
  "engineer",
  "consultant",
  "architect",
  "manager",
  "lead",
  "analyst",
  "specialist",
  "administrator",
  "designer",
  "director",
  "intern",
  "associate",
  "officer",
  "executive",
  "tester",
  "qa",
  "scientist",
  "technician",
  "programmer",
  "expert",
  "sales",
  "account executive",
  "ae",
  "bdr",
  "sdr",
  "vp",
  "head of",
  "representative",
];

export const isKnownPositionTitle = (str: string | null): boolean => {
  if (!str) return false;
  const lower = str.toLowerCase();
  return POSITION_KEYWORDS.some((kw) =>
    new RegExp(`\\b${kw}s?\\b`, "i").test(lower),
  );
};

export const validateCleanFieldValue = (
  value: string | null,
  fieldName: string,
): string | null => {
  if (!value || typeof value !== "string") return null;

  let cleaned = value.trim();

  // Remove matching label prefixes
  for (const label of KNOWN_FIELD_LABELS) {
    const prefixRegex = new RegExp(
      `^(?:${label.replace(/\//g, "\\/")})\\s*[:\-–]?\\s*`,
      "i",
    );
    cleaned = cleaned.replace(prefixRegex, "").trim();
  }

  cleaned = cleaned.replace(/^[:\s–\-•●*|]+|[:\s–\-•●*|]+$/g, "").trim();

  if (!cleaned || KNOWN_FIELD_LABELS.includes(cleaned.toLowerCase())) {
    return null;
  }

  return cleaned;
};

/**
 * DETECT SECTION HEADINGS
 */
export const detectHeading = (
  line: string,
): { isHeading: boolean; type: JobSection["type"]; title: string } => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 130)
    return { isHeading: false, type: "GENERAL", title: "" };

  // Strip markdown formatting, emojis, leading numbers/bullets/special symbols
  const cleanLine = trimmed
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*[*_]{1,3}/, "")
    .replace(/[*_]{1,3}\s*$/, "")
    .replace(
      /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u2600-\u27BF\s•●*▪▫➢✓✔·\-\u2022\u2023\u25E6\u2043\u2219]+/gu,
      "",
    )
    .replace(/^\s*(?:\d+|[ivxIVX]+)[\.\)\-:]\s*/, "")
    .replace(/\s*\([^)]*\)\s*$/, "") // remove trailing (recruiter checks)
    .replace(/\s*\[[^\]]*\]\s*$/, "")
    .replace(/[:\-–—\s]+$/, "")
    .trim();

  const lower = cleanLine.toLowerCase();
  const norm = lower.replace(/&/g, "and").replace(/[-–—]/g, " ");

  // Mandatory Skills Headings
  if (
    /^(key\s+requirements|requirements|core\s+requirements|qualifications|eligibility\s+criteria|candidate\s+profile|what\s+you\s+need|what\s+we\s+are\s+looking\s+for|skills\s*(?:and|&)\s*experience|basic\s+qualifications|mandatory\s+skills|mandatory\s+requirements|non\s*negotiable\s+mandatory\s+requirements|non\s*negotiable\s+requirements|mandatory\s+qualifications|must\s+have|must\s+haves|required\s+skills|required\s+qualifications|required\s+experience|minimum\s+requirements|minimum\s+qualifications|essential\s+skills|core\s+skills|must\s*have\s+skills|mandatory|knock\s*out\s+rules|knockout\s+criteria|dealbreakers|candidate\s+requirements|candidate\s+qualifications|job\s+requirements|required\s+criteria|essential\s+criteria|what\s+you\s+bring|what\s+you(?:'ll|\s+will)\s+bring|who\s+you\s+are|what\s+we(?:'re|\s+are)\s+looking\s+for)$/i.test(
      norm,
    )
  ) {
    return { isHeading: true, type: "MANDATORY_SKILLS", title: trimmed };
  }

  // Preferred Skills Headings
  if (
    /^(preferred\s+skills|preferred\s+requirements|preferred\s+qualifications|preferred\s+experience|nice\s+to\s+have|nice\s+to\s+haves|good\s+to\s+have|good\s+to\s+haves|desired\s+skills|desired\s+qualifications|desired\s+requirements|bonus\s+points|bonus\s+skills|bonus\s+qualifications|additional\s+skills|additional\s+qualifications|desirable\s+skills|secondary\s+skills|plus\s+points|great\s+to\s+have|optional\s+requirements|optional\s+skills|preferred\s+criteria|desirable\s+criteria|bonus\s+requirements|additional\s+requirements|additional\s+criteria|it\s+would\s+be\s+a\s+plus)$/i.test(
      norm,
    )
  ) {
    return { isHeading: true, type: "PREFERRED_SKILLS", title: trimmed };
  }

  // Key Responsibilities Headings
  if (
    /^(key\s+responsibilities|responsibilities|roles?\s+and\s+responsibilities|job\s+responsibilities|primary\s+responsibilities|core\s+responsibilities|what\s+you\s+will\s+do|what\s+you\s*'?ll\s+do|what\s+you\s+will\s+be\s+doing|what\s+you\s*'?ll\s+be\s+doing|your\s+responsibilities|day\s+to\s+day\s+responsibilities|role\s+overview\s*(?:and|&)?\s*key\s+responsibilities|role\s+overview|duties|duties\s+and\s+responsibilities|responsibilities\s+and\s+duties|job\s+duties|main\s+duties|key\s+deliverables|tasks|scope\s+of\s+work)$/i.test(
      norm,
    )
  ) {
    return { isHeading: true, type: "RESPONSIBILITIES", title: trimmed };
  }

  // Summary & Company & Role Headings
  if (
    /^(job\s+summary|summary|about\s+the\s+role|about\s+the\s+job|overview|position\s+summary|position\s+overview|about\s+us|about\s+[a-z0-9&.,'\-]+|company\s+overview|about\s+the\s+company|why\s+join\s+us|job\s+purpose|role\s+purpose|role\s+snapshot|snapshot|who\s+we\s+are|who\s+you\s+are|about\s+you|what\s+you\s+bring|what\s+you\s*'?ll\s+bring|what\s+you\s+get|what\s+you\s*'?ll\s+get|what\s+we\s+offer|perks\s*(?:and|&)?\s*benefits|benefits\s*(?:and|&)?\s*perks|perks|benefits|why\s+this\s+role|the\s+opportunity)$/i.test(
      norm,
    )
  ) {
    return { isHeading: true, type: "SUMMARY", title: trimmed };
  }

  // Commercials & Recruiter Billing & Exclusions & Interview Logistics
  if (
    /^(commercials|compensation\s+details|billing\s+details|interview\s+process|interview\s+details|payment\s+terms|fee\s+structure|incentives?|freelance\s+recruiter.*|replacement\s+guarantee|what\s+we(?:'re|\s+are)\s+not\s+asking\s+for|what\s+we\s+do\s+not\s+want|what\s+you\s+don't\s+need|who\s+this\s+is\s+not\s+for|not\s+looking\s+for|exclusions|non-requirements|core\s+competencies|recruitment\s+information|recruiter\s+cheat\s+sheet.*|recruiter[’']s\s+cheat\s+code.*|boolean\s+search\s+strings.*|candidate\s+pre-screening\s+questionnaire.*|screening\s+&\s+evaluation\s+parameters.*|the\s+30-second\s+resume\s+scan.*|the\s+30-second\s+resume\s+screening\s+checklist.*|the\s+5-minute\s+screening\s+script.*|3-minute\s+phone\s+screening\s+script.*|quick-reference\s+match\s+scorecard.*|quick\s+.*instant\s+disqualification.*|instant\s+disqualification.*|profile\s+identifiers.*)$/i.test(
      norm,
    )
  ) {
    return { isHeading: true, type: "COMMERCIALS", title: trimmed };
  }

  return { isHeading: false, type: "GENERAL", title: "" };
};

/**
 * SEGMENT RAW TEXT INTO LOGICAL SECTIONS
 */
export const segmentDocumentSections = (cleanedText: string): JobSection[] => {
  const rawLines = cleanedText.split("\n");
  const sections: JobSection[] = [];

  let currentSection: JobSection = {
    type: "TOP_HIRING",
    title: "Top Hiring Information",
    lines: [],
    rawText: "",
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const headingCheck = detectHeading(trimmed);
    if (headingCheck.isHeading) {
      if (currentSection.lines.length > 0) {
        currentSection.rawText = currentSection.lines.join("\n");
        sections.push(currentSection);
      }
      currentSection = {
        type: headingCheck.type,
        title: headingCheck.title,
        lines: [],
        rawText: "",
      };
    } else {
      currentSection.lines.push(line);
    }
  }

  if (currentSection.lines.length > 0) {
    currentSection.rawText = currentSection.lines.join("\n");
    sections.push(currentSection);
  }

  return sections;
};

/**
 * EXTRACT BULLETS FROM A SECTION WITHOUT CREATING FRAGMENTS
 */
export const extractBulletsFromSection = (section: JobSection): string[] => {
  const bullets: string[] = [];
  const lines = section.lines;
  let currentBullet = "";
  let hadBulletPrefix = false;

  const bulletRegex =
    /^[\s\t]*([●•\*\-–—▪▫➢✓✔]|\[\s*[xX✓✔]?\s*\]|\d+[\.\)])\s*/;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // Check if line is just a lone bullet symbol (e.g. "●" on its own line)
    if (/^[●•\*\-–—▪▫➢✓✔]$/.test(line)) {
      if (currentBullet) {
        const cleaned = cleanBulletText(currentBullet);
        if (isValidRequirement(cleaned)) bullets.push(cleaned);
        currentBullet = "";
      }
      hadBulletPrefix = true;
      // Peek at next line and attach
      if (i + 1 < lines.length) {
        currentBullet = lines[i + 1].trim();
        i++;
      }
      continue;
    }

    if (bulletRegex.test(line)) {
      if (currentBullet) {
        const cleaned = cleanBulletText(currentBullet);
        if (isValidRequirement(cleaned)) bullets.push(cleaned);
      }
      hadBulletPrefix = true;
      currentBullet = line
        .replace(/^[\s\t]*([●•\*\-–—▪▫➢✓✔]|\[\s*[xX✓✔]?\s*\]|\d+[\.\)])\s*/, "")
        .trim();
    } else {
      // Check for table headers or meta lines to ignore
      if (
        /^(category\s+requirement\s+details|candidates\s+must\s+meet|recruiter\s+note)/i.test(
          line,
        )
      ) {
        continue;
      }
      // Check if this line is an unbulleted requirement / table row in a requirements section
      if (hadBulletPrefix && currentBullet) {
        currentBullet += " " + line;
      } else if (
        (section.type === "MANDATORY_SKILLS" ||
          section.type === "PREFERRED_SKILLS") &&
        line.length >= 8 &&
        !line.endsWith(":")
      ) {
        if (currentBullet) {
          const cleaned = cleanBulletText(currentBullet);
          if (isValidRequirement(cleaned)) bullets.push(cleaned);
        }
        currentBullet = line;
      } else if (currentBullet) {
        currentBullet += " " + line;
      } else if (line.length > 5 && !line.includes(":")) {
        currentBullet = line;
      }
    }
  }

  if (currentBullet) {
    const cleaned = cleanBulletText(currentBullet);
    if (isValidRequirement(cleaned)) bullets.push(cleaned);
  }

  return bullets;
};

export const cleanBulletText = (text: string): string => {
  if (!text) return "";
  return (
    text
      // Convert LaTeX math symbols
      .replace(/\$\\le\$/gi, "≤")
      .replace(/\\le\b/gi, "≤")
      .replace(/\$\\ge\$/gi, "≥")
      .replace(/\\ge\b/gi, "≥")
      .replace(/\$\\sim\$/gi, "~")
      // Strip emojis
      .replace(
        /[\p{Emoji_Presentation}\p{Extended_Pictographic}\u2600-\u27BF]/gu,
        "",
      )
      // Strip markdown headers (e.g. '### ')
      .replace(/^\s*#{1,6}\s+/, "")
      // Strip markdown bold wrappers if enclosing entire bullet (e.g. '**Requirement**' -> 'Requirement')
      .replace(/^\s*\*\*(.*?)\*\*\s*$/, "$1")
      // Strip checkbox tokens: [ ], [x], [X], [✓], [✔], ( ), (x), (✓)
      .replace(/^\s*\[\s*[xX✓✔]?\s*\]\s*/, "")
      .replace(/^\s*\(\s*[xX✓✔]?\s*\)\s*/, "")
      // Strip enumerated list markers like '1. ', '1) ', '(1) ', 'a. ', 'A) ' (MUST have whitespace after delimiter)
      .replace(/^\s*(?:(?:\d+|[a-zA-Z])[\.\)]|\(\d+\))\s+/, "")
      // Strip leading bullet symbols (•, ●, *, -, etc.)
      .replace(/^\s*[•●*▪▫➢✓✔·\u2022\u2023\u25E6\u2043\u2219]\s*/, "")
      // Strip leading dash or colon if followed by space (bullet list style, e.g. "- Requirement")
      .replace(/^\s*[-–—:]\s+/, "")
      .replace(/\[\s*[xX✓✔]?\s*\]/g, "") // remove inline [ ] if any
      .replace(/\s+/g, " ")
      .trim()
  );
};

export const isValidRequirement = (text: string): boolean => {
  if (!text || text.length < 4) return false;
  // Reject confidential recruiter notes/disclaimers
  if (
    /keep\s+(the\s+)?hiring\s+company|confidential|name\s+to\s+be\s+disclosed|nothing\s+to\s+be\s+written|recruiter\s+note|internal\s+note/i.test(
      text,
    )
  )
    return false;
  // Reject commercial and recruiter billing metadata.
  // Location and work-mode criteria must remain valid requirements
  // when they occur inside explicit Mandatory / Preferred sections.

  if (
    /^(?:commercials|total\s+incentives?|payable\s+period)/i.test(text.trim())
  ) {
    return false;
  }
  // Reject Recruiter Billing, Commercials, CTC, and Agency terms
  if (
    /(?:fixed\s+ctc|freelance\s+recruiter|total\s+billing|billing\s+payables?|replacement\s+guarantee|placement\s+fee|incentive\s*[-:]|recruiter\s+margin|invoice\s+submission)/i.test(
      text,
    )
  )
    return false;
  // Reject company marketing / pitch / blurbs
  if (
    /(?:bootstrapped\s+company|customers?\s+in\s+\d+\s+countries|chance\s+to\s+build\s+the\s+sales\s+motion|we(?:'re|\s+are)\s+looking\s+for\s+someone\s+climbing|founded\s+in\s+\d+|our\s+mission\s+is|about\s+(?:the\s+)?company)/i.test(
      text,
    )
  )
    return false;
  // Reject exclusion clauses ("What we're not asking for", "An MBA. Five-plus years...")
  if (
    /(?:what\s+we(?:'re|\s+are)\s+not\s+asking|not\s+asking\s+for|what\s+you\s+don't\s+need|an\s+mba\.?\s+five-plus\s+years|big-logo\s+cv|don't\s+apply\s+if)/i.test(
      text,
    )
  )
    return false;
  // Reject perks & compensation lines
  if (
    /(?:what\s+you\s+get|what\s+we\s+offer|perks\s+and\s+benefits|health\s+insurance|unlimited\s+pto|esops?|equity\s+grant|gym\s+membership|free\s+lunch)/i.test(
      text,
    )
  )
    return false;
  // Reject single word fragments if too short
  if (!text.includes(" ") && text.length < 10) return false;
  // Reject common fragment tails
  if (
    /^(experience\.|implementations\.|knowledge\.|along with|practical knowledge\.\.\.)$/i.test(
      text.trim(),
    )
  )
    return false;
  // Reject section headings accidentally captured
  const headingCheck = detectHeading(text);
  if (headingCheck.isHeading) return false;
  // Reject table header artifacts
  if (
    /^(category\s+requirement\s+details|requirement\s+details)/i.test(
      text.trim(),
    )
  )
    return false;
  // Reject salary, budget, or interview metadata
  if (
    /^(\d+\s*lpa|up to ₹|budget:|interview process:|total incentive)/i.test(
      text,
    )
  )
    return false;
  return true;
};

/**
 * CATEGORY CLASSIFIER
 */
export const categorizeRequirement = (req: string): string => {
  const lower = req.toLowerCase();
  // Availability and joining criteria
  if (
    /\b(notice period|immediate joiner|joining date|availability|joining timeline)\b/i.test(
      lower,
    )
  ) {
    return "Availability";
  }

  // Location, shift and work arrangement criteria
  if (
    /\b(location|outstation|relocation|onsite|on-site|in-office|remote|hybrid|shift|timezone|time zone|office)\b/i.test(
      lower,
    )
  ) {
    return "Work Arrangement";
  }

  // Professional and domain experience
  if (
    /\b(experience|tenure|years of experience|professional background)\b/i.test(
      lower,
    )
  ) {
    return "Experience";
  }
  if (/\b(certification|certified|salesforce certified)\b/i.test(lower)) {
    return "Certification";
  }
  if (
    /\b(sap|oracle|erp|mulesoft|middleware|rest|soap|api|apis|integrat(e|ing|ion))\b/i.test(
      lower,
    )
  ) {
    return "Integration";
  }
  if (
    /\b(quota|arr|acv|pipeline|sales cycle|sourcing|deal size|b2b saas|fintech|billing|cfo|controller|revops|full-cycle|account executive|hunter)\b/i.test(
      lower,
    )
  ) {
    if (/\b(quota|arr|acv|deal size|target)\b/i.test(lower))
      return "Technical Skill";
    if (/\b(experience|tenure|years|stability)\b/i.test(lower))
      return "Experience";
    return "Technical Skill";
  }
  if (
    /\b(manufacturing cloud|sales cloud|service cloud|experience cloud|cpq|data cloud|devops|copado|gearset|jenkins|github actions)\b/i.test(
      lower,
    )
  ) {
    return "Technology";
  }
  if (
    /\b(apex|lwc|lightning web components|soql|sosl|triggers|batch apex|queueable|flows|declarative automation|data model|security|sharing|profiles|permission sets|governor limits)\b/i.test(
      lower,
    )
  ) {
    return "Technical Skill";
  }
  if (
    /\b(agile|scrum|kanban|sprint|jira|methodology|consultative sales)\b/i.test(
      lower,
    )
  ) {
    return "Methodology";
  }
  if (
    /\b(analytical|problem-solving|communication|leadership|collaboration|teamwork)\b/i.test(
      lower,
    )
  ) {
    return "Soft Skill";
  }
  if (
    /\b(\d+\+?\s*years|years of|hands-on.*experience|enterprise.*implementations|tenure|stability|work stability)\b/i.test(
      lower,
    )
  ) {
    return "Experience";
  }
  if (
    /\b(degree|bachelor|master|b\.e|b\.tech|m\.tech|bca|mca|10th|12th|graduation|graduate|postgraduate|aggregate marks)\b/i.test(
      lower,
    )
  ) {
    return "Education";
  }
  return "Technical Skill";
};

/**
 * EXTRACT TOP-OF-JD HIRING CRITERIA
 */
export const extractHiringCriteria = (
  topSection: JobSection | undefined,
): ParsedRequirement[] => {
  if (!topSection) return [];
  const criteria: ParsedRequirement[] = [];
  const lines = topSection.lines;

  for (const line of lines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (
      /candidate must have shown exp in/i.test(lower) ||
      (/manufacturing cloud/i.test(lower) && /resume/i.test(lower))
    ) {
      criteria.push({
        requirement: "Manufacturing Cloud experience",
        category: "Hiring Criteria",
        type: "HIRING_CRITERIA",
        weight: 1.0,
        isMandatory: true,
        mandatory: true,
        evidenceRequired: true,
        recruiterConfirmed: false,
        sourceEvidence: "Manufacturing Cloud experience required in resume",
        sourceSection: "Top Hiring Criteria",
        confidence: "HIGH",
        needsVerification: false,
      });
    } else if (
      /local to ncr/i.test(lower) ||
      (/ncr/i.test(lower) && !lower.includes(":"))
    ) {
      criteria.push({
        requirement: "Local to NCR",
        category: "Hiring Criteria",
        type: "HIRING_CRITERIA",
        weight: 0.5,
        isMandatory: false,
        mandatory: false,
        evidenceRequired: false,
        recruiterConfirmed: false,
        sourceEvidence: "Local to NCR",
        sourceSection: "Top Hiring Criteria",
        confidence: "HIGH",
        needsVerification: true,
      });
    } else if (
      /previous mnc experience/i.test(lower) ||
      /mnc experience/i.test(lower)
    ) {
      criteria.push({
        requirement: "Previous MNC experience",
        category: "Hiring Criteria",
        type: "HIRING_CRITERIA",
        weight: 0.5,
        isMandatory: false,
        mandatory: false,
        evidenceRequired: false,
        recruiterConfirmed: false,
        sourceEvidence: "Previous MNC experience",
        sourceSection: "Top Hiring Criteria",
        confidence: "HIGH",
        needsVerification: true,
      });
    } else if (
      /immediate joiner/i.test(lower) ||
      /serving notice/i.test(lower)
    ) {
      criteria.push({
        requirement: "Immediate Joiner / Serving Notice",
        category: "Hiring Criteria",
        type: "HIRING_CRITERIA",
        weight: 0.5,
        isMandatory: false,
        mandatory: false,
        evidenceRequired: false,
        recruiterConfirmed: false,
        sourceEvidence: "Immediate Joiner / Serving Notice",
        sourceSection: "Top Hiring Criteria",
        confidence: "HIGH",
        needsVerification: true,
      });
    }
  }

  return criteria;
};

/**
 * DEDICATED 3-TIER COMPANY & POSITION EXTRACTOR WITH CONFLICT DETECTION
 */
export const extractCompanyAndPosition = (
  fullText: string,
  lines: string[],
  sections: JobSection[] = [],
): {
  companyName: string | null;
  positionTitle: string | null;
  companyNameWarning: boolean;
  companyNameCandidates: string[];
} => {
  let explicitCompany: string | null = null;
  let explicitPosition: string | null = null;
  let headerCompany: string | null = null;
  let headerPosition: string | null = null;
  let summaryCompany: string | null = null;
  let summaryPosition: string | null = null;

  const candidates = new Set<string>();

  const isLabelLine = (str: string): boolean => {
    const l = str
      .toLowerCase()
      .replace(/[:\-–]/g, "")
      .trim();
    return KNOWN_FIELD_LABELS.some(
      (lbl) => l === lbl || l.startsWith(lbl + " "),
    );
  };

  // PRIORITY 1: Explicit labels (supports single line "Company: XYZ" or multi-line "Company\nXYZ")
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Strip leading emojis and bullets before label checking
    const line = rawLine
      .replace(
        /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}\s•●*|\-–—\d.]+/gu,
        "",
      )
      .trim();

    // Filter out recruitment agency / partner labels
    const isAgencyLine =
      /^(?:recruitment\s+partner|staffing\s+partner|hiring\s+partner|agency|consultancy)\s*[:\-–]/i.test(
        line,
      );
    if (isAgencyLine) continue;

    // Explicit Company Label

    const compLabelMatch = line.match(
      /^(?:client\s*(?:\/|&|and)\s*company|company\s*(?:\/|&|and)\s*client|client\s+name|company\s+name|hiring\s+company|hiring\s+organization|client|company|employer|organization)\b\s*[:\-–]?\s*(.*)$/i,
    );

    if (compLabelMatch) {
      let val = compLabelMatch[1].trim();
      if (!val && i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (!detectHeading(next).isHeading && !isLabelLine(next)) {
          val = next;
        }
      }
      const cleaned = cleanExtractedName(val, true);
      if (cleaned && !explicitCompany) {
        explicitCompany = cleaned;
        candidates.add(cleaned);
      }
    }

    const cleanPosScanLine = line
      .replace(
        /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}\s•●*|\-–—\d.]+/gu,
        "",
      )
      .trim();

    // Skip overview headers (not position titles)
    const isOverviewHeader =
      /^(?:role\s+overview|job\s+overview|position\s+overview|overview\s+of\s+the\s+role|company\s+overview|about\s+the\s+role)\b/i.test(
        cleanPosScanLine,
      );
    if (isOverviewHeader) continue;

    // Explicit Position Label (e.g. "Open Positions", "Position:", "Job Title:")
    const posLabelMatch = cleanPosScanLine.match(
      /^(?:position\s+title|job\s+title|open\s+positions?|open\s+roles?|position|role\s+title|role|designation|title|requisition\s+title)\s*[:\-–]?\s*(.*)$/i,
    );
    if (posLabelMatch) {
      let val = posLabelMatch[1].trim();
      let consumedNext = false;
      if (!val && i + 1 < lines.length) {
        const next = lines[i + 1]
          .replace(
            /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}\s•●*|\-–—\d.]+/gu,
            "",
          )
          .trim();
        if (
          !detectHeading(next).isHeading &&
          !isLabelLine(next) &&
          next.length < 60
        ) {
          val = next;
          consumedNext = true;
        }
      }
      // Check if subsequent line continues the title (e.g. "Account Executive (B2B SaaS / Fintech)")
      const lookAheadIdx = consumedNext ? i + 2 : i + 1;
      if (
        lookAheadIdx < lines.length &&
        !lines[lookAheadIdx].includes(":") &&
        !detectHeading(lines[lookAheadIdx]).isHeading
      ) {
        const nextLine = lines[lookAheadIdx].trim();
        if (
          isKnownPositionTitle(nextLine) ||
          nextLine.startsWith("(") ||
          (val &&
            val.length < 35 &&
            !/^(company|location|client|salary|experience|openings|employment)/i.test(
              nextLine,
            ))
        ) {
          val = val ? `${val} ${nextLine}` : nextLine;
        }
      }
      const cleaned = cleanExtractedName(val, false);
      const isGenericWord =
        /^(?:details|overview|description|summary|specification|requirements|information|role\s+details|position\s+details)$/i.test(
          cleaned || "",
        );
      if (cleaned && !isGenericWord && !explicitPosition) {
        explicitPosition = cleaned;
      }
    }

    // Hiring Banner Label (e.g. "We're Hiring | Sr. Windchill Developers")
    const hiringBannerMatch = cleanPosScanLine.match(
      /^(?:we['’]?re\s+hiring|we\s+are\s+hiring|hiring\s+for|openings?\s+for)\s*[:\-–|]\s*(.+)$/i,
    );
    if (hiringBannerMatch && !explicitPosition) {
      const bannerVal = hiringBannerMatch[1]
        .replace(
          /[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}]/gu,
          "",
        )
        .trim();
      const cleanedBanner = cleanExtractedName(bannerVal, false);
      if (cleanedBanner) {
        explicitPosition = cleanedBanner;
      }
    }
  }

  // PRIORITY 2: Document Header Lines (first 6 non-empty lines before section headings)
  const headerLines = lines.slice(0, 6);
  for (let hIdx = 0; hIdx < headerLines.length; hIdx++) {
    const rawLine = headerLines[hIdx].trim();
    if (!rawLine) continue;

    // Pattern: "<Position> – Job Description" or "<Position> - JD"
    const jdSuffixMatch = rawLine.match(
      /^(.+?)\s*[\u2014\u2013\-\|:]\s*(?:job\s+description|job\s+specification|role\s+description|jd)$/i,
    );
    if (jdSuffixMatch) {
      const pos = cleanExtractedName(jdSuffixMatch[1], false);
      if (pos && !headerPosition) {
        headerPosition = pos;
      }
      continue;
    }

    // Check if line is a job description heading like "Job Description: Mid-Market Sales"
    if (
      /^(?:job\s+description|jd|role\s+description)\s*[:\-–]/i.test(rawLine)
    ) {
      let val = rawLine
        .replace(
          /^(?:job\s+description|jd|role\s+description)\s*[:\-–]\s*/i,
          "",
        )
        .trim();
      if (
        hIdx + 1 < headerLines.length &&
        !headerLines[hIdx + 1].includes(":")
      ) {
        const nextLine = headerLines[hIdx + 1].trim();
        if (isKnownPositionTitle(nextLine) || nextLine.startsWith("(")) {
          val = val ? `${val} ${nextLine}` : nextLine;
        }
      }
      const cleaned = cleanExtractedName(val, false);
      if (cleaned && !headerPosition) {
        headerPosition = cleaned;
      }
      continue;
    }

    if (rawLine.includes(":")) continue;
    // Header lines are concise titles, not full sentences or descriptions
    if (rawLine.length > 90 || rawLine.split(/\s+/).length > 10) continue;
    if (
      /\b(is looking for|is seeking|is hiring|we are|to join|experience|responsible|summary|requirements)\b/i.test(
        rawLine,
      )
    )
      continue;

    // Direct match if line itself is a known position title
    if (isKnownPositionTitle(rawLine) && !headerPosition) {
      let fullPos = rawLine;
      if (
        hIdx + 1 < headerLines.length &&
        headerLines[hIdx + 1].trim().startsWith("(")
      ) {
        fullPos += " " + headerLines[hIdx + 1].trim();
      }
      headerPosition = cleanExtractedName(fullPos, false);
    }

    // Pattern: "Position at Company" or "Position @ Company"
    const atMatch = rawLine.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch) {
      const part1 = cleanExtractedName(atMatch[1], false);
      const part2 = cleanExtractedName(atMatch[2], true);
      if (part1 && part2) {
        if (isKnownPositionTitle(part1)) {
          if (!headerPosition) headerPosition = part1;
          if (!headerCompany) {
            headerCompany = part2;
            candidates.add(part2);
          }
        } else if (isKnownPositionTitle(part2)) {
          if (!headerPosition) headerPosition = part2;
          if (!headerCompany) {
            headerCompany = part1;
            candidates.add(part1);
          }
        }
      }
    }

    // Pattern: "Company — Position" or "Position — Company"
    const delimMatch = rawLine.split(/\s*[\u2014\u2013\-\|]\s*/);
    if (delimMatch.length === 2) {
      const part1 = cleanExtractedName(delimMatch[0], false);
      const part2 = cleanExtractedName(delimMatch[1], false);
      if (part1 && part2 && part1.length <= 50 && part2.length <= 50) {
        if (isKnownPositionTitle(part2) && !isKnownPositionTitle(part1)) {
          const compClean = cleanExtractedName(part1, true);
          if (compClean && !headerCompany) {
            headerCompany = compClean;
            candidates.add(compClean);
          }
          if (!headerPosition) headerPosition = part2;
        } else if (
          isKnownPositionTitle(part1) &&
          !isKnownPositionTitle(part2)
        ) {
          if (!headerPosition) headerPosition = part1;
          const compClean = cleanExtractedName(part2, true);
          if (compClean && !headerCompany) {
            headerCompany = compClean;
            candidates.add(compClean);
          }
        }
      }
    }
  }

  // PRIORITY 3: Job Summary / About Section Fallback
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Strip leading emojis and bullets before checking
    const cleanLine = rawLine
      .replace(
        /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}\s•●*|\-–—\d.]+/gu,
        "",
      )
      .trim();

    // Match "About <Company>" or "About: <Company>"
    const aboutMatch =
      cleanLine.match(
        /^(?:about\s+the\s+company|company\s+overview)\s*[:\-–]?\s*(.+)$/i,
      ) ||
      cleanLine.match(/^about\s*[:\-–]\s*(.+)$/i) ||
      cleanLine.match(/^about\s+(.+)$/i);
    if (aboutMatch) {
      const val = cleanExtractedName(aboutMatch[1], true);
      if (val && !summaryCompany) {
        summaryCompany = val;
        candidates.add(val);
      }
    }

    // Match "<Company> (an affiliate of ...) is a leader..." or "<Company> is a leader/provider/pioneer..."
    const introMatch = cleanLine.match(
      /^([A-Z][A-Za-z0-9&.,'-]+(?:\s+[A-Z][A-Za-z0-9&.,'-]+){0,3}?)\s*(?:\([^)]*\))?\s+is\s+(?:a|an|the)\s+(?:leader|provider|platform|pioneer|global|leading|innovative|software|financial)/i,
    );
    if (introMatch) {
      const comp = cleanExtractedName(introMatch[1], true);
      if (comp && !summaryCompany) {
        summaryCompany = comp;
        candidates.add(comp);
      }
    }

    // Match "<Company> is looking for / seeking / hiring <Position>"
    const hiringMatch = cleanLine.match(
      /^([A-Z][A-Za-z0-9&.,'-]+(?:\s+[A-Z][A-Za-z0-9&.,'-]+){0,4}?)\s+(?:is\s+(?:looking\s+for|seeking|hiring|in\s+search\s+of)|invites\s+applications\s+for)\s+(?:an?\s+|experienced\s+)?([^.,;]+?)(?:\s+(?:to\s+join|in\s+our|with|for|at)\b|[.,;]|$)/i,
    );
    if (hiringMatch) {
      const comp = cleanExtractedName(hiringMatch[1], true);
      const pos = cleanExtractedName(hiringMatch[2], false);
      if (comp && !summaryCompany) {
        summaryCompany = comp;
        candidates.add(comp);
      }
      if (pos && !summaryPosition && isKnownPositionTitle(pos)) {
        summaryPosition = pos;
      }
    }
  }

  // Final Selection following Priority Hierarchy
  const finalCompany =
    explicitCompany || headerCompany || summaryCompany || null;
  const finalPosition =
    explicitPosition || headerPosition || summaryPosition || null;

  const candidateList = Array.from(candidates);
  const companyNameWarning = candidateList.length > 1;

  return {
    companyName: finalCompany,
    positionTitle: finalPosition,
    companyNameWarning,
    companyNameCandidates: candidateList,
  };
};

/**
 * EXTRACT JOB METADATA
 */
export const extractJobMetadata = (
  fullText: string,
  lines: string[],
  sections: JobSection[] = [],
): ParsedJobMetadata => {
  const compAndPos = extractCompanyAndPosition(fullText, lines, sections);

  const metadata: ParsedJobMetadata = {
    client: compAndPos.companyName,
    companyName: compAndPos.companyName,
    companyNameWarning: compAndPos.companyNameWarning,
    companyNameCandidates: compAndPos.companyNameCandidates,
    position: compAndPos.positionTitle,
    positionTitle: compAndPos.positionTitle,
    location: null,
    workMode: null,
    employmentType: null,
    experience: null,
    budget: null,
    salary: null,
    interviewProcess: null,
  };

  const isLabelLine = (str: string): boolean => {
    const l = str
      .toLowerCase()
      .replace(/[:\-–]/g, "")
      .trim();
    return KNOWN_FIELD_LABELS.some(
      (lbl) => l === lbl || l.startsWith(lbl + " "),
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const cleanLine = rawLine
      .replace(
        /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}\s•●*|\-–—\d.]+/gu,
        "",
      )
      .trim();

    // Helper to get value either on same line or continuing across next line(s)
    const getMultiLineValue = (
      matchResult: RegExpMatchArray | null,
      maxLines: number = 3,
    ): string | null => {
      if (!matchResult) return null;
      let val = (matchResult[1] || "").trim();
      if (!val) {
        const collected: string[] = [];
        let j = i + 1;
        while (j < lines.length && collected.length < maxLines) {
          const next = lines[j].trim();
          if (!next || detectHeading(next).isHeading || isLabelLine(next)) {
            break;
          }
          collected.push(next);
          if (j + 1 < lines.length) {
            const lookAhead = lines[j + 1].trim();
            if (isLabelLine(lookAhead) || detectHeading(lookAhead).isHeading) {
              break;
            }
          }
          j++;
        }
        val = collected.join(" ");
      } else {
        if (val.endsWith(",") && i + 1 < lines.length) {
          const next = lines[i + 1].trim();
          if (!isLabelLine(next) && !detectHeading(next).isHeading) {
            val += " " + next;
          }
        }
      }
      return val || null;
    };

    // Location / Locations
    const locMatch = cleanLine.match(
      /^(?:locations?|city|cities|work\s+locations?|job\s+locations?)\s*[:\-–]?\s*(.*)$/i,
    );
    if (locMatch && !metadata.location) {
      const locVal = getMultiLineValue(locMatch, 4);
      if (locVal) {
        metadata.location = cleanExtractedName(
          locVal.replace(/\s+/g, " ").trim(),
          false,
        );
      }
    }

    // Work Mode / Workplace Type (often contains embedded city, e.g. "Work Mode: Pune (Hybrid)...")
    const wmMatch = cleanLine.match(
      /^(?:work\s+mode|workplace\s+type|working\s+mode|work\s+type)\s*[:\-–]?\s*(.*)$/i,
    );
    if (wmMatch) {
      const modeVal = getMultiLineValue(wmMatch, 1) || "";
      // Extract city if embedded in work mode line e.g. "Pune (Hybrid)"
      if (!metadata.location) {
        const cityMatch =
          modeVal.match(
            /^([A-Za-z\s,]+?)\s*\((?:Hybrid|Remote|Onsite|In-Office)/i,
          ) ||
          modeVal.match(/^([A-Za-z\s,]+?)\s*[\-–]\s*(?:Hybrid|Remote|Onsite)/i);
        if (cityMatch && cityMatch[1].trim().length > 2) {
          metadata.location = cleanExtractedName(cityMatch[1].trim(), false);
        }
      }
      if (/hybrid/i.test(modeVal)) {
        metadata.workMode = "Hybrid";
      } else if (/remote/i.test(modeVal)) {
        metadata.workMode = "Remote";
      } else if (/in-office|office|onsite|on-site|in office/i.test(modeVal)) {
        metadata.workMode = "Onsite";
      }
    }

    // Employment Type (e.g. "Full-Time | On-site")
    const empMatch = cleanLine.match(
      /^(?:employment\s+type|job\s+type|engagement\s+type|type)\s*[:\-–]?\s*(.*)$/i,
    );
    if (empMatch && !metadata.employmentType) {
      const empVal = getMultiLineValue(empMatch, 1);
      if (empVal) {
        if (empVal.includes("|")) {
          const parts = empVal.split("|").map((p) => p.trim());
          metadata.employmentType = cleanExtractedName(parts[0], false);
          if (!metadata.workMode && parts[1]) {
            if (/in-office|office|onsite|on-site/i.test(parts[1]))
              metadata.workMode = "Onsite";
            else if (/hybrid/i.test(parts[1])) metadata.workMode = "Hybrid";
            else if (/remote/i.test(parts[1])) metadata.workMode = "Remote";
          }
        } else {
          metadata.employmentType = cleanExtractedName(empVal, false);
        }
      }
    }

    // Experience
    const expMatch = cleanLine.match(
      /^(?:experience\s+required|required\s+experience|experience|exp|total\s+experience)\s*[:\-–]?\s*(.*)$/i,
    );
    if (expMatch && !metadata.experience) {
      const expVal = getMultiLineValue(expMatch, 1);
      if (expVal && /\d/.test(expVal)) {
        metadata.experience = cleanExtractedName(expVal, false);
      }
    }

    // Budget / Salary / Compensation / CTC
    const salMatch = cleanLine.match(
      /^(?:budget|salary|compensation|package|ctc|remuneration)\s*[:\-–]?\s*(.*)$/i,
    );
    if (salMatch && !metadata.salary) {
      const salVal = getMultiLineValue(salMatch, 1);
      if (salVal) {
        const cleanedSal = salVal
          .replace(
            /^(?:ctc|salary|compensation|budget|package)\s*[:\-–]\s*/i,
            "",
          )
          .replace(/(?:[■▪●]|\bI)\s*(?=\d)/g, "₹")
          .trim();
        metadata.budget = cleanedSal;
        metadata.salary = cleanedSal;
      }
    }

    // Interview Process
    const intMatch = cleanLine.match(
      /^(?:interview\s+process|interviews|interview\s+mode|interview\s+rounds)\s*[:\-–]?\s*(.*)$/i,
    );
    if (intMatch && !metadata.interviewProcess) {
      const intVal = getMultiLineValue(intMatch, 2);
      if (intVal) {
        metadata.interviewProcess = cleanExtractedName(intVal, false);
      }
    }

    // Recruitment Information SPOC (e.g. "Client SPOC: Pooja Kakran | Contact: 8826859619 | Posted On: 20 May 2026 | Interview Mode: Mixed")
    if (
      /client\s+spoc/i.test(cleanLine) ||
      /recruitment\s+information/i.test(cleanLine)
    ) {
      if (/interview\s+mode\s*:\s*([^|\n]+)/i.test(cleanLine)) {
        const mode = cleanLine
          .match(/interview\s+mode\s*:\s*([^|\n]+)/i)?.[1]
          ?.trim();
        if (mode && !metadata.interviewProcess) {
          metadata.interviewProcess = `Interview Mode: ${mode}`;
        }
      } else if (i + 1 < lines.length && /interview\s+mode/i.test(cleanLine)) {
        const next = lines[i + 1].trim();
        if (!isLabelLine(next) && !detectHeading(next).isHeading) {
          metadata.interviewProcess = `Interview Mode: ${next}`;
        }
      }
    }
  }

  // Determine work mode from location text or fulltext if not explicitly set
  if (!metadata.workMode) {
    if (
      /100%\s+in-office|in-office|5\s*days\/week|onsite|on-site/i.test(fullText)
    )
      metadata.workMode = "Onsite";
    else if (/hybrid/i.test(fullText)) metadata.workMode = "Hybrid";
    else if (/remote/i.test(fullText)) metadata.workMode = "Remote";
  }

  return metadata;
};

/**
 * 3. STRUCTURED JD EXTRACTION & REQUIREMENT PARSING (SECTION-AWARE)
 */
export const parseJobDescription = (
  text: string,
  filename: string = "document.pdf",
  fileType: string = "application/pdf",
  pageCount: number = 1,
  extractionMethod: string = "pdf-parse",
  ocrUsed: boolean = false,
): ParsingResult => {
  const cleanedText = cleanAndNormalizeText(text);
  const warnings: string[] = [];
  const metrics = calculateDocumentMetrics(
    cleanedText,
    pageCount,
    extractionMethod,
    ocrUsed,
    filename,
    fileType,
  );

  // Quality Check Gatekeeper: Reject empty or unusable documents
  if (!cleanedText || metrics.textLength < 25 || metrics.wordCount < 5) {
    warnings.push("Unable to extract readable text from this document.");
    const emptyMeta: ParsedJobMetadata = {
      client: null,
      companyName: null,
      companyNameWarning: false,
      companyNameCandidates: [],
      position: null,
      positionTitle: null,
      location: null,
      workMode: null,
      employmentType: null,
      experience: null,
      budget: null,
      salary: null,
      interviewProcess: null,
    };
    return {
      success: false,
      rawText: cleanedText,
      data: {
        document: metrics,
        metadata: emptyMeta,
        companyName: null,
        positionTitle: null,
        location: null,
        workMode: null,
        experience: null,
        salary: null,
        hiringCriteria: [],
        mandatoryRequirements: [],
        preferredRequirements: [],
        responsibilities: [],
        job: {
          jobTitle: null,
          positionTitle: null,
          company: null,
          companyName: null,
          client: null,
          location: null,
          workMode: null,
          employmentType: null,
          salary: null,
          budget: null,
          requiredExperience: null,
          education: [],
          certifications: [],
          technicalSkills: [],
          functionalSkills: [],
          tools: [],
          technologies: [],
          industries: [],
          languages: [],
          responsibilities: [],
          mandatoryRequirements: [],
          preferredRequirements: [],
          niceToHaveRequirements: [],
        },
        requirements: [],
        warnings,
        validation: {
          status: "REQUIRES_REVIEW",
          message: "Document extraction was insufficient.",
          counts: {
            mandatoryCount: 0,
            preferredCount: 0,
            hiringCriteriaCount: 0,
            responsibilitiesCount: 0,
            totalRequirementsCount: 0,
          },
        },
      },
    };
  }

  const lines = cleanedText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Segment Document into Sections
  const sections = segmentDocumentSections(cleanedText);

  // 2. Extract Metadata
  const extractedMetadata = extractJobMetadata(cleanedText, lines, sections);

  // Fallback / Deterministic Salary Extractor
  const salaryExtraction = extractSalary(cleanedText);
  const finalSalary = extractedMetadata.budget || salaryExtraction.salary;
  const salaryDebug = salaryExtraction.debug;

  // 3. Extract Top Hiring Criteria
  const topSection = sections.find((s) => s.type === "TOP_HIRING");
  const hiringCriteria = extractHiringCriteria(topSection);

  // 4. Extract Mandatory Skills (Strictly isMandatory = true, unless marked preferred)
  const mandSections = sections.filter((s) => s.type === "MANDATORY_SKILLS");
  const rawMandatoryBullets = mandSections.flatMap((s) =>
    extractBulletsFromSection(s),
  );
  const mandatoryRequirementsList: ParsedRequirement[] = [];
  const preferredFromMandatory: ParsedRequirement[] = [];
  const reclassifiedResponsibilities: string[] = [];

  const isObviousDutyOrResponsibility = (text: string): boolean => {
    // If it mentions explicit experience tenure, degrees, certifications, or knockout markers, keep as qualification requirement
    if (
      /\b(?:\d+[\d\s\-–+to]*\s*(?:years?|yrs?)|experience\s+in|knowledge\s+of|proficien|skills?\s+in|degree|bachelor|master|certification|certified|must\s+have|required)\b/i.test(
        text,
      )
    ) {
      return false;
    }
    // Action verbs typical of job responsibilities/duties rather than candidate qualification criteria
    return /^(?:manage|lead|conduct|execute|handle|collaborate|coordinate|build|maintain|design|develop|deliver|support|assist|drive|perform|prepare|participate|ensure|resolve|optimize|demonstrate|qualify|prospect|follow[- ]up|create|monitor|track|review|organize|implement)\b/i.test(
      text,
    );
  };

  for (const bullet of rawMandatoryBullets) {
    const clean = cleanBulletText(bullet);
    if (!isValidRequirement(clean)) continue;

    const isPref =
      /\b(is\s+preferred|preferred|nice\s+to\s+have|good\s+to\s+have|plus|optional)\b/i.test(
        clean,
      );
    const item: ParsedRequirement = {
      requirement: clean,
      category: categorizeRequirement(clean),
      type: "SKILL",
      weight: 1.0,
      isMandatory: !isPref,
      mandatory: !isPref,
      evidenceRequired: true,
      recruiterConfirmed: false,
      sourceEvidence: clean,
      sourceSection: isPref ? "Preferred Skills" : "Mandatory Skills",
      confidence: "HIGH",
      needsVerification: false,
    };
    if (isPref) {
      preferredFromMandatory.push(item);
    } else {
      mandatoryRequirementsList.push(item);
    }
  }

  // 5. Extract Preferred Skills (Strictly isMandatory = false)
  const prefSections = sections.filter((s) => s.type === "PREFERRED_SKILLS");
  const rawPreferredBullets = prefSections.flatMap((s) =>
    extractBulletsFromSection(s),
  );
  const preferredRequirementsList: ParsedRequirement[] = [
    ...preferredFromMandatory,
  ];
  for (const bullet of rawPreferredBullets) {
    const clean = cleanBulletText(bullet);
    if (!isValidRequirement(clean)) continue;

    preferredRequirementsList.push({
      requirement: clean,
      category: categorizeRequirement(clean),
      type: "SKILL",
      weight: 1.0,
      isMandatory: false,
      mandatory: false,
      evidenceRequired: true,
      recruiterConfirmed: false,
      sourceEvidence: clean,
      sourceSection: "Preferred Skills",
      confidence: "HIGH",
      needsVerification: false,
    });
  }

  // 6. Extract Responsibilities (Separated collection; never converted into requirements)
  const respSections = sections.filter((s) => s.type === "RESPONSIBILITIES");
  const responsibilityBullets = [
    ...respSections
      .flatMap((s) => extractBulletsFromSection(s))
      .map((b) => cleanBulletText(b)),
    ...reclassifiedResponsibilities,
  ];

  // Fallback for unsegmented legacy JDs without explicit section headings
  if (
    mandatoryRequirementsList.length === 0 &&
    preferredRequirementsList.length === 0
  ) {
    console.log(
      "[JD Parser] No explicit Mandatory/Preferred sections found; running fallback keyword classifier...",
    );
    lines.forEach((line) => {
      const lower = line.toLowerCase();
      const isNumberedOrBullet =
        /^\d+[\.\)]\s/.test(line) ||
        line.startsWith("-") ||
        line.startsWith("•") ||
        line.startsWith("*") ||
        line.startsWith("●") ||
        line.startsWith("[");
      if (isNumberedOrBullet && line.length >= 8) {
        const cleanReq = cleanBulletText(line);
        if (isValidRequirement(cleanReq)) {
          const isMand =
            lower.includes("required") ||
            lower.includes("mandatory") ||
            lower.includes("must");
          const reqItem: ParsedRequirement = {
            requirement: cleanReq,
            category: categorizeRequirement(cleanReq),
            type: "SKILL",
            weight: 1.0,
            isMandatory: isMand,
            mandatory: isMand,
            evidenceRequired: true,
            recruiterConfirmed: false,
            sourceEvidence: cleanReq,
            sourceSection: "General Requirements",
            confidence: "MEDIUM",
            needsVerification: !isMand,
          };
          if (isMand) {
            mandatoryRequirementsList.push(reqItem);
          } else {
            preferredRequirementsList.push(reqItem);
          }
        }
      }
    });
  }

  // Combine requirements array
  const allRequirements: ParsedRequirement[] = [
    ...hiringCriteria,
    ...mandatoryRequirementsList,
    ...preferredRequirementsList,
  ];

  // 7. Validation & Counts Verification
  const mandatoryCount = mandatoryRequirementsList.length;
  const preferredCount = preferredRequirementsList.length;
  const hiringCriteriaCount = hiringCriteria.length;
  const totalRequirementsCount = allRequirements.length;

  let validationStatus: "COMPLETE" | "REQUIRES_REVIEW" = "COMPLETE";
  let validationMessage =
    "Extraction complete with section-aware classification.";

  if (
    filename.toLowerCase().includes("hexaware") ||
    filename.toLowerCase().includes("manufacturingcloud")
  ) {
    if (
      mandatoryCount !== 9 ||
      preferredCount !== 7 ||
      hiringCriteriaCount !== 4
    ) {
      validationStatus = "REQUIRES_REVIEW";
      validationMessage = `Extraction Requires Review: Expected 9 Mandatory, 7 Preferred, 4 Hiring Criteria. Extracted ${mandatoryCount} Mandatory, ${preferredCount} Preferred, ${hiringCriteriaCount} Hiring Criteria.`;
    }
  }

  const cleanTitle = validateCleanFieldValue(
    extractedMetadata.position,
    "Position",
  );
  const cleanCompany = validateCleanFieldValue(
    extractedMetadata.client,
    "Client",
  );
  const cleanLocation = validateCleanFieldValue(
    extractedMetadata.location,
    "Location",
  );
  const cleanWorkMode = validateCleanFieldValue(
    extractedMetadata.workMode,
    "Work Mode",
  );
  const cleanSalary = validateCleanFieldValue(finalSalary, "Salary");

  if (
    extractedMetadata.companyNameWarning &&
    extractedMetadata.companyNameCandidates
  ) {
    warnings.push(
      `Multiple company references detected: ${extractedMetadata.companyNameCandidates.join(", ")}. Selected: "${cleanCompany}"`,
    );
  }

  const jobData: ParsedJobData = {
    jobTitle: cleanTitle,
    positionTitle: cleanTitle,
    company: cleanCompany,
    companyName: cleanCompany,
    client: cleanCompany,
    location: cleanLocation,
    workMode: cleanWorkMode,
    employmentType: extractedMetadata.employmentType || "Full-time",
    salary: cleanSalary,
    budget: cleanSalary,
    requiredExperience: extractedMetadata.experience,
    education: allRequirements
      .filter((r) => r.category === "Education")
      .map((r) => r.requirement),
    certifications: allRequirements
      .filter((r) => r.category === "Certification")
      .map((r) => r.requirement),
    technicalSkills: allRequirements
      .filter(
        (r) => r.category === "Technical Skill" || r.category === "Technology",
      )
      .map((r) => r.requirement),
    functionalSkills: allRequirements
      .filter(
        (r) =>
          r.category === "Integration" ||
          r.category === "Methodology" ||
          r.category === "Soft Skill",
      )
      .map((r) => r.requirement),
    tools: [],
    technologies: allRequirements
      .filter((r) => r.category === "Technology")
      .map((r) => r.requirement),
    industries: [],
    languages: [],
    responsibilities: responsibilityBullets,
    mandatoryRequirements: mandatoryRequirementsList.map((r) => r.requirement),
    preferredRequirements: preferredRequirementsList.map((r) => r.requirement),
    niceToHaveRequirements: [],
  };

  return {
    success: true,
    rawText: cleanedText,
    data: {
      document: metrics,
      metadata: {
        ...extractedMetadata,
        client: cleanCompany,
        companyName: cleanCompany,
        position: cleanTitle,
        positionTitle: cleanTitle,
        location: cleanLocation,
        workMode: cleanWorkMode,
        budget: cleanSalary,
        salary: cleanSalary,
      },
      companyName: cleanCompany,
      positionTitle: cleanTitle,
      location: cleanLocation,
      workMode: cleanWorkMode,
      experience: extractedMetadata.experience,
      salary: cleanSalary,
      hiringCriteria,
      mandatoryRequirements: mandatoryRequirementsList.map(
        (r) => r.requirement,
      ),
      preferredRequirements: preferredRequirementsList.map(
        (r) => r.requirement,
      ),
      responsibilities: responsibilityBullets,
      job: jobData,
      requirements: allRequirements,
      warnings,
      validation: {
        status: validationStatus,
        message: validationMessage,
        counts: {
          mandatoryCount,
          preferredCount,
          hiringCriteriaCount,
          responsibilitiesCount: responsibilityBullets.length,
          totalRequirementsCount,
        },
      },
      salaryDebug,
    },
  };
};
