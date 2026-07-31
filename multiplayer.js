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

// Whether we've heard back from Firebase at least once about how far off
// this device's own clock is. Every device — regardless of what its own
// clock says — corrects against this same offset, which is what keeps
// both phones' game clocks in agreement instead of drifting apart.
let serverTimeSynced = false;
let resolveServerTimeReady;
const serverTimeReady = new Promise(function(resolve){ resolveServerTimeReady = resolve; });

try{
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    db.ref(".info/serverTimeOffset").on("value", function(snapshot){
        serverTimeOffset = snapshot.val() || 0;
        if(!serverTimeSynced){
            serverTimeSynced = true;
            resolveServerTimeReady();
        }
    });

}catch(err){
    console.error("Firebase failed to initialize:", err.message);
}

function getServerNow(){
    return Date.now() + serverTimeOffset;
}

// Resolves as soon as the clock correction above has been confirmed, or
// after maxWaitMs — whichever comes first — so a slow/offline connection
// can't hang a game start forever. Used to make sure the very first
// clock timestamp of an online game is written with a confirmed offset,
// not a default of 0, which is what caused the two-phones-disagree bug.
function waitForServerTime(maxWaitMs){
    if(serverTimeSynced) return Promise.resolve();
    return Promise.race([
        serverTimeReady,
        new Promise(function(resolve){ setTimeout(resolve, maxWaitMs); })
    ]);
}

function generateRoomCode(){
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for(let i = 0; i < 5; i++){
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// ============================================================
// Listener leak fix: every db.ref(...).on(...) set up for a room
// (moves, events, clock, player info, presence, connection state) gets
// tracked here so it can be torn down in one call. Previously nothing
// ever called .off() on these — playing several online games in one
// session silently piled up dead Firebase listeners. stopOnlineListeners()
// is called at the top of startOnlineGame() (clears the PREVIOUS game's
// listeners before attaching the new game's) and from leaveSpectating().
// ============================================================

let activeOnlineListenerRefs = [];

function trackOnlineListener(ref){
    activeOnlineListenerRefs.push(ref);
    return ref;
}

function stopOnlineListeners(){
    activeOnlineListenerRefs.forEach(function(ref){
        try{ ref.off(); }catch(e){}
    });
    activeOnlineListenerRefs = [];
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
        flag: (typeof currentUserFlag !== "undefined" && currentUserFlag) ? currentUserFlag : "🏳️",
        rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : null,
        photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
        uid: currentUser ? currentUser.uid : null
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
        db.ref("rooms/" + code + "/players/black").set({
            username: (typeof currentUsername !== "undefined" && currentUsername) ? currentUsername : "Guest",
            flag: (typeof currentUserFlag !== "undefined" && currentUserFlag) ? currentUserFlag : "🏳️",
            rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : null,
            photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
            uid: currentUser ? currentUser.uid : null
        });

        db.ref("rooms/" + code + "/status").set("playing");

        startOnlineGame(code);

    });

}

function spectateRoom(directCode){

    if(!db){
        const statusEl = document.getElementById("spectateStatus");
        if(statusEl) statusEl.textContent = "Could not connect — check your internet connection.";
        return;
    }

    const code = (directCode || document.getElementById("spectateRoomInput").value.trim()).toUpperCase();

    if(!code){
        const statusEl = document.getElementById("spectateStatus");
        if(statusEl) statusEl.textContent = "Please enter a room code.";
        return;
    }

    const statusEl = document.getElementById("spectateStatus");
    if(statusEl) statusEl.textContent = "Connecting...";

    db.ref("rooms/" + code).once("value").then(function(snapshot){

        if(!snapshot.exists()){
            if(statusEl) statusEl.textContent = "Room not found. Check the code and try again.";
            if(directCode) showInfoPopup("👀 Watch", "That game has already ended.");
            return;
        }

        // myColor stays null on purpose — every existing "is it my turn"
        // and "is it my color" check in clickSquare/startOnlineGame already
        // treats a null myColor as "not a player", which is exactly what a
        // read-only spectator needs: no moves can be sent, no clock writes,
        // no presence tracking.
        myColor = null;
        currentRoomCode = code;

        closeTimeControl();
        startOnlineGame(code);

        const banner = document.getElementById("spectatorBanner");
        const controls = document.getElementById("inGameControls");
        if(banner) banner.style.display = "block";
        if(controls) controls.style.display = "none";

    }).catch(function(err){
        document.getElementById("spectateStatus").textContent = "Could not connect: " + err.message;
    });

}

function leaveSpectating(){

    stopOnlineListeners();

    myColor = null;
    currentRoomCode = null;
    gameOver = true;
    clearInterval(timer);

    const banner = document.getElementById("spectatorBanner");
    const controls = document.getElementById("inGameControls");
    if(banner) banner.style.display = "none";
    if(controls) controls.style.display = "grid";

    document.getElementById("game").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    switchScreen("home");

}

