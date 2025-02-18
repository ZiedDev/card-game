const urlParams = new URLSearchParams(window.location.search);

const playButton = document.getElementById('play-button');
const nicknameInput = document.getElementById('nickname-input');
const userImage = document.getElementById('user-image');
const userImageReload = document.getElementById('user-image-reload');

if (urlParams.get('r')) {
    playButton.textContent = 'Join';
}

async function getUsernameValid(name, room) {
    const response = await fetch('/request-username-valid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userName: name,
            roomCode: room,
        }),
    });
    const res = await response.json();

    return JSON.parse(res);
}

playButton.addEventListener('click', async e => {
    let nickname = nicknameInput.value
    if (nickname) {
        if (urlParams.get('r') && !(await getUsernameValid(nickname, urlParams.get('r')))) {
            alert('Nickname already taken in room');
            return;
        }

        if (nickname != userName.val) {
            userId.val = encodeBase64(`${nickname + Math.floor(Math.random() * 10000000)}`);
        }
        userName.val = nickname;

        startCurtains({ numberOfCurtains: 5, durationPerCurtain: 0.5, stagger: 0.2 });
        setTimeout(() => {
            if (urlParams.get('r')) {
                window.location.href = '/room/' + urlParams.get('r') + '?c=1';
            } else {
                createRoom();
            }
        }, 1.3 * 1000);

    } else {
        alert('Nickname cant be empty');
    }
})

nicknameInput.value = userName.val;
userImage.src = `/assets/pfps/${userPfp.val}.svg`;

userImageReload.addEventListener('click', e => {
    let n = Math.floor(Math.random() * 10);
    while (n == userPfp.val) n = Math.floor(Math.random() * 10);
    userPfp.val = n;
    userImageReload.animate(
        [{ rotate: '0deg' }, { rotate: '380deg' }],
        { duration: 500, iterations: 1, easing: 'cubic-bezier(.62,0,.7,1.51)' }
    );
    userImage.src = `/assets/pfps/${userPfp.val}.svg`;
})