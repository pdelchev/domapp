'use client';

import { useEffect, useState } from 'react';

interface BlockNoteEditorProps {
  initialContent?: any;
  onChange: (content: any) => void;
}

export default function BlockNoteEditor({ initialContent, onChange }: BlockNoteEditorProps) {
  const [isClient, setIsClient] = useState(false);
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    setIsClient(true);
    // Load initial content as text
    if (initialContent && Array.isArray(initialContent)) {
      setContent(JSON.stringify(initialContent, null, 2));
    }
  }, [initialContent]);

  const handleChange = (text: string) => {
    setContent(text);
    // Try to parse and send back
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        onChange(parsed);
      }
    } catch {
      // If not valid JSON, send as-is wrapped in blocks
      onChange([{ type: 'paragraph', content: [{ type: 'text', text: text }] }]);
    }
  };

  if (!isClient) {
    return <div className="w-full h-full bg-gray-50 rounded animate-pulse" />;
  }

  return (
    <textarea
      value={content}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full h-full p-4 border border-gray-200 rounded-lg font-mono text-sm"
      placeholder="Enter note content (JSON format for blocks)..."
    />
  );
}
