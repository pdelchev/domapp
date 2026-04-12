'use client';

import { useEffect, useState } from 'react';
import { BlockNoteView, useBlockNote } from '@blocknote/react';
import { BlockNoteEditor as BlockNote } from '@blocknote/core';
import '@blocknote/react/style.css';

interface BlockNoteEditorProps {
  initialContent?: any;
  onChange: (content: any) => void;
}

export default function BlockNoteEditor({ initialContent, onChange }: BlockNoteEditorProps) {
  const [isClient, setIsClient] = useState(false);

  const editor = useBlockNote({
    initialContent: initialContent || undefined,
    onEditorContentChange: (editor) => {
      onChange(editor.topLevelBlocks);
    },
  });

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || !editor) {
    return <div className="w-full h-full bg-gray-50 rounded animate-pulse" />;
  }

  return (
    <div className="w-full h-full bg-white rounded-lg border border-gray-200 overflow-hidden editor-wrapper">
      <style>{`
        .editor-wrapper .bn-editor {
          padding: 20px;
          font-size: 16px;
          line-height: 1.6;
        }
        .editor-wrapper .bn-block-group {
          margin-bottom: 12px;
        }
        .editor-wrapper {
          --bn-colors-editor-bg: white;
          --bn-colors-side-menu: #f3f4f6;
          --bn-colors-highlights-gray-highlight: #f3f4f6;
          --bn-colors-ui-text: #374151;
        }
      `}</style>
      <BlockNoteView editor={editor} />
    </div>
  );
}
