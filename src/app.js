// environment variables & constants
require('dotenv').config();
const hostname = process.env.HOSTNAME = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT = process.env.PORT || 8080;
const nodeEnv = process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const maxPileSize = process.env.MAX_PILE_SIZE = process.env.MAX_PILE_SIZE || 10;

// Centralized timing configuration (all values in ms)
const TIMINGS = {
    GRACE_PERIOD: parseInt(process.env.GRACE_PERIOD || 5000),                // 5s grace period for disconnected player / wild chooser
    ABANDONED_ROOM_TIMEOUT: parseInt(process.env.ABANDONED_ROOM_TIMEOUT || 5 * 60 * 1000), // 5 min timeout before deleting empty room
};

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
    advanceTurn,
    setCurrentPlayer,
    getNextPlayer,
    iteratorFuncs,
    reshuffleDiscardIntoAvailable,
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
            wildChooser: null,
            stackDraw: null,
            consecutiveDraws: 0,
        },
        lastPileCards: [],
        usersCardCounts: {},

        // not sended to client
        userIterator: null,
        autoPlayTimeout: null,
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
    let roomCode = params.roomCode || (socket && socketsData.get(socket.id) && socketsData.get(socket.id).roomCode);
    if (!roomCode || !roomsData.has(roomCode)) return null;
    const room = roomsData.get(roomCode);
    let result = [];
    if (params.tillColor) {
        let choice = ' _ ';
        let reshuffle;
        let attempts = 0;
        while (choice.split('_')[1] != params.tillColor && attempts < 150) {
            [choice, reshuffle] = pullAndUpdateAvailableDeck(room, params.nonAction);
            if (choice === null) break;
            result.push(choice);
            if (reshuffle) io.to(roomCode).emit('reshuffle');
            attempts++;
        }
    } else {
        for (let i = 0; i < params.count; i++) {
            let [choice, reshuffle] = pullAndUpdateAvailableDeck(room, params.nonAction);
            if (choice === null) break;
            result.push(choice);
            if (reshuffle) io.to(roomCode).emit('reshuffle');
        }
    }
    if (params.grantUser && result.length > 0) {
        const hand = room.usersCards.get(params.grantUser);
        if (hand) {
            result.forEach(card => hand.push(card));
            room.usersCardCounts[params.grantUser] = hand.length;
        }
    }

    return result.length > 0 ? result : null;
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
    let roomCode = params.roomCode || (socket && socketsData.get(socket.id) && socketsData.get(socket.id).roomCode);
    if (!roomCode || !roomsData.has(roomCode)) return false;
    const room = roomsData.get(roomCode);
    if (room.finished) return false;

    const socketId = params.socketId;
    const currUser = params.user;
    const isSelfTurn = room.gameData.currentPlayer == currUser;
    const cardName = params.cardName;
    if (!cardName) return false;

    const userHand = room.usersCards.get(currUser);
    if (!userHand) return false;
    const index = userHand.indexOf(cardName);
    if (index === -1) {
        console.log(`ERROR ${currUser} doesnt have card ${cardName} in [${userHand}]`);
        return false;
    }

    const cardParts = cardName.split('_');
    const groundCard = room.gameData.groundCard;
    const groundCardParts = groundCard.split('_');
    const drawSum = room.gameData.drawSum;
    const wildColor = room.gameData.wildColor;
    const stackDraw = room.gameData.stackDraw;
    const preferences = room.gamePreferences;

    // jump in
    if (preferences["Jump-in"] == 'enable' && !isSelfTurn && cardParts[1] != 'wild' && cardName == groundCard) {
        setCurrentPlayer(room, currUser);
    }
    else if (!isSelfTurn) {
        return false;
    }

    if (!checkThrowValidity(cardParts, groundCardParts, drawSum, wildColor, stackDraw, preferences)) {
        return false;
    }

    // successful throw
    const isGameOver = userHand.length === 1;

    room.gameData.consecutiveDraws = 0;

    let step = 1;
    // reverse iterator if reverse
    if (cardParts[0] == 'reverse') {
        room.gameData.direction = room.gameData.direction == 'cw' ? 'acw' : 'cw';
        if (room.permaUserSet && room.permaUserSet.size == 2) {
            step = 2;
        }
    } else if (cardParts[0] == 'skip') {
        step = 2;
    }

    // update wildColor if wild (only if game is continuing)
    if (cardParts[1] == 'wild' && !isGameOver) {
        room.gameData.wildColor = null;
        room.gameData.wildChooser = currUser;
        io.to(socketId).emit('request wildColor');
    }

    // update stackDraw if stack
    if (cardParts[0] == 'stack') {
        room.gameData.stackDraw = true;
    }

    // add to drawSum if draw
    if (cardParts[0] == 'draw') {
        room.gameData.drawSum += 2;
    }
    if (cardParts[0] == 'draw4') {
        room.gameData.drawSum += 4;
    }
    if (cardParts[0] == 'draw' || cardParts[0] == 'draw4') {
        io.to(roomCode).emit('update drawSum', {
            drawSum: room.gameData.drawSum
        });
    }

    // increment user
    let nextUser = advanceTurn(room, step);

    // remove card from user
    userHand.splice(index, 1);
    room.usersCardCounts[currUser] = userHand.length;

    // update cards
    room.gameData.prevGroundCard = groundCard;
    room.gameData.groundCard = cardName;

    room.lastPileCards.push(cardName);
    if (room.lastPileCards.length > maxPileSize) {
        room.lastPileCards.shift();
    }

    room.discardDeck.set(
        cardName,
        (room.discardDeck.get(cardName) || 0) + 1
    );

    if (isGameOver) {
        room.finished = true;
        room.gameData.winner = currUser;
    }

    // socket emits
    io.to(roomCode).emit('update turn', {
        roomData: stringifyWithSets(room)
    });

    if (socketId) {
        io.to(roomCode).except(socketId).emit('throw other', {
            cardName: cardName,
            exceptUser: currUser,
        });
    } else {
        io.to(roomCode).emit('throw other', {
            cardName: cardName,
            exceptUser: currUser,
        });
    }

    if (isGameOver) {
        const winnerData = room.usersData[currUser] || {};
        io.to(roomCode).emit('game over', {
            winnerId: currUser,
            winnerName: winnerData.userName || 'Player',
            winnerPfp: winnerData.userPfp !== undefined ? winnerData.userPfp : 0,
            roomData: stringifyWithSets(room)
        });
        cancelAutoPlayTimer(room);
    } else {
        scheduleAutoPlayIfAway(roomCode);
    }

    return true;
};

