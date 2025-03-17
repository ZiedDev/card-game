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
            onDragEnd: async function (pointerEvent) {
                isDragging = false;

                const hit = this.hitTest(document.getElementById('self-cards'))
                let isDrawSuccess = null;
                if (hit) isDrawSuccess = await onDrawingCard(deckCardCount);
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
        onRelease: function (pointerEvent) {
            updateCardPositions();
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
        onDragEnd: async function (pointerEvent) {
            isDragging = false;
            zDepth = 200;
            const hit = this.hitTest(document.getElementById('discard-pile'))
            let isThrowSuccess = null;
            if (hit) isThrowSuccess = await onThrowingCard(cardElement);
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
// Animation functions

const otherPositions = document.getElementById('other-positions');
const otherPositionsContainer = document.getElementById('other-positions-container');
const shuffleDummy = document.getElementById('shuffle-dummy');

function drawToOther(cardCount = null, userIndex = 1, userCount = 1) {
    cardCount = cardCount ? cardCount : Math.floor(Math.random() * 4 + 1);
    userIndex = userCount == 1 ? 0.5 : userIndex;
    userCount = userCount == 1 ? 1 : userCount;

    let playerX = rangeLerp(
        userIndex,
        inputRangeStart = 0,
        InputRangeEnd = userCount - 1,
        OutputRangeStart = otherPositions.getBoundingClientRect().left,
        OutputRangeEnd = otherPositions.getBoundingClientRect().right,
        capInput = false,
        decimalPlaces = 1);

    const childrenToAnimate = [];

    for (let i = 0; i < cardCount; i++) {
        const cardDOM = `
        <div class="card">
            <img src="/assets/cards/${userDeckSkin.val}/deck_backside.svg" alt="" draggable='false'>
        </div>`;

        otherPositionsContainer.appendChild(htmlToElement(cardDOM));
        childrenToAnimate.push(otherPositionsContainer.children[otherPositionsContainer.children.length - 1]);
    }

    gsap.fromTo(childrenToAnimate, {
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
            childrenToAnimate.forEach(cardElement => {
                otherPositionsContainer.removeChild(cardElement);
            });
        },
    });
}

function throwFromOther(cardName = getRandomCard(), userIndex = 0, userCount = 1, maxPileSize = 10) {
    userIndex = userCount == 1 ? 0.5 : userIndex;
    userCount = userCount == 1 ? 1 : userCount;

    let playerX = rangeLerp(
        userIndex,
        inputRangeStart = 0,
        InputRangeEnd = userCount - 1,
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

function invalidAnimation(cardElement = '.self-cards .card') {
    gsap.fromTo(cardElement, 0.5, { x: -1 }, { x: 1, ease: RoughEase.ease.config({ strength: 8, points: 11, template: Linear.easeNone, randomize: false }), clearProps: "x" })
}

async function shuffleDeckAnimation(maxPileSize = 10) {
    let discardCount = discardPile.children.length - 1;
    let drawingCount = drawingDeck.children.length;
    let shuffledCount = 0;

    const [discardBox, drawingBox, dummyBox] = [
        discardPile.getBoundingClientRect(),
        drawingDeck.getBoundingClientRect(),
        shuffleDummy.getBoundingClientRect()
    ];

    const lastCard = discardPile.children[discardPile.children.length - 1];
    const restDiscardCards = Array.from(discardPile.children).slice(0, discardPile.children.length - 1);

    gsap.to(lastCard, {
        x: "150%",
        y: 0,
        rotate: 0,
        duration: 0.6,
        ease: CustomEase.create("", ".28,.0,.28,.99"),
    });

    while (discardCount + drawingCount) {
        const randBool = Boolean(Math.round(Math.random()));
        if (!drawingCount || (randBool && discardCount)) {
            discardCount--;
            const cardElement = discardPile.children[discardCount];
            gsap.set(cardElement, {
                zIndex: shuffledCount
            });
            gsap.to(cardElement, {
                x: dummyBox.left - discardBox.left,
                y: dummyBox.top - discardBox.top,
                rotate: 0,
                rotationY: 180,
                duration: 0.35,
                ease: CustomEase.create("", ".28,.0,.28,.99"),
                onUpdate: () => {
                    if (gsap.getProperty(cardElement, "rotationY") >= 90) {
                        cardElement.querySelector('img').src = `/assets/cards/${userDeckSkin.val}/deck_backside.svg`;
                        cardElement.querySelector('img').style.transform = 'scaleX(-1)';
                    }
                }
            });
        } else if (!discardCount || (!randBool && drawingCount)) {
            drawingCount--;
            const cardElement = drawingDeck.children[drawingCount];
            gsap.set(cardElement, {
                zIndex: shuffledCount
            });
            gsap.to(cardElement, {
                x: dummyBox.left - drawingBox.left,
                y: dummyBox.top - drawingBox.top,
                rotate: 0,
                duration: 0.35,
                ease: CustomEase.create("", ".28,.0,.28,.99"),
            });
        }
        shuffledCount++;
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    gsap.to(lastCard, {
        x: lastCard.style.getPropertyValue('--x'),
        y: lastCard.style.getPropertyValue('--y'),
        rotate: lastCard.style.getPropertyValue('--ang'),
        duration: 0.6,
        ease: CustomEase.create("", ".28,.0,.28,.99"),
        clearProps: 'x, y, rotate',
    });
    gsap.to(restDiscardCards, {
        x: drawingBox.left - discardBox.left,
        y: 0,
        duration: 0.6,
        ease: CustomEase.create("", ".28,.0,.28,.99"),
    });
    gsap.to(drawingDeck.children, {
        x: 0,
        y: 0,
        duration: 0.6,
        ease: CustomEase.create("", ".28,.0,.28,.99"),
    });

    setTimeout(() => {
        restDiscardCards.forEach(element => discardPile.removeChild(element));
        updateDeckCards(maxPileSize);
    }, 600);
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

function hitmarkerAnimation() {
    const hitmarker = document.getElementById('hitmarker');

    const currentX = gsap.getProperty(hitmarker, "x");
    const currentY = gsap.getProperty(hitmarker, "y");

    const randomRotation1 = gsap.utils.random(-45, 45);
    const randomRotation2 = randomRotation1 + gsap.utils.random(-10, 10);
    const randomXOffset = gsap.utils.random(-20, 20);
    const randomYOffset = gsap.utils.random(-20, 20);

    gsap.fromTo(hitmarker, {
        x: currentX + randomXOffset,
        y: currentY + randomYOffset,
        rotation: randomRotation1,
        opacity: 0,
        scale: 1.2,
    }, {
        rotation: randomRotation2,
        opacity: 1,
        scale: 1,
        duration: 0.2,
        ease: "power2.out",
        onComplete: () => {
            gsap.to(hitmarker, {
                duration: 0.5,
                rotation: randomRotation2 + 10,
                yoyo: true,
                repeat: -1,
                ease: RoughEase.ease.config({ strength: 5, points: 11, template: Linear.easeNone, randomize: false })
            });
        }
    });

    // gsap.fromTo(
    //     hitmarker, {
    //     x: currentX + randomXOffset,
    //     y: currentY + randomYOffset,
    //     rotation: randomRotation,
    //     opacity: 0,
    //     scale: 1.2,
    // }, {
    //     opacity: 1,
    //     scale: 1,
    //     duration: 0.2,
    //     ease: "power2.out",
    //     onComplete: () => {
    //         gsap.to(hitmarker, {
    //             duration: 0.5,
    //             scale: 1.1,
    //             yoyo: true, // Shake back and forth
    //             repeat: 3,
    //             ease: RoughEase.create({ template: Power0.easeNone, strength: 2, points: 20, taper: "none", randomize: true, clamp: false }),
    //             onComplete: () => {
    //                 gsap.to(hitmarker, {
    //                     opacity: 0,
    //                     duration: 0.3, // Quick fade-out
    //                     onComplete: () => {
    //                         gsap.set(hitmarker, {
    //                             x: currentX,
    //                             y: currentY,
    //                             rotation: 0,
    //                         });
    //                     },
    //                 });
    //             }
    //         });
    //     },
    // });
}

/*----------------------------------------------*/

const wildColorSelector = document.getElementById('wild-color-selector');
const colorWheelBg = document.getElementById('color-wheel');
const wildColorBackdrop = document.getElementById('wild-color-backdrop');
const colorWheelColors = document.querySelectorAll('.color-wheel .color');
let wildColorSelectorTimeout;

// wildColorSelector functionality
colorWheelColors.forEach((colorWheelColor, index) => {
    colorWheelColor.addEventListener('click', e => {
        if (!wildColorSelector.classList.contains('hide')) {
            socket.emit('set wildColor', {
                selectedColor: ['green', 'yellow', 'blue', 'red'][index],
            });
            toggleWildColorSelector()
        }
    });
});

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
            {
                user: socket.data.userId,
                socketId: socket.id,
                roomCode: null,
                cardName: cardName,
            },
            result => {
                resolve(result);
            }
        );
    });

    if (isValid) {
        // socket.emit('throw card', { card: socket.selfCards[index], remUser: socket.data.userId }); // DONT FORGET TO REMOVE
        addPileCard(cardName, socket.maxPileSize);
        selfCards.removeChild(cardElement);
        socket.selfCards.splice(index, 1);
        updateCardPositions();
        return true;
    }
    return false;
}

async function onDrawingCard(deckCardCount) {
    const drawResult = await new Promise(resolve => {
        socket.emit(
            'attempt draw',
            {
                user: socket.data.userId,
                socketId: socket.id,
                roomCode: null,
            },
            result => {
                resolve(result);
            }
        );
    });

    if (drawResult) {
        drawResult.forEach(card => {
            addSelfCard(socket.selfCards.length, card);
            socket.selfCards.push(card);
        });
        updateDeckCards(deckCardCount);
        return true;
    }

    return false;
}

/*----------------------------------------------*/
// Additional socket functionality

socket.on('reshuffle', data => {
    shuffleDeckAnimation(socket.maxPileSize);
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

socket.on('throw other', data => {
    if (socket.data.userId == data.exceptUser) return; // redundant
    throwFromOther(
        data.cardName,
        Array.from(socket.roomData.permaUserSet).indexOf(data.exceptUser),
        socket.roomData.permaUserSet.size,
        socket.maxPileSize
    )
});

socket.on('draw other', data => {
    if (socket.data.userId == data.exceptUser) return; // redundant
    drawToOther(
        data.cardCount,
        Array.from(socket.roomData.permaUserSet).indexOf(data.exceptUser),
        socket.roomData.permaUserSet.size
    )
});

socket.on('request wildColor', data => {
    toggleWildColorSelector();
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
        count: 7, grantUser: socket.data.userId, tillColor: null, nonAction: null,
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
        addPileCard(socket.roomData.lastPileCards[0], socket.maxPileSize);
        groundCardAnimation();
    }, 100 + curtainAnimationTime)
} else {
    socket.roomData.lastPileCards.forEach(card => {
        addPileCard(card, socket.maxPileSize);
    });
}