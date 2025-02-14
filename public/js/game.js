const cardScrollingDOM = document.getElementById('card-scrolling');
const cardScrollingWidth = cardScrollingDOM.getBoundingClientRect().width

let isDragging = false;
let startX = 0;

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
            decimalPlaces = 1);

        console.log(`deltaX: ${deltaX}, lerpedVal: ${lerpedVal}`);
    }
});

document.addEventListener('pointerup', e => {
    isDragging = false;
});

console.log('script working');
