let mediaRecorder;
let recordedChunks = [];
let displayStream;
let voiceStream;
let finalStream;
let timerInterval;
let startTime;
let currentBlob;
let videoDuration = 0;
let animationFrameId;

// UI Elements
const webcamToggle = document.getElementById('webcamToggle');
const composeCanvas = document.getElementById('composeCanvas');
const ctx = composeCanvas.getContext('2d');

const screenVideo = document.getElementById('screenVideo');
const webcamVideo = document.getElementById('webcamVideo');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
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
const uploadRawBtn = document.getElementById('uploadRawBtn');

const trimControls = document.getElementById('trimControls');
const videoTitleInput = document.getElementById('videoTitleInput');
const startTrim = document.getElementById('startTrim');
const endTrim = document.getElementById('endTrim');
const startDisplay = document.getElementById('startDisplay');
const endDisplay = document.getElementById('endDisplay');

// Notes Modal Elements
const notesModal = document.getElementById('notesModal');
const notesTextarea = document.getElementById('notesTextarea');
const attachmentInput = document.getElementById('attachmentInput');
const attachmentNameDisplay = document.getElementById('attachmentNameDisplay');
const cancelNotesBtn = document.getElementById('cancelNotesBtn');
const saveNotesBtn = document.getElementById('saveNotesBtn');
const quickNotesBtn = document.getElementById('quickNotesBtn');
let currentNotesVideoId = null;

function updateTimer() {
  const now = Date.now();
  const diff = now - startTime;
  const seconds = Math.floor(diff / 1000) % 60;
  const minutes = Math.floor(diff / 1000 / 60);
  timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function startRecording() {
  try {
    const includeWebcam = webcamToggle.checked;

    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { 
        cursor: "always",
        frameRate: { ideal: 60, max: 60 }
      },
      audio: true
    });

    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true,
        video: includeWebcam ? { 
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        } : false
      });
    } catch (e) {
      console.warn("Media not available or denied.", e);
    }

    screenVideo.srcObject = displayStream;
    if (includeWebcam && voiceStream && voiceStream.getVideoTracks().length > 0) {
      webcamVideo.srcObject = new MediaStream([voiceStream.getVideoTracks()[0]]);
    }

    try { await screenVideo.play(); } catch(e){}
    if (webcamVideo.srcObject) {
      try { await webcamVideo.play(); } catch(e){}
    }

    await new Promise(resolve => {
      if (screenVideo.videoWidth > 0) {
        composeCanvas.width = screenVideo.videoWidth;
        composeCanvas.height = screenVideo.videoHeight;
        return resolve();
      }
      screenVideo.onloadedmetadata = () => {
        composeCanvas.width = screenVideo.videoWidth;
        composeCanvas.height = screenVideo.videoHeight;
        resolve();
      };
    });

    // Ensure canvas has dimensions as a fallback
    if (composeCanvas.width < 500) composeCanvas.width = screenVideo.videoWidth || 1280;
    if (composeCanvas.height < 500) composeCanvas.height = screenVideo.videoHeight || 720;

    drawCanvas();

    finalStream = composeCanvas.captureStream(60);

    if (voiceStream) {
      voiceStream.getAudioTracks().forEach(track => finalStream.addTrack(track));
    }
    if (displayStream.getAudioTracks().length > 0) {
      displayStream.getAudioTracks().forEach(track => finalStream.addTrack(track));
    }

    displayStream.getVideoTracks()[0].onended = () => stopRecording();

    // Detect best hardware-accelerated codec
    const mimeTypes = [
      'video/webm; codecs=h264,opus',
      'video/webm; codecs=vp9,opus',
      'video/webm; codecs=vp8,opus',
      'video/webm'
    ];
    let selectedMimeType = 'video/webm';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMimeType = mime;
        break;
      }
    }
    console.log("Using codec:", selectedMimeType);

    const options = { 
      mimeType: selectedMimeType,
      videoBitsPerSecond: 8000000 // 8 Mbps for high quality
    };
    mediaRecorder = new MediaRecorder(finalStream, options);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      currentBlob = new Blob(recordedChunks, { type: 'video/webm' });
      showPreview();
      
      cancelAnimationFrame(animationFrameId);
      if (displayStream) displayStream.getTracks().forEach(t => t.stop());
      if (voiceStream) voiceStream.getTracks().forEach(t => t.stop());
      screenVideo.srcObject = null;
      webcamVideo.srcObject = null;
    };

    mediaRecorder.start();
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    webcamToggle.disabled = true;
    recordedChunks = [];
    
    shareSection.classList.add('hidden');
    uploadStatus.classList.add('hidden');
    trimControls.classList.add('hidden');
    
    startTime = Date.now();
    timerDisplay.style.display = 'flex';
    timerInterval = setInterval(updateTimer, 1000);

  } catch (err) {
    console.error("Error starting recording:", err);
    alert("Unable to start recording. Please check permissions.");
  }
}

