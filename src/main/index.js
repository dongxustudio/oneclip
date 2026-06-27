/**
 * index.js — 主进程入口
 * 负责：单实例检测、窗口生命周期、托盘管理、全局热键、应用退出
 */

const { app, BrowserWindow, Menu, dialog, globalShortcut } = require('electron');
const path = require('path');
const { createTray, destroyTray, updateTrayMenu } = require('./tray');
const { registerHandlers } = require('./ipc-handlers');
const { registerOSHotkey, unregisterOSHotkey } = require('./shortcut');
const { ensureIcons } = require('./icons');
const storage = require('./storage');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ═══════════════════════════════════════════
// 窗口管理
// ═══════════════════════════════════════════

async function createWindow() {
  let settings = {};
  try {
    settings = await storage.loadSettings();
  } catch (_) {}

  mainWindow = new BrowserWindow({
    icon: app.isPackaged ? path.join(process.resourcesPath, 'assets', 'icon.png') : path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    width: settings.window_width || 600,
    height: settings.window_height || 400,
    x: settings.window_x !== null ? settings.window_x : undefined,
    y: settings.window_y !== null ? settings.window_y : undefined,
    minWidth: 420,
    minHeight: 320,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    alwaysOnTop: settings.always_on_top || false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // ═══ 右键上下文菜单（复制/粘贴/剪切） ═══
  mainWindow.webContents.on('context-menu', (event, params) => {
    const { editFlags } = params;
    const ctxMenu = Menu.buildFromTemplate([
      {
        label: 'Cut',
        accelerator: 'Ctrl+X',
        role: 'cut',
        enabled: editFlags.canCut,
      },
      {
        label: 'Copy',
        accelerator: 'Ctrl+C',
        role: 'copy',
        enabled: editFlags.canCopy,
      },
      {
        label: 'Paste',
        accelerator: 'Ctrl+V',
        role: 'paste',
        enabled: editFlags.canPaste,
      },
      { type: 'separator' },
      {
        label: 'Select All',
        accelerator: 'Ctrl+A',
        role: 'selectAll',
        enabled: editFlags.canSelectAll,
      },
    ]);
    ctxMenu.popup();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      saveWindowBounds();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('resized', debounce(saveWindowBounds, 300));
  mainWindow.on('moved', debounce(saveWindowBounds, 300));
}

function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function toggleWindow() {
  if (mainWindow) {
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      showWindow();
    }
  }
}

async function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  try {
    await storage.saveSettings({
      window_width: bounds.width,
      window_height: bounds.height,
      window_x: bounds.x,
      window_y: bounds.y,
    });
  } catch (_) {}
}

// ═══════════════════════════════════════════
// 全局热键
// ═══════════════════════════════════════════

function registerGlobalShortcut() {
  const registered = globalShortcut.register('CommandOrControl+Shift+V', () => {
    toggleWindow();
  });
  return registered;
}

function unregisterGlobalShortcut() {
  globalShortcut.unregisterAll();
}

// ═══════════════════════════════════════════
// 托盘回调
// ═══════════════════════════════════════════

function onShowWindow() {
  showWindow();
}

function onNewSnippet() {
  showWindow();
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('open-editor');
  }
}

function onQuit() {
  isQuitting = true;
  saveWindowBounds();
  app.quit();
}

async function onExport() {
  showWindow();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Snippets',
    defaultPath: 'oneclip-snippets.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (result.canceled) return;
  const count = await storage.exportToFile(result.filePath);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('toast', { message: `Exported ${count} snippet(s)`, type: 'success' });
  }
}

async function onImport() {
  showWindow();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Snippets',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return;

  try {
    const added = await storage.importFromFile(result.filePaths[0]);
    if (mainWindow && mainWindow.webContents) {
      if (added > 0) {
        mainWindow.webContents.send('snippets-changed');
        mainWindow.webContents.send('toast', { message: `Imported ${added} snippet(s)`, type: 'success' });
      } else {
        mainWindow.webContents.send('toast', { message: 'No new snippets to import', type: 'info' });
      }
    }
  } catch (err) {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('toast', { message: 'Import failed: ' + err.message, type: 'error' });
    }
  }
}

async function onToggleAutoStart() {
  const current = app.getLoginItemSettings().openAtLogin;
  const newState = !current;
  app.setLoginItemSettings({ openAtLogin: newState });
  // 更新托盘菜单勾选状态
  if (tray) {
    updateTrayMenu(tray, { autoStartEnabled: newState });
  }
  return newState;
}

async function onChangeDataDir() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Data Folder',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return;
  try {
    await storage.setCustomDataDir(result.filePaths[0]);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('data-dir-changed');
      mainWindow.webContents.send('toast', { message: 'Data folder updated — ' + result.filePaths[0], type: 'success' });
    }
  } catch (err) {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('toast', { message: 'Failed to change data folder: ' + err.message, type: 'error' });
    }
  }
}

// ═══════════════════════════════════════════
// 应用生命周期
// ═══════════════════════════════════════════

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(async () => {
    storage.init(app.getPath('userData'));
    registerHandlers();
    // 同步等待图标生成完成
    try {
      await ensureIcons();
      console.log('Icon generation complete');
    } catch (err) {
      console.error('Icon generation failed:', err);
    }

    // OS-level hotkey: creates Start Menu shortcut with Ctrl+Shift+V
    // so the app can be launched even when not running
    registerOSHotkey();

    await createWindow();

    // 注册全局热键
    registerGlobalShortcut();

    // 读取开机自启状态
    const autoStart = app.getLoginItemSettings().openAtLogin;

    tray = createTray(mainWindow, {
      onShowWindow,
      onNewSnippet,
      onExport,
      onImport,
      onChangeDataDir,
      onToggleAutoStart,
      onQuit,
    }, { autoStartEnabled: autoStart });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    saveWindowBounds();
    unregisterGlobalShortcut();
    destroyTray(tray);
  });

  app.on('activate', () => {
    showWindow();
  });

  app.on('window-all-closed', () => {});
}

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
