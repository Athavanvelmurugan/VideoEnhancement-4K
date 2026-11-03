# ☁️ Thamizh Studio — Cloud APK & Instant Install Guide (Zero Laptop Storage / RAM)

If your laptop has low storage or low RAM, **you do NOT need to install Android Studio or the heavy Android SDK**. 

Below are the two easiest, 100% free methods to get Thamizh Studio onto your Android phone as an app.

---

## ⚡ Method 1: GitHub Actions Cloud APK Builder (Real .APK File)

Microsoft Azure cloud servers will compile your `.apk` in 2 minutes for free. Your laptop does not use any RAM or disk space!

### 1-Time Setup:
1. Go to [github.com](https://github.com) and create a free account if you don't have one.
2. Click **New Repository** and name it `thamizh-studio`.
3. Push your project code to the repository:
   ```bash
   git init
   git add .
   git commit -m "Thamizh AI Studio mobile & hybrid APK"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/thamizh-studio.git
   git push -u origin main
   ```

### 1-Click Cloud Build:
1. On GitHub, click the **Actions** tab at the top.
2. Under "Workflows", select **Build Android Hybrid APK in Cloud**.
3. Click the **Run workflow** button.
4. GitHub's cloud runners will automatically:
   - Install Android SDK & Java 17
   - Compile your project with Gradle
   - Generate `app-debug.apk`
5. Click on the completed run under **Artifacts** and download **`Thamizh-Studio-Android-APK`**!
6. Copy `app-debug.apk` to your Android phone and tap to install.

---

## 📲 Method 2: Instant PWA Install (No Compilation, Takes 5 Seconds)

Thamizh Studio is configured with a Web App Manifest (`manifest.json`) and Service Worker (`sw.js`). You can install it on your Android phone immediately without even compiling an APK!

1. Open your browser on your phone and visit Thamizh Studio (e.g. `http://<YOUR-IP>:8000/studio/index.html` or your hosted URL).
2. Tap the Chrome menu (the **3 dots** at top right).
3. Tap **"Install app"** or **"Add to Home screen"**.
4. The Thamizh Studio app icon will be installed onto your Android phone's home screen.
5. Tap the icon to launch:
   - Runs full-screen (standalone mode, no browser URL bar)
   - 60 FPS real-time WebGL hardware acceleration
   - Offline cached capabilities
   - Uses only ~2 MB of storage on your phone!
