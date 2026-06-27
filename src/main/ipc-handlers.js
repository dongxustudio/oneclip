/**
 * ipc-handlers.js — IPC 处理器注册
 */

const { ipcMain, clipboard, BrowserWindow, app, dialog, globalShortcut } = require('electron');
const storage = require('./storage');

function registerHandlers() {
  // ═══ 片段 CRUD ═══

  ipcMain.handle('get-snippets', async () => storage.loadSnippets());
  ipcMain.handle('add-snippet', async (_e, t, c, g) => storage.addSnippet(t, c, g));
  ipcMain.handle('update-snippet', async (_e, id, t, c, g) => storage.updateSnippet(id, t, c, g));
  ipcMain.handle('delete-snippet', async (_e, id) => storage.deleteSnippet(id));
  ipcMain.handle('search-snippets', async (_e, kw) => storage.searchSnippets(kw));

  // ═══ 分组 ═══

  ipcMain.handle('get-groups', async () => storage.getGroups());

  ipcMain.handle('add-group', async (_e, name) => storage.addGroup(name));

  ipcMain.handle('rename-group', async (_e, oldName, newName) => storage.renameGroup(oldName, newName));

  ipcMain.handle('delete-group', async (_e, name, targetGroup) => {
    const result = await storage.deleteGroup(name, targetGroup);
    return result;
  });

  // ═══ 排序同步 ═══

  ipcMain.handle('sync-order', async (_e, orderedState) => {
    await storage.syncOrder(orderedState);
  });

  ipcMain.handle('save-group-order', async (_e, order) => {
    await storage.saveGroupOrder(order);
  });

  // ═══ 剪贴板 ═══

  ipcMain.handle('copy-to-clipboard', (_e, text) => {
    try { clipboard.writeText(text); return true; }
    catch (err) { console.error('clipboard.writeText failed:', err); return false; }
  });

  // ═══ 设置 ═══

  ipcMain.handle('get-settings', async () => storage.loadSettings());
  ipcMain.handle('save-settings', async (_e, s) => storage.saveSettings(s));

  // ═══ 窗口控制 ═══

  ipcMain.handle('minimize-window', () => {
    const win = BrowserWindow.getFocusedWindow(); if (win) win.minimize();
  });
  ipcMain.handle('hide-window', () => {
    const win = BrowserWindow.getFocusedWindow(); if (win) win.hide();
  });

  // ═══ 窗口置顶 ═══

  ipcMain.handle('toggle-always-on-top', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return false;
    const s = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(s);
    await storage.saveSettings({ always_on_top: s });
    return s;
  });
  ipcMain.handle('get-always-on-top', () => {
    const win = BrowserWindow.getFocusedWindow();
    return win ? win.isAlwaysOnTop() : false;
  });

  // ═══ 开机自启 ═══

  ipcMain.handle('get-auto-start', () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle('toggle-auto-start', async (_e, enable) => {
    app.setLoginItemSettings({ openAtLogin: enable });
    return enable;
  });

  // ═══ 全局热键 ═══

  ipcMain.handle('register-global-shortcut', () => {
    return globalShortcut.register('CommandOrControl+Shift+V', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isVisible() && win.isFocused()) { win.hide(); }
        else { win.show(); win.focus(); }
      }
    });
  });

  // ═══ 导入导出 ═══

  ipcMain.handle('export-snippets', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Snippets',
      defaultPath: 'oneclip-snippets.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });
    if (result.canceled) return { canceled: true };
    const count = await storage.exportToFile(result.filePath);
    return { canceled: false, count };
  });

  ipcMain.handle('import-snippets', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Snippets',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    try {
      const added = await storage.importFromFile(result.filePaths[0]);
      return { canceled: false, added };
    } catch (err) {
      return { canceled: false, added: 0, error: err.message };
    }
  });

  // ═══ 数据目录 ═══

  ipcMain.handle('get-data-dir', () => storage.getDataDir());

  ipcMain.handle('change-data-dir', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose Data Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    try {
      await storage.setCustomDataDir(result.filePaths[0]);
      return { canceled: false, path: result.filePaths[0] };
    } catch (err) {
      return { canceled: false, error: err.message };
    }
  });
}

module.exports = { registerHandlers };
