/*----------------------------------------------*/
// Utility and helper functions

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

function calculateCardPos(index, { cardsNumber, spread, height, yOffset }) {
    const R = (4 * height * height + spread * spread) / (8 * height);
    let theta;

    if (cardsNumber <= 1) {
        theta = (Math.PI / 2);
    } else {
        let psi = 2 * Math.asin(spread / (2 * R)) / (cardsNumber - 1);
        theta = (psi * index) + (Math.PI / 2) - Math.asin(spread / (2 * R));
    }

    const x = R * Math.cos(theta);
    const y = -1 * (R * Math.sin(theta) - Math.sqrt(R * R - spread * spread / 4) + yOffset);
    const ang = -1 * (180 / Math.PI) * (theta - (Math.PI / 2));

    return { x: `${x}px`, y: `${y}px`, ang: `${ang}deg`, 'raw-theta': `${theta}` };
}

function calculateCardDragOffset(cardElement, pointerEvent) {
    const rect = selfCards.getBoundingClientRect();

    const [globalX, globalY] = [pointerEvent.clientX, pointerEvent.clientY];

    const [selfX, selfY] = [
        globalX - (rect.left + rect.right) / 2,
        globalY - rect.bottom,
    ];

    const [cardX, cardY] = getComputedStyle(cardElement).getPropertyValue('translate').split(' ').map(parseFloat);
    const cardAng = (Math.PI / 180) * parseFloat(cardElement.style.getPropertyValue('--ang'));

    const [localX, localY] = [selfX - cardX, cardY - selfY];

    const [rotatedX, rotatedY] = [
        Math.cos(cardAng) * localX - Math.sin(cardAng) * localY,
        Math.sin(cardAng) * localX + Math.cos(cardAng) * localY,
    ]

    const [offsetX, offsetY] = [localX - rotatedX, rotatedY - localY];

    return [`${offsetX}px`, `${offsetY}px`];
}

function getRandomCard() { // placeholder
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

/*----------------------------------------------*/
// Updating functions

function updateTurnIndicator(index) {
    const turnIndicator = document.getElementById('turn-indicator');
    const player = document.querySelectorAll('.player-info')[index];

    gsap.to(turnIndicator, { y: player.getBoundingClientRect().height * index + 16 * index, ease: CustomEase.create("", ".75,.06,.32,1.83") });
    player.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'center' });
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
        const pos = calculateCardPos(index, spreadParams);

        Object.entries(pos).forEach(([key, value]) => {
            cardContainer.style.setProperty('--' + key, value);
        });
        cardContainer.style.setProperty('z-index', 0);

        if (cardContainer.style.getPropertyValue('translate') == 'none') {
            cardContainer.style.setProperty('translate', 'var(--translate-default)');
            cardContainer.style.setProperty('transform', 'translateX(-50%) rotate(var(--ang)');
        }
    });
}

function updateDeckCards(deckCardCount = 10) {
    drawingDeck.innerHTML = '';
    const cardDOM = `
    <div class="card">
        <img src="/assets/cards/${userDeckSkin.val}/deck_backside.svg" alt="" draggable='false'>
    </div>`;
    for (let i = 0; i < deckCardCount; i++) {
        drawingDeck.appendChild(htmlToElement(cardDOM));

        if (i < deckCardCount - 1) continue;

        const cardElement = drawingDeck.children[i];

        let dragEndTween;
        Draggable.create(cardElement, {
            onDragStart: function (pointerEvent) {
                isDragging = true;
                tablePiles.style.setProperty('z-index', 10);
                try {
                    dragEndTween.kill();
                } catch { }
            },
            onDragEnd: function (pointerEvent) {
                isDragging = false;

                const hit = this.hitTest(document.getElementById('self-cards'))
                let isDrawSuccess = null;
                if (hit) isDrawSuccess = onDrawingCard(deckCardCount);
                if (hit && !isDrawSuccess) invalidAnimation();
                if (!hit || !isDrawSuccess) {
                    dragEndTween = gsap.to(this.target, {
                        x: 0,
                        y: 0,
                        duration: 0.5,
                        onComplete: () => {
                            if (!isDragging) tablePiles.style.setProperty('z-index', 0);
                        },
                    });
                }
            },
        });
    }
}

/*----------------------------------------------*/

const tablePiles = document.getElementById('table-piles');
const selfCards = document.getElementById('self-cards');
const discardPile = document.getElementById('discard-pile');
const drawingDeck = document.getElementById('drawing-deck');

