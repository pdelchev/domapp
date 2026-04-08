# ── properties/notary_parser.py ─────────────────────────────────────
# PDF parser for Bulgarian notary deeds (Нотариален Акт).
# Extracts property data fields from purchase/sale deeds.
#
# §CHAIN: extract_text → parse_notary_deed → return structured dict
# §FIELDS: address, city, cadastral_number, square_meters, purchase_price,
#          purchase_date, property_type, mortgage_provider, notary_act_number,
#          notary_act_date, seller_name, property_registry_number, notes

import re
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

logger = logging.getLogger(__name__)


# ── Bulgarian month names → month numbers ──────────────────────────
BG_MONTHS = {
    'януари': 1, 'февруари': 2, 'март': 3, 'април': 4,
    'май': 5, 'юни': 6, 'юли': 7, 'август': 8,
    'септември': 9, 'октомври': 10, 'ноември': 11, 'декември': 12,
}

# ── Property type detection keywords ───────────────────────────────
PROPERTY_TYPE_MAP = {
    'апартамент': 'apartment',
    'жилище': 'apartment',
    'жилищна': 'apartment',
    'студио': 'studio',
    'ателие': 'studio',
    'къща': 'house',
    'магазин': 'commercial',
    'офис': 'commercial',
    'търговск': 'commercial',
    'промишлен': 'commercial',
    'паркомяст': 'parking',
    'паркинг': 'parking',
    'гараж': 'garage',
    'склад': 'storage',
    'мазе': 'storage',
    'таван': 'storage',
}


def extract_text_from_pdf(file_obj) -> str:
    """Extract text from a PDF file. Uses pdfplumber first, falls back to OCR for scanned docs."""
    import pdfplumber

    text_parts = []
    file_obj.seek(0)
    with pdfplumber.open(file_obj) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    # If pdfplumber got text, use it
    combined = '\n'.join(text_parts)
    if len(combined.strip()) > 100:
        return combined

    # Fallback: OCR for scanned/image-based PDFs
    logger.info('No extractable text found, falling back to OCR')
    return _ocr_pdf(file_obj)


def _ocr_pdf(file_obj) -> str:
    """OCR a scanned PDF using tesseract with Bulgarian language support."""
    from pdf2image import convert_from_bytes
    import pytesseract

    file_obj.seek(0)
    pdf_bytes = file_obj.read()
    images = convert_from_bytes(pdf_bytes, dpi=300)

    text_parts = []
    for i, image in enumerate(images):
        # Use Bulgarian + English for mixed-language deeds
        page_text = pytesseract.image_to_string(image, lang='bul+eng')
        if page_text:
            text_parts.append(page_text)
        logger.info(f'OCR page {i + 1}: {len(page_text)} chars')

    return '\n'.join(text_parts)


def _parse_bg_date(text: str) -> Optional[str]:
    """Parse a Bulgarian date string like '03.08.2022' or 'трети август 2022'.
    Returns ISO format 'YYYY-MM-DD' or None."""
    # Try DD.MM.YYYY format first
    m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', text)
    if m:
        try:
            d = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            return d.strftime('%Y-%m-%d')
        except ValueError:
            pass

    # Try written Bulgarian date: "03.08.2020 г." or "трети август две хиляди и двадесет"
    for month_name, month_num in BG_MONTHS.items():
        if month_name in text.lower():
            # Look for year near the month
            year_match = re.search(r'(\d{4})\s*(?:г\.?|година)', text)
            if year_match:
                year = int(year_match.group(1))
                # Look for day number before the month
                day_match = re.search(r'(\d{1,2})\s*' + month_name, text.lower())
                if day_match:
                    try:
                        d = datetime(year, month_num, int(day_match.group(1)))
                        return d.strftime('%Y-%m-%d')
                    except ValueError:
                        pass
                # Default to 1st if no day found
                return f'{year}-{month_num:02d}-01'
    return None


