import { CandidateSummaryData } from '@/components/evaluation/CandidateExecutiveSummary';

/**
 * Pure TypeScript / JavaScript PDF-1.4 Generator
 * Generates identical Executive Candidate Evaluation Report PDF without external libraries or filesystem fonts.
 * Guaranteed to run in all browsers and serverless runtimes.
 */

function escapePdfText(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' '); // Keep printable Latin-1 / WinAnsi characters
}

// Approximate text widths for standard Helvetica
function getTextWidth(text: string, fontSize: number): number {
  if (!text) return 0;
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 32) width += 0.28;
    else if ('ijlI1.:;,!|'.includes(text[i])) width += 0.28;
    else if ('mwMW@'.includes(text[i])) width += 0.85;
    else if (code >= 65 && code <= 90) width += 0.68;
    else width += 0.52;
  }
  return width * fontSize;
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (getTextWidth(testLine, fontSize) > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function stringToLatin1Bytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export function buildExecutiveSummaryPdf(summary: CandidateSummaryData): Uint8Array {
  const pageWidth = 595.28;
  const pageHeight = 841.89;

  const p1: string[] = [];
  const p2: string[] = [];

  const toPdfY = (topY: number) => (pageHeight - topY).toFixed(2);

  const drawRect = (cmds: string[], x: number, topY: number, w: number, h: number, fillRGB: string | null, strokeRGB: string | null) => {
    cmds.push('q');
    if (fillRGB) cmds.push(`${fillRGB} rg`);
    if (strokeRGB) cmds.push(`${strokeRGB} RG 1 w`);
    cmds.push(`${x.toFixed(2)} ${toPdfY(topY + h)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (fillRGB && strokeRGB) cmds.push('B');
    else if (fillRGB) cmds.push('f');
    else if (strokeRGB) cmds.push('S');
    cmds.push('Q');
  };

  const drawRoundedRect = (cmds: string[], x: number, topY: number, w: number, h: number, r: number, fillRGB: string | null, strokeRGB: string | null) => {
    const x1 = x, y1 = topY, x2 = x + w, y2 = topY + h;
    const py1 = pageHeight - y2;
    cmds.push('q');
    if (fillRGB) cmds.push(`${fillRGB} rg`);
    if (strokeRGB) cmds.push(`${strokeRGB} RG 0.8 w`);
    
    cmds.push(`${(x1 + r).toFixed(2)} ${py1.toFixed(2)} m`);
    cmds.push(`${(x2 - r).toFixed(2)} ${py1.toFixed(2)} l`);
    cmds.push(`${x2.toFixed(2)} ${py1.toFixed(2)} ${(x2).toFixed(2)} ${(py1 + r).toFixed(2)} v`);
    cmds.push(`${x2.toFixed(2)} ${(pageHeight - y1 - r).toFixed(2)} l`);
    cmds.push(`${x2.toFixed(2)} ${(pageHeight - y1).toFixed(2)} ${(x2 - r).toFixed(2)} ${(pageHeight - y1).toFixed(2)} v`);
    cmds.push(`${(x1 + r).toFixed(2)} ${(pageHeight - y1).toFixed(2)} l`);
    cmds.push(`${x1.toFixed(2)} ${(pageHeight - y1).toFixed(2)} ${x1.toFixed(2)} ${(pageHeight - y1 - r).toFixed(2)} v`);
    cmds.push(`${x1.toFixed(2)} ${(py1 + r).toFixed(2)} l`);
    cmds.push(`${x1.toFixed(2)} ${py1.toFixed(2)} ${(x1 + r).toFixed(2)} ${py1.toFixed(2)} v`);
    
    if (fillRGB && strokeRGB) cmds.push('B');
    else if (fillRGB) cmds.push('f');
    else if (strokeRGB) cmds.push('S');
    cmds.push('Q');
  };

  const drawText = (cmds: string[], text: string, x: number, topY: number, font: string, size: number, rgb: string, charSpacing = 0) => {
    if (!text) return;
    cmds.push('BT');
    cmds.push(`/${font} ${size} Tf`);
    cmds.push(`${rgb} rg`);
    if (charSpacing) cmds.push(`${charSpacing} Tc`);
    cmds.push(`1 0 0 1 ${x.toFixed(2)} ${toPdfY(topY)} Tm`);
    cmds.push(`(${escapePdfText(text)}) Tj`);
    if (charSpacing) cmds.push('0 Tc');
    cmds.push('ET');
  };

  const drawCircle = (cmds: string[], cx: number, topY: number, r: number, fillRGB: string) => {
    cmds.push('q');
    cmds.push(`${fillRGB} rg`);
    const cy = pageHeight - topY;
    const d = r * 0.552284749831;
    cmds.push(`${(cx - r).toFixed(2)} ${cy.toFixed(2)} m`);
    cmds.push(`${(cx - r).toFixed(2)} ${(cy + d).toFixed(2)} ${(cx - d).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`);
    cmds.push(`${(cx + d).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy + d).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`);
    cmds.push(`${(cx + r).toFixed(2)} ${(cy - d).toFixed(2)} ${(cx + d).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`);
    cmds.push(`${(cx - d).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy - d).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`);
    cmds.push('f');
    cmds.push('Q');
  };

  // Theme Colors
  const cOrange = '0.2078 0.3882 0.9137';   // #3563E9 Royal Blue
  const cPrimary = '0.0627 0.0941 0.1569';  // #101828 Primary Navy
  const cGray = '0.4000 0.4392 0.5216';     // #667085 Secondary Text
  const cLightBg = '0.9686 0.9725 0.9882';  // #F7F8FC
  const cBorder = '0.9176 0.9255 0.9412';   // #EAECF0
  const cGreen = '0.0824 0.5882 0.4157';    // #15966A
  const cRed = '0.8510 0.2824 0.2824';      // #D94848
  const cDarkRed = '0.7255 0.1098 0.1098';  // #B91C1C
  const cMuted = '0.5804 0.6392 0.7216';    // #94A3B8

  // ────────────────────────────────────────────────────────
  // ── PAGE 1 ──
  // ────────────────────────────────────────────────────────

  // Header top orange bar
  drawRect(p1, 40, 40, 515.28, 5, cOrange, null);

  // Title & Subtitle
  drawText(p1, 'EXECUTIVE CANDIDATE EVALUATION REPORT', 40, 68, 'F2', 18, cPrimary);
  drawText(p1, 'TASKNERA ATS • EVIDENCE-GROUNDED CANDIDATE SUMMARY', 40, 84, 'F2', 9, cOrange, 1);

  // Overview Card
  const cardTop = 98;
  drawRoundedRect(p1, 40, cardTop, 515.28, 95, 8, cLightBg, cBorder);

  // Candidate Details
  const candName = summary.overview?.fullName || 'Candidate';
  drawText(p1, candName, 55, cardTop + 24, 'F2', 14, cPrimary);
  drawText(p1, `Target Requisition: ${summary.jobTitle || 'Active Pool'} (${summary.jobClient || 'Client'})`, 55, cardTop + 40, 'F1', 9, cGray);
  drawText(p1, `Location: ${summary.overview?.location || 'Not available in resume'} • Experience: ${summary.overview?.totalExperience || 'Not specified'}`, 55, cardTop + 54, 'F1', 9, cGray);
  drawText(p1, `Current: ${summary.overview?.currentDesignation || 'Professional'} at ${summary.overview?.currentCompany || 'Not available in resume'}`, 55, cardTop + 68, 'F1', 9, cGray);
  drawText(p1, `Contact: ${summary.overview?.email || 'N/A'} | ${summary.overview?.phone || 'N/A'}`, 55, cardTop + 82, 'F1', 9, cGray);

  // Right ATS Score Gauge
  const scoreBoxX = 445;
  drawRoundedRect(p1, scoreBoxX, cardTop + 12, 95, 70, 6, cPrimary, null);
  drawText(p1, 'ATS MATCH SCORE', scoreBoxX + 10, cardTop + 28, 'F2', 8, cMuted);
  const scoreText = `${summary.atsScore || 0}%`;
  drawText(p1, scoreText, scoreBoxX + (scoreText.length > 2 ? 26 : 32), cardTop + 54, 'F2', 22, '1 1 1');
  const fitColor = (summary.atsScore || 0) >= 70 ? '0.2039 0.8275 0.5961' : (summary.atsScore || 0) >= 50 ? '0.9843 0.7490 0.1412' : '0.9725 0.4431 0.4431';
  const classText = (summary.finalAssessment?.classification || 'MATCH').toUpperCase();
  drawText(p1, classText, scoreBoxX + 16, cardTop + 72, 'F2', 8, fitColor);

  // Section 1: Professional Summary
  let curY = cardTop + 118;
  drawText(p1, '1. PROFESSIONAL SUMMARY', 40, curY, 'F2', 11, cPrimary);
  curY += 6;
  const profSummaryLines = wrapText(summary.professionalSummary || '', 495, 8.5);
  const sumHeight = Math.max(62, profSummaryLines.length * 12 + 16);
  drawRoundedRect(p1, 40, curY, 515.28, sumHeight, 6, '1 1 1', cBorder);
  let textY = curY + 16;
  for (const line of profSummaryLines) {
    drawText(p1, line, 50, textY, 'F1', 8.5, cGray);
    textY += 12;
  }
  curY += sumHeight + 16;

  // Section 2 & 3: Key Strengths & Potential Gaps (Two Columns)
  const splitY = curY;
  const colWidth = (515.28 - 10) / 2;
  drawText(p1, '2. KEY STRENGTHS & EVIDENCE', 40, splitY, 'F2', 11, cPrimary);
  const rightColX = 40 + colWidth + 10;
  drawText(p1, '3. POTENTIAL GAPS & VERIFICATION', rightColX, splitY, 'F2', 11, cPrimary);

  let prosY = splitY + 18;
  for (const pro of (summary.pros || []).slice(0, 4)) {
    drawCircle(p1, 46, prosY - 3, 2.5, cOrange);
    const pLines = wrapText(pro, colWidth - 25, 8);
    for (const pl of pLines) {
      drawText(p1, pl, 55, prosY, 'F1', 8, cGray);
      prosY += 10.5;
    }
    prosY += 4;
  }

  let consY = splitY + 18;
  for (const con of (summary.cons || []).slice(0, 4)) {
    drawCircle(p1, rightColX + 6, consY - 3, 2.5, cRed);
    const cLines = wrapText(con, colWidth - 25, 8);
    for (const cl of cLines) {
      drawText(p1, cl, rightColX + 16, consY, 'F1', 8, cGray);
      consY += 10.5;
    }
    consY += 4;
  }

  curY = Math.max(prosY, consY) + 12;

  // Section 4: Requisition Skills Matrix
  drawText(p1, '4. REQUISITION SKILLS MATRIX', 40, curY, 'F2', 11, cPrimary);
  curY += 16;

  const matchedSkills = (summary.keySkills?.requiredSkillsFound || []).map(s => s.name).join(', ') || 'Aligned through relevant experience';
  const missingSkills = (summary.keySkills?.requiredSkillsNotFound || []).join(', ') || 'None identified';
  const additionalSkills = (summary.keySkills?.additionalRelevantSkills || []).join(', ') || 'Standard tech stack';

  drawText(p1, 'Required Skills Evidenced: ', 45, curY, 'F2', 8.5, cPrimary);
  const reqLines = wrapText(matchedSkills, 370, 8.5);
  drawText(p1, reqLines[0] || '', 165, curY, 'F1', 8.5, cGreen);
  curY += 13;
  for (let k = 1; k < reqLines.length; k++) {
    drawText(p1, reqLines[k], 165, curY, 'F1', 8.5, cGreen);
    curY += 13;
  }

  drawText(p1, 'Missing / Unverified Skills: ', 45, curY, 'F2', 8.5, cPrimary);
  const missLines = wrapText(missingSkills, 370, 8.5);
  drawText(p1, missLines[0] || '', 165, curY, 'F1', 8.5, cDarkRed);
  curY += 13;
  for (let k = 1; k < missLines.length; k++) {
    drawText(p1, missLines[k], 165, curY, 'F1', 8.5, cDarkRed);
    curY += 13;
  }

  drawText(p1, 'Additional Candidate Skills: ', 45, curY, 'F2', 8.5, cPrimary);
  const addLines = wrapText(additionalSkills, 370, 8.5);
  drawText(p1, addLines[0] || '', 165, curY, 'F1', 8.5, cGray);
  curY += 13;
  for (let k = 1; k < addLines.length; k++) {
    drawText(p1, addLines[k], 165, curY, 'F1', 8.5, cGray);
    curY += 13;
  }
  curY += 10;

  // Section 5: Role-Specific Interview Questions (Q1 to Q4 on Page 1)
  drawText(p1, '5. ROLE-SPECIFIC INTERVIEW QUESTIONS FOR RECRUITER', 40, curY, 'F2', 11, cPrimary);
  curY += 16;

  const questions = summary.interviewQuestions || [];
  for (let idx = 0; idx < Math.min(4, questions.length); idx++) {
    const q = questions[idx];
    drawText(p1, `Q${idx + 1} (${q.category || 'Technical'}): `, 45, curY, 'F2', 8.5, cPrimary);
    const qPrefixWidth = getTextWidth(`Q${idx + 1} (${q.category || 'Technical'}): `, 8.5);
    const qLines = wrapText(q.question, 500 - qPrefixWidth, 8.5);
    drawText(p1, qLines[0] || '', 45 + qPrefixWidth, curY, 'F1', 8.5, cPrimary);
    curY += 11;
    for (let k = 1; k < qLines.length; k++) {
      drawText(p1, qLines[k], 45, curY, 'F1', 8.5, cPrimary);
      curY += 11;
    }
    drawText(p1, `Verification Focus: ${q.whatToVerify}`, 55, curY, 'F3', 7.5, cGray);
    curY += 15;
  }

  // Footer on Page 1
  const genDateStr = new Date(summary.metadata?.generatedAt || Date.now()).toLocaleDateString();
  const f1Text = `Tasknera ATS Report • Generated: ${genDateStr} • Page 1 of 2 • Strictly Confidential`;
  const f1Width = getTextWidth(f1Text, 7);
  drawText(p1, f1Text, (pageWidth - f1Width) / 2, 818, 'F1', 7, cMuted);

  // ────────────────────────────────────────────────────────
  // ── PAGE 2 ──
  // ────────────────────────────────────────────────────────

  let p2Y = 55;
  if (questions.length >= 5) {
    for (let idx = 4; idx < Math.min(7, questions.length); idx++) {
      const q = questions[idx];
      drawText(p2, `Q${idx + 1} (${q.category || 'Scenario'}): `, 45, p2Y, 'F2', 8.5, cPrimary);
      const qPrefixWidth = getTextWidth(`Q${idx + 1} (${q.category || 'Scenario'}): `, 8.5);
      const qLines = wrapText(q.question, 500 - qPrefixWidth, 8.5);
      drawText(p2, qLines[0] || '', 45 + qPrefixWidth, p2Y, 'F1', 8.5, cPrimary);
      p2Y += 12;
      for (let k = 1; k < qLines.length; k++) {
        drawText(p2, qLines[k], 45, p2Y, 'F1', 8.5, cPrimary);
        p2Y += 12;
      }
      drawText(p2, `Verification Focus: ${q.whatToVerify}`, 55, p2Y, 'F3', 7.5, cGray);
      p2Y += 18;
    }
  }

  p2Y += 8;
  // Section 6: Final Recruiter Assessment Card
  drawRoundedRect(p2, 40, p2Y, 515.28, 65, 6, cLightBg, cBorder);
  drawText(p2, '6. FINAL RECRUITER ASSESSMENT', 50, p2Y + 18, 'F2', 10, cPrimary);
  drawText(p2, `Classification: ${summary.finalAssessment?.classification || 'Assessed'} | Suggested Action: `, 50, p2Y + 34, 'F1', 8.5, cGray);
  const actionPrefixW = getTextWidth(`Classification: ${summary.finalAssessment?.classification || 'Assessed'} | Suggested Action: `, 8.5);
  drawText(p2, summary.finalAssessment?.suggestedNextStep || 'Shortlist for Interview', 50 + actionPrefixW, p2Y + 34, 'F2', 8.5, cOrange);
  
  const discLines = wrapText(summary.finalAssessment?.disclaimer || 'This assessment is an assistive recruitment tool grounded strictly in submitted CV and JD evidence. It does not constitute an automated hiring decision.', 495, 7.5);
  let discY = p2Y + 48;
  for (const dl of discLines) {
    drawText(p2, dl, 50, discY, 'F1', 7.5, cGray);
    discY += 10;
  }

  // Footer on Page 2
  const f2Text = `Tasknera ATS Report • Generated: ${genDateStr} • Page 2 of 2 • Strictly Confidential`;
  const f2Width = getTextWidth(f2Text, 7);
  drawText(p2, f2Text, (pageWidth - f2Width) / 2, 818, 'F1', 7, cMuted);

  // ────────────────────────────────────────────────────────
  // ── COMPOSE PDF STRUCTURE (PDF-1.4) ──
  // ────────────────────────────────────────────────────────
  const s1 = p1.join('\n');
  const s2 = p2.join('\n');

  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>';
  objects[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 5 0 R /Resources << /Font << /F1 6 0 R /F2 7 0 R /F3 8 0 R >> >> >>`;
  objects[4] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 9 0 R /Resources << /Font << /F1 6 0 R /F2 7 0 R /F3 8 0 R >> >> >>`;
  objects[5] = `<< /Length ${s1.length} >>\nstream\n${s1}\nendstream`;
  objects[6] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[7] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[8] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';
  objects[9] = `<< /Length ${s2.length} >>\nstream\n${s2}\nendstream`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i <= 9; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const startxref = out.length;
  out += 'xref\n0 10\n0000000000 65535 f \n';
  for (let i = 1; i <= 9; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size 10 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return stringToLatin1Bytes(out);
}

