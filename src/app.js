// environment variables
require('dotenv').config();
const hostname = process.env.HOSTNAME = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT = process.env.PORT || 8080;
const nodeEnv = process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// library imports
const express = require('express');

// js imports
const { generateRandomString } = require('./funcs');

// route imports

const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// live reload
if (nodeEnv == 'development') {
    const livereload = require('livereload');
    const connectLiveReload = require('connect-livereload');
    const liveReloadServer = livereload.createServer();
    liveReloadServer.server.once('connection', () => {
        setTimeout(() => {
            liveReloadServer.refresh('/');
        }, 100);
    });
    app.use(connectLiveReload());
}
// live reload //


// main middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set('view engine', 'ejs');
app.use(express.static('public'));


app.get('/', (req, res) => {
    res.render('index');
});

app.post('/createRoom', (req, res) => {
    let roomCode = generateRandomString(20)

    while (roomCode in io.sockets.adapter.rooms) {
        roomCode = generateRandomString(20)
    }

    io.sockets.adapter.rooms.set(roomCode, new Set())

    res.redirect(`/room/${roomCode}`)
});

app.get('/room/:roomId', (req, res) => {
    const roomId = req.params.roomId

    if (io.sockets.adapter.rooms.has(roomId)) {
        res.render('room', { roomId, });
    } else {
        res.render('error', { errorCode: 403, errorMessage: 'Forbidden' })
    }
});

app.use((request, result, next) => {
    result.status(404);

    if (request.accepts('html')) {
        result.render('error', { errorCode: 404, errorMessage: 'Page not found' });
        return;
    }

    if (request.accepts('json')) {
        result.json({ error: 'Not found' });
        return;
    }

    result.type('txt').send('Not found');
});

io.on('connection', socket => {
    console.log(`user [${socket.id}] connected`);
    socket.on('disconnect', () => {
        console.log(`user [${socket.id}] disconnected`);
    });

    io.of("/").adapter.on("create-room", (room) => {
        console.log(`room ${room} was created`);
    });

    io.of("/").adapter.on("join-room", (room, id) => {
        console.log(`socket ${id} has joined room ${room}`);
    });

    // non boilerplate stuff
    socket.on('join room', roomCode => {
        socket.join(roomCode)
        socket.emit('joined room', roomCode)
    })
});

server.listen(port, hostname, () => {
    console.log(`Server running on ${nodeEnv} environment at http://${hostname}:${port}/`);
});