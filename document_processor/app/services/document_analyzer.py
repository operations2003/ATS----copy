import re
from typing import Dict, Any, List, Optional

# Comprehensive technical and professional skill catalog for instant matching
SKILL_CATALOG = [
    # Programming & Languages
    "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "C", "Go", "Golang", "Rust", "PHP", "Ruby", "Swift", "Kotlin", "Scala", "R", "Dart", "SQL", "HTML5", "HTML", "CSS3", "CSS", "Sass", "SCSS",
    # Frameworks & Libraries
    "React", "React.js", "React Native", "Next.js", "Vue.js", "Vue", "Angular", "AngularJS", "Node.js", "Node", "Express.js", "Express", "FastAPI", "Django", "Flask", "Spring Boot", "Spring", ".NET", "ASP.NET", "Tailwind CSS", "Tailwind", "Bootstrap", "Redux", "GraphQL", "REST APIs", "REST API", "Microservices",
    # Cloud, DevOps & Containers
    "AWS", "Amazon Web Services", "Azure", "Google Cloud", "GCP", "Docker", "Kubernetes", "K8s", "Terraform", "CI/CD", "GitHub Actions", "GitLab CI", "Jenkins", "Ansible", "Linux", "Unix", "Bash", "Shell",
    # Databases & Storage
    "PostgreSQL", "Postgres", "MySQL", "MongoDB", "Redis", "SQLite", "Supabase", "Firebase", "DynamoDB", "Elasticsearch", "Prisma", "Prisma ORM", "TypeORM", "Mongoose", "Cassandra", "Oracle",
    # AI / ML & Data
    "Machine Learning", "Deep Learning", "NLP", "PyTorch", "TensorFlow", "Pandas", "NumPy", "Scikit-Learn", "OpenCV", "LLM", "Generative AI", "LangChain",
    # SAP & Enterprise ERP
    "SAP PP", "SAP QM", "SAP MM", "SAP SD", "SAP FICO", "SAP FI", "SAP CO", "SAP PM", "SAP WM", "SAP EWM", "SAP S/4HANA", "SAP HANA", "SAP ABAP", "SAP BASIS", "SAP ERP", "SAP ECC", "SAP", "S/4HANA", "ERP", "NetSuite",
    # Manufacturing, Quality & Operations
    "MRP", "Material Requirements Planning", "Quality Management", "Production Planning", "Shop Floor Control", "Master Data", "Quality Notifications", "Quality Inspection", "Defects Recording", "Inspection Plans", "BOM", "Bill of Materials", "Routing", "Work Center", "Batch Management", "Quality Control", "Quality Assurance", "Six Sigma", "Lean Manufacturing", "ISO 9001", "GMP", "LIMS", "Supply Chain", "Procurement",
    # CRM, Sales & Marketing
    "Salesforce", "HubSpot", "Zoho CRM", "CRM", "B2B Sales", "B2B", "Lead Generation", "Cold Calling", "Outbound Sales", "Inbound Sales", "Pipeline Management", "Account Management", "Negotiation", "Deal Closing", "Prospecting", "MQL", "Digital Marketing", "SEO", "SEM",
    # Methodologies & Tools
    "Git", "GitHub", "GitLab", "Jira", "Postman", "Figma", "Agile", "Scrum", "TDD", "Unit Testing", "Jest", "Cypress", "Selenium", "Webpack", "Vite"
]

def extract_email(text: str) -> Optional[str]:
    match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b', text)
    return match.group(0) if match else None

def extract_phone(text: str) -> Optional[str]:
    # Match patterns like +91 98234 56789, (555) 123-4567, +1-800-555-0199, 9876543210
    match = re.search(r'(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}\b', text)
    if match:
        raw_phone = match.group(0).strip()
        digits = re.sub(r'\D', '', raw_phone)
        if 8 <= len(digits) <= 15:
            return raw_phone
    return None

