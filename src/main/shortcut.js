/**
 * shortcut.js — OS-level hotkey registration via Windows .lnk
 *
 * Creates a Start Menu shortcut with Ctrl+Shift+V bound as shortcut key.
 * Windows listens globally; no background process needed.
 * Idempotent — checks existence and target path on each call, skips if correct.
 */

const { app } = require('electron');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SHORTCUT_NAME = 'OneClip.lnk';
const HOTKEY = 'Ctrl+Shift+V';

function getShortcutPath() {
  const programsDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  return path.join(programsDir, SHORTCUT_NAME);
}

function getTargetInfo() {
  if (app.isPackaged) {
    return {
      target: process.execPath,
      args: '',
      cwd: path.dirname(process.execPath),
    };
  }
  // Dev mode: launch electron with the project dir
  return {
    target: process.execPath,
    args: '.',
    cwd: path.resolve(app.getAppPath()),
  };
}

function ps(command) {
  return spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    windowsHide: true,
    encoding: 'utf-8',
    timeout: 5000,
  });
}

function registerOSHotkey() {
  if (process.platform !== 'win32') return false;

  const shortcutPath = getShortcutPath();
  const info = getTargetInfo();

  // Check if existing shortcut is still valid
  if (fs.existsSync(shortcutPath)) {
    try {
      const existing = readShortcut(shortcutPath);
      if (existing && existing.target === info.target && existing.args === info.args) {
        return true; // already correct
      }
    } catch (_) { /* corrupt — recreate */ }
  }

  // Create or update
  try {
    writeShortcut(shortcutPath, info);
    return true;
  } catch (err) {
    console.error('Failed to register OS hotkey:', err.message);
    return false;
  }
}

function unregisterOSHotkey() {
  if (process.platform !== 'win32') return;
  try {
    const p = getShortcutPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}

function writeShortcut(shortcutPath, info) {
  const script =
    "$ws=New-Object -ComObject WScript.Shell;" +
    "$s=$ws.CreateShortcut('" + escPS(shortcutPath) + "');" +
    "$s.TargetPath='" + escPS(info.target) + "';" +
    "$s.WorkingDirectory='" + escPS(info.cwd) + "';" +
    "$s.Arguments='" + escPS(info.args) + "';" +
    "$s.Hotkey='" + HOTKEY + "';" +
    "$s.Save()";
  const r = ps(script);
  if (r.error) throw r.error;
  if (r.stderr && r.stderr.trim()) throw new Error(r.stderr.trim());
}

function readShortcut(shortcutPath) {
  const script =
    "$ws=New-Object -ComObject WScript.Shell;" +
    "$s=$ws.CreateShortcut('" + escPS(shortcutPath) + "');" +
    "Write-Output ($s.TargetPath + '|' + $s.Arguments)";
  const r = ps(script);
  if (r.error) throw r.error;
  const [target, args] = (r.stdout || '').trim().split('|');
  return { target: target || '', args: args || '' };
}

function escPS(s) {
  return s.replace(/'/g, "''");
}

module.exports = { registerOSHotkey, unregisterOSHotkey };
