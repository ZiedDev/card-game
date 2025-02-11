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

    console.log('res type', res);
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
let currentRoomUsers = [];
let initialRoomJoin = true;
const playersList = document.getElementById('players-list');

(async () => {

    const isNotWatch = await getPlayResponse();
    if (isNotWatch != null) {
        socket = io({
            'reconnection': true,
            'reconnectionDelay': 1000,
            'reconnectionDelayMax': 5000,
            'reconnectionAttempts': 50
        });
    }

    if (isNotWatch) {
        socket.emit('join room', {
            userId: userId.val,
            userName: userName.val,
            userPfp: userPfp.val,
            roomCode: roomCode.val,
        });

        socket.on('update usersData', data => {
            socket.roomData = data;

            if (initialRoomJoin) {
                Object.values(socket.roomData.usersData).forEach(userData => {
                    const playerDOM = `
                    <div class="player" id="${userData.userId}-player-list">
                        <img class="user-image" src="/assets/pfps/${userData.userPfp}.svg" alt="">
                        <h2>${escapeHtml(userData.userName)}</h2>
                    </div>`;

                    playersList.appendChild(htmlToElement(playerDOM));
                });
            }

            initialRoomJoin = false
        });

        socket.on('update usersData changeonly', data => {
            if (!initialRoomJoin) {
                console.log('changeonly', data);
                const [userData, connecting] = data;

                if (connecting) {
                    const playerDOM = `
                    <div class="player" id="${userData.userId}-player-list">
                        <img class="user-image" src="/assets/pfps/${userData.userPfp}.svg" alt="">
                        <h2>${escapeHtml(userData.userName)}</h2>
                    </div>`

                    playersList.appendChild(htmlToElement(playerDOM));
                } else {
                    const childToRemove = document.getElementById(`${userData.userId}-player-list`)
                    playersList.removeChild(childToRemove)
                }
            }
        });

    } else {
        console.log('watch mode');
    }
})();