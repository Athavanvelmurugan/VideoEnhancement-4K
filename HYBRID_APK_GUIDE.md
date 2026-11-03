# 📱 Thamizh Studio — Hybrid APK Build Guide (Android)

This guide walks you through converting **Thamizh Studio** into a production-ready Hybrid Android APK using **Capacitor**.

---

## 🛠️ Prerequisites
1. **Node.js** (v18 or higher) & **npm** installed on your system.
2. **Android Studio** (Koala / Iguana or later) with Android SDK (API 34 or later).
3. **Java JDK 17** configured (`JAVA_HOME`).

---

## 🚀 3-Step APK Build Process

### Step 1: Install Capacitor CLI & Core
Open your terminal in `c:\Users\Athavan\Desktop\Wink apk` and run:
```bash
npm install -D @capacitor/cli @capacitor/core @capacitor/android
```

### Step 2: Add Android Platform
Generate the native Android Studio project wrapper:
```bash
npx cap add android
```
*Note: This creates an `android/` directory configured with Gradle and AndroidManifest.*

### Step 3: Sync Assets & Open in Android Studio
Sync the HTML, CSS, Shaders, and JS assets into the native Android WebView container:
```bash
npx cap sync android
npx cap open android
```

---

## ⚡ Android Manifest Recommendations (High-Performance WebGL)

In `android/app/src/main/AndroidManifest.xml`:
1. Ensure hardware acceleration is enabled for 60 FPS WebGL rendering:
   ```xml
   <application
       android:hardwareAccelerated="true"
       android:usesCleartextTraffic="true"
       android:largeHeap="true" ...>
   ```
2. Camera & Storage Permissions (for video import/export):
   ```xml
   <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
   <uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>
   <uses-permission android:name="android.permission.INTERNET"/>
   ```

---

## 📦 Building the Final Release APK

In Android Studio:
1. Go to **Build** > **Generate Signed Bundle / APK...**
2. Select **APK**.
3. Choose your Key Store (or create a new Keystore).
4. Select `release` build variant and check **V1 (Jar Signature)** and **V2 (Full APK Signature)**.
5. Click **Finish**. Your optimized `app-release.apk` will be output in `android/app/release/`.
