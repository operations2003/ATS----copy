import pymupdf as fitz  # PyMuPDF
from typing import Dict, Any
from app.services.text_cleaner import clean_extracted_text
from app.services.document_analyzer import analyze_document_quality
from app.services.ocr import perform_pdf_ocr

def extract_multi_column_aware_page(page) -> str:
    """
    Extracts text from a PyMuPDF page with multi-column awareness.
    Groups text blocks into left/right column streams when a 2-column layout is detected.
    """
    try:
        blocks = page.get_text("blocks")
        if not blocks:
            return page.get_text("text") or ""

        # Filter to text blocks only (block_type 0)
        text_blocks = [b for b in blocks if len(b) > 4 and isinstance(b[4], str) and b[4].strip() and (len(b) <= 6 or b[6] == 0)]
        if not text_blocks:
            return page.get_text("text") or ""

        page_width = page.rect.width
        mid_point = page_width * 0.45

        # Check if page is 2-column layout (has substantial blocks on both sides of midpoint)
        left_blocks = [b for b in text_blocks if b[0] < mid_point and b[2] <= page_width * 0.65]
        right_blocks = [b for b in text_blocks if b[0] >= mid_point * 0.8]

        is_two_column = len(left_blocks) >= 3 and len(right_blocks) >= 3

        if is_two_column:
            # Sort left column top-to-bottom, then right column top-to-bottom
            left_sorted = sorted(left_blocks, key=lambda b: (b[1], b[0]))
            right_sorted = sorted(right_blocks, key=lambda b: (b[1], b[0]))
            
            # Other blocks (headers, full-width paragraphs, skills sections, footers)
            other_blocks = [b for b in text_blocks if b not in left_blocks and b not in right_blocks]
            
            # If many blocks span across both columns, standard natural reading order is far superior
            if len(other_blocks) > len(left_blocks) * 0.5:
                sorted_blocks = sorted(text_blocks, key=lambda b: (b[1], b[0]))
                return "\n\n".join([b[4].strip() for b in sorted_blocks if b[4].strip()])

            # Partition other blocks into header, body spanning, and footer
            min_col_top = min(left_sorted[0][1] if left_sorted else 0, right_sorted[0][1] if right_sorted else 0)
            max_col_bottom = max(left_sorted[-1][3] if left_sorted else 0, right_sorted[-1][3] if right_sorted else 0)

            header_blocks = sorted([b for b in other_blocks if b[3] <= min_col_top + 20], key=lambda b: (b[1], b[0]))
            footer_blocks = sorted([b for b in other_blocks if b[1] >= max_col_bottom - 20], key=lambda b: (b[1], b[0]))
            mid_blocks = sorted([b for b in other_blocks if b not in header_blocks and b not in footer_blocks], key=lambda b: (b[1], b[0]))

            combined = []
            for b in header_blocks:
                combined.append(b[4].strip())
            for b in left_sorted:
                combined.append(b[4].strip())
            for b in right_sorted:
                combined.append(b[4].strip())
            for b in mid_blocks:
                combined.append(b[4].strip())
            for b in footer_blocks:
                combined.append(b[4].strip())

            result_layout = "\n\n".join([c for c in combined if c])
            raw_text = page.get_text("text") or ""
            # If column grouping dropped any significant text, fall back to natural text
            if len(result_layout) >= len(raw_text) * 0.9:
                return result_layout
            return raw_text
        else:
            # Standard single column or sorted block layout
            sorted_blocks = sorted(text_blocks, key=lambda b: (b[1], b[0]))
            return "\n\n".join([b[4].strip() for b in sorted_blocks if b[4].strip()])
    except Exception:
        try:
            return page.get_text("text") or ""
        except Exception:
            return ""

