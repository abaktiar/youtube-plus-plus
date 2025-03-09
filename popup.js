// DOM elements
const currentChannelElement = document.getElementById('current-channel');
const currentSpeedElement = document.getElementById('current-speed');
const defaultSpeedInput = document.getElementById('default-speed');
const toggleSpeedInput = document.getElementById('toggle-speed');
const toggleButton = document.getElementById('toggle-btn');
const saveButton = document.getElementById('save-btn');
const shortcutTextElement = document.getElementById('shortcut-text');

// Global variables
let currentTabId = null;
let defaultSpeed = 1.0;
let toggleSpeed = 1.5;
let isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Update shortcut text based on platform
if (isMac) {
  shortcutTextElement.textContent = 'Option+S';
} else {
  shortcutTextElement.textContent = 'Alt+S';
}

// Load saved settings
function loadSettings() {
  chrome.storage.sync.get(['defaultSpeed', 'toggleSpeed'], (result) => {
    if (result.defaultSpeed) {
      defaultSpeed = result.defaultSpeed;
      defaultSpeedInput.value = defaultSpeed;
    }
    
    if (result.toggleSpeed) {
      toggleSpeed = result.toggleSpeed;
      toggleSpeedInput.value = toggleSpeed;
    }
  });
}

// Save settings
function saveSettings() {
  defaultSpeed = parseFloat(defaultSpeedInput.value);
  toggleSpeed = parseFloat(toggleSpeedInput.value);
  
  chrome.storage.sync.set({
    defaultSpeed: defaultSpeed,
    toggleSpeed: toggleSpeed
  });
  
  // Send settings to content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('youtube.com')) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'setDefaultSpeed',
        speed: defaultSpeed
      });
      
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'setToggleSpeed',
        speed: toggleSpeed
      });
    }
  });
}

// Toggle speed
function toggleSpeed() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('youtube.com')) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleSpeed' }, (response) => {
        if (response && response.speed !== null) {
          currentSpeedElement.textContent = response.speed.toFixed(2);
        }
      });
    }
  });
}

// Get current speed and channel info
function getCurrentInfo() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('youtube.com')) {
      currentTabId = tabs[0].id;
      
      chrome.tabs.sendMessage(currentTabId, { action: 'getSpeed' }, (response) => {
        if (response) {
          if (response.speed !== null) {
            currentSpeedElement.textContent = response.speed.toFixed(2);
          }
          
          if (response.channelId) {
            currentChannelElement.textContent = response.channelId;
          } else {
            currentChannelElement.textContent = 'Not detected';
          }
        }
      });
    } else {
      currentChannelElement.textContent = 'Not on YouTube';
      currentSpeedElement.textContent = 'N/A';
    }
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Load settings
  loadSettings();
  
  // Get current info
  getCurrentInfo();
  
  // Add event listeners
  toggleButton.addEventListener('click', toggleSpeed);
  saveButton.addEventListener('click', saveSettings);
}); 