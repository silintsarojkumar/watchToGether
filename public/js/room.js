const socket = io('/');
const peer = new Peer();
const videoGrid = document.getElementById('video-grid');
const myVideo = document.getElementById('my-video');
const videoForm = document.getElementById('video-form');
const videoUrlInput = document.getElementById('video-url');
const sharedVideo = document.getElementById('shared-video');
const switchCamBtn = document.getElementById('switch-camera');

let activePlayer = null;
let suppressEmit = false;
let currentStream;
let currentVideoDeviceId;

myVideo.muted = true;

async function getMediaStream(deviceId = null) {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
    audio: true
  };

  currentStream = await navigator.mediaDevices.getUserMedia(constraints);
  myVideo.srcObject = currentStream;
  myVideo.play();

  return currentStream;
}

function switchCamera() {
  navigator.mediaDevices.enumerateDevices().then(devices => {
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    if (videoDevices.length > 1) {
      const currentIndex = videoDevices.findIndex(d => d.deviceId === currentVideoDeviceId);
      const nextIndex = (currentIndex + 1) % videoDevices.length;
      currentVideoDeviceId = videoDevices[nextIndex].deviceId;
      getMediaStream(currentVideoDeviceId);
    }
  });
}

switchCamBtn.addEventListener('click', switchCamera);

getMediaStream().then(stream => {
  currentVideoDeviceId = stream.getVideoTracks()[0].getSettings().deviceId;

  peer.on('call', call => {
    call.answer(stream);
    const video = document.createElement('video');
    call.on('stream', userStream => {
      video.srcObject = userStream;
      video.addEventListener('loadedmetadata', () => video.play());
      videoGrid.appendChild(video);
    });
  });

  socket.on('user-connected', userId => {
    const call = peer.call(userId, stream);
    const video = document.createElement('video');
    call.on('stream', userStream => {
      video.srcObject = userStream;
      video.addEventListener('loadedmetadata', () => video.play());
      videoGrid.appendChild(video);
    });
  });
});

peer.on('open', id => {
  const roomId = window.location.pathname.split('/')[2];
  socket.emit('join-room', roomId, id);
});

videoForm.addEventListener('submit', e => {
  e.preventDefault();
  const url = videoUrlInput.value;
  socket.emit('video-url', url);
  loadVideo(url);
});

socket.on('video-url', url => loadVideo(url));
socket.on('video-control', data => {
  if (!activePlayer) return;
  suppressEmit = true;
  if (data.action === 'play') {
    activePlayer.currentTime = data.currentTime;
    activePlayer.play();
  } else {
    activePlayer.currentTime = data.currentTime;
    activePlayer.pause();
  }
  setTimeout(() => suppressEmit = false, 500);
});

socket.on('sync-video', data => {
  if (data.currentUrl) loadVideo(data.currentUrl, data);
});

function loadVideo(url, state = null) {
  sharedVideo.innerHTML = '';
  const video = document.createElement('video');
  video.src = url;
  video.controls = true;
  video.autoplay = true;
  video.className = 'shared';
  sharedVideo.appendChild(video);
  activePlayer = video;

  if (state) {
    suppressEmit = true;
    video.currentTime = state.currentTime;
    if (state.isPlaying) video.play();
    else video.pause();
    setTimeout(() => suppressEmit = false, 500);
  }

  video.addEventListener('play', () => {
    if (!suppressEmit) socket.emit('video-control', { action: 'play', currentTime: video.currentTime });
  });
  video.addEventListener('pause', () => {
    if (!suppressEmit) socket.emit('video-control', { action: 'pause', currentTime: video.currentTime });
  });
}