/**
 * Wraps `electron-forge start` but first patches the dev Electron.app's
 * Info.plist so macOS shows "Pastry" in the dock instead of "Electron".
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const electronBin = require('electron');
const plistPath = path.join(path.dirname(electronBin), '..', 'Info.plist');

// Patch CFBundleDisplayName and CFBundleName to "Pastry"
let plist = fs.readFileSync(plistPath, 'utf-8');
plist = plist
  .replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*/,'$1Pastry')
  .replace(/(<key>CFBundleName<\/key>\s*<string>)[^<]*/, '$1Pastry');
fs.writeFileSync(plistPath, plist, 'utf-8');

const forge = path.resolve('node_modules/.bin/electron-forge');
const child = spawn('node', [forge, 'start'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
