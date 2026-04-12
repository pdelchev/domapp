'use client';

import { useEffect, useState, useRef } from 'react';

interface BlockNoteEditorProps {
  initialContent?: any;
  onChange: (content: any) => void;
  contentType?: string;
}

export default function BlockNoteEditor({ initialContent, onChange, contentType = 'blocks' }: BlockNoteEditorProps) {
  const [isClient, setIsClient] = useState(false);
  const [text, setText] = useState<string>('');
  const [isJSONMode, setIsJSONMode] = useState(false);
  const [showRawJSON, setShowRawJSON] = useState(false); // Toggle to view raw JSON
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<string>('');

  // Extract plain text from block structure
  const extractTextFromBlocks = (blocks: any[]): string => {
    if (!Array.isArray(blocks)) return '';
    return blocks
      .map((block: any) => {
        const type = block.type || '';
        if (type === 'text' || type === 'heading') return block.content || '';
        if (type === 'paragraph') {
          const content = block.content || [];
          return Array.isArray(content)
            ? content.map((c: any) => c.text || '').join('')
            : '';
        }
        if (type === 'checklist') {
          return (block.items || [])
            .map((item: any) => `${item.checked ? '[x]' : '[ ]'} ${item.text || ''}`)
            .join('\n');
        }
        if (type === 'bullet') {
          return (block.items || []).map((item: any) => `• ${item.text || ''}`).join('\n');
        }
        if (type === 'code') return block.content || '';
        return '';
      })
      .filter((t: string) => t.trim().length > 0)
      .join('\n\n');
  };

  useEffect(() => {
    setIsClient(true);
    // Always start in Text mode for better UX - extract text from blocks
    if (initialContent) {
      if (Array.isArray(initialContent) && initialContent.length > 0) {
        // Extract readable text from blocks
        const plainText = extractTextFromBlocks(initialContent);
        setText(plainText);
        lastSentRef.current = plainText;
      } else if (typeof initialContent === 'string') {
        setText(initialContent);
        lastSentRef.current = initialContent;
      } else {
        setText('');
        lastSentRef.current = '';
      }
    }
    setIsJSONMode(false); // Always start in text mode
  }, [initialContent]);

  const sendChanges = (newText: string) => {
    // Only send if content actually changed
    if (newText === lastSentRef.current) {
      return;
    }

    lastSentRef.current = newText;

    // Always send as plain text wrapped in a paragraph block
    // This ensures consistency and prevents JSON parsing issues
    if (newText.trim() === '') {
      onChange([{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]);
    } else {
      onChange([{ type: 'paragraph', content: [{ type: 'text', text: newText }] }]);
    }
  };

  const handleTextChange = (newText: string) => {
    setText(newText);

    // Debounce the onChange call - wait 1 second after user stops typing
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      sendChanges(newText);
    }, 1000);
  };

  if (!isClient) {
    return <div className="w-full h-full bg-gray-50 rounded animate-pulse" />;
  }

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex gap-2 p-2 border-b border-gray-200 bg-gray-50 items-center justify-between">
        <div className="text-xs font-semibold text-gray-600 uppercase">Text Editor</div>
        <button
          onClick={() => setShowRawJSON(!showRawJSON)}
          className={`px-2 py-1 rounded text-xs font-medium transition ${
            showRawJSON
              ? 'bg-amber-100 text-amber-700'
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
          title="Toggle raw JSON view (read-only)"
        >
          {showRawJSON ? '📄 Hide JSON' : '👁 View JSON'}
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          className="flex-1 p-4 border-0 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          placeholder="Enter your note here..."
          spellCheck="false"
        />

        {/* Raw JSON preview (read-only) */}
        {showRawJSON && (
          <div className="w-1/2 border-l border-gray-200 flex flex-col bg-gray-50">
            <div className="px-4 py-2 border-b border-gray-200 bg-gray-100 text-xs font-semibold text-gray-600">
              Raw JSON (read-only)
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-gray-600 whitespace-pre-wrap break-words">
              {JSON.stringify(
                text.trim() === ''
                  ? []
                  : [{ type: 'paragraph', content: [{ type: 'text', text }] }],
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
        {text.length} characters • Saves automatically after typing pauses
      </div>
    </div>
  );
}
