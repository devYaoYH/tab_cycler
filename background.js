class TabCycler {
  constructor() {
    this.isRunning = false;
    this.tabs = [];
    this.cycleInterval = null;
    this.commandListenerSetup = false;
    this.settings = {
      tabDuration: 10000, // 10 seconds default
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

      // Listen for keyboard commands - set up with retry mechanism
      this.setupCommandListener();

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

  setupCommandListener() {
    // Avoid setting up duplicate listeners
    if (this.commandListenerSetup) {
      return;
    }

    // Try to set up command listener with retry mechanism
    const trySetupCommands = (attempt = 1, maxAttempts = 5) => {
      if (chrome.commands && chrome.commands.onCommand) {
        try {
          chrome.commands.onCommand.addListener((command) => {
            if (command === 'stop-scrolling') {
              this.stopAllScrolling();
            }
          });
          console.log('Command listener successfully set up');
          this.commandListenerSetup = true;
          return;
        } catch (error) {
          console.log(`Failed to set up command listener on attempt ${attempt}:`, error);
        }
      }
      
      if (attempt < maxAttempts) {
        console.log(`chrome.commands API not ready, retrying in ${attempt * 500}ms (attempt ${attempt}/${maxAttempts})`);
        setTimeout(() => trySetupCommands(attempt + 1, maxAttempts), attempt * 500);
      } else {
        console.warn('Failed to set up command listener after all attempts. Keyboard shortcuts may not work.');
      }
    };

    trySetupCommands();
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
      console.log(`Initial query found ${allTabs.length} total tabs`);
      
      // Filter to current window only
      const currentWindow = await chrome.windows.getCurrent();
      const currentWindowTabs = allTabs.filter(tab => tab.windowId === currentWindow.id);
      console.log(`Found ${currentWindowTabs.length} tabs in current window (ID: ${currentWindow.id})`);
      
      // Filter out extension pages and chrome:// pages
      this.tabs = currentWindowTabs.filter(tab => {
        const url = tab.url || '';
        const isValid = (
          !url.startsWith('chrome://') && 
          !url.startsWith('chrome-extension://') &&
          !url.startsWith('moz-extension://') &&
          !url.startsWith('edge-extension://') &&
          !url.startsWith('about:') &&
          url !== '' &&
          tab.id
        );
        
        if (!isValid) {
          console.log(`Filtered out tab: ${tab.id} - ${url}`);
        }
        
        return isValid;
      });
      console.log(`Found ${this.tabs.length} valid tabs for cycling:`, this.tabs.map(t => ({ id: t.id, title: t.title?.substring(0, 50) })));
    } catch (error) {
      console.error('Failed to get tabs:', error);
    }
  }

  async stopAllScrolling() {
    // Send stop message to all tabs in all windows
    try {
      const allTabs = await chrome.tabs.query({});
      allTabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'stopScrolling' }, (response) => {
          // Check for runtime errors and ignore them
          if (chrome.runtime.lastError) {
            // This is expected for tabs without content scripts
            return;
          }
        });
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

    console.log(`Starting tab cycling with ${this.tabs.length} tabs, ${this.settings.tabDuration}ms duration`);

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

    // Send stop message to all content scripts
    this.tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'stopScrolling' }, (response) => {
        // Check for runtime errors and ignore them
        if (chrome.runtime.lastError) {
          // This is expected for tabs without content scripts
          return;
        }
      });
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
        console.log(`Switching to tab ${nextTab.id}: ${nextTab.title}`);
        
        // Switch to the next tab
        await chrome.tabs.update(nextTab.id, { active: true });
        
        // Start scrolling after a short delay
        setTimeout(() => {
          console.log(`Attempting to send scroll message to tab ${nextTab.id}`);
          this.sendScrollMessage(nextTab.id);
        }, 200);
        
      } catch (error) {
        console.error(`Failed to switch to tab ${nextTab.id}:`, error.message);
      }
    }
  }

  async sendScrollMessage(tabId, retries = 3) {
    console.log(`sendScrollMessage called for tab ${tabId}, retries: ${retries}`);
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Sending scroll message to tab ${tabId}, attempt ${i + 1}`);
        await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, {
            action: 'startScrolling',
            scrollDelay: this.settings.scrollDelay,
            scrollSpeed: this.settings.scrollSpeed
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.log(`Chrome runtime error for tab ${tabId}:`, chrome.runtime.lastError.message);
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              console.log(`Successfully sent scroll message to tab ${tabId}, response:`, response);
              resolve(response);
            }
          });
        });
        return; // Success, exit retry loop
      } catch (error) {
        console.log(`Scroll message attempt ${i + 1} failed for tab ${tabId}:`, error.message);
        if (i < retries - 1) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
    console.log(`Failed to send scroll message to tab ${tabId} after ${retries} attempts`);
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
      case 'stopScrolling':
        this.stopAllScrolling();
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
