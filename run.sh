#!/bin/bash

# 1. Update Network IPs & Rebuild App (Forced)
echo "🔄 Checking Network Configuration & Forcing APK Rebuild..."
python3 update_network_ip.py --force
if [ $? -ne 0 ]; then
    echo "❌ APK Rebuild failed. Aborting startup."
    exit 1
fi

# 2. Start Docker Compose
echo "🚀 APK Built! Starting Docker environment..."
sudo docker-compose up -d --build
