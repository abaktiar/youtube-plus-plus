#!/bin/bash

# This script creates simple placeholder icons for the Chrome extension
# You'll need ImageMagick installed for this to work
# Install with: brew install imagemagick (on macOS)

# Create 16x16 icon
convert -size 16x16 xc:none -fill "#cc0000" -draw "circle 8,8 8,2" -fill white -draw "text 6,11 'S'" icons/icon16.png

# Create 48x48 icon
convert -size 48x48 xc:none -fill "#cc0000" -draw "circle 24,24 24,6" -fill white -draw "text 19,29 'S'" -pointsize 20 icons/icon48.png

# Create 128x128 icon
convert -size 128x128 xc:none -fill "#cc0000" -draw "circle 64,64 64,16" -fill white -draw "text 52,74 'S'" -pointsize 50 icons/icon128.png

echo "Icons created in the icons directory" 