# Pastry

A macOS clipboard manager built with Electron, Lit.js, and avosignals.

## Features

- Rolling clipboard history (configurable size, default 20)
- Named pins — save any clipboard entry with a label
- Image clipboard support with thumbnails
- Search filters both history and pins simultaneously
- Edit pinned items (label and value)
- Keyboard navigation (↑↓ / Enter / ⌘C / Esc)
- Global shortcut **⌘⇧V** opens the panel from anywhere
- Persists history, pins, and settings across restarts

## Requirements

- macOS
- Node.js 18+
- npm 9+

## Setup

```bash
git clone git@github.com:anatolipr/pastry.git
cd pastry
npm install
```

## Running in development

```bash
npm start
```

The app will launch and register the **⌘⇧V** global shortcut. Press it from any app to open the Pastry panel.

> **First run:** macOS will ask you to grant Accessibility access to Pastry (required for the Paste action to send keystrokes to other apps). Go to **System Settings → Privacy & Security → Accessibility** and enable Pastry.

## Building a standalone app

```bash
npm run make
```

This produces a distributable `.app` bundle (and a `.zip`) in the `out/` directory. The `.app` can be copied to `/Applications` and run independently without Node.js or a terminal.

```
out/
  make/
    zip/darwin/arm64/
      pastry-darwin-arm64-1.0.0.zip   # distributable archive
  pastry-darwin-arm64/
    pastry.app                        # drag to /Applications
```

To package without creating an installer archive (faster, local use only):

```bash
npm run package
```

### macOS permissions for the standalone app

The Paste action uses `osascript` to switch focus and send keystrokes, which requires macOS permissions. Because the packaged app is unsigned, macOS will silently deny these without prompting. You need to ad-hoc sign the app after packaging:

```bash
npm run package
codesign --deep --force --sign - "out/pastry-darwin-arm64/pastry.app"
```

Then copy the app to `/Applications` and reset any previously denied permissions:

```bash
tccutil reset AppleEvents com.anatoli.pastry
tccutil reset Accessibility com.anatoli.pastry
```

Launch the app from Finder (not from terminal), trigger **⌘⇧V**, and click Paste — macOS will prompt:

1. **"pastry" wants access to control "System Events"** — click **Allow**
2. **Accessibility access** — open System Settings and enable Pastry under **Privacy & Security → Accessibility**

After granting both, Paste will work as expected.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| **⌘⇧V** | Open / close Pastry panel (global) |
| **↑ / ↓** | Navigate items |
| **Enter** | Paste selected item into previous app |
| **⌘C** | Copy selected item to clipboard |
| **Esc** | Close panel |
