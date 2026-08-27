import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

// Exercises the Form action added in Task 5 (waiting popup + paste-group) end-to-end.
//
// This intentionally does NOT use `electronApplication.evaluate()` to invoke
// `ipcMain.emit('action:run-form', ...)` directly on the main process — that API
// throws "Resulting promise was garbage collected" with this Electron/Playwright
// version combination (reproduced in isolation with a minimal script, unrelated to
// any app code), and even when it doesn't throw, driving ipcMain directly bypasses
// the actual feature surface (window.pastryAPI) real usage goes through.
//
// Prerequisite: run `npm run package` at least once first, so `.vite/renderer`
// (the production static renderer build) exists — launching the dev `electron`
// binary against `.vite/build/main.js` needs it. (The packaged .app itself can't be
// used for Playwright at all: its `EnableNodeCliInspectArguments` Fuse in
// forge.config.ts blocks the CDP connection `_electron.launch()` needs.)
test('action:run-form opens a waiting popup, and Done fills+submits the form', async () => {
  const electronApp = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '../..') });

  try {
    // The actions-panel window may not exist yet at the instant launch() resolves
    // (its BrowserWindow is created inside the app's own 'ready' handler); poll for it.
    await expect.poll(() => electronApp.windows().some((w) => w.url().includes('panel=actions')), {
      timeout: 10_000,
    }).toBe(true);
    const actionsPage = electronApp.windows().find((w) => w.url().includes('panel=actions'))!;

    await actionsPage.evaluate(() => {
      window.pastryAPI.runFormAction({
        url: 'https://the-internet.herokuapp.com/login',
        steps: [
          { value: 'tomsmith', then: 'tab' },
          { value: 'SuperSecretPassword!', then: 'enter' },
        ],
      });
    });

    const popup = await electronApp.waitForEvent('window', {
      predicate: (win) => win.url().startsWith('data:text/html'),
      timeout: 10_000,
    });
    await popup.waitForLoadState('domcontentloaded');

    await expect(popup.locator('#titlebar')).toContainText('Pastry — Form Action');
    await expect(popup.locator('#done')).toBeVisible();

    const closed = popup.waitForEvent('close');
    await popup.locator('#done').click();
    await closed;
  } finally {
    await electronApp.close();
  }
});
