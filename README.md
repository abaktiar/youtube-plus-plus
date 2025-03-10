# YouTube++

A Chrome extension that remembers your preferred playback speed for each YouTube channel and allows easy toggling between speeds.

## Features

- **Per-Channel Speed Memory**: The extension automatically remembers your preferred playback speed for each YouTube channel.
- **Quick Speed Toggle**: Use the keyboard shortcut to toggle between your default speed and your preferred faster speed:
  - **Windows/Linux**: `Alt+S`
  - **Mac**: `Option+S` (Alt+S)
- **Customizable Speeds**: Set your own default and toggle speeds through the extension popup.
- **Cross-Platform Support**: Works on Windows, Mac, and Linux with platform-specific keyboard shortcuts.

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the directory containing this extension
5. The extension should now be installed and active

## Usage

1. Navigate to any YouTube video
2. The extension will automatically apply your saved speed for that channel (if any)
3. To toggle between your default and fast speeds:
   - On Windows/Linux: Press `Alt+S`
   - On Mac: Press `Option+S` (Alt+S)
4. To customize your speeds:
   - Click the extension icon in your browser toolbar
   - Set your preferred default and toggle speeds
   - Click "Save Settings"

## Testing the Extension

### On Windows/Linux:
1. Install the extension as described above
2. Navigate to any YouTube video
3. Press `Alt+S` to toggle between your default and fast speeds
4. Verify that the speed changes correctly
5. Try setting different speeds in the popup and test the toggle again

### On Mac:
1. Install the extension as described above
2. Navigate to any YouTube video
3. Press `Option+S` (Alt+S) to toggle between your default and fast speeds
4. Verify that the speed changes correctly
5. Try setting different speeds in the popup and test the toggle again

### Testing Per-Channel Memory:
1. Go to a specific YouTube channel and set a custom speed
2. Navigate to a different channel and set a different speed
3. Return to the first channel and verify that your custom speed is remembered

## License

This project is open source and available under the MIT License.