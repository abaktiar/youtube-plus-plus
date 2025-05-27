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

// Function to extract channel ID and Name from URL or page content
function getChannelInfo() {
  let channelId = null;
  let channelName = null;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');

    if (videoId) { // We are on a video page
      // Attempt 1: Primary owner element (modern YouTube layout)
      // Selector for link: #owner #channel-name #container #text-container #text a
      // Selector for name: #owner #channel-name #container #text-container #text a
      let ownerLinkElement = document.querySelector('ytd-video-owner-renderer .ytd-channel-name a.yt-simple-endpoint, a.yt-simple-endpoint.yt-formatted-string[href^="/@"], a.yt-simple-endpoint.yt-formatted-string[href^="/channel/"]');
      
      if (!ownerLinkElement) {
          // Attempt 2: Fallback for potentially different structures or older layouts
          // This targets the text part of the link specifically for name, and href for ID.
          ownerLinkElement = document.querySelector('#owner-name a, #upload-info .ytd-channel-name a, .video-secondary-info-renderer .ytd-channel-name a');
      }

      if (ownerLinkElement) {
        const href = ownerLinkElement.getAttribute('href');
        if (href) {
          channelId = href.replace(/^\/(@|channel\/)/, '');
        }
        channelName = ownerLinkElement.textContent ? ownerLinkElement.textContent.trim() : null;
      }

      // Attempt 3: Using meta tags if primary selectors fail
      if (!channelId) {
        const metaChannelId = document.querySelector('meta[itemprop="channelId"]');
        if (metaChannelId) {
          channelId = metaChannelId.getAttribute('content');
        }
      }
      if (!channelName) {
         // Try to get from <meta itemprop="author" content="Channel Name">
        const metaAuthor = document.querySelector('meta[itemprop="author"]');
        if (metaAuthor) {
            channelName = metaAuthor.getAttribute('content');
        }
      }
      
      // Attempt 4: Fallback using itemprop="author" and itemprop="url" (less specific)
      if (!channelId || !channelName) {
        const authorElement = document.querySelector('[itemprop="author"] [itemprop="url"]');
        if (authorElement) {
          if (!channelId && authorElement.getAttribute('href')) {
            channelId = authorElement.getAttribute('href').replace(/^\/(@|channel\/)/, '');
          }
          // This might not be the most reliable name, could be "Google" or something generic if not specific enough
          if (!channelName && authorElement.querySelector('[itemprop="name"]')) {
            channelName = authorElement.querySelector('[itemprop="name"]').getAttribute('content');
          } else if (!channelName && authorElement.textContent) {
            // Fallback to textContent of the author link if a more specific name isn't found
            // This is less reliable as it might include extra text.
          }
        }
      }

      // If channelId is still null but we have a videoId, create a placeholder ID
      if (!channelId && videoId) {
        channelId = 'video_' + videoId;
      }
      // If channelName is still null but we have a channelId, use channelId as name
      if (!channelName && channelId) {
        channelName = channelId.startsWith('video_') ? 'Video Page' : channelId; // Make it a bit more descriptive if it's a video_ ID
      }
      
    } // End of if(videoId)
  } catch (error) {
    console.error('YouTube++: Error getting channel info:', error);
  }

  // If after all attempts, channelName is still null, but channelId is found, use channelId as name.
  if (channelId && !channelName) {
    channelName = channelId;
  }
  // If no channelId, then name should be N/A or similar
  if (!channelId) {
    channelName = 'N/A'; // Or null, to be handled by caller
  }
  
  return { id: channelId, name: channelName };
}