def parse_pdf_bytes(pdf_bytes: bytes, filename: str = "") -> Dict[str, Any]:
    """
    Parses PDF using PyMuPDF (fitz) text extraction across all pages safely.
    Handles malformed or password-protected PDFs gracefully with OCR fallback.
    """
    page_count = 1
    extracted_raw = ""
    extracted_layout = ""
    extraction_method = "pymupdf-layout"
    ocr_used = False

    doc = None
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = max(1, len(doc))
        
        raw_texts = []
        layout_texts = []
        for page_num in range(len(doc)):
            try:
                page = doc[page_num]
                raw_txt = page.get_text("text") or ""
                layout_txt = extract_multi_column_aware_page(page)

                if raw_txt.strip():
                    raw_texts.append(raw_txt.strip())
                if layout_txt.strip():
                    layout_texts.append(layout_txt.strip())
            except Exception as page_err:
                continue
        
        extracted_raw = "\n\n".join(raw_texts)
        extracted_layout = "\n\n".join(layout_texts)
    except Exception as e:
        extraction_method = "pdf-stream-fallback"
        extracted_raw = ""
        extracted_layout = ""
    finally:
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass

    cleaned_raw = clean_extracted_text(extracted_raw)
    cleaned_layout = clean_extracted_text(extracted_layout)

    # Always select the most complete extracted text (never discard sections/skills)
    if len(cleaned_raw) >= len(cleaned_layout):
        cleaned_normalized = cleaned_raw
    else:
        cleaned_normalized = cleaned_layout

    metrics = analyze_document_quality(cleaned_normalized, page_count, filename)

    # Trigger Stream Recovery & OCR fallback if text is INSUFFICIENT or FAILED (< 50 chars or < 10 words)
    if (metrics["textQuality"] in ["INSUFFICIENT", "FAILED"] or len(cleaned_normalized) < 40) and len(pdf_bytes) > 0:
        # Step 1: FlateDecode stream decompression recovery (handles corrupted xref / malformed page trees)
        try:
            import zlib
            import re
            stream_regex = re.compile(rb'stream[\r\n]+([\s\S]*?)[\r\n]+endstream')
            streams = stream_regex.findall(pdf_bytes)
            stream_pieces = []
            for s in streams:
                try:
                    decomp = zlib.decompress(s)
                except Exception:
                    try:
                        decomp = zlib.decompress(s, -zlib.MAX_WBITS)
                    except Exception:
                        continue
                decomp_str = decomp.decode('latin1', errors='ignore')
                tj_matches = re.finditer(r'(?:\[([\s\S]*?)\]\s*TJ|\(([\s\S]*?)\)\s*Tj)', decomp_str)
                for m in tj_matches:
                    if m.group(1):
                        subs = re.findall(r'\(([\s\S]*?)(?<!\\)\)', m.group(1))
                        clean_piece = ''.join([sub.replace('\\(', '(').replace('\\)', ')') for sub in subs]).strip()
                        if clean_piece:
                            stream_pieces.append(clean_piece)
                    elif m.group(2):
                        clean_piece = m.group(2).replace('\\(', '(').replace('\\)', ')').strip()
                        if clean_piece:
                            stream_pieces.append(clean_piece)
            if len(stream_pieces) > 5:
                recovered_stream_text = ' '.join(stream_pieces)
                cleaned_rec = clean_extracted_text(recovered_stream_text)
                if len(cleaned_rec) > len(cleaned_normalized):
                    cleaned_normalized = cleaned_rec
                    extracted_layout = cleaned_rec
                    metrics = analyze_document_quality(cleaned_rec, page_count, filename)
                    extraction_method = "pdf-stream-recovery"
        except Exception:
            pass

        # Step 2: OCR Fallback if text is still insufficient
        if (metrics["textQuality"] in ["INSUFFICIENT", "FAILED"] or len(cleaned_normalized) < 40):
            try:
                ocr_text = perform_pdf_ocr(pdf_bytes)
                cleaned_ocr = clean_extracted_text(ocr_text)
                if len(cleaned_ocr.strip()) > len(cleaned_normalized.strip()):
                    cleaned_normalized = cleaned_ocr
                    extracted_layout = cleaned_ocr
                    metrics = analyze_document_quality(cleaned_ocr, page_count, filename)
                    extraction_method = "pymupdf+tesseract-ocr"
                    ocr_used = True
            except Exception:
                pass

    return {
        "text": cleaned_raw or cleaned_normalized,
        "layoutText": cleaned_layout or cleaned_normalized,
        "normalizedText": cleaned_normalized,
        "pageCount": page_count,
        "extractionMethod": extraction_method,
        "ocrUsed": ocr_used,
        "textQuality": metrics["textQuality"],
        "characterCount": metrics["characterCount"],
        "wordCount": metrics["wordCount"],
        # Structured Fields
        "candidateName": metrics["candidateName"],
        "email": metrics["email"],
        "phone": metrics["phone"],
        "skills": metrics["skills"],
        "yearsOfExperience": metrics["yearsOfExperience"],
        "education": metrics["education"],
        "pastCompanies": metrics["pastCompanies"],
        "summary": metrics["summary"],
        "rawTextSummary": metrics["rawTextSummary"],
    }

