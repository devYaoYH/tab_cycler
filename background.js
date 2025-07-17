class TabCycler {
  constructor() {
    this.isRunning = false;
    this.tabs = [];
    this.cycleInterval = null;
    this.settings = {
      tabDuration: 5000, // 5 seconds default
      enabled: false,
      scrollDelay: 2000, // 2 seconds before scrolling starts
      scrollSpeed: 50 // pixels per scroll
    };

    this.init();
  }

  async init() {
    try {
      // Load settings from storage
      await this.loadSettings();

      // Listen for tab updates
      if (chrome.tabs && chrome.tabs.onUpdated) {
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
          if (changeInfo.status === 'complete' && this.isRunning) {
            this.refreshTabList();
          }
        });
      }

      // Listen for tab removal
      if (chrome.tabs && chrome.tabs.onRemoved) {
        chrome.tabs.onRemoved.addListener(() => {
          if (this.isRunning) {
            this.refreshTabList();
          }
        });
      }

      // Listen for tab creation
      if (chrome.tabs && chrome.tabs.onCreated) {
        chrome.tabs.onCreated.addListener(() => {
          if (this.isRunning) {
            setTimeout(() => this.refreshTabList(), 500); // Small delay for tab to load
          }
        });
      }

      // Listen for window focus changes
      if (chrome.windows && chrome.windows.onFocusChanged) {
        chrome.windows.onFocusChanged.addListener((windowId) => {
          if (windowId === chrome.windows.WINDOW_ID_NONE) {
            // No window focused, stop all scrolling
            this.stopAllScrolling();
          }
        });
      }


      // Listen for messages from popup
      if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          this.handleMessage(message, sendResponse);
          return true; // Keep the message channel open for async responses
        });
      }
    } catch (error) {
      console.error('Error during TabCycler initialization:', error);
    }
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
      // Get tabs in the current window
      const allTabs = await chrome.tabs.query({});
      const currentWindow = await chrome.windows.getCurrent();
      const currentWindowTabs = allTabs.filter(tab => tab.windowId === currentWindow.id);
      
      // Filter out extension pages and chrome:// pages
      this.tabs = currentWindowTabs.filter(tab => {
        const url = tab.url || '';
        return (
          !url.startsWith('chrome://') && 
          !url.startsWith('chrome-extension://') &&
          !url.startsWith('moz-extension://') &&
          !url.startsWith('edge-extension://') &&
          !url.startsWith('about:') &&
          url !== '' &&
          tab.id
        );
      });
    } catch (error) {
      console.error('Failed to get tabs:', error);
    }
  }

  async stopAllScrolling() {
    try {
      const allTabs = await chrome.tabs.query({});
      allTabs.forEach(tab => {
        this.detachDebugger(tab.id);
      });
    } catch (error) {
      console.error('Failed to stop all scrolling:', error);
    }
  }

  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.settings.enabled = true;
    await this.saveSettings();
    await this.refreshTabList();

    if (this.tabs.length === 0) {
      console.warn('No valid tabs to cycle through. Make sure you have regular web pages open (not just chrome:// or extension pages)');
      this.isRunning = false;
      this.settings.enabled = false;
      return;
    }


    // Set up interval for cycling - start after the first duration
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

    // Stop all scrolling by detaching debuggers
    this.tabs.forEach(tab => {
      this.detachDebugger(tab.id);
    });
  }

  async cycleToNextTab() {
    if (!this.isRunning) return;

    // Refresh tab list to handle closed tabs
    await this.refreshTabList();
    if (this.tabs.length === 0) {
      console.warn('No valid tabs to cycle through');
      await this.stop();
      return;
    }

    // Find current active tab
    const currentActiveTab = this.tabs.find(tab => tab.active);
    let nextTabIndex = 0;
    
    if (currentActiveTab) {
      const currentIndex = this.tabs.findIndex(tab => tab.id === currentActiveTab.id);
      nextTabIndex = (currentIndex + 1) % this.tabs.length;
    }

    const nextTab = this.tabs[nextTabIndex];
    if (nextTab && nextTab.id) {
      try {
        
        // Switch to the next tab
        await chrome.tabs.update(nextTab.id, { active: true });
        
        // Start scrolling after a short delay
        setTimeout(() => {
          this.startScrollingWithDebugger(nextTab.id);
        }, 200);
        
      } catch (error) {
        console.error(`Failed to switch to tab ${nextTab.id}:`, error.message);
      }
    }
  }

  async startScrollingWithDebugger(tabId) {
    try {
      // Attach debugger to the tab
      await new Promise((resolve, reject) => {
        chrome.debugger.attach({ tabId: tabId }, "1.0", () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
      
      // Enable Runtime domain
      await new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId: tabId }, "Runtime.enable", {}, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
      
      // Reset scroll position to top
      await new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId: tabId }, "Runtime.evaluate", {
          expression: "window.scrollTo(0, 0)"
        }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
      
      // Start scrolling after delay
      setTimeout(() => {
        this.scrollTabWithDebugger(tabId);
      }, this.settings.scrollDelay);
      
    } catch (error) {
      console.error(`Failed to start debugger scrolling for tab ${tabId}:`, error.message);
    }
  }

  async scrollTabWithDebugger(tabId) {
    const scrollInterval = setInterval(async () => {
      try {
        // Check if tab still exists and is active
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.active) {
          clearInterval(scrollInterval);
          this.detachDebugger(tabId);
          return;
        }
        
        // Scroll down
        await new Promise((resolve, reject) => {
          chrome.debugger.sendCommand({ tabId: tabId }, "Runtime.evaluate", {
            expression: `window.scrollBy(0, ${this.settings.scrollSpeed})`
          }, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        });
        
        // Check if we've reached the bottom
        const reachedBottom = await new Promise((resolve, reject) => {
          chrome.debugger.sendCommand({ tabId: tabId }, "Runtime.evaluate", {
            expression: "window.scrollY + window.innerHeight >= document.body.scrollHeight - 10"
          }, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result.result.value);
            }
          });
        });
        
        if (reachedBottom) {
          clearInterval(scrollInterval);
          this.detachDebugger(tabId);
        }
        
      } catch (error) {
        console.error(`Error scrolling tab ${tabId}:`, error.message);
        clearInterval(scrollInterval);
        this.detachDebugger(tabId);
      }
    }, 100); // Scroll every 100ms
  }

  async detachDebugger(tabId) {
    try {
      chrome.debugger.detach({ tabId: tabId }, () => {
        if (chrome.runtime.lastError) {
          // Ignore common detach errors
        }
      });
    } catch (error) {
      // Ignore detach errors
    }
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
