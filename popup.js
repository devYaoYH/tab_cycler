class PopupController {
  constructor() {
    this.isRunning = false;
    this.settings = {};
    this.init();
  }

  async init() {
    // Get DOM elements
    this.statusElement = document.getElementById('status');
    this.statusTextElement = document.getElementById('statusText');
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.tabDurationInput = document.getElementById('tabDuration');
    this.scrollDelayInput = document.getElementById('scrollDelay');
    this.scrollSpeedInput = document.getElementById('scrollSpeed');
    this.tabCountElement = document.getElementById('tabCount');

    // Set up event listeners
    this.startBtn.addEventListener('click', () => this.startCycling());
    this.stopBtn.addEventListener('click', () => this.stopCycling());
    
    // Add input event listeners for real-time settings update
    this.tabDurationInput.addEventListener('input', () => this.updateSettings());
    this.scrollDelayInput.addEventListener('input', () => this.updateSettings());
    this.scrollSpeedInput.addEventListener('input', () => this.updateSettings());

    // Load current status and settings
    await this.loadStatus();
    this.updateUI();
  }

  async loadStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (response) {
          this.isRunning = response.isRunning;
          this.settings = response.settings;
          this.tabCount = response.tabCount;
          
          // Update input fields with current settings
          this.tabDurationInput.value = Math.round(this.settings.tabDuration / 1000);
          this.scrollDelayInput.value = Math.round(this.settings.scrollDelay / 1000);
          this.scrollSpeedInput.value = this.settings.scrollSpeed;
        }
        resolve();
      });
    });
  }

  updateUI() {
    if (this.isRunning) {
      this.statusElement.className = 'status running';
      this.statusTextElement.textContent = 'Running';
      this.startBtn.disabled = true;
      this.stopBtn.disabled = false;
      this.startBtn.classList.add('disabled');
      this.stopBtn.classList.remove('disabled');
    } else {
      this.statusElement.className = 'status stopped';
      this.statusTextElement.textContent = 'Stopped';
      this.startBtn.disabled = false;
      this.stopBtn.disabled = true;
      this.startBtn.classList.remove('disabled');
      this.stopBtn.classList.add('disabled');
    }

    // Update tab count
    if (this.tabCount !== undefined) {
      this.tabCountElement.textContent = `${this.tabCount} tabs available for cycling`;
    }
  }

  async startCycling() {
    // Update settings before starting
    await this.updateSettings();
    
    chrome.runtime.sendMessage({ action: 'start' }, (response) => {
      if (response && response.success) {
        this.isRunning = true;
        this.updateUI();
      }
    });
  }

  async stopCycling() {
    chrome.runtime.sendMessage({ action: 'stop' }, (response) => {
      if (response && response.success) {
        this.isRunning = false;
        this.updateUI();
      }
    });
  }

  async updateSettings() {
    const newSettings = {
      tabDuration: parseInt(this.tabDurationInput.value) * 1000, // Convert to milliseconds
      scrollDelay: parseInt(this.scrollDelayInput.value) * 1000, // Convert to milliseconds
      scrollSpeed: parseInt(this.scrollSpeedInput.value)
    };

    // Validate settings
    if (newSettings.tabDuration < 1000) {
      this.tabDurationInput.value = 1;
      newSettings.tabDuration = 1000;
    }
    if (newSettings.tabDuration > 300000) {
      this.tabDurationInput.value = 300;
      newSettings.tabDuration = 300000;
    }
    if (newSettings.scrollDelay < 0) {
      this.scrollDelayInput.value = 0;
      newSettings.scrollDelay = 0;
    }
    if (newSettings.scrollDelay > 60000) {
      this.scrollDelayInput.value = 60;
      newSettings.scrollDelay = 60000;
    }
    if (newSettings.scrollSpeed < 10) {
      this.scrollSpeedInput.value = 10;
      newSettings.scrollSpeed = 10;
    }
    if (newSettings.scrollSpeed > 200) {
      this.scrollSpeedInput.value = 200;
      newSettings.scrollSpeed = 200;
    }

    this.settings = { ...this.settings, ...newSettings };

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ 
        action: 'updateSettings', 
        settings: newSettings 
      }, (response) => {
        resolve(response);
      });
    });
  }

  // Update status periodically while popup is open
  startStatusUpdates() {
    this.statusInterval = setInterval(async () => {
      await this.loadStatus();
      this.updateUI();
    }, 1000);
  }

  stopStatusUpdates() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const popup = new PopupController();
  
  // Start status updates
  popup.startStatusUpdates();
  
  // Stop status updates when popup is closed
  window.addEventListener('beforeunload', () => {
    popup.stopStatusUpdates();
  });
});