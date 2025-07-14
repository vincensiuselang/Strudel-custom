import React, { useState, useEffect, useRef } from 'react';

export function RenamePrompt({ defaultName, onConfirm, onCancel }) {
  const [fileName, setFileName] = useState(defaultName.replace('.wav', ''));
  const [format, setFormat] = useState('wav');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleConfirm = () => {
    onConfirm(fileName, format);
  };

  const handleCancel = () => {
    onCancel();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg text-foreground">
        <h2 className="text-lg font-bold mb-4">Name Your Recording</h2>
        <input
          ref={inputRef}
          type="text"
          className="w-full p-2 mb-4 border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-foreground"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="mb-4">
          <label htmlFor="format-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Format:
          </label>
          <select
            id="format-select"
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-foreground"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="wav">WAV (Lossless)</option>
            <option value="mp3">MP3 (Compressed)</option>
          </select>
        </div>
        <div className="flex justify-end space-x-2">
          <button
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={handleConfirm}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
