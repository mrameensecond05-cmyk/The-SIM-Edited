import socket
import re
import os
import sys
import subprocess
import platform
import shutil

def get_local_ip():
    """Detects the current local LAN IP address."""
    try:
        # Use a dummy connection to a public DNS to find the local interface IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception as e:
        print(f"Error detecting IP: {e}")
        return None

def update_file(filepath, new_ip):
    """Updates the IP address in the specified file using regex."""
    if not os.path.exists(filepath):
        print(f"⚠️  Skipping {filepath} (file not found)")
        return False

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        updated_content = content
        changes = 0

        # 1. Update userService.ts (SERVER_IP)
        if filepath.endswith("userService.ts"):
            # Target: export const SERVER_IP = 'http://172.20.10.3:5001';
            pattern = r"(export\s+const\s+SERVER_IP\s*=\s*['\"]http://)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"
            updated_content, n = re.subn(pattern, r"\1" + new_ip, content)
            changes += n

        # 2. Update network_security_config.xml
        elif filepath.endswith("network_security_config.xml"):
            # Target: <domain includeSubdomains="true">172.20.10.3</domain>
            pattern = r"(<domain\s+includeSubdomains=['\"]true['\"]>)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(</domain>)"
            
            def replacer(match):
                if match.group(2) in ['127.0.0.1', 'localhost']:
                    return match.group(0) # Keep localhost entries
                return f"{match.group(1)}{new_ip}{match.group(3)}"
            
            updated_content, n = re.subn(pattern, replacer, content)
            changes += n

        # 3. Update vite.config.ts (Proxy target)
        elif filepath.endswith("vite.config.ts"):
            # Target: target: 'http://localhost:5000', or any IP
            # Note: Your vite.config currently uses localhost, this will change it to the new IP if desired
            pattern = r"(target:\s*['\"]http://)([\w\d\.]+)"
            updated_content, n = re.subn(pattern, r"\1" + new_ip, content)
            changes += n

        if updated_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(updated_content)
            print(f"✅ Updated {filepath} (replaced {changes} instance(s) with {new_ip})")
            return True
        else:
            if new_ip in content:
                print(f"ℹ️  {filepath} is already up to date.")
            else:
                print(f"ℹ️  No matching pattern found in {filepath}.")
            return False

    except Exception as e:
        print(f"❌ Failed to update {filepath}: {e}")
        return False

def run_command(command, cwd=None):
    """Runs a shell command and prints output."""
    print(f"🚀 Running: {command} in {cwd or os.getcwd()}")
    try:
        subprocess.check_call(command, shell=True, cwd=cwd)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Command failed: {e}")
        return False

def main():
    print("🔄 Network Auto-Configuration Tool")
    
    new_ip = get_local_ip()
    if not new_ip:
        print("❌ Could not determine local IP. Exiting.")
        sys.exit(1)

    print(f"📍 Detected Local IP: {new_ip}")
    
    files_to_check = [
        "services/userService.ts",
        "vite.config.ts",
        "android/app/src/main/res/xml/network_security_config.xml"
    ]

    base_dir = os.getcwd()
    any_updates = False
    for rel_path in files_to_check:
        full_path = os.path.join(base_dir, rel_path)
        if update_file(full_path, new_ip):
            any_updates = True

    if any_updates:
        print("\n⚠️  Changes detected. Starting Android build process...")
        
        # 1. Build Frontend
        if not run_command("npm run build", cwd=base_dir):
            sys.exit(1)

        # 2. Sync Capacitor
        if not run_command("npx cap sync", cwd=base_dir):
            sys.exit(1)

        # 3. Build Android APK
        android_dir = os.path.join(base_dir, "android")
        gradle_cmd = "gradlew.bat assembleDebug" if platform.system() == "Windows" else "./gradlew assembleDebug"
        
        if platform.system() != "Windows":
            run_command("chmod +x gradlew", cwd=android_dir)

        if run_command(gradle_cmd, cwd=android_dir):
            print("\n✅ Android APK built successfully!")
            apk_src = os.path.join(android_dir, "app/build/outputs/apk/debug/app-debug.apk")
            if os.path.exists(apk_src):
                # Copy to server public folder for download
                public_dir = os.path.join(base_dir, "server/public")
                os.makedirs(public_dir, exist_ok=True)
                dest_apk = os.path.join(public_dir, "simtinel.apk")
                shutil.copy2(apk_src, dest_apk)
                print(f"🚀 Deployed to: {dest_apk}")
    else:
        print("✅ No changes needed. Skipping rebuild.")

if __name__ == "__main__":
    main()
