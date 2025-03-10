// Global variables
let currentSpeed = 1.0;
let defaultSpeed = 1.0;
let toggleSpeed = 1.5;
let currentChannelId = null;
let isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
let loadingRetryCount = 0;
let maxRetries = 5;

// Debouncing variables
let loadChannelSpeedTimer = null;
let lastLoadTime = 0;
let minTimeBetweenLoads = 2000; // Minimum 2 seconds between load attempts
let isProcessingChannelSpeed = false;
let pendingStorageWrites = {};
let storageWriteTimer = null;

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

// Function to extract channel ID from URL with improved detection
function getChannelId() {
  try {
    // Try to get channel ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('v')) {
      // We're on a video page, need to extract channel from the page
      const channelElement = document.querySelector(
        'a.yt-simple-endpoint[href^="/channel/"], a.yt-simple-endpoint[href^="/@"], #owner-name a'
      );

      if (channelElement) {
        return channelElement.getAttribute('href').replace(/^\/(@|channel\/)/, '');
      }

      // Fallback method for cases where the usual selectors don't work
      const ownerElement = document.querySelector('[itemprop="author"] [itemprop="url"], #owner #channel-name');
      if (ownerElement) {
        const href = ownerElement.getAttribute('href');
        if (href) {
          return href.replace(/^\/(@|channel\/)/, '');
        } else if (ownerElement.textContent) {
          // Use a hashed version of the channel name if that's all we have
          return 'channel_' + ownerElement.textContent.trim();
        }
      }

      // Final fallback - use video ID as pseudo-channel
      return 'video_' + urlParams.get('v');
    }
  } catch (error) {
    console.error('Error getting channel ID:', error);
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

    // Queue the storage writes instead of executing them immediately
    queueStorageWrite(currentChannelId, speed);
  }
}

// Queue storage writes and execute them in batch to avoid quota limits
function queueStorageWrite(channelId, speed) {
  // Add to pending writes
  if (channelId) {
    pendingStorageWrites[channelId] = speed;
  }

  pendingStorageWrites['lastSpeed'] = speed;

  // Clear any existing timer
  if (storageWriteTimer) {
    clearTimeout(storageWriteTimer);
  }

  // Set a new timer to flush writes after a delay
  storageWriteTimer = setTimeout(() => {
    flushStorageWrites();
  }, 2000);
}

// Flush all pending storage writes
function flushStorageWrites() {
  if (Object.keys(pendingStorageWrites).length > 0) {
    console.log('Flushing pending storage writes:', pendingStorageWrites);
    chrome.storage.sync.set(pendingStorageWrites, () => {
      if (chrome.runtime.lastError) {
        console.error('Error writing to storage:', chrome.runtime.lastError);
      } else {
        console.log('Storage writes completed successfully');
      }
      pendingStorageWrites = {};
    });
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
    debouncedLoadChannelSpeed();
  });
}

// Debounced version of loadChannelSpeed to prevent rapid consecutive calls
function debouncedLoadChannelSpeed() {
  const now = Date.now();

  // If we're already processing or it's too soon since the last load, debounce
  if (isProcessingChannelSpeed || now - lastLoadTime < minTimeBetweenLoads) {
    console.log('Debouncing loadChannelSpeed call');

    // Clear any existing timer
    if (loadChannelSpeedTimer) {
      clearTimeout(loadChannelSpeedTimer);
    }

    // Set a new timer
    loadChannelSpeedTimer = setTimeout(() => {
      loadChannelSpeed();
    }, minTimeBetweenLoads);

    return;
  }

  // Update timestamp and start processing
  lastLoadTime = now;
  loadChannelSpeed();
}

