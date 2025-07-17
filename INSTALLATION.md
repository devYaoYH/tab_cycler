# Tab Cycler Chrome Extension - Installation Guide

## What it does

This Chrome extension automatically cycles through your open tabs with configurable timing and includes auto-scrolling functionality. Perfect for monitoring multiple pages, creating presentations, or keeping track of various websites.

## Features

- ✅ **Tab Cycling**: Automatically switches between tabs in the current window
- ✅ **Configurable Timing**: Set how long to stay on each tab (1-300 seconds)
- ✅ **Auto-Scrolling**: Slowly scrolls down each page after a configurable delay
- ✅ **Smart Filtering**: Skips Chrome extension pages and chrome:// URLs
- ✅ **Scroll Controls**: Configure scroll delay (0-60 seconds) and speed (10-200 pixels)
- ✅ **Easy Controls**: Start/stop cycling with a simple popup interface
- ✅ **Persistent Settings**: Your preferences are saved automatically

## Installation Instructions

### Method 1: Load as Unpacked Extension (Recommended for Development)

1. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Go to `chrome://extensions/`
   - Or click the three dots menu → More tools → Extensions

2. **Enable Developer Mode**
   - Toggle "Developer mode" in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Navigate to this project folder and select it
   - Click "Select Folder"

4. **Verify Installation**
   - You should see "Tab Cycler" in your extensions list
   - The extension icon should appear in your browser toolbar

### Method 2: Pack and Install as CRX (Optional)

1. **Pack the Extension**
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Click "Pack extension"
   - Select this project folder as the extension root
   - Click "Pack extension"

2. **Install the CRX**
   - Drag the generated `.crx` file to the extensions page
   - Click "Add extension" when prompted

## How to Use

### Basic Usage

1. **Open Multiple Tabs**
   - Open several websites in different tabs
   - The extension will cycle through all valid tabs (excluding chrome:// and extension pages)

2. **Configure Settings**
   - Click the Tab Cycler icon in your toolbar
   - Set your preferred timing:
     - **Tab Duration**: How long to stay on each tab (default: 10 seconds)
     - **Scroll Delay**: How long to wait before starting to scroll (default: 2 seconds)
     - **Scroll Speed**: How fast to scroll in pixels per step (default: 50 pixels)

3. **Start Cycling**
   - Click "Start Cycling" in the popup
   - The extension will begin cycling through your tabs
   - Each tab will scroll to the top, pause, then slowly scroll down

4. **Stop Cycling**
   - Click the extension icon again
   - Click "Stop Cycling" to stop the process

### Advanced Features

- **Automatic Pause**: Scrolling stops when it reaches the bottom of a page
- **Page Visibility**: Scrolling pauses when tabs are not visible
- **Real-time Updates**: Settings are applied immediately
- **Tab Management**: Automatically adapts when tabs are added or removed

## File Structure

```
tab-cycler/
├── manifest.json          # Extension configuration
├── background.js          # Tab cycling logic
├── content.js            # Auto-scrolling functionality
├── popup.html            # Settings interface
├── popup.js              # Popup controller
├── icons/                # Extension icons (to be added)
├── .gitignore           # Git ignore rules
└── INSTALLATION.md       # This file
```

## Troubleshooting

### Extension Not Working
- Make sure you've enabled the extension in `chrome://extensions/`
- Check that you have multiple valid tabs open (not chrome:// pages)
- Try reloading the extension

### Scrolling Not Working
- Some websites may prevent automatic scrolling
- The content script may not load on certain pages (like chrome:// URLs)
- Try refreshing the page and starting cycling again

### Settings Not Saving
- Make sure you have storage permissions enabled
- Check Chrome's site settings for storage permissions

## Permissions Explained

- **tabs**: Required to switch between tabs and get tab information
- **activeTab**: Required to inject content scripts for scrolling
- **storage**: Required to save your settings and preferences

## Development Notes

- Built with Manifest V3 for modern Chrome compatibility
- Uses service worker for background processing
- Includes proper error handling and fallbacks
- Settings are synchronized across Chrome instances