def _parse_decimal(text: str) -> Optional[str]:
    """Parse a Bulgarian-format number like '528 074,00' or '282,98' to decimal string."""
    if not text:
        return None
    # Remove spaces and replace comma with dot
    cleaned = re.sub(r'\s+', '', text)
    cleaned = cleaned.replace(',', '.')
    # Remove trailing dots or non-numeric chars (except dot)
    cleaned = re.sub(r'[^\d.]', '', cleaned)
    try:
        val = Decimal(cleaned)
        return str(val)
    except (InvalidOperation, ValueError):
        return None


def _detect_property_type(text: str) -> str:
    """Detect property type from Bulgarian description text.
    Looks at the main property description (first ~2000 chars), not the entire deed.
    'Жилищна сграда с магазини' → commercial (the sold object is a магазин).
    """
    # Focus on the main property description — typically in first half
    desc = text[:6000].lower()

    # Look for the actual sold object description (after "продава" / "следния")
    sold_match = re.search(r'(?:продава|следния|обект:).{0,500}', desc, re.DOTALL)
    sold_text = sold_match.group() if sold_match else desc

    # Check the sold object specifically — more specific first
    if any(kw in sold_text for kw in ['магазин', 'офис', 'търговск', 'промишлен']):
        return 'commercial'
    if 'студио' in sold_text or 'ателие' in sold_text:
        return 'studio'
    if any(kw in sold_text for kw in ['паркомяст', 'паркинг']):
        return 'parking'
    if 'гараж' in sold_text and 'подземен гараж' not in sold_text:
        return 'garage'
    if any(kw in sold_text for kw in ['склад', 'мазе', 'таван']):
        return 'storage'
    if 'къща' in sold_text:
        return 'house'
    if any(kw in sold_text for kw in ['апартамент', 'жилище']):
        return 'apartment'

    return 'apartment'  # default


def _extract_notary_act_number(text: str) -> Optional[str]:
    """Extract notary act reference: '№ 122, том № III, рег. № 8083, дело № 474/2022'
    OCR often renders № as 'Ne', 'No', 'Хо' and рег. as 'er.'"""
    # Normalize OCR artifacts: Ne/No/Хо → №
    norm = re.sub(r'\b(?:Ne|No|Хо)\b', '№', text)

    # Pattern: № NNN, том № ..., рег. № ..., дело № .../YYYY
    m = re.search(
        r'(?:№|Ne|No)\s*(\d+)\s*,?\s*том\s*(?:(?:№|Ne|No)\s*)?([IVXLCDM\d]+)\s*,?\s*(?:рег|er|рет)\.?\s*(?:(?:№|Ne|No)\s*)?(\d+)\s*,?\s*дело\s*(?:(?:№|Ne|No)\s*)?(\d+/\d{4})',
        norm, re.IGNORECASE
    )
    if m:
        return f'№ {m.group(1)}, том {m.group(2)}, рег. № {m.group(3)}, дело № {m.group(4)}'

    # Simpler fallback
    m = re.search(r'(?:нотариален\s+акт|НОТАРИАЛЕН\s*АКТ)\s*.*?(?:№|Ne|No)\s*(\d+)', norm, re.IGNORECASE)
    if m:
        return f'№ {m.group(1)}'

    return None


def _extract_notary_date(text: str) -> Optional[str]:
    """Extract the date of the notary deed.
    Prefer the header date (most reliable), then 'Днес' line.
    OCR can misread years in the body, but header dates are usually clean."""
    # Header area: "/DD.MM.YYYY г." pattern — most reliable in notary deeds
    m = re.search(r'/(\d{1,2}\.\d{1,2}\.\d{4})\s*г\.', text[:600])
    if m:
        return _parse_bg_date(m.group(1))

    # "Днес, DD.MM.YYYY" pattern (but OCR may get the year wrong)
    m = re.search(r'Днес\s*,?\s*(\d{1,2}\.\d{1,2}\.\d{4})', text)
    if m:
        return _parse_bg_date(m.group(1))

    # "дело № NNN/YYYY година" — the year in the case number is reliable
    m = re.search(r'дело\s*(?:№|Ne|No)\s*\d+/(\d{4})\s*година', text, re.IGNORECASE)
    if m:
        year = m.group(1)
        # Find the day.month from the Днес line
        day_m = re.search(r'Днес\s*,?\s*(\d{1,2})\.(\d{1,2})', text)
        if day_m:
            try:
                d = datetime(int(year), int(day_m.group(2)), int(day_m.group(1)))
                return d.strftime('%Y-%m-%d')
            except ValueError:
                pass

    return None