// Function to load and apply channel-specific speed with improved reliability
function loadChannelSpeed() {
  // Set flag to prevent concurrent processing
  if (isProcessingChannelSpeed) {
    console.log('Already processing channel speed. Skipping this call.');
    return;
  }

  isProcessingChannelSpeed = true;

  try {
    // Reset retry counter if this is a new attempt (not a retry)
    if (loadingRetryCount === 0) {
      console.log('Attempting to load channel speed...');
    }

    // Get the channel ID
    currentChannelId = getChannelId();

    // If no video is found yet, retry a few times with increasing delays
    const video = document.querySelector('video');
    if (!video && loadingRetryCount < maxRetries) {
      loadingRetryCount++;
      console.log(
        `Video element not found yet. Retry ${loadingRetryCount}/${maxRetries} in ${loadingRetryCount * 500}ms...`
      );
      setTimeout(() => {
        isProcessingChannelSpeed = false;
        loadChannelSpeed();
      }, loadingRetryCount * 500);
      return;
    }

    // Reset retry counter for next time
    loadingRetryCount = 0;

    if (currentChannelId && video) {
      console.log(`Channel ID detected: ${currentChannelId}`);

      // Check if we've visited this channel before
      chrome.storage.sync.get([currentChannelId, 'lastSpeed', 'visitedChannels'], (result) => {
        try {
          const visitedChannels = result.visitedChannels || {};

          // First check if we have a saved speed for this specific channel
          if (result[currentChannelId]) {
            console.log(`Loading saved speed for channel ${currentChannelId}: ${result[currentChannelId]}x`);
            setVideoSpeed(result[currentChannelId]);
          }
          // If this is a new channel (we haven't explicitly set a speed for it yet)
          else {
            if (result.lastSpeed) {
              console.log(`New channel detected. Using last speed: ${result.lastSpeed}x`);
              setVideoSpeed(result.lastSpeed);
            } else {
              // Fallback to default if we don't even have a last speed
              console.log(`No last speed found. Using default: ${defaultSpeed}x`);
              setVideoSpeed(defaultSpeed);
            }
          }

          // Mark this channel as visited, but don't write immediately for every channel
          // Only do this for new channels we haven't seen before
          if (!visitedChannels[currentChannelId]) {
            visitedChannels[currentChannelId] = true;

            // Add to the batch of writes
            pendingStorageWrites['visitedChannels'] = visitedChannels;

            if (!storageWriteTimer) {
              storageWriteTimer = setTimeout(() => {
                flushStorageWrites();
              }, 2000);
            }
          }

          // Setup event listeners
          setupEventListeners();
        } finally {
          // Always release the lock when done
          isProcessingChannelSpeed = false;
        }
      });
    } else {
      if (video) {
        console.log('Channel ID not detected, but video exists. Using default speed.');
        // If we can't detect a channel but have a video, use default or last speed
        chrome.storage.sync.get(['lastSpeed'], (result) => {
          try {
            if (result.lastSpeed) {
              setVideoSpeed(result.lastSpeed);
            } else {
              setVideoSpeed(defaultSpeed);
            }

            // Setup event listeners
            setupEventListeners();
          } finally {
            // Always release the lock when done
            isProcessingChannelSpeed = false;
          }
        });
      } else {
        console.log('No video element found. Unable to set speed.');
        isProcessingChannelSpeed = false;
      }
    }
  } catch (error) {
    console.error('Error in loadChannelSpeed:', error);
    isProcessingChannelSpeed = false;
  }
}

// Set up all event listeners in one place to avoid duplicates
function setupEventListeners() {
  // Remove existing listeners to avoid duplicates
  document.removeEventListener('keydown', handleKeyDown);

  // Add keyboard shortcut listener
  document.addEventListener('keydown', handleKeyDown);

  // Listen for manual speed changes
  listenForManualSpeedChanges();
}

// Handler for keyboard shortcuts
function handleKeyDown(e) {
  // Toggle speed with Alt+S (Windows/Linux) or Option+S (Mac)
  if (e.altKey && e.key === 's') {
    e.preventDefault();
    toggleVideoSpeed();
  }
}

