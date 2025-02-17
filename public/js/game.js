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
const spreadParams = {
    cardsNumber: 0,
    spread: 400,
    height: 50,
    yOffset: 30,
}
const selfCards = document.getElementById('self-cards');

function calculateCardPos({ index, extraRadius }, { cardsNumber, spread, height, yOffset }) {
    const R = (4 * height * height + spread * spread) / (8 * height);

    const psi = 2 * Math.asin(spread / (2 * R)) / (cardsNumber - 1);
    const theta = (psi * index) + (Math.PI / 2) - Math.asin(spread / (2 * R));

    const x = (R + extraRadius) * Math.cos(theta);
    const y = -1 * ((R + extraRadius) * Math.sin(theta) - Math.sqrt(R * R - spread * spread / 4) + yOffset);
    const ang = -1 * (180 / Math.PI) * (theta - (Math.PI / 2));

    return `--x:${x}px; --y:${y}px; --ang:${ang}deg`;
}

function updateCardPositions() {
    let cardContainers = document.querySelectorAll('.card-container');
    cardContainers = [...cardContainers].reverse();

    spreadParams.cardsNumber = cardContainers.length;
    spreadParams.spread = cardContainers.length >= 10 ? 600 : 400;
    spreadParams.height = cardContainers.length >= 10 ? 20 : 50;

    cardContainers.forEach((cardContainer, index) => {
        cardContainer.style = calculateCardPos({
            index,
            extraRadius: 0,
        }, spreadParams);
    });
}

function addSelfCard(update = true) {
    const cardDOM = `
    <div class="card-container">
        <div class="card"></div>
    </div>`;
    selfCards.appendChild(htmlToElement(cardDOM));
    const cardElement = selfCards.children[selfCards.children.length - 1]

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

for (let i = 0; i < 7; i++) {
    addSelfCard(false);
}

setTimeout(() => {
    updateCardPositions();
}, 100);