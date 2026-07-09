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
  if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  
  res.json({ success: true });
});

// Rename Video
app.put('/api/video/:id', authMiddleware, (req, res) => {
  const fileId = req.params.id;
  const { title } = req.body;
  
  if (!title) return res.status(400).json({ error: 'Title required' });
  
  const history = getHistory();
  const video = history.find(v => v.id === fileId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  
  video.title = title;
  saveHistory(history);
  
  res.json({ success: true, video });
});

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
    res.json({ success: true, id: fileId });
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

app.get('/watch/:id', (req, res) => {
  const fileId = req.params.id;
  const videoPath = path.join(UPLOADS_DIR, `${fileId}.webm`);
  if (!fs.existsSync(videoPath)) return res.status(404).send('Video not found');
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

app.listen(PORT, () => {
  console.log(`Media Screen Recorder server is running on port ${PORT}`);
});
