import React, { useState } from 'react';

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

const coverColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
];

const coverIcons = [
  '🎵', '🎶', '🎸', '🎹', '🎺', '🎻', '🥁', '🎤', '🎧', '📻',
  '💿', '🎼', '🎷', '🪕', '🪘', '🎭', '🎪', '🎨', '🌟', '💫'
];

export const PlaylistCreateModal: React.FC<PlaylistCreateModalProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(coverColors[0]);
  const [selectedIcon, setSelectedIcon] = useState(coverIcons[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const result = await onCreate(name.trim(), description.trim(), selectedColor, selectedIcon);
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

  const handleClose = () => {
    if (isSubmitting) return;
    setName('');
    setDescription('');
    setSelectedColor(coverColors[0]);
    setSelectedIcon(coverIcons[0]);
    setSubmitError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">创建新歌单</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 歌单封面预览 */}
          <div className="flex justify-center mb-4">
            <div 
              className="w-24 h-24 rounded-xl flex items-center justify-center text-3xl shadow-lg"
              style={{ backgroundColor: selectedColor }}
            >
              {selectedIcon}
            </div>
          </div>

          {/* 歌单名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              歌单名称 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入歌单名称"
              required
            />
          </div>

          {/* 歌单描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              歌单描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入歌单描述（可选）"
              rows={3}
            />
          </div>

          {/* 封面颜色选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              封面颜色
            </label>
            <div className="grid grid-cols-5 gap-2">
              {coverColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    selectedColor === color 
                      ? 'border-gray-800 scale-110' 
                      : 'border-gray-300 hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: color }}
                  title={`选择颜色 ${color}`}
                />
              ))}
            </div>
          </div>

          {/* 封面图标选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              封面图标
            </label>
            <div className="grid grid-cols-10 gap-2 max-h-40 overflow-y-auto p-1 border border-gray-200 rounded-lg">
              {coverIcons.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                    selectedIcon === icon 
                      ? 'border-blue-500 bg-blue-50 scale-110' 
                      : 'border-gray-300 hover:border-gray-500 hover:scale-105'
                  }`}
                  title={`选择图标 ${icon}`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* 操作按钮 */}
          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <div className="flex space-x-3 pt-4">
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
