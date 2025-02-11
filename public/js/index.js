const urlParams = new URLSearchParams(window.location.search);

const playButton = document.getElementById('play-button')
const nicknameInput = document.getElementById('nickname-input')

if (urlParams.get('r')) {
    playButton.textContent = 'Join'
}

playButton.addEventListener('click', e => {
    let nickname = nicknameInput.value
    if (nickname) {
        if (nickname != userName.val) {
            userId.val = btoa(`${nickname + Math.floor(Math.random() * 10000000)}`)
        }
        userName.val = nickname

        if (urlParams.get('r')) {
            window.location.href = '/room/' + urlParams.get('r') + '?c=1'
        } else {
            createRoom()
        }
    } else {

    }
})