// environment variables
require('dotenv').config();
const hostname = process.env.HOSTNAME = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT = process.env.PORT || 8080;
const nodeEnv = process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const maxPileSize = process.env.MAX_PILE_SIZE = process.env.MAX_PILE_SIZE || 10;
const inactiveTurnLimit = process.env.INACTIVE_TURN_LIMIT = process.env.INACTIVE_TURN_LIMIT || 10 * 1000 // 10secs;

// library imports
const express = require('express');

// js imports
const { generateRandomString,
    stringifyWithSets,
    parseWithSets,
    Pair,
    sumMap,
    weightedRandomChoice,
    randomChoice,
    iteratorFuncs,
    pullAndUpdateAvailableDeck,
} = require('./funcs');
const cardCount = require('./wa7ed_card_count.json');

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

// routes
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
        maxPileSize: maxPileSize,

        users: new Set(),
        rejoinableUsers: new Set(),
        permaUserSet: null,
        usersData: {},
        gamePreferences: {},

        gameData: {
            direction: 'cw',
            currentPlayer: null,
            prevGroundCard: null,
            groundCard: null,
            drawSum: 0,
            wildColor: null,
            stackDraw: null,
            consecutiveDraws: 0,
        },
        lastPileCards: [],
        usersCardCounts: {},

        // not sended to client
        userIterator: null,
        usersCards: new Map(),
        availableDeck: new Map(),
        discardDeck: new Map(),
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


const drawCards = (socket, params) => {
    let roomCode = socketsData.get(socket.id).roomCode;
    let result = [];
    if (params.tillColor) {
        let choice = ' _ ';
        let reshuffle;
        while (choice.split('_')[1] != params.tillColor) {
            [choice, reshuffle] = pullAndUpdateAvailableDeck(roomsData.get(roomCode), params.nonAction);
            if (choice === null) return null;
            result.push(choice);
            if (reshuffle) io.to(roomCode).emit('reshuffle');
        }
    } else {
        for (let i = 0; i < params.count; i++) {
            let [choice, reshuffle] = pullAndUpdateAvailableDeck(roomsData.get(roomCode), params.nonAction);
            if (choice === null) return null;
            result.push(choice);
            if (reshuffle) io.to(roomCode).emit('reshuffle');
        }
    }
    if (params.grantUser) {
        result.forEach(card => {
            roomsData.get(roomCode).usersCards.get(params.grantUser).push(card);
            roomsData.get(roomCode).usersCardCounts[params.grantUser] = roomsData.get(roomCode).usersCards.get(params.grantUser).length;
        });
    }

    return result;
};

const checkThrowValidity = (cardParts, groundCardParts, drawSum, wildColor, stackDraw, preferences) => {
    if (stackDraw) {
        return false;
    }

    if (drawSum) {
        if (preferences["Stack draw-2 and draw-4 cards"] == 'enable'
            && (cardParts[0] == 'draw' || cardParts[0] == 'draw4')) {
            return true;
        }
        return false;
    }

    if (groundCardParts[1] == 'wild' && !wildColor) {
        return false;
    }
    if (groundCardParts[1] == 'wild' && cardParts[1] == wildColor) {
        return true;
    }

    if (cardParts[0] == groundCardParts[0] || cardParts[1] == groundCardParts[1]) {
        return true;
    }
    if (cardParts[1] == 'wild') {
        return true
    }
}

