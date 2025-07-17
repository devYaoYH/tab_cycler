class TabCycler {
  constructor() {
    this.isRunning = false;
    this.currentTabIndex = 0;
    this.tabs = [];
    this.cycleInterval = null;
    this.currentWindowId = null;
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
          } else if (this.isRunning) {
            this.currentWindowId = windowId;
            setTimeout(() => this.refreshTabList(), 100);
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
      // Get the current window if not set
      if (!this.currentWindowId) {
        const currentWindow = await chrome.windows.getCurrent();
        this.currentWindowId = currentWindow.id;
      }

      this.tabs = await chrome.tabs.query({ 
        windowId: this.currentWindowId 
      });
      
      // Filter out extension pages, chrome:// pages, but keep more valid URLs
      this.tabs = this.tabs.filter(tab => {
        const url = tab.url || '';
        return (
          !url.startsWith('chrome://') && 
          !url.startsWith('chrome-extension://') &&
          !url.startsWith('moz-extension://') &&
          !url.startsWith('edge-extension://') &&
          !url.startsWith('about:') &&
          !url.startsWith('data:') &&
          !url.startsWith('blob:') &&
          url !== '' &&
          tab.id &&
          !tab.discarded &&
          tab.status === 'complete' // Only include fully loaded tabs
        );
      });
      console.log(`Found ${this.tabs.length} valid tabs for cycling in window ${this.currentWindowId}:`, this.tabs.map(t => ({ id: t.id, title: t.title?.substring(0, 50) })));
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
    this.currentTabIndex = 0;

    // Start immediately, then set up interval
    await this.cycleToNextTab();

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
    if (!this.isRunning || this.tabs.length === 0) return;

    // Refresh tab list to handle closed tabs
    await this.refreshTabList();
    if (this.tabs.length === 0) {
      console.warn('No more valid tabs, stopping cycling');
      await this.stop();
      return;
    }

    // Ensure currentTabIndex is within bounds
    if (this.currentTabIndex >= this.tabs.length) {
      this.currentTabIndex = 0;
    }

    const currentTab = this.tabs[this.currentTabIndex];
    if (currentTab && currentTab.id) {
      try {
        // Check if tab still exists before switching
        const tabExists = await chrome.tabs.get(currentTab.id).catch(() => null);
        if (!tabExists) {
          console.log(`Tab ${currentTab.id} no longer exists, skipping`);
          this.currentTabIndex = (this.currentTabIndex + 1) % this.tabs.length;
          return;
        }

        // Check if the tab's window is currently focused
        const tabWindow = await chrome.windows.get(currentTab.windowId);
        const currentWindow = await chrome.windows.getCurrent();
        
        // Only proceed if the tab is in the currently focused window
        if (tabWindow.id === currentWindow.id && tabWindow.focused) {
          console.log(`Switching to tab ${currentTab.id}: ${currentTab.url}`);
          
          // Add retry logic for tab switching
          let retryCount = 0;
          const maxRetries = 3;
          
          while (retryCount < maxRetries) {
            try {
              await chrome.tabs.update(currentTab.id, { active: true });
              break; // Success, exit retry loop
            } catch (error) {
              retryCount++;
              if (error.message.includes('user may be dragging')) {
                console.log(`Tab switch blocked (user interaction), retry ${retryCount}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
              } else {
                throw error; // Re-throw if it's a different error
              }
            }
          }

          // Send message to content script to start scrolling after delay
          // Wait longer to ensure content script is loaded and page is ready
          setTimeout(async () => {
            try {
              // First ensure the tab is focused by updating it again
              await chrome.tabs.update(currentTab.id, { active: true });

              // Then send the scrolling message with retry logic
              await this.sendScrollMessage(currentTab.id);
            } catch (error) {
              console.log(`Failed to send scroll message to tab ${currentTab.id}:`, error.message);
            }
          }, 500); // Increased delay to 500ms
        }
      } catch (error) {
        console.error(`Failed to switch to tab ${currentTab.id}:`, error.message);
        // Continue to next tab even if this one failed
      }
    }

    // Move to next tab
    this.currentTabIndex = (this.currentTabIndex + 1) % this.tabs.length;
  }

  async sendScrollMessage(tabId, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, {
            action: 'startScrolling',
            scrollDelay: this.settings.scrollDelay,
            scrollSpeed: this.settings.scrollSpeed
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        return; // Success, exit retry loop
      } catch (error) {
        console.log(`Scroll message attempt ${i + 1} failed:`, error.message);
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
