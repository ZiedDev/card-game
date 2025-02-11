roomCode.val = window.location.pathname.split('/')[window.location.pathname.split('/').length - 1];
const urlParams = new URLSearchParams(window.location.search);

if (userId.val == '' || userName.val == '') {
    window.location.href = '/?r=' + roomCode.val;
}

async function getPlayResponse() {
    const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: userId.val,
            confName: urlParams.get('c'),
        }),
    });
    const res = await response.json();

    console.log(res);
    if (res == 'watch') {
        return false;
    } else if (res == 'conf_join') {
        window.location.href = '/?r=' + roomCode.val;
    } else if (res == 'join' || res == 'rejoin') {
        return true;
    }
    return null
}

let socket;
(async () => {

    const isPlay = await getPlayResponse();
    if (isPlay != null) {
        socket = io({
            'reconnection': true,
            'reconnectionDelay': 1000,
            'reconnectionDelayMax': 5000,
            'reconnectionAttempts': 50
        });
    }

    if (isPlay) {
        socket.emit('join room', roomCode.val);

        socket.data = {
            userId: userId.val,
            userName: userName.val,
            roomCode: roomCode.val,
        }
        socket.emit('update data', socket.data);

        socket.on('update data', data => {
            Object.entries(data).forEach(([property, value]) => {
                socket.data[property] = value;
            });
            console.log('updated data', socket.data);
        });

    } else {
        console.log('watch mode');
    }

})();