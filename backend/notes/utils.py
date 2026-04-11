"""
Utility functions for the Notes app.
"""

from bleach import clean


# HTML sanitization for rich text content
ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'pre']
ALLOWED_ATTRS = {'a': ['href', 'title'], 'code': ['class'], 'pre': ['class']}


def sanitize_html(content):
    """
    Sanitize HTML content to prevent XSS attacks.
    Allows only safe tags and attributes for rich text editing.
    """
    if not content:
        return ''
    return clean(content, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)
