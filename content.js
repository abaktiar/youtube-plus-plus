// Global variables
let currentSpeed = 1.0;
let defaultSpeed = 1.0;
let toggleSpeed = 1.5;
let currentChannelId = null;
let isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Add CSS for the speed notification
function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #speed-saver-notification {
      position: absolute;
      top: 60px;
      right: 20px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'YouTube Noto', Roboto, Arial, sans-serif;
      font-size: 14px;
      z-index: 9999;
      transition: opacity 0.3s ease-in-out;
      opacity: 1;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

// Function to extract channel ID from URL
function getChannelId() {
  // Try to get channel ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('v')) {
    // We're on a video page, need to extract channel from the page
    const channelElement = document.querySelector(
      'a.yt-simple-endpoint[href^="/channel/"], a.yt-simple-endpoint[href^="/@"]'
    );
    if (channelElement) {
      return channelElement.getAttribute('href').replace(/^\/(@|channel\/)/, '');
    }
  }
  return null;
}

// Function to set video speed
function setVideoSpeed(speed) {
  const video = document.querySelector('video');
  if (video) {
    video.playbackRate = speed;
    currentSpeed = speed;
    console.log(`YouTube Speed Saver: Set speed to ${speed}x`);

    // Update YouTube's UI to reflect the speed change
    updateYouTubeSpeedUI(speed);

    // Save the speed for this channel
    if (currentChannelId) {
      chrome.storage.sync.set({ [currentChannelId]: speed });
    }

    // Also save as the last used speed globally
    chrome.storage.sync.set({ lastSpeed: speed });
  }
}

// Function to update YouTube's playback speed UI
function updateYouTubeSpeedUI(speed) {
  // Method 1: Try to update the speed display directly
  try {
    // Find the speed display element if it exists
    const speedDisplays = document.querySelectorAll('.ytp-menuitem-label');
    speedDisplays.forEach((display) => {
      if (display.textContent.includes('Playback speed')) {
        // Extract the current displayed speed
        const speedText = display.textContent;
        const newSpeedText = speedText.replace(/[\d\.]+x/, `${speed.toFixed(2)}x`);

        // Update the text if needed
        if (speedText !== newSpeedText) {
          // Use a MutationObserver to watch for changes
          const observer = new MutationObserver(() => {
            const speedLabel = display.querySelector('.ytp-menuitem-content');
            if (speedLabel) {
              speedLabel.textContent = `${speed.toFixed(2)}x`;
            }
          });

          observer.observe(display.parentElement, { childList: true, subtree: true });

          // Disconnect after a short time
          setTimeout(() => observer.disconnect(), 1000);
        }
      }
    });

    // Also try to update the speed indicator in the player settings menu
    updateYouTubeSpeedIndicator(speed);
  } catch (e) {
    console.log('Error updating speed display:', e);
  }

  // Method 2: Create a custom notification to show the current speed
  try {
    // Remove any existing notification
    const existingNotification = document.getElementById('speed-saver-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // Create a new notification
    const notification = document.createElement('div');
    notification.id = 'speed-saver-notification';
    notification.textContent = `Speed: ${speed.toFixed(2)}x`;

    // Add to the player
    const player = document.querySelector('.html5-video-player');
    if (player) {
      player.appendChild(notification);

      // Fade out and remove after 2 seconds
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
      }, 2000);
    }
  } catch (e) {
    console.log('Error showing speed notification:', e);
  }

  // Method 3: Dispatch a custom event that YouTube might recognize
  try {
    const video = document.querySelector('video');
    if (video) {
      // Create and dispatch a rate change event
      const event = new CustomEvent('ratechange', { bubbles: true });
      video.dispatchEvent(event);
    }
  } catch (e) {
    console.log('Error dispatching rate change event:', e);
  }
}

// Function to update YouTube's speed indicator in the player settings menu
function updateYouTubeSpeedIndicator(speed) {
  // We'll use a less intrusive approach that doesn't manipulate the UI directly
  // Instead, we'll create a MutationObserver to watch for when the user opens the settings menu

  // First, check if we already have an observer
  if (window.speedObserver) {
    window.speedObserver.disconnect();
  }

  // Create a new observer to watch for the settings menu
  window.speedObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        // Check if the settings menu was added
        const settingsMenu = document.querySelector('.ytp-settings-menu');
        if (settingsMenu && settingsMenu.style.display !== 'none') {
          // Find the playback speed item
          const menuItems = document.querySelectorAll('.ytp-menuitem');
          for (const item of menuItems) {
            const label = item.querySelector('.ytp-menuitem-label');
            if (label && label.textContent.includes('Playback speed')) {
              // Update the content part to show the current speed
              const content = item.querySelector('.ytp-menuitem-content');
              if (content) {
                content.textContent = `${speed.toFixed(2)}x`;
              }
              break;
            }
          }
        }

        // Check if the speed panel was added
        const speedPanel = document.querySelector('.ytp-panel-menu');
        if (speedPanel) {
          // Find all speed options
          const speedOptions = document.querySelectorAll('.ytp-menuitem');
          const speedValues = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

          // Find the closest speed value
          let closestIndex = 0;
          let minDiff = Math.abs(speed - speedValues[0]);

          for (let i = 1; i < speedValues.length; i++) {
            const diff = Math.abs(speed - speedValues[i]);
            if (diff < minDiff) {
              minDiff = diff;
              closestIndex = i;
            }
          }

          // Add a visual indicator to the closest speed option
          for (const option of speedOptions) {
            const label = option.querySelector('.ytp-menuitem-label');
            if (label) {
              const speedText = label.textContent;
              const speedValue = parseFloat(speedText) || (speedText === 'Normal' ? 1 : 0);

              if (Math.abs(speedValue - speedValues[closestIndex]) < 0.01) {
                // Add a visual indicator
                option.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              }
            }
          }
        }
      }
    }
  });

  // Start observing the document for changes
  window.speedObserver.observe(document.body, { childList: true, subtree: true });
}

