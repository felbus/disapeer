//'use strict';


let roomIsReady = false;
let isInitiator = false;
let createdPeerConnections = false;
let initiatorSetRemoteDescription = false;
let pc;

let sendDataChannel;
let receiveDataChannel;
let sendTextChannel;
let receiveTextChannel;
let fileReader;
let filedeets;

const startOrJoinRoom = document.querySelector('input#startOrJoinRoom');
const fileInput = document.querySelector('input#fileInput');
const sendFileButton = document.querySelector('input#sendFile');
const abortButton = document.querySelector('input#abortButton');
const hangUpButton = document.querySelector('input#hangUpButton');
const sendProgress = document.querySelector('div#sendProgress');
const receiveProgress = document.querySelector('div#receiveProgress');
const downloadAnchor = document.querySelector('a#download');
const bitrateDiv = document.querySelector('div#bitrate');
const statusMessage = document.querySelector('div#status');


let receiveBuffer = [];
let receivedSize = 0;

let bytesPrev = 0;
let timestampPrev = 0;
let timestampStart;
let statsInterval = null;
let bitrateMax = 0;

let isStable = false;

let pcConfig = {
    'iceServers': [{
        'url': 'stun:127.0.0.1:8443'
    },{
        'url': 'turn:127.0.0.1:8443?transport=udp',
        username: 'pablo',
        credential: 'theturnpass'
    }]
};


let dataChannelOptions = {
    ordered: false, //no guaranteed delivery, unreliable but faster
    maxRetransmitTime: 1000, //milliseconds
};

let room = '';
let user = '';
let socket;

startOrJoinRoom.addEventListener('click', () => onStartOrJoinRoom());

function onStartOrJoinRoom() {
    let roomName = $('#roomName').val();
    let roomKey = $('#roomKey').val();

    if (roomName !== '') {
        room = roomName;

        setUpSockeStandardCallBacks();
        setUpSocketMessageCallBack();

        socket.emit('create or join', room, roomKey);
        console.log('Attempted to create or  join room', room);

        $('#roomNameDetails').text('Room name: ' + roomName);
    } else {
        $('#roomChoiceError').text('Enter a room name to join a room.');
    }
}

function showRoomPanel() {
    $('#roomChoice').hide();
    $('#roomPanel').show();
}

function setUpSockeStandardCallBacks() {
    socket = io.connect();

    socket.on('created', function(room) {
        console.log('Created room ' + room);
        isInitiator = true;
        showRoomPanel();
    });

    socket.on('incorrect key', function(room) {
        console.log('Incorrect room key ' + room);
        $('#roomChoice').show();
        $('#roomPanel').hide();
        $('#roomChoiceError').text('The room does not exist, or incorrect room key');
    });

    socket.on('full', function(room) {
        console.log('Room ' + room + ' is full');
        $('#roomChoice').show();
        $('#roomPanel').hide();
        $('#roomChoiceError').text('Room taken, please try again');
    });

    socket.on('join', function (room) {
        console.log('Received Join Room: ' + room);
        roomIsReady = true;
        tryCreatePeerConnections();
    });

    socket.on('joined', function(room) {
        console.log('joined: ' + room);
        roomIsReady = true;
        tryCreatePeerConnections();
        showRoomPanel();
    });

    socket.on('ready', function() {
        console.log('room is ready begin webrtc protocol');

        tryCreatePeerConnections();

        if (isInitiator) {
            startCallByCreatingOffer();
        }
    });

    socket.on('log', function(array) {
        console.log.apply(console, array);
    });
}