function drawCanvas() {
  if (screenVideo.videoWidth > 0) {
    ctx.drawImage(screenVideo, 0, 0, composeCanvas.width, composeCanvas.height);

    if (webcamToggle.checked && webcamVideo.videoWidth > 0) {
      const canvasW = composeCanvas.width;
      const canvasH = composeCanvas.height;
      
      const radius = Math.max(canvasW * 0.08, 100); 
      const margin = 30; 
      const cx = margin + radius; 
      const cy = canvasH - margin - radius; 

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();

      const camW = webcamVideo.videoWidth;
      const camH = webcamVideo.videoHeight;
      const camRatio = camW / camH;
      
      let drawW, drawH, drawX, drawY;
      if (camRatio > 1) { 
        drawH = radius * 2;
        drawW = drawH * camRatio;
        drawX = cx - drawW / 2;
        drawY = cy - drawH / 2;
      } else { 
        drawW = radius * 2;
        drawH = drawW / camRatio;
        drawX = cx - drawW / 2;
        drawY = cy - drawH / 2;
      }

      ctx.drawImage(webcamVideo, drawX, drawY, drawW, drawH);
      
      ctx.lineWidth = 4;
      ctx.strokeStyle = "white";
      ctx.stroke();
      
      ctx.restore();
    }
  }

  animationFrameId = requestAnimationFrame(drawCanvas);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  startBtn.disabled = false;
  stopBtn.disabled = true;
  webcamToggle.disabled = false;
  clearInterval(timerInterval);
  timerDisplay.style.display = 'none';
  timerDisplay.textContent = '00:00';
}

function showPreview() {
  recordingWrapper.classList.add('hidden');
  mainControls.classList.add('hidden');
  document.querySelector('.settings-bar').classList.add('hidden');
  
  playbackWrapper.classList.remove('hidden');
  postRecordControls.classList.remove('hidden');
  trimControls.classList.remove('hidden');

  const videoUrl = URL.createObjectURL(currentBlob);
  playbackPlayer.src = videoUrl;

  playbackPlayer.onloadedmetadata = () => {
    videoDuration = playbackPlayer.duration;
    if (videoDuration === Infinity || isNaN(videoDuration)) {
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
  document.querySelector('.settings-bar').classList.remove('hidden');
  
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, composeCanvas.width || 800, composeCanvas.height || 450);
});

uploadBtn.addEventListener('click', () => performUpload(true));
uploadRawBtn.addEventListener('click', () => performUpload(false));

function performUpload(enableTrim) {
  if (!currentBlob) return;

  const formData = new FormData();
  formData.append('video', currentBlob, 'recording.webm');
  formData.append('trimEnabled', enableTrim);
  
  const titleVal = videoTitleInput.value.trim();
  if (titleVal) {
    formData.append('title', titleVal);
  }

  if (enableTrim) {
    formData.append('startTime', parseFloat(startTrim.value));
    formData.append('endTime', parseFloat(endTrim.value));
  }

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
      if (percentComplete === 100 && enableTrim) {
        progressText.textContent = 'Processing FFmpeg...';
      } else if (percentComplete === 100) {
        progressText.textContent = 'Saving...';
      }
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.success) {
        uploadStatus.classList.add('hidden');
        showShareLink(response.id);
      }
    } else {
      alert("Error during upload or processing.");
      uploadStatus.classList.add('hidden');
      postRecordControls.classList.remove('hidden');
    }
  };

  xhr.onerror = () => {
    alert("Network error.");
    uploadStatus.classList.add('hidden');
    postRecordControls.classList.remove('hidden');
  };

  xhr.send(formData);
}

function showShareLink(videoId) {
  shareSection.classList.remove('hidden');
  const watchUrl = `${window.location.origin}/watch/${videoId}`;
  shareLink.value = watchUrl;
  
  // Link quick notes button
  quickNotesBtn.onclick = () => {
    currentNotesVideoId = videoId;
    notesTextarea.value = '';
    attachmentInput.value = '';
    attachmentNameDisplay.textContent = '📎 Attach a file (PDF, Image, etc.)';
    notesModal.classList.remove('hidden');
  };
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

copyBtn.addEventListener('click', () => {
  shareLink.select();
  document.execCommand('copy');
  
  const originalText = copyBtn.textContent;
  copyBtn.textContent = 'Copied!';
  copyBtn.classList.add('success');
  
  setTimeout(() => {
    copyBtn.textContent = originalText;
    copyBtn.classList.remove('success');
  }, 2000);
});


// Notes Modal Handlers
attachmentInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    attachmentNameDisplay.textContent = `📎 ${e.target.files[0].name}`;
  } else {
    attachmentNameDisplay.textContent = '📎 Attach a file (PDF, Image, etc.)';
  }
});

cancelNotesBtn.addEventListener('click', () => {
  notesModal.classList.add('hidden');
  currentNotesVideoId = null;
  attachmentInput.value = '';
  attachmentNameDisplay.textContent = '📎 Attach a file (PDF, Image, etc.)';
});

saveNotesBtn.addEventListener('click', async () => {
  if (!currentNotesVideoId) return;
  
  const formData = new FormData();
  formData.append('notes', notesTextarea.value);
  if (attachmentInput.files.length > 0) {
    formData.append('attachment', attachmentInput.files[0]);
  }
  
  saveNotesBtn.disabled = true;
  saveNotesBtn.textContent = 'Saving...';
  
  try {
    const res = await fetch(`/api/video/${currentNotesVideoId}/notes`, {
      method: 'POST',
      body: formData
    });
    
    if (res.ok) {
      notesModal.classList.add('hidden');
      attachmentInput.value = '';
      attachmentNameDisplay.textContent = '📎 Attach a file (PDF, Image, etc.)';
    } else {
      alert("Error saving notes/attachment.");
    }
  } catch (err) {
    alert("Error saving notes.");
  }
  
  saveNotesBtn.disabled = false;
  saveNotesBtn.textContent = 'Save';
});

