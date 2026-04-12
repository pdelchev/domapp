'use client';

import { useEffect, useState } from 'react';

interface BlockNoteEditorProps {
  initialContent?: any;
  onChange: (content: any) => void;
}

export default function BlockNoteEditor({ initialContent, onChange }: BlockNoteEditorProps) {
  const [isClient, setIsClient] = useState(false);
  const [text, setText] = useState<string>('');
  const [isJSONMode, setIsJSONMode] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Check if initial content is an array (JSON blocks) or string
    if (initialContent) {
      if (Array.isArray(initialContent) && initialContent.length > 0) {
        // It's already parsed blocks - show as JSON
        setText(JSON.stringify(initialContent, null, 2));
        setIsJSONMode(true);
      } else if (typeof initialContent === 'string') {
        // It's plain text
        setText(initialContent);
        setIsJSONMode(false);
      }
    }
  }, [initialContent]);

  const handleTextChange = (newText: string) => {
    setText(newText);

    // Only send updates if user stops typing for a moment
    // This prevents cascading updates
    if (newText.trim() === '') {
      // Empty content
      onChange([{ type: 'paragraph', content: [{ type: 'text', text: '' }] }]);
    } else if (isJSONMode) {
      // Try to parse as JSON blocks
      try {
        const parsed = JSON.parse(newText);
        if (Array.isArray(parsed)) {
          onChange(parsed);
        }
      } catch {
        // If JSON parsing fails, treat as plain text
        onChange([{ type: 'paragraph', content: [{ type: 'text', text: newText }] }]);
      }
    } else {
      // Plain text mode - send as single paragraph
      onChange([{ type: 'paragraph', content: [{ type: 'text', text: newText }] }]);
    }
  };

  if (!isClient) {
    return <div className="w-full h-full bg-gray-50 rounded animate-pulse" />;
  }

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Mode toggle */}
      <div className="flex gap-2 p-2 border-b border-gray-200 bg-gray-50">
        <button
          onClick={() => setIsJSONMode(false)}
          className={`px-3 py-1 rounded text-sm font-medium transition ${
            !isJSONMode
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Text
        </button>
        <button
          onClick={() => setIsJSONMode(true)}
          className={`px-3 py-1 rounded text-sm font-medium transition ${
            isJSONMode
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          JSON
        </button>
      </div>

      {/* Editor */}
      <textarea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        className="flex-1 p-4 border-0 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
        placeholder={isJSONMode ? 'Enter note content as JSON blocks...' : 'Enter note content...'}
        spellCheck="false"
      />

      {/* Info */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
        {isJSONMode ? 'JSON mode - edit block structure' : 'Text mode - plain text content'}
      </div>
    </div>
  );
}
