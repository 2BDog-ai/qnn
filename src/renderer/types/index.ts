// 音频文件数据结构
export interface AudioFile {
  id: string;                    // 唯一标识
  filePath: string;             // 文件绝对路径
  fileName: string;             // 原始文件名
  displayName: string;          // 用户自定义显示名称
  artist: string;               // 艺术家
  album: string;                // 专辑
  duration: number;             // 时长（秒）
  fileSize: number;             // 文件大小
  format: string;               // 文件格式
  bitrate: number;              // 比特率
  sampleRate: number;           // 采样率
  addedTime: Date;              // 添加时间
  lastPlayTime?: Date;          // 最后播放时间
  playCount: number;            // 播放次数
  isFavorite: boolean;          // 是否收藏
  isTrimmed: boolean;           // 是否已剪辑
  customTags: string[];         // 自定义标签
  thumbnailPath?: string;       // 缩略图路径
}

// 播放列表数据结构
export interface Playlist {
  id: string;
  name: string;
  description: string;
  audioFiles: string[];         // AudioFile的id数组
  createdTime: Date;
  updatedTime: Date;
  isDefault: boolean;           // 是否为默认列表
  sortOrder: SortOrder;         // 排序方式
  shuffleOrder?: number[];      // 随机播放顺序
  coverColor?: string;          // 封面背景颜色
  coverIcon?: string;           // 封面图标
  songCount?: number;           // 歌曲数量
  totalDuration?: number;       // 总时长
  // 新增独立的排序状态
  sortBy?: 'name' | 'artist' | 'duration' | 'addedTime' | 'manual';
  sortDirection?: 'asc' | 'desc';
  manualOrder?: string[];       // 手动排序的歌曲ID顺序
  displayOrder?: number;        // 歌单显示顺序（用于拖拽排序）
}

// 排序方式枚举
export enum SortOrder {
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
  DURATION_ASC = 'duration_asc', 
  DURATION_DESC = 'duration_desc',
  ADDED_TIME_ASC = 'added_time_asc',
  ADDED_TIME_DESC = 'added_time_desc',
  CUSTOM = 'custom'
}

// 播放状态数据结构
export interface PlaybackState {
  currentAudioId?: string;      // 当前播放的音乐ID
  currentPlaylistId: string;    // 当前播放列表ID
  isPlaying: boolean;           // 是否正在播放
  isPaused: boolean;            // 是否暂停
  currentTime: number;          // 当前播放时间
  volume: number;               // 音量 (0-1)
  playMode: PlayMode;           // 播放模式
  isMuted: boolean;             // 是否静音
}

// 播放模式枚举
export enum PlayMode {
  NORMAL = 'normal',            // 正常播放
  REPEAT_ONE = 'repeat_one',    // 单曲循环
  REPEAT_ALL = 'repeat_all',    // 列表循环
  SHUFFLE = 'shuffle'           // 随机播放
}

// 用户配置数据结构
export interface UserConfig {
  user: {
    name: string;
    company: string;
    avatarPath: string;
  };
  settings: {
    defaultVolume: number;
    audioOutputDevice: string;
    audioInputDevice: string;
    shortcuts: Record<string, string>;  // 快捷键映射
    theme: 'light' | 'dark';
    language: 'zh-CN' | 'en-US';
  };
  folders: {
    musicLibraryPath: string;
    exportPath: string;
    recordingPath: string;
  };
}

// 音频转码选项
export interface ConvertOptions {
  format: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  quality?: 'low' | 'medium' | 'high';
}

// 录音选项
export interface RecordingOptions {
  includeMicrophone: boolean;
  includeSystemAudio: boolean;
  outputFormat: 'wav' | 'mp3';
  quality: 'low' | 'medium' | 'high';
  autoSave: boolean;
}

// 音频设备信息
export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

// 人声消除方法
export enum VocalRemovalMethod {
  CENTER_CHANNEL = 'center_channel',    // 中央声道消除
  KARAOKE_MODE = 'karaoke_mode',       // 卡拉OK模式
  AI_ENHANCED = 'ai_enhanced'          // AI增强（未来扩展）
}

// 应用模块类型
export type AppModule = '音乐播放' | '音频编辑' | '人声消除' | '录音功能' | '设置';

// 拖拽项目类型
export interface DragItem {
  id: string;
  index: number;
  type: 'audio' | 'playlist';
}

// 事件类型
export interface AppEvent {
  type: string;
  data?: any;
  timestamp: number;
}
