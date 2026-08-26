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

let serverTimeSynced = false;
let resolveServerTimeReady;
const serverTimeReady = new Promise(function(resolve){ resolveServerTimeReady = resolve; });

try{
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    // Enable Firebase offline persistence so data loads instantly from cache
    firebase.database().enablePersistence()
        .catch(function(err) {
            console.log("Offline persistence error:", err.code);
        });

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

    // Also clean up global challenge listeners if any.
    if(window.challengeStatusRef){
        try{ window.challengeStatusRef.off(); }catch(e){}
        window.challengeStatusRef = null;
    }
    if(window.challengeDeclinedRef){
        try{ window.challengeDeclinedRef.off(); }catch(e){}
        window.challengeDeclinedRef = null;
    }
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

    // ===== KINGDOM DATA =====
    // FIX: was getKingdomByStreak(kingdomState.consecutiveWins), which
    // always resolves to Village right after a promotion (consecutiveWins
    // resets to 0 on promotion). We want the player's actual saved tier,
    // which lives in kingdomState.currentLevel.
    const myKingdom = getMyCurrentKingdom();
    // ===== END KINGDOM DATA =====

    db.ref("rooms/" + code + "/players/white").set({
        username: (typeof currentUsername !== "undefined" && currentUsername) ? currentUsername : "Guest",
        flag: (typeof currentUserFlag !== "undefined" && currentUserFlag) ? currentUserFlag : "🏳️",
        rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : null,
        photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
        uid: currentUser ? currentUser.uid : null,
        // ===== KINGDOM DATA =====
        kingdom: kingdomState.currentLevel,
        kingdomEmoji: myKingdom.emoji,
        kingdomName: myKingdom.name
        // ===== END KINGDOM DATA =====
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

        // ===== KINGDOM DATA =====
        // FIX: use the account's actual saved tier, not a streak-based
        // lookup that resets to Village after every promotion.
        const myKingdom = getMyCurrentKingdom();
        // ===== END KINGDOM DATA =====

        db.ref("rooms/" + code + "/players/black").set({
            username: (typeof currentUsername !== "undefined" && currentUsername) ? currentUsername : "Guest",
            flag: (typeof currentUserFlag !== "undefined" && currentUserFlag) ? currentUserFlag : "🏳️",
            rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : null,
            photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
            uid: currentUser ? currentUser.uid : null,
            // ===== KINGDOM DATA =====
            kingdom: kingdomState.currentLevel,
            kingdomEmoji: myKingdom.emoji,
            kingdomName: myKingdom.name
            // ===== END KINGDOM DATA =====
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

    releaseWakeLock();
}

function startOnlineGame(code){

    stopOnlineListeners();

    closeTimeControl();

    // Hide every screen so the game board is always on top.
    if(typeof hideAllScreensBeforeGame === "function") hideAllScreensBeforeGame();

    gameMode = "online";
    ratedAIActive = false;
    newGame();

    // If this is a spectator joining a rated AI game, load its current
    // board state instead of the starting position.
    if(myColor === null && db && code){
        db.ref("rooms/" + code).once("value").then(function(snapshot){
            const room = snapshot.val();
            if(room && room.type === "ratedAI" && room.currentFen){
                pieces = fenToPieces(room.currentFen);
                currentPlayer = room.currentFen.split(" ")[1] === "w" ? "white" : "black";
                selected = null;
                possibleMoves = [];
                lastMove = null;
                createBoard();
                updateTurn();
            }
        });
    }

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

                // Final safety checks before awarding an abandonment win:
                // 1. The room still exists and is still playing.
                // 2. Our side is still active.
                // 3. The opponent presence is STILL false after a second look.
                if(!db || !currentRoomCode || myColor === null || gameOver) return;

                db.ref("rooms/" + code).once("value").then(function(roomSnap){
                    const room = roomSnap.val();
                    if(!room || room.status !== "playing") return;

                    return db.ref("rooms/" + code + "/presence/" + opponentColor).once("value").then(function(recheck){
                        if(recheck.val() === false && !gameOver){
                            gameOver = true;
                            clearInterval(timer);
                            const winner = opponentColor === "white" ? "Black" : "White";
                            showPopup("🚩 Game Abandoned", winner + " wins by abandonment.");
                            recordGameResult("win", myOpponentName());
                        }
                    });
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

        // ===== OPPONENT KINGDOM =====
        if(myColor){
            const opponentColor = myColor === "white" ? "black" : "white";
            if(players[opponentColor] && players[opponentColor].kingdom){
                window.opponentKingdom = players[opponentColor].kingdom;
                opponentKingdomEmoji = players[opponentColor].kingdomEmoji || '🏕️';
                opponentKingdomName = players[opponentColor].kingdomName || 'Village';
            } else {
                window.opponentKingdom = null;
                opponentKingdomEmoji = '🏕️';
                opponentKingdomName = 'Village';
            }
        }
        // ===== END OPPONENT KINGDOM =====

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
        if(myColor === null) return; // spectator: skip interactive events

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
            document.getElementById("drawOfferPopup").classList.remove("show");
            const winner = event.by === "white" ? "Black" : "White";
            showPopup("🏳️ Game Aborted", winner + " wins by abandonment.");
            createBoard();
            showKingMarkers(event.by);
            recordGameResult("win", myOpponentName());
        }

        // ===== UPDATED drawOffer handler =====
        if(event.type === "drawOffer" && !gameOver){
            const popup = document.getElementById("drawOfferPopup");
            if(!popup) return;

            popup.querySelector("h2").textContent = "🤝 Draw Offer";
            popup.querySelector(".sub").textContent = "Your opponent is offering a draw.";

            const acceptBtn = popup.querySelector(".btnPrimary");
            acceptBtn.textContent = "✅ Accept";
            acceptBtn.onclick = function(){
                popup.classList.remove("show");
                respondToDraw(true);
            };

            const declineBtn = popup.querySelector(".btnDanger");
            declineBtn.textContent = "❌ Decline";
            declineBtn.onclick = function(){
                popup.classList.remove("show");
                respondToDraw(false);
            };

            popup.classList.add("show");
        }
        // ===== END UPDATED drawOffer handler =====

        // ===== UPDATED drawResponse handler =====
        if(event.type === "drawResponse" && !gameOver){
            if(event.accepted){
                gameOver = true;
                clearInterval(timer);
                showPopup("🤝 Draw", "Game drawn by agreement.");
                createBoard();
                recordGameResult("draw", myOpponentName());
            } else {
                showInfoPopup("🤝 Draw Declined", "Your opponent declined the draw offer.");
            }
        }
        // ===== END UPDATED drawResponse handler =====

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

        // Guard against double updates: only process if the turn still
        // belongs to the mover who just completed a move.
        if(current.turn !== moverColor) return current;

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

// ============================================================
// Quick Match
// ============================================================

let matchmakingSearchActive = false;
let matchmakingPendingRef = null;
let matchmakingTimeoutHandle = null;
let quickMatchCountdownInterval = null;

function startQuickMatch(){

    if(!db){
        showInfoPopup("🔒 Log In Required", "Please log in to play online.");
        return;
    }

    if(!currentUser){
        showInfoPopup("⏳ One Moment", "Confirming your session — try Play Online again in a couple of seconds.");
        setTimeout(function(){
            if(currentUser) startQuickMatch();
        }, 2600);
        return;
    }

    matchmakingSearchActive = true;
    showQuickMatchSearchingUI();

    matchmakingPendingRef = db.ref("matchmakingPending/" + currentUser.uid);
    matchmakingPendingRef.on("value", function(snap){

        const info = snap.val();
        if(!info || !matchmakingSearchActive) return;

        clearTimeout(matchmakingTimeoutHandle);
        clearInterval(quickMatchCountdownInterval);
        stopQuickMatchSearch();
        db.ref("matchmakingPending/" + currentUser.uid).set(null);

        myColor = info.color;
        currentRoomCode = info.roomCode;
        selectedTime = 600;
        gameMode = "online";

        // ===== KINGDOM DATA =====
        // FIX: use the account's actual saved tier, not a streak-based
        // lookup that resets to Village after every promotion.
        const myKingdom = getMyCurrentKingdom();
        // ===== END KINGDOM DATA =====

        db.ref("rooms/" + info.roomCode + "/players/" + myColor).set({
            username: currentUsername,
            flag: currentUserFlag,
            rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
            photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
            uid: currentUser.uid,
            // ===== KINGDOM DATA =====
            kingdom: kingdomState.currentLevel,
            kingdomEmoji: myKingdom.emoji,
            kingdomName: myKingdom.name
            // ===== END KINGDOM DATA =====
        });
        db.ref("rooms/" + info.roomCode + "/status").set("playing");

        const el = document.getElementById("quickMatchCountdown");
        if(el) el.textContent = "Opponent found!";

        setTimeout(function(){
            closeQuickMatchSearchingUI();
            startOnlineGame(info.roomCode);
        }, 500);

    }, function(err){
        console.error("Matchmaking pending-listener denied:", err.code, err.message, err);
        matchmakingSearchActive = false;
        closeQuickMatchSearchingUI();
        showInfoPopup("⚠️ Matchmaking Error", "Could not reach the matchmaking queue: " + (err.code || err.message));
    });

    let matchedOpponentUid = null;
    let matchedRoomCode = null;
    let matchedMyColor = null;
    let matchedOpponentColor = null;

    db.ref("matchmakingQueue").transaction(function(queue){

        if(!queue) queue = {};

        const myUid = currentUser.uid;
        const now = Date.now();

        Object.keys(queue).forEach(function(uid){
            if(now - (queue[uid].joinedAt || 0) > 60000) delete queue[uid];
        });

        const others = Object.keys(queue).filter(function(u){ return u !== myUid; });

        if(others.length > 0){

            const opponent = others[0];
            delete queue[opponent];
            delete queue[myUid];

            matchedOpponentUid = opponent;
            matchedRoomCode = generateRoomCode();
            matchedMyColor = Math.random() < 0.5 ? "white" : "black";
            matchedOpponentColor = matchedMyColor === "white" ? "black" : "white";

        }else{
            queue[myUid] = { rating: currentUserRating || 100, joinedAt: now };
        }

        return queue;

    }, function(error, committed, snapshot){

        if(error){
            console.error("Matchmaking queue transaction failed:", error.code, error.message, error);
            matchmakingSearchActive = false;
            if(matchmakingPendingRef){ matchmakingPendingRef.off(); matchmakingPendingRef = null; }
            clearTimeout(matchmakingTimeoutHandle);
            closeQuickMatchSearchingUI();
            showInfoPopup("⚠️ Matchmaking Error", "Could not join the matchmaking queue: " + (error.code || error.message));
            return;
        }

        if(!committed) return;

        if(matchedOpponentUid){
            db.ref("matchmakingPending/" + currentUser.uid).set({ roomCode: matchedRoomCode, color: matchedMyColor });
            db.ref("matchmakingPending/" + matchedOpponentUid).set({ roomCode: matchedRoomCode, color: matchedOpponentColor });
        }

    });

    matchmakingTimeoutHandle = setTimeout(function(){
        cancelQuickMatchAndFallbackToAI();
    }, 15000);

}

function stopQuickMatchSearch(){
    matchmakingSearchActive = false;
    if(matchmakingPendingRef){ matchmakingPendingRef.off(); matchmakingPendingRef = null; }
    clearTimeout(matchmakingTimeoutHandle);
}

function cancelQuickMatchAndFallbackToAI(){
    if(!matchmakingSearchActive) return;
    stopQuickMatchSearch();
    if(currentUser && db) db.ref("matchmakingQueue/" + currentUser.uid).remove();
    closeQuickMatchSearchingUI();
    startRatedAIMatch();
}

function cancelQuickMatchManually(){
    if(!matchmakingSearchActive){
        closeQuickMatchSearchingUI();
        return;
    }
    stopQuickMatchSearch();
    if(currentUser && db) db.ref("matchmakingQueue/" + currentUser.uid).remove();
    closeQuickMatchSearchingUI();
}

function showQuickMatchSearchingUI(){

    let remaining = 15;
    const el = document.getElementById("quickMatchCountdown");
    if(el) el.textContent = remaining + "s";

    document.getElementById("quickMatchPopup").classList.add("show");

    clearInterval(quickMatchCountdownInterval);
    quickMatchCountdownInterval = setInterval(function(){
        remaining--;
        if(el) el.textContent = Math.max(remaining, 0) + "s";
        if(remaining <= 0) clearInterval(quickMatchCountdownInterval);
    }, 1000);

}

function closeQuickMatchSearchingUI(){
    clearInterval(quickMatchCountdownInterval);
    document.getElementById("quickMatchPopup").classList.remove("show");
}

function startRatedAIMatch(){

    const rating = currentUserRating || 100;

    gameMode = "ai";
    ratedAIActive = true;
    isCoachMode = false;
    aiDifficulty = rating >= 1200 ? "hard" : rating >= 600 ? "medium" : "easy";
    ratedAISettings = (typeof getRatedAISettings === "function") ? getRatedAISettings(rating) : null;
    selectedTime = 600;
    if(typeof aiChatMessages !== "undefined") aiChatMessages = [];

    // Create a room so other players can watch this rated AI game.
    const aiRoomCode = generateRoomCode();
    currentRoomCode = aiRoomCode;
    myColor = "white"; // the real player is White vs AI

    db.ref("rooms/" + aiRoomCode).set({
        status: "playing",
        createdAt: Date.now(),
        timeControl: selectedTime,
        type: "ratedAI"
    });

    db.ref("rooms/" + aiRoomCode + "/players/white").set({
        username: currentUsername,
        flag: currentUserFlag,
        rating: currentUserRating || 100,
        photo: currentUserPhotoURL || null,
        uid: currentUser ? currentUser.uid : null
    });

    db.ref("rooms/" + aiRoomCode + "/players/black").set({
        username: "Rated AI",
        flag: "🤖",
        rating: null,
        photo: null,
        uid: null
    });

    if(currentUser && db){
        db.ref("users/" + currentUser.uid + "/public/currentRoomCode").set(aiRoomCode);
        db.ref("users/" + currentUser.uid + "/public/currentRoomCode").onDisconnect().remove();
    }

    closeTimeControl();
    newGame();

    showInfoPopup("🤖 No Opponents Found", "Couldn't find anyone online in time — this is now a rated match against the AI, matched to your rating.");

}
