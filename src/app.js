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
let socketsData = new Map();

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

app.put('/request-room-ejs', (req, res) => {
    res.render(req.body.filename);
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
        users: new Set([req.body.userId]),
        usersData: {},
    });

    res.send(JSON.stringify(roomCode));
});

app.post('/room/:roomId', (req, res) => {
    const roomId = req.params.roomId
    const userId = req.body.userId
    const confName = req.body.confName

    if (!rooms.has(roomId)) { // redundant
        res.send('"false"');
        return;
    };
    const roomData = roomsData.get(roomId);
    if (roomData.users.has(userId)) {
        res.send('"rejoin"');
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
    socketsData.set(socket.id, {});

    socket.on('disconnecting', () => {
        let socketData = socketsData.get(socket.id);
        if (socketData.hasOwnProperty('roomCode')) {
            let roomCode = socketData.roomCode;
            if (!roomsData.get(roomCode).started) {
                roomsData.get(roomCode).users.delete(socketData.userId);
                delete roomsData.get(roomCode).usersData[socketData.userId];
                io.to(roomCode).emit('update usersData', roomsData.get(roomCode));
                io.to(roomCode).emit('update usersData changeonly', [socketData, false]);
            }
        }
    });

    socket.on('disconnect', () => {
        socketsData.delete(socket.id);
        console.log(`user [${socket.id}] disconnected`);
    });

    socket.on('join room', data => {
        socket.join(data.roomCode);
        Object.entries(data).forEach(([property, value]) => {
            socketsData.get(socket.id)[property] = value;
        });
        roomsData.get(data.roomCode).usersData[data.userId] = data;
        io.to(data.roomCode).emit('update usersData', roomsData.get(data.roomCode));
        io.to(data.roomCode).except(socket.id).emit('update usersData changeonly', [data, true]);
    });

    socket.on('start game', () => {
        let roomCode = socketsData.get(socket.id).roomCode;
        roomsData.get(roomCode).started = true;
        io.to(roomCode).emit('start game');
    });

    socket.on('test', () => {
        console.log('TEST:');
        console.log('rooms:', rooms);
        console.log('roomsData:', roomsData);
        console.log('socketsData:', socketsData);
    });
});

io.of("/").adapter.on("create-room", (room) => {
    if (rooms.has(room)) console.log(`room ${room} was created`);
});

io.of("/").adapter.on("join-room", (room, id) => {
    if (rooms.has(room)) console.log(`socket [${id}] has joined room ${room}`);
});

server.listen(port, hostname, () => {
    console.log(`Server running on ${nodeEnv} environment at http://${hostname}:${port}/`);
});