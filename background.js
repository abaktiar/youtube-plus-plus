// Listen for keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-speed') {
    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('youtube.com')) {
        chrome.tabs.sendMessage(tabs[0].id, { command: 'toggle-speed' });
      }
    });
  }
});
