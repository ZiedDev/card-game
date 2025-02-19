// environment variables
require('dotenv').config();
const hostname = process.env.HOSTNAME = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT = process.env.PORT || 8080;
const nodeEnv = process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const maxPileSize = process.env.MAX_PILE_SIZE = process.env.MAX_PILE_SIZE || 10;

// library imports
const express = require('express');

// js imports
const { generateRandomString,
    stringifyWithSets,
    parseWithSets,
    Pair,
    weightedRandomChoice,
    randomChoice,
} = require('./funcs');
const cardCount = require('./uno_card_count.json');

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
    res.render(req.body.filename, req.body.ejsParams);
});

app.post('/request-username-valid', (req, res) => {
    const userName = req.body.userName;
    const roomCode = req.body.roomCode;

    const usersData = roomsData.get(roomCode).usersData;
    const userNameSet = Object.keys(usersData).reduce((acc, key) => {
        acc.add(usersData[key].userName);
        return acc;
    }, new Set());

    res.send(JSON.stringify(!userNameSet.has(userName)));
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

        users: new Set(),
        rejoinableUsers: new Set(),
        usersData: {},
        gamePreferences: {},

        gameData: {
            currentPlayer: null,
            groundCard: null,
            direction: 'cw',
        },
        lastPileCards: [],
        userIterator: null,

        // not sended to client
        usersCards: new Map(),
        availableDeck: new Map(),
        discardPile: new Map(),
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
        res.send('"duplicate"');
        return;
    }
    if (roomData.rejoinableUsers.has(userId)) {
        roomsData.get(roomId).rejoinableUsers.delete(userId);
        roomsData.get(roomId).users.add(userId);
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
        if (socketData.hasOwnProperty('roomCode')) { // redundant (condition only)
            let roomCode = socketData.roomCode;
            roomsData.get(roomCode).users.delete(socketData.userId);
            io.to(roomCode).except(socket.id).emit(
                'update userList',
                [socketData, false, roomsData.get(roomCode).started]
            );
            if (roomsData.get(roomCode).started) {
                roomsData.get(roomCode).rejoinableUsers.add(socketData.userId);
            } else {
                delete roomsData.get(roomCode).usersData[socketData.userId];
                const newOwnerId = roomsData.get(roomCode).users.values().next().value;
                if (roomsData.get(roomCode).owner == socketData.userId && newOwnerId) {
                    roomsData.get(roomCode).owner = newOwnerId;
                    roomsData.get(roomCode).gamePreferences = roomsData.get(roomCode).usersData[newOwnerId].userGamePreferences;
                    io.to(roomCode).emit('init roomData', stringifyWithSets(roomsData.get(roomCode)));
                }
            }
        }
    });

    socket.on('disconnect', () => {
        socketsData.delete(socket.id);
        console.log(`user [${socket.id}] disconnected`);
    });

    socket.on('join room', data => {
        socket.join(data.roomCode);

        // init socketData
        Object.entries(data).forEach(([property, value]) => { // semi-unnecessary
            socketsData.get(socket.id)[property] = value;
        });

        roomsData.get(data.roomCode).usersData[data.userId] = data;
        if (!roomsData.get(data.roomCode).usersCards.has(data.userId)) {
            roomsData.get(data.roomCode).usersCards.set(data.userId, new Set());
        }
        if (roomsData.get(data.roomCode).owner == data.userId) {
            roomsData.get(data.roomCode).gamePreferences = data.userGamePreferences;
        }

        socket.emit('init roomData', stringifyWithSets(roomsData.get(data.roomCode)));
        io.to(data.roomCode).except(socket.id).emit(
            'update userList',
            [data, true, roomsData.get(data.roomCode).started]
        );

        if (roomsData.get(data.roomCode).started) socket.emit('start game');
    });

    socket.on('start game', () => {
        let roomCode = socketsData.get(socket.id).roomCode;

        roomsData.get(roomCode).started = true;
        const selectedUser = randomChoice(roomsData.get(roomCode).users);
        roomsData.get(roomCode).gameData.currentPlayer = selectedUser;
        roomsData.get(roomCode).userIterator = roomsData.get(roomCode).users.values();
        while (roomsData.get(roomCode).userIterator.next().value != selectedUser) { }

        // init deck
        Object.entries(cardCount).forEach(([key, value]) => {
            Object.entries(value).forEach(([subkey, count]) => {
                if (roomsData.get(roomCode).gamePreferences['Wild cards'] == 'disable' && key == 'wild') {
                    return;
                } else {
                    if (roomsData.get(roomCode).gamePreferences['Wild draw 2 card'] == 'disable' && subkey == 'draw') {
                        return;
                    }
                    if (roomsData.get(roomCode).gamePreferences['Wild stack card'] == 'disable' && subkey == 'stack') {
                        return;
                    }
                }
                roomsData.get(roomCode).availableDeck.set(
                    subkey + '_' + key,
                    count * parseInt(roomsData.get(roomCode).gamePreferences['Number of decks'])
                );
            });
        });

        io.to(roomCode).emit('start game');
        io.to(roomCode).emit('init roomData', stringifyWithSets(roomsData.get(roomCode)));
    });

    socket.on('update gamePreferences', data => {
        let roomCode = socketsData.get(socket.id).roomCode;
        roomsData.get(roomCode).gamePreferences = data;
        io.to(roomCode).except(socket.id).emit('update gamePreferences', data);
    });

    socket.on('draw cards', (params, callback) => {
        let roomCode = socketsData.get(socket.id).roomCode;
        let result = []
        if (params.tillColor) {
            let choice = ' _ ';
            while (choice.split('_')[1] != params.tillColor) {
                choice = weightedRandomChoice(roomsData.get(roomCode).availableDeck);
                result.push(choice);
                roomsData.get(roomCode).availableDeck.set(
                    choice,
                    roomsData.get(roomCode).availableDeck.get(choice) - 1
                )
                if (roomsData.get(roomCode).availableDeck.get(choice) == 0) {
                    roomsData.get(roomCode).availableDeck.delete(choice);
                }
            }
        } else {
            for (let i = 0; i < params.count; i++) {
                let choice = weightedRandomChoice(roomsData.get(roomCode).availableDeck)
                result.push(choice);
                roomsData.get(roomCode).availableDeck.set(
                    choice,
                    roomsData.get(roomCode).availableDeck.get(choice) - 1
                )
                if (roomsData.get(roomCode).availableDeck.get(choice) == 0) {
                    roomsData.get(roomCode).availableDeck.delete(choice);
                }
            }
        }
        if (params.grantUser) {
            result.forEach(card => {
                roomsData.get(roomCode).usersCards.get(params.grantUser).add(card);
            });
        }
        callback(result);
    });

    socket.on('fetch cards', (data, callback) => {
        let socketData = socketsData.get(socket.id);
        let result = roomsData.get(socketData.roomCode).usersCards.get(socketData.userId);

        callback(Array.from(result));
    });

    socket.on('throw card', data => {
        let roomCode = socketsData.get(socket.id).roomCode;

        roomsData.get(roomCode).gameData.groundCard = data.card;

        roomsData.get(roomCode).lastPileCards.push(data.card);
        if (roomsData.get(roomCode).lastPileCards.length > maxPileSize) {
            roomsData.get(roomCode).lastPileCards.shift();
        }

        let nextUser = roomsData.get(roomCode).userIterator.next().value;
        if (!nextUser) {
            roomsData.get(roomCode).userIterator = roomsData.get(roomCode).users.values();
            nextUser = roomsData.get(roomCode).userIterator.next().value;
        }
        roomsData.get(roomCode).gameData.currentPlayer = nextUser;


        // handle card specific things

        // reverse iterator if reverse

        io.to(roomCode).emit('next turn', {
            roomData: stringifyWithSets(roomsData.get(roomCode)),
            card: data.card,
        });
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