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

function ligma(s, h) {
    const S = s;
    const H = h;

    const R = (4 * H * H + S * S) / (8 * H);
    const N = cardContainers.length;

    const psi = 2 * Math.asin(S / (2 * R)) / (N - 1);

    cardContainers.forEach((cardContainer, index) => {
        const theta = (psi * index) + (Math.PI / 2) - Math.asin(S / (2 * R));

        const x = R * Math.cos(theta);
        const y = -1 * (R * Math.sin(theta) - Math.sqrt(R * R - S * S / 4));
        const ang = -1 * (180 / Math.PI) * (theta - (Math.PI / 2));

        cardContainer.style = `--x:${x}px; --y:${y}px; --ang:${ang}deg`;
    });
}

ligma(
    cardScrollingDOM.getBoundingClientRect().width - 200,
    cardScrollingDOM.getBoundingClientRect().height
)