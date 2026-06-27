/**
 * icons.js — Render user SVG to transparent PNG/ICO via hidden BrowserWindow + canvas.
 * Single source, unified look for app icon and tray icon.
 * Only change: currentColor → sage green (#3D6B5E). Nothing else.
 */

const { BrowserWindow, nativeImage, app } = require('electron');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '..', '..', 'assets');
try { fs.writeFileSync(path.join(ASSETS_DIR, '.icon-debug.txt'), 'module loaded, dir=' + ASSETS_DIR); } catch(e) {}
const USER_SVG = 'hugeicons--quill-write-02.svg';

async function ensureIcons() {
  const svgPath = path.join(ASSETS_DIR, USER_SVG);
  if (!fs.existsSync(svgPath)) return;

  const svgMtime = fs.statSync(svgPath).mtimeMs;
  const needsRebuild = ['icon.png', 'icon.ico', 'tray-icon.png'].some(f => {
    const p = path.join(ASSETS_DIR, f);
    return !fs.existsSync(p) || fs.statSync(p).mtimeMs < svgMtime;
  });
  if (!needsRebuild) return;

  try {
    const png256 = await renderSVG(svgPath, 256);
    fs.writeFileSync(path.join(ASSETS_DIR, 'icon.png'), Buffer.from(png256, 'base64'));

    // Multi-resolution ICO
    const pngData = Buffer.from(png256, 'base64');
    const img = nativeImage.createFromBuffer(pngData);
    const sizes = [16, 32, 48, 256];
    const pngs = sizes.map(sz => Buffer.from(img.resize({ width: sz, height: sz }).toPNG()));
    fs.writeFileSync(path.join(ASSETS_DIR, 'icon.ico'), buildICO(pngs, sizes));

    // Tray icon: resize app icon to 64px
    const appImg = nativeImage.createFromBuffer(fs.readFileSync(path.join(ASSETS_DIR, 'icon.png')));
    const trayImg = appImg.resize({ width: 64, height: 64 });
    fs.writeFileSync(path.join(ASSETS_DIR, 'tray-icon.png'), Buffer.from(trayImg.toPNG()));
  } catch (err) {
    console.error('Icons:', err.message);
  }
}

async function renderSVG(svgPath, size) {
  const svgRaw = fs.readFileSync(svgPath, 'utf-8');
  const colored = svgRaw.replace(/currentColor/g, '#3D6B5E');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
    svg{display:block;width:100%;height:100%}
  </style></head><body>${colored}</body></html>`;
  return renderViaCanvas(html, size);
}

async function renderTraySVG(svgPath, size) {
  const svgRaw = fs.readFileSync(svgPath, 'utf-8');
  const colored = svgRaw.replace(/currentColor/g, '#FFFFFF');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
    body{background:#3D6B5E;border-radius:50%}
    svg{display:block;width:64%;height:64%;margin:18% auto}
  </style></head><body>${colored}</body></html>`;
  return renderViaCanvas(html, size);
}

function renderViaCanvas(html, size) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: size, height: size,
      show: false, frame: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false },
    });

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    win.loadURL(dataUrl);

    const timer = setTimeout(() => { try { win.close(); } catch (_) {} reject(new Error('timeout')); }, 8000);

    win.webContents.on('did-finish-load', async () => {
      try {
        await delay(500);
        const dataUrl = await win.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const svg = document.querySelector('svg');
            const svgData = new XMLSerializer().serializeToString(svg);
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = ${size}; c.height = ${size};
              const ctx = c.getContext('2d');
              ctx.drawImage(img, 0, 0);
              resolve(c.toDataURL('image/png'));
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
          })
        `);
        clearTimeout(timer);
        win.close();
        resolve(dataUrl.split(',')[1]);
      } catch (e) {
        clearTimeout(timer);
        try { win.close(); } catch (_) {}
        reject(e);
      }
    });

    win.webContents.on('did-fail-load', () => {
      clearTimeout(timer);
      try { win.close(); } catch (_) {}
      reject(new Error('load failed'));
    });
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══ ICO wrapper ═══

function buildICO(pngs, pngSizes) {
  // pngs: array of PNG Buffers
  const sizes = pngSizes || [16, 32, 48, 256];
  const count = pngs.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const bufs = [];

  // ICO header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  for (let i = 0; i < count; i++) {
    const sz = sizes[i];
    const v = sz >= 256 ? 0 : sz;
    const entryOff = 6 + i * 16;
    header.writeUInt8(v, entryOff);
    header.writeUInt8(v, entryOff + 1);
    header.writeUInt8(0, entryOff + 2);
    header.writeUInt8(0, entryOff + 3);
    header.writeUInt16LE(0, entryOff + 4);
    header.writeUInt16LE(0, entryOff + 6);
    header.writeUInt32LE(pngs[i].length, entryOff + 8);
    header.writeUInt32LE(offset, entryOff + 12);
    offset += pngs[i].length;
  }

  const result = Buffer.alloc(offset);
  header.copy(result, 0);
  let pos = headerSize;
  for (const p of pngs) {
    p.copy(result, pos);
    pos += p.length;
  }
  return result;
}

module.exports = { ensureIcons };
