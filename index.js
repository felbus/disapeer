'use strict';

let os = require('os');
let nodeStatic = require('node-static');
let http = require('http');
let socketIO = require('socket.io');
let shell = require('shelljs');
let fileServer = new(nodeStatic.Server)();

let app = http.createServer(function(req, res) {
  fileServer.serve(req, res);
}).listen(9123);

let io = socketIO.listen(app);

io.sockets.on('connection', function(socket) {
  function log() {
    let array = ['LOG:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);

    let child = shell.exec("service coturn status", function() {
        child.stderr.on('data', function(data) {
            log('** error getting turn server status ** ');
            log(data);
        });

        child.stdout.on('data', function(data) {log(data);});
    });
  }

  function getNumberOfClientsInRoom(room) {
    let clientsInRoom = io.sockets.adapter.rooms[room];
    let numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    log('Room ' + room + ' has ' + numClients + ' client(s)');
    return numClients;
  }

  function createRoom(room) {
    socket.join(room);
    log('Client ID ' + socket.id + ' created room ' + room);
    socket.emit('created', room, socket.id);
    log('** starting turn server ** ');
    let child = shell.exec("service coturn start", function() {
        child.stderr.on('data', function(data) {
            log('** error starting turn server ** ');
            log(data);
        });
        child.stdout.on('data', function(data) {log(data);});
    });
  }

  function joinRoom(room) {
    log('Client ID ' + socket.id + ' joined room ' + room);
    io.sockets.in(room).emit('join', room);
    socket.join(room);
  }

  function joinedAndReadyRoom(room) {
    socket.emit('joined', room, socket.id);
    io.sockets.in(room).emit('ready');
  }

  socket.on('message', function(message) {
    //log('Server Message: ', socket.id + ' : ' + message);
    socket.to(message.room).emit('message', message.message);
    //socket.emit('message', message);
  });

  socket.on('create or join', function(room, roomKey) {
    log('Received request to create or join room ' + room);
    let numClients = getNumberOfClientsInRoom(room);

    if (numClients === 0) {
      if(roomKey !== 'SpecialKey1') {
          socket.emit('incorrect key', room);
      } else {
          createRoom(room, roomKey);
      }
    } else if (numClients === 1) {
      joinRoom(room);
      joinedAndReadyRoom(room);
    } else {
      socket.emit('full', room);
    }
  });

  socket.on('ipaddr', function() {
    let ifaces = os.networkInterfaces();

    for (let dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

  socket.on('disconnect', function() {
      log('** disconnect bye - stopping turn server ** ');
      let child = shell.exec("service coturn stop", function() {
          child.stderr.on('data', function(data) {
            log('** error stopping turn server ** ');
            log(data);
          });

          child.stdout.on('data', function(data) {log(data);});
      });
  });

  socket.on('bye', function(){
    log('** received bye - stopping turn server ** ');
    let child = shell.exec("service coturn stop", function() {
        child.stderr.on('data', function(data) {
            log('** error stopping turn server ** ');
            log(data);
        });

        child.stdout.on('data', function(data) {log(data);});
    });
  });
});
