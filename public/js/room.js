const roomCode = window.location.href.split('/')[window.location.href.split('/').length - 1]
socket.emit('join room', roomCode);

socket.on('joined room', roomCode => {
    console.log(`you joined room ${roomCode}`);
})