const attemptThrow = (socket, params) => {
    let roomCode = params.roomCode || socketsData.get(socket.id).roomCode;

    const socketId = params.socketId;
    const prevUser = roomsData.get(roomCode).gameData.currentPlayer;
    const currUser = params.user;
    const isSelfTurn = roomsData.get(roomCode).gameData.currentPlayer == currUser;
    const cardName = params.cardName;
    const cardParts = cardName.split('_');
    const groundCard = roomsData.get(roomCode).gameData.groundCard;
    const groundCardParts = groundCard.split('_');
    const prevGroundCard = roomsData.get(roomCode).gameData.prevGroundCard;
    const prevGroundCardParts = prevGroundCard ? prevGroundCard.split('_') : null;
    const drawSum = roomsData.get(roomCode).gameData.drawSum;
    const wildColor = roomsData.get(roomCode).gameData.wildColor;
    const stackDraw = roomsData.get(roomCode).gameData.stackDraw;
    const preferences = roomsData.get(roomCode).gamePreferences;

    // jump in
    if (preferences["Jump-in"] == 'enable' && !isSelfTurn && cardParts[1] != 'wild' && cardName == groundCard) {
        iteratorFuncs.set(roomsData.get(roomCode), currUser);
    }
    else if (!isSelfTurn) {
        return false;
    }

    if (!checkThrowValidity(cardParts, groundCardParts, drawSum, wildColor, stackDraw, preferences)) {
        return false;
    }

    // successful throw

    // reverse iterator if reverse
    if (cardParts[0] == 'reverse') {
        roomsData.get(roomCode).gameData.direction = roomsData.get(roomCode).gameData.direction == 'cw' ? 'acw' : 'cw';
        iteratorFuncs.set(roomsData.get(roomCode), prevUser);

        if (roomsData.get(roomCode).permaUserSet.size == 2) {
            iteratorFuncs.get(roomsData.get(roomCode));
        }
    }

    // extra increment if skip
    if (cardParts[0] == 'skip') {
        iteratorFuncs.get(roomsData.get(roomCode));
    }

    // update wildColor if wild
    // if not preset wildColor rando user
    if (cardParts[1] == 'wild') {
        roomsData.get(roomCode).gameData.wildColor = null;
        io.to(socketId).emit('request wildColor');
    }

    // update stackDraw if stack
    if (cardParts[0] == 'stack') {
        roomsData.get(roomCode).gameData.stackDraw = true;
    }

    // add to drawSum if draw
    if (cardParts[0] == 'draw') {
        roomsData.get(roomCode).gameData.drawSum += 2;
    }
    if (cardParts[0] == 'draw4') {
        roomsData.get(roomCode).gameData.drawSum += 4;
    }
    if (cardParts[0] == 'draw' || cardParts[0] == 'draw4') {
        io.to(roomCode).emit('update drawSum', {
            drawSum: roomsData.get(roomCode).gameData.drawSum
        });
    }

    // increment user
    let nextUser = iteratorFuncs.get(roomsData.get(roomCode));
    roomsData.get(roomCode).gameData.currentPlayer = nextUser;

    // remove card from user
    const index = roomsData.get(roomCode).usersCards.get(currUser).indexOf(cardName);
    if (index > -1) {
        roomsData.get(roomCode).usersCards.get(currUser).splice(index, 1);
        roomsData.get(roomCode).usersCardCounts[currUser] = roomsData.get(roomCode).usersCards.get(currUser).length;
    } else {
        console.log(`ERROR ${currUser} doesnt have card ${currUser} in [${roomsData.get(roomCode).usersCards.get(currUser)}]`)
    }

    // update cards
    roomsData.get(roomCode).gameData.prevGroundCard = groundCard;
    roomsData.get(roomCode).gameData.groundCard = cardName;

    roomsData.get(roomCode).lastPileCards.push(cardName);
    if (roomsData.get(roomCode).lastPileCards.length > maxPileSize) {
        roomsData.get(roomCode).lastPileCards.shift();
    }

    roomsData.get(roomCode).discardDeck.set(
        cardName,
        roomsData.get(roomCode).discardDeck.get(cardName) + 1
    )

    // socket emits
    io.to(roomCode).emit('update turn', {
        roomData: stringifyWithSets(roomsData.get(roomCode))
    });

    io.to(roomCode).except(socketId).emit('throw other', {
        cardName: cardName,
        exceptUser: currUser,
    });

    return true;
};

const throwCard = data => { // deprecated
    // handle disconnected user
    if (roomsData.get(roomCode).rejoinableUsers.has(nextUser)) {
        setTimeout(() => {
            if (roomsData.get(roomCode).rejoinableUsers.has(nextUser)) {
                // play valid instead       
                // throwCard({
                //     roomCode,
                //     card: randomChoice(roomsData.get(roomCode).usersCards.get(nextUser)),
                //     remUser: nextUser,
                // });
            }
        }, inactiveTurnLimit);
    }
}