def extract_candidate_name(text: str, filename: str = "") -> str:
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    # 1. Inspect top 8 lines for a clean 2-4 word capitalized name
    for line in lines[:8]:
        no_contacts = re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}', '', line)
        no_contacts = re.sub(r'(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}', '', no_contacts)
        no_contacts = re.sub(r'https?://\S+|www\.\S+', '', no_contacts)
        no_contacts = re.sub(r'^(?:name|full\s*name|candidate\s*name)\s*[:\-–]\s*', '', no_contacts, flags=re.I).strip()
        
        segments = re.split(r'[|•·–—\-,]', no_contacts)
        for seg in segments:
            seg_clean = re.sub(r'[^\w\s]', '', seg).strip()
            words = seg_clean.split()
            if 2 <= len(words) <= 4:
                lower_seg = seg_clean.lower()
                invalid_words = ['resume', 'curriculum', 'vitae', 'email', 'phone', 'page', 'http', 'developer', 'engineer', 'architect', 'profile', 'summary', 'experience', 'skills', 'education', 'contact', 'address', 'declaration', 'career']
                if not any(k in lower_seg for k in invalid_words):
                    if all(w[0].isupper() for w in words if w and w.isalpha()):
                        return " ".join(words)
    
    # 2. Heuristic fallback: Extract from filename (e.g. CV_Rahul_Sharma.pdf -> Rahul Sharma)
    if filename:
        clean_fn = re.sub(r'\.(pdf|docx|doc|txt)$', '', filename, flags=re.IGNORECASE)
        clean_fn = re.sub(r'^(?:CV|Resume|Profile)[_\-\s]*', '', clean_fn, flags=re.IGNORECASE)
        clean_fn = re.sub(r'[_\-]+', ' ', clean_fn).strip()
        words = [w.capitalize() for w in clean_fn.split() if w.isalpha() and len(w) > 1]
        if 1 <= len(words) <= 4:
            return " ".join(words)

    return "Candidate"

def extract_skills(text: str) -> List[str]:
    matched_skills = set()
    
    # 1. Match from comprehensive catalog
    for skill in SKILL_CATALOG:
        pattern = r'(?:^|[^a-zA-Z0-9_#+])' + re.escape(skill) + r'(?:$|[^a-zA-Z0-9_#+])'
        if re.search(pattern, text, re.IGNORECASE):
            matched_skills.add(skill)

    # 2. Dynamic extraction from Skills & Competencies sections
    sec_match = re.search(
        r'(?:core\s+competencies(?:\s*(?:&|and)\s*skills)?|technical\s+skills|key\s+skills|skills\s*(?:&|and)?\s*abilities|areas\s+of\s+expertise)[\s\S]*?(?=(?:\n[A-Z\s]{4,30}(?:\n|:)|$))',
        text,
        re.IGNORECASE
    )
    if sec_match:
        sec_lines = sec_match.group(0).split('\n')[1:]
        for line in sec_lines:
            cleaned = re.sub(r'^[A-Za-z0-9\s&/]+:\s*', '', line)
            cleaned = re.sub(r'^[•*\-–—▪▫➢✓✔\d\.\)]\s*', '', cleaned).strip()
            if not cleaned:
                continue
            tokens = re.split(r'[,|•*·;]\s*', cleaned)
            for tok in tokens:
                clean_tok = re.sub(r'\s*\([^)]*\)', '', tok).strip()
                if 2 <= len(clean_tok) <= 40 and not re.match(r'^(?:skills|experience|summary|expertise|competencies|professional)$', clean_tok, re.I):
                    matched_skills.add(clean_tok)

    return sorted(list(matched_skills))

