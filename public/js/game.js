// Scrolling thing
const cardScrollingDOM = document.getElementById('card-scrolling');
const cardScrollingWidth = cardScrollingDOM.getBoundingClientRect().width

let isDragging = false;
let startX = 0;

cardScrollingDOM.addEventListener('pointermove', e => {

});

cardScrollingDOM.addEventListener('pointerdown', e => {
    isDragging = true;
    startX = e.clientX;
});

document.addEventListener('pointermove', e => {
    if (isDragging) {
        let deltaX = e.clientX - startX;
        let lerpedVal = rangeLerp(
            inputValue = deltaX,
            inputRangeStart = -cardScrollingWidth,
            InputRangeEnd = cardScrollingWidth,
            OutputRangeStart = -100,
            OutputRangeEnd = 100,
            capInput = false,
            decimalPlaces = 1
        );

        // console.log(`deltaX: ${deltaX}, lerpedVal: ${lerpedVal}`);
    }
});

document.addEventListener('pointerup', e => {
    isDragging = false;
});

// Self Cards
const heightDistrib = {
    2: 3,
    3: 10,
    5: 20,
    10: 50,
    over: 30,
};
const spreadDistrib = {
    2: 75,
    3: 150,
    5: 200,
    10: 400,
    over: 600,
};
const spreadParams = {
    cardsNumber: 0,
    spread: 400,
    height: 50,
    yOffset: 30,
}
const zDepth = 200;
const selfCards = document.getElementById('self-cards');
const discardPile = document.getElementById('discard-pile');

function calculateCardPos({ index, extraRadius }, { cardsNumber, spread, height, yOffset }) {
    const R = (4 * height * height + spread * spread) / (8 * height);
    let theta;

    if (cardsNumber <= 1) {
        theta = (Math.PI / 2);
    } else {
        let psi = 2 * Math.asin(spread / (2 * R)) / (cardsNumber - 1);
        theta = (psi * index) + (Math.PI / 2) - Math.asin(spread / (2 * R));
    }

    const x = (R + extraRadius) * Math.cos(theta);
    const y = -1 * ((R + extraRadius) * Math.sin(theta) - Math.sqrt(R * R - spread * spread / 4) + yOffset);
    const ang = -1 * (180 / Math.PI) * (theta - (Math.PI / 2));

    return `--x:${x}px; --y:${y}px; --ang:${ang}deg`;
}

function updateCardPositions() {
    let cardContainers = document.querySelectorAll('.card-container');
    cardContainers = [...cardContainers].reverse();

    spreadParams.cardsNumber = cardContainers.length;
    spreadParams.spread = Object.entries(spreadDistrib).find(([key]) => {
        return (key == 'over' || cardContainers.length <= key)
    })[1];
    spreadParams.height = Object.entries(heightDistrib).find(([key]) => {
        return (key == 'over' || cardContainers.length <= key)
    })[1];;

    cardContainers.forEach((cardContainer, index) => {
        cardContainer.style = calculateCardPos({
            index,
            extraRadius: 0,
        }, spreadParams);
    });
}

function getRandomCard() { //temp
    const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const colors = ["blue", "green", "yellow", "red"];
    const actions1 = ["reverse", "draw", "skip"];
    const actions2 = ["wild", "draw", "draw4", "stack"];

    const type = Math.floor(Math.random() * 3); // 0, 1, or 2

    switch (type) {
        case 0: // Number card
            const number = numbers[Math.floor(Math.random() * numbers.length)];
            const color = colors[Math.floor(Math.random() * colors.length)];
            return `${number}_${color}`;
        case 1: // Action card 1
            const action1 = actions1[Math.floor(Math.random() * actions1.length)];
            const color2 = colors[Math.floor(Math.random() * colors.length)];
            return `${action1}_${color2}`;
        case 2: // Action card 2
            const action2_ = actions2[Math.floor(Math.random() * actions2.length)];
            return `${action2_}_wild`;
    }
}

function addSelfCard(index = 0, cardName = null, update = true) {
    const cardDOM = `
    <div class="card-container">
        <div class="card">
            <img src="/assets/cards/${userDeckSkin.val}/${cardName ? cardName : getRandomCard()}.svg" alt="" draggable='false'>
        </div>
    </div>`;
    if (index >= selfCards.children.length) {
        selfCards.appendChild(htmlToElement(cardDOM));
    } else {
        selfCards.insertBefore(htmlToElement(cardDOM), selfCards.children[index]);
    }
    const cardElement = selfCards.children[index];
    const innerCardElement = cardElement.children[0];

    // card position updates
    cardElement.addEventListener('pointerenter', e => {
        let cardContainers = document.querySelectorAll('.card-container');
        cardContainers = [...cardContainers].reverse();
        const index = Array.prototype.indexOf.call(cardContainers, cardElement);

        cardElement.style = calculateCardPos({
            index,
            extraRadius: 50,
        }, spreadParams);
    });

    cardElement.addEventListener('pointerleave', e => {
        updateCardPositions();
    });

    // card 3d updates
    innerCardElement.addEventListener('pointermove', e => {
        const cardRect = innerCardElement.getBoundingClientRect()
        const centerX = (cardRect.left + cardRect.right) / 2;
        const centerY = (cardRect.top + cardRect.bottom) / 2;

        const [deltaX, deltaY] = [e.clientX - centerX, e.clientY - centerY];

        const angX = -Math.sign(deltaY) * (180 / Math.PI) * angleBetVectors([0, zDepth], [deltaY, zDepth]);
        const angY = Math.sign(deltaX) * (180 / Math.PI) * angleBetVectors([0, zDepth], [deltaX, zDepth]);

        innerCardElement.style = `--rx:${angX}deg;--ry:${angY}deg;`;
    });

    innerCardElement.addEventListener('pointerleave', e => {
        innerCardElement.style = `--rx:0deg;--ry:0deg;`;
    });

    if (update) updateCardPositions();
}