let zDepth = 200;
let isDragging = false;

function addSelfCard(index = 0, cardName = getRandomCard(), update = true) {
    const cardDOM = `
    <div class="card-container">
        <div class="card">
            <img src="/assets/cards/${userDeckSkin.val}/${cardName}.svg" alt="" draggable='false'>
        </div>
    </div>`;
    if (index >= selfCards.children.length) {
        selfCards.appendChild(htmlToElement(cardDOM));
    } else {
        selfCards.insertBefore(htmlToElement(cardDOM), selfCards.children[index]);
    }
    const cardElement = selfCards.children[index];
    const innerCardElement = cardElement.children[0];

    let dragEndTween;
    Draggable.create(cardElement, {
        onPress: function (pointerEvent) {
            cardElement.style.setProperty('transform', 'translateX(-50%) rotate(var(--ang)');
        },
        onDragStart: function (pointerEvent) {
            tablePiles.style.setProperty('z-index', 0);
            isDragging = true;
            zDepth = 2000;
            try {
                dragEndTween.kill();
            } catch { }
            const offset = calculateCardDragOffset(cardElement, pointerEvent);
            cardElement.style.setProperty('--x-offset', offset[0]);
            cardElement.style.setProperty('--y-offset', offset[1]);
            gsap.to(this.target, { x: '-50%', y: 0, transform: 'rotate(0deg)', translate: 'var(--translate-default)', duration: 0 });
        },
        onDragEnd: function (pointerEvent) {
            isDragging = false;
            zDepth = 200;
            const hit = this.hitTest(document.getElementById('discard-pile'))
            let isThrowSuccess = null;
            if (hit) isThrowSuccess = onThrowingCard(cardElement);
            if (hit && !isThrowSuccess) invalidAnimation();
            if (!hit || !isThrowSuccess) {
                cardElement.style.setProperty('--x-offset', '0px');
                cardElement.style.setProperty('--y-offset', '0px');
                dragEndTween = gsap.to(this.target, {
                    x: '-50%',
                    y: 0,
                    transform: 'rotate(var(--ang))',
                    translate: 'var(--translate-default)',
                    duration: 0.5,
                    onComplete: () => {
                        cardElement.style.setProperty('transform', 'translateX(-50%) rotate(var(--ang)');
                    },
                });
            }
            updateCardPositions();
        },
    });


    // card 3d updates
    let firstMove = true;
    let hoverTween;
    innerCardElement.addEventListener('pointermove', e => {
        const cardRect = innerCardElement.getBoundingClientRect()
        const centerX = (cardRect.left + cardRect.right) / 2;
        const centerY = (cardRect.top + cardRect.bottom) / 2;

        const [deltaX, deltaY] = [e.clientX - centerX, e.clientY - centerY];

        const angX = -Math.sign(deltaY) * (180 / Math.PI) * angleBetVectors([0, zDepth], [deltaY, zDepth]);
        const angY = Math.sign(deltaX) * (180 / Math.PI) * angleBetVectors([0, zDepth], [deltaX, zDepth]);

        is3dHovering = true;

        try {
            hoverTween.kill();
        } catch { }

        if (firstMove) {
            firstMove = false;
        } else {
            let diff = Math.max(
                Math.abs(parseFloat(innerCardElement.style.getPropertyValue('--rx')) - angX),
                Math.abs(parseFloat(innerCardElement.style.getPropertyValue('--ry')) - angY)
            )

            if (diff > 1) {
                hoverTween = gsap.to(innerCardElement, { '--rx': `${angX}deg`, '--ry': `${angY}deg`, duration: 0.1 });
            } else {
                innerCardElement.style = `--rx:${angX}deg;--ry:${angY}deg;`;
            }
        }
    });

    innerCardElement.addEventListener('pointerleave', e => {
        try {
            hoverTween.kill();
        } catch { }
        innerCardElement.style = `--rx:0deg;--ry:0deg;`;
        firstMove = true;
        is3dHovering = false;
    });

    if (update) updateCardPositions();
}

function removeSelfCard(index = 0) {
    selfCards.removeChild(selfCards.children[index]);
    updateCardPositions();
}