const attemptDraw = (socket, params) => {
    let roomCode = params.roomCode || socketsData.get(socket.id).roomCode;
    let result = null;

    const socketId = params.socketId;
    const prevUser = roomsData.get(roomCode).gameData.currentPlayer;
    const currUser = params.user;
    const isSelfTurn = roomsData.get(roomCode).gameData.currentPlayer == currUser;
    const groundCard = roomsData.get(roomCode).gameData.groundCard;
    const groundCardParts = groundCard.split('_');
    const drawSum = roomsData.get(roomCode).gameData.drawSum;
    const wildColor = roomsData.get(roomCode).gameData.wildColor;
    const stackDraw = roomsData.get(roomCode).gameData.stackDraw;
    const consecutiveDraws = roomsData.get(roomCode).gameData.consecutiveDraws;
    const preferences = roomsData.get(roomCode).gamePreferences;

    if (!isSelfTurn) {
        return false;
    }

    if (stackDraw && wildColor) {
        result = drawCards(socket, { count: null, grantUser: currUser, tillColor: wildColor, nonAction: null, });
        if (result == null) {
            let nextUser = iteratorFuncs.get(roomsData.get(roomCode));
            roomsData.get(roomCode).gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(roomsData.get(roomCode))
            });
            return skip;
        };
        io.to(roomCode).except(socketId).emit('draw other', {
            cardCount: result.length,
            exceptUser: currUser,
        });
        roomsData.get(roomCode).gameData.stackDraw = false;

        if (preferences["draw-2 and draw-4 skips"] == 'skip') {
            let nextUser = iteratorFuncs.get(roomsData.get(roomCode));
            roomsData.get(roomCode).gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(roomsData.get(roomCode))
            });
        }
        return result;
    }

    if (drawSum) {
        result = drawCards(socket, { count: drawSum, grantUser: currUser, tillColor: null, nonAction: null, });
        if (result == null) {
            let nextUser = iteratorFuncs.get(roomsData.get(roomCode));
            roomsData.get(roomCode).gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(roomsData.get(roomCode))
            });
            return skip;
        }
        io.to(roomCode).except(socketId).emit('draw other', {
            cardCount: drawSum,
            exceptUser: currUser,
        });
        roomsData.get(roomCode).gameData.drawSum = 0;
        io.to(roomCode).emit('update drawSum', {
            drawSum: roomsData.get(roomCode).gameData.drawSum
        });

        if (preferences["draw-2 and draw-4 skips"] == 'skip') {
            let nextUser = iteratorFuncs.get(roomsData.get(roomCode));
            roomsData.get(roomCode).gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(roomsData.get(roomCode))
            });
        }
        return result;
    }

    // check if no cards can be played
    const noValidCard = () => !roomsData.get(roomCode).usersCards.get(currUser).some(card => {
        return checkThrowValidity(card.split('_'), groundCardParts, drawSum, wildColor, preferences);
    })
    if (preferences["Allow drawing even with a valid card"] == 'enable' || noValidCard()) {
        if (preferences["Continue to Draw Until You Can Play"] == 'enable') {
            result = drawCards(socket, { count: 1, grantUser: currUser, tillColor: null, nonAction: null, });
            if (result == null) {
                if (preferences["Allow drawing even with a valid card"] != 'enable') {
                    let nextUser = iteratorFuncs.get(roomsData.get(roomCode));
                    roomsData.get(roomCode).gameData.currentPlayer = nextUser;
                    io.to(roomCode).emit('update turn', {
                        roomData: stringifyWithSets(roomsData.get(roomCode))
                    });
                }
                return skip;
            };
            io.to(roomCode).except(socketId).emit('draw other', {
                cardCount: 1,
                exceptUser: currUser,
            });
        } else if (preferences["Continue to Draw Until You Can Play"] == 'maximum 2 cards') {
            if (consecutiveDraws < 2) {
                result = drawCards(socket, { count: 1, grantUser: currUser, tillColor: null, nonAction: null, });
                if (result == null) {
                    if (preferences["Allow drawing even with a valid card"] != 'enable') {
                        let nextUser = iteratorFuncs.get(roomsData.get(roomCode));
                        roomsData.get(roomCode).gameData.currentPlayer = nextUser;
                        io.to(roomCode).emit('update turn', {
                            roomData: stringifyWithSets(roomsData.get(roomCode))
                        });
                    }
                    return skip;
                };
                io.to(roomCode).except(socketId).emit('draw other', {
                    cardCount: 1,
                    exceptUser: currUser,
                });
                roomsData.get(roomCode).gameData.consecutiveDraws++;
            }
            if (consecutiveDraws == 2 && noValidCard()) {
                roomsData.get(roomCode).gameData.consecutiveDraws = 0;
                let nextUser = iteratorFuncs.get(roomsData.get(roomCode));
                roomsData.get(roomCode).gameData.currentPlayer = nextUser;
                io.to(roomCode).emit('update turn', {
                    roomData: stringifyWithSets(roomsData.get(roomCode))
                });
            }
        }
        return result;
    }


    return result;
};

