import os
import re
import json
from typing import Dict, Any, List, Tuple, Optional
from rapidfuzz import fuzz
from app.models.schemas import AiMatchState, AiEvidenceSnippet, AiJdRequirement, RequirementStatus

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")
TAXONOMY_FILE = os.path.join(CONFIG_DIR, "taxonomy.json")

try:
    with open(TAXONOMY_FILE, "r", encoding="utf-8") as f:
        TAXONOMY = json.load(f)
except Exception:
    TAXONOMY = {"synonyms": {}, "non_equivalences": []}

SYNONYMS = TAXONOMY.get("synonyms", {})
NON_EQUIVALENCES = [set(pair) for pair in TAXONOMY.get("non_equivalences", [])]

# Common technology acronyms & canonical equivalences
ACRONYM_MAP = {
    "aws": "amazon web services",
    "amazon web services": "aws",
    "k8s": "kubernetes",
    "kubernetes": "k8s",
    "ci/cd": "continuous integration and continuous deployment",
    "continuous integration and continuous deployment": "ci/cd",
    "ci cd": "continuous integration continuous deployment",
    "continuous integration / continuous deployment": "ci/cd",
    "js": "javascript",
    "javascript": "js",
    "ts": "typescript",
    "typescript": "ts",
    "gcp": "google cloud platform",
    "google cloud platform": "gcp",
    "ml": "machine learning",
    "machine learning": "ml",
    "nlp": "natural language processing",
    "natural language processing": "nlp",
    "llm": "large language model",
    "large language models": "llm",
    "postgres": "postgresql",
    "postgresql": "postgres",
    "tf": "terraform",
    "terraform": "tf",
    "rag": "retrieval augmented generation",
    "retrieval augmented generation": "rag",
    "fe": "frontend",
    "frontend": "fe",
    "be": "backend",
    "backend": "be",
    "qa": "quality assurance",
    "quality assurance": "qa",
    "ui/ux": "user interface and user experience",
    "bi": "business intelligence",
    "business intelligence": "bi",
    "etl": "extract transform load",
    "extract transform load": "etl"
}

# Related but distinct technologies that must NEVER be credited as equivalent
STRICT_DISTINCTIONS = [
    ({"docker"}, {"kubernetes", "k8s"}),
    ({"react"}, {"javascript", "js", "typescript", "ts"}),
    ({"java"}, {"javascript", "js"}),
    ({"c"}, {"c++", "c#"}),
    ({"c++"}, {"c#"}),
    ({"sql"}, {"nosql", "mongodb"}),
    ({"aws"}, {"cloud", "cloud computing", "azure", "gcp"}),
    ({"azure"}, {"aws", "gcp"}),
    ({"python"}, {"fastapi", "django", "flask"}),
]

def are_strictly_distinct(req_term: str, cv_term: str) -> bool:
    """
    Checks whether req_term and cv_term represent distinct or hierarchical technologies
    where cv_term cannot be credited as an exact/equivalent match for req_term.
    """
    r = req_term.strip().lower()
    c = cv_term.strip().lower()
    if r == c:
        return False
    
    # Check taxonomy non-equivalences
    pair = {r, c}
    for forbidden in NON_EQUIVALENCES:
        if pair == forbidden:
            return True

    for set_a, set_b in STRICT_DISTINCTIONS:
        if (r in set_a and c in set_b) or (r in set_b and c in set_a):
            return True

    return False

def get_all_equivalent_terms(term: str) -> List[str]:
    """
    Returns term and all recognized canonical synonyms and acronym expansions.
    """
    clean = term.strip().lower()
    equivalents = {clean}

    # Check Acronym Map
    if clean in ACRONYM_MAP:
        equivalents.add(ACRONYM_MAP[clean])
    for short_form, long_form in ACRONYM_MAP.items():
        if clean == long_form:
            equivalents.add(short_form)

    # Check Taxonomy Synonyms
    for canon, aliases in SYNONYMS.items():
        group = [canon] + aliases
        if clean in group:
            for item in group:
                equivalents.add(item)

    return list(equivalents)

