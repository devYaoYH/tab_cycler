class AutoScroller {
  constructor() {
    this.isScrolling = false;
    this.scrollInterval = null;
    this.scrollTimeout = null;
    this.scrollSpeed = 50;
    this.scrollDelay = 2000;
    
    this.init();
  }

  init() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
    });

    // Reset scroll position when page loads
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.resetScroll();
      });
    } else {
      this.resetScroll();
    }
  }

  resetScroll() {
    // Scroll to top of page
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant'
    });
  }

  startScrolling(delay = this.scrollDelay, speed = this.scrollSpeed) {
    if (this.isScrolling) {
      this.stopScrolling();
    }

    this.scrollSpeed = speed;
    this.scrollDelay = delay;
    
    // First scroll to top
    this.resetScroll();
    
    // Wait for the specified delay before starting to scroll
    this.scrollTimeout = setTimeout(() => {
      this.isScrolling = true;
      this.beginAutoScroll();
    }, delay);
  }

  stopScrolling() {
    this.isScrolling = false;
    
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
      this.scrollInterval = null;
    }
  }

  beginAutoScroll() {
    if (!this.isScrolling) return;

    const scrollStep = () => {
      if (!this.isScrolling) return;

      const currentScrollY = window.scrollY;
      const maxScrollY = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      ) - window.innerHeight;

      // Check if we've reached the bottom
      if (currentScrollY >= maxScrollY) {
        this.stopScrolling();
        return;
      }

      // Scroll down by the specified speed
      window.scrollBy({
        top: this.scrollSpeed,
        left: 0,
        behavior: 'smooth'
      });
    };

    // Start scrolling with a reasonable interval
    this.scrollInterval = setInterval(scrollStep, 100); // 100ms intervals for smooth scrolling
  }

  handleMessage(message, sendResponse) {
    switch (message.action) {
      case 'startScrolling':
        this.startScrolling(message.scrollDelay, message.scrollSpeed);
        sendResponse({ success: true });
        break;
      case 'stopScrolling':
        this.stopScrolling();
        sendResponse({ success: true });
        break;
      case 'resetScroll':
        this.resetScroll();
        sendResponse({ success: true });
        break;
      default:
        sendResponse({ error: 'Unknown action' });
    }
  }
}

// Initialize the auto scroller
const autoScroller = new AutoScroller();

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Page is hidden, stop scrolling
    autoScroller.stopScrolling();
  }
});