/**
 * storage.js — 数据持久化层
 * JSON 读写、片段 CRUD、分组、排序、同步、导入导出
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = 'data.json';
const BACKUP_FILE = 'data.json.bak';
const TMP_FILE = 'data.tmp';

const DEFAULT_DATA = {
  snippets: [],
  groups: [],
  settings: {
    window_width: 600,
    window_height: 400,
    window_x: null,
    window_y: null,
    always_on_top: false,
    group_order: [],
  },
};

const POINTER_FILE = 'datadir.txt';

let dataDir = null;
let defaultDataDir = null;

function init(userDataPath) {
  defaultDataDir = userDataPath;
  // 检查指针文件 → 使用自定义路径；否则用默认路径
  const pointerPath = path.join(defaultDataDir, POINTER_FILE);
  try {
    const customPath = fs.readFileSync(pointerPath, 'utf-8').trim();
    if (customPath && fs.existsSync(customPath)) {
      dataDir = customPath;
      return;
    }
  } catch (_) {}
  dataDir = defaultDataDir;
}

function getDataPath() {
  if (!dataDir) throw new Error('storage.init() must be called first');
  return path.join(dataDir, DATA_FILE);
}

function getDataDir() {
  return dataDir;
}

async function setCustomDataDir(newPath) {
  if (!newPath || !fs.existsSync(newPath)) {
    throw new Error('Directory does not exist');
  }

  const newDataPath = path.join(newPath, DATA_FILE);
  const oldDataPath = path.join(dataDir, DATA_FILE);

  // 如果新位置还没有 data.json，把当前数据迁移过去
  if (!fs.existsSync(newDataPath) && fs.existsSync(oldDataPath)) {
    await fsp.copyFile(oldDataPath, newDataPath);
  } else if (!fs.existsSync(newDataPath)) {
    // 空目录：初始化
    await fsp.writeFile(newDataPath, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
  }

  // 写指针文件
  const pointerPath = path.join(defaultDataDir, POINTER_FILE);
  await fsp.writeFile(pointerPath, newPath, 'utf-8');

  // 切换
  dataDir = newPath;
}

async function loadData() {
  const dataPath = getDataPath();
  try {
    const raw = await fsp.readFile(dataPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.snippets)) data.snippets = [];
    if (!Array.isArray(data.groups)) data.groups = [];
    if (!data.settings) data.settings = { ...DEFAULT_DATA.settings };
    if (!data.settings.group_order) data.settings.group_order = [];
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') {
      const data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      await saveDataSafe(data);
      return data;
    }
    try { await fsp.copyFile(dataPath, path.join(dataDir, BACKUP_FILE)); } catch (_) {}
    const data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    await saveDataSafe(data);
    return data;
  }
}

async function saveDataSafe(data) {
  const dataPath = getDataPath();
  const tmpPath = path.join(dataDir, TMP_FILE);
  const bakPath = path.join(dataDir, BACKUP_FILE);
  try { await fsp.copyFile(dataPath, bakPath); } catch (_) {}
  const json = JSON.stringify(data, null, 2);
  await fsp.writeFile(tmpPath, json, 'utf-8');
  await fsp.rename(tmpPath, dataPath);
}

// ═══ 片段 CRUD ═══

async function loadSnippets() {
  const data = await loadData();
  return data.snippets;
}

async function addSnippet(title, content, group) {
  const data = await loadData();
  const snippet = {
    id: crypto.randomUUID(),
    title: (title && title.trim()) || content.substring(0, 20) + '...',
    content: content,
    group: (group && group.trim()) || '',
    created_at: new Date().toISOString(),
  };
  data.snippets.push(snippet);
  await saveDataSafe(data);
  return snippet;
}

async function updateSnippet(id, title, content, group) {
  const data = await loadData();
  const index = data.snippets.findIndex(s => s.id === id);
  if (index === -1) return false;
  data.snippets[index].title = (title && title.trim()) || content.substring(0, 20) + '...';
  data.snippets[index].content = content;
  data.snippets[index].group = (group && group.trim()) || '';
  await saveDataSafe(data);
  return true;
}

async function deleteSnippet(id) {
  const data = await loadData();
  const index = data.snippets.findIndex(s => s.id === id);
  if (index === -1) return false;
  data.snippets.splice(index, 1);
  await saveDataSafe(data);
  return true;
}

async function searchSnippets(keyword) {
  const data = await loadData();
  if (!keyword || !keyword.trim()) return data.snippets;
  const kw = keyword.toLowerCase().trim();
  return data.snippets.filter(s =>
    s.title.toLowerCase().includes(kw) ||
    s.content.toLowerCase().includes(kw) ||
    ((s.group || '').trim().toLowerCase().includes(kw))
  );
}

// ═══ 分组 ═══

async function getGroups() {
  const data = await loadData();
  const groups = new Set();
  // Independent groups (may be empty)
  for (const g of data.groups) {
    if (g && g.trim()) groups.add(g.trim());
  }
  // Groups derived from snippets
  let hasUncategorized = false;
  for (const s of data.snippets) {
    if (s.group && s.group.trim()) {
      groups.add(s.group.trim());
    } else {
      hasUncategorized = true;
    }
  }
  const result = Array.from(groups).sort();
  // Append Uncategorized at the end if any snippets have no group
  if (hasUncategorized) result.push('Uncategorized');
  return result;
}

// ═══ 独立分组管理 ═══

async function addGroup(name) {
  const trimmed = (name && name.trim()) || '';
  if (!trimmed) return false;
  const data = await loadData();
  if (data.groups.includes(trimmed)) return false; // 去重
  data.groups.push(trimmed);
  await saveDataSafe(data);
  return true;
}

async function deleteGroup(name, targetGroup) {
  const trimmed = (name && name.trim()) || '';
  if (!trimmed) return { moved: 0, deleted: 0 };
  const target = (targetGroup && targetGroup.trim()) || '';
  const deleteSnippets = target === '__delete__';

  const data = await loadData();

  // 从独立分组列表中移除
  const idx = data.groups.indexOf(trimmed);
  if (idx !== -1) data.groups.splice(idx, 1);

  let moved = 0;
  let deleted = 0;
  for (let i = data.snippets.length - 1; i >= 0; i--) {
    if ((data.snippets[i].group || '').trim() === trimmed) {
      if (deleteSnippets) {
        data.snippets.splice(i, 1);
        deleted++;
      } else {
        data.snippets[i].group = target;
        moved++;
      }
    }
  }

  await saveDataSafe(data);
  return { moved, deleted };
}

async function renameGroup(oldName, newName) {
  const oldTrimmed = (oldName || '').trim();
  const newTrimmed = (newName || '').trim();
  if (!oldTrimmed || !newTrimmed || oldTrimmed === newTrimmed) return false;

  const data = await loadData();

  // 检查新名字是否已存在
  if (data.groups.includes(newTrimmed)) return false;

  // 替换 groups 数组中的名称
  const idx = data.groups.indexOf(oldTrimmed);
  if (idx !== -1) data.groups[idx] = newTrimmed;

  // 更新所有 snippet 的分组名
  for (const s of data.snippets) {
    if ((s.group || '').trim() === oldTrimmed) {
      s.group = newTrimmed;
    }
  }

  // 更新 group_order
  if (data.settings.group_order) {
    const oi = data.settings.group_order.indexOf(oldTrimmed);
    if (oi !== -1) data.settings.group_order[oi] = newTrimmed;
  }

  await saveDataSafe(data);
  return true;
}

// ═══ 排序同步 ═══

async function syncOrder(orderedState) {
  // orderedState: [{ id, group }, ...] in desired DOM order
  const data = await loadData();
  const snippetMap = {};
  for (const s of data.snippets) {
    snippetMap[s.id] = s;
  }

  const newSnippets = [];
  for (const item of orderedState) {
    const snippet = snippetMap[item.id];
    if (snippet) {
      snippet.group = item.group || '';
      newSnippets.push(snippet);
      delete snippetMap[item.id];
    }
  }

  // Append any remaining (shouldn't happen, but safe)
  for (const key in snippetMap) {
    newSnippets.push(snippetMap[key]);
  }

  data.snippets = newSnippets;
  await saveDataSafe(data);
}

async function saveGroupOrder(order) {
  const data = await loadData();
  data.settings.group_order = order;
  await saveDataSafe(data);
}

// ═══ 导入导出 ═══

async function exportToFile(filePath) {
  const data = await loadData();
  const exportData = {
    version: 1,
    exported_at: new Date().toISOString(),
    snippets: data.snippets,
  };
  await fsp.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
  return data.snippets.length;
}

async function importFromFile(filePath) {
  const raw = await fsp.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const incoming = Array.isArray(parsed) ? parsed : (parsed.snippets || []);
  if (!Array.isArray(incoming) || incoming.length === 0) return 0;

  const data = await loadData();
  const existingIds = new Set(data.snippets.map(s => s.id));
  let added = 0;

  for (const s of incoming) {
    if (existingIds.has(s.id)) continue;
    data.snippets.push({
      id: s.id || crypto.randomUUID(),
      title: s.title || '',
      content: s.content || '',
      group: (s.group && s.group.trim()) || '',
      created_at: s.created_at || new Date().toISOString(),
    });
    existingIds.add(data.snippets[data.snippets.length - 1].id);
    added++;
  }

  if (added > 0) await saveDataSafe(data);
  return added;
}

// ═══ 设置 ═══

async function loadSettings() {
  const data = await loadData();
  return data.settings || DEFAULT_DATA.settings;
}

async function saveSettings(settings) {
  const data = await loadData();
  data.settings = { ...data.settings, ...settings };
  await saveDataSafe(data);
}

module.exports = {
  init,
  loadSnippets,
  addSnippet,
  updateSnippet,
  deleteSnippet,
  searchSnippets,
  getGroups,
  addGroup,
  deleteGroup,
  renameGroup,
  syncOrder,
  saveGroupOrder,
  exportToFile,
  importFromFile,
  loadSettings,
  saveSettings,
  getDataDir,
  setCustomDataDir,
};
