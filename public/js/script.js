class StoredValue {
    constructor(localStorageName, defaultValue = false, updateCallback = self => { }) {
        this._name = localStorageName;
        this._callback = updateCallback;
        try {
            this._value = JSON.parse(localStorage.getItem(this._name));
            if (this._value == null) throw new Error('');
        } catch (err) {
            if (err instanceof SyntaxError) {
                this._value = localStorage.getItem(this._name);
            } else {
                this._value = defaultValue;
                this._callback(this);
            }
        }
    }
    update() {
        localStorage.setItem(this._name, JSON.stringify(this._value));
        this._callback(this);
    }
    get val() {
        return this._value;
    }
    set val(value) {
        this._value = value;
        this.update();
    }
}

const gamePreferenceOptions = {
    "Number of decks": {
        options: ['1', '2', '3'],
        default: '1',
    },
    "Wild cards": {
        options: ['enable', 'disable'],
        default: 'enable',
    },
    "Wild draw 2 card": {
        options: ['enable', 'disable'],
        default: 'enable',
    },
    "Wild stack card": {
        options: ['enable', 'disable'],
        default: 'enable',
    },
}

let userId = new StoredValue('userId', '');
let userName = new StoredValue('userName', '');
let userPfp = new StoredValue('userPfp', 0);
let roomCode = new StoredValue('roomCode', '');
let userDeckSkin = new StoredValue('userDeckSkin', 'skin_1');
let userGamePreferences = new StoredValue(
    'userGamePreferences',
    Object.keys(gamePreferenceOptions).reduce((acc, key) => {
        acc[key] = gamePreferenceOptions[key].default;
        return acc;
    }, {})
);


console.log(userId, userName, userPfp, roomCode, userGamePreferences);

function _resetUserStorage() {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userPfp');
    localStorage.removeItem('roomCode');
    localStorage.removeItem('userGamePreferences');
}

async function createRoom() {
    await fetch(`/createRoom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.val }),
    }).then(response => {
        response.json().then(resRoomCode => {
            // userId and userName should be set by now
            // roomCode will be set right after
            roomCode.val = resRoomCode; // redundant

            window.location.href = '/room/' + resRoomCode + '?c=1';
        })
    }).catch(err => {
        console.info(err + " url: " + url);
    });
}

function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function encodeBase64(string) {
    const base64 = btoa(string);
    return base64.replace(/[^a-zA-Z0-9]/g, '');
}

async function loadEJS(filename, callback = (html) => { }, ejsParams = {}) {
    await fetch('/request-room-ejs', {
        method: "PUT",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            filename,
            ejsParams,
        }),
    }).then(response => {
        response.text().then(html => {
            callback(html);
        });
    });
}

function rangeLerp(
    inputValue,
    inputRangeStart = 0,
    InputRangeEnd = 1,
    OutputRangeStart,
    OutputRangeEnd,
    capInput = false,
    decimalPlaces = 1) {
    let t = inputValue;
    if (capInput) {
        t = Math.max(Math.min(t, InputRangeEnd), inputRangeStart);
    }
    let res = OutputRangeStart * (InputRangeEnd - t) + OutputRangeEnd * (t - inputRangeStart);
    res /= (InputRangeEnd - inputRangeStart);
    return res.toFixed(decimalPlaces);
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