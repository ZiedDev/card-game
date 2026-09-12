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
    const emitJoin = () => {
        socket.emit('join room', socket.data);
    };
    if (socket.connected) {
        emitJoin();
    }
    socket.on('connect', emitJoin);

    socket.joinType = roomResponse;
    socket.selfCards = []


    let inviteButtonIconTimeout = 0;

    socket.on('init roomData', data => {
        socket.roomData = parseWithSets(data);
        socket.isOwner = socket.roomData.owner == userId.val;
        socket.maxPileSize = socket.roomData.maxPileSize;

        if (socket.joinType == 'rejoin') return;

        const ownerName = (socket.roomData.usersData[socket.roomData.owner] && socket.roomData.usersData[socket.roomData.owner].userName) || 'Room';
        const roomTitleEl = document.getElementById('room-title');
        if (roomTitleEl) {
            roomTitleEl.textContent = `${ownerName}'s Room`;
            roomTitleEl.setAttribute('title', `${ownerName}'s Room`);
        }

        if (typeof gsap !== 'undefined') {
            gsap.killTweensOf('#players-list .player');
        }
        const playersListEl = document.getElementById('players-list');
        const settingsEl = document.getElementById('settings');
        if (playersListEl) playersListEl.innerHTML = '';
        if (settingsEl) settingsEl.innerHTML = '';

        if (playersListEl && socket.roomData.usersData) {
            Object.values(socket.roomData.usersData).forEach(userData => {
                const playerDOM = `
                <div class="player ${userData.userId}-player-list ${socket.roomData.owner == userData.userId ? "owner" : ""} ${socket.data.userId == userData.userId ? "self" : ""}" id="${userData.userId}-player-list">
                    <img class="user-image" src="/assets/pfps/${userData.userPfp}.svg" alt="">
                    <h2 title="${escapeHtml(userData.userName)}">${escapeHtml(userData.userName)}</h2>
                </div>`;

                playersListEl.appendChild(htmlToElement(playerDOM));
            });
            if (typeof gsap !== 'undefined') {
                gsap.from('#players-list .player', playerListAnimationObject);
            }
        }

        const inviteButton = document.getElementById('invite-button');
        if (inviteButton) {
            inviteButton.onclick = e => {
                let text = window.location.href;
                navigator.clipboard.writeText(text);
                inviteButton.classList.add('invite-button-copy');
                clearTimeout(inviteButtonIconTimeout);
                inviteButtonIconTimeout = setTimeout(() => {
                    inviteButton.classList.remove('invite-button-copy');
                }, 5 * 1000);
            };
        }

        const startButton = document.getElementById('start-button');
        const currentPrefs = socket.roomData.gamePreferences || userGamePreferences.val || {};

        if (socket.isOwner) {
            if (startButton) {
                startButton.disabled = false;
                startButton.onclick = e => {
                    socket.emit('start game');
                };
            }

            if (settingsEl) {
                Object.keys(gamePreferenceOptions).forEach(key => {
                    const val = (userGamePreferences.val && userGamePreferences.val[key]) || currentPrefs[key] || gamePreferenceOptions[key].default;
                    const selectDOM = `
                            <div class="select-container">
                                <h2>${escapeHtml(key)}</h2>
                                <select name="${escapeHtml(key)}-option" id="${escapeHtml(key)}-option">
                                    ${gamePreferenceOptions[key].options.map(option =>
                        `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`
                    ).join('\n')}
                                </select>
                                <label class="arrow" for="${escapeHtml(key)}-option">▼</label>
                            </div>`;
                    settingsEl.appendChild(htmlToElement(selectDOM));
                    const selectEl = document.getElementById(`${key}-option`);
                    if (selectEl) {
                        selectEl.value = val;
                        selectEl.addEventListener('change', e => {
                            userGamePreferences.val[key] = selectEl.value;
                            userGamePreferences.update();
                            socket.emit('update gamePreferences', userGamePreferences.val);
                        });
                    }
                });
            }
        } else {
            if (startButton) {
                startButton.disabled = true;
                startButton.onclick = null;
            }

            if (settingsEl) {
                Object.keys(gamePreferenceOptions).forEach(key => {
                    const val = currentPrefs[key] || gamePreferenceOptions[key].default;
                    const selectDOM = `
                        <div class="select-container">
                            <h2>${escapeHtml(key)}</h2>
                            <select name="${escapeHtml(key)}-option" id="${escapeHtml(key)}-option" disabled style="padding: 0 0.75rem;">
                                <option value="${escapeHtml(val)}">${escapeHtml(val)}</option>
                            </select>
                        </div>`;
                    settingsEl.appendChild(htmlToElement(selectDOM));
                });
            }
        }
    });

    socket.on('update gamePreferences', data => {
        socket.roomData.gamePreferences = data || {};
        if (socket.joinType == 'rejoin') return;
        const settingsEl = document.getElementById('settings');
        if (!settingsEl || socket.isOwner) return;
        settingsEl.innerHTML = '';
        Object.keys(gamePreferenceOptions).forEach(key => {
            const val = socket.roomData.gamePreferences[key] || gamePreferenceOptions[key].default;
            const selectDOM = `
                <div class="select-container">
                    <h2>${escapeHtml(key)}</h2>
                    <select name="${escapeHtml(key)}-option" id="${escapeHtml(key)}-option" disabled style="padding: 0 0.75rem;">
                        <option value="${escapeHtml(val)}">${escapeHtml(val)}</option>
                    </select>
                </div>`;
            settingsEl.appendChild(htmlToElement(selectDOM));
        });
    });

    socket.on('update userList', data => {
        const [userData, connecting, rejoin] = data;
        if (!userData || !userData.userId) return;

        if (connecting && !rejoin) {
            if (socket.roomData && socket.roomData.users) socket.roomData.users.add(userData.userId);
            if (socket.roomData && socket.roomData.usersData) socket.roomData.usersData[userData.userId] = userData;

            const existingPlayer = document.getElementById(`${userData.userId}-player-list`);
            if (existingPlayer) {
                const img = existingPlayer.querySelector('.user-image');
                if (img) img.src = `/assets/pfps/${userData.userPfp}.svg`;
                const name = existingPlayer.querySelector('h2');
                if (name) {
                    name.textContent = userData.userName;
                    name.setAttribute('title', userData.userName);
                }
                existingPlayer.classList.toggle('owner', socket.roomData.owner == userData.userId);
                return;
            }

            const playersListEl = document.getElementById('players-list');
            if (playersListEl) {
                const playerDOM = `
                    <div class="player ${userData.userId}-player-list ${socket.roomData && socket.roomData.owner == userData.userId ? "owner" : ""}" id="${userData.userId}-player-list">
                        <img class="user-image" src="/assets/pfps/${userData.userPfp}.svg" alt="">
                        <h2 title="${escapeHtml(userData.userName)}">${escapeHtml(userData.userName)}</h2>
                    </div>`;
                const frag = htmlToElement(playerDOM);
                const playerElem = frag.firstElementChild;
                playersListEl.appendChild(frag);
                if (playerElem && typeof gsap !== 'undefined') {
                    gsap.from(playerElem, { opacity: 0, x: -70, duration: 1 });
                }
            }
        } else if (!connecting && !rejoin) {
            if (socket.roomData && socket.roomData.users) socket.roomData.users.delete(userData.userId);
            if (socket.roomData && socket.roomData.usersData) delete socket.roomData.usersData[userData.userId];
            const childToRemove = document.getElementById(`${userData.userId}-player-list`);
            if (childToRemove) {
                if (typeof gsap !== 'undefined') {
                    gsap.to(childToRemove, {
                        opacity: 0,
                        x: -70,
                        duration: 1,
                        onComplete: () => {
                            if (childToRemove.parentNode) {
                                childToRemove.parentNode.removeChild(childToRemove);
                            }
                        }
                    });
                } else if (childToRemove.parentNode) {
                    childToRemove.parentNode.removeChild(childToRemove);
                }
            }
        } else if (connecting && rejoin) {
            if (socket.roomData && socket.roomData.rejoinableUsers) socket.roomData.rejoinableUsers.delete(userData.userId);
            if (socket.roomData && socket.roomData.users) socket.roomData.users.add(userData.userId);
            if (socket.roomData && socket.roomData.usersData) socket.roomData.usersData[userData.userId] = userData;
            // remove from away mode
            const playerInfo = document.getElementById(`${userData.userId}-player-info`);
            if (playerInfo) {
                playerInfo.classList.remove('away');
                if (socket.roomData.gameData && socket.roomData.gameData.currentPlayer == userData.userId) {
                    playerInfo.classList.add('turn');
                }
            }
        } else if (!connecting && rejoin) {
            if (socket.roomData && socket.roomData.rejoinableUsers) socket.roomData.rejoinableUsers.add(userData.userId);
            if (socket.roomData && socket.roomData.users) socket.roomData.users.delete(userData.userId);
            // put on away mode
            const playerInfo = document.getElementById(`${userData.userId}-player-info`);
            if (playerInfo) {
                playerInfo.classList.add('away');
            }
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