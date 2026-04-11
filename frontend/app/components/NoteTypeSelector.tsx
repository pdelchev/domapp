'use client';

import { Button } from './ui';

interface NoteTypeSelectorProps {
  onSelect: (type: 'richtext' | 'plaintext') => void;
  onCancel: () => void;
  locale: 'en' | 'bg';
}

export function NoteTypeSelector({ onSelect, onCancel, locale }: NoteTypeSelectorProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md shadow-xl">
        <h2 className="text-xl font-bold mb-4 text-gray-900">
          {locale === 'bg' ? 'Какъв тип бележка?' : 'What type of note?'}
        </h2>

        <div className="space-y-3 mb-6">
          {/* Rich Text Option */}
          <button
            onClick={() => onSelect('richtext')}
            className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
          >
            <div className="font-semibold text-gray-900">
              {locale === 'bg' ? 'Rich Text (препоръчано)' : 'Rich Text (Recommended)'}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {locale === 'bg'
                ? 'Форматирано като Google Docs. Болд, курсив, заглавия, списъци.'
                : 'Formatted like Google Docs. Bold, italic, headings, lists.'}
            </div>
            <div className="mt-2 flex gap-1">
              <span className="inline-block px-2 py-1 bg-gray-100 text-xs rounded">
                <strong>Bold</strong>
              </span>
              <span className="inline-block px-2 py-1 bg-gray-100 text-xs rounded italic">
                Italic
              </span>
              <span className="inline-block px-2 py-1 bg-gray-100 text-xs rounded">• List</span>
            </div>
          </button>

          {/* Plain Text Option */}
          <button
            onClick={() => onSelect('plaintext')}
            className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
          >
            <div className="font-semibold text-gray-900">
              {locale === 'bg' ? 'Обичайни текст' : 'Plain Text'}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {locale === 'bg'
                ? 'Просто писане. Никакво форматиране, нула трение.'
                : 'Just write. No formatting, zero friction.'}
            </div>
            <div className="mt-2 p-2 bg-gray-50 rounded text-sm font-mono text-gray-700">
              Just plain, simple text...
            </div>
          </button>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded font-medium"
          >
            {locale === 'bg' ? 'Отмени' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
