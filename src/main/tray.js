/**
 * tray.js — 系统托盘管理
 * 负责托盘图标、右键菜单（含 Import/Export/Auto-start）、单击事件
 */

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

function assetPath(name) {
  if (app.isPackaged) return path.join(process.resourcesPath, 'assets', name);
  return path.join(__dirname, '..', '..', 'assets', name);
}

let tray = null;
let menuCallbacks = null;
let menuOptions = {};

function loadTrayIcon() {
  const iconPaths = [
    assetPath('tray-icon.png'),
    assetPath('tray-icon.ico'),
  ];

  for (const iconPath of iconPaths) {
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        return icon.resize({ width: 16, height: 16 });
      }
    }
  }

  return createFallbackIcon();
}

function createFallbackIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (x >= 2 && x < 14 && y >= 2 && y < 14) {
        buf[i] = 94;     // B (BGRA) — sage green #3D6B5E → B=5E, G=6B, R=3D
        buf[i + 1] = 107;
        buf[i + 2] = 61;
        buf[i + 3] = 255;
      } else if (
        (x === 1 && y >= 3 && y < 13) ||
        (x === 14 && y >= 3 && y < 13) ||
        (y === 1 && x >= 3 && x < 13) ||
        (y === 14 && x >= 3 && x < 13)
      ) {
        buf[i] = 94;
        buf[i + 1] = 107;
        buf[i + 2] = 61;
        buf[i + 3] = 128;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function buildContextMenu(callbacks, options) {
  const { onShowWindow, onNewSnippet, onExport, onImport, onChangeDataDir, onToggleAutoStart, onQuit } = callbacks;
  const { autoStartEnabled } = options;

  return Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: onShowWindow,
    },
    {
      label: 'New Snippet',
      click: onNewSnippet,
    },
    { type: 'separator' },
    {
      label: 'Export Snippets',
      click: onExport,
    },
    {
      label: 'Import Snippets',
      click: onImport,
    },
    { type: 'separator' },
    {
      label: 'Change Data Folder...',
      click: onChangeDataDir,
    },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: !!autoStartEnabled,
      click: () => {
        if (onToggleAutoStart) onToggleAutoStart();
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: onQuit,
    },
  ]);
}

function createTray(window, callbacks, options) {
  menuCallbacks = callbacks;
  menuOptions = options || {};

  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('OneClip — Ctrl+Shift+V');

  const menu = buildContextMenu(callbacks, menuOptions);
  tray.setContextMenu(menu);

  tray.on('click', () => {
    if (window.isVisible() && window.isFocused()) {
      window.hide();
    } else {
      window.show();
      window.focus();
    }
  });

  return tray;
}

function updateTrayMenu(trayObj, newOptions) {
  if (!menuCallbacks) return;
  menuOptions = { ...menuOptions, ...newOptions };
  const menu = buildContextMenu(menuCallbacks, menuOptions);
  trayObj.setContextMenu(menu);
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, destroyTray, updateTrayMenu };
