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
    console.log('startScrolling called with delay:', delay, 'speed:', speed);
    console.log('Document hidden:', document.hidden);
    
    // Only start scrolling if the tab is visible
    if (document.hidden) {
      console.log('Not starting scrolling - document is hidden');
      return;
    }

    if (this.isScrolling) {
      console.log('Already scrolling, stopping first');
      this.stopScrolling();
    }

    this.scrollSpeed = speed;
    this.scrollDelay = delay;
    
    // First scroll to top
    console.log('Resetting scroll position');
    this.resetScroll();
    
    // Wait for the specified delay before starting to scroll
    console.log('Setting timeout for', delay, 'ms');
    this.scrollTimeout = setTimeout(() => {
      console.log('Timeout fired, checking if document is still visible');
      // Only check if tab is still visible (not hidden)
      if (!document.hidden) {
        console.log('Starting auto scroll');
        this.isScrolling = true;
        this.beginAutoScroll();
      } else {
        console.log('Document is hidden, not starting auto scroll');
      }
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
    console.log('beginAutoScroll called, isScrolling:', this.isScrolling);
    if (!this.isScrolling) return;

    let lastScrollY = window.scrollY;
    let stuckCounter = 0;
    console.log('Starting auto scroll from position:', lastScrollY);

    const scrollStep = () => {
      if (!this.isScrolling) return;

      // Stop scrolling if tab becomes hidden
      if (document.hidden) {
        console.log('Document became hidden, stopping scroll');
        this.stopScrolling();
        return;
      }

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
        console.log(`Scrolling: current=${currentScrollY}, target=${currentScrollY + this.scrollSpeed}, speed=${this.scrollSpeed}`);
        // Method 1: Use scrollBy with smooth behavior
        window.scrollBy({
          top: this.scrollSpeed,
          left: 0,
          behavior: 'smooth'
        });
        console.log('Used scrollBy method');
      } catch (e) {
        console.log('scrollBy failed, using scrollTo fallback:', e);
        // Method 2: Fallback to direct scrollTo
        window.scrollTo(0, currentScrollY + this.scrollSpeed);
        console.log('Used scrollTo fallback method');
      }
    };

    // Start scrolling with a reasonable interval
    this.scrollInterval = setInterval(scrollStep, 100); // 100ms intervals for smooth scrolling
  }

  handleMessage(message, sendResponse) {
    console.log('Content script received message:', message);
    console.log('Current URL:', window.location.href);
    console.log('Document ready state:', document.readyState);
    console.log('Document hidden:', document.hidden);
    
    switch (message.action) {
      case 'startScrolling':
        console.log(`Starting scrolling with delay: ${message.scrollDelay}ms, speed: ${message.scrollSpeed}px`);
        console.log('Current scroll position:', window.scrollY);
        this.startScrolling(message.scrollDelay, message.scrollSpeed);
        sendResponse({ success: true, url: window.location.href });
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

// Handle window focus changes - simplified to not interfere with tab cycling
window.addEventListener('blur', () => {
  // Don't stop scrolling on blur - let the background script handle tab cycling
});

window.addEventListener('focus', () => {
  // Window gained focus - scrolling will be restarted by the background script if needed
});