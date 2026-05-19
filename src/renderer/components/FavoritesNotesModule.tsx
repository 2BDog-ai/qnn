import React, { useEffect, useMemo, useRef, useState } from 'react';

type FavoriteNote = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
};

const STORAGE_KEY = 'favoritesNotes';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
};

export const FavoritesNotesModule: React.FC = () => {
  const [notes, setNotes] = useState<FavoriteNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const saveTimerRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    window.electronAPI.storage
      .get(STORAGE_KEY)
      .then((data: any) => {
        if (!mounted) return;
        const parsed: FavoriteNote[] = Array.isArray(data) ? data : [];
        const sorted = [...parsed].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
        setNotes(sorted);
        if (sorted.length > 0) setSelectedId(sorted[0].id);
      })
      .catch(() => {
        setNotes([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const persistNotes = (next: FavoriteNote[]) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      window.electronAPI.storage.set(STORAGE_KEY, next);
    }, 300);
  };

  const handleCreate = () => {
    const now = Date.now();
    const newNote: FavoriteNote = {
      id: generateId(),
      title: '新建记录',
      content: '',
      createdAt: now,
      updatedAt: now
    };
    const next = [newNote, ...notes];
    setNotes(next);
    setSelectedId(newNote.id);
    persistNotes(next);
  };

  const handleDelete = (id: string) => {
    const next = notes.filter(n => n.id !== id);
    setNotes(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    persistNotes(next);
  };

  const handleTogglePin = (id: string) => {
    const next = notes
      .map(n => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
    setNotes(next);
    persistNotes(next);
  };

  const selected = useMemo(() => notes.find(n => n.id === selectedId) || null, [notes, selectedId]);

  const handleTitleChange = (value: string) => {
    if (!selected) return;
    const next = notes.map(n => (n.id === selected.id ? { ...n, title: value, updatedAt: Date.now() } : n));
    setNotes(next);
    persistNotes(next);
  };

  const handleContentChange = (value: string) => {
    if (!selected) return;
    const next = notes.map(n => (n.id === selected.id ? { ...n, content: value, updatedAt: Date.now() } : n));
    setNotes(next);
    persistNotes(next);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(n => (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q));
  }, [notes, search]);

  return (
    <div className="flex-1 flex bg-white dark:bg-gray-900 min-h-0 overflow-hidden">
      <div className="w-80 border-r border-gray-200 dark:border-slate-700 flex flex-col">
        <div className="p-3 flex items-center gap-2 border-b border-gray-200 dark:border-slate-700">
          <button
            onClick={handleCreate}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
          >
            新建
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索记录..."
            className="flex-1 bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-gray-500 dark:text-slate-400">暂无记录，点击“新建”开始</div>
          ) : (
            filtered.map(note => (
              <div
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                className={`px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 ${selectedId === note.id ? 'bg-blue-50 dark:bg-slate-800' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900 dark:text-white truncate">{note.title || '未命名'}</div>
                  {note.pinned && <span className="text-xs text-amber-600">置顶</span>}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">{formatTime(note.updatedAt)}</div>
                <div className="text-xs text-gray-600 dark:text-slate-300 mt-1 line-clamp-2">{note.content || '无内容'}</div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-gray-500 dark:text-slate-400">选择或新建一条记录</div>
        ) : (
          <>
            <div className="p-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
              <input
                value={selected.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="输入标题..."
                className="flex-1 bg-transparent text-lg font-semibold text-gray-900 dark:text-white outline-none"
              />
              <button
                onClick={() => handleTogglePin(selected.id)}
                className={`px-2 py-1 rounded-md text-sm ${selected.pinned ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200'}`}
              >
                {selected.pinned ? '取消置顶' : '置顶'}
              </button>
              <button
                onClick={() => handleDelete(selected.id)}
                className="px-2 py-1 rounded-md text-sm bg-red-100 text-red-700 hover:bg-red-200"
              >
                删除
              </button>
            </div>
            <textarea
              value={selected.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="在此记录您的想法、流程或收藏细节..."
              className="flex-1 p-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none resize-none"
            />
          </>
        )}
      </div>
    </div>
  );
};

export default FavoritesNotesModule;


