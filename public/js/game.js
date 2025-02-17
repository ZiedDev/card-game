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

        console.log(`deltaX: ${deltaX}, lerpedVal: ${lerpedVal}`);
    }
});

document.addEventListener('pointerup', e => {
    isDragging = false;
});

let cardContainers = document.querySelectorAll('.card-container');
cardContainers = [...cardContainers].reverse();

function calculateCardPos(index, { spread, height, extraRadius, cardsNumber }) {
    const R = (4 * height * height + spread * spread) / (8 * height);

    const psi = 2 * Math.asin(spread / (2 * R)) / (cardsNumber - 1);
    const theta = (psi * index) + (Math.PI / 2) - Math.asin(spread / (2 * R));

    const x = (R + extraRadius) * Math.cos(theta);
    const y = -1 * ((R + extraRadius) * Math.sin(theta) - Math.sqrt(R * R - spread * spread / 4));
    const ang = -1 * (180 / Math.PI) * (theta - (Math.PI / 2));

    return `--x:${x}px; --y:${y}px; --ang:${ang}deg`;
}

function cardsSpread({ spread, height, extraRadius }) {
    cardContainers.forEach((cardContainer, index) => {
        cardContainer.style = calculateCardPos(index, {
            spread,
            height,
            extraRadius,
            cardsNumber: cardContainers.length
        });
    });
}

cardContainers.forEach((card, index) => {
    card.addEventListener('pointerover', e => {

    });
});

cardsSpread({ spread: 400, height: 50, extraRadius: 0 });