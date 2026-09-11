const crypto = require('crypto');

const generateRandomString = (length) => {
    return crypto.randomBytes(length).toString('hex');
};

function stringifyWithSets(obj) {
    return JSON.stringify(obj, (key, value) => {
        if (value instanceof Set) {
            return { type: 'Set', values: Array.from(value) };
        }
        return value;
    });
}

function parseWithSets(str) {
    return JSON.parse(str, (key, value) => {
        if (value && value.type === 'Set') {
            return new Set(value.values);
        }
        return value;
    });
}

class Pair {
    constructor(f, s = null) {
        if (s != null) {
            this.f = f;
            this.s = s;
        } else {
            [this.f, this.s] = f.split('_');
        }
    }

    toString() {
        return `${this.f}_${this.s}`;
    }
}

function sumMap(map) {
    if (!map || !(map instanceof Map)) return 0;
    return Array.from(map.values()).reduce((a, b) => a + b, 0);
}

function weightedRandomChoice(map) {
    if (!map || map.size === 0) return undefined;
    const keys = Array.from(map.keys());
    const cumWeights = Array.from(map.values()).reduce((acc, value) => {
        acc.push(acc.length === 0 ? value : value + acc[acc.length - 1]);
        return acc;
    }, []);
    const total = cumWeights[cumWeights.length - 1];
    if (total <= 0) return undefined;
    const random = Math.floor(Math.random() * total);
    const key = keys[cumWeights.findIndex(weight => weight > random)];
    return key;
}

function randomChoice(setOrArr) {
    const arr = Array.from(setOrArr || []);
    if (arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function advanceTurn(roomData, step = 1) {
    const users = Array.from(roomData.permaUserSet || roomData.users || []);
    if (users.length === 0) return null;
    let currIdx = users.indexOf(roomData.gameData.currentPlayer);
    if (currIdx === -1) currIdx = 0;
    const dirMultiplier = roomData.gameData.direction === 'cw' ? 1 : -1;
    const nextIdx = ((currIdx + dirMultiplier * step) % users.length + users.length) % users.length;
    roomData.gameData.currentPlayer = users[nextIdx];
    if (roomData.gameData) {
        roomData.gameData.consecutiveDraws = 0;
    }
    return roomData.gameData.currentPlayer;
}

function setCurrentPlayer(roomData, userId) {
    const users = Array.from(roomData.permaUserSet || roomData.users || []);
    if (users.includes(userId)) {
        roomData.gameData.currentPlayer = userId;
        if (roomData.gameData) {
            roomData.gameData.consecutiveDraws = 0;
        }
    }
    return roomData.gameData.currentPlayer;
}

function getNextPlayer(roomData, step = 1) {
    const users = Array.from(roomData.permaUserSet || roomData.users || []);
    if (users.length === 0) return null;
    let currIdx = users.indexOf(roomData.gameData.currentPlayer);
    if (currIdx === -1) currIdx = 0;
    const dirMultiplier = roomData.gameData.direction === 'cw' ? 1 : -1;
    const nextIdx = ((currIdx + dirMultiplier * step) % users.length + users.length) % users.length;
    return users[nextIdx];
}

const iteratorFuncs = {
    reset: (roomData) => {},
    set: (roomData, value) => setCurrentPlayer(roomData, value),
    get: (roomData, step = 1) => advanceTurn(roomData, step),
};

function reshuffleDiscardIntoAvailable(roomData) {
    if (!roomData || !roomData.discardDeck) return false;
    const lastCard = roomData.lastPileCards && roomData.lastPileCards.length > 0
        ? roomData.lastPileCards[roomData.lastPileCards.length - 1]
        : null;

    let cardsAdded = false;
    roomData.discardDeck.forEach((value, key) => {
        if (key === lastCard) {
            if (value > 1) {
                roomData.availableDeck.set(key, (roomData.availableDeck.get(key) || 0) + (value - 1));
                roomData.discardDeck.set(key, 1);
                cardsAdded = true;
            }
        } else if (value > 0) {
            roomData.availableDeck.set(key, (roomData.availableDeck.get(key) || 0) + value);
            roomData.discardDeck.set(key, 0);
            cardsAdded = true;
        }
    });
    return cardsAdded;
}

function pullAndUpdateAvailableDeck(roomData, nonAction = false) {
    if (!roomData || !roomData.availableDeck) return [null, false];

    let reshuffled = false;
    if (sumMap(roomData.availableDeck) <= 0) {
        reshuffled = reshuffleDiscardIntoAvailable(roomData);
        if (sumMap(roomData.availableDeck) <= 0) {
            return [null, false];
        }
    }

    let choice = weightedRandomChoice(roomData.availableDeck);
    if (choice === undefined) return [null, false];

    if (nonAction) {
        let attempts = 0;
        while (attempts < 100 && (choice.split('_')[1] === 'wild' || ['reverse', 'skip', 'draw'].includes(choice.split('_')[0]))) {
            choice = weightedRandomChoice(roomData.availableDeck);
            attempts++;
        }
    }

    const currentCount = roomData.availableDeck.get(choice) || 0;
    if (currentCount <= 1) {
        roomData.availableDeck.delete(choice);
    } else {
        roomData.availableDeck.set(choice, currentCount - 1);
    }

    if (sumMap(roomData.availableDeck) <= 0) {
        const reshuffleDone = reshuffleDiscardIntoAvailable(roomData);
        return [choice, reshuffleDone || reshuffled];
    }

    return [choice, reshuffled];
}

module.exports = {
    generateRandomString,
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
};