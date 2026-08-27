import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// The Vite plugin ships only the `.vite` build output — node_modules is never
// copied into the package. uiohook-napi (used for the double-tap-Cmd feature)
// has a native .node binary that can't be bundled by Rollup, so it's staged
// here into a standalone `node_modules` folder and shipped via
// `extraResource`, landing at Contents/Resources/node_modules — a location
// Node's module resolution walks up into from inside main.js, asar or not.
const nativeStagingDir = path.join(__dirname, '.native-staging');
const NATIVE_DEPS = ['uiohook-napi', 'node-gyp-build'];

function stageNativeDeps(): void {
  const dest = path.join(nativeStagingDir, 'node_modules');
  fs.rmSync(nativeStagingDir, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const dep of NATIVE_DEPS) {
    fs.cpSync(path.join(__dirname, 'node_modules', dep), path.join(dest, dep), { recursive: true });
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'assets/AppIcon',
    appBundleId: 'com.anatoli.pastry',
    extraResource: [path.join(nativeStagingDir, 'node_modules')],
    extendInfo: {
      NSAppleEventsUsageDescription:
        'Pastry needs to send keystrokes to paste clipboard items into other apps.',
      NSAccessibilityUsageDescription:
        'Pastry needs Accessibility access to paste clipboard items into other apps.',
    },
  },
  hooks: {
    prePackage: async () => {
      stageNativeDeps();
    },
    postPackage: async (_config, options) => {
      if (options.platform !== 'darwin') return;
      const appPath = options.outputPaths
        .map(p => `${p}/pastry.app`)
        .find(p => { try { require('fs').statSync(p); return true; } catch { return false; } });
      if (!appPath) { console.warn('[forge] postPackage: pastry.app not found, skipping codesign'); return; }
      console.log(`[forge] ad-hoc signing ${appPath}`);
      execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: 'inherit' });
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
