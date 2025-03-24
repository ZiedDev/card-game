const urlParams = new URLSearchParams(window.location.search);

const playButton = document.getElementById('play-button');
const nicknameInput = document.getElementById('nickname-input');
const userImage = document.getElementById('user-image');
const userImageReload = document.getElementById('user-image-reload');

const pfpNum = 12;

if (urlParams.get('r')) {
    playButton.textContent = 'Join';
    playButton.style.backgroundColor = 'var(--accent-green-alt)';
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
            createModal(
                "Nickname already taken in room",
                [],
                [
                    "Okay",
                    () => { }
                ]
            );
            return;
        }

        if (nickname != userName.val) {
            userId.val = encodeBase64(`${nickname + Math.floor(Math.random() * 10000000)}`);
        }
        userName.val = nickname;

        const animationEndTime = animateCurtains(true, { numberOfCurtains: 5, durationPerCurtain: 0.4, stagger: 0.07 });

        setTimeout(() => {
            if (urlParams.get('r')) {
                window.location.href = '/room/' + urlParams.get('r') + '?c=1';
            } else {
                createRoom();
            }
        }, animationEndTime);

    } else {
        createModal(
            "Nickname cant be empty",
            [],
            [
                "Okay",
                () => { }
            ]
        );
    }
})

nicknameInput.value = userName.val;
userImage.src = `/assets/pfps/${userPfp.val}.svg`;

userImageReload.addEventListener('click', e => {
    let n = Math.floor(Math.random() * pfpNum);
    while (n == userPfp.val) n = Math.floor(Math.random() * pfpNum);
    userPfp.val = n;
    userImageReload.animate(
        [{ rotate: '0deg' }, { rotate: '380deg' }],
        { duration: 500, iterations: 1, easing: 'cubic-bezier(.62,0,.7,1.51)' }
    );
    userImage.src = `/assets/pfps/${userPfp.val}.svg`;
});

const customizeButton = document.getElementById('customize-button');
const customizationMenu = document.getElementById('customization-menu');
const confirmCustomizationButton = document.getElementById('confirm-customization-button');
const cardBorderInput = document.getElementById('card-border-input');
const deckSkinsContainer = document.getElementById('deck-skins-container');
const customizeButtonIcon = document.getElementById('customize-button-icon');
const resetCustomizationButton = document.getElementById('reset-customization-button');

customizeButton.addEventListener('click', e => {
    customizationMenu.classList.add('customization-menu-open');
    customizeButton.classList.add('customize-button-open');
    customizationMenu.style = `transition: transform 350ms cubic-bezier(0.75, 0, 0.25, 1.25);`;
});

confirmCustomizationButton.addEventListener('click', e => {
    customizationMenu.classList.remove('customization-menu-open');
    customizeButton.classList.remove('customize-button-open');
    customizationMenu.style = `transition: transform 350ms cubic-bezier(0.75, 0, 0.25, 1);`;
});

cardBorderInput.addEventListener('change', e => {
    userIsCardBorder.val = cardBorderInput.checked;
});

customizeButtonIcon.src = `/assets/cards/${userDeckSkin.val}/deck_logo.svg`;
for (let i = 1; i <= Object.keys(deckSkinWildColors).length; i++) {
    const deckSkinContainerDOM = `
    <button class="deck-skin-container ${'skin_' + i == userDeckSkin.val ? 'selected' : ''}">
        <img src="/assets/cards/skin_${i}/deck_logo.svg" draggable="false">
    </button>`;
    deckSkinsContainer.appendChild(htmlToElement(deckSkinContainerDOM));
    const deckSkinContainerElement = deckSkinsContainer.children[deckSkinsContainer.children.length - 1];
    deckSkinContainerElement.addEventListener('click', e => {
        userDeckSkin.val = 'skin_' + i;
        Array.from(deckSkinsContainer.children).forEach((deckSkinContainer, index) => {
            deckSkinContainer.classList.remove('selected');
            if ('skin_' + (index + 1) == userDeckSkin.val) {
                deckSkinContainer.classList.add('selected');
            }
        });
        customizeButtonIcon.src = `/assets/cards/${userDeckSkin.val}/deck_logo.svg`;
    });
}

resetCustomizationButton.addEventListener('click', e => {
    createModal(
        "Are you sure?",
        ["This action cannot be undone"],
        [
            "Reset",
            () => {
                _resetUserStorage();
                window.location.reload();
            }
        ],
        [
            "Cancel",
            () => { }
        ]
    );
});