def extract_years_of_experience(text: str) -> Optional[str]:
    # 1. Explicit Total/Overall Experience labels (e.g., "Total Experience: 5.5 Years", "Overall Experience: 5+ Yrs")
    explicit_pattern = r'(?:total|overall|relevant|cumulative|career|professional|work)\s+experience\s*[:\s-]+\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?|y)?(?:\s*(?:and\s*)?(\d+)\s*(?:months?|mos?|m)?)?'
    explicit_match = re.search(explicit_pattern, text, re.IGNORECASE)
    if explicit_match:
        yrs = float(explicit_match.group(1))
        mos = int(explicit_match.group(2)) if explicit_match.group(2) else 0
        total = yrs + (mos / 12.0)
        if 0.5 <= total <= 50:
            return f"{round(total, 1)} years"

    # 2. Inline career summary mentions (e.g. "Over 5 years of experience", "having 5+ years of IT experience")
    summary_pattern = r'(?:over|more\s+than|about|around|approx(?:\.|imately)?|with|having)?\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)(?:\s*(?:and\s*)?(\d+)\s*(?:months?|mos?))?\s+(?:of\s+)?(?:[a-zA-Z\s\/\-\+]{0,40})?experience'
    summary_matches = re.findall(summary_pattern, text, re.IGNORECASE)
    if summary_matches:
        max_exp = 0.0
        for m in summary_matches:
            y = float(m[0])
            mo = int(m[1]) if len(m) > 1 and m[1] else 0
            val = y + (mo / 12.0)
            if 0.5 <= val <= 50 and val > max_exp:
                max_exp = val
        if max_exp > 0:
            return f"{round(max_exp, 1)} years"

    # 3. Work history date range span in experience section
    date_ranges = re.findall(r'\b(20\d\d|19\d\d)\s*(?:[–—\-\~]|to)\s*(20\d\d|19\d\d|Present|Current|Now)\b', text, re.IGNORECASE)
    if date_ranges:
        intervals = []
        now_year = 2026
        for start_str, end_str in date_ranges:
            s_yr = int(start_str)
            e_yr = now_year if re.match(r'^(?:present|current|now)$', end_str, re.I) else int(end_str)
            if 1985 <= s_yr <= now_year and s_yr <= e_yr <= now_year + 1:
                intervals.append((s_yr, e_yr))
        if intervals:
            intervals.sort(key=lambda x: x[0])
            merged = [intervals[0]]
            for current in intervals[1:]:
                prev_start, prev_end = merged[-1]
                if current[0] <= prev_end:
                    merged[-1] = (prev_start, max(prev_end, current[1]))
                else:
                    merged.append(current)
            total_span = sum(end - start for start, end in merged)
            if 0 < total_span <= 45:
                return f"{total_span} years"

    return None

def extract_education(text: str) -> List[Dict[str, Any]]:
    edu_list = []
    degree_patterns = [
        (r'\b(?:B\.?E\.?|Bachelor of Engineering)\b', 'Bachelor of Engineering (B.E.)'),
        (r'\b(?:B\.?Tech\.?|Bachelor of Technology)\b', 'Bachelor of Technology (B.Tech)'),
        (r'\b(?:M\.?Tech\.?|Master of Technology)\b', 'Master of Technology (M.Tech)'),
        (r'\b(?:M\.?S\.?|Master of Science)\b', 'Master of Science (M.S.)'),
        (r'\b(?:B\.?S\.?|Bachelor of Science|B\.?Sc\.?)\b', 'Bachelor of Science (B.S.)'),
        (r'\b(?:M\.?C\.?A\.?|Master of Computer Applications)\b', 'Master of Computer Applications (MCA)'),
        (r'\b(?:B\.?C\.?A\.?|Bachelor of Computer Applications)\b', 'Bachelor of Computer Applications (BCA)'),
        (r'\b(?:Ph\.?D\.?|Doctor of Philosophy)\b', 'Ph.D.'),
        (r'\b(?:MBA|Master of Business Administration)\b', 'Master of Business Administration (MBA)'),
    ]

    for pattern, title in degree_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            # Try finding year near degree
            year_match = re.search(pattern + r'.*?\b(20\d\d|19\d\d)\b', text, re.IGNORECASE | re.DOTALL)
            year = year_match.group(1) if year_match else None
            edu_list.append({
                "degree": title,
                "institution": "University / Institute",
                "year": year
            })
    return edu_list