const cancelAutoPlayTimer = (room) => {
    if (room && room.autoPlayTimeout) {
        clearTimeout(room.autoPlayTimeout);
        room.autoPlayTimeout = null;
    }
};

const resolveWildChooserAuto = (roomCode) => {
    if (!roomsData.has(roomCode)) return;
    const room = roomsData.get(roomCode);
    if (!room || !room.started || room.finished) return;

    if (room.gameData.wildChooser && !room.gameData.wildColor && room.rejoinableUsers.has(room.gameData.wildChooser)) {
        const autoColor = randomChoice(['red', 'blue', 'green', 'yellow']);
        room.gameData.wildColor = autoColor;
        room.gameData.wildChooser = null;
        io.to(roomCode).emit('update wildColor', { selectedColor: autoColor });
        scheduleAutoPlayIfAway(roomCode);
    }
};

const performAutoPlay = (roomCode) => {
    if (!roomsData.has(roomCode)) return;
    const room = roomsData.get(roomCode);
    if (!room || !room.started || room.finished) return;

    const currUser = room.gameData.currentPlayer;
    if (!currUser || !room.rejoinableUsers.has(currUser)) return;

    const preferences = room.gamePreferences || {};
    const userCards = room.usersCards.get(currUser) || [];
    const groundCard = room.gameData.groundCard;
    const groundCardParts = (groundCard || '').split('_');
    const drawSum = room.gameData.drawSum;
    const wildColor = room.gameData.wildColor;
    const stackDraw = room.gameData.stackDraw;

    // 1. Handle active stackDraw penalty
    if (stackDraw && wildColor) {
        attemptDraw(null, { roomCode, user: currUser, socketId: null });
        scheduleAutoPlayIfAway(roomCode);
        return;
    }

    // 2. Handle active drawSum penalty
    if (drawSum > 0) {
        if (preferences["Stack draw-2 and draw-4 cards"] === 'enable') {
            const stackCard = userCards.find(c => {
                const parts = c.split('_');
                return (parts[0] === 'draw' || parts[0] === 'draw4');
            });
            if (stackCard) {
                attemptThrow(null, { roomCode, user: currUser, cardName: stackCard, socketId: null });
                if (stackCard.split('_')[1] === 'wild' && !room.finished) {
                    const autoColor = randomChoice(['red', 'blue', 'green', 'yellow']);
                    room.gameData.wildColor = autoColor;
                    room.gameData.wildChooser = null;
                    io.to(roomCode).emit('update wildColor', { selectedColor: autoColor });
                }
                scheduleAutoPlayIfAway(roomCode);
                return;
            }
        }
        attemptDraw(null, { roomCode, user: currUser, socketId: null });
        scheduleAutoPlayIfAway(roomCode);
        return;
    }

    // 3. Normal turn: check if we have a playable card in hand
    const validCards = userCards.filter(card => {
        return checkThrowValidity(card.split('_'), groundCardParts, drawSum, wildColor, stackDraw, preferences);
    });

    if (validCards.length > 0) {
        // Pick the first valid card (prefer non-wild if available)
        const chosenCard = validCards.find(c => c.split('_')[1] !== 'wild') || validCards[0];
        attemptThrow(null, { roomCode, user: currUser, cardName: chosenCard, socketId: null });
        if (chosenCard.split('_')[1] === 'wild' && !room.finished) {
            const autoColor = randomChoice(['red', 'blue', 'green', 'yellow']);
            room.gameData.wildColor = autoColor;
            room.gameData.wildChooser = null;
            io.to(roomCode).emit('update wildColor', { selectedColor: autoColor });
        }
        scheduleAutoPlayIfAway(roomCode);
        return;
    }

    // 4. No valid card: Draw according to room preferences
    const drawRule = preferences["Draw Limit"] || preferences["Continue to Draw Until You Can Play"] || 'maximum 2 cards';
    const maxDraws = drawRule === 'maximum 1 card' ? 1 : (drawRule === 'maximum 2 cards' ? 2 : 25);

    let playedAfterDraw = false;
    for (let d = 0; d < maxDraws; d++) {
        const drawn = drawCards(null, { roomCode, count: 1, grantUser: currUser, tillColor: null, nonAction: null });
        if (!drawn || drawn.length === 0) break;
        io.to(roomCode).emit('draw other', {
            cardCount: 1,
            exceptUser: currUser,
        });

        const drawnCard = drawn[0];
        if (checkThrowValidity(drawnCard.split('_'), groundCardParts, drawSum, wildColor, stackDraw, preferences)) {
            attemptThrow(null, { roomCode, user: currUser, cardName: drawnCard, socketId: null });
            if (drawnCard.split('_')[1] === 'wild' && !room.finished) {
                const autoColor = randomChoice(['red', 'blue', 'green', 'yellow']);
                room.gameData.wildColor = autoColor;
                room.gameData.wildChooser = null;
                io.to(roomCode).emit('update wildColor', { selectedColor: autoColor });
            }
            playedAfterDraw = true;
            break;
        }
    }

    if (!playedAfterDraw && !room.finished) {
        const nextUser = advanceTurn(room);
        room.gameData.currentPlayer = nextUser;
        room.gameData.consecutiveDraws = 0;
        io.to(roomCode).emit('update turn', {
            roomData: stringifyWithSets(room)
        });
    }

    scheduleAutoPlayIfAway(roomCode);
};

