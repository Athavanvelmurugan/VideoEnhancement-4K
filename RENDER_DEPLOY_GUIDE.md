# ☁️ How to Deploy the Thamizh AI Backend to Free Cloud (Render.com)

By deploying this backend to Render (100% Free), **anyone in any state or country** using your APK can use the Groq AI Director & Auto-Captions from their phone!

---

## 🚀 2-Minute Setup on Render.com

### Step 1: Sign in with GitHub
1. Open [https://render.com](https://render.com) in your browser.
2. Click **GET STARTED FOR FREE** and select **Continue with GitHub**.

### Step 2: Create a New Web Service
1. In the Render Dashboard, click **New +** ➡️ select **Web Service**.
2. Select your repository: **`Athavanvelmurugan/VideoEnhancement-4K`**.
3. Render will automatically detect the settings:
   - **Name**: `videoenhancement-4k`
   - **Language**: `Python 3`
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`

### Step 3: Add Your Groq API Key
1. Scroll down to the **Environment Variables** section.
2. Click **Add Environment Variable**:
   - Key: `GROQ_API_KEY`
   - Value: your_groq_api_key_from_env_file
3. Click **Deploy Web Service**!

---

## 🎉 That's It!
* In 60 seconds, Render gives you a public URL (e.g. `https://videoenhancement-4k.onrender.com`).
* Your APK is already pre-configured to automatically connect to this URL when running on Android!
