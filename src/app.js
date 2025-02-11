// environment variables
require('dotenv').config();
const hostname = process.env.HOSTNAME = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT = process.env.PORT || 8080;
const nodeEnv = process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const rejoinTLE = process.env.rejoinTLE = process.env.rejoinTLE || (2 * 60 * 1000);// 2min

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
let rooms = new Set();
let roomsData = new Map();

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
    let roomCode = generateRandomString(20);
    while (rooms.has(roomCode)) {
        roomCode = generateRandomString(20);
    }

    rooms.add(roomCode);
    roomsData.set(roomCode, {
        started: false,
        owner: req.body.userId,
        users: new Set([req.body.userId])
    });

    res.send(JSON.stringify(roomCode));
});

app.post('/room/:roomId', (req, res) => {
    const roomId = req.params.roomId
    const userId = req.body.userId
    const confName = req.body.confName
    const time = req.body.time

    if (!rooms.has(roomId)) { // redundant
        res.send('"false"');
        return;
    };
    const roomData = roomsData.get(roomId);
    if (roomData.users.has(userId)) {
        const newTime = new Date().getTime();
        if (newTime - time < rejoinTLE) {
            res.send('"rejoin"');
        } else {
            roomsData.get(roomId).users.delete(userId);
            res.send('"late+watch"');
        }
        return;
    }
    if (roomData.started) {
        res.send('"watch"');
        return;
    }
    if (confName) {
        roomsData.get(roomId).users.add(userId);
        res.send('"join"');
        return;
    } else {
        res.send('"conf_join"');
        return;
    }
});

app.get('/room/:roomId', (req, res) => {
    const roomId = req.params.roomId

    if (rooms.has(roomId)) {
        res.render('room', { roomId });
    } else {
        res.render('error', { errorCode: 404, errorMessage: 'Room not found' })
    }
});

app.use((req, res, next) => {
    res.status(404);

    if (req.accepts('html')) {
        res.render('error', { errorCode: 404, errorMessage: 'Page not found' });
        return;
    }

    if (req.accepts('json')) {
        res.json({ error: 'Not found' });
        return;
    }

    res.type('txt').send('Not found');
});

io.on('connection', socket => {
    console.log(`user [${socket.id}] connected`);

    socket.on('disconnecting', () => {
        // thinking abt it
    });
    socket.on('disconnect', () => {
        console.log(`user [${socket.id}] disconnected`);
    });

    socket.on('join room', roomCode => {
        socket.join(roomCode);
        io.to(roomCode).emit('update data', { users: Array.from(roomsData.get(roomCode).users) })
    })
});

io.of("/").adapter.on("create-room", (room) => {
    console.log(`room ${room} was created`);
});

io.of("/").adapter.on("join-room", (room, id) => {
    console.log(`socket [${id}] has joined room ${room}`);
});

server.listen(port, hostname, () => {
    console.log(`Server running on ${nodeEnv} environment at http://${hostname}:${port}/`);
});