// Function to toggle between default and fast speed
function toggleVideoSpeed() {
  const video = document.querySelector('video');
  if (video) {
    const newSpeed = Math.abs(video.playbackRate - defaultSpeed) < 0.1 ? toggleSpeed : defaultSpeed;
    setVideoSpeed(newSpeed);
  }
}

// Function to initialize the extension
function initializeExtension() {
  // First, load the default and toggle speeds
  chrome.storage.sync.get(['defaultSpeed', 'toggleSpeed'], (result) => {
    if (result.defaultSpeed) {
      defaultSpeed = result.defaultSpeed;
    }

    if (result.toggleSpeed) {
      toggleSpeed = result.toggleSpeed;
    }

    // After loading default settings, get the channel ID and apply channel-specific speed
    loadChannelSpeed();
  });
}

// Function to load and apply channel-specific speed
function loadChannelSpeed() {
  // Get the channel ID
  currentChannelId = getChannelId();

  if (currentChannelId) {
    // Load saved speed for this channel
    chrome.storage.sync.get([currentChannelId, 'lastSpeed'], (result) => {
      // First try to get channel-specific speed
      if (result[currentChannelId]) {
        console.log(`Loading saved speed for channel ${currentChannelId}: ${result[currentChannelId]}`);
        setVideoSpeed(result[currentChannelId]);
      }
      // If no channel-specific speed, try to use the last used speed
      else if (result.lastSpeed) {
        console.log(`No saved speed for this channel. Using last speed: ${result.lastSpeed}`);
        setVideoSpeed(result.lastSpeed);
      }
    });
  }

  // Add keyboard shortcut listener
  document.addEventListener('keydown', (e) => {
    // Toggle speed with Alt+S (Windows/Linux) or Option+S (Mac)
    if (e.altKey && e.key === 's') {
      e.preventDefault();
      toggleVideoSpeed();
    }
  });
}

// Handle navigation within YouTube (it's a single-page app)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;

    // Wait for the page to load
    setTimeout(() => {
      // When navigating to a new video, we only need to load the channel-specific speed
      // since default/toggle speeds are already loaded
      loadChannelSpeed();
    }, 1500);
  }
}).observe(document, { subtree: true, childList: true });

// Initialize when the content script loads
window.addEventListener('load', () => {
  // Add styles for notifications
  addStyles();

  // Wait for YouTube to fully load
  setTimeout(() => {
    initializeExtension();

    // Add listener for manual speed changes
    listenForManualSpeedChanges();
  }, 1500);
});

// Function to listen for manual speed changes
function listenForManualSpeedChanges() {
  const video = document.querySelector('video');
  if (video) {
    // Listen for ratechange events
    video.addEventListener('ratechange', () => {
      // Only handle if the change wasn't made by our extension
      if (video.playbackRate !== currentSpeed) {
        console.log(`Manual speed change detected: ${video.playbackRate}x`);
        currentSpeed = video.playbackRate;

        // Save the manually set speed
        if (currentChannelId) {
          chrome.storage.sync.set({ [currentChannelId]: currentSpeed });
        }

        // Also save as the last used speed globally
        chrome.storage.sync.set({ lastSpeed: currentSpeed });
      }
    });
  }
}

// Listen for messages from the popup and commands from Chrome
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSpeed') {
    const video = document.querySelector('video');
    if (video) {
      sendResponse({ speed: video.playbackRate, channelId: currentChannelId });
    } else {
      sendResponse({ speed: null, channelId: null });
    }
  } else if (message.action === 'setSpeed') {
    setVideoSpeed(message.speed);
    sendResponse({ success: true });
  } else if (message.action === 'toggleSpeed') {
    toggleVideoSpeed();
    const video = document.querySelector('video');
    sendResponse({ speed: video ? video.playbackRate : null });
  } else if (message.action === 'setDefaultSpeed') {
    defaultSpeed = message.speed;
    sendResponse({ success: true });
  } else if (message.action === 'setToggleSpeed') {
    toggleSpeed = message.speed;
    sendResponse({ success: true });
  }
  return true; // Keep the message channel open for async response
});

// Listen for Chrome commands
chrome.runtime.onMessage.addListener((request) => {
  if (request.command === 'toggle-speed') {
    toggleVideoSpeed();
  }
}); 