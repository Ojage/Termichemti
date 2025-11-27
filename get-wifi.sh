#!/bin/bash

# Check the operating system
if [[ "$(uname)" == "Linux" ]]; then
  # For Linux, use nmcli. Show only the 'NAME' column, skip the header.
  nmcli --fields NAME connection show | tail -n +2

elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  # For Windows (running in Git Bash/Cygwin), use netsh.
  # Grep for 'All User Profile', then use sed to extract the name after the colon.
  netsh wlan show profiles | grep "All User Profile" | sed 's/.*: \(.*\)/\1/'

else
  # Fallback for other systems or if netsh isn't in path on Windows
  echo "Unsupported OS: $(uname)" >&2
  exit 1
fi