// Handle navigation within YouTube (it's a single-page app)
let lastUrl = location.href;
const navigationObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    console.log('URL changed. Waiting for page to load...');

    // Reset retry counter
    loadingRetryCount = 0;

    // Wait for the page to load
    setTimeout(() => {
      // Use the debounced version
      debouncedLoadChannelSpeed();
    }, 1000);
  }
});
navigationObserver.observe(document, { subtree: true, childList: true });

// Function to check if the video player has been reloaded/refreshed
function checkForVideoPlayerChanges() {
  let lastVideoElement = document.querySelector('video');
  let videoCheckCount = 0;

  const videoPlayerObserver = new MutationObserver((mutations) => {
    // Limit how often we check to avoid excessive processing
    videoCheckCount++;
    if (videoCheckCount % 5 !== 0) return;

    const currentVideo = document.querySelector('video');

    // Only react if the video element has changed and isn't null
    if (currentVideo && currentVideo !== lastVideoElement) {
      console.log('Video player refreshed or replaced. Reapplying speed settings...');
      lastVideoElement = currentVideo;

      // Use debounced version
      debouncedLoadChannelSpeed();
    }
  });

  // Observe the player container for changes, but at a higher level
  // to avoid triggering too many unnecessary observations
  const playerContainer = document.querySelector('body');
  if (playerContainer) {
    videoPlayerObserver.observe(playerContainer, {
      childList: true,
      subtree: true,
      // Use a filter to reduce the number of callbacks
      attributes: false,
      characterData: false,
    });
  }
}

// Initialize when the content script loads
window.addEventListener('load', () => {
  console.log('YouTube Speed Saver: Page loaded');

  // Add styles for notifications
  addStyles();

  // Wait for YouTube to fully load
  console.log('Waiting for YouTube to initialize...');
  setTimeout(() => {
    initializeExtension();
    checkForVideoPlayerChanges();
  }, 1500);
});

// Re-initialize on page visibility changes (helps with tab switching)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    console.log('Tab became visible. Checking if speed needs to be reapplied...');

    // Throttle the visibility handler to prevent rapid calls
    if (Date.now() - lastLoadTime < minTimeBetweenLoads) {
      console.log('Throttling visibility change handler');
      return;
    }

    const video = document.querySelector('video');
    if (video) {
      chrome.storage.sync.get([currentChannelId, 'lastSpeed'], (result) => {
        // If there's a mismatch between current speed and stored speed, reapply
        const expectedSpeed = result[currentChannelId] || result.lastSpeed || defaultSpeed;
        if (Math.abs(video.playbackRate - expectedSpeed) > 0.01) {
          console.log('Speed mismatch detected. Reapplying speed settings...');
          debouncedLoadChannelSpeed();
        }
      });
    }
  }
});

// Function to listen for manual speed changes
function listenForManualSpeedChanges() {
  const video = document.querySelector('video');
  if (video) {
    // Remove existing listeners to avoid duplicates
    video.removeEventListener('ratechange', handleRateChange);

    // Listen for ratechange events
    video.addEventListener('ratechange', handleRateChange);
  }
}

// Handler for rate change events
function handleRateChange() {
  const video = document.querySelector('video');
  if (video) {
    // Only handle if the change wasn't made by our extension
    if (Math.abs(video.playbackRate - currentSpeed) > 0.01) {
      console.log(`Manual speed change detected: ${video.playbackRate}x`);
      currentSpeed = video.playbackRate;

      // Queue writes instead of writing immediately
      queueStorageWrite(currentChannelId, currentSpeed);
    }
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

// Clean up before unload
window.addEventListener('beforeunload', () => {
  // Make sure any pending writes are flushed
  flushStorageWrites();

  // Clean up observers
  if (window.speedObserver) {
    window.speedObserver.disconnect();
  }

  navigationObserver.disconnect();
});