function addPileCard(cardName = getRandomCard(), maxPileSize = 10, randomizedVariables = {
    x: Math.random() * 10 - 5,
    y: Math.random() * 10 - 5,
    ang: Math.random() * 20 - 10,
}) {
    const cardDOM = `
    <div class="card">
        <img src="/assets/cards/${userDeckSkin.val}/${cardName}.svg" alt="" draggable='false'>
    </div>`;
    discardPile.appendChild(htmlToElement(cardDOM));
    const cardElement = discardPile.children[discardPile.children.length - 1];
    cardElement.style = `--x:${randomizedVariables.x}px; --y:${randomizedVariables.y}px; --ang:${randomizedVariables.ang}deg`;

    if (discardPile.children.length > maxPileSize) {
        discardPile.removeChild(discardPile.children[0]);
    }
}

/*----------------------------------------------*/
// Pure animation functions

const otherPositions = document.getElementById('other-positions');
const otherPositionsContainer = document.getElementById('other-positions-container');
const discardDummy = document.getElementById('discard-dummy');

function drawToOther(cardCount = null, userIndex = 1, userCount = 1) {
    cardCount = cardCount ? cardCount : Math.floor(Math.random() * 4 + 1);
    userIndex = userCount == 1 ? 1.5 : userIndex;
    userCount = userCount == 1 ? 2 : userCount;

    let playerX = rangeLerp(
        userIndex,
        inputRangeStart = 1,
        InputRangeEnd = userCount,
        OutputRangeStart = otherPositions.getBoundingClientRect().left,
        OutputRangeEnd = otherPositions.getBoundingClientRect().right,
        capInput = false,
        decimalPlaces = 1);

    for (let i = 0; i < cardCount; i++) {
        const cardDOM = `
        <div class="card">
            <img src="/assets/cards/${userDeckSkin.val}/deck_backside.svg" alt="" draggable='false'>
        </div>`;

        otherPositionsContainer.appendChild(htmlToElement(cardDOM));
    }

    gsap.fromTo('.other-positions-container .card', {
        zIndex: (index, target) => 100 + cardCount - index,
        x: drawingDeck.getBoundingClientRect().left,
        y: drawingDeck.getBoundingClientRect().top,
        rotate: 0,
    }, {
        x: (index, target) => gsap.utils.random(playerX - 25, playerX + 25),
        y: (index, target) => -drawingDeck.getBoundingClientRect().height - 50,
        rotate: (index, target) => gsap.utils.random(-35, 35),
        duration: 1,
        stagger: 0.25,
        ease: CustomEase.create("", ".49,-0.03,.2,.96"),
        onComplete: () => {
            Array.from(otherPositionsContainer.querySelectorAll('.card')).forEach(cardElement => {
                otherPositionsContainer.removeChild(cardElement);
            });
        },
    });
}

function throwFromOther(cardName = getRandomCard(), userIndex = 0, userCount = 1, maxPileSize = 10) {
    userIndex = userCount == 1 ? 1.5 : userIndex;
    userCount = userCount == 1 ? 2 : userCount;

    let playerX = rangeLerp(
        userIndex,
        inputRangeStart = 1,
        InputRangeEnd = userCount,
        OutputRangeStart = otherPositions.getBoundingClientRect().left,
        OutputRangeEnd = otherPositions.getBoundingClientRect().right,
        capInput = false,
        decimalPlaces = 1);

    const cardDOM = `
        <div class="card">
            <img src="/assets/cards/${userDeckSkin.val}/${cardName}.svg" alt="" draggable='false'>
        </div>`;

    otherPositionsContainer.appendChild(htmlToElement(cardDOM));

    const cardElement = otherPositionsContainer.children[otherPositionsContainer.children.length - 1];

    const randomizedVariables = {
        x: Math.random() * 10 - 5,
        y: Math.random() * 10 - 5,
        ang: Math.random() * 20 - 10,
    }

    gsap.fromTo(cardElement, {
        x: gsap.utils.random(playerX - 25, playerX + 25),
        y: -discardPile.getBoundingClientRect().height - 50,
        rotate: gsap.utils.random(-35, 35),
    }, {
        x: discardPile.getBoundingClientRect().left + randomizedVariables.x,
        y: discardPile.getBoundingClientRect().top + randomizedVariables.y,
        rotate: randomizedVariables.ang,
        duration: 1,
        ease: CustomEase.create("", ".49,-0.03,.2,.96"),
        onComplete: () => {
            otherPositionsContainer.removeChild(cardElement);
            addPileCard(cardName, maxPileSize, randomizedVariables);
        },
    });
}

