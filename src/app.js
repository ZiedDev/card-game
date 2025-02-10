// environment variables
require('dotenv').config();
const hostname = process.env.HOSTNAME = process.env.HOSTNAME || 'localhost';
const port = process.env.PORT = process.env.PORT || 8080;
const nodeEnv = process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// library imports
const express = require('express');


// route imports

const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// live reload
if (nodeEnv == 'development') {
    const livereload = require('livereload');
    const connectLiveReload = require('connect-livereload');
    const liveReloadServer = livereload.createServer();
    liveReloadServer.server.once('connection', () => {
        setTimeout(() => {
            liveReloadServer.refresh('/');
        }, 100);
    });
    app.use(connectLiveReload());
}
// live reload //


// main middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.set('view engine', 'ejs');
app.use(express.static('public'));


app.get('/', (req, res) => {
    res.render('index');
});

io.on('connection', (socket) => {
    console.log(`user [${socket.id}] connected`);
    socket.on('disconnect', () => {
        console.log(`user [${socket.id}] disconnected`);
    });
});

server.listen(port, hostname, () => {
    console.log(`Server running on ${nodeEnv} environment at http://${hostname}:${port}/`);
});