// socket
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
                if (roomsData.get(roomCode).gameData.currentPlayer == socketData.userId) {
                    setTimeout(() => {
                        if (roomsData.get(roomCode).rejoinableUsers.has(socketData.userId)) {
                            // play valid instead
                            // throwCard({
                            //     roomCode,
                            //     card: randomChoice(roomsData.get(roomCode).usersCards.get(socketData.currUser)),
                            //     remUser: socketData.currUser,
                            // });
                        }
                    }, inactiveTurnLimit);
                }
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
            roomsData.get(data.roomCode).usersCards.set(data.userId, []);
            roomsData.get(data.roomCode).usersCardCounts[data.userId] = 0;
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
        roomsData.get(roomCode).permaUserSet = new Set(roomsData.get(roomCode).users);

        const selectedUser = randomChoice(roomsData.get(roomCode).users);
        roomsData.get(roomCode).gameData.currentPlayer = selectedUser;
        iteratorFuncs.set(roomsData.get(roomCode), selectedUser);

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
                roomsData.get(roomCode).discardDeck.set(
                    subkey + '_' + key,
                    0
                );
            });
        });

        const selectedGroundCard = drawCards(socket, { count: 1, grantUser: null, tillColor: null, nonAction: true, })[0];
        roomsData.get(roomCode).gameData.groundCard = selectedGroundCard;
        roomsData.get(roomCode).lastPileCards.push(selectedGroundCard);
        roomsData.get(roomCode).discardDeck.set(selectedGroundCard, 1);

        io.to(roomCode).emit('start game');
        io.to(roomCode).emit('init roomData', stringifyWithSets(roomsData.get(roomCode)));
    });

    socket.on('update gamePreferences', data => {
        let roomCode = socketsData.get(socket.id).roomCode;
        roomsData.get(roomCode).gamePreferences = data;
        io.to(roomCode).except(socket.id).emit('update gamePreferences', data);
    });

    socket.on('draw cards', (params, callback) => {
        let result = drawCards(socket, params);
        callback(result);
    });

    socket.on('fetch cards', (data, callback) => {
        let socketData = socketsData.get(socket.id);
        let result = roomsData.get(socketData.roomCode).usersCards.get(socketData.userId);
        callback(result);
    });

    socket.on('attempt throw', (data, callback) => {
        let result = attemptThrow(socket, data);
        callback(result);
    });

    socket.on('attempt draw', (data, callback) => {
        let result = attemptDraw(socket, data);
        callback(result);
    });

    socket.on('set wildColor', data => {
        let roomCode = socketsData.get(socket.id).roomCode;
        roomsData.get(roomCode).gameData.wildColor = data.selectedColor;
        io.to(roomCode).emit('update wildColor', { selectedColor: data.selectedColor });
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