def extract_jd_requirements_ai(jd_text: str) -> List[AiJdRequirement]:
    """
    Extracts and infers structured requirements from freeform JD text.
    Only extracts requirements supported directly by the text; never hallucinates or adds
    technologies not present in the input.
    Inferred requirements are strictly marked is_mandatory=False.
    """
    if not jd_text or len(jd_text.strip()) < 10:
        return []

    lines = [line.strip() for line in jd_text.splitlines() if line.strip()]
    extracted: List[AiJdRequirement] = []
    seen_reqs = set()

    # Tech keywords for extraction
    tech_keywords = [
        "python", "java", "javascript", "typescript", "c++", "c#", "go", "golang", "rust",
        "aws", "azure", "gcp", "docker", "kubernetes", "k8s", "terraform", "ci/cd", "jenkins",
        "react", "angular", "vue", "next.js", "node.js", "fastapi", "django", "flask", "spring boot",
        "sql", "postgresql", "mysql", "mongodb", "redis", "kafka", "rag", "langgraph", "langchain",
        "devops", "machine learning", "deep learning", "nlp", "llm", "git", "linux"
    ]

    jd_lower = jd_text.lower()

        
def is_junk_jd_line(text_line: str) -> bool:
    if not text_line or not text_line.strip():
        return True

    line = re.sub(r"\s+", " ", text_line).strip().lower()

    junk_patterns = [
        # Recruitment and commercial information
        r"\b(?:fixed\s+ctc|freelance\s+recruiter|total\s+billing|billing\s+payables?|replacement\s+guarantee|placement\s+fee|recruiter\s+margin|commercials)\b",

        # Incentive-related commercial information
        r"\bincentive\s*[-:]\s*",

        # Standalone non-requirement headings only
        r"^\s*(?:what\s+you\s+get|what\s+we\s+offer|perks\s+and\s+benefits|why\s+join\s+us)\s*:?\s*$",
    ]

    return any(re.search(pattern, line) for pattern in junk_patterns)


    # 1. Look for explicit requirements in bullet points or short lines
    for line in lines:
        line_clean = line.strip("*-• \t")
        if not line_clean or len(line_clean) > 200 or is_junk_jd_line(line_clean):
            continue
        line_lower = line_clean.lower()

        # Check for mandatory markers in the line
        is_mand = bool(re.search(r'\b(?:mandatory|must have|required|essential|minimum|strictly required)\b', line_lower))

        # Check for years of experience requirement
        exp_match = re.search(r'(\d+[\d\s\-–+to]*\s*(?:years|yrs|year)\s+(?:of\s+)?(?:experience|exp)?(?:\s+in\s+([A-Za-z0-9_#+.\- ]{2,30}))?)', line_clean, re.IGNORECASE)
        if exp_match:
            exp_text = exp_match.group(1).strip()
            if exp_text.lower() not in seen_reqs:
                seen_reqs.add(exp_text.lower())
                extracted.append(AiJdRequirement(
                    id=f"req-ai-{len(extracted) + 1}",
                    requirement=exp_text,
                    category="Experience",
                    source_evidence=line_clean,
                    confidence="HIGH",
                    is_inferred=not is_mand,
                    is_mandatory=is_mand,
                    weight=2.0 if is_mand else 1.5
                ))

        # Check for technical skills
        for tech in tech_keywords:
            pattern = r'(?:^|[^a-zA-Z0-9_#+])' + re.escape(tech) + r'(?:$|[^a-zA-Z0-9_#+])'
            if re.search(pattern, line_lower):
                if tech not in seen_reqs:
                    seen_reqs.add(tech)
                    extracted.append(AiJdRequirement(
                        id=f"req-ai-{len(extracted) + 1}",
                        requirement=tech.upper() if len(tech) <= 4 else tech.title(),
                        category="Technical Skill",
                        source_evidence=line_clean,
                        confidence="HIGH",
                        is_inferred=not is_mand,
                        is_mandatory=is_mand,
                        weight=2.0 if is_mand else 1.0
                    ))

    # 2. Extract responsibilities from descriptive action sentences
    sentences = re.split(r'(?<=[.!?\n])\s+', jd_text)
    for sent in sentences:
        s_clean = sent.strip("*-• \t")
        if len(s_clean) < 25 or len(s_clean) > 250 or is_junk_jd_line(s_clean):
            continue
        s_lower = s_clean.lower()

        # Action verbs indicating responsibility
        if re.search(r'\b(?:manage|architect|design|build|maintain|implement|lead|deploy|optimize|collaborate|develop)\b', s_lower):
            if any(k in s_lower for k in tech_keywords) or "pipeline" in s_lower or "system" in s_lower or "infrastructure" in s_lower:
                short_summary = s_clean[:90] + ("..." if len(s_clean) > 90 else "")
                if short_summary.lower() not in seen_reqs and len(extracted) < 12:
                    seen_reqs.add(short_summary.lower())
                    extracted.append(AiJdRequirement(
                        id=f"req-ai-{len(extracted) + 1}",
                        requirement=s_clean,
                        category="Responsibility",
                        source_evidence=s_clean,
                        confidence="MEDIUM",
                        is_inferred=True,
                        is_mandatory=False,
                        weight=1.0
                    ))

    return extracted