function invalidAnimation(cardElement = '.card') {
    gsap.fromTo(cardElement, 0.5, { x: -1 }, { x: 1, ease: RoughEase.ease.config({ strength: 8, points: 11, template: Linear.easeNone, randomize: false }), clearProps: "x" })
}
gsap.registerPlugin(MotionPathPlugin);
function shuffleDeckAnimation(pileSize = discardPile.children.length - 1) {
    for (let i = 0; i < pileSize; i++) {
        const cardDOM = `
        <div class="card">
            <img src="/assets/cards/${userDeckSkin.val}/deck_backside.svg" alt="" draggable='false'>
        </div>`;

        discardDummy.appendChild(htmlToElement(cardDOM));
    }

    gsap.fromTo('.discard-dummy .card', {
        zIndex: (index, target) => 100 + pileSize - index,
        x: discardPile.getBoundingClientRect().left,
        y: discardPile.getBoundingClientRect().top,
    }, {
        motionPath: {
            path: [{
                x: discardPile.getBoundingClientRect().left,
                y: discardPile.getBoundingClientRect().top,
                rotationY: 0,
            },
            {
                x: drawingDeck.getBoundingClientRect().left + (discardPile.getBoundingClientRect().left - drawingDeck.getBoundingClientRect().left) / 2,
                y: drawingDeck.getBoundingClientRect().top - 50,
                rotationY: 90,
            },
            {
                x: drawingDeck.getBoundingClientRect().left,
                y: drawingDeck.getBoundingClientRect().top,
                rotationY: 0,
            }],
        },

        duration: 1,
        stagger: 0.125,
        // ease: CustomEase.create("", ".49,-0.03,.2,.96"),
        onComplete: () => {
            Array.from(discardDummy.querySelectorAll('.card')).forEach(cardElement => {
                discardDummy.removeChild(cardElement);
            });
        },
    });
}

function groundCardAnimation() {
    const card = document.querySelector('.discard-pile .card');
    const ang = getComputedStyle(card).getPropertyValue('--ang');
    gsap.fromTo(card, {
        translateX: gsap.utils.random(-25, 100),
        translateY: gsap.utils.random(30, 100),
        rotate: gsap.utils.random(-90, 90),
    }, {
        translateX: 0,
        translateY: 0,
        rotate: ang,
        duration: 0.6,
        ease: CustomEase.create("", ".28,-0.14,.28,.99"),
        clearProps: "translateX, translateY, rotate",
    });
}


/*----------------------------------------------*/

const wildColorSelector = document.getElementById('wild-color-selector');
const colorWheelBg = document.getElementById('color-wheel');
const wildColorBackdrop = document.getElementById('wild-color-backdrop');
const colorWheelColors = document.querySelectorAll('.color-wheel .color');
let wildColorSelectorTimeout;

function toggleWildColorSelector() {
    if (wildColorSelector.classList.contains('hide')) {
        try {
            clearTimeout(wildColorSelectorTimeout);
        } catch (error) { }

        wildColorSelector.classList.remove('hide');

        gsap.from('.color', { '--scale': 0, duration: 0.5, stagger: 0.12, ease: CustomEase.create("", ".75,.06,.32,1.83") });

        gsap.from(colorWheelBg, { '--bg-scale': 0, duration: 0.35, delay: 0.5, ease: CustomEase.create("", ".75,.06,.32,1.3") });

        gsap.from(wildColorBackdrop, { opacity: 0, duration: 1 });

    } else {
        gsap.to('.color', { '--scale': 0, duration: 0.5, stagger: 0.12, ease: CustomEase.create("", ".75,.06,.32,1.5") });

        gsap.to(colorWheelBg, { '--bg-scale': 0, duration: 0.35, delay: 0.5, ease: CustomEase.create("", ".75,.06,.32,1.0") });

        gsap.to(wildColorBackdrop, { opacity: 0, duration: 1 });

        wildColorSelectorTimeout = setTimeout(() => {
            wildColorSelector.classList.add('hide');
        }, 1000);
    }
}
async function onThrowingCard(cardElement) {
    const cardContainers = document.querySelectorAll('.card-container');
    const index = Array.prototype.indexOf.call(cardContainers, cardElement);
    const cardName = socket.selfCards[index]

    const isValid = await new Promise(resolve => {
        socket.emit(
            'attempt throw',
            { card: cardName, user: socket.data.userId },
            result => {
                resolve(result);
            }
        );
    });

    if (isValid) {
        // socket.emit('throw card', { card: socket.selfCards[index], remUser: socket.data.userId }); // DONT FORGET TO REMOVE
        addPileCard(cardName);
        selfCards.removeChild(cardElement);
        socket.selfCards.splice(index, 1);
        updateCardPositions();
        return true;
    }
    return false;
}