const scheduleAutoPlayIfAway = (roomCode) => {
    if (!roomsData.has(roomCode)) return;
    const room = roomsData.get(roomCode);
    if (!room || !room.started || room.finished) {
        cancelAutoPlayTimer(room);
        return;
    }

    cancelAutoPlayTimer(room);

    // If wild chooser is away and wildColor is pending
    if (room.gameData.wildChooser && !room.gameData.wildColor && room.rejoinableUsers.has(room.gameData.wildChooser)) {
        room.autoPlayTimeout = setTimeout(() => {
            resolveWildChooserAuto(roomCode);
        }, TIMINGS.GRACE_PERIOD);
        return;
    }

    // If current player is away
    if (room.gameData.currentPlayer && room.rejoinableUsers.has(room.gameData.currentPlayer)) {
        room.autoPlayTimeout = setTimeout(() => {
            performAutoPlay(roomCode);
        }, TIMINGS.GRACE_PERIOD);
    }
};

const attemptDraw = (socket, params) => {
    let roomCode = params.roomCode || (socket && socketsData.get(socket.id) && socketsData.get(socket.id).roomCode);
    if (!roomCode || !roomsData.has(roomCode)) return null;
    const room = roomsData.get(roomCode);
    if (room.finished) return null;

    let result = null;
    const socketId = params.socketId;
    const currUser = params.user;
    const isSelfTurn = room.gameData.currentPlayer == currUser;
    const groundCard = room.gameData.groundCard;
    const groundCardParts = groundCard.split('_');
    const drawSum = room.gameData.drawSum;
    const wildColor = room.gameData.wildColor;
    const stackDraw = room.gameData.stackDraw;
    const preferences = room.gamePreferences;

    if (!isSelfTurn) {
        return false;
    }

    if (stackDraw && wildColor) {
        result = drawCards(socket, { count: null, grantUser: currUser, tillColor: wildColor, nonAction: null, });
        if (result == null) {
            let nextUser = advanceTurn(room);
            room.gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(room)
            });
            return null;
        }
        if (socketId) {
            io.to(roomCode).except(socketId).emit('draw other', {
                cardCount: result.length,
                exceptUser: currUser,
            });
        } else {
            io.to(roomCode).emit('draw other', {
                cardCount: result.length,
                exceptUser: currUser,
            });
        }
        room.gameData.stackDraw = false;

        if (preferences["draw-2 and draw-4 skips"] == 'skip') {
            let nextUser = advanceTurn(room);
            room.gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(room)
            });
        }
        scheduleAutoPlayIfAway(roomCode);
        return result;
    }

    if (drawSum) {
        result = drawCards(socket, { count: drawSum, grantUser: currUser, tillColor: null, nonAction: null, });
        if (result == null) {
            let nextUser = advanceTurn(room);
            room.gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(room)
            });
            scheduleAutoPlayIfAway(roomCode);
            return null;
        }
        if (socketId) {
            io.to(roomCode).except(socketId).emit('draw other', {
                cardCount: drawSum,
                exceptUser: currUser,
            });
        } else {
            io.to(roomCode).emit('draw other', {
                cardCount: drawSum,
                exceptUser: currUser,
            });
        }
        room.gameData.drawSum = 0;
        io.to(roomCode).emit('update drawSum', {
            drawSum: room.gameData.drawSum
        });

        if (preferences["draw-2 and draw-4 skips"] == 'skip') {
            let nextUser = advanceTurn(room);
            room.gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(room)
            });
        }
        scheduleAutoPlayIfAway(roomCode);
        return result;
    }

    // check if no cards can be played
    const userCards = room.usersCards.get(currUser) || [];
    const noValidCard = () => !userCards.some(card => {
        return checkThrowValidity(card.split('_'), groundCardParts, drawSum, wildColor, stackDraw, preferences);
    });

    const allowDrawingWithValid = preferences["Allow drawing even with a valid card"] == 'enable';
    const drawRule = preferences["Draw Limit"] || preferences["Continue to Draw Until You Can Play"];
    const maxDraws = drawRule === 'maximum 1 card' ? 1 : (drawRule === 'maximum 2 cards' ? 2 : Infinity);

    if (room.gameData.consecutiveDraws >= maxDraws) {
        return null;
    }

    if (!allowDrawingWithValid && !noValidCard()) {
        return null;
    }

    result = drawCards(socket, { count: 1, grantUser: currUser, tillColor: null, nonAction: null, });
    if (result == null) {
        if (noValidCard()) {
            let nextUser = advanceTurn(room);
            room.gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(room)
            });
            scheduleAutoPlayIfAway(roomCode);
        }
        return null;
    }

    if (socketId) {
        io.to(roomCode).except(socketId).emit('draw other', {
            cardCount: 1,
            exceptUser: currUser,
        });
    } else {
        io.to(roomCode).emit('draw other', {
            cardCount: 1,
            exceptUser: currUser,
        });
    }
    room.gameData.consecutiveDraws++;

    if (room.gameData.consecutiveDraws >= maxDraws) {
        if (noValidCard()) {
            let nextUser = advanceTurn(room);
            room.gameData.currentPlayer = nextUser;
            io.to(roomCode).emit('update turn', {
                roomData: stringifyWithSets(room)
            });
        }
    }

    scheduleAutoPlayIfAway(roomCode);
    return result;
};