function setUpSocketMessageCallBack() {
    socket.on('message', function(message) {
        console.log('Client received message:', message);

        if (message.type === 'candidate' && createdPeerConnections) {
            console.log('Received candidate message');
            console.log("Signaling state change: ", pc.signalingState);

            //if(pc.signalingState === 'stable') {
                let candidate = new RTCIceCandidate({sdpMLineIndex: message.label, candidate: message.candidate});
                pc.addIceCandidate(candidate);
                console.log('added ice candidate');
            //} else {
            //    console.log('ignored candidate message');
            //}
        }
        else if (message.type === 'filedeets') {
            filedeets = { filename: message.filename, filesize: message.filesize, filetype: message.filetype };
            console.log('Received file deets:', filedeets + 'isInitiator: ' + isInitiator);
        }
        else if (message.type === 'offer') {
            if(!isInitiator) {
                console.log('received offer setting remote description isInitiator: ' + isInitiator);
                pc.setRemoteDescription(new RTCSessionDescription(message));
                doAnswer();
            }
        }
        else if (message.type === 'answer' && createdPeerConnections) {
            if(isInitiator) {
                console.log('received answer setting remote description isInitiator: ' + isInitiator);
                pc.setRemoteDescription(new RTCSessionDescription(message));
                console.log('done setting remote description isInitiator: ' + isInitiator);
                initiatorSetRemoteDescription = true;
            }
        }
        else if (message === 'bye' && createdPeerConnections) {
            handleRemoteHangup();
        }
    });
}

function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', {message: message, room: room});
}

function tryCreatePeerConnections() {
    console.log('>>>>>>> checkStateOfPeerConnections() ', createdPeerConnections, roomIsReady);

    if (!createdPeerConnections && roomIsReady) {
        try {
            pc = new RTCPeerConnection(pcConfig);

            console.log('creating send text channel');

            sendTextChannel = pc.createDataChannel('sendTextChannel', dataChannelOptions);
            sendTextChannel.addEventListener('error', error => console.error('Error in sendTextChannel:', error));

            sendDataChannel = pc.createDataChannel('sendDataChannel');
            sendDataChannel.binaryType = 'arraybuffer';
            sendDataChannel.addEventListener('error', error => console.error('Error in sendDataChannel:', error));

            onDataChannelCreated(sendTextChannel);
            onDataChannelCreated(sendDataChannel);

            pc.addEventListener('datachannel', receiveChannelCallback);

            if(isInitiator) {
                $('#receiverMessage').attr('readonly','readonly');
                $('#senderMessage').val('>_ ');
            }

            if(!isInitiator) {
                console.log('set receiveChannelCallback on receiver');
                $('#senderMessage').attr('readonly','readonly');
                $('#receiverMessage').val('>_ ');
            }

            pc.onicecandidate = handleIceCandidate;

            pc.onsignalingstatechange = function () {
                console.log("Signaling state change: ", pc.signalingState);

                if (pc.signalingState === "closed") {
                    // Not sure why this does not always get called
                }
            };

            pc.oniceconnectionstatechange = function () {
                console.log("Connection state change: ", pc.iceConnectionState);
            };

            createdPeerConnections = true;
            console.log('Created RTCPeerConnnection');
            console.log('isInitiator', isInitiator);

            $('#usersInRoom').text('Room is ready');
        } catch (e) {
            console.log('Failed to create PeerConnection, exception: ' + e.message);
        }
    }
}

function handleIceCandidate(event) {
    console.log('handleIceCandidate isInitiator: ' + isInitiator);

    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('End of candidates.');
    }
}

function onDataChannelCreated(channel) {
    console.log('onDataChannelCreated:', channel);

    channel.onopen = function() {
        console.log('a data channel has been opened!');
        let maximumMessageSize = pc.sctp.maxMessageSize;
        console.log('max size for ' + channel.label + ' is ' + maximumMessageSize);
    };

    channel.onclose = function () {
        console.log(channel.label + ' has been closed!');
    }
}

function receiveChannelCallback(event) {
    if(event.channel.label === 'sendDataChannel') {
        console.log('****** function receiveChannelCallback label: ' + event.channel.label);
        receiveDataChannel = event.channel;
        receiveDataChannel.binaryType = 'arraybuffer';
        receiveDataChannel.onmessage = onReceiveDataCallback;
        receiveDataChannel.onopen = onReceiveDataChannelStateChange;
        receiveDataChannel.onclose = onReceiveDataChannelStateChange;

        receivedSize = 0;
        bitrateMax = 0;

        downloadAnchor.textContent = '';
        downloadAnchor.removeAttribute('download');

        if (downloadAnchor.href) {
            URL.revokeObjectURL(downloadAnchor.href);
            downloadAnchor.removeAttribute('href');
        }
    }

    if(event.channel.label === 'sendTextChannel') {
        console.log('****** function receiveChannelCallback label: ' + event.channel.label);
        receiveTextChannel = event.channel;
        receiveTextChannel.onmessage = onReceiveTextCallback;
        receiveTextChannel.onopen = onReceiveTextChannelStateChange;
        receiveTextChannel.onclose = onReceiveTextChannelStateChange;
    }
}

