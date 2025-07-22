const socket = io('/');
const videoGrid = document.getElementById('video-grid');
const myVideo = document.getElementById('my-video');
const videoForm = document.getElementById('video-form');
const videoUrlInput = document.getElementById('video-url');
const sharedVideo = document.getElementById('shared-video');

let ytPlayer = null;
let dmPlayer = null;
let activePlayer = null;
let suppressEmit = false;

myVideo.muted = true;
const peer = new Peer();

navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
}).then(stream => {
  myVideo.srcObject = stream;
  myVideo.addEventListener('loadedmetadata', () => myVideo.play());
  videoGrid.append(myVideo);

  peer.on('call', call => {
    call.answer(stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => {
      video.srcObject = userVideoStream;
      video.addEventListener('loadedmetadata', () => video.play());
      videoGrid.append(video);
    });
  });

  socket.on('user-connected', userId => {
    connectToNewUser(userId, stream);
  });
});

peer.on('open', id => {
  const roomId = window.location.pathname.split('/')[2];
  socket.emit('join-room', roomId, id);
});

function connectToNewUser(userId, stream) {
  const call = peer.call(userId, stream);
  const video = document.createElement('video');
  call.on('stream', userVideoStream => {
    video.srcObject = userVideoStream;
    video.addEventListener('loadedmetadata', () => video.play());
    videoGrid.append(video);
  });
}

videoForm.addEventListener('submit', e => {
  e.preventDefault();
  const url = videoUrlInput.value;
  socket.emit('video-url', url);
  displaySyncedVideo(url);
});

socket.on('video-url', url => {
  displaySyncedVideo(url);
});

function displaySyncedVideo(url) {
  sharedVideo.innerHTML = '';
  ytPlayer = null;
  dmPlayer = null;
  activePlayer = null;

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    let id = null;
    if (url.includes('youtube.com')) {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      id = urlParams.get('v');
    } else if (url.includes('youtu.be')) {
      id = url.split('youtu.be/')[1].split('?')[0];
    }
    const iframe = document.createElement('div');
    iframe.id = 'yt-player';
    sharedVideo.appendChild(iframe);
    new YT.Player('yt-player', {
      height: '360',
      width: '640',
      videoId: id,
      events: {
        'onReady': (event) => {
          activePlayer = event.target;
        },
        'onStateChange': (event) => {
          if (suppressEmit) return;
          if (event.data === YT.PlayerState.PLAYING) {
            socket.emit('video-control', { action: 'play', currentTime: event.target.getCurrentTime() });
          } else if (event.data === YT.PlayerState.PAUSED) {
            socket.emit('video-control', { action: 'pause', currentTime: event.target.getCurrentTime() });
          }
        }
      }
    });
  } else if (url.includes('dailymotion.com')) {
    const id = url.split('/video/')[1]?.split('_')[0];
    const iframe = document.createElement('div');
    iframe.id = 'dm-player';
    sharedVideo.appendChild(iframe);
    DM.player('dm-player', {
      video: id,
      width: '640',
      height: '360',
      params: { autoplay: 1 }
    }).then(player => {
      dmPlayer = player;
      activePlayer = player;
      player.addEventListener('play', () => {
        if (!suppressEmit) player.currentTime.then(t => {
          socket.emit('video-control', { action: 'play', currentTime: t });
        });
      });
      player.addEventListener('pause', () => {
        if (!suppressEmit) player.currentTime.then(t => {
          socket.emit('video-control', { action: 'pause', currentTime: t });
        });
      });
    });
  } else {
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.autoplay = true;
    video.style.width = '640px';
    video.style.height = '360px';
    sharedVideo.appendChild(video);
    activePlayer = video;

    video.addEventListener('play', () => {
      if (!suppressEmit) socket.emit('video-control', { action: 'play', currentTime: video.currentTime });
    });

    video.addEventListener('pause', () => {
      if (!suppressEmit) socket.emit('video-control', { action: 'pause', currentTime: video.currentTime });
    });
  }
}

socket.on('video-control', data => {
  if (!activePlayer) return;
  suppressEmit = true;

  if (typeof activePlayer.seekTo === 'function') {
    activePlayer.seekTo(data.currentTime);
    if (data.action === 'play') activePlayer.playVideo();
    else activePlayer.pauseVideo();
  } else if (typeof activePlayer.currentTime !== 'undefined') {
    activePlayer.currentTime = data.currentTime;
    if (data.action === 'play') activePlayer.play();
    else activePlayer.pause();
  } else if (typeof activePlayer.seek === 'function') {
    activePlayer.seek(data.currentTime);
    if (data.action === 'play') activePlayer.play();
    else activePlayer.pause();
  }

  setTimeout(() => suppressEmit = false, 500);
});