function onDrawingCard(deckCardCount) {
    const randBool = Boolean(Math.round(Math.random()));
    if (randBool) {
        socket.emit('draw cards', { count: 1, tillColor: null, grantUser: socket.data.userId, nonWild: null },
            cards => {
                // draw animation
                addSelfCard(socket.selfCards.length, cards[0]);
                socket.selfCards.push(cards[0]);

                updateDeckCards(deckCardCount);
            }
        );
    }
    return randBool;
}

/*----------------------------------------------*/
// Additional socket functionality

socket.on('reshuffle', data => {
    shuffleDeckAnimation();
});

socket.on('update turn', data => {
    socket.roomData = parseWithSets(data.roomData);
    socket.isSelfTurn = socket.roomData.gameData.currentPlayer == socket.data.userId;

    const nextTurnPlayerInfo = document.getElementById(`${socket.roomData.gameData.currentPlayer}-player-info`)
    Array.from(document.querySelectorAll('.player-info')).forEach((playerInfo, index) => {
        playerInfo.classList.remove('turn');
        if (playerInfo == nextTurnPlayerInfo) {
            updateTurnIndicator(index);
            nextTurnPlayerInfo.classList.add('turn');
        }
    });
});

socket.on('draw deck', data => {
    // update deck count
    updateDeckCards(data.lastDeckCardCount);
    if (data.user == socket.data.userId) {
        socket.emit('draw cards', { count: data.count, tillColor: null, grantUser: socket.data.userId, },
            (result) => {
                result.forEach((card) => {
                    // draw animation
                    addSelfCard(socket.selfCards.length, card);
                    socket.selfCards.push(card);
                });
            }
        );
    } else {
        // draw other
    }
});

/*----------------------------------------------*/
// Initialization and main running

const userNickname = document.getElementById('user-nickname');
const userIcon = document.getElementById('user-icon');
const turnsList = document.getElementById('turns-list');
const turnListUsers = document.getElementById('users-container');

userNickname.textContent = socket.data.userName;
userIcon.src = `/assets/pfps/${socket.data.userPfp}.svg`;

Object.values(socket.roomData.usersData).forEach(user => {
    const userDOM = `
        <div class="player-info" id="${user.userId}-player-info">
          <img class="player-icon" src="/assets/pfps/${user.userPfp}.svg" alt=""></img>
          <h2 class="player-nickname">${user.userName}</h2>
          <div class="player-cards-count">6</div>
        </div>`;
    turnListUsers.appendChild(htmlToElement(userDOM))
});
turnsList.style = `--turn-list-height: ${turnListUsers.getBoundingClientRect().height}px`;

const nextTurnPlayerInfo = document.getElementById(`${socket.roomData.gameData.currentPlayer}-player-info`)
Array.from(document.querySelectorAll('.player-info')).forEach((playerInfo, index) => {
    playerInfo.classList.remove('turn');
    if (playerInfo == nextTurnPlayerInfo) {
        updateTurnIndicator(index);
        nextTurnPlayerInfo.classList.add('turn');
    }
});

const curtainAnimationTime = animateCurtains(false, { numberOfCurtains: 5, durationPerCurtain: 0.4, stagger: 0.07 });

updateDeckCards()

socket.emit(
    (socket.joinType == 'rejoin' ? 'fetch cards' : 'draw cards'),
    (socket.joinType == 'rejoin' ? {} : {
        count: 7, grantUser: socket.data.userId, tillColor: null, nonWild: null,
    }),
    (result) => {
        result.forEach((card, index) => {
            addSelfCard(index, card, false);
        });
        socket.selfCards = result;
    }
);
setTimeout(() => {
    updateCardPositions();
}, 100 + curtainAnimationTime);

if (socket.joinType == 'join') {
    setTimeout(() => {
        addPileCard(socket.roomData.lastPileCards[0], socket.roomData.lastPileCards.length);
        groundCardAnimation();
    }, 100 + curtainAnimationTime)
} else {
    socket.roomData.lastPileCards.forEach(card => {
        addPileCard(card, socket.roomData.lastPileCards.length);
    });
}