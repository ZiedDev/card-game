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
        localStorage.setItem(this._name, this._value);
        this._callback(this);
    }
    get val() {
        return this._value;
    }
    set val(value) {
        this._value = value;
        localStorage.setItem(this._name, JSON.stringify(this._value));
        this.update();
    }
}

let userId = new StoredValue('userId', '');
let userName = new StoredValue('userName', '');
let userPfp = new StoredValue('userPfp', 0);
let roomCode = new StoredValue('roomCode', '');

console.log(userId, userName, userPfp, roomCode);

function _resetUserStorage() {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('roomCode');
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

            window.location.href = '/room/' + resRoomCode;
        })
    }).catch(err => {
        console.info(err + " url: " + url);
    });
}

function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
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