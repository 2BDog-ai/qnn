import { globalShortcut, BrowserWindow } from 'electron';

export class ShortcutManager {
  private window: BrowserWindow;
  private shortcuts: Map<string, () => void> = new Map();
  
  constructor(window: BrowserWindow) {
    this.window = window;
  }
  
  registerDefaultShortcuts(): void {
    console.log('开始注册全局快捷键...');
    
    // 播放控制 - 使用媒体键和常规键的组合
    this.registerShortcut('MediaPlayPause', () => this.sendToRenderer('player:toggle'));
    this.registerShortcut('Space', () => this.sendToRenderer('player:toggle'));
    
    this.registerShortcut('MediaPreviousTrack', () => this.sendToRenderer('player:previous'));
    this.registerShortcut('Left', () => this.sendToRenderer('player:previous'));
    
    this.registerShortcut('MediaNextTrack', () => this.sendToRenderer('player:next'));
    this.registerShortcut('Right', () => this.sendToRenderer('player:next'));
    
    // 音量控制
    this.registerShortcut('VolumeUp', () => this.sendToRenderer('player:volumeUp'));
    this.registerShortcut('Up', () => this.sendToRenderer('player:volumeUp'));
    
    this.registerShortcut('VolumeDown', () => this.sendToRenderer('player:volumeDown'));
    this.registerShortcut('Down', () => this.sendToRenderer('player:volumeDown'));
    
    this.registerShortcut('VolumeMute', () => this.sendToRenderer('player:toggleMute'));
    
    // 音量控制
    this.registerShortcut('CommandOrControl+Up', () => this.sendToRenderer('player:fadeIn'));
    this.registerShortcut('CommandOrControl+Down', () => this.sendToRenderer('player:fadeOut'));
    this.registerShortcut('CommandOrControl+M', () => this.sendToRenderer('player:toggleMute'));
    
    // 手卡快捷键（F1-F12）
    for (let i = 1; i <= 12; i++) {
      this.registerShortcut(`F${i}`, () => this.sendToRenderer('player:playTrack', i - 1));
    }
    
    // 紧急静音
    this.registerShortcut('Escape', () => this.sendToRenderer('player:emergencyMute'));
    
    // 应用控制
    this.registerShortcut('CommandOrControl+Q', () => this.window.close());
    this.registerShortcut('CommandOrControl+R', () => this.window.reload());
  }
  
  private registerShortcut(accelerator: string, callback: () => void): void {
    try {
      // 先检查快捷键是否已被注册
      if (globalShortcut.isRegistered(accelerator)) {
        console.warn(`快捷键已被注册，跳过: ${accelerator}`);
        return;
      }
      
      const success = globalShortcut.register(accelerator, callback);
      if (success) {
        this.shortcuts.set(accelerator, callback);
        console.log(`✅ 快捷键注册成功: ${accelerator}`);
      } else {
        console.warn(`⚠️  快捷键注册失败 (可能被其他应用占用): ${accelerator}`);
      }
    } catch (error) {
      console.error(`❌ 快捷键注册异常: ${accelerator}`, error);
    }
  }
  
  private sendToRenderer(channel: string, ...args: any[]): void {
    try {
      if (this.window && !this.window.isDestroyed() && this.window.webContents) {
        this.window.webContents.send(channel, ...args);
      }
    } catch (error) {
      console.error('发送消息到渲染进程失败:', error);
    }
  }
  
  unregisterAllShortcuts(): void {
    try {
      console.log('开始清理全局快捷键...');
      
      // 逐个注销快捷键
      for (const [accelerator] of this.shortcuts) {
        try {
          if (globalShortcut.isRegistered(accelerator)) {
            globalShortcut.unregister(accelerator);
            console.log(`✅ 快捷键注销成功: ${accelerator}`);
          }
        } catch (error) {
          console.error(`❌ 快捷键注销失败: ${accelerator}`, error);
        }
      }
      
      // 清理所有快捷键
      globalShortcut.unregisterAll();
      this.shortcuts.clear();
      
      console.log('🧹 全局快捷键清理完成');
    } catch (error) {
      console.error('❌ 清理快捷键时发生错误:', error);
    }
  }
  
  isRegistered(accelerator: string): boolean {
    return globalShortcut.isRegistered(accelerator);
  }
}