function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
}

function startCallByCreatingOffer() {
    console.log('Sending offer to peer isInitiator: ' + isInitiator);
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    //if (pc.signalingState === 'have-remote-offer') {
        console.log('create answer: isInitiator: ' + isInitiator);

        pc.createAnswer().then(
            setLocalAndSendMessage,
            onCreateSessionDescriptionError
        );
   // }
}

function setLocalAndSendMessage(sessionDescription) {
    console.log('setlocaldescrpition isInitiator: ' + isInitiator);
    pc.setLocalDescription(sessionDescription);
    sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
}

fileInput.addEventListener('change', handleFileInputChange, false);

async function handleFileInputChange() {
    let file = fileInput.files[0];
    if (!file) {
        console.log('No file chosen');
    } else {
        if(roomIsReady) {
            sendMessage({
                type: 'filedeets',
                filename: file.name,
                filesize: file.size,
                filetype: file.type
            });

            sendFileButton.disabled = false;
        }
    }
}

abortButton.addEventListener('click', () => abortCall());
function abortCall() {
    if (fileReader && fileReader.readyState === 1) {
        console.log('Abort read!');
        fileReader.abort();
    }
}

hangUpButton.addEventListener('click', () => hangUp());

function hangUp() {
    console.log('Closing sockets');
    socket.emit('disconnect');

    window.location.href = "/";
    closeChannels();
}

/*window.onbeforeunload = function() {
    sendMessage('bye');
};*/

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isInitiator = false;
}

function stop() {
    createdPeerConnections = false;
    pc.close();
    pc = null;
}

$('#senderMessage').bind('input propertychange', function() {
    sendText();
});

$('#receiverMessage').bind('input propertychange', function() {
    sendText();
});

function sendText() {
    const sendReadyState = sendTextChannel.readyState;
    console.log(`Send text channel state is: ${sendReadyState}`);

    if (sendReadyState === 'open') {
        if (isInitiator) {
            //console.log('Sending text..' + $.trim($('#senderMessage').val()));
            sendTextChannel.send($.trim($('#senderMessage').val()));
        } else {
            //console.log('Sending text..' + $.trim($('#receiverMessage').val()));
            sendTextChannel.send($.trim($('#receiverMessage').val()));
        }
    }
}

sendFileButton.addEventListener('click', () => sendData());

function sendData() {
    $("#sendProgress").css("width", "0%").attr("aria-valuenow", '0').text('');
    $("#receiveProgress").css("width", "0%").attr("aria-valuenow", '0').text('');

    const readyState = sendDataChannel.readyState;
    console.log(`Send channel state is: ${readyState}`);

    if (readyState === 'open') {

        const file = fileInput.files[0];
        console.log(`File is ${[file.name, file.size, file.type, file.lastModified].join(' ')}`);

        // Handle 0 size files.
        statusMessage.textContent = '';
        downloadAnchor.textContent = '';

        if (file.size === 0) {
            bitrateDiv.innerHTML = '';
            statusMessage.textContent = 'File is empty, please select a non-empty file';
            //closeDataChannels();
            return;
        }

        //const chunkSize = 16384;
        const chunkSize = 64000;
        fileReader = new FileReader();

        let offset = 0;

        fileReader.addEventListener('error', error => console.error('Error reading file:', error));
        fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));

        fileReader.addEventListener('load', e => {
            //console.log('FileRead.onload ', e);
            sendDataChannel.send(e.target.result);
            offset += e.target.result.byteLength;

            let currentSendProgress = 100/file.size*offset;
            $("#sendProgress").css("width", currentSendProgress.toString()+ "%").attr("aria-valuenow", currentSendProgress.toString()).text(currentSendProgress.toString() + "% Complete");

            if (offset < file.size) {
                readSlice(offset);
            }
        });

        const readSlice = o => {
            console.log('readSlice ', o);
            setTimeout(function () {
                const slice = file.slice(offset, o + chunkSize);
                fileReader.readAsArrayBuffer(slice);
            }.bind(this), 150);

        };

        readSlice(0);
    }
}

