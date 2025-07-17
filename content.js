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
      return true; // Keep the message channel open for async responses
    });

    // Reset scroll position when page loads
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded - resetting scroll');
        this.resetScroll();
      });
    } else {
      console.log('Document already loaded - resetting scroll');
      this.resetScroll();
    }

    // Also listen for window load to ensure everything is ready
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => {
        console.log('Window load complete');
      });
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

  ensureFocus() {
    // Try to focus the window
    if (window.focus) {
      window.focus();
    }
    
    // Try to focus the document body or documentElement
    if (document.body && document.body.focus) {
      document.body.focus();
    } else if (document.documentElement && document.documentElement.focus) {
      document.documentElement.focus();
    }
    
    // Set tabindex if needed to make page focusable
    if (document.body && !document.body.hasAttribute('tabindex')) {
      document.body.setAttribute('tabindex', '-1');
    }
  }

  startScrolling(delay = this.scrollDelay, speed = this.scrollSpeed) {
    if (this.isScrolling) {
      this.stopScrolling();
    }

    this.scrollSpeed = speed;
    this.scrollDelay = delay;
    
    // Ensure the window has focus before starting
    this.ensureFocus();
    
    // First scroll to top
    this.resetScroll();
    
    // Wait for the specified delay before starting to scroll
    this.scrollTimeout = setTimeout(() => {
      // Double-check focus before starting scroll
      this.ensureFocus();
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

    let lastScrollY = window.scrollY;
    let stuckCounter = 0;

    const scrollStep = () => {
      if (!this.isScrolling) return;

      const currentScrollY = window.scrollY;
      const documentHeight = Math.max(
        document.body?.scrollHeight || 0,
        document.body?.offsetHeight || 0,
        document.documentElement?.clientHeight || 0,
        document.documentElement?.scrollHeight || 0,
        document.documentElement?.offsetHeight || 0
      );
      const viewportHeight = window.innerHeight;
      const maxScrollY = documentHeight - viewportHeight;

      // Check if we've reached the bottom or can't scroll further
      if (currentScrollY >= maxScrollY || currentScrollY >= documentHeight - viewportHeight - 10) {
        console.log('Reached bottom of page, stopping scroll');
        this.stopScrolling();
        return;
      }

      // Check if scroll is stuck (hasn't moved for several attempts)
      if (Math.abs(currentScrollY - lastScrollY) < 1) {
        stuckCounter++;
        if (stuckCounter > 10) {
          console.log('Scroll appears stuck, stopping');
          this.stopScrolling();
          return;
        }
      } else {
        stuckCounter = 0;
        lastScrollY = currentScrollY;
      }

      // Try different scroll methods for better compatibility
      try {
        // Method 1: Use scrollBy with smooth behavior
        window.scrollBy({
          top: this.scrollSpeed,
          left: 0,
          behavior: 'smooth'
        });
      } catch (e) {
        // Method 2: Fallback to direct scrollTo
        window.scrollTo(0, currentScrollY + this.scrollSpeed);
      }
    };

    // Start scrolling with a reasonable interval
    this.scrollInterval = setInterval(scrollStep, 100); // 100ms intervals for smooth scrolling
  }

  handleMessage(message, sendResponse) {
    console.log('Content script received message:', message);
    switch (message.action) {
      case 'startScrolling':
        console.log(`Starting scrolling with delay: ${message.scrollDelay}ms, speed: ${message.scrollSpeed}px`);
        this.startScrolling(message.scrollDelay, message.scrollSpeed);
        sendResponse({ success: true });
        break;
      case 'stopScrolling':
        console.log('Stopping scrolling');
        this.stopScrolling();
        sendResponse({ success: true });
        break;
      case 'resetScroll':
        console.log('Resetting scroll position');
        this.resetScroll();
        sendResponse({ success: true });
        break;
      default:
        console.log('Unknown action:', message.action);
        sendResponse({ error: 'Unknown action' });
    }
  }
}

// Initialize the auto scroller
console.log('Tab Cycler content script loading on:', window.location.href);
const autoScroller = new AutoScroller();
console.log('Tab Cycler content script initialized');

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden, stopping scrolling');
    // Page is hidden, stop scrolling
    autoScroller.stopScrolling();
  } else {
    console.log('Page visible again');
  }
});