def extract_company_name(jd_text: str) -> Optional[str]:
    """
    Extract company name from explicitly labelled JD metadata.
    Returns None when a reliable company name cannot be identified.
    """

    if not jd_text or not jd_text.strip():
        return None

    patterns = [
        r"^\s*(?:company(?:\s+name)?|employer|hiring\s+company|organization|organisation)\s*[:\-]\s*(?P<name>.+?)\s*$",

        r"^\s*about\s+(?:the\s+)?company\s*[:\-]\s*(?P<name>.+?)\s*$",
    ]

    for line in jd_text.splitlines()[:50]:
        line = re.sub(r"\s+", " ", line).strip()

        for pattern in patterns:
            match = re.search(pattern, line, re.IGNORECASE)

            if match:
                company = match.group("name").strip()

                # Remove additional metadata following the name
                company = re.split(
                    r"\s+[|]\s+|\s+[—–]\s+",
                    company,
                    maxsplit=1
                )[0]

                # Remove descriptive text after the company name
                company = re.split(
                    r"\s+(?:is hiring|is looking for|is seeking|is a|was founded)\b",
                    company,
                    maxsplit=1,
                    flags=re.IGNORECASE
                )[0]

                company = company.strip(" -–—:|,.;")

                if company and company.lower() not in {
                    "not provided", "unknown", "n/a", "none"
                }:
                    return company

    return None


