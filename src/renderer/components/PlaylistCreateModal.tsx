import React, { useEffect, useRef, useState } from 'react';

interface PlaylistCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    description: string,
    coverColor: string,
    coverIcon: string
  ) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
}

const defaultCoverColor = '#4ECDC4';
const defaultCoverIcon = '♪';

export const PlaylistCreateModal: React.FC<PlaylistCreateModalProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSubmitting) return;
    setName('');
    setSubmitError('');
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const result = await onCreate(trimmedName, '', defaultCoverColor, defaultCoverIcon);
      if (result.success) {
        handleClose();
      } else {
        setSubmitError(result.error || '创建歌单失败，请重试');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '创建歌单失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">创建新歌单</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
            aria-label="关闭"
            type="button"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              歌单名称
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入歌单名称"
              required
            />
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
              disabled={!name.trim() || isSubmitting}
            >
              {isSubmitting ? '创建中...' : '创建歌单'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
