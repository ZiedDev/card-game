roomCode.val = window.location.pathname.split('/')[window.location.pathname.split('/').length - 1];
const urlParams = new URLSearchParams(window.location.search);

if (userId.val == '' || userName.val == '') {
    window.location.href = '/?r=' + roomCode.val;
}

async function getRoomResponse() {
    const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: userId.val,
            confName: urlParams.get('c'),
        }),
    });
    const res = await response.json();

    // watch, duplicate -> false
    // conf_join -> forward to /?r=roomCode.val
    // join, rejoin -> true
    console.log('res-type', res);

    return res;
}

let socket;
const playerListAnimationObject = { opacity: 0, x: -70, duration: 1, stagger: 0.25 };

(async () => {
    const roomResponse = await getRoomResponse();

    // handle join and load DOM Content
    if (roomResponse == 'conf_join') {
        window.location.href = '/?r=' + roomCode.val;
        return;
    } else if (roomResponse == 'watch' || roomResponse == 'duplicate') {
        await loadEJS('error', html => {
            document.open();
            document.write(html);
            document.close();
        }, {
            errorCode: 403,
            errorMessage: 'Forbidden, ' + (roomResponse == 'watch' ? 'game already started' : 'already in room')
        });
        return;
    } else if (roomResponse == 'join') {
        await loadEJS('partials/room-content', html => {
            document.getElementById('page-container').innerHTML = ''
            document.getElementById('page-container').appendChild(htmlToElement(html))
        });
        animateCurtains(false, { numberOfCurtains: 5, durationPerCurtain: 0.4, stagger: 0.07 });
    } else if (roomResponse == 'rejoin') {
        // await the backend start game response
    }

    window.history.replaceState({}, document.title, window.location.pathname);

    socket = io({
        'reconnection': true,
        'reconnectionDelay': 1000,
        'reconnectionDelayMax': 5000,
        'reconnectionAttempts': 50
    });

    socket.data = {
        userId: userId.val,
        userName: userName.val,
        userPfp: userPfp.val,
        roomCode: roomCode.val,
        userGamePreferences: userGamePreferences.val,
    }
    socket.emit('join room', socket.data);

    socket.joinType = roomResponse;
    socket.selfCards = []


    socket.on('init roomData', data => {
        socket.roomData = parseWithSets(data);
        socket.isOwner = socket.roomData.owner == userId.val;
        socket.maxPileSize = socket.roomData.maxPileSize;

        if (socket.joinType == 'rejoin') return;

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
        });
        gsap.from(`.player`, playerListAnimationObject);

        const inviteButton = document.getElementById('invite-button');
        let inviteButtonIconTimeout = 0;
        inviteButton.addEventListener('click', e => {
            let text = window.location.href;
            const copyContent = navigator.clipboard.writeText(text);
            inviteButton.classList.add('invite-button-copy');
            clearTimeout(inviteButtonIconTimeout);
            inviteButtonIconTimeout = setTimeout(() => {
                inviteButton.classList.remove('invite-button-copy');
            }, 5 * 1000);
        });

        if (socket.isOwner) {
            document.getElementById('start-button').disabled = false;
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
        socket.roomData.gamePreferences = data;
        if (socket.joinType == 'rejoin') return;
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
        const [userData, connecting, rejoin] = data;

        if (connecting && !rejoin) {
            socket.roomData.users.add(userData.userId)
            socket.roomData.usersData[userData.userId] = userData;
            const playerDOM = `
                <div class="player ${userData.userId}-player-list ${socket.roomData.owner == userData.userId ? "owner" : ""}" id="${userData.userId}-player-list">
                    <img class="user-image" src="/assets/pfps/${userData.userPfp}.svg" alt="">
                    <h2>${escapeHtml(userData.userName)}</h2>
                </div>`;
            document.getElementById('players-list').appendChild(htmlToElement(playerDOM));
            const tween = gsap.from(`.${userData.userId}-player-list`, playerListAnimationObject);
        } else if (!connecting && !rejoin) {
            socket.roomData.users.delete(userData.userId)
            delete socket.roomData.usersData[userData.userId];
            const childToRemove = document.getElementById(`${userData.userId}-player-list`);
            gsap.to(`.${userData.userId}-player-list`, { opacity: 0, x: -70, duration: 1 });
            Array.from(document.getElementById('players-list').children).splice(1 + Array.prototype.indexOf.call(document.getElementById('players-list').children, childToRemove)).forEach(child => {
                // animate children of the players-list when a player leaves the room
            });
            setTimeout(() => {
                document.getElementById('players-list').removeChild(childToRemove)
            }, 1000);
        } else if (connecting && rejoin) {
            socket.roomData.rejoinableUsers.delete(userData.userId);
            socket.roomData.users.add(userData.userId);
            // remove from random ai mode
            document.getElementById(`${userData.userId}-player-info`).classList.remove('away');
        } else if (!connecting && rejoin) {
            socket.roomData.rejoinableUsers.add(userData.userId);
            socket.roomData.users.delete(userData.userId);
            // put on random ai mode
            document.getElementById(`${userData.userId}-player-info`).classList.add('away');
        }
    });

    socket.on('start game', async () => {
        let totaltAnimationTime = 0;
        if (socket.joinType == 'join') {
            totaltAnimationTime = animateCurtains(true, { numberOfCurtains: 5, durationPerCurtain: 0.4, stagger: 0.07 });
        }
        setTimeout(async () => {
            await loadEJS('partials/game-content', html => {
                document.getElementById('page-container').innerHTML = '';
                document.getElementById('page-container').appendChild(htmlToElement(html));

                // necessary for script to run
                const script = document.createElement('script');
                script.src = '/js/game.js';
                document.getElementById('page-container').appendChild(script);
            });
        }, totaltAnimationTime);
    });
})();