import re
from properties.notary_parser import extract_text_from_pdf

with open('/workspaces/domapp/notarialen_Akt.pdf', 'rb') as f:
    text = extract_text_from_pdf(f)

# Check what quote chars are actually used around company names
idx = text.index('Констракш')
chunk = text[idx-30:idx+40]
print('Chunk around seller:', repr(chunk))
for c in chunk:
    if not c.isalpha() and not c.isspace() and c not in '.,;:-0123456789':
        print(f'  char: {c!r} code: {ord(c)}')

print()

# Debug the address
idx2 = text.index('административен адрес')
chunk2 = text[idx2:idx2+200]
print('Address chunk:', repr(chunk2))
for c in chunk2:
    if not c.isalpha() and not c.isspace() and c not in '.,;:-0123456789':
        print(f'  char: {c!r} code: {ord(c)}')

print()

# Debug sold object
idx3 = text.lower().index('обект:')
print('Sold object:', repr(text[idx3:idx3+100]))

# Check "продавач" in wider context
matches = list(re.finditer(r'.{200}продавач', text, re.DOTALL))
if matches:
    print('\nBefore first продавач:')
    print(repr(matches[0].group()[-300:]))

# Test regex for seller
pattern = re.compile(r'\u201e([^\u201c\u201d\u201e\u201f]{3,60})\u201d\s*(ООД|ЕООД|АД|ЕАД).{0,400}?(?:като\s+)?продавач', re.IGNORECASE | re.DOTALL)
m = pattern.search(text)
print('\nSeller regex result:', m.group(1) if m else 'None')
