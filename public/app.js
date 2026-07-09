let mediaRecorder;
let recordedChunks = [];
let stream;
let timerInterval;
let startTime;
let currentBlob;
let videoDuration = 0;

// UI Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const preview = document.getElementById('preview');
const timerDisplay = document.getElementById('timer');
const uploadStatus = document.getElementById('uploadStatus');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const shareSection = document.getElementById('shareSection');
const shareLink = document.getElementById('shareLink');
const copyBtn = document.getElementById('copyBtn');

const recordingWrapper = document.getElementById('recordingWrapper');
const playbackWrapper = document.getElementById('playbackWrapper');
const playbackPlayer = document.getElementById('playbackPlayer');
const mainControls = document.getElementById('mainControls');
const postRecordControls = document.getElementById('postRecordControls');
const retryBtn = document.getElementById('retryBtn');
const uploadBtn = document.getElementById('uploadBtn');

const trimControls = document.getElementById('trimControls');
const startTrim = document.getElementById('startTrim');
const endTrim = document.getElementById('endTrim');
const startDisplay = document.getElementById('startDisplay');
const endDisplay = document.getElementById('endDisplay');

const historyList = document.getElementById('historyList');

// Initialize History
loadHistory();

function updateTimer() {
  const now = Date.now();
  const diff = now - startTime;
  const seconds = Math.floor(diff / 1000) % 60;
  const minutes = Math.floor(diff / 1000 / 60);
  timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function startRecording() {
  try {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: true
    });

    let voiceStream;
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.warn("Microphone not available or denied.");
    }

    const tracks = [...displayStream.getTracks()];
    if (voiceStream) tracks.push(...voiceStream.getAudioTracks());

    stream = new MediaStream(tracks);
    preview.srcObject = stream;
    preview.muted = true;

    displayStream.getVideoTracks()[0].onended = () => stopRecording();

    const options = { mimeType: 'video/webm; codecs=vp8,opus' };
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      currentBlob = new Blob(recordedChunks, { type: 'video/webm' });
      showPreview();
      
      stream.getTracks().forEach(track => track.stop());
      preview.srcObject = null;
    };

    mediaRecorder.start();
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    recordedChunks = [];
    
    // Hide post-record stuff
    shareSection.classList.add('hidden');
    uploadStatus.classList.add('hidden');
    trimControls.classList.add('hidden');
    
    startTime = Date.now();
    timerDisplay.style.display = 'flex';
    timerInterval = setInterval(updateTimer, 1000);

  } catch (err) {
    console.error("Error starting recording:", err);
    alert("Impossible de démarrer l'enregistrement. Veuillez vérifier les permissions.");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  startBtn.disabled = false;
  stopBtn.disabled = true;
  clearInterval(timerInterval);
  timerDisplay.style.display = 'none';
  timerDisplay.textContent = '00:00';
}

function showPreview() {
  recordingWrapper.classList.add('hidden');
  mainControls.classList.add('hidden');
  
  playbackWrapper.classList.remove('hidden');
  postRecordControls.classList.remove('hidden');
  trimControls.classList.remove('hidden');

  const videoUrl = URL.createObjectURL(currentBlob);
  playbackPlayer.src = videoUrl;

  playbackPlayer.onloadedmetadata = () => {
    videoDuration = playbackPlayer.duration;
    if (videoDuration === Infinity || isNaN(videoDuration)) {
      // Chrome bug workaround for webm duration
      playbackPlayer.currentTime = 1e101;
      playbackPlayer.ontimeupdate = function() {
        this.ontimeupdate = () => { return; }
        videoDuration = playbackPlayer.duration;
        playbackPlayer.currentTime = 0;
        setupTrimControls();
      }
    } else {
      setupTrimControls();
    }
  };
}

function setupTrimControls() {
  startTrim.max = videoDuration;
  endTrim.max = videoDuration;
  
  startTrim.value = 0;
  endTrim.value = videoDuration;
  
  startDisplay.textContent = "0.0";
  endDisplay.textContent = videoDuration.toFixed(1);
}

