roomCode.val = window.location.pathname.split('/')[window.location.pathname.split('/').length - 1];
const urlParams = new URLSearchParams(window.location.search);
let isWatch;

if (userId.val == '' || userName.val == '') {
    window.location.href = '/?r=' + roomCode.val; // put in text box
}

fetch(window.location.pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: userId.val, confName: urlParams.get('c') }),
}).then(response => {
    response.json().then(res => {
        console.log(res);
        if (res == 'false') {
            isWatch = true;
        } else if (res == 'conf_join') {
            window.location.href = '/?r=' + roomCode.val; // put in text box
        } else if (res == 'join') {
            time.val = new Date().getTime();
            isWatch = false;
        } else if (res == 'rejoin') {
            const newTime = new Date().getTime();
            if (newTime - time.val < 2 * 60 * 1000) {
                time.val = newTime;
                isWatch = false;
            } else {
                isWatch = true;
            }
        }
    })
}).catch(err => {
    console.info(err + " url: " + url);
});

let socket = io({
    'reconnection': true,
    'reconnectionDelay': 1000,
    'reconnectionDelayMax': 5000,
    'reconnectionAttempts': 50
});

if (isWatch) {
    // implement watching
} else {
    // implement normal
    socket.emit('join room', roomCode.val);
    socket.data = {
        userId: userId.val,
        userName: userName.val,
        roomCode: roomCode.val,
    }
}