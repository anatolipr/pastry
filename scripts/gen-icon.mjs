#!/usr/bin/env node
/**
 * Generates a scissors app icon (.icns) with red handles.
 * Requires only Node.js built-ins + macOS iconutil/sips.
 * Writes PNGs using a hand-rolled PNG encoder, then bundles with iconutil.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import zlib from 'zlib';

// ---------------------------------------------------------------------------
// Minimal PNG encoder (raw RGBA → PNG file, no dependencies)
// ---------------------------------------------------------------------------
function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.allocUnsafe(4); crcVal.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function encodePNG(width, height, rgbaData) {
  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw image data: prepend filter byte 0 for each row
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter type: None
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw.push(rgbaData[i], rgbaData[i+1], rgbaData[i+2], rgbaData[i+3]);
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(raw));

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Scissors drawing
// ---------------------------------------------------------------------------
function drawScissors(size) {
  const buf = new Uint8Array(size * size * 4); // all transparent

  const s = size / 22; // scale factor relative to 22px design grid

  function setPixel(x, y, r, g, b, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
  }

  function drawThickLine(x0, y0, x1, y1, thickness) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.ceil(len * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + dx * t, cy = y0 + dy * t;
      const half = thickness / 2;
      for (let ox = -half; ox <= half; ox += 0.5) {
        for (let oy = -half; oy <= half; oy += 0.5) {
          if (ox*ox + oy*oy <= half*half) setPixel(cx+ox, cy+oy, 0, 0, 0);
        }
      }
    }
  }

  function drawRing(cx, cy, innerR, outerR) {
    for (let py = cy - outerR - 1; py <= cy + outerR + 1; py++) {
      for (let px = cx - outerR - 1; px <= cx + outerR + 1; px++) {
        const d2 = (px - cx) ** 2 + (py - cy) ** 2;
        if (d2 >= innerR ** 2 && d2 <= outerR ** 2) setPixel(px, py, 0, 0, 0);
      }
    }
  }

  function fillCircle(cx, cy, radius) {
    for (let py = cy - radius; py <= cy + radius; py++) {
      for (let px = cx - radius; px <= cx + radius; px++) {
        if ((px-cx)**2 + (py-cy)**2 <= radius**2) setPixel(px, py, 0, 0, 0);
      }
    }
  }

  // Scale coordinates from 22-grid to actual size
  const S = (v) => v * s;

  const ringCx1 = S(5), ringCy1 = S(5);
  const ringCx2 = S(5), ringCy2 = S(17);
  const pivot = { x: S(10), y: S(11) };
  const ringInner = S(1.6), ringOuter = S(3.2);
  const stemThick = S(1.4);

  // Hollow handle rings
  drawRing(ringCx1, ringCy1, ringInner, ringOuter);
  drawRing(ringCx2, ringCy2, ringInner, ringOuter);

  // Stems from ring edge to pivot
  function stemStart(ringCx, ringCy) {
    const dx = pivot.x - ringCx, dy = pivot.y - ringCy;
    const len = Math.sqrt(dx*dx + dy*dy);
    return { x: ringCx + (dx/len)*ringOuter, y: ringCy + (dy/len)*ringOuter };
  }
  const s1 = stemStart(ringCx1, ringCy1);
  const s2 = stemStart(ringCx2, ringCy2);
  drawThickLine(s1.x, s1.y, pivot.x, pivot.y, stemThick);
  drawThickLine(s2.x, s2.y, pivot.x, pivot.y, stemThick);

  // Blades
  drawThickLine(pivot.x, pivot.y, S(20), S(7), S(0.9));
  drawThickLine(pivot.x, pivot.y, S(20), S(15), S(0.9));

  // Pivot dot
  fillCircle(pivot.x, pivot.y, S(1.2));

  return buf;
}

// ---------------------------------------------------------------------------
// Build iconset
// ---------------------------------------------------------------------------
const sizes = [16, 32, 64, 128, 256, 512, 1024];
const iconsetDir = '/Users/anatoli/workspace2/ai/pastry/assets/AppIcon.iconset';
fs.mkdirSync(iconsetDir, { recursive: true });

for (const sz of sizes) {
  const pixels = drawScissors(sz);
  const png = encodePNG(sz, sz, pixels);
  if (sz === 16)  fs.writeFileSync(path.join(iconsetDir, 'icon_16x16.png'), png);
  if (sz === 32)  { fs.writeFileSync(path.join(iconsetDir, 'icon_16x16@2x.png'), png); fs.writeFileSync(path.join(iconsetDir, 'icon_32x32.png'), png); }
  if (sz === 64)  fs.writeFileSync(path.join(iconsetDir, 'icon_32x32@2x.png'), png);
  if (sz === 128) fs.writeFileSync(path.join(iconsetDir, 'icon_128x128.png'), png);
  if (sz === 256) { fs.writeFileSync(path.join(iconsetDir, 'icon_128x128@2x.png'), png); fs.writeFileSync(path.join(iconsetDir, 'icon_256x256.png'), png); }
  if (sz === 512) { fs.writeFileSync(path.join(iconsetDir, 'icon_256x256@2x.png'), png); fs.writeFileSync(path.join(iconsetDir, 'icon_512x512.png'), png); }
  if (sz === 1024) fs.writeFileSync(path.join(iconsetDir, 'icon_512x512@2x.png'), png);
  console.log(`Generated ${sz}x${sz}`);
}

const icnsPath = '/Users/anatoli/workspace2/ai/pastry/assets/AppIcon.icns';
execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' });
console.log(`Created ${icnsPath}`);