function startOnlineGame(code){

    // Clear out any listeners left over from a previous online game
    // played earlier in this session, before attaching this game's set.
    stopOnlineListeners();

    closeTimeControl();

    gameMode = "online";
    newGame();

    // Board and clock UI show up immediately; only the timing-sensitive
    // part below (writing the first clock timestamp) waits on the sync.
    if(!serverTimeSynced){
        const timerEl = document.getElementById("topTimer");
        if(timerEl) timerEl.textContent = "Syncing clock...";
    }

    listenForRemoteMoves(code);

    if(myColor){
        const myPresenceRef = db.ref("rooms/" + code + "/presence/" + myColor);

        const connRef = db.ref(".info/connected");
        trackOnlineListener(connRef);
        connRef.on("value", function(connSnap){
            if(connSnap.val() === true){
                myPresenceRef.onDisconnect().set(false);
                myPresenceRef.set(true);
            }
        });

        listenForOpponentPresence(code);

        // Lets anyone viewing this player's profile see they're currently
        // in a game and jump straight into spectating it.
        if(currentUser){
            const myRoomRef = db.ref("users/" + currentUser.uid + "/public/currentRoomCode");
            myRoomRef.set(code);
            myRoomRef.onDisconnect().remove();
        }
    }

    listenForGameEvents(code);
    listenForClockSync(code);
    startOnlineClockDisplay();
    listenForPlayerInfo(code);

    if(typeof startGameChatWatcher === "function") startGameChatWatcher();

    if(myColor === "white"){
        waitForServerTime(3000).then(function(){
            db.ref("rooms/" + code + "/clock").set({
                whiteTime: selectedTime,
                blackTime: selectedTime,
                turn: "white",
                turnStartedAt: getServerNow()
            });
        });
    }

}

function listenForOpponentPresence(code){

    const opponentColor = myColor === "white" ? "black" : "white";
    let abandonTimeout = null;

    const ref = db.ref("rooms/" + code + "/presence/" + opponentColor);
    trackOnlineListener(ref);

    ref.on("value", function(snapshot){

        if(snapshot.val() === false && !gameOver){

            if(abandonTimeout) clearTimeout(abandonTimeout);

            abandonTimeout = setTimeout(function(){

                db.ref("rooms/" + code + "/presence/" + opponentColor).once("value").then(function(recheck){

                    if(recheck.val() === false && !gameOver){
                        gameOver = true;
                        clearInterval(timer);
                        const winner = opponentColor === "white" ? "Black" : "White";
                        showPopup("🚩 Game Abandoned", winner + " wins by abandonment.");
                        recordGameResult("win", myOpponentName());
                    }

                });

            }, 10000);

        }else if(snapshot.val() === true && abandonTimeout){
            clearTimeout(abandonTimeout);
            abandonTimeout = null;
        }

    });
}
function listenForPlayerInfo(code){

    const ref = db.ref("rooms/" + code + "/players");
    trackOnlineListener(ref);

    ref.on("value", function(snapshot){

        const players = snapshot.val();
        if(!players) return;

        if(players.white){
            whitePlayer = players.white.username || "White";
            whiteFlag = players.white.flag || "";
            whiteRating = players.white.rating || null;
            whitePhoto = players.white.photo || null;
            whiteUid = players.white.uid || null;
        }

        if(players.black){
            blackPlayer = players.black.username || "Black";
            blackFlag = players.black.flag || "";
            blackRating = players.black.rating || null;
            blackPhoto = players.black.photo || null;
            blackUid = players.black.uid || null;
        }

        updatePlayerNames();

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

    const ref = db.ref("rooms/" + code + "/events");
    trackOnlineListener(ref);

    ref.on("child_added", function(snapshot){

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
            recordGameResult("win", myOpponentName());
        }

        if(event.type === "abort" && !gameOver){
            gameOver = true;
            clearInterval(timer);
            const winner = event.by === "white" ? "Black" : "White";
            showPopup("🏳️ Game Aborted", winner + " wins by abandonment.");
            createBoard();
            showKingMarkers(event.by);
            recordGameResult("win", myOpponentName());
        }

        if(event.type === "drawOffer" && !gameOver){
            document.getElementById("drawOfferPopup").classList.add("show");
        }

        if(event.type === "drawResponse" && event.accepted && !gameOver){
            gameOver = true;
            clearInterval(timer);
            showPopup("🤝 Draw", "Game drawn by agreement.");
            createBoard();
            recordGameResult("draw", myOpponentName());
        }

    });
}

function listenForRemoteMoves(code){

    const ref = db.ref("rooms/" + code + "/moves");
    trackOnlineListener(ref);

    ref.on("child_added", function(snapshot){

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
    const ref = db.ref("rooms/" + code + "/clock");
    trackOnlineListener(ref);
    ref.on("value", function(snapshot){
        clockData = snapshot.val();
    });
}

function pushClockUpdate(moverColor){

    if(!currentRoomCode || !db) return;

    waitForServerTime(3000).then(function(){
        pushClockUpdateNow(moverColor);
    });

}

function pushClockUpdateNow(moverColor){

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
            recordGameResult(myColor === "black" ? "win" : "loss", myOpponentName());
        }

        if(clockData.blackTime !== -1 && displayBlack <= 0){
            gameOver = true;
            clearInterval(timer);
            showPopup("⏰ TIME!", "White wins on time!");
            recordGameResult(myColor === "white" ? "win" : "loss", myOpponentName());
        }

    }, 500);

}