// Function to set video speed
function setVideoSpeed(speed) {
  const video = document.querySelector('video');
  if (video) {
    video.playbackRate = speed;
    currentSpeed = speed;
    console.log(`YouTube++: Set speed to ${speed}x`);

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

    // Get the channel ID and Name
    const channelInfo = getChannelInfo();
    currentChannelId = channelInfo.id; // Keep global currentChannelId for storage keys

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
    toggleVideoSpeed(); // This function updates global currentSpeed via setVideoSpeed

    // After toggling, inform the popup if it's open
    // popup.js is listening for "updatePopupDisplay" with "currentSpeed"
    chrome.runtime.sendMessage({ action: "updatePopupDisplay", currentSpeed: currentSpeed }, (response) => {
      if (chrome.runtime.lastError) {
        // This error is expected if the popup is not open.
        // console.log("Popup not open or ready to receive speed update:", chrome.runtime.lastError.message);
      } else {
        // console.log("Popup updated with new speed via shortcut.");
      }
    });
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
  console.log('YouTube++: Page loaded');

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
  if (message.action === 'getInitialData') {
    const video = document.querySelector('video');
    const channelInfo = getChannelInfo(); // { id: string|null, name: string|null }

    if (video && channelInfo.id) { // Considered a YouTube video page if we have a video and a channel ID
      chrome.storage.sync.get(['defaultSpeed', 'toggleSpeed'], (settings) => {
        // Use stored settings or global defaults
        const effectiveDefaultSpeed = settings.defaultSpeed !== undefined ? settings.defaultSpeed : defaultSpeed;
        const effectiveToggleSpeed = settings.toggleSpeed !== undefined ? settings.toggleSpeed : toggleSpeed;
        
        // Update global variables if they were loaded from storage and are different
        if (settings.defaultSpeed !== undefined) defaultSpeed = settings.defaultSpeed;
        if (settings.toggleSpeed !== undefined) toggleSpeed = settings.toggleSpeed;

        sendResponse({
          isYouTubePage: true,
          channelId: channelInfo.id,
          channelName: channelInfo.name || channelInfo.id || 'N/A', // Fallback for channelName
          currentSpeed: video.playbackRate,
          defaultSpeed: effectiveDefaultSpeed,
          toggleSpeed: effectiveToggleSpeed
        });
      });
    } else { // Not on a YouTube video page or unable to determine video/channel
      chrome.storage.sync.get(['defaultSpeed', 'toggleSpeed'], (settings) => {
        const effectiveDefaultSpeed = settings.defaultSpeed !== undefined ? settings.defaultSpeed : defaultSpeed;
        const effectiveToggleSpeed = settings.toggleSpeed !== undefined ? settings.toggleSpeed : toggleSpeed;
        sendResponse({
          isYouTubePage: false,
          channelId: null,
          channelName: 'Not on a YouTube page', // Specific message for this case
          currentSpeed: null,
          defaultSpeed: effectiveDefaultSpeed,
          toggleSpeed: effectiveToggleSpeed
        });
      });
    }
    return true; // Indicate asynchronous response
  } else if (message.action === 'saveSettings') {
    const newDefaultSpeed = message.defaultSpeed;
    const newToggleSpeed = message.toggleSpeed;

    if (typeof newDefaultSpeed !== 'number' || typeof newToggleSpeed !== 'number' ||
        newDefaultSpeed <= 0 || newToggleSpeed <= 0 || newDefaultSpeed > 16 || newToggleSpeed > 16) {
      sendResponse({ success: false, message: "Invalid speed values." });
      return false; // Synchronous response
    }
    if (newDefaultSpeed === newToggleSpeed) {
      sendResponse({ success: false, message: "Default and toggle speeds must be different."});
      return false; // Synchronous response
    }

    defaultSpeed = newDefaultSpeed;
    toggleSpeed = newToggleSpeed;

    chrome.storage.sync.set({ defaultSpeed: newDefaultSpeed, toggleSpeed: newToggleSpeed }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, message: chrome.runtime.lastError.message });
      } else {
        // Check if current video speed needs to be updated if it was using old default
        const video = document.querySelector('video');
        let newCurrentSpeed = currentSpeed; // Keep existing unless it needs to change
        if (video) {
            // If the video's current speed was the *old* default, and it's not the new default speed,
            // it might be intuitive for some users if it updated to the new default.
            // However, current task doesn't explicitly state this. For now, we only update if speed *was* the default.
            // A more robust approach might be to see if currentSpeed was old default OR old toggle.
            // For now, let's assume the user wants the current speed to persist unless it was the default.
            // The task asks to respond with newCurrentSpeed if it changed.
            // This part is tricky: what if the current speed was the *old* defaultSpeed?
            // Let's assume for now that saving settings doesn't automatically change the *current* playback speed
            // unless explicitly designed to do so. The popup currently updates its display of current speed
            // if this response includes `newCurrentSpeed`.
             sendResponse({ success: true, savedSettings: { defaultSpeed: newDefaultSpeed, toggleSpeed: newToggleSpeed } });
        } else {
             sendResponse({ success: true, savedSettings: { defaultSpeed: newDefaultSpeed, toggleSpeed: newToggleSpeed } });
        }
      }
    });
    return true; // Indicate asynchronous response
  } else if (message.action === 'popupToggleSpeed') {
    toggleVideoSpeed(); // This function internally calls setVideoSpeed which updates global currentSpeed
    sendResponse({ newSpeed: currentSpeed }); // currentSpeed is updated by setVideoSpeed
    return false; // Synchronous response, as toggleVideoSpeed -> setVideoSpeed is sync.
  } else if (message.action === 'getSpeed') { // Existing actions, ensure they still work
    const video = document.querySelector('video');
    if (video) {
      sendResponse({ speed: video.playbackRate, channelId: currentChannelId });
    } else {
      sendResponse({ speed: null, channelId: null });
    }
    return false;
  } else if (message.action === 'setSpeed') {
    setVideoSpeed(message.speed);
    sendResponse({ success: true });
    return false;
  } else if (message.action === 'toggleSpeed') { // This seems like a legacy or direct command, distinct from popupToggleSpeed
    toggleVideoSpeed();
    const video = document.querySelector('video');
    sendResponse({ speed: video ? video.playbackRate : null });
     return false;
  } else if (message.action === 'setDefaultSpeed') { // Likely legacy, prefer saveSettings
    defaultSpeed = message.speed;
    chrome.storage.sync.set({ defaultSpeed: defaultSpeed });
    sendResponse({ success: true });
    return false;
  } else if (message.action === 'setToggleSpeed') { // Likely legacy, prefer saveSettings
    toggleSpeed = message.speed;
    chrome.storage.sync.set({ toggleSpeed: toggleSpeed });
    sendResponse({ success: true });
    return false;
  }
  // It's good practice to return true for async and false for sync if not all paths do.
  // However, if an action is not handled, it should not return true.
  // If no message.action matches, it will implicitly return undefined (falsy).
});

// Listen for Chrome commands (e.g., from keyboard shortcuts in manifest.json)
// This listener should be separate from the one handling messages from popup/other extension parts.
// Or ensure that command listener doesn't interfere with return true; requirement of other messages.
// For now, the provided code has two listeners, which is fine.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { // Renamed 'message' to 'request' to avoid conflict if merged
  if (request.command === 'toggle-speed') {
    toggleVideoSpeed();
    // This is a command, usually doesn't need a response unless specified.
    // If it needed to update popup, it would do so via a separate sendMessage here.
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