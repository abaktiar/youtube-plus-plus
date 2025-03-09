// Global variables
let currentSpeed = 1.0;
let defaultSpeed = 1.0;
let toggleSpeed = 1.5;
let currentChannelId = null;
let isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

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

    // Save the speed for this channel
    if (currentChannelId) {
      chrome.storage.sync.set({ [currentChannelId]: speed });
    }
  }
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
  // Get the channel ID
  currentChannelId = getChannelId();

  if (currentChannelId) {
    // Load saved speed for this channel
    chrome.storage.sync.get(currentChannelId, (result) => {
      if (result[currentChannelId]) {
        setVideoSpeed(result[currentChannelId]);
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
      initializeExtension();
    }, 1500);
  }
}).observe(document, { subtree: true, childList: true });

// Initialize when the content script loads
window.addEventListener('load', () => {
  // Wait for YouTube to fully load
  setTimeout(() => {
    initializeExtension();
  }, 1500);
});

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