const attemptSkip = (socket, params) => {
    let roomCode = params.roomCode || (socket && socketsData.get(socket.id) && socketsData.get(socket.id).roomCode);
    if (!roomCode || !roomsData.has(roomCode)) return false;
    const room = roomsData.get(roomCode);
    if (room.finished) return false;

    const currUser = params.user;
    const isSelfTurn = room.gameData.currentPlayer == currUser;
    const preferences = room.gamePreferences || {};

    if (!isSelfTurn) {
        return false;
    }

    if (preferences["Manual Turn Skip Button"] === 'disable') {
        return false;
    }

    if (room.gameData.drawSum > 0 || room.gameData.stackDraw) {
        return false;
    }

    let nextUser = advanceTurn(room);
    room.gameData.currentPlayer = nextUser;
    io.to(roomCode).emit('update turn', {
        roomData: stringifyWithSets(room)
    });
    scheduleAutoPlayIfAway(roomCode);
    return true;
};

// socket
io.on('connection', socket => {
    console.log(`user [${socket.id}] connected`);
    socketsData.set(socket.id, {});

    socket.on('disconnecting', () => {
        let socketData = socketsData.get(socket.id);
        if (socketData && socketData.hasOwnProperty('roomCode') && roomsData.has(socketData.roomCode)) {
            let roomCode = socketData.roomCode;
            const room = roomsData.get(roomCode);
            room.users.delete(socketData.userId);
            io.to(roomCode).except(socket.id).emit(
                'update userList',
                [socketData, false, room.started]
            );
            if (room.started) {
                room.rejoinableUsers.add(socketData.userId);
                scheduleAutoPlayIfAway(roomCode);
            } else {
                delete room.usersData[socketData.userId];
                const newOwnerId = room.users.values().next().value;
                if (room.owner == socketData.userId && newOwnerId) {
                    room.owner = newOwnerId;
                    if (room.usersData[newOwnerId]) {
                        room.gamePreferences = room.usersData[newOwnerId].userGamePreferences;
                    }
                    io.to(roomCode).emit('init roomData', stringifyWithSets(room));
                }
            }

            // Room garbage collection: clean up rooms with no remaining users
            if (room.users.size === 0) {
                if (!room.started || room.finished) {
                    if (room.cleanupTimeout) clearTimeout(room.cleanupTimeout);
                    cancelAutoPlayTimer(room);
                    rooms.delete(roomCode);
                    roomsData.delete(roomCode);
                    console.log(`Room [${roomCode}] cleaned up.`);
                } else if (!room.cleanupTimeout) {
                    // Ongoing game abandoned: grace period before cleaning up
                    room.cleanupTimeout = setTimeout(() => {
                        if (roomsData.has(roomCode) && roomsData.get(roomCode).users.size === 0) {
                            cancelAutoPlayTimer(roomsData.get(roomCode));
                            rooms.delete(roomCode);
                            roomsData.delete(roomCode);
                            console.log(`Abandoned Room [${roomCode}] cleaned up after timeout.`);
                        }
                    }, TIMINGS.ABANDONED_ROOM_TIMEOUT);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        socketsData.delete(socket.id);
        console.log(`user [${socket.id}] disconnected`);
    });

    socket.on('join room', data => {
        if (!data || !data.roomCode || !roomsData.has(data.roomCode)) return;
        const room = roomsData.get(data.roomCode);
        if (room.cleanupTimeout) {
            clearTimeout(room.cleanupTimeout);
            room.cleanupTimeout = null;
        }

        socket.join(data.roomCode);

        // init socketData
        Object.entries(data).forEach(([property, value]) => { // semi-unnecessary
            socketsData.get(socket.id)[property] = value;
        });

        if (room.rejoinableUsers.has(data.userId)) {
            room.rejoinableUsers.delete(data.userId);
            room.users.add(data.userId);
            if (room.gameData.wildChooser === data.userId || room.gameData.currentPlayer === data.userId) {
                cancelAutoPlayTimer(room);
            }
        }

        room.usersData[data.userId] = data;
        if (!room.usersCards.has(data.userId)) {
            room.usersCards.set(data.userId, []);
            room.usersCardCounts[data.userId] = 0;
        }
        if (room.owner == data.userId) {
            room.gamePreferences = data.userGamePreferences;
        }

        socket.emit('init roomData', stringifyWithSets(room));
        io.to(data.roomCode).except(socket.id).emit(
            'update userList',
            [data, true, room.started]
        );

        if (room.started) {
            socket.emit('start game');
            if (room.gameData.wildChooser === data.userId && !room.gameData.wildColor) {
                socket.emit('request wildColor');
            } else {
                scheduleAutoPlayIfAway(data.roomCode);
            }
        }
    });

    socket.on('start game', () => {
        const socketData = socketsData.get(socket.id);
        if (!socketData || !socketData.roomCode || !roomsData.has(socketData.roomCode)) return;
        let roomCode = socketData.roomCode;
        const room = roomsData.get(roomCode);
        if (!room || room.started) return;

        room.started = true;
        room.permaUserSet = new Set(room.users);

        const selectedUser = randomChoice(room.users);
        room.gameData.currentPlayer = selectedUser;
        setCurrentPlayer(room, selectedUser);

        // init deck
        room.availableDeck.clear();
        room.discardDeck.clear();
        Object.entries(cardCount).forEach(([key, value]) => {
            Object.entries(value).forEach(([subkey, count]) => {
                if (room.gamePreferences['Wild cards'] == 'disable' && key == 'wild') {
                    return;
                } else {
                    if (room.gamePreferences['Wild draw 2 card'] == 'disable' && subkey == 'draw') {
                        return;
                    }
                    if (room.gamePreferences['Wild stack card'] == 'disable' && subkey == 'stack') {
                        return;
                    }
                }
                room.availableDeck.set(
                    subkey + '_' + key,
                    count * parseInt(room.gamePreferences['Number of decks'] || 1)
                );
                room.discardDeck.set(
                    subkey + '_' + key,
                    0
                );
            });
        });

        const selectedGroundCard = drawCards(socket, { count: 1, grantUser: null, tillColor: null, nonAction: true, })[0];
        room.gameData.groundCard = selectedGroundCard;
        room.lastPileCards = [selectedGroundCard];
        room.discardDeck.set(selectedGroundCard, 1);

        // Server-authoritative initial hand dealing (7 cards per user)
        room.users.forEach(userId => {
            const userHand = [];
            for (let i = 0; i < 7; i++) {
                let [card] = pullAndUpdateAvailableDeck(room);
                if (card) userHand.push(card);
            }
            room.usersCards.set(userId, userHand);
            room.usersCardCounts[userId] = userHand.length;
        });

        io.to(roomCode).emit('start game');
        io.to(roomCode).emit('init roomData', stringifyWithSets(room));
        scheduleAutoPlayIfAway(roomCode);
    });

    socket.on('update gamePreferences', data => {
        const socketData = socketsData.get(socket.id);
        if (!socketData || !socketData.roomCode || !roomsData.has(socketData.roomCode)) return;
        let roomCode = socketData.roomCode;
        roomsData.get(roomCode).gamePreferences = data;
        io.to(roomCode).except(socket.id).emit('update gamePreferences', data);
    });

    socket.on('draw cards', (params, callback) => {
        let result = drawCards(socket, params);
        if (typeof callback === 'function') callback(result);
    });

    socket.on('fetch cards', (data, callback) => {
        if (typeof callback !== 'function') return;
        let socketData = socketsData.get(socket.id);
        if (!socketData || !socketData.roomCode || !roomsData.has(socketData.roomCode)) {
            return callback([]);
        }
        const room = roomsData.get(socketData.roomCode);
        let result = (room.usersCards && room.usersCards.get(socketData.userId)) || [];
        callback(result);
    });

    socket.on('attempt throw', (data, callback) => {
        let result = attemptThrow(socket, data);
        if (typeof callback === 'function') callback(result);
    });

    socket.on('attempt draw', (data, callback) => {
        let result = attemptDraw(socket, data);
        if (typeof callback === 'function') callback(result);
    });

    socket.on('attempt skip', (data, callback) => {
        let result = attemptSkip(socket, data);
        if (typeof callback === 'function') callback(result);
    });

    socket.on('set wildColor', data => {
        const socketData = socketsData.get(socket.id);
        if (!socketData || !socketData.roomCode || !roomsData.has(socketData.roomCode) || !data) return;
        let roomCode = socketData.roomCode;
        const room = roomsData.get(roomCode);
        const validColors = ['green', 'yellow', 'blue', 'red'];
        if (!validColors.includes(data.selectedColor)) return;
        const groundCardParts = (room.gameData.groundCard || '').split('_');
        if (groundCardParts[1] !== 'wild') return;

        room.gameData.wildColor = data.selectedColor;
        room.gameData.wildChooser = null;
        io.to(roomCode).emit('update wildColor', { selectedColor: data.selectedColor });
        scheduleAutoPlayIfAway(roomCode);
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