def _extract_address(text: str) -> tuple[Optional[str], Optional[str]]:
    """Extract property address and city from deed text.
    Returns (address, city). Handles OCR quote variations."""
    qt = r'[„"""«»\"\']'  # any quote character
    city = None
    address = None

    # "административен адрес: град София, район „Витоша", улица\n„Мур" Ne 56"
    # Street name may be on next line after "улица"
    m = re.search(
        r'(?:административен\s+)?адрес\s*:\s*(?:гр(?:ад)?\.?\s*)(\S+)\s*,\s*район\s*' + qt + r'?([^"""„»«\'\"]+?)' + qt + r'?\s*,\s*улица\s*' + qt + r'?([^"""„»«\'\"]+?)' + qt + r'?\s*(?:(?:№|Ne|No|Хо)\s*)?(\d+)?',
        text, re.IGNORECASE | re.DOTALL
    )
    if m:
        city = m.group(1).strip()
        district = m.group(2).strip()
        street = m.group(3).strip()
        number = m.group(4) or ''

        parts = [f'ул. "{street}"']
        if number:
            parts[0] += f' № {number}'
        parts.append(f'район "{district}"')
        parts.append(f'гр. {city}')
        address = ', '.join(parts)
        return address, city

    # Fallback: "град <City>" pattern
    m = re.search(r'град\s+([А-Яа-я]+)', text)
    if m:
        city = m.group(1)

    # "улица „<name>" № <num>"
    m = re.search(
        r'улица\s*' + qt + r'([^"""„»«\'\"]+)' + qt + r'\s*(?:(?:№|Ne|No|Хо)\s*)?(\d+)?',
        text
    )
    if m:
        street_name = m.group(1).strip()
        street_num = m.group(2) or ''
        address = f'ул. "{street_name}"'
        if street_num:
            address += f' № {street_num}'

    # District
    district_m = re.search(r'район\s*' + qt + r'?([^"""„»«\'\",]+?)' + qt + r'?[\s,]', text)
    if district_m and address:
        address += f', район "{district_m.group(1).strip()}"'

    if address and city:
        address += f', гр. {city}'

    return address, city


def _extract_cadastral(text: str) -> Optional[str]:
    """Extract cadastral/identifier number — pattern like 68134.1932.2334"""
    # "поземлен имот с идентификатор № 68134.1932.2334"
    m = re.search(r'идентификатор\s*(?:№\s*)?(\d{4,5}\.\d{3,4}\.\d{3,5})', text)
    if m:
        return m.group(1)

    # Alternative: "кадастрален номер" or standalone cadastral pattern
    m = re.search(r'кадастрал\w*\s*(?:номер|№)\s*:?\s*(\d{4,5}\.\d{3,4}\.\d{3,5})', text, re.IGNORECASE)
    if m:
        return m.group(1)

    # Any cadastral-looking number near "имот"
    m = re.search(r'имот\s+.{0,30}?(\d{4,5}\.\d{3,4}\.\d{3,5})', text)
    if m:
        return m.group(1)

    return None


