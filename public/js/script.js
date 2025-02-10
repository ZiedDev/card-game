let socket = io({
    'reconnection': true,
    'reconnectionDelay': 1000,
    'reconnectionDelayMax': 5000,
    'reconnectionAttempts': 50
});

async function createRoom() {
    const response = await fetch(`${window.location.href}createRoom`, { method: 'POST', redirect: 'follow' }).then(response => {
        if (response.redirected) {
            window.location.href = response.url;
        }
    }).catch(err => {
        console.info(err + " url: " + url);
    });

    console.log(response);
}