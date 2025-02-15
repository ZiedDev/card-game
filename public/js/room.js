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

    console.log('res-type', res);
    if (res == 'watch' || res == 'duplicate') {
        return false;
    } else if (res == 'conf_join') {
        window.location.href = '/?r=' + roomCode.val;
    } else if (res == 'join' || res == 'rejoin') {
        return true;
    }
    return null
}

let socket;
const playerListAnimationObject = { opacity: 0, x: -70, duration: 1 };

(async () => {
    // load DOM Content
    await loadEJS('partials/room-content', html => {
        document.getElementById('page-container').innerHTML = ''
        document.getElementById('page-container').appendChild(htmlToElement(html))
    })

    const isWatch = !(await getPlayResponse());
    if (isWatch != null) {
        socket = io({
            'reconnection': true,
            'reconnectionDelay': 1000,
            'reconnectionDelayMax': 5000,
            'reconnectionAttempts': 50
        });
    }

    if (isWatch) {
        console.log('watch mode');
        return;
    }

    socket.data = {
        userId: userId.val,
        userName: userName.val,
        userPfp: userPfp.val,
        roomCode: roomCode.val,
        userGamePreferences: userGamePreferences.val,
    }
    socket.emit('join room', socket.data);

    socket.on('init roomData', data => {
        socket.roomData = parseWithSets(data);
        socket.isOwner = socket.roomData.owner == userId.val;

        document.getElementById('room-title').innerHTML = `${socket.roomData.usersData[socket.roomData.owner].userName}'s Room`;

        document.getElementById('players-list').innerHTML = '';
        document.getElementById('settings').innerHTML = '';

        Object.values(socket.roomData.usersData).forEach(userData => {
            const playerDOM = `
            <div class="player ${userData.userId}-player-list ${socket.roomData.owner == userData.userId ? "owner" : ""} ${socket.data.userId == userData.userId ? "self" : ""}" id="${userData.userId}-player-list">
                <img class="user-image" src="/assets/pfps/${userData.userPfp}.svg" alt="">
                <h2>${escapeHtml(userData.userName)}</h2>
            </div>`;

            document.getElementById('players-list').appendChild(htmlToElement(playerDOM));
            gsap.from(`.${userData.userId}-player-list`, playerListAnimationObject);
        });

        if (socket.isOwner) {
            document.getElementById('start-button').addEventListener('click', e => {
                socket.emit('start game');
            });

            Object.entries(userGamePreferences.val).forEach(([key, value]) => {
                const selectDOM = `
                        <div class="select-container">
                            <h2>${key}</h2>
                            <select name="${key}-option" id="${key}-option">
                                ${gamePreferenceOptions[key].options.map(option =>
                    `<option value="${option}">${option}</option>`
                ).join('\n')}
                            </select>
                            <label class="arrow" for="${key}-option">▼</label>
                        </div>`;
                document.getElementById('settings').appendChild(htmlToElement(selectDOM));
                document.getElementById(`${key}-option`).value = value;
                document.getElementById(`${key}-option`).addEventListener('change', e => {
                    userGamePreferences.val[key] = document.getElementById(`${key}-option`).value;
                    userGamePreferences.update();
                    socket.emit('update gamePreferences', userGamePreferences.val);
                });
            });
        } else {
            document.getElementById('start-button').style.backgroundColor = '#000000';
            document.getElementById('start-button').disabled = true;

            Object.entries(socket.roomData.gamePreferences).forEach(([key, value]) => {
                const selectDOM = `
                    <div class="select-container">
                        <h2>${key}</h2>
                        <select name="${key}-option" id="${key}-option" disabled style="padding: 0 0.75rem;">
                            <option value="${value}">${value}</option>
                        </select>
                    </div>`;
                document.getElementById('settings').appendChild(htmlToElement(selectDOM));
            });
        }
    });

    socket.on('update gamePreferences', data => {
        document.getElementById('settings').innerHTML = '';
        Object.entries(data).forEach(([key, value]) => {
            const selectDOM = `
                <div class="select-container">
                    <h2>${key}</h2>
                    <select name="${key}-option" id="${key}-option" disabled style="padding: 0 0.75rem;">
                        <option value="${value}">${value}</option>
                    </select>
                </div>`;
            document.getElementById('settings').appendChild(htmlToElement(selectDOM));
        });
    });

    socket.on('update userList', data => {
        const [userData, connecting] = data;

        if (connecting) {
            socket.roomData.users.add(userData.userId)
            socket.roomData.usersData[userData.userId] = userData;
            const playerDOM = `
                <div class="player ${userData.userId}-player-list ${socket.roomData.owner == userData.userId ? "owner" : ""}" id="${userData.userId}-player-list">
                    <img class="user-image" src="/assets/pfps/${userData.userPfp}.svg" alt="">
                    <h2>${escapeHtml(userData.userName)}</h2>
                </div>`;
            document.getElementById('players-list').appendChild(htmlToElement(playerDOM));
            const tween = gsap.from(`.${userData.userId}-player-list`, playerListAnimationObject);

        } else {
            socket.roomData.users.delete(userData.userId)
            delete socket.roomData.usersData[userData.userId];
            const childToRemove = document.getElementById(`${userData.userId}-player-list`);
            gsap.to(`.${userData.userId}-player-list`, { opacity: 0, x: -70, duration: 1 });
            setTimeout(() => {
                document.getElementById('players-list').removeChild(childToRemove)
            }, 1000);
        }
    });

    socket.on('start game', async () => {
        await loadEJS('partials/game-content', html => {
            document.getElementById('page-container').innerHTML = '';
            document.getElementById('page-container').appendChild(htmlToElement(html));

            // necessary for script to run
            const script = document.createElement('script');
            script.src = '/js/game.js';
            document.getElementById('page-container').appendChild(script);
        });
    });
})();