const urlParams = new URLSearchParams(window.location.search);

const playButton = document.getElementById('play-button');
const nicknameInput = document.getElementById('nickname-input');
const userImage = document.getElementById('user-image');
const userImageReload = document.getElementById('user-image-reload');

if (urlParams.get('r')) {
    playButton.textContent = 'Join';
}

playButton.addEventListener('click', e => {
    let nickname = nicknameInput.value
    if (nickname) {
        if (nickname != userName.val) {
            userId.val = btoa(`${nickname + Math.floor(Math.random() * 10000000)}`);
        }
        userName.val = nickname;

        if (urlParams.get('r')) {
            window.location.href = '/room/' + urlParams.get('r') + '?c=1';
        } else {
            createRoom();
        }
    } else {

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