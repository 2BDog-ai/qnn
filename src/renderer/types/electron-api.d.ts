declare global {
  interface Window {
    electronAPI: {
      ipcRenderer: {
        on: (channel: string, func: (...args: any[]) => void) => void;
        removeAllListeners: (channel: string) => void;
        send: (channel: string, ...args: any[]) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
      ffmpeg: {
        check: () => Promise<boolean>;
        convert: (options: any) => Promise<any>;
        cancel?: (conversionId: string) => Promise<any>;
        getInfo?: (filePath: string) => Promise<any>;
        onProgress: (callback: (progress: any) => void) => void;
      };
      app: {
        getTempPath: () => Promise<string>;
        getPath: (name: string) => Promise<string>;
        getVersion?: () => Promise<string>;
        getDesktopPath: () => Promise<string>;
      };
      fs: {
        writeFile: (path: string, data: any) => Promise<void>;
        readFile: (path: string) => Promise<any>;
        unlink: (path: string) => Promise<void>;
        mkdir: (path: string) => Promise<void>;
        readdir?: (path: string) => Promise<string[]>;
        exists?: (path: string) => Promise<boolean>;
        stat?: (path: string) => Promise<{ size: number; isFile: boolean; isDirectory: boolean; mtime: Date; ctime: Date; }>;
        scanAudioFiles?: (folderPath: string) => Promise<string[]>;
      };
      dialog: {
        openFolder: (options?: any) => Promise<string | null>;
        openFile: (options?: any) => Promise<string[]>;
        saveFile: (options?: any) => Promise<string | null>;
        showMessage: (options: any) => Promise<number>;
      };
      system: {
        getPlatform?: () => string;
        getArch?: () => string;
        getNodeVersion?: () => string;
        getElectronVersion?: () => string;
        openFolder: () => Promise<{ success: boolean; path?: string; error?: string; filePaths?: string[] }>; 
        openFile: () => Promise<{ success: boolean; path?: string; error?: string; filePaths?: string[] }>;
        getAudioDevices?: () => Promise<any[]>;
      };
      // Shell API - 用于打开外部链接
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      // 本次补充的关键类型
      music: {
        // 音乐解密
        decrypt: (options: {
          inputData: Uint8Array;
          inputPath?: string;
          outputPath?: string;
          format?: 'ncm' | 'kgm' | 'auto';
        }) => Promise<{
          success: boolean;
          outputPath?: string;
          outputData?: Uint8Array;
          format?: 'mp3' | 'flac';
          error?: string;
          metadata?: {
            title?: string;
            artist?: string;
            album?: string;
          };
        }>;
        canDecrypt: (format: string) => Promise<boolean>;
        // 音乐文件操作
        getAll: () => Promise<any[]>;
        get: (id: string) => Promise<any>;
        add: (musicFile: any, targetPlaylistId?: string) => Promise<any>;
        addBatch: (musicFiles: any[], targetPlaylistId?: string) => Promise<any>;
        update: (id: string, updates: any) => Promise<any>;
        delete: (id: string) => Promise<any>;
        clearAll: () => Promise<void>;
        // 播放列表操作
        playlists: {
          getAll: () => Promise<any[]>;
          get: (id: string) => Promise<any>;
          create: (playlist: any) => Promise<any>;
          update: (id: string, updates: any) => Promise<any>;
          delete: (id: string) => Promise<any>;
          addMusic: (playlistId: string, musicId: string) => Promise<any>;
          removeMusic: (playlistId: string, musicId: string) => Promise<any>;
          getMusic: (playlistId: string) => Promise<any[]>;
          addMusicBatch: (playlistId: string, musicIds: string[]) => Promise<any>;
          // 排序方法
          updateOrder: (playlistIds: string[]) => Promise<any>;
          updateMusicOrder: (playlistId: string, musicIds: string[]) => Promise<any>;
          getDefault: () => Promise<any>;
          ensureDefault: () => Promise<any>;
          getCurrent?: () => Promise<any>;
          setCurrent?: (playlistId: string) => Promise<any>;
        };
      };
      // 其它API保持可选，避免与现有声明冲突
      recording?: any;
      shortcut?: any;
      storage: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        delete: (key: string) => Promise<void>;
      };
      vocalRemover?: any;
      consoleRecording?: any;
      handCard?: any;
      audioEditor?: any;
      window?: any;
      getMachineId: () => Promise<string>;
      generateActivationCode: (userId: string, secretKey: string) => Promise<string>;
      validateActivationCode: (inputCode: string, userId: string, secretKey: string) => Promise<boolean>;
      activateApp: (isProduction: boolean) => Promise<boolean>;
      getMACAddress: () => Promise<string>;
      validateActivationKey: (code: string, mac: string) => Promise<{ valid: boolean; expiry?: string; error?: string }>;
      
      // 调试工具
      debug: {
        windowsDiagnosis: () => Promise<{
          platform: string;
          arch: string;
          nodeVersion: string;
          electronVersion: string;
          chromeVersion: string;
          database: {
            initialized: boolean;
            path: string;
            exists: boolean;
            size: number;
            playlists: number;
            musicFiles: number;
            error: string | null;
          };
          paths: {
            userData: string;
            temp: string;
            documents: string;
            home: string;
          };
          system: {
            totalMemory: number;
            freeMemory: number;
            platform: string;
            release: string;
            hostname: string;
          };
        }>;
      };
    };
  }
}

export {};
