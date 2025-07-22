const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidV4 } = require('uuid');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.redirect(`/room/${uuidV4()}`);
});

app.get('/room/:room', (req, res) => {
  res.render('room', { roomId: req.params.room });
});

const roomState = {}; // roomId -> { currentUrl, currentTime, isPlaying }

io.on('connection', (socket) => {
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);

    if (roomState[roomId]) {
      socket.emit('sync-video', roomState[roomId]);
    }

    socket.on('video-url', (url) => {
      roomState[roomId] = roomState[roomId] || {};
      roomState[roomId].currentUrl = url;
      roomState[roomId].currentTime = 0;
      roomState[roomId].isPlaying = false;
      socket.to(roomId).emit('video-url', url);
    });

    socket.on('video-control', (data) => {
      roomState[roomId] = roomState[roomId] || {};
      roomState[roomId].currentTime = data.currentTime;
      roomState[roomId].isPlaying = data.action === 'play';
      socket.to(roomId).emit('video-control', data);
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
