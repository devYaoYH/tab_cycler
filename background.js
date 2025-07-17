class TabCycler {
  constructor() {
    this.isRunning = false;
    this.currentTabIndex = 0;
    this.tabs = [];
    this.cycleInterval = null;
    this.settings = {
      tabDuration: 10000, // 10 seconds default
      enabled: false,
      scrollDelay: 2000, // 2 seconds before scrolling starts
      scrollSpeed: 50 // pixels per scroll
    };
    
    this.init();
  }

  async init() {
    // Load settings from storage
    await this.loadSettings();
    
    // Listen for tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && this.isRunning) {
        this.refreshTabList();
      }
    });

    // Listen for tab removal
    chrome.tabs.onRemoved.addListener(() => {
      if (this.isRunning) {
        this.refreshTabList();
      }
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
    });
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(this.settings);
      this.settings = { ...this.settings, ...result };
    } catch (error) {
      console.log('Using default settings');
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set(this.settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  async refreshTabList() {
    try {
      this.tabs = await chrome.tabs.query({ currentWindow: true });
      // Filter out extension pages and chrome:// pages
      this.tabs = this.tabs.filter(tab => 
        !tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://')
      );
    } catch (error) {
      console.error('Failed to get tabs:', error);
    }
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.settings.enabled = true;
    await this.saveSettings();
    await this.refreshTabList();
    
    if (this.tabs.length === 0) {
      console.log('No valid tabs to cycle through');
      return;
    }

    this.currentTabIndex = 0;
    this.cycleToNextTab();
    
    // Set up interval for cycling
    this.cycleInterval = setInterval(() => {
      this.cycleToNextTab();
    }, this.settings.tabDuration);
  }

  async stop() {
    this.isRunning = false;
    this.settings.enabled = false;
    await this.saveSettings();
    
    if (this.cycleInterval) {
      clearInterval(this.cycleInterval);
      this.cycleInterval = null;
    }

    // Send stop message to all content scripts
    this.tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'stopScrolling' }).catch(() => {
        // Ignore errors for tabs that don't have content script
      });
    });
  }

  async cycleToNextTab() {
    if (!this.isRunning || this.tabs.length === 0) return;

    const currentTab = this.tabs[this.currentTabIndex];
    if (currentTab) {
      try {
        // Switch to the tab
        await chrome.tabs.update(currentTab.id, { active: true });
        
        // Send message to content script to start scrolling after delay
        setTimeout(() => {
          chrome.tabs.sendMessage(currentTab.id, {
            action: 'startScrolling',
            scrollDelay: this.settings.scrollDelay,
            scrollSpeed: this.settings.scrollSpeed
          }).catch(() => {
            // Ignore errors for tabs that don't have content script
          });
        }, 100);
        
      } catch (error) {
        console.error('Failed to switch tab:', error);
      }
    }

    // Move to next tab
    this.currentTabIndex = (this.currentTabIndex + 1) % this.tabs.length;
  }

  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    
    // Restart cycling if running and timing changed
    if (this.isRunning && (newSettings.tabDuration || newSettings.scrollDelay || newSettings.scrollSpeed)) {
      await this.stop();
      await this.start();
    }
  }

  handleMessage(message, sendResponse) {
    switch (message.action) {
      case 'start':
        this.start();
        sendResponse({ success: true });
        break;
      case 'stop':
        this.stop();
        sendResponse({ success: true });
        break;
      case 'getStatus':
        sendResponse({ 
          isRunning: this.isRunning, 
          settings: this.settings,
          tabCount: this.tabs.length 
        });
        break;
      case 'updateSettings':
        this.updateSettings(message.settings);
        sendResponse({ success: true });
        break;
      default:
        sendResponse({ error: 'Unknown action' });
    }
  }
}

// Initialize the tab cycler
const tabCycler = new TabCycler();