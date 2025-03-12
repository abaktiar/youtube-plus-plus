// Simple script to update shortcut text based on platform
document.addEventListener('DOMContentLoaded', () => {
  const shortcutTextElement = document.getElementById('shortcut-text');
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  // Update shortcut text based on platform
  if (isMac) {
    shortcutTextElement.textContent = 'Option+S';
  } else {
    shortcutTextElement.textContent = 'Alt+S';
  }
});