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
let userPfp = new StoredValue('userPfp', '0');
let roomCode = new StoredValue('roomCode', '');
let time = new StoredValue('time', '');

console.log(userId, userName, userPfp, roomCode, time);

function setName() {
    userId.val = Math.floor(Math.random() * 1000000);
    userName.val = window.crypto.randomUUID().split('-')[0];
}

function saveName() {
    userId.update();
    userName.update();
}

function resetName() {
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('roomCode');
    localStorage.removeItem('time');
}

async function createRoom() {
    await fetch(`/createRoom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.val }),
    }).then(response => {
        response.json().then(resRoomCode => {
            // userId.update(); userName.update();
            roomCode.val = resRoomCode; // kinda redundant
            time.val = new Date().getTime();

            window.location.href = '/room/' + resRoomCode;
        })
    }).catch(err => {
        console.info(err + " url: " + url);
    });
}