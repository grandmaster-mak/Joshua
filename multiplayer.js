// ============================================================
// Online multiplayer via Firebase Realtime Database
//
// v1 scope, by design:
//   - Room-code based (no accounts/usernames yet)
//   - Each move is broadcast and replayed on the other device
//   - Promotions always auto-queen in online mode (both players) —
//     avoids needing to sync a promotion-choice popup for now
//   - Timers run locally on each device, not synced yet
//   - No board flip for the joining player yet (both see White at
//     the bottom for now)
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyCsb7bLtPIrILSVK07aKNkGNEWslK8EJxs",
    authDomain: "my-chess-app-f1436.firebaseapp.com",
    databaseURL: "https://my-chess-app-f1436-default-rtdb.firebaseio.com",
    projectId: "my-chess-app-f1436",
    storageBucket: "my-chess-app-f1436.firebasestorage.app",
    messagingSenderId: "712701324531",
    appId: "1:712701324531:web:262abb4dfd881652a39b86",
    measurementId: "G-NKNHKLSQ5P"
};

let db = null;

try{
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
}catch(err){
    console.error("Firebase failed to initialize:", err.message);
}

function generateRoomCode(){
    // Avoids visually ambiguous characters (0/O, 1/I) since people
    // will be reading this off one phone and typing it into another.
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for(let i = 0; i < 5; i++){
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function createOnlineRoom(){

    if(!db){
        document.getElementById("onlineStatus").textContent = "Could not connect — check your internet connection.";
        return;
    }

    const code = generateRoomCode();

    db.ref("rooms/" + code).set({
        status: "waiting",
        createdAt: Date.now()
    });

    myColor = "white";
    currentRoomCode = code;

    document.getElementById("roomCodeDisplay").textContent = "Room code: " + code + " — share this with your opponent";
    document.getElementById("onlineStatus").textContent = "Waiting for opponent to join...";

    const statusRef = db.ref("rooms/" + code + "/status");

    statusRef.on("value", function(snapshot){
        if(snapshot.val() === "playing"){
            statusRef.off();
            startOnlineGame(code);
        }
    });

}

function joinOnlineRoom(){

    if(!db){
        document.getElementById("onlineStatus").textContent = "Could not connect — check your internet connection.";
        return;
    }

    const code = document.getElementById("joinRoomInput").value.trim().toUpperCase();

    if(!code){
        document.getElementById("onlineStatus").textContent = "Please enter a room code.";
        return;
    }

    document.getElementById("onlineStatus").textContent = "Joining...";

    db.ref("rooms/" + code).once("value", function(snapshot){

        if(!snapshot.exists()){
            document.getElementById("onlineStatus").textContent = "Room not found. Check the code and try again.";
            return;
        }

        const room = snapshot.val();

        if(room.status !== "waiting"){
            document.getElementById("onlineStatus").textContent = "That room is no longer available.";
            return;
        }

        myColor = "black";
        currentRoomCode = code;

        db.ref("rooms/" + code + "/status").set("playing");

        startOnlineGame(code);

    });

}

function startOnlineGame(code){

    closeTimeControl();

    gameMode = "online";
    newGame();

    listenForRemoteMoves(code);

    const myPresenceRef = db.ref("rooms/" + code + "/presence/" + myColor);
    myPresenceRef.set(true);
    myPresenceRef.onDisconnect().set(false);

    listenForOpponentPresence(code);
}

function listenForRemoteMoves(code){

    db.ref("rooms/" + code + "/moves").on("child_added", function(snapshot){

        const move = snapshot.val();

        // Skip echoes of our own moves — we already applied them
        // locally the moment we made them.
        if(!move || move.by === myColor) return;

        applyingRemoteMove = true;
        remotePromotionPiece = move.promotion || null;
        executeMove(move.fromR, move.fromC, move.toR, move.toC, false);
        applyingRemoteMove = false;

    });

}

function sendMoveToFirebase(fromR, fromC, toR, toC, promotion){

    if(!db || !currentRoomCode) return;

    db.ref("rooms/" + currentRoomCode + "/moves").push({
        fromR: fromR,
        fromC: fromC,
        toR: toR,
        toC: toC,
        by: myColor,
        promotion: promotion || null,
        time: Date.now()
    });

}
