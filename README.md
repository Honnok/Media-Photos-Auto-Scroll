# Media Photos Auto Scroll

Chrome extension that auto-scrolls Facebook galleries and pages to the bottom in the background while you multitask.

Facebook throttles or resets standard (programmatic) scrolling to prevent automation. This extension bypasses that block by simulating human-like scroll behavior: dynamic, variable scroll speed combined with preemptive image lazy-loading, helping avoid triggering anti-bot detection.

## Features

- **Automatic scrolling to the bottom** of Facebook galleries and pages
- **Dynamic scroll speed** — variable speed to mimic human behavior and avoid blocking
- **Background image preloading** — forces lazy-loaded images to render before they're visible on screen
- **Runs in the background** — passive browsing while you do something else

## Installation

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the project folder

## Usage

1. Go to a Facebook gallery or page
2. Enable the extension
3. Auto-scroll starts and continues to the bottom of the page, or until manually stopped

## Project structure

- `manifest.json` — extension configuration (Manifest V3)
- `background.js` — background script
- `content.js` — script injected into the page to drive scrolling
- `engine.js` — scroll engine logic (dynamic speed, end-of-content detection)
- `icons/` — extension icons

## Planned updates

- Support for Instagram, TikTok, Tumblr
- Icon improvements
- Configuration menu
- Session statistics (number of images/posts scrolled, total time, galleries completed)
- Keyboard shortcuts (start/stop scrolling without using the mouse)
- Improved end-of-content detection (avoid false positives on infinite-loading pages)
- End-of-scroll notification (alert when a gallery is finished)

## License

MIT — see the [LICENSE](LICENSE) file
