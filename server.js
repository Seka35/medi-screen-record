const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const basicAuth = require('express-basic-auth');
const ffmpeg = require('fluent-ffmpeg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3042;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TEMP_DIR = path.join(__dirname, 'temp');
const DB_FILE = path.join(__dirname, 'database.json');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

function getHistory() {
  const data = fs.readFileSync(DB_FILE);
  return JSON.parse(data);
}

function saveHistory(history) {
  fs.writeFileSync(DB_FILE, JSON.stringify(history, null, 2));
}

const authUser = process.env.AUTH_USER || 'admin';
const authPass = process.env.AUTH_PASS || 'password';
const users = {};
users[authUser] = authPass;

const authMiddleware = basicAuth({
  users,
  challenge: true,
  unauthorizedResponse: 'Unauthorized'
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, TEMP_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, `${uuidv4()}.webm`);
  }
});
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(express.json());

app.get('/', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/history', authMiddleware, (req, res) => {
  res.json(getHistory());
});

app.delete('/api/video/:id', authMiddleware, (req, res) => {
  const fileId = req.params.id;
  const history = getHistory();
  const newHistory = history.filter(v => v.id !== fileId);
  
  if (history.length === newHistory.length) {
    return res.status(404).json({ error: 'Video not found' });
  }

  saveHistory(newHistory);
  
  const videoPath = path.join(UPLOADS_DIR, `${fileId}.webm`);
  const thumbPath = path.join(UPLOADS_DIR, `${fileId}.jpg`);
  if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  
  res.json({ success: true });
});

app.put('/api/video/:id', authMiddleware, (req, res) => {
  const fileId = req.params.id;
  const { title, notes } = req.body;
  
  const history = getHistory();
  const video = history.find(v => v.id === fileId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  
  if (title !== undefined) video.title = title;
  if (notes !== undefined) video.notes = notes;
  
  saveHistory(history);
  
  res.json({ success: true, video });
});

// Create Thumbnail helper
function generateThumbnail(videoPath, fileId, callback) {
  ffmpeg(videoPath)
    .screenshots({
      count: 1,
      timestamps: ['00:00:02.000'], // Capture at 2 seconds instead of the very beginning
      folder: UPLOADS_DIR,
      filename: `${fileId}.jpg`
    })
    .on('end', () => callback(true))
    .on('error', (err) => {
      console.error('Error generating thumbnail:', err);
      // Fallback: If video is too short, try capturing at 0 seconds
      ffmpeg(videoPath)
        .screenshots({
          count: 1,
          timestamps: ['00:00:00.000'],
          folder: UPLOADS_DIR,
          filename: `${fileId}.jpg`
        })
        .on('end', () => callback(true))
        .on('error', () => callback(false));
    });
}

app.post('/api/upload', authMiddleware, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file provided.' });
  
  const tempPath = req.file.path;
  const fileId = uuidv4();
  const finalPath = path.join(UPLOADS_DIR, `${fileId}.webm`);
  
  const trimEnabled = req.body.trimEnabled === 'true';
  const startTime = parseFloat(req.body.startTime) || 0;
  let endTime = parseFloat(req.body.endTime);

  const finalizeUpload = (duration) => {
    const history = getHistory();
    history.unshift({
      id: fileId,
      title: `Video #${fileId.substring(0, 6)}`,
      date: new Date().toISOString(),
      duration: duration || 0
    });
    saveHistory(history);
    
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    // Generate thumbnail async
    generateThumbnail(finalPath, fileId, () => {
      res.json({ success: true, id: fileId });
    });
  };

  if (trimEnabled && (startTime > 0 || (endTime && endTime > 0))) {
    let command = ffmpeg(tempPath).setStartTime(startTime);
    if (endTime && endTime > startTime) command = command.setDuration(endTime - startTime);
    
    command.output(finalPath)
      .on('end', () => finalizeUpload(endTime ? (endTime - startTime) : 0))
      .on('error', (err) => {
        console.error('FFmpeg Error:', err);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        res.status(500).json({ error: 'Error processing video' });
      })
      .run();
  } else {
    fs.renameSync(tempPath, finalPath);
    finalizeUpload(0);
  }
});

app.get('/api/video/:id', (req, res) => {
  const fileId = req.params.id;
  const videoPath = path.join(UPLOADS_DIR, `${fileId}.webm`);

  if (!fs.existsSync(videoPath)) return res.status(404).send('Video not found');

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if(start >= fileSize) return res.status(416).send('Requested range not satisfiable');

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(videoPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/webm',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/webm',
    };
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
});

app.get('/api/thumbnail/:id', (req, res) => {
  const fileId = req.params.id;
  const thumbPath = path.join(UPLOADS_DIR, `${fileId}.jpg`);
  if (!fs.existsSync(thumbPath)) {
    // Return a 404 or a default image if no thumbnail exists
    return res.status(404).send('Thumbnail not found');
  }
  res.sendFile(thumbPath);
});

app.get('/watch/:id', (req, res) => {
  const fileId = req.params.id;
  const videoPath = path.join(UPLOADS_DIR, `${fileId}.webm`);
  
  if (!fs.existsSync(videoPath)) return res.status(404).send('Video not found');
  
  const history = getHistory();
  const video = history.find(v => v.id === fileId);
  const title = video ? video.title : 'Shared Video';

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers.host;
  const baseUrl = `${protocol}://${host}`;
  const watchUrl = `${baseUrl}/watch/${fileId}`;
  const thumbUrl = `${baseUrl}/api/thumbnail/${fileId}`;

  const templatePath = path.join(__dirname, 'public', 'watch.html');
  fs.readFile(templatePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Error rendering page');
    
    let notesDisplay = '';
    if (video && video.notes && video.notes.trim() !== '') {
      const safeNotes = video.notes.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      notesDisplay = `<div class="video-notes">${safeNotes}</div>`;
    }

    // Inject dynamic meta tags
    const rendered = html
      .replace(/{{OG_TITLE}}/g, title)
      .replace(/{{OG_IMAGE}}/g, thumbUrl)
      .replace(/{{OG_URL}}/g, watchUrl)
      .replace(/{{NOTES_DISPLAY}}/g, notesDisplay);
      
    res.send(rendered);
  });
});

app.listen(PORT, () => {
  console.log(`Media Screen Recorder server is running on port ${PORT}`);
});