def _extract_square_meters(text: str) -> Optional[str]:
    """Extract property area in square meters."""
    # "площ от скица от NNN,NN" or "площ NNN,NN"
    # "построена площ от 282,98"
    patterns = [
        r'площ\s+(?:от\s+скица\s+)?(?:от\s+)?(\d[\d\s]*[,\.]\d+)\s*(?:\(|кв)',
        r'застроена\s+площ\s+(?:от\s+)?(\d[\d\s]*[,\.]\d+)',
        r'(\d[\d\s]*[,\.]\d+)\s*(?:\([^)]*\))?\s*квадратни\s*метра',
        r'(\d[\d\s]*[,\.]\d+)\s*(?:\([^)]*\))?\s*кв\.?\s*м',
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            val = _parse_decimal(m.group(1))
            if val:
                # Sanity check: typical property is 10-10000 sqm
                try:
                    if 1 < float(val) < 100000:
                        return val
                except ValueError:
                    pass
    return None


def _extract_purchase_price(text: str) -> Optional[str]:
    """Extract purchase price — usually stated as 'цена без ДДС' or 'продажна цена'."""
    patterns = [
        # "цената без ДДС е в размер на 528 074,00"
        r'цена\w*\s+без\s+ДДС\s+(?:е\s+)?(?:в\s+размер\s+на\s+)?(\d[\d\s]*[,\.]\d+)',
        # "продажна цена ... NNN NNN,NN"
        r'продажна\s+цена\s+.{0,60}?(\d[\d\s]*[,\.]\d+)\s*(?:\(|лева|лв)',
        # "за сумата от NNN NNN,NN"
        r'(?:за|продава.{0,30}?)\s+сума\w*\s+(?:от\s+)?(\d[\d\s]*[,\.]\d+)\s*(?:\(|лева|лв)',
        # "цена от NNN"
        r'цена\s+(?:от\s+)?(\d[\d\s]*[,\.]\d+)\s*(?:\(|лева|лв)',
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            val = _parse_decimal(m.group(1))
            if val:
                try:
                    # Sanity: typical price range
                    if float(val) > 100:
                        return val
                except ValueError:
                    pass
    return None


def _extract_seller(text: str) -> Optional[str]:
    """Extract seller (продавач) name — company or individual.
    Handles OCR artifacts: „ may appear as „ or \" and quotes vary."""
    # Normalize various quote characters for matching
    qt = r'[„"""«»\"\']'  # any quote-like character

    # Normalize quotes for matching
    qt = r'[„"""«»\"\']'

    # Pattern 1: „Company" ООД/ЕООД ... продавач (company name BEFORE "продавач")
    # This is the most common Bulgarian notary deed structure
    m = re.search(
        qt + r'([^"""„»«\'\"]{3,60})' + qt + r'\s*(ООД|ЕООД|АД|ЕАД|ЕТ).{0,400}?(?:като\s+)?продавач',
        text, re.IGNORECASE | re.DOTALL
    )
    if m:
        return f'"{m.group(1).strip()}" {m.group(2)}'

    # Pattern 2: „Company" ООД ... продава на (the first company that "sells")
    m = re.search(
        qt + r'([^"""„»«\'\"]{3,60})' + qt + r'\s*(ООД|ЕООД|АД|ЕАД|ЕТ).{0,300}?продава\s+на',
        text, re.IGNORECASE | re.DOTALL
    )
    if m:
        return f'"{m.group(1).strip()}" {m.group(2)}'

    # Pattern 3: Individual seller — "продавач ... Име Фамилия, с ЕГН"
    m = re.search(
        r'продавач\w*\s+.{0,50}?([А-Яа-я]+\s+[А-Яа-я]+(?:\s+[А-Яа-я]+)?)\s*,?\s*(?:с\s+)?ЕГН',
        text, re.IGNORECASE
    )
    if m:
        return m.group(1).strip()

    return None


def _extract_buyer(text: str) -> Optional[str]:
    """Extract buyer (купувач) name."""
    # "като купувач ... „<company>" (ООД|ЕООД|АД)"
    m = re.search(
        r'като\s+купувач\s+.{0,200}?[„"\"]([^"""]+)["""]\s*(ООД|ЕООД|АД|ЕАД|ЕТ)',
        text, re.IGNORECASE | re.DOTALL
    )
    if m:
        return f'"{m.group(1).strip()}" {m.group(2)}'

    # Individual buyer
    m = re.search(
        r'купувач\w*\s+.{0,50}?([А-Яа-я]+\s+[А-Яа-я]+(?:\s+[А-Яа-я]+)?)\s*,?\s*(?:с\s+)?ЕГН',
        text, re.IGNORECASE
    )
    if m:
        return m.group(1).strip()

    return None


def _extract_mortgage_provider(text: str) -> Optional[str]:
    """Extract mortgage bank name if property is bought with credit."""
    # "банков кредит, отпуснат от „<bank>" АД"
    m = re.search(
        r'(?:кредит|ипотек)\w*\s+.{0,100}?[„"\"]([^"""]+)["""]\s*(АД|ЕАД|банк)',
        text, re.IGNORECASE | re.DOTALL
    )
    if m:
        bank = m.group(1).strip()
        suffix = m.group(2).strip()
        if suffix.lower() != 'банк':
            return f'{bank} {suffix}'
        return bank

    # "чрез банков кредит ... <Bank Name> АД"
    m = re.search(
        r'(?:кредит|ипотек)\w*.{0,150}?([А-Яа-яA-Za-z]+(?:\s+[А-Яа-яA-Za-z]+){1,3})\s+(?:АД|ЕАД)',
        text, re.IGNORECASE | re.DOTALL
    )
    if m:
        return f'{m.group(1).strip()} АД'

    return None


def _extract_registry_number(text: str) -> Optional[str]:
    """Extract property registry number (имотна партида №).
    OCR renders № as Ne/No/Хо."""
    # "Им. партида № 596188" or "Им. партида Хо 596188"
    m = re.search(
        r'(?:Им\.?\s*партида|имотна\s*партида|партида)\s*(?:(?:№|Ne|No|Хо)\s*)?(\d{3,})',
        text, re.IGNORECASE
    )
    if m:
        return m.group(1).strip()

    # In the header: "Им. партида Хо _NNN_"
    m = re.search(r'партида\s*(?:(?:№|Ne|No|Хо)\s*)(\d+)', text[:600], re.IGNORECASE)
    if m:
        return m.group(1).strip()

    return None


def parse_notary_deed(file_obj) -> dict:
    """Parse a Bulgarian notary deed PDF and extract property fields.

    Returns a dict with fields matching the Property model, plus metadata.
    Only includes fields where data was successfully extracted.
    """
    try:
        text = extract_text_from_pdf(file_obj)
    except Exception as e:
        logger.error(f'Failed to extract text from notary deed PDF: {e}')
        return {'error': f'Failed to read PDF: {str(e)}', 'parsed_fields': {}}

    if not text or len(text) < 100:
        return {'error': 'PDF appears empty or unreadable', 'parsed_fields': {}}

    logger.info(f'Notary deed PDF extracted: {len(text)} chars')

    fields = {}
    warnings = []

    # Notary act reference
    act_num = _extract_notary_act_number(text)
    if act_num:
        fields['notary_act_number'] = act_num

    # Notary date
    act_date = _extract_notary_date(text)
    if act_date:
        fields['notary_act_date'] = act_date
        # Purchase date is typically the notary deed date
        fields['purchase_date'] = act_date

    # Address and city
    address, city = _extract_address(text)
    if address:
        fields['address'] = address
    if city:
        fields['city'] = city

    # Country — always Bulgaria for notary deeds
    fields['country'] = 'Bulgaria'

    # Cadastral number
    cadastral = _extract_cadastral(text)
    if cadastral:
        fields['cadastral_number'] = cadastral

    # Square meters
    sqm = _extract_square_meters(text)
    if sqm:
        fields['square_meters'] = sqm

    # Purchase price
    price = _extract_purchase_price(text)
    if price:
        fields['purchase_price'] = price

    # Property type
    property_type = _detect_property_type(text)
    fields['property_type'] = property_type

    # Seller
    seller = _extract_seller(text)
    if seller:
        fields['seller_name'] = seller

    # Buyer (informational — stored in notes)
    buyer = _extract_buyer(text)

    # Mortgage provider
    mortgage = _extract_mortgage_provider(text)
    if mortgage:
        fields['mortgage_provider'] = mortgage

    # Property registry number
    registry = _extract_registry_number(text)
    if registry:
        fields['property_registry_number'] = registry

    # Build notes with extra info
    notes_parts = []
    if buyer:
        notes_parts.append(f'Купувач: {buyer}')
    if act_num:
        notes_parts.append(f'Нотариален акт: {act_num}')
    if notes_parts:
        fields['_extra_notes'] = '\n'.join(notes_parts)

    # Validation warnings
    if not address:
        warnings.append('Could not extract property address')
    if not cadastral:
        warnings.append('Could not extract cadastral number')
    if not price:
        warnings.append('Could not extract purchase price')
    if not sqm:
        warnings.append('Could not extract square meters')

    return {
        'parsed_fields': fields,
        'warnings': warnings,
        'text_length': len(text),
    }
