# ── health/parsers.py ─────────────────────────────────────────────────
# PDF parsing chain for Bulgarian lab results (Ramus, LINA, generic).
# Tuned against real PDFs from:
#   - СМДЛ РАМУС ООД (results.ramuslab.com) — printed web page format
#   - МДЛ ЛИНА ЕООД (lina-bg.com) — iLab system format
#
# §NAV: models → serializers → views → urls → [parsers] → services → recommendations
# §CHAIN: extract_text → detect_lab → lab-specific line parser → return structured results
#
# §FORMAT_RAMUS:
#   Columns: Име на теста(изследване) | [H/L flag] | Резултат | Единици | Референтна стойност | Метод
#   Test names: "Левкоцити/WBC", "Хемоглобин/HGB", "АЛАТ(ГПТ)/ALAT(GPT)"
#   Sections: "Хематология", "Биохимия", "Хормони", "Урина"
#   Flags: "H" (high) or "L" (low) before numeric value
#
# §FORMAT_LINA:
#   Columns: Име на теста (изследването) | Флаг | Резултат | Единици | Референтни стойности
#   Test names: "Глюкоза серумна (Glu S)", "HGB ( Хемоглобин )", "Креатинин ( CREAT )"
#   Sections: "Кръвна захар и пикочна киселина Профил * *"
#   Flags: "↑" (high) or "↓" (low) arrows in Флаг column

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ── Lab detection ────────────────────────────────────────────────────

LAB_SIGNATURES = {
    'ramus': ['РАМУС', 'Ramus', 'ramuslab.com', 'СМДЛ РАМУС'],
    'lina': ['ЛИНА', 'LINA', 'lina-bg.com', 'МДЛ ЛИНА', 'iLab'],
    'acibadem': ['АДЖИБАДЕМ', 'Acibadem', 'ACIBADEM'],
    'cibalab': ['ЦИБАЛАБ', 'Cibalab', 'CIBALAB'],
}


def detect_lab(text: str) -> str:
    """§DETECT: Identify lab from PDF text. Returns lab_type key or 'other'."""
    for lab_key, signatures in LAB_SIGNATURES.items():
        for sig in signatures:
            if sig in text:
                return lab_key
    return 'other'


# ── Text extraction ──────────────────────────────────────────────────

def extract_text_from_pdf(file_path: str) -> str:
    """§EXTRACT: Get all text from PDF using pdfplumber (best for structured tables)."""
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return '\n'.join(text_parts)
    except ImportError:
        logger.warning("pdfplumber not installed, trying PyPDF2 fallback")
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(file_path)
            return '\n'.join(page.extract_text() or '' for page in reader.pages)
        except Exception as e:
            logger.error(f"PyPDF2 fallback also failed: {e}")
            return ''
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        return ''


# ── Value parsing helpers ────────────────────────────────────────────

