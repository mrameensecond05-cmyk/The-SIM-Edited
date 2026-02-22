#!/bin/bash

# Android SDK Automation Setup Script for Ubuntu
# Based on provided manual instructions

set -e

echo "🚀 Starting Android SDK Automation Setup..."

# 1. Install Prerequisites
echo "📦 Installing prerequisites (JDK 17, unzip)..."
sudo apt update
sudo apt install openjdk-17-jdk unzip wget -y

# 2. Set Up Directories
ANDROID_ROOT="$HOME/android"
CMDLINE_TOOLS_ROOT="$ANDROID_ROOT/cmdline-tools"
echo "📂 Creating directory structure in $ANDROID_ROOT..."
mkdir -p "$CMDLINE_TOOLS_ROOT"

# 3. Download and Set Up Command-Line Tools
cd "$CMDLINE_TOOLS_ROOT"
if [ ! -d "latest" ]; then
    echo "📥 Downloading Android Command-Line Tools..."
    # Using the specific version from instructions
    TOOLS_ZIP="commandlinetools-linux-9477386_latest.zip"
    if [ ! -f "$TOOLS_ZIP" ]; then
        wget "https://dl.google.com/android/repository/$TOOLS_ZIP"
    fi
    
    echo "📂 Extracting tools..."
    # Robust unzip: try unzip first, fallback to python3's zipfile module
    if command -v unzip >/dev/null 2>&1; then
        unzip -q "$TOOLS_ZIP"
    else
        echo "⚠️  'unzip' command not found. Falling back to Python (zipfile module)..."
        python3 -c "import zipfile, sys; zipfile.ZipFile(sys.argv[1]).extractall('.')" "$TOOLS_ZIP"
    fi
    
    # Correct the directory structure: cmdline-tools/latest/bin
    # The zip contains a 'cmdline-tools' folder
    if [ -d "cmdline-tools" ]; then
        mv cmdline-tools latest
    fi
    rm "$TOOLS_ZIP"
    echo "✅ Command-line tools setup complete."
else
    echo "ℹ️  Command-line tools ('latest' folder) already exist. Skipping download."
fi

# 4. Configure Environment Variables
echo "⚙️  Configuring environment variables in ~/.bashrc..."
BASHRC="$HOME/.bashrc"

# Function to add export if not exists
add_to_bashrc() {
    local line="$1"
    if ! grep -Fxq "$line" "$BASHRC"; then
        echo "$line" >> "$BASHRC"
    fi
}

echo "" >> "$BASHRC"
echo "# Android SDK paths added by automated script" >> "$BASHRC"
add_to_bashrc "export ANDROID_HOME=\$HOME/android"
add_to_bashrc "export PATH=\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin"
add_to_bashrc "export PATH=\$PATH:\$ANDROID_HOME/platform-tools"
add_to_bashrc "export PATH=\$PATH:\$ANDROID_HOME/build-tools"

echo "✅ Environment variables added to $BASHRC."
echo "⚠️  Note: You will need to run 'source ~/.bashrc' or restart your terminal for changes to take effect."

# 5. Install SDK Components
# We need to use the full path to sdkmanager if the profile hasn't been sourced yet
SDK_MANAGER="$ANDROID_ROOT/cmdline-tools/latest/bin/sdkmanager"

if [ -f "$SDK_MANAGER" ]; then
    echo "📜 Accepting licenses..."
    yes | "$SDK_MANAGER" --licenses > /dev/null

    echo "🛠️  Installing SDK components (platform-tools, android-33, build-tools;33.0.0)..."
    "$SDK_MANAGER" "platform-tools" "platforms;android-33" "build-tools;33.0.0"
    echo "✅ SDK components installed successfully."
else
    echo "❌ Error: sdkmanager not found at $SDK_MANAGER"
    exit 1
fi

echo "✨ Android SDK setup is complete!"
echo "👉 Run 'source ~/.bashrc' to finalize the setup."
