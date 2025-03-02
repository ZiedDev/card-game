const crypto = require('crypto');

const generateRandomString = (length) => {
    return crypto.randomBytes(length).toString('hex')
}

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
        return `${this.x}_${this.y}`;
    }
}

function sumMap(map) {
    return Array.from(map.values()).reduce((a, b) => a + b, 0);
}

function weightedRandomChoice(map) {
    const keys = Array.from(map.keys());
    const cumWeights = Array.from(map.values()).reduce((acc, value) => {
        acc.push(acc.length == 0 ? value : value + acc[acc.length - 1]);
        return acc;
    }, []);
    const random = Math.floor(Math.random() * cumWeights[cumWeights.length - 1]);
    const key = keys[cumWeights.findIndex(weight => weight >= random)];
    return key;
}

function randomChoice(set) {
    const arr = Array.from(set);
    return arr[Math.floor(Math.random() * arr.length)];
}

const iteratorFuncs = {
    reset: (roomData) => {
        roomData.userIterator = new Set(roomData.gameData.direction == 'cw' ? Array.from(roomData.permaUserSet) : Array.from(roomData.permaUserSet).reverse()).values();
    },
    set: (roomData, value) => {
        iteratorFuncs.reset(roomData);
        while (roomData.userIterator.next().value != value) { };
    },
    get: (roomData) => {
        let next = roomData.userIterator.next().value;
        if (!next) {
            iteratorFuncs.reset(roomData);
            next = roomData.userIterator.next().value;
        }
        return next;
    },
};

function pullAndUpdateAvailableDeck(roomData, nonWild = false) {
    let choice = weightedRandomChoice(roomData.availableDeck);
    while (nonWild && choice.split('_')[1] == 'wild') {
        choice = weightedRandomChoice(roomData.availableDeck);
    }
    roomData.availableDeck.set(
        choice,
        roomData.availableDeck.get(choice) - 1
    )
    if (roomData.availableDeck.get(choice) == 0) {
        roomData.availableDeck.delete(choice);
    }
    if (sumMap(roomData.availableDeck) <= 0) {
        roomData.discardDeck.entries().forEach(([key, value]) => {
            roomData.availableDeck.set(key, value);
        });
        return [choice, true];
    }
    return [choice, false];
}

module.exports = {
    generateRandomString,
    stringifyWithSets,
    parseWithSets,
    Pair,
    sumMap,
    weightedRandomChoice,
    randomChoice,
    iteratorFuncs,
    pullAndUpdateAvailableDeck,
}