My Flow

bob onStartOrJoinRoom

create socket object in default namespace

socket: 'create or join'

clients are 0, create room

socket: 'created'

bob isInitiator = true;

waiting ...

rob onStartOrJoinRoom

socket: 'create or join'

clients are 1, join room

socket: 'join' (for initiator)

roomIsReady = true;
tryCreatePeerConnections();

socket: 'joined' (non initiator)

roomIsReady = true;
tryCreatePeerConnections();

socket: 'ready' 

if initiator, send offer

socket: 'offer' 

receiver sets remote description

receiver now create answer 

receiver set localdescription

socket: 'answer' 

initiator set remotedescription














//pc.addEventListener('datachannel', receiveChannelCallback);
$('#receiverMessage').attr('readonly','readonly');
$('#senderMessage').val('>_ ');

$('#senderMessage').attr('readonly','readonly');
$('#receiverMessage').val('>_ ');