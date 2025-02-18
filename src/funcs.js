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

module.exports = {
    generateRandomString,
    stringifyWithSets,
    parseWithSets,
    Pair,
    weightedRandomChoice,
    randomChoice,
}