startTrim.addEventListener('input', (e) => {
  let val = parseFloat(e.target.value);
  if (val >= parseFloat(endTrim.value)) {
    val = parseFloat(endTrim.value) - 0.1;
    startTrim.value = val;
  }
  startDisplay.textContent = val.toFixed(1);
  playbackPlayer.currentTime = val;
});

endTrim.addEventListener('input', (e) => {
  let val = parseFloat(e.target.value);
  if (val <= parseFloat(startTrim.value)) {
    val = parseFloat(startTrim.value) + 0.1;
    endTrim.value = val;
  }
  endDisplay.textContent = val.toFixed(1);
  playbackPlayer.currentTime = val;
});

retryBtn.addEventListener('click', () => {
  playbackPlayer.pause();
  URL.revokeObjectURL(playbackPlayer.src);
  currentBlob = null;
  
  playbackWrapper.classList.add('hidden');
  postRecordControls.classList.add('hidden');
  trimControls.classList.add('hidden');
  shareSection.classList.add('hidden');
  
  recordingWrapper.classList.remove('hidden');
  mainControls.classList.remove('hidden');
});

uploadBtn.addEventListener('click', () => {
  if (!currentBlob) return;

  const sTime = parseFloat(startTrim.value);
  const eTime = parseFloat(endTrim.value);

  const formData = new FormData();
  formData.append('video', currentBlob, 'recording.webm');
  formData.append('startTime', sTime);
  formData.append('endTime', eTime);

  postRecordControls.classList.add('hidden');
  trimControls.classList.add('hidden');
  uploadStatus.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressText.textContent = '0%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload', true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percentComplete = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = percentComplete + '%';
      progressText.textContent = percentComplete + '%';
      if (percentComplete === 100) {
        progressText.textContent = 'Traitement (découpage)...';
      }
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.success) {
        uploadStatus.classList.add('hidden');
        showShareLink(response.id);
        loadHistory(); // Reload history after upload
      }
    } else {
      alert("Erreur lors de l'upload ou du traitement.");
      uploadStatus.classList.add('hidden');
      postRecordControls.classList.remove('hidden');
    }
  };

  xhr.onerror = () => {
    alert("Erreur réseau.");
    uploadStatus.classList.add('hidden');
    postRecordControls.classList.remove('hidden');
  };

  xhr.send(formData);
});

function showShareLink(videoId) {
  shareSection.classList.remove('hidden');
  const watchUrl = `${window.location.origin}/watch/${videoId}`;
  shareLink.value = watchUrl;
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

copyBtn.addEventListener('click', () => {
  shareLink.select();
  document.execCommand('copy');
  
  const originalText = copyBtn.textContent;
  copyBtn.textContent = 'Copié !';
  copyBtn.classList.add('success');
  
  setTimeout(() => {
    copyBtn.textContent = originalText;
    copyBtn.classList.remove('success');
  }, 2000);
});

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    
    historyList.innerHTML = '';
    
    if (data.length === 0) {
      historyList.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem;">Aucune vidéo enregistrée.</p>';
      return;
    }
    
    data.forEach(item => {
      const d = new Date(item.date).toLocaleString('fr-FR');
      const watchUrl = `${window.location.origin}/watch/${item.id}`;
      
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div>Vidéo #${item.id.substring(0,6)}</div>
        <div class="date">${d}</div>
        <div class="actions">
          <button class="btn secondary copy-hist" data-url="${watchUrl}">Lien</button>
          <a href="/watch/${item.id}" target="_blank" class="btn primary">Voir</a>
          <button class="btn danger del-hist" data-id="${item.id}">X</button>
        </div>
      `;
      historyList.appendChild(el);
    });

    // Attach events
    document.querySelectorAll('.copy-hist').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.target.dataset.url;
        navigator.clipboard.writeText(url);
        const originalText = e.target.textContent;
        e.target.textContent = 'Copié!';
        setTimeout(() => e.target.textContent = originalText, 2000);
      });
    });

    document.querySelectorAll('.del-hist').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if(confirm('Supprimer cette vidéo ?')) {
          const id = e.target.dataset.id;
          await fetch(`/api/video/${id}`, { method: 'DELETE' });
          loadHistory();
        }
      });
    });
    
  } catch(e) {
    console.error("History loading error", e);
  }
}
