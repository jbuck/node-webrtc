(function() {

var bridge = window.location.toString().split('?')[1] || 'localhost:9001';

var webrtcSupported = true;

var RTCPeerConnection;
if(window.mozRTCPeerConnection)
  RTCPeerConnection = window.mozRTCPeerConnection;
else if(window.webkitRTCPeerConnection)
  RTCPeerConnection = window.webkitRTCPeerConnection;
else if(window.RTCPeerConnection)
  RTCPeerConnection = window.RTCPeerConnection
else
  webrtcSupported = false;

var RTCSessionDescription;
if(window.mozRTCSessionDescription)
  RTCSessionDescription = window.mozRTCSessionDescription;
else if(window.webkitRTCSessionDescription)
  RTCSessionDescription = window.webkitRTCSessionDescription;
else if(window.RTCSessionDescription)
  RTCSessionDescription = window.RTCSessionDescription
else
  webrtcSupported = false;

var RTCIceCandidate;
if(window.mozRTCIceCandidate)
  RTCIceCandidate = window.mozRTCIceCandidate;
else if(window.webkitRTCIceCandidate)
  RTCIceCandidate = window.webkitRTCIceCandidate;
else if(window.RTCIceCandidate)
  RTCIceCandidate = window.RTCIceCandidate;
else
  webrtcSupported = false;

var dataChannelSettings = {
  'reliable': {
        reliable: true
      },
  /*
  'reliable': {},
  '@control': {
        outOfOrderAllowed: true,
        maxRetransmitNum: 0
      }
  */
};

var pendingDataChannels = {};
var dataChannels = {}
var pendingCandidates = [];

function doHandleError(error)
{
  throw error;
}

function doComplete()
{
  console.log('complete');
  dataChannels['reliable'].send("Hello world!");
}

function doWaitforDataChannels()
{
  console.log('awaiting data channels')
}

var ws = null;
var pc = new RTCPeerConnection(
  {
    iceServers: [{url:'stun:stun.l.google.com:19302'}]
  },
  {
    'optional': [{DtlsSrtpKeyAgreement: true},
                 {RtpDataChannels: true}]
  }
);
pc.onsignalingstatechange = function(event)
{
  console.info("signaling state change: ", event.target.signalingState);
}
pc.oniceconnectionstatechange = function(event)
{
  console.info("ice connection state change: ", event.target.iceConnectionState);
}
pc.onicegatheringstatechange = function(event)
{
  console.info("ice gathering state change: ", event.target.iceGatheringState);
}
pc.onicecandidate = function(event)
{
  var candidate = event.candidate;
  if(!candidate) return;
  if(WebSocket.OPEN == ws.readyState)
  {
    ws.send(JSON.stringify(
      {'type': 'ice',
       'sdp': {'candidate': candidate.candidate, 'sdpMid': candidate.sdpMid, 'sdpMLineIndex': candidate.sdpMLineIndex}
      })
    );
  } else
  {
    pendingCandidates.push(candidate);
  }
}

doCreateDataChannels();

function doCreateDataChannels()
{
  var labels = Object.keys(dataChannelSettings);
  labels.forEach(function(label) {
    var channelOptions = dataChannelSettings[label];
    var channel = pendingDataChannels[label] = pc.createDataChannel(label, channelOptions);
    channel.binaryType = 'arraybuffer';
    channel.onopen = function() {
      console.info('onopen');
      dataChannels[label] = channel;
      delete pendingDataChannels[label];
      if(Object.keys(dataChannels).length === labels.length) {
        doComplete();
      }
    };
    channel.onclose = function(event) {
      console.info('onclose');
    }
    channel.onerror = doHandleError;
  });
  doCreateOffer();
}

function doCreateOffer()
{
  pc.createOffer(
    doSetLocalDesc,
    doHandleError
  );
}

function doSetLocalDesc(desc)
{
  pc.setLocalDescription(
    new RTCSessionDescription(desc),
    doSendOffer.bind(undefined, desc),
    doHandleError
  );
}

function doSendOffer(offer)
{
  ws = new WebSocket("ws://" + bridge);
  ws.onopen = function()
  {
    pendingCandidates.forEach(function(candidate)
    {
      ws.send(JSON.stringify(
        {'type': 'ice',
         'sdp': {'candidate': candidate.candidate, 'sdpMid': candidate.sdpMid, 'sdpMLineIndex': candidate.sdpMLineIndex}
        })
      );
    });
    ws.send(JSON.stringify(
      {'type': offer.type, 'sdp': offer.sdp})
    );
  }
  ws.onmessage = function(event)
  {
    data = JSON.parse(event.data);
    if('answer' == data.type)
    {
      doSetRemoteDesc(data);
    } else if('ice' == data.type)
    {
      pc.addIceCandidate(new RTCIceCandidate(data.sdp));
    }
  }
}

function doSetRemoteDesc(desc)
{
  pc.setRemoteDescription(
    new RTCSessionDescription(desc),
    doWaitforDataChannels,
    doHandleError
  );
}

})();