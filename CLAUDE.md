# DiffMaster

Web-based content diff/comparison tool. Vanilla HTML + CSS + JS, no build system.

## Quick Start

```bash
node server.js          # http://localhost:8082
```

## Architecture

```
index.html              # Single page, loads modules via <script>
css/styles.css          # All styles, CSS custom properties for theming
js/
  app.js                # Main controller (IIFE), DOM binding, events, theme
  diff-engine.js        # Wraps jsdiff library, side-by-side/unified rendering, syntax highlighting
  encoding.js           # BOM detection, heuristic encoding detection, decode
  sorting.js            # JSON array/object sorting with type-aware compare
  storage.js            # localStorage history (max 50 records)
server.js               # Minimal static file server (Node http, port 8082)
test-diff.js            # Unit tests for diff engine (node test-diff.js)
test-render.js          # Unit tests for HTML rendering (node test-render.js)
```

### Key Patterns

- All JS modules use **IIFE revealing module** pattern (e.g. `const App = (() => { ... })()`)
- External dependencies loaded from jsdelivr CDN:
  - `diff@5.2.0` — core diff computation
  - `highlight.js@11.9.0` — syntax highlighting
  - `lz-string@1.5.0` — URL compression for shareable links
- No bundler, no transpiler — scripts load in order, globals used for cross-module access
- Theme via `data-theme` attribute on `<html>`, stored in localStorage

## Features

### Text Diff
- Side-by-side and unified diff views
- Line, word, and character-level diff modes
- Ignore whitespace / ignore case options
- Syntax highlighting (auto-detect or manual language selection)
- Find & replace in editors (Ctrl+F)
- Click diff row to scroll editor to matching line
- Fold unchanged regions (click to expand)

### Merge Mode
- Accept/reject per-hunk decisions
- Copy or download merged result

### Image Diff
- Side-by-side, overlay, swipe, and pixel-diff modes
- Canvas-based rendering

### 3-Way Merge
- Base/ours/theirs inputs
- Conflict detection with markers

### Export & Share
- Export as styled HTML, plain text, or clipboard
- Shareable URL via lz-string compression in URL hash

### Other
- File upload with encoding detection (UTF-8, GBK, Big5, etc.)
- JSON sort (ascending/descending)
- Dark/light theme toggle
- Comparison history (localStorage, max 50)

## Development

- **No build step** — edit files directly, refresh browser
- **No test framework** — `node test-diff.js && node test-render.js` for basic validation
- **No package.json** — `server.js` uses only Node built-ins

## Conventions

- UI language: Chinese (zh-CN)
- Code comments and variable names: English
- File encoding: UTF-8
- Max file upload: 10MB
- Max history records: 50 (localStorage)