def extract_past_companies(text: str) -> List[str]:
    companies = []
    # Match lines like "Software Engineer at TechNova" or "Developer — Google" or "Company: Microsoft"
    patterns = [
        r'(?:at|@)\s+([A-Z][A-Za-z0-9\s&.,]{2,35})(?:\s+from|\s+\(|\n|\.|\,)',
        r'(?:Company|Employer)\s*:\s*([A-Z][A-Za-z0-9\s&.,]{2,35})',
        r'([A-Z][A-Za-z0-9\s&.,]{2,30})\s*(?:—|–|-)\s*(?:Present|\d{4})'
    ]

    for p in patterns:
        for m in re.finditer(p, text):
            comp = m.group(1).strip()
            # Filter non-company noise
            if comp and len(comp) > 2 and comp.lower() not in ['present', 'developer', 'engineer', 'experience', 'education', 'project']:
                if comp not in companies:
                    companies.append(comp)
    return companies[:5]

def extract_summary(text: str) -> str:
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    # Try finding Summary or Profile section
    summary_idx = -1
    for i, line in enumerate(lines[:15]):
        if re.match(r'^(?:summary|professional summary|profile|about me|objective)\b', line, re.IGNORECASE):
            summary_idx = i
            break
            
    if summary_idx != -1 and summary_idx + 1 < len(lines):
        collected = []
        for l in lines[summary_idx + 1: summary_idx + 6]:
            if re.match(r'^(?:experience|skills|education|projects|work history)\b', l, re.IGNORECASE):
                break
            collected.append(l)
        if collected:
            return " ".join(collected)

    # Fallback to first few informative lines
    meaningful = [l for l in lines[:8] if len(l.split()) >= 4 and not re.search(r'[@\+]', l)]
    return " ".join(meaningful[:2]) if meaningful else (lines[0] if lines else "")

def analyze_document_quality(text: str, page_count: int = 1, filename: str = "") -> Dict[str, Any]:
    """
    Validates whether extracted text is legible and CV-like, and extracts structured entities.
    """
    cleaned = (text or "").strip()
    words = [w for w in cleaned.split() if w]
    lines = [l.strip() for l in cleaned.split('\n') if l.strip()]

    char_count = len(cleaned)
    word_count = len(words)
    line_count = len(lines)

    # Detect obvious HTML or web markup indicators
    html_pattern = re.compile(r'(?:<!doctype\s+html|<html|<body|<div|<head|<script|<style)', re.IGNORECASE)
    is_html = bool(html_pattern.search(text or ""))

    # Detect source code indicators
    code_pattern = re.compile(r'(?:import\s+React|from\s+[\'"]react|export\s+default\s+function|const\s+\w+\s*=\s*\(\)\s*=>)', re.IGNORECASE)
    is_source_code = bool(code_pattern.search(text or ""))

    # Check for CV-like keywords/sections
    cv_keywords = re.compile(
        r'\b(?:experience|education|skills|summary|profile|projects|certifications|employment|work history|contact|languages|technologies|objective|qualification)\b',
        re.IGNORECASE
    )
    has_cv_sections = bool(cv_keywords.search(cleaned))

    if is_html or is_source_code:
        quality = "FAILED"
    elif char_count < 25 or word_count < 6:
        quality = "FAILED"
    elif char_count < 60 or word_count < 12:
        quality = "INSUFFICIENT"
    elif not has_cv_sections and (char_count < 100 or word_count < 20):
        quality = "INSUFFICIENT"
    else:
        quality = "GOOD"

    # Extract structured JSON entities
    candidate_name = extract_candidate_name(cleaned, filename)
    email = extract_email(cleaned)
    phone = extract_phone(cleaned)
    skills = extract_skills(cleaned)
    experience_yrs = extract_years_of_experience(cleaned)
    education = extract_education(cleaned)
    past_companies = extract_past_companies(cleaned)
    summary_text = extract_summary(cleaned)

    return {
        "textQuality": quality,
        "characterCount": char_count,
        "wordCount": word_count,
        "lineCount": line_count,
        "pageCount": page_count,
        "hasCvSections": has_cv_sections,
        "isHtml": is_html,
        "isSourceCode": is_source_code,
        # Structured Fields
        "candidateName": candidate_name,
        "email": email,
        "phone": phone,
        "skills": skills,
        "yearsOfExperience": experience_yrs,
        "education": education,
        "pastCompanies": past_companies,
        "summary": summary_text,
        "rawTextSummary": summary_text or (cleaned[:300] + "..." if len(cleaned) > 300 else cleaned)
    }