def match_cv_requirement_ai(
    requirement: str,
    cv_text: str,
    cv_sections: Optional[Dict[str, str]] = None,
    category: str = "Technical Skill",
    negated_terms: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Evidence-based AI matching with 3 states: MATCH, NO_MATCH, UNCERTAIN.
    - Expands acronyms & synonyms (AWS ↔ Amazon Web Services, K8s ↔ Kubernetes).
    - Protects against false positives (Docker ≠ Kubernetes, React ≠ JavaScript).
    - Checks for NegEx explicit negations.
    - Returns structured evidence snippet from CV.
    """
    req_clean = requirement.strip()
    req_lower = req_clean.lower()
    sections = cv_sections or {}

    equivalent_terms = get_all_equivalent_terms(req_lower)

    # 0. Check NegEx explicit negations
    negated = [n.lower().strip() for n in (negated_terms or [])]
    for neg in negated:
        for term in equivalent_terms:
            if term == neg or re.search(r'(?:^|[^a-zA-Z0-9_#+])' + re.escape(term) + r'(?:$|[^a-zA-Z0-9_#+])', neg):
                evidence_obj = AiEvidenceSnippet(
                    requirement=req_clean,
                    cv_evidence=f"Candidate explicitly negated experience with '{neg}'.",
                    match_state=AiMatchState.NO_MATCH,
                    match_type="Negated (NegEx Match)",
                    confidence="HIGH"
                )
                return {
                    "status": RequirementStatus.NOT_MET,
                    "ai_match_state": AiMatchState.NO_MATCH,
                    "score": 0.0,
                    "evidence_snippet": evidence_obj,
                    "evidence_quote": f"Explicitly negated in candidate CV: '{neg}'",
                    "match_type": "Negated",
                    "confidence": "HIGH"
                }

    sentences = re.split(r'(?<=[.!?\n])\s+', cv_text)
    best_sentence = ""
    match_state = AiMatchState.NO_MATCH
    match_type = "None"
    confidence = "LOW"
    match_score = 0.0

    # A. Check exact or synonym/acronym match
    for sent in sentences:
        s_clean = sent.strip()
        if len(s_clean) < 10 or len(s_clean) > 400:
            continue
        s_lower = s_clean.lower()

        for term in equivalent_terms:
            pattern = r'(?:^|[^a-zA-Z0-9_#+])' + re.escape(term) + r'(?:$|[^a-zA-Z0-9_#+])'
            if re.search(pattern, s_lower):
                best_sentence = s_clean
                match_state = AiMatchState.MATCH
                match_type = "Exact" if term == req_lower else ("Acronym" if len(term) <= 4 or len(req_lower) <= 4 else "Synonym")
                confidence = "HIGH"
                match_score = 1.0
                break
        if match_state == AiMatchState.MATCH:
            break

    # B. If no direct match, check for semantic responsibility / natural language alignment
    if match_state == AiMatchState.NO_MATCH:
        # Generate acronym-expanded version of requirement (short -> long)
        expanded_req = req_lower
        for short_f, long_f in ACRONYM_MAP.items():
            if len(short_f) < len(long_f):
                pattern = r'(?:^|(?<=[^a-zA-Z0-9_#+]))' + re.escape(short_f) + r'(?:$|(?=[^a-zA-Z0-9_#+]))'
                expanded_req = re.sub(pattern, long_f, expanded_req)

        # Generate acronym-contracted version of requirement (long -> short)
        contracted_req = req_lower
        for long_f, short_f in ACRONYM_MAP.items():
            if len(long_f) > len(short_f):
                pattern = r'(?:^|(?<=[^a-zA-Z0-9_#+]))' + re.escape(long_f) + r'(?:$|(?=[^a-zA-Z0-9_#+]))'
                contracted_req = re.sub(pattern, short_f, contracted_req)

        # Strip meta-prefixes
        stripped_req = re.sub(r'^(?:relevant\s+background\s+in|proven\s+experience\s+in|hands-on\s+experience\s+with|experience\s+in|strong\s+knowledge\s+of|proficiency\s+in)\s+', '', req_lower).strip()

        best_ratio = 0.0
        for sent in sentences:
            s_clean = sent.strip()
            if len(s_clean) < 15 or len(s_clean) > 400:
                continue
            s_lower = s_clean.lower()

            r1 = fuzz.token_set_ratio(req_lower, s_lower) / 100.0
            r2 = fuzz.token_set_ratio(expanded_req, s_lower) / 100.0
            r3 = fuzz.token_set_ratio(contracted_req, s_lower) / 100.0
            r4 = fuzz.token_set_ratio(stripped_req, s_lower) / 100.0 if stripped_req else 0.0
            ratio = max(r1, r2, r3, r4)

            if ratio > best_ratio:
                best_ratio = ratio
                best_sentence = s_clean

        if best_ratio >= 0.72:
            match_state = AiMatchState.MATCH
            match_type = "Semantic" if best_ratio == r1 else ("Acronym / Semantic" if best_ratio in (r2, r3) else "Core Requirement")
            confidence = "HIGH" if best_ratio >= 0.85 else "MEDIUM"
            match_score = 1.0
        elif best_ratio >= 0.50:
            match_state = AiMatchState.UNCERTAIN
            match_type = "Semantic (Ambiguous)"
            confidence = "LOW"
            match_score = 0.4

    # C. Check for ambiguous generic evidence (e.g. "cloud" when "AWS" is required)
    if match_state == AiMatchState.NO_MATCH:
        generic_cloud_check = ("aws" in req_lower or "amazon web services" in req_lower) and ("cloud" in cv_text.lower() or "infrastructure" in cv_text.lower())
        if generic_cloud_check:
            match_state = AiMatchState.UNCERTAIN
            match_type = "Related / Generic Concept"
            confidence = "LOW"
            match_score = 0.3
            best_sentence = "Candidate documents general cloud infrastructure experience, but specific AWS tenure requires manual review."

    # D. Strict False-Positive Protection Guard
    if match_state == AiMatchState.MATCH:
        for sent in sentences:
            s_lower = sent.lower()
            if are_strictly_distinct(req_lower, "docker") and "docker" in s_lower and "kubernetes" not in s_lower and "k8s" not in s_lower:
                if req_lower in ("kubernetes", "k8s") and match_type == "Semantic":
                    match_state = AiMatchState.NO_MATCH
                    match_score = 0.0
                    match_type = "None (Strict Distinction: Docker ≠ Kubernetes)"

    evidence_obj = AiEvidenceSnippet(
        requirement=req_clean,
        cv_evidence=best_sentence or "No credible evidence found in candidate document.",
        match_state=match_state,
        match_type=match_type,
        confidence=confidence
    )

    return {
        "status": RequirementStatus.FULLY_MET if match_state == AiMatchState.MATCH else (RequirementStatus.PARTIALLY_MET if match_state == AiMatchState.UNCERTAIN else RequirementStatus.NOT_MET),
        "ai_match_state": match_state,
        "score": match_score,
        "evidence_snippet": evidence_obj,
        "evidence_quote": best_sentence or "No credible evidence found.",
        "match_type": match_type,
        "confidence": confidence
    }

def calculate_ai_semantic_adjustment(
    base_deterministic_score: float,
    mandatory_failed: bool,
    evaluations: List[Dict[str, Any]],
    max_adjustment_cap: float = 8.0
) -> Tuple[float, float, List[str]]:
    """
    Calculates bounded AI semantic score adjustment:
    Final Score = min(100.0, Base Score + Adjustment)
    Adjustment <= max_adjustment_cap (e.g. +8.0 pts max).
    If mandatory_failed is True, adjustment is STRICTLY 0.0.
    """
    if mandatory_failed:
        return 0.0, base_deterministic_score, ["Mandatory requirement failed. AI semantic adjustment locked to 0.0."]

    recovered_points = 0.0
    adjustment_reasons = []

    for ev in evaluations:
        is_mand = ev.get("is_mandatory", False) or ev.get("category") == "Mandatory"
        det_score = ev.get("deterministic_score", 0.0)
        ai_state = ev.get("ai_match_state")
        match_type = ev.get("match_type", "")

        if not is_mand and det_score < 0.9 and ai_state == AiMatchState.MATCH:
            if match_type in ("Acronym", "Synonym", "Semantic"):
                weight = ev.get("weight", 1.0)
                points = min(2.5, (1.0 - det_score) * 2.0 * weight)
                recovered_points += points
                adjustment_reasons.append(
                    f"Recovered {round(points, 1)} pts for '{ev.get('requirement')}' via {match_type} match."
                )

    bounded_adjustment = min(max_adjustment_cap, round(recovered_points, 1))
    final_score = min(100.0, round(base_deterministic_score + bounded_adjustment, 1))

    return bounded_adjustment, final_score, adjustment_reasons
