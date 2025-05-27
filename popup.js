document.addEventListener('DOMContentLoaded', () => {
  const shortcutElement = document.getElementById('shortcut');
  const currentChannelElement = document.getElementById('currentChannel');
  const currentSpeedElement = document.getElementById('currentSpeed');
  const defaultSpeedInput = document.getElementById('defaultSpeed');
  const toggleSpeedInput = document.getElementById('toggleSpeed');
  const saveSettingsButton = document.getElementById('saveSettings');
  const toggleButton = document.getElementById('toggleButton');
  const saveStatusElement = document.getElementById('saveStatus');

  // 1. Set up keyboard shortcut display
  if (shortcutElement) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    shortcutElement.textContent = isMac ? 'Option+S' : 'Alt+S';
  } else {
    console.error("Element with ID 'shortcut' not found in popup.html.");
  }

  // Function to update UI elements based on data from content script
  function updateUI(data) {
    if (data && data.isYouTubePage) {
      if (currentChannelElement) currentChannelElement.textContent = data.channelName || 'N/A (No channel found)';
      if (currentSpeedElement) currentSpeedElement.textContent = data.currentSpeed ? `${data.currentSpeed}x` : 'N/A';
      if (defaultSpeedInput) defaultSpeedInput.value = data.defaultSpeed !== undefined ? data.defaultSpeed : 1.0;
      if (toggleSpeedInput) toggleSpeedInput.value = data.toggleSpeed !== undefined ? data.toggleSpeed : 2.0;

      // Enable inputs and buttons
      if (defaultSpeedInput) defaultSpeedInput.disabled = false;
      if (toggleSpeedInput) toggleSpeedInput.disabled = false;
      if (saveSettingsButton) saveSettingsButton.disabled = false;
      if (toggleButton) toggleButton.disabled = false;
      if (currentChannelElement) currentChannelElement.style.color = "";
      if (currentSpeedElement) currentSpeedElement.style.color = "";
    } else {
      // Not on a YouTube page or an error occurred
      const statusMessage = (data && data.reason === "noActiveTab") ? "Cannot connect to tab." : "Load a YouTube video to use.";
      if (currentChannelElement) {
        currentChannelElement.textContent = (data && data.isYouTubePage === false) ? 'Not on a YouTube page' : 'Error loading data';
        currentChannelElement.style.color = "red";
      }
      if (currentSpeedElement) {
        currentSpeedElement.textContent = 'N/A';
        currentSpeedElement.style.color = "red";
      }
      if (defaultSpeedInput) defaultSpeedInput.value = '';
      if (toggleSpeedInput) toggleSpeedInput.value = '';

      // Disable inputs and buttons
      if (defaultSpeedInput) defaultSpeedInput.disabled = true;
      if (toggleSpeedInput) toggleSpeedInput.disabled = true;
      if (saveSettingsButton) saveSettingsButton.disabled = true;
      if (toggleButton) toggleButton.disabled = true;
      if (saveStatusElement) saveStatusElement.textContent = statusMessage;
    }
  }

  // 2. Send message to content.js to get initial data
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      // Check if the tab URL is a YouTube page before sending the message
      if (tabs[0].url && (tabs[0].url.includes("youtube.com/") || tabs[0].url.includes("youtu.be/"))) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "getInitialData" }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn("Error sending getInitialData to content script:", chrome.runtime.lastError.message);
            updateUI({ isYouTubePage: false, reason: "lastError", message: chrome.runtime.lastError.message });
          } else if (response) {
            updateUI(response); // response should include isYouTubePage
          } else {
            console.warn("No response from content script for getInitialData. Content script might not be ready.");
            // This can happen if the content script hasn't fully loaded/injected.
            updateUI({ isYouTubePage: false, reason: "noResponseDelayed" });
          }
        });
      } else {
        // Active tab is not a YouTube page
        updateUI({ isYouTubePage: false, reason: "notYouTube" });
      }
    } else {
      // No active tab or tab ID
      console.warn("No active tab with ID found.");
      updateUI({ isYouTubePage: false, reason: "noActiveTab" });
    }
  });

  // 3. "Save Settings" button event listener
  if (saveSettingsButton) {
    saveSettingsButton.addEventListener('click', () => {
      if (!defaultSpeedInput || !toggleSpeedInput || !saveStatusElement) {
        console.error("One or more UI elements for save settings are missing.");
        return;
      }
      const defaultSpeed = parseFloat(defaultSpeedInput.value);
      const toggleSpeed = parseFloat(toggleSpeedInput.value);

      saveStatusElement.textContent = ''; 
      saveStatusElement.style.color = 'red'; 

      if (isNaN(defaultSpeed) || defaultSpeed <= 0 || defaultSpeed > 16) {
        saveStatusElement.textContent = 'Default Speed: 0.1-16.';
        return;
      }
      if (isNaN(toggleSpeed) || toggleSpeed <= 0 || toggleSpeed > 16) {
        saveStatusElement.textContent = 'Toggle Speed: 0.1-16.';
        return;
      }
      if (defaultSpeed === toggleSpeed) {
          saveStatusElement.textContent = 'Speeds must be different.';
          return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "saveSettings",
            defaultSpeed: defaultSpeed,
            toggleSpeed: toggleSpeed
          }, (response) => {
            if (chrome.runtime.lastError) {
              saveStatusElement.textContent = 'Error saving settings.';
              console.warn("Error sending saveSettings message:", chrome.runtime.lastError.message);
            } else if (response && response.success) {
              saveStatusElement.textContent = 'Settings Saved!';
              saveStatusElement.style.color = 'green';
              if (response.newCurrentSpeed && currentSpeedElement) {
                  currentSpeedElement.textContent = `${response.newCurrentSpeed}x`;
              }
              if (response.savedSettings) { // Reflect actual saved values
                if (defaultSpeedInput) defaultSpeedInput.value = response.savedSettings.defaultSpeed;
                if (toggleSpeedInput) toggleSpeedInput.value = response.savedSettings.toggleSpeed;
              }
            } else {
              saveStatusElement.textContent = (response && response.message) ? response.message : 'Failed to save settings.';
            }
            setTimeout(() => { if (saveStatusElement) saveStatusElement.textContent = ''; }, 3000);
          });
        } else {
            if (saveStatusElement) saveStatusElement.textContent = 'Cannot communicate with the active tab.';
        }
      });
    });
  } else {
    console.error("Element with ID 'saveSettings' not found in popup.html.");
  }

  // 4. "Toggle Current Speed" button event listener
  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "popupToggleSpeed" }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn("Error sending popupToggleSpeed message:", chrome.runtime.lastError.message);
              if (currentSpeedElement) currentSpeedElement.textContent = 'Error';
            } else if (response && response.newSpeed !== undefined) {
              if (currentSpeedElement) currentSpeedElement.textContent = `${response.newSpeed}x`;
            } else {
                 if (currentSpeedElement) currentSpeedElement.textContent = 'N/A';
            }
          });
        } else {
            if(currentSpeedElement) currentSpeedElement.textContent = 'Error';
        }
      });
    });
  } else {
    console.error("Element with ID 'toggleButton' not found in popup.html.");
  }

  // 5. Message Handling from other parts of the extension (e.g., content.js)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Check if the message is intended for the popup and has an action
    if (message.action === "updatePopupDisplay") {
      if (message.currentSpeed !== undefined && currentSpeedElement) {
        currentSpeedElement.textContent = `${message.currentSpeed}x`;
      }
      // Potentially update other elements like channel name if it changes dynamically
      // and content script sends an update.
      // if (message.channelName && currentChannelElement) {
      //   currentChannelElement.textContent = message.channelName;
      // }
    }
    // Return true to indicate that you wish to send a response asynchronously.
    // This is important if you might call sendResponse after the listener function returns.
    // For this specific listener, it might not be strictly necessary if all updates are synchronous,
    // but it's good practice.
    return true; 
  });
});