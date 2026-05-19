import { ipcMain, BrowserWindow } from 'electron';
// import { SerialPort } from 'serialport';
// import { ReadlineParser } from '@serialport/parser-readline';

interface HandCardDevice {
  id: string;
  name: string;
  type: 'bluetooth' | 'usb' | 'hid';
  status: 'connected' | 'disconnected' | 'connecting';
  batteryLevel?: number;
}

interface HandCardCommand {
  type: 'play' | 'pause' | 'next' | 'previous' | 'volume' | 'mute';
  value?: number;
}

/**
 * 手卡管理器 - 处理USB/蓝牙手卡设备的连接和控制
 * 由于手卡是通过USB接收器连接，主要监听HID设备和键盘事件
 */
export class HandCardManager {
  private mainWindow: BrowserWindow | null = null;
  private isConnected = false;
  private currentDevice: HandCardDevice | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastActivityTime: number = 0;
  private mockConnected = false; // 模拟连接状态

  constructor() {
    this.setupIpcHandlers();
    this.startDeviceMonitoring();
  }

  /**
   * 设置主窗口引用
   */
  public setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
    this.setupKeyboardListeners();
  }

  /**
   * 设置IPC处理器
   */
  private setupIpcHandlers() {
    // 获取手卡状态
    ipcMain.handle('handcard:getStatus', () => {
      return {
        isConnected: this.isConnected,
        device: this.currentDevice
      };
    });

    // 手动搜索设备
    ipcMain.handle('handcard:scan', async () => {
      return await this.scanForDevices();
    });

    // 连接设备
    ipcMain.handle('handcard:connect', async (event, deviceId: string) => {
      return await this.connectDevice(deviceId);
    });

    // 断开设备
    ipcMain.handle('handcard:disconnect', async () => {
      return await this.disconnectDevice();
    });
  }

  /**
   * 设置键盘监听器 - 监听特定的组合键
   */
  private setupKeyboardListeners() {
    if (!this.mainWindow) return;

    // 监听来自手卡的特定按键事件
    this.mainWindow.webContents.on('before-input-event', (event, input) => {
      // 如果检测到特定的按键组合（手卡通常发送特定的键码）
      if (this.isHandCardKey(input)) {
        event.preventDefault();
        this.handleHandCardKey(input);
        
        // 更新活动时间
        this.lastActivityTime = Date.now();
        
        // 如果之前未连接，自动标记为已连接
        if (!this.isConnected) {
          this.autoDetectDevice();
        }
      }
    });
  }

  /**
   * 判断是否是手卡按键
   */
  private isHandCardKey(input: any): boolean {
    // 手卡通常使用F13-F24或特殊组合键
    // 也可能使用媒体键
    const handCardKeys = [
      'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
      'MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 
      'AudioVolumeMute', 'AudioVolumeUp', 'AudioVolumeDown'
    ];
    
    return handCardKeys.includes(input.key) || 
           (input.control && input.shift && input.alt); // 特殊组合键
  }

  /**
   * 处理手卡按键
   */
  private handleHandCardKey(input: any) {
    let command: HandCardCommand | null = null;

    switch (input.key) {
      case 'MediaPlayPause':
      case 'F13':
        command = { type: 'pause' };
        break;
      case 'MediaNextTrack':
      case 'F14':
        command = { type: 'next' };
        break;
      case 'MediaPreviousTrack':
      case 'F15':
        command = { type: 'previous' };
        break;
      case 'AudioVolumeMute':
      case 'F16':
        command = { type: 'mute' };
        break;
      case 'AudioVolumeUp':
      case 'F17':
        command = { type: 'volume', value: 0.1 }; // 增加10%
        break;
      case 'AudioVolumeDown':
      case 'F18':
        command = { type: 'volume', value: -0.1 }; // 减少10%
        break;
    }

    if (command) {
      this.executeCommand(command);
    }
  }

  /**
   * 开始设备监控
   */
  private startDeviceMonitoring() {
    // 每5秒检查一次USB设备
    this.checkInterval = setInterval(async () => {
      await this.checkDeviceConnection();
    }, 5000);

    // 立即检查一次
    this.checkDeviceConnection();
  }

  /**
   * 检查设备连接
   */
  private async checkDeviceConnection() {
    try {
      // 检查是否有USB HID设备连接
      const hasUSBDevice = await this.checkUSBDevices();
      
      // 检查最近是否有手卡活动（30秒内）
      const hasRecentActivity = (Date.now() - this.lastActivityTime) < 30000;
      
      if ((hasUSBDevice || hasRecentActivity) && !this.isConnected) {
        console.log('检测到手卡设备活动');
        this.autoDetectDevice();
      } else if (!hasUSBDevice && !hasRecentActivity && this.isConnected) {
        // 超过30秒没有活动，认为设备已断开
        console.log('手卡设备已断开连接');
        this.handleDisconnection();
      }
    } catch (error) {
      console.error('检查设备连接失败:', error);
    }
  }

  /**
   * 检查USB设备
   */
  private async checkUSBDevices(): Promise<boolean> {
    try {
      // 在Electron中，我们可以通过usb模块检查USB设备
      // 但为了简化，这里返回模拟值
      // 实际实现中可以使用 'usb' 或 'node-hid' 模块
      
      // 模拟：检查是否有特定的USB设备
      // 常见的无线接收器VID/PID
      const commonReceivers = [
        { vid: 0x046d, pid: 0xc52b }, // Logitech Unifying Receiver
        { vid: 0x1ea7, pid: 0x0064 }, // 2.4G Wireless Device
        { vid: 0x0461, pid: 0x0010 }, // Generic USB Receiver
      ];
      
      // 这里简化处理，返回模拟值
      return this.mockConnected;
    } catch (error) {
      console.error('检查USB设备失败:', error);
      return false;
    }
  }

  /**
   * 自动检测并连接设备
   */
  private autoDetectDevice() {
    if (this.isConnected) return;
    
    console.log('自动连接手卡设备');
    
    this.isConnected = true;
    this.currentDevice = {
      id: 'usb-receiver-001',
      name: '无线手卡接收器',
      type: 'usb',
      status: 'connected'
    };

    // 通知渲染进程
    this.notifyConnectionStatus(true);
  }

  /**
   * 执行命令
   */
  private executeCommand(command: HandCardCommand) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn('主窗口不可用，无法执行命令');
      return;
    }

    console.log('执行手卡命令:', command);

    // 发送命令到渲染进程
    switch (command.type) {
      case 'play':
        this.mainWindow.webContents.send('handcard:command', { action: 'play' });
        break;
      case 'pause':
        this.mainWindow.webContents.send('handcard:command', { action: 'pause' });
        break;
      case 'next':
        this.mainWindow.webContents.send('handcard:command', { action: 'next' });
        break;
      case 'previous':
        this.mainWindow.webContents.send('handcard:command', { action: 'previous' });
        break;
      case 'volume':
        this.mainWindow.webContents.send('handcard:command', { 
          action: 'volume', 
          value: command.value 
        });
        break;
      case 'mute':
        this.mainWindow.webContents.send('handcard:command', { action: 'mute' });
        break;
    }
  }

  /**
   * 处理断开连接
   */
  private handleDisconnection() {
    this.isConnected = false;
    this.currentDevice = null;
    this.mockConnected = false;

    // 通知渲染进程
    this.notifyConnectionStatus(false);
  }

  /**
   * 通知连接状态
   */
  private notifyConnectionStatus(connected: boolean) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('handcard:status', {
        connected,
        device: this.currentDevice
      });
    }
  }

  /**
   * 扫描设备（模拟）
   */
  private async scanForDevices(): Promise<HandCardDevice[]> {
    // 模拟扫描结果
    return [
      {
        id: 'usb-receiver-001',
        name: '无线手卡接收器',
        type: 'usb',
        status: this.isConnected ? 'connected' : 'disconnected'
      }
    ];
  }

  /**
   * 连接设备（模拟）
   */
  private async connectDevice(deviceId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 模拟连接
      this.mockConnected = true;
      this.autoDetectDevice();
      return { success: true };
    } catch (error) {
      console.error('连接设备失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '未知错误' 
      };
    }
  }

  /**
   * 断开设备
   */
  private async disconnectDevice(): Promise<{ success: boolean }> {
    try {
      this.handleDisconnection();
      return { success: true };
    } catch (error) {
      console.error('断开设备失败:', error);
      return { success: false };
    }
  }

  /**
   * 清理资源
   */
  public cleanup() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.handleDisconnection();
  }
}

// 导出单例
export const handCardManager = new HandCardManager();