import PDFDocument from 'pdfkit';
import { CandidateSummaryData } from '@/components/evaluation/CandidateExecutiveSummary';

/**
 * Generates an Executive Candidate Evaluation Report PDF buffer using PDFKit.
 * Matches localhost styling, fonts, margins, colors, and layout exactly.
 */
export async function generateCandidateSummaryPdfBuffer(summary: CandidateSummaryData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        bufferPages: true
      });

      const buffers: Buffer[] = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      const primaryColor = '#101828'; // Navy
      const blueColor = '#3563E9';    // Royal Blue
      const grayText = '#667085';      // Secondary Text
      const lightBg = '#F7F8FC';       // Slate-50
      const borderColor = '#EAECF0';   // Border

      // ── HEADER BRANDING ──
      doc.rect(40, 40, doc.page.width - 80, 5).fill(blueColor);
      doc.moveDown(0.8);

      doc.fontSize(18).fillColor(primaryColor).font('Helvetica-Bold').text('EXECUTIVE CANDIDATE EVALUATION REPORT', 40, 55);
      doc.fontSize(9).fillColor(blueColor).font('Helvetica-Bold').text('TASKNERA ATS • EVIDENCE-GROUNDED CANDIDATE SUMMARY', 40, 78, { characterSpacing: 1 });

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
        doc.circle(46, prosY + 4, 2.5).fill(blueColor);
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
      doc.font('Helvetica-Bold').fillColor(blueColor).text(summary.finalAssessment?.suggestedNextStep || 'Recruiter Review');
      
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
    } catch (err) {
      reject(err);
    }
  });
}

