// ============================================================
// Online multiplayer via Firebase Realtime Database
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
let serverTimeOffset = 0;
let clockData = null;

try{
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    db.ref(".info/serverTimeOffset").on("value", function(snapshot){
        serverTimeOffset = snapshot.val() || 0;
    });

}catch(err){
    console.error("Firebase failed to initialize:", err.message);
}

function getServerNow(){
    return Date.now() + serverTimeOffset;
}

function generateRoomCode(){
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
db.ref("rooms/" + code + "/players/white").set({
        username: (typeof currentUsername !== "undefined" && currentUsername) ? currentUsername : "Guest",
        flag: (typeof currentUserFlag !== "undefined" && currentUserFlag) ? currentUserFlag : "🏳️"
    });
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
    listenForGameEvents(code);
    listenForClockSync(code);
    startOnlineClockDisplay();

    if(myColor === "white"){
        db.ref("rooms/" + code + "/clock").set({
            whiteTime: selectedTime,
            blackTime: selectedTime,
            turn: "white",
            turnStartedAt: getServerNow()
        });
    }

}

function listenForOpponentPresence(code){
    const opponentColor = myColor === "white" ? "black" : "white";

    db.ref("rooms/" + code + "/presence/" + opponentColor).on("value", function(snapshot){
        if(snapshot.val() === false && !gameOver){
            gameOver = true;
            clearInterval(timer);
            const winner = opponentColor === "white" ? "Black" : "White";
            showPopup("🚩 Game Abandoned", winner + " wins by abandonment.");
        }
    });
}

function sendGameEvent(type, extra){
    if(!db || !currentRoomCode) return;

    const payload = {
        type: type,
        by: myColor,
        time: Date.now()
    };

    if(extra){
        Object.assign(payload, extra);
    }

    db.ref("rooms/" + currentRoomCode + "/events").push(payload);
}

function listenForGameEvents(code){

    db.ref("rooms/" + code + "/events").on("child_added", function(snapshot){

        const event = snapshot.val();
        if(!event) return;

        if(event.by === myColor) return;

        if(event.type === "resign" && !gameOver){
            gameOver = true;
            clearInterval(timer);
            const winner = event.by === "white" ? "Black" : "White";
            showPopup("🚩 Resignation", winner + " wins by resignation.");
            createBoard();
            showKingMarkers(event.by);
        }

        if(event.type === "abort" && !gameOver){
            gameOver = true;
            clearInterval(timer);
            const winner = event.by === "white" ? "Black" : "White";
            showPopup("🏳️ Game Aborted", winner + " wins by abandonment.");
            createBoard();
            showKingMarkers(event.by);
        }

        if(event.type === "drawOffer" && !gameOver){
            document.getElementById("drawOfferPopup").classList.add("show");
        }

        if(event.type === "drawResponse" && event.accepted && !gameOver){
            gameOver = true;
            clearInterval(timer);
            showPopup("🤝 Draw", "Game drawn by agreement.");
            createBoard();
        }

    });
}

function listenForRemoteMoves(code){

    db.ref("rooms/" + code + "/moves").on("child_added", function(snapshot){

        const move = snapshot.val();

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

function listenForClockSync(code){
    db.ref("rooms/" + code + "/clock").on("value", function(snapshot){
        clockData = snapshot.val();
    });
}

function pushClockUpdate(moverColor){

    if(!currentRoomCode || !db) return;

    db.ref("rooms/" + currentRoomCode + "/clock").transaction(function(current){

        if(!current) return current;

        const now = getServerNow();
        const elapsedSeconds = Math.max(0, Math.floor((now - current.turnStartedAt) / 1000));

        let newWhiteTime = current.whiteTime;
        let newBlackTime = current.blackTime;

        if(current.whiteTime !== -1 && current.blackTime !== -1){
            if(moverColor === "white"){
                newWhiteTime = Math.max(0, current.whiteTime - elapsedSeconds);
            }else{
                newBlackTime = Math.max(0, current.blackTime - elapsedSeconds);
            }
        }

        return {
            whiteTime: newWhiteTime,
            blackTime: newBlackTime,
            turn: moverColor === "white" ? "black" : "white",
            turnStartedAt: now
        };

    });

}

function startOnlineClockDisplay(){

    clearInterval(timer);

    timer = setInterval(function(){

        if(!clockData || gameOver) return;

        const now = getServerNow();
        const elapsed = (now - clockData.turnStartedAt) / 1000;

        let displayWhite = clockData.whiteTime;
        let displayBlack = clockData.blackTime;

        if(clockData.whiteTime !== -1 && clockData.blackTime !== -1){
            if(clockData.turn === "white"){
                displayWhite = Math.max(0, clockData.whiteTime - elapsed);
            }else{
                displayBlack = Math.max(0, clockData.blackTime - elapsed);
            }
        }

        whiteTime = Math.ceil(displayWhite);
        blackTime = Math.ceil(displayBlack);

        updateTimers();

        if(clockData.whiteTime !== -1 && displayWhite <= 0){
            gameOver = true;
            clearInterval(timer);
            showPopup("⏰ TIME!", "Black wins on time!");
        }

        if(clockData.blackTime !== -1 && displayBlack <= 0){
            gameOver = true;
            clearInterval(timer);
            showPopup("⏰ TIME!", "White wins on time!");
        }

    }, 500);

}