def parse_number(text: str) -> Optional[float]:
    """
    §PARSE: Extract numeric value from text.
    Handles: "8.64", "143", "0.38", "549.62", "2.874", "<0.22"
    Skips qualitative results: "(-)negative", "Отрицателен", "Опалесценция"
    """
    if not text:
        return None
    text = text.strip()

    # §SKIP: Qualitative results — not numeric
    skip_patterns = [
        'negative', 'отрицателен', 'неувеличен', 'normal', 'опалесценция',
        'профил', 'манипулация', '***', 'служебна', 'none',
    ]
    text_lower = text.lower()
    if any(s in text_lower for s in skip_patterns):
        return None

    # Handle "<0.22" as 0.22 (keep the value, note it's below detection)
    text = text.replace('<', '').replace('>', '').replace(',', '.').strip()

    # Extract first valid number
    match = re.search(r'(\d+\.?\d*)', text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def parse_ref_range(text: str) -> str:
    """§PARSE: Extract reference range string. Returns original text cleaned up."""
    if not text:
        return ''
    text = text.strip().replace(',', '.')
    # Try to find "min - max" pattern
    match = re.search(r'(\d+\.?\d*)\s*[-–—]\s*(\d+\.?\d*)', text)
    if match:
        return f"{match.group(1)} - {match.group(2)}"
    # Handle "< 25" or "< 44" single-bound ranges
    match = re.search(r'<\s*(\d+\.?\d*)', text)
    if match:
        return f"< {match.group(1)}"
    return text[:60]  # Truncate complex ranges


# ── Lines to skip ────────────────────────────────────────────────────

# §SKIP: Section headers, metadata, qualitative-only rows, urine analysis
SKIP_PATTERNS = [
    # Section headers
    r'^Хематология$', r'^Биохимия$', r'^Хормони$', r'^Урина$',
    r'^Урина - седимент$', r'^Урина седимент$',
    r'Профил \*', r'^Манипулации',
    r'^Пълна кръвна картина', r'^ПКК /', r'^Пълно изследване',
    r'^Кръвна захар', r'^Холестеролов профил',
    r'^Креатинин.урея.пикочна', r'^Общ и директен', r'^Общ белтък и албумин',
    r'^АСАТ\(ГОТ\).АЛАТ\(ГПТ\).ГГТ',
    r'^Урина ОХИ', r'^Urine analysis',
    r'^Туморни маркери',
    # Metadata lines
    r'^Име на теста', r'^Забележка', r'^Внимание', r'^Справка',
    r'^Лабораторна Информационна', r'^Визита ID', r'^Край на справката',
    r'^H - резултатът', r'^L - резултатът',
    r'^Принтирай', r'^https://', r'^Проверка на резултати',
    r'^Лекуващ лекар', r'^Филиал', r'^Лабораторен лекар',
    r'^Платено:', r'^УНП:', r'^УИН:',
    r'Страница \d+ от \d+',
    # Qualitative-only results (urine dipstick etc.)
    r'Белтък\s+(урина|urine)', r'Глюкоза\s+(урина|urine|Glucose urine)',
    r'Кетони/Ketones', r'Кетотела',
    r'Билирубин\s+(урина|urine|Billirubin)',
    r'Кръв\s+(урина|urine|Blood urine)', r'^Кръв\b',
    r'Левкоцити\s+(урина|urine|Leucocytes urine)',
    r'Нитрити/Nitrites', r'Уробилиноген',
    r'Еритроцити/Erythrocytes', r'Левкоцити/Leucocytes',  # sediment
    r'Плоски епителни', r'Неплоски епителни', r'Non-squamous',
    r'Хиалинни цилиндри', r'Гранулирани цилиндри',
    r'Кристали', r'Бактерии/Bacteria', r'Дрожди/Yeasts',
    r'Относително тегло', r'Отн.тегло', r'Specific gravity',
    r'pH \( урина \)', r'pH урина',
    r'Белтък\s+Опалесценция',
    # Skip Венепункция / manipulations
    r'Венепункция', r'Секрет.*епруветка',
]
SKIP_RE = [re.compile(p, re.IGNORECASE) for p in SKIP_PATTERNS]


def should_skip_line(name: str) -> bool:
    """§SKIP: Return True if this line is a header/metadata/qualitative, not a blood result."""
    name = name.strip()
    if len(name) < 2:
        return True
    for pattern in SKIP_RE:
        if pattern.search(name):
            return True
    return False


# ── Ramus parser ─────────────────────────────────────────────────────
# §RAMUS: Text lines from results.ramuslab.com printed pages.
#
# Format examples (from real PDFs):
#   "Левкоцити/WBC 9.9 G/L 3.5 - 10.5"
#   "Хемоглобин/HGB 158 g/L 130 - 180"
#   "Моноцити-%/MONO % H 14.7 % 4.4 - 12.7"
#   "Пикочна киселина/Uric acid H 549.62 umol/l 220 - 450"
#   "Глюкоза/Glucose H 6.65 mmol/l 3.3-6.0"
#   "TSH 2.874 uIU/ml 0.350 - 4.940"
#   "СУЕ/ERS 12 mm/h < 25"
#   "HDL-холестерол/HDL-cholesterol L 0.78 mmol/l 1.04-1.56 , препоръчани стойности >1.2"
#
# Pattern: <name> [H|L] <number> <unit> <ref_range...>
# The H/L flag is optional and sits between name and value.

RAMUS_LINE = re.compile(
    r'^'
    r'(.+?)'                          # (1) Test name (non-greedy)
    r'\s+'
    r'(?:(H|L)\s+)?'                  # (2) Optional H/L flag
    r'(\d+\.?\d*)'                    # (3) Numeric value
    r'\s+'
    r'([a-zA-Zμµ/]+(?:\.[a-zA-Z]*)?)'  # (4) Unit (G/L, mmol/l, umol/l, uIU/ml, mm/h, etc.)
    r'\s+'
    r'(.+)?'                          # (5) Reference range (rest of line)
    r'$'
)


def parse_ramus(text: str) -> list[dict]:
    """
    §RAMUS: Parse Ramus lab text line by line.
    Extracts: test name (with /English part), value, unit, ref range.
    The test name often has format "Bulgarian/English" — we keep both for matching.
    """
    results = []

    for line in text.split('\n'):
        line = line.strip()
        if not line or should_skip_line(line):
            continue

        # Handle comma-decimal numbers in the line before regex
        # Bulgarian PDFs sometimes use comma: "0,6-7,3" in ref ranges
        # But we need to preserve commas in ref range, only clean the value

        match = RAMUS_LINE.match(line)
        if not match:
            continue

        name = match.group(1).strip()
        # flag = match.group(2)  # H or L — we recompute flags ourselves
        value_text = match.group(3)
        unit = match.group(4).strip()
        ref_text = (match.group(5) or '').strip()

        if should_skip_line(name):
            continue

        value = parse_number(value_text)
        if value is None:
            continue

        # §EXTRACT_NAME: From "Левкоцити/WBC" or "АЛАТ(ГПТ)/ALAT(GPT)" extract the abbreviation
        # We pass both the full name and try to extract the English/abbr part
        name_for_match = _extract_ramus_name(name)

        results.append({
            'name': name_for_match,
            'name_original': name,
            'value': value,
            'unit': unit,
            'ref_range': parse_ref_range(ref_text),
        })

    return results


def _extract_ramus_name(raw_name: str) -> str:
    """
    §NAME: Extract best name for biomarker matching from Ramus format.
    Input: "Левкоцити/ WBC" → "WBC"
    Input: "Хемоглобин/ HGB" → "HGB"
    Input: "АЛАТ(ГПТ)/ALAT(GPT)" → "ALT"
    Input: "Общ холестерол/T Cholеsterol" → "CHOL"
    Input: "TSH" → "TSH"
    Input: "СУЕ/ERS" → "ESR"
    Input: "Желязо/Iron" → "Iron"
    """
    raw = raw_name.strip()

    # If it has / separator, prefer the English part (after /)
    if '/' in raw:
        parts = raw.split('/')
        # Take the last meaningful part
        english_part = parts[-1].strip()
        # Clean up parenthetical: "ALAT(GPT)" → "ALAT"
        english_clean = re.sub(r'\(.*?\)', '', english_part).strip()
        if english_clean:
            return english_clean

    # If it has parenthetical abbreviation: "Ср. обем на еритроцитите/MCV"
    paren = re.search(r'\(([A-Z]+)\)', raw)
    if paren:
        return paren.group(1)

    return raw


# ── LINA parser ──────────────────────────────────────────────────────
# §LINA: Text lines from lina-bg.com iLab system.
#
# Format examples (from real PDF):
#   "Глюкоза серумна (Glu S) ↑ 8.64 mmol/L 2.78 - 6.11"
#   "Пикочна киселина UA 481.00 µmol/L 214.00 - 488.00"
#   "HGB ( Хемоглобин ) 143 g/L 135 - 180"
#   "RBC ( Еритроцити ) 4.80 T/L 4.40 - 5.90"
#   "HCT ( Хематокрит ) ↓ 0.38 L/L 0.40 - 0.53"
#   "Холестерол ( CHOL ) 5.38 mmol/L Препоръчителни нива <5.17; ..."
#   "HDL-Холестерол 0.84 mmol/L Над 1.45"
#   "LDL Холестерол 3.72 mmol/L Оптимално< 3.34; ..."
#   "АСАТ 32.80 U/L 5.00 - 42.00"
#   "АЛАТ ↑ 49.70 U/L 5.00 - 41.00"
#   "Калций ( Ca) 2.43 mmol/L 2.15 - 2.50"
#   "CEA <0.22 ng/mL непушачи <3.8 , пушачи < 5.5"
#   "total PSA 0.73 ng/mL До 4.00"
#
# Pattern: <name> [↑|↓] <number> <unit> <ref...>
# Arrow flags are optional and sit between name and value.

LINA_LINE = re.compile(
    r'^'
    r'(.+?)'                              # (1) Test name
    r'\s+'
    r'(?:[↑↓]\s+)?'                       # Optional arrow flag
    r'(<?\d+\.?\d*)'                      # (2) Value (possibly with < prefix)
    r'\s+'
    r'([a-zA-Zμµ×⁹¹²/%.]+(?:/[a-zA-Zμµ]+)?)'  # (3) Unit
    r'(?:\s+(.+))?'                       # (4) Optional reference range
    r'$'
)


def parse_lina(text: str) -> list[dict]:
    """
    §LINA: Parse LINA lab text line by line.
    Test names have abbreviation in parentheses: "HGB ( Хемоглобин )"
    or "Глюкоза серумна (Glu S)".
    """
    results = []

    for line in text.split('\n'):
        line = line.strip()
        if not line or should_skip_line(line):
            continue

        match = LINA_LINE.match(line)
        if not match:
            continue

        name = match.group(1).strip()
        value_text = match.group(2)
        unit = match.group(3).strip()
        ref_text = (match.group(4) or '').strip()

        if should_skip_line(name):
            continue

        value = parse_number(value_text)
        if value is None:
            continue

        name_for_match = _extract_lina_name(name)

        results.append({
            'name': name_for_match,
            'name_original': name,
            'value': value,
            'unit': unit,
            'ref_range': parse_ref_range(ref_text),
        })

    return results


def _extract_lina_name(raw_name: str) -> str:
    """
    §NAME: Extract best name for biomarker matching from LINA format.
    Input: "HGB ( Хемоглобин )" → "HGB"
    Input: "Глюкоза серумна (Glu S)" → "Glu S"  (→ matches alias "Glu")
    Input: "Пикочна киселина UA" → "UA"
    Input: "Креатинин ( CREAT )" → "CREAT"
    Input: "Холестерол ( CHOL )" → "CHOL"
    Input: "HDL-Холестерол" → "HDL"
    Input: "АСАТ" → "АСАТ"
    Input: "АЛАТ" → "АЛАТ"
    Input: "Калций ( Ca)" → "Ca"
    Input: "total PSA" → "total PSA"
    """
    raw = raw_name.strip()

    # Pattern 1: "HGB ( Хемоглобин )" → extract leading abbreviation
    match = re.match(r'^([A-Z]{2,}[%]?)\s*\(', raw)
    if match:
        return match.group(1)

    # Pattern 2: "Something ( ABBR )" → extract abbreviation from parentheses
    match = re.search(r'\(\s*([A-Za-z][A-Za-z0-9 ]*?)\s*\)', raw)
    if match:
        abbr = match.group(1).strip()
        if abbr:
            return abbr

    # Pattern 3: "Something UA" or "Something CREAT" — trailing abbreviation
    match = re.match(r'^.+\s+([A-Z]{2,}[0-9]*)$', raw)
    if match:
        return match.group(1)

    # Pattern 4: "HDL-Холестерол" → "HDL"
    match = re.match(r'^(HDL|LDL|VLDL)', raw, re.IGNORECASE)
    if match:
        return match.group(1).upper()

    # Pattern 5: "АСАТ", "АЛАТ", "ГГТ" — direct Bulgarian abbreviations
    return raw


# ── Abbreviation normalization ───────────────────────────────────────
# §NORM: Map common extracted abbreviations to our canonical abbreviation system.
# This handles the gap between what the parser extracts and what our biomarker aliases expect.

ABBR_NORMALIZE = {
    # Ramus extracts
    'WBC': 'WBC', 'HGB': 'HGB', 'RBC': 'RBC', 'HCT': 'HCT', 'PLT': 'PLT',
    'MCV': 'MCV', 'MCH': 'MCH', 'MCHC': 'MCHC', 'RDW': 'RDW', 'MPV': 'MPV',
    'Glucose': 'GLU', 'Creatinine': 'CREA', 'Uric acid': 'URIC', 'Urea': 'UREA',
    'T Cholеsterol': 'CHOL', 'T Cholesterol': 'CHOL',
    'Triglycerides': 'TG', 'HDL-cholesterol': 'HDL', 'LDL-cholesterol': 'LDL',
    'VLDL-cholesterol': 'VLDL',
    'Bilirubin total': 'TBIL', 'Bilirubin direct': 'DBIL',
    'Protein total': 'TP', 'Albumin': 'ALB',
    'ASAT(GOT)': 'AST', 'ASAT': 'AST', 'GOT': 'AST',
    'ALAT(GPT)': 'ALT', 'ALAT': 'ALT', 'GPT': 'ALT',
    'Alkaline phosphatase': 'ALP', 'ALP': 'ALP',
    'GGT': 'GGT',
    'Potassium': 'K', 'Sodium': 'NA', 'Calcium': 'CA',
    'Iron': 'FE', 'Inorganic phosphorus': 'P',
    'TSH': 'TSH', 'ERS': 'ESR',
    # LINA extracts
    'Glu S': 'GLU', 'Glu': 'GLU', 'GLU': 'GLU',
    'UA': 'URIC',
    'CREAT': 'CREA',
    'CHOL': 'CHOL',
    'HDL': 'HDL', 'LDL': 'LDL', 'VLDL': 'VLDL',
    'TRG': 'TG',
    'BUN': 'UREA',
    'Ca': 'CA',
    'P': 'P',
    'TP': 'TP', 'ALB': 'ALB',
    # Bulgarian names that might come through
    'АСАТ': 'AST', 'АЛАТ': 'ALT', 'ГГТ': 'GGT',
    'АФ': 'ALP',
    # Tumor markers (not in our system yet, but extract for future)
    'CEA': 'CEA', 'total PSA': 'PSA', 'free PSA': 'FPSA',
    'CA -19 -9': 'CA199',
}


def normalize_name(extracted_name: str) -> str:
    """
    §NORM: Normalize extracted name to canonical abbreviation.
    First tries exact match, then partial/cleaned match.
    Returns the best abbreviation for biomarker matching.
    """
    name = extracted_name.strip()

    # Exact match
    if name in ABBR_NORMALIZE:
        return ABBR_NORMALIZE[name]

    # Case-insensitive match
    for key, val in ABBR_NORMALIZE.items():
        if key.lower() == name.lower():
            return val

    # Partial: if name contains a known key
    for key, val in ABBR_NORMALIZE.items():
        if len(key) >= 3 and key.lower() in name.lower():
            return val

    return name


# ── Patient info extraction ──────────────────────────────────────────

def extract_patient_info(text: str) -> dict:
    """
    §INFO: Extract patient name and test date from PDF text.
    Ramus: "31.03.2023 ПЕТКО ЗЛАТКОВ ДЕЛЧЕВ ЕГН : 8907188480"
    LINA:  "30.04.2025 Петко Златков Делчев (М, 35 г.) ID 9516322"
    """
    info = {'name': '', 'date': '', 'sex': '', 'age': ''}

    # Date pattern: DD.MM.YYYY
    date_match = re.search(r'(\d{2}\.\d{2}\.\d{4})', text[:500])
    if date_match:
        info['date'] = date_match.group(1)

    # LINA format: "Name (М, 35 г.)"
    lina_match = re.search(r'([\w\s]+)\s*\(([МЖ]),\s*(\d+)\s*г\.\)', text[:500])
    if lina_match:
        info['name'] = lina_match.group(1).strip()
        info['sex'] = 'male' if lina_match.group(2) == 'М' else 'female'
        info['age'] = lina_match.group(3)

    # Ramus format: "ПЕТКО ЗЛАТКОВ ДЕЛЧЕВ ЕГН :"
    if not info['name']:
        ramus_match = re.search(r'([А-Я]{2,}\s+[А-Я]{2,}\s+[А-Я]{2,})\s+ЕГН', text[:500])
        if ramus_match:
            info['name'] = ramus_match.group(1).strip()

    return info


# ── Main parse function ──────────────────────────────────────────────

def parse_pdf(file_path: str) -> dict:
    """
    §MAIN: Entry point for PDF parsing.
    1. Extract text from PDF
    2. Detect lab type (Ramus/LINA/other)
    3. Apply lab-specific line parser
    4. Normalize extracted names to canonical abbreviations
    5. Return {lab_type, results[], warnings[], patient_info}
    """
    text = extract_text_from_pdf(file_path)
    warnings = []

    if not text:
        return {
            'lab_type': 'other',
            'results': [],
            'warnings': ['Could not extract any text from PDF'],
            'patient_info': {},
        }

    lab_type = detect_lab(text)
    patient_info = extract_patient_info(text)

    # §CHAIN: Lab-specific parser → fallback
    if lab_type == 'ramus':
        raw_results = parse_ramus(text)
    elif lab_type == 'lina':
        raw_results = parse_lina(text)
    else:
        # Try both parsers, take whichever yields more results
        ramus_results = parse_ramus(text)
        lina_results = parse_lina(text)
        raw_results = ramus_results if len(ramus_results) >= len(lina_results) else lina_results

    # §NORMALIZE: Map extracted names to canonical abbreviations
    results = []
    for r in raw_results:
        normalized = normalize_name(r['name'])
        results.append({
            'name': normalized,
            'name_original': r.get('name_original', r['name']),
            'value': r['value'],
            'unit': r['unit'],
            'ref_range': r.get('ref_range', ''),
        })

    if not results:
        warnings.append('No biomarker results could be extracted from PDF. Try manual entry.')

    return {
        'lab_type': lab_type,
        'results': results,
        'warnings': warnings,
        'patient_info': patient_info,
        'raw_text_preview': text[:500] if text else '',
    }
