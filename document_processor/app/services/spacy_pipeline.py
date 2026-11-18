import os
import re
import json
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

# Load heading synonyms
CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")
HEADING_SYNONYMS_FILE = os.path.join(CONFIG_DIR, "heading_synonyms.json")
TAXONOMY_FILE = os.path.join(CONFIG_DIR, "taxonomy.json")

try:
    with open(HEADING_SYNONYMS_FILE, "r", encoding="utf-8") as f:
        HEADING_SYNONYMS = json.load(f)
except Exception:
    HEADING_SYNONYMS = {}

try:
    with open(TAXONOMY_FILE, "r", encoding="utf-8") as f:
        TAXONOMY = json.load(f)
except Exception:
    TAXONOMY = {}

# Negation patterns
NEGATION_PATTERNS = [
    r'\b(?:no|little|without|zero)\s+([A-Za-z0-9_#+.\- ]{2,40})\s+(?:experience|knowledge|background|exposure)\b',
    r'\b(?:no|not|never|lacks?|without|excluding|none|little)\b\s+(?:experience|knowledge|exposure|background)?\s*(?:with|in|of)?\s+([A-Za-z0-9_#+.\- ]{2,40})',
    r'\b(?:did\s+not|didn\'t|have\s+not|haven\'t|had\s+not|hadn\'t)\s+(?:work\s+(?:on|with)|use|develop|touch)\s+([A-Za-z0-9_#+.\- ]{2,40})',
    r'\b(?:never|not)\s+(?:used|worked\s+(?:with|on)|learned)\s+([A-Za-z0-9_#+.\- ]{2,40})',
    r'\bno\s+hands-on\s+(?:with|in)?\s+([A-Za-z0-9_#+.\- ]{2,40})',
    r'\bmigrated\s+(?:away\s+from|off)\s+([A-Za-z0-9_#+.\- ]{2,40})'
]

MONTH_NAMES = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12
}

def parse_date_token(token: str) -> Optional[Tuple[int, int]]:
    """
    Parses date tokens like 'Jan 2020', '01/2020', '2019', 'Present', 'Current'
    Returns (year, month) or None
    """
    token = token.strip().lower()
    if token in ("present", "current", "now", "ongoing", "till date"):
        now = datetime.now()
        return (now.year, now.month)
    
    # Check 'Month YYYY' e.g. 'March 2021', 'Aug 2018'
    m = re.search(r'([a-z]+)\.?\s*(\d{4})', token)
    if m:
        month_str = m.group(1)
        year = int(m.group(2))
        month = MONTH_NAMES.get(month_str, 1)
        return (year, month)
    
    # Check MM/YYYY or MM-YYYY
    m = re.search(r'(\d{1,2})[/\-](\d{4})', token)
    if m:
        month = max(1, min(12, int(m.group(1))))
        year = int(m.group(2))
        return (year, month)

    # Check standalone YYYY
    m = re.search(r'\b(19\d\d|20\d\d)\b', token)
    if m:
        year = int(m.group(1))
        return (year, 1)

    return None

def segment_sections(text: str) -> Dict[str, str]:
    """
    Deterministic segmentation of CV into standard sections:
    summary, experience, skills, education, projects, certifications, other.
    """
    lines = text.split('\n')
    sections: Dict[str, List[str]] = {
        "summary": [],
        "experience": [],
        "skills": [],
        "education": [],
        "projects": [],
        "certifications": [],
        "other": []
    }
    
    current_section = "other"
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_section:
                sections[current_section].append("")
            continue
        
        # Check if this line matches any heading synonym
        clean_heading = re.sub(r'[^a-zA-Z0-9\s&]', '', stripped).strip().lower()
        matched_category = None
        
        # Check exact and prefix matches
        for cat, synonyms in HEADING_SYNONYMS.items():
            if clean_heading in synonyms or any(clean_heading.startswith(syn + ":") for syn in synonyms):
                matched_category = cat
                break
        
        if matched_category and len(stripped.split()) <= 5:
            current_section = matched_category
            continue
        
        sections[current_section].append(stripped)
    
    return {k: "\n".join(v).strip() for k, v in sections.items()}

def extract_negated_terms(text: str) -> List[str]:
    """
    Detects explicitly negated skills / technologies in candidate text.
    For instance: 'no experience with Azure' -> ['azure']
    """
    negated = set()
    for pattern in NEGATION_PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            term = match.group(1).strip()
            # Clean punctuation from term
            clean_term = re.sub(r'[,.;:!?].*$', '', term).strip().lower()
            if clean_term and len(clean_term) > 1:
                negated.add(clean_term)
                # Split compound items e.g. "react or typescript" -> "react", "typescript"
                tokens = re.split(r'\b(?:or|and|nor|,|\s+experience|\s+knowledge|\s+hands-on)\b', clean_term)
                for t in tokens:
                    t_clean = t.strip()
                    if len(t_clean) >= 2:
                        negated.add(t_clean)
    return list(negated)