function onReceiveTextCallback(event) {
    if (!isInitiator) {
        console.log(`Received Text Message ${event.data}`);
        receiveTextChannel.value = event.data;
        $('#senderMessage').val(receiveTextChannel.value);
    } else {
        console.log(`Received Text Message ${event.data}`);
        receiveTextChannel.value = event.data;
        $('#receiverMessage').val(receiveTextChannel.value);
    }
}

function onReceiveTextChannelStateChange() {
    const readyState = receiveTextChannel.readyState;
    console.log(`Receive Text channel state is: ${readyState}`);

    if (readyState === 'open') {
        console.log('text channel state changed');
    }
}

function onReceiveDataCallback(event) {
    //console.log(`Received data Message ${event.data.byteLength}`);
    //console.log('readSlice: ', sendDataChannel.bufferedAmount);
    receiveBuffer.push(event.data);
    receivedSize += event.data.byteLength;
    //console.log(`Received Size ${receivedSize}`);
    receiveProgress.value = receivedSize;

    let currentReceiveProgress = 100 / filedeets.filesize * receivedSize;
    $("#receiveProgress").css("width", currentReceiveProgress.toString() + "%").attr("aria-valuenow", currentReceiveProgress.toString()).text(currentReceiveProgress.toString() + "% Complete");

    //console.log('File Deets are currently:', filedeets);

    if (receivedSize === filedeets.filesize) {
        console.log('Completed file transfer.');
        const received = new Blob(receiveBuffer);
        receiveBuffer = [];

        downloadAnchor.href = URL.createObjectURL(received);
        downloadAnchor.download = filedeets.filename;
        downloadAnchor.textContent = `Click to download '${filedeets.filename}' (${filedeets.filesize} bytes)`;
        downloadAnchor.style.display = 'block';

        const bitrate = Math.round(receivedSize * 8 / ((new Date()).getTime() - timestampStart));
        bitrateDiv.innerHTML = `<strong>Average Bitrate:</strong> ${bitrate} kbits/sec (max: ${bitrateMax} kbits/sec)`;

        if (statsInterval) {
            clearInterval(statsInterval);
            statsInterval = null;
        }

        fileInput.disabled = false;
        abortButton.disabled = true;
        sendFileButton.disabled = false;

        //closeDataChannels();
    }
}

async function onReceiveDataChannelStateChange() {
    const readyState = receiveDataChannel.readyState;
    console.log(`onReceiveDataChannelStateChange - Receive Data channel state is: ${readyState}`);

    if (readyState === 'open') {
        timestampStart = (new Date()).getTime();
        timestampPrev = timestampStart;
        statsInterval = setInterval(displayStats, 500);
        await displayStats();
    }
}

// display bitrate statistics.
async function displayStats() {
    if (pc && pc.iceConnectionState === 'connected') {
        const stats = await pc.getStats();
        let activeCandidatePair;

        stats.forEach(report => {
            if (report.type === 'transport') {
                activeCandidatePair = stats.get(report.selectedCandidatePairId);
            }
        });

        if (activeCandidatePair) {
            if (timestampPrev === activeCandidatePair.timestamp) {
                return;
            }

            // calculate current bitrate
            const bytesNow = activeCandidatePair.bytesReceived;
            const bitrate = Math.round((bytesNow - bytesPrev) * 8 / (activeCandidatePair.timestamp - timestampPrev));

            bitrateDiv.innerHTML = `<strong>Current Bitrate:</strong> ${bitrate} kbits/sec`;
            timestampPrev = activeCandidatePair.timestamp;
            bytesPrev = bytesNow;

            if (bitrate > bitrateMax) {
                bitrateMax = bitrate;
            }
        }
    }
}

function closeChannels() {
    console.log('Closing channels');
    sendDataChannel.close();
    sendTextChannel.close();

    if (receiveDataChannel) {
        receiveDataChannel.close();
        console.log(`Closed data channel with label: ${receiveDataChannel.label}`);
    }

    if (receiveTextChannel) {
        receiveTextChannel.close();
        console.log(`Closed data channel with label: ${receiveDataChannel.label}`);
    }

    pc.close();
    console.log('Closed peer connections');
}

