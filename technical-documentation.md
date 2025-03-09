# YouTube Speed Saver - Technical Documentation

## Overview

YouTube Speed Saver is a Chrome extension that remembers and applies user-preferred playback speeds for each YouTube channel. It allows users to toggle between default and custom speeds using keyboard shortcuts and provides a user-friendly interface for managing speed settings.

## Architecture

The extension consists of the following components:

1. **Manifest File** (`manifest.json`): Defines the extension's metadata, permissions, and structure
2. **Content Script** (`content.js`): Runs in the context of YouTube pages to control video playback
3. **Popup Interface** (`popup.html` and `popup.js`): Provides user interface for viewing and changing settings
4. **Background Script** (`background.js`): Handles global keyboard shortcuts

## Component Details

### Manifest File

The manifest uses Manifest V3 and defines:
- Basic extension information (name, version, description)
- Required permissions (`storage`, `tabs`)
- Host permissions (YouTube domains)
- Content scripts to inject
- Background service worker
- Keyboard shortcuts
- Icon assets

```json
{
  "manifest_version": 3,
  "name": "YouTube Speed Saver",
  "version": "1.0",
  "description": "Remembers playback speed per YouTube channel and allows easy speed toggling",
  "permissions": ["storage", "tabs"],
  "host_permissions": ["*://*.youtube.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "commands": {
    "toggle-speed": {
      "suggested_key": {
        "default": "Alt+S",
        "mac": "Alt+S"
      },
      "description": "Toggle between default and fast playback speeds"
    }
  }
}
```

### Content Script

The content script is the core of the extension, responsible for:

#### Channel Detection
- Uses multiple methods to detect the current YouTube channel:
  - Primary method: Searches for channel links in video metadata
  - Secondary method: Extracts from video owner section
  - Fallback method: Uses video ID when channel can't be determined
- Stores channel names alongside IDs for better user experience

```javascript
function getChannelId() {
  try {
    // Multiple detection methods with fallbacks
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('v')) {
      const channelElement = document.querySelector(
        'a.yt-simple-endpoint[href^="/channel/"], a.yt-simple-endpoint[href^="/@"], #owner-name a'
      );
      
      if (channelElement) {
        const channelId = channelElement.getAttribute('href').replace(/^\/(@|channel\/)/, '');
        const channelName = channelElement.textContent.trim();
        
        // Store the channel name for later use
        if (channelName) {
          chrome.storage.sync.set({ [`channelName_${channelId}`]: channelName });
        }
        
        return channelId;
      }
      // Additional fallback methods...
    }
  } catch (error) {
    console.error('Error getting channel ID:', error);
  }
  return null;
}
```

#### Speed Management
- Sets video playback speed: `setVideoSpeed(speed)`
- Toggles between default and custom speeds: `toggleVideoSpeed()`
- Updates YouTube's UI to reflect speed changes: `updateYouTubeSpeedUI(speed)`
- Persists speed settings per channel in Chrome's storage API
- Maintains a global "last speed" for new channels

```javascript
function setVideoSpeed(speed) {
  const video = document.querySelector('video');
  if (video) {
    video.playbackRate = speed;
    currentSpeed = speed;
    
    // Update UI and save settings
    updateYouTubeSpeedUI(speed);
    
    if (currentChannelId) {
      chrome.storage.sync.set({ [currentChannelId]: speed });
    }
    
    chrome.storage.sync.set({ 'lastSpeed': speed });
  }
}

function toggleVideoSpeed() {
  const video = document.querySelector('video');
  if (video) {
    const newSpeed = Math.abs(video.playbackRate - defaultSpeed) < 0.1 ? toggleSpeed : defaultSpeed;
    setVideoSpeed(newSpeed);
  }
}
```

#### Initialization and Navigation
- Initializes when the page loads: `initializeExtension()`
- Handles YouTube's single-page app navigation
- Loads channel-specific speeds: `loadChannelSpeed()`
- Implements retry logic for slow-loading pages
- Listens for manual speed changes: `listenForManualSpeedChanges()`

```javascript
function initializeExtension() {
  // Load default settings
  chrome.storage.sync.get(['defaultSpeed', 'toggleSpeed'], (result) => {
    if (result.defaultSpeed) defaultSpeed = result.defaultSpeed;
    if (result.toggleSpeed) toggleSpeed = result.toggleSpeed;
    
    // Load channel-specific speed
    loadChannelSpeed();
  });
}

// Monitor for YouTube's single-page navigation
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(() => loadChannelSpeed(), 1500);
  }
}).observe(document, { subtree: true, childList: true });
```