def extract_experience_tenure(experience_text: str, relevant_skill_keywords: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Extracts total experience vs relevant experience separately:
    - Parses employment blocks and date spans (start -> end).
    - Calculates non-overlapping total tenure in months.
    - If relevant_skill_keywords provided, attributes duration to relevant tenure
      only when the role or its bullet points contain matching skills.
    """
    date_range_pattern = r'((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|\d{1,2}[/\-])?\s*(?:19\d\d|20\d\d))\s*(?:-|–|—|to)\s*((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|\d{1,2}[/\-])?\s*(?:19\d\d|20\d\d)|Present|Current|Now|Ongoing)'

    blocks = re.split(r'\n{2,}', experience_text)
    roles = []
    all_intervals: List[Tuple[int, int]] = []
    relevant_intervals: List[Tuple[int, int]] = []

    current_year = datetime.now().year
    
    clean_relevant_skills = [s.lower().strip() for s in (relevant_skill_keywords or []) if s.strip()]

    for block in blocks:
        stripped_block = block.strip()
        if not stripped_block:
            continue

        match = re.search(date_range_pattern, stripped_block, re.IGNORECASE)
        if match:
            start_token = match.group(1)
            end_token = match.group(2)
            
            start_date = parse_date_token(start_token)
            end_date = parse_date_token(end_token)
            
            if start_date and end_date:
                start_month_index = start_date[0] * 12 + start_date[1]
                end_month_index = end_date[0] * 12 + end_date[1]
                
                # Sanity bounds: 1980 to now + 1
                if 1980 * 12 <= start_month_index <= (current_year + 1) * 12:
                    if end_month_index >= start_month_index:
                        duration_months = max(1, end_month_index - start_month_index)
                        
                        # Extract probable role title from first lines before/after date
                        lines = [l.strip() for l in stripped_block.split('\n') if l.strip()]
                        role_title = lines[0] if lines else "Professional Role"
                        
                        # Check relevance
                        block_lower = stripped_block.lower()
                        is_relevant = False
                        relevance_reasons = []
                        
                        if clean_relevant_skills:
                            matched_skills = [s for s in clean_relevant_skills if re.search(r'\b' + re.escape(s) + r'\b', block_lower)]
                            if matched_skills:
                                is_relevant = True
                                relevance_reasons = matched_skills
                        else:
                            is_relevant = True

                        roles.append({
                            "title": role_title,
                            "start_date": f"{start_date[0]}-{start_date[1]:02d}",
                            "end_date": f"{end_date[0]}-{end_date[1]:02d}",
                            "duration_months": duration_months,
                            "is_relevant": is_relevant,
                            "relevance_reasons": relevance_reasons
                        })
                        
                        all_intervals.append((start_month_index, end_month_index))
                        if is_relevant:
                            relevant_intervals.append((start_month_index, end_month_index))

    def merge_intervals(intervals: List[Tuple[int, int]]) -> int:
        if not intervals:
            return 0
        sorted_intervals = sorted(intervals, key=lambda x: x[0])
        merged = [sorted_intervals[0]]
        for current in sorted_intervals[1:]:
            prev_start, prev_end = merged[-1]
            if current[0] <= prev_end:
                merged[-1] = (prev_start, max(prev_end, current[1]))
            else:
                merged.append(current)
        total_months = sum(end - start for start, end in merged)
        return total_months

    total_months = merge_intervals(all_intervals)
    relevant_months = merge_intervals(relevant_intervals)

    # Fallback to general regex if no structured date intervals were found
    if total_months == 0:
        # Check for month ranges first e.g. "8-10 months", "10 months"
        month_range_match = re.search(r'(\d+)\s*(?:-|to|–|—)\s*(\d+)\s*(?:months?|mos?)', experience_text, re.IGNORECASE)
        single_month_match = re.search(r'(\d+)\s*(?:months?|mos?)', experience_text, re.IGNORECASE)
        if month_range_match:
            total_months = int(month_range_match.group(2))
            relevant_months = total_months if clean_relevant_skills else int(total_months * 0.7)
        elif single_month_match:
            total_months = int(single_month_match.group(1))
            relevant_months = total_months if clean_relevant_skills else int(total_months * 0.7)
        else:
            exp_match = re.search(r'(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)', experience_text, re.IGNORECASE)
            if exp_match:
                years = float(exp_match.group(1))
                total_months = int(years * 12)
                relevant_months = total_months if clean_relevant_skills else int(total_months * 0.7)

    return {
        "total_experience_years": round(total_months / 12.0, 1),
        "relevant_experience_years": round(relevant_months / 12.0, 1),
        "roles": roles
    }
