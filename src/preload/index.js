/**
 * preload/index.js — 安全桥接层
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 片段 CRUD
  getSnippets: () => ipcRenderer.invoke('get-snippets'),
  addSnippet: (t, c, g) => ipcRenderer.invoke('add-snippet', t, c, g),
  updateSnippet: (id, t, c, g) => ipcRenderer.invoke('update-snippet', id, t, c, g),
  deleteSnippet: (id) => ipcRenderer.invoke('delete-snippet', id),
  searchSnippets: (kw) => ipcRenderer.invoke('search-snippets', kw),

  // 分组
  getGroups: () => ipcRenderer.invoke('get-groups'),
  addGroup: (name) => ipcRenderer.invoke('add-group', name),
  deleteGroup: (name, targetGroup) => ipcRenderer.invoke('delete-group', name, targetGroup),
  renameGroup: (oldName, newName) => ipcRenderer.invoke('rename-group', oldName, newName),

  // 排序同步
  syncOrder: (state) => ipcRenderer.invoke('sync-order', state),
  saveGroupOrder: (order) => ipcRenderer.invoke('save-group-order', order),

  // 剪贴板
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),

  // 置顶
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),

  // 开机自启
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  toggleAutoStart: (enable) => ipcRenderer.invoke('toggle-auto-start', enable),

  // 热键
  registerGlobalShortcut: () => ipcRenderer.invoke('register-global-shortcut'),

  // 导入导出
  exportSnippets: () => ipcRenderer.invoke('export-snippets'),
  importSnippets: () => ipcRenderer.invoke('import-snippets'),

  // 数据目录
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  changeDataDir: () => ipcRenderer.invoke('change-data-dir'),

  // 事件
  onOpenEditor: (cb) => { ipcRenderer.on('open-editor', (_e, ...a) => cb(...a)); },
  removeOpenEditorListener: () => { ipcRenderer.removeAllListeners('open-editor'); },
  onSnippetsChanged: (cb) => { ipcRenderer.on('snippets-changed', (_e, ...a) => cb(...a)); },
  removeSnippetsChangedListener: () => { ipcRenderer.removeAllListeners('snippets-changed'); },
  onDataDirChanged: (cb) => { ipcRenderer.on('data-dir-changed', (_e, ...a) => cb(...a)); },
  onToast: (cb) => { ipcRenderer.on('toast', (_e, ...a) => cb(...a)); },
});
