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
const playerListAnimationObject = { opacity: 0, x: -70, duration: 1 };

(async () => {
    // load DOM Content
    await loadEJS('partials/room-content', html => {
        document.getElementById('page-container').innerHTML = ''
        document.getElementById('page-container').appendChild(htmlToElement(html))
    })

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
                    <div class="player ${userData.userId}-player-list" id="${userData.userId}-player-list">
                        <img class="user-image" src="/assets/pfps/${userData.userPfp}.svg" alt="">
                        <h2>${escapeHtml(userData.userName)}</h2>
                    </div>`;

                    document.getElementById('players-list').appendChild(htmlToElement(playerDOM));
                    gsap.from(`.${userData.userId}-player-list`, playerListAnimationObject);
                });
            }

            initialRoomJoin = false
        });

        socket.on('update usersData changeonly', data => {
            if (!initialRoomJoin) {
                const [userData, connecting] = data;

                if (connecting) {
                    const playerDOM = `
                    <div class="player ${userData.userId}-player-list" id="${userData.userId}-player-list">
                        <img class="user-image" src="/assets/pfps/${userData.userPfp}.svg" alt="">
                        <h2>${escapeHtml(userData.userName)}</h2>
                    </div>`

                    document.getElementById('players-list').appendChild(htmlToElement(playerDOM));
                    const tween = gsap.from(`.${userData.userId}-player-list`, playerListAnimationObject);

                } else {
                    const childToRemove = document.getElementById(`${userData.userId}-player-list`)
                    gsap.to(`.${userData.userId}-player-list`, { opacity: 0, x: -70, duration: 1 });
                    setTimeout(() => {
                        document.getElementById('players-list').removeChild(childToRemove)
                    }, 1000);
                }
            }
        });

        document.getElementById('start-button').addEventListener('click', async e => {
            await loadEJS('partials/game-content', html => {
                document.getElementById('page-container').innerHTML = ''
                document.getElementById('page-container').appendChild(htmlToElement(html))

                // necessary for script to run
                const script = document.createElement('script');
                script.src = '/js/game.js'
                document.getElementById('page-container').appendChild(script)
            });
        });

    } else {
        console.log('watch mode');
    }
})();