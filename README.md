# Media Screen Recorder

A self-hosted, private screen recording and video sharing tool. Think of it as your own personal Loom, hosted on your server!

## Features

- **Screen & Audio Recording**: Capture your screen, specific windows, or tabs along with system audio and your microphone.
- **Webcam PIP (Picture-in-Picture)**: Toggle your webcam on to overlay a circular webcam bubble in the corner of your recording for that professional touch.
- **Local Preview & Trimming**: Preview your video locally before uploading. Use the built-in trimming controls to cut unnecessary parts from the start or end using FFmpeg processing on the backend.
- **Fast Raw Upload**: Need it fast? Send the raw video directly to the server with zero processing delay.
- **Video History**: Keep track of all your past recordings via the sidebar. Rename, copy links, or delete old videos easily.
- **Instant Sharing**: Generates a clean `/watch/:id` public URL that you can share with clients or partners. The video is seekable and plays instantly without full downloading.
- **Secure**: The recording studio is protected by HTTP Basic Authentication.

## Tech Stack

- **Frontend**: Vanilla HTML, CSS (Glassmorphism, Dark mode), Javascript
- **Backend**: Node.js, Express, Multer, Fluent-FFmpeg
- **Storage**: Local file system (No database required, simple JSON metadata)

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Seka35/medi-screen-record.git
   cd medi-screen-record
   ```

2. **Install dependencies:**
   Make sure you have Node.js and npm installed.
   ```bash
   npm install
   ```

3. **Install FFmpeg (Required for trimming):**
   - Ubuntu/Debian: `sudo apt install ffmpeg`
   - MacOS: `brew install ffmpeg`
   - Windows: Download from official FFmpeg site and add to PATH.

4. **Configuration:**
   Create a `.env` file based on the example:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to set your custom Basic Auth credentials:
   ```env
   PORT=3042
   AUTH_USER=admin
   AUTH_PASS=password
   ```

5. **Run Locally:**
   ```bash
   node server.js
   ```
   Visit `http://localhost:3042` in your browser.

## Deployment (VPS)

1. Make sure `pm2` is installed globally:
   ```bash
   npm install -g pm2
   ```
2. Run the deployment script:
   ```bash
   ./deploy.sh
   ```
3. Configure Nginx as a reverse proxy. Create an Nginx block for your domain:
   ```nginx
   server {
       listen 80;
       server_name media.yourdomain.com;

       location / {
           proxy_pass http://localhost:3042;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           
           client_max_body_size 100M;
       }
   }
   ```
4. Restart Nginx and secure with Certbot.

## License

MIT License