function removeSelfCard(index) {
    selfCards.removeChild(selfCards.children[index]);
    updateCardPositions();
}

// Pile Cards
function addPileCard(cardName = null) {
    const cardDOM = `
    <div class="card">
        <img src="/assets/cards/${userDeckSkin.val}/${cardName ? cardName : getRandomCard()}.svg" alt="" draggable='false'>
    </div>`;
    discardPile.appendChild(htmlToElement(cardDOM));
    const cardElement = discardPile.children[discardPile.children.length - 1];
    const x = Math.random() * 10 - 5;
    const y = Math.random() * 10 - 5;
    const ang = Math.random() * 20 - 10;
    cardElement.style = `--x:${x}px; --y:${y}px; --ang:${ang}deg`;

    if (discardPile.children.length > socket.roomData.lastPileCards.length) {
        discardPile.removeChild(discardPile.children[0]);
    }
}

function updateTurnIndicator(index) {
    const turnIndicator = document.getElementById('turn-indicator');
    const player = document.querySelectorAll('.player-info')[index];

    gsap.to(turnIndicator, { y: player.getBoundingClientRect().height * index + 16 * index, ease: CustomEase.create("", ".75,.06,.32,1.83") });
    player.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'center' });
}

function isCardThrowValid(cardName) {
    const isSelfTurn = socket.roomData.gameData.currentPlayer == socket.data.userId;
    const cardParts = cardName.split('_');
    const prevGroundCard = socket.roomData.gameData.prevGroundCard;
    const groundCard = socket.roomData.gameData.groundCard;
    const drawSum = socket.roomData.gameData.drawSum;
    const wildColor = socket.roomData.gameData.wildColor;
    const preferences = socket.roomData.gamePreferences;
}

const userNickname = document.getElementById('user-nickname');
const userIcon = document.getElementById('user-icon');
const turnsList = document.getElementById('turns-list');
const turnListUsers = document.getElementById('users-container');

userNickname.textContent = socket.data.userName;
userIcon.src = `/assets/pfps/${socket.data.userPfp}.svg`;


Object.values(socket.roomData.usersData).forEach((user, index) => {
    const userDOM = `
        <div class="player-info" id="${user.userId}-player-info">
          <img class="player-icon" src="/assets/pfps/${user.userPfp}.svg" alt=""></img>
          <h2 class="player-nickname">${user.userName}</h2>
          <div class="player-cards-count">6</div>
        </div>`;

    turnListUsers.appendChild(htmlToElement(userDOM))
});
turnsList.style = `--turn-list-height: ${turnListUsers.getBoundingClientRect().height}px`;

// rest of socket stuff
socket.on('next turn', data => {
    socket.roomData = parseWithSets(data.roomData);
    addPileCard(data.card);

    const nextTurnPlayerInfo = document.getElementById(`${socket.roomData.gameData.currentPlayer}-player-info`)
    Array.from(document.querySelectorAll('.player-info')).forEach((playerInfo, index) => {
        playerInfo.classList.remove('turn');
        if (playerInfo == nextTurnPlayerInfo) {
            updateTurnIndicator(index);
            nextTurnPlayerInfo.classList.add('turn');
        }
    });
});


// initialization and main
const totaltAnimationTime = animateCurtains(false, { numberOfCurtains: 5, durationPerCurtain: 0.4, stagger: 0.07 });

socket.emit(
    (socket.joinType == 'rejoin' ? 'fetch cards' : 'draw cards'),
    (socket.joinType == 'rejoin' ? {} : {
        count: 7, tillColor: null, grantUser: socket.data.userId,
    }),
    (result) => {
        result.forEach(card => {
            addSelfCard(0, card, false);
        });
        socket.selfCards = result.reverse();
    }
);
setTimeout(() => {
    updateCardPositions();
}, 100 + totaltAnimationTime);

if (socket.joinType == 'join') {
    if (socket.roomData.gameData.currentPlayer == socket.data.userId) {
        socket.emit('draw cards', { count: 1, tillColor: null, grantUser: null, },
            (result) => {
                socket.emit('throw card', { card: result[0], remUser: null });
            }
        );
    }
} else {
    socket.roomData.lastPileCards.forEach(card => {
        addPileCard(card);
    });
    const nextTurnPlayerInfo = document.getElementById(`${socket.roomData.gameData.currentPlayer}-player-info`)
    Array.from(document.querySelectorAll('.player-info')).forEach((playerInfo, index) => {
        playerInfo.classList.remove('turn');
        if (playerInfo == nextTurnPlayerInfo) {
            updateTurnIndicator(index);
            nextTurnPlayerInfo.classList.add('turn');
        }
    });
}