#### Message Handling
- Communicates with the popup interface
- Responds to requests for current speed and channel info
- Handles speed setting commands
- Provides fallback data when information is unavailable

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSpeed') {
    // Send current speed and channel info
    const video = document.querySelector('video');
    
    if (currentChannelId) {
      chrome.storage.sync.get([`channelName_${currentChannelId}`], (result) => {
        const channelName = result[`channelName_${currentChannelId}`] || currentChannelId;
        sendResponse({ 
          speed: video ? video.playbackRate : currentSpeed,
          channelId: currentChannelId,
          channelName: channelName
        });
      });
      return true; // Keep message channel open for async response
    }
    // Fallback responses...
  }
  // Handle other message types...
});
```

### Popup Interface

The popup provides a user interface for:

#### Display Components
- Current channel name
- Current playback speed
- Input fields for default and toggle speeds
- Action buttons for toggling speed and saving settings
- Keyboard shortcut information

#### Functionality
- Loads and displays current settings: `loadSettings()`
- Saves user preferences: `saveSettings()`
- Toggles between speeds: `toggleSpeed()`
- Retrieves current information from the content script: `getCurrentInfo()`
- Validates user input
- Provides visual feedback for actions

```javascript
function getCurrentInfo() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('youtube.com')) {
      // Request info from content script
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getSpeed' }, (response) => {
        if (response) {
          // Update UI with response data
          if (response.speed !== null && response.speed !== undefined) {
            currentSpeedElement.textContent = parseFloat(response.speed).toFixed(2);
          }
          
          if (response.channelName) {
            currentChannelElement.textContent = response.channelName;
          } else if (response.channelId) {
            currentChannelElement.textContent = response.channelId;
          }
        }
      });
    } else {
      // Handle non-YouTube pages
      currentChannelElement.textContent = 'Not on YouTube';
    }
  });
}
```

### Background Script

The background script:
- Listens for keyboard commands (Alt+S or Option+S)
- Forwards commands to the active tab's content script
- Runs as a service worker in Manifest V3

```javascript
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-speed') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { command: 'toggle-speed' });
      }
    });
  }
});
```

## Data Storage

The extension uses Chrome's `storage.sync` API to store:

1. **Channel-specific speeds**: Stored with channel ID as key
   ```javascript
   chrome.storage.sync.set({ [channelId]: speed });
   ```

2. **Channel names**: Stored with `channelName_${channelId}` as key
   ```javascript
   chrome.storage.sync.set({ [`channelName_${channelId}`]: channelName });
   ```

3. **Global settings**:
   - `defaultSpeed`: The base speed (typically 1.0x)
   - `toggleSpeed`: The alternate speed (typically 1.5x)
   - `lastSpeed`: The most recently used speed (for new channels)

## User Interface Design

The popup interface features:
- Clean, modern design with YouTube-inspired color scheme
- Responsive layout with proper spacing and typography
- Visual feedback for user actions
- Clear display of current status
- Platform-specific keyboard shortcut display
- Input validation for speed settings

## Event Handling

The extension responds to several types of events:

1. **Page Navigation**: Detects YouTube's SPA navigation using MutationObserver
2. **Keyboard Shortcuts**: Listens for Alt+S/Option+S key combinations
3. **Manual Speed Changes**: Detects when users change speed through YouTube's controls
4. **User Interface Actions**: Responds to button clicks and input changes
5. **Extension Initialization**: Runs setup code when loaded or when YouTube page changes

## Error Handling and Fallbacks

The extension implements robust error handling:
- Try/catch blocks around critical functions
- Multiple channel detection methods with fallbacks
- Speed persistence with multiple fallback layers
- Detailed console logging for debugging
- Graceful degradation when features are unavailable

## Cross-Platform Support

The extension works on:
- Windows/Linux: Uses Alt+S as the keyboard shortcut
- Mac: Uses Option+S (Alt+S) as the keyboard shortcut
- Automatically detects the platform and displays the appropriate shortcut

## Performance Considerations

To ensure good performance, the extension:
- Uses event delegation where appropriate
- Implements debouncing for frequent events
- Avoids unnecessary DOM operations
- Uses efficient selectors for DOM queries
- Minimizes storage operations

## Security Considerations

The extension:
- Requests only necessary permissions
- Operates only on YouTube domains
- Does not collect or transmit user data
- Uses Chrome's secure storage API
- Sanitizes data before display

## Testing Procedures

To test the extension:
1. Install in developer mode
2. Navigate to various YouTube videos
3. Verify channel detection works
4. Test speed toggling with keyboard shortcuts
5. Confirm speed persistence across page refreshes
6. Validate settings changes through the popup
7. Test across different YouTube layouts and page types

## Known Limitations

- Channel detection may fail on some YouTube page layouts
- Speed changes may not be reflected in YouTube's UI immediately
- Some YouTube features (like embedded players) may not be fully supported
- Speed settings are tied to channel ID, not individual videos

## Future Enhancements

Potential improvements include:
- Video-specific speed settings
- More customizable keyboard shortcuts
- Additional speed presets
- Integration with YouTube playlists
- Enhanced visual notifications
- Statistics on time saved 