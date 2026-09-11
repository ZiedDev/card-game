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

const unoButton = document.getElementById('uno-button');
const skipButton = document.getElementById('skip-button');

function updateTurnIndicator(index) {
    const turnIndicator = document.getElementById('turn-indicator');
    const players = document.querySelectorAll('.player-info');
    if (!turnIndicator || index < 0 || index >= players.length) return;
    const player = players[index];
    const playerHeight = (player.getBoundingClientRect().height > 0) ? player.getBoundingClientRect().height : 76;

    gsap.to(turnIndicator, {
        y: playerHeight * index + 16 * index,
        ease: CustomEase.create("", ".75,.06,.32,1.83"),
        duration: 0.4
    });
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

function updateSkipButton() {
    if (!skipButton) return;
    const preferences = (socket && socket.roomData && socket.roomData.gamePreferences) ? socket.roomData.gamePreferences : {};
    const isManualSkipEnabled = preferences["Manual Turn Skip Button"] !== 'disable';

    if (!isManualSkipEnabled) {
        skipButton.classList.add('hide');
        skipButton.disabled = true;
        return;
    }

    skipButton.classList.remove('hide');

    if (socket && socket.isGameOver) {
        skipButton.disabled = true;
        skipButton.style.setProperty('--tip-msg', '"Game Over"');
        return;
    }

    if (socket && socket.isSelfTurn) {
        if (socket.roomData && socket.roomData.gameData && (socket.roomData.gameData.drawSum > 0 || socket.roomData.gameData.stackDraw)) {
            skipButton.disabled = true;
            skipButton.style.setProperty('--tip-msg', '"Must draw penalty cards"');
        } else {
            skipButton.disabled = false;
            skipButton.style.setProperty('--tip-msg', '"Skip your turn"');
        }
    } else {
        skipButton.disabled = true;
        skipButton.style.setProperty('--tip-msg', '"You can only skip on your turn"');
    }
}

if (skipButton) {
    skipButton.addEventListener('click', () => {
        if (skipButton.disabled || !socket.isSelfTurn || socket.isGameOver) return;
        skipButton.disabled = true;
        socket.emit('attempt skip', {
            user: socket.data.userId,
            socketId: socket.id,
            roomCode: null,
        }, (success) => {
            if (!success) {
                updateSkipButton();
            }
        });
    });
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

const discardPileAnimationQueue = new AutoQueue();
const otherPositions = document.getElementById('other-positions');
const otherPositionsContainer = document.getElementById('other-positions-container');
const shuffleDummy = document.getElementById('shuffle-dummy');
const hitmarker = document.getElementById('hitmarker');
let hitmarkerTween;

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

function throwFromOther(cardName = getRandomCard(), userIndex = 0, userCount = 1, maxPileSize = 10, resolve = () => { }) {
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
            resolve();
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

function hitmarkerAnimation(value = 0) {
    try {
        hitmarkerTween.kill();
    } catch { }

    hitmarker.innerText = escapeHtml('+' + value);

    if (value == 0) {
        hitmarker.style = '';
        return;
    }

    const randomRotation1 = gsap.utils.random(-30, 30);
    const randomRotation2 = randomRotation1 + gsap.utils.random(-10, 10);
    const randomXOffset = gsap.utils.random(-20, 20);
    const randomYOffset = gsap.utils.random(-20, 20);
    const shakeDirection = Math.random() * Math.PI;
    const time = rangeLerp(value, 0, 12, 3, 0.5, true, 1);
    const strength = rangeLerp(value, 0, 12, 0, 10, true, 0);

    gsap.fromTo(hitmarker, 0.2, {
        rotation: randomRotation1,
        opacity: 0,
        scale: 1.4,
    }, {
        x: randomXOffset,
        y: randomYOffset,
        rotation: randomRotation2,
        opacity: 1,
        scale: 1,
        ease: "power2.out",
        onComplete: () => {
            hitmarkerTween = gsap.fromTo(hitmarker, parseFloat(time), {
                x: randomXOffset - Math.cos(shakeDirection),
                y: randomYOffset - Math.sin(shakeDirection),
                rotation: randomRotation2,
            }, {
                x: randomXOffset + Math.cos(shakeDirection),
                y: randomYOffset + Math.sin(shakeDirection),
                rotation: randomRotation2,
                repeat: -1,
                ease: RoughEase.ease.config({ strength: parseInt(strength), points: 11, template: Linear.easeNone, randomize: false }),
            });
        }
    });
}

function getVisualCardName(cardName, isTopCard = false, wildColor = null) {
    if (!cardName) return cardName;
    const parts = cardName.split('_');
    if (isTopCard && parts[1] === 'wild' && wildColor) {
        const base = `${parts[0]}_wild`;
        return `${base}_${wildColor}`;
    }
    return cardName;
}

function wildColorChangeAnimation(color = 'red', resolve = () => { }) {
    const lastWildCard = discardPile.children[discardPile.children.length - 1];
    if (!lastWildCard) {
        resolve();
        return;
    }

    const baseImg = lastWildCard.querySelector('img');
    if (!baseImg) {
        resolve();
        return;
    }

    const currentSrc = baseImg.src;
    const baseCardSrc = currentSrc.replace(/_(red|blue|green|yellow)\.svg$/, '.svg');
    const newColoredSrc = baseCardSrc.replace('.svg', `_${color}.svg`);

    const topImage = document.createElement('img');
    topImage.src = newColoredSrc;
    topImage.draggable = false;
    topImage.style.position = 'absolute';
    topImage.style.top = '0';
    topImage.style.left = '0';
    topImage.style.width = '100%';
    topImage.style.height = '100%';
    topImage.style.borderRadius = 'inherit';
    topImage.style.pointerEvents = 'none';

    lastWildCard.appendChild(topImage);

    const originX = Math.random() * 100;
    const originY = Math.random() * 100;

    gsap.fromTo(topImage, {
        clipPath: `padding-box circle(0% at ${originX}% ${originY}%)`,
    }, {
        clipPath: `padding-box circle(200% at ${originX}% ${originY}%)`,
        duration: 1.5,
        ease: CustomEase.create("", ".28,.0,.28,.99"),
        onComplete: () => {
            baseImg.src = newColoredSrc;
            if (topImage.parentNode === lastWildCard) {
                lastWildCard.removeChild(topImage);
            }
            resolve();
        },
    });
}

/*----------------------------------------------*/

const wildColorSelector = document.getElementById('wild-color-selector');
const colorWheelBg = document.getElementById('color-wheel');
const wildColorBackdrop = document.getElementById('wild-color-backdrop');
const colorWheelColors = document.querySelectorAll('.color-wheel .color');
let wildColorSelectorTimeout;
let isSubmittingWildColor = false;

// wildColorSelector functionality
colorWheelColors.forEach((colorWheelColor, index) => {
    colorWheelColor.addEventListener('click', e => {
        if (!wildColorSelector.classList.contains('hide') && !isSubmittingWildColor) {
            isSubmittingWildColor = true;
            socket.emit('set wildColor', {
                selectedColor: ['green', 'yellow', 'blue', 'red'][index],
            });
            toggleWildColorSelector();
            setTimeout(() => {
                isSubmittingWildColor = false;
            }, 1000);
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
    if (socket.isGameOver) return false;
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
        discardPileAnimationQueue.push(resolve => {
            addPileCard(cardName, socket.maxPileSize);
            selfCards.removeChild(cardElement);
            socket.selfCards.splice(index, 1);
            updateCardPositions();
            resolve();
        });
        return true;
    }
    return false;
}

async function onDrawingCard(deckCardCount) {
    if (socket.isGameOver) return false;
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

    if (drawResult && Array.isArray(drawResult)) {
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

    Array.from(document.querySelectorAll('.player-info')).forEach((playerInfo, index) => {
        const playerInfoId = playerInfo.id.replace('-player-info', '');
        playerInfo.classList.remove('turn');
        if (playerInfoId == socket.roomData.gameData.currentPlayer) {
            updateTurnIndicator(index);
            playerInfo.classList.add('turn');
        }
        playerInfo.querySelector('.player-cards-count').innerText = socket.roomData.usersCardCounts[playerInfoId];
    });

    userCardsCount.innerText = socket.roomData.usersCardCounts[socket.data.userId];
    updateSkipButton();
});

socket.on('throw other', data => {
    if (socket.data.userId == data.exceptUser) return; // redundant
    discardPileAnimationQueue.push(resolve => throwFromOther(
        data.cardName,
        Array.from(socket.roomData.permaUserSet).indexOf(data.exceptUser),
        socket.roomData.permaUserSet.size,
        socket.maxPileSize,
        resolve
    ));
});

socket.on('draw other', data => {
    if (socket.data.userId == data.exceptUser) return; // redundant
    drawToOther(
        data.cardCount,
        Array.from(socket.roomData.permaUserSet).indexOf(data.exceptUser),
        socket.roomData.permaUserSet.size
    )
});

socket.on('update drawSum', data => {
    hitmarkerAnimation(data.drawSum);
    socket.roomData.gameData.drawSum = data.drawSum;
    updateSkipButton();
});

socket.on('request wildColor', data => {
    toggleWildColorSelector();
});

socket.on('update wildColor', data => {
    socket.roomData.gameData.wildColor = data.selectedColor;
    discardPileAnimationQueue.push(resolve => {
        wildColorChangeAnimation(data.selectedColor, resolve);
    });
});

socket.on('game over', data => {
    socket.isGameOver = true;
    updateSkipButton();
    const isWinner = data.winnerId === socket.data.userId;
    const title = isWinner ? "🏆 Victory!" : "Game Over";
    const message = isWinner
        ? "Congratulations! You threw your last card and won the game!"
        : `${escapeHtml(data.winnerName)} won the game!`;

    createModal(
        title,
        [message],
        [
            "Return to Home",
            () => {
                window.location.href = '/';
            }
        ]
    );
});

/*----------------------------------------------*/
// Initialization and main running

const userIcon = document.getElementById('user-icon');
const userNickname = document.getElementById('user-nickname');
const userCardsCount = document.getElementById('user-cards-count');
const turnsList = document.getElementById('turns-list');
const turnListUsers = document.getElementById('users-container');

userNickname.textContent = socket.data.userName;
userNickname.setAttribute('title', socket.data.userName);
userIcon.src = `/assets/pfps/${socket.data.userPfp}.svg`;
if (socket.roomData.usersCardCounts && socket.roomData.usersCardCounts[socket.data.userId] !== undefined) {
    userCardsCount.innerText = socket.roomData.usersCardCounts[socket.data.userId];
}

Object.values(socket.roomData.usersData).forEach(user => {
    const cardCount = (socket.roomData.usersCardCounts && socket.roomData.usersCardCounts[user.userId] !== undefined)
        ? socket.roomData.usersCardCounts[user.userId]
        : 7;
    const isAway = socket.roomData.rejoinableUsers && socket.roomData.rejoinableUsers.has(user.userId);
    const userDOM = `
        <div class="player-info ${isAway ? 'away' : ''}" id="${user.userId}-player-info">
          <img class="player-icon" src="/assets/pfps/${user.userPfp}.svg" alt=""></img>
          <h2 class="player-nickname" title="${escapeHtml(user.userName)}">${escapeHtml(user.userName)}</h2>
          <div class="player-cards-count">${cardCount}</div>
        </div>`;
    turnListUsers.appendChild(htmlToElement(userDOM))
});
socket.isSelfTurn = socket.roomData && socket.roomData.gameData && (socket.roomData.gameData.currentPlayer == socket.data.userId);
updateSkipButton();

setTimeout(() => {
    turnsList.style = `--turn-list-height: ${turnListUsers.getBoundingClientRect().height}px`;

    const nextTurnPlayerInfo = document.getElementById(`${socket.roomData.gameData.currentPlayer}-player-info`);
    Array.from(document.querySelectorAll('.player-info')).forEach((playerInfo, index) => {
        playerInfo.classList.remove('turn');
        if (playerInfo == nextTurnPlayerInfo) {
            updateTurnIndicator(index);
            nextTurnPlayerInfo.classList.add('turn');
        }
    });
}, 100);

const curtainAnimationTime = animateCurtains(false, { numberOfCurtains: 5, durationPerCurtain: 0.4, stagger: 0.07 });

updateDeckCards()

if (socket.roomData.gameData && socket.roomData.gameData.drawSum > 0) {
    hitmarkerAnimation(socket.roomData.gameData.drawSum);
}

socket.emit('fetch cards', {}, (result) => {
    if (result && Array.isArray(result)) {
        result.forEach((card, index) => {
            addSelfCard(index, card, false);
        });
        socket.selfCards = result;
    }
});
setTimeout(() => {
    updateCardPositions();
}, 100 + curtainAnimationTime);

if (socket.joinType == 'join') {
    setTimeout(() => {
        const startCard = socket.roomData.lastPileCards[0];
        const visualCard = getVisualCardName(startCard, true, socket.roomData.gameData.wildColor);
        addPileCard(visualCard, socket.maxPileSize);
        groundCardAnimation();
    }, 100 + curtainAnimationTime);
} else {
    const pileCards = socket.roomData.lastPileCards || [];
    pileCards.forEach((card, index) => {
        const isTopCard = index === pileCards.length - 1;
        const visualCard = getVisualCardName(card, isTopCard, socket.roomData.gameData.wildColor);
        addPileCard(visualCard, socket.maxPileSize);
    });
}