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
const selfCards = document.getElementById('self-cards');

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
            <img src="/assets/cards/${cardName ? cardName : getRandomCard()}.svg" alt="">
        </div>
    </div>`;
    if (index >= selfCards.children.length) {
        selfCards.appendChild(htmlToElement(cardDOM));
    } else {
        selfCards.insertBefore(htmlToElement(cardDOM), selfCards.children[index]);
    }
    const cardElement = selfCards.children[index]

    cardElement.addEventListener('pointermove', e => {
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

    if (update) updateCardPositions();
}

function removeSelfCard() {
    selfCards.removeChild(selfCards.children[Math.floor(Math.random() * selfCards.children.length)]);
    updateCardPositions();
}

socket.emit('draw cards', { count: 7, tillColor: null }, (result) => {
    result.forEach(card => {
        addSelfCard(0, card, false);
    });
});

setTimeout(() => {
    updateCardPositions();
}, 100);