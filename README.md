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

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| **⌘⇧V** | Open / close Pastry panel (global) |
| **↑ / ↓** | Navigate items |
| **Enter** | Paste selected item into previous app |
| **⌘C** | Copy selected item to clipboard |
| **Esc** | Close panel |
