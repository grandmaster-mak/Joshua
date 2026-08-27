// ============================================================
// Comeback mode — Stage 1: preset imbalance positions + loader
//
// 50 stored starting-position presets. Each one lists which pieces to
// strip from the disadvantaged side's standard army. The system always
// picks one at random — the player never chooses which preset they get.
//
// Piece letters use the same P/N/B/R/Q codes as the rest of the app;
// color is applied separately when a preset is actually built onto a
// board. Point values follow the same scale used everywhere else in
// this app: P=1, N=3, B=3, R=5, Q=9. Every preset below removes
// material worth between 4 and 9 points total, per spec.
// ============================================================

const COMEBACK_PRESETS = [
  { remove: ["Q"] },                                 // 1  -9
  { remove: ["R"] },                                 // 2  -5
  { remove: ["R","P"] },                             // 3  -6
  { remove: ["R","P","P"] },                         // 4  -7
  { remove: ["R","P","P","P"] },                     // 5  -8
  { remove: ["R","P","P","P","P"] },                 // 6  -9
  { remove: ["N","B"] },                             // 7  -6
  { remove: ["N","N"] },                             // 8  -6
  { remove: ["B","B"] },                             // 9  -6
  { remove: ["N","B","P"] },                         // 10 -7
  { remove: ["N","N","P"] },                         // 11 -7
  { remove: ["B","B","P"] },                         // 12 -7
  { remove: ["N","B","P","P"] },                     // 13 -8
  { remove: ["N","N","P","P"] },                     // 14 -8
  { remove: ["B","B","P","P"] },                     // 15 -8
  { remove: ["N","B","P","P","P"] },                 // 16 -9
  { remove: ["N","N","P","P","P"] },                 // 17 -9
  { remove: ["B","B","P","P","P"] },                 // 18 -9
  { remove: ["N","P"] },                             // 19 -4
  { remove: ["B","P"] },                             // 20 -4
  { remove: ["N","P","P"] },                         // 21 -5
  { remove: ["B","P","P"] },                         // 22 -5
  { remove: ["N","P","P","P"] },                     // 23 -6
  { remove: ["B","P","P","P"] },                     // 24 -6
  { remove: ["N","P","P","P","P"] },                 // 25 -7
  { remove: ["B","P","P","P","P"] },                 // 26 -7
  { remove: ["N","P","P","P","P","P"] },             // 27 -8
  { remove: ["B","P","P","P","P","P"] },             // 28 -8
  { remove: ["N","P","P","P","P","P","P"] },         // 29 -9
  { remove: ["B","P","P","P","P","P","P"] },         // 30 -9
  { remove: ["P","P","P","P"] },                     // 31 -4
  { remove: ["P","P","P","P","P"] },                 // 32 -5
  { remove: ["P","P","P","P","P","P"] },             // 33 -6
  { remove: ["P","P","P","P","P","P","P"] },         // 34 -7
  { remove: ["P","P","P","P","P","P","P","P"] },     // 35 -8
  { remove: ["R","N"] },                             // 36 -8
  { remove: ["R","B"] },                             // 37 -8
  { remove: ["R","N","P"] },                         // 38 -9
  { remove: ["R","B","P"] },                         // 39 -9
  { remove: ["N","N","B"] },                         // 40 -9
  { remove: ["N","B","B"] },                         // 41 -9
  { remove: ["R","P","P","P"] },                     // 42 -8
  { remove: ["N","B"] },                             // 43 -6
  { remove: ["Q"] },                                 // 44 -9
  { remove: ["N","N","P","P"] },                     // 45 -8
  { remove: ["B","B","P"] },                         // 46 -7
  { remove: ["R"] },                                 // 47 -5
  { remove: ["N","P","P","P"] },                     // 48 -6
  { remove: ["B","P","P","P","P"] },                 // 49 -7
  { remove: ["R","P","P"] }                          // 50 -7
];

// Picks one preset at random — the player never selects it themselves.
function pickRandomComebackPreset(){
    return COMEBACK_PRESETS[Math.floor(Math.random() * COMEBACK_PRESETS.length)];
}

// Returns the total material value a preset removes, using the same
// piece values as the rest of the app.
function getComebackDeficit(preset){
    const values = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
    return preset.remove.reduce(function(sum, type){ return sum + (values[type] || 0); }, 0);
}

// Builds a fresh 8x8 starting position with the given preset's pieces
// stripped from `disadvantagedColor` ("white" or "black"). The other
// side keeps its full, complete standard starting army — only the
// disadvantaged side is missing anything.
function buildComebackPieces(preset, disadvantagedColor){

    const pieces = [
        ["bR","bN","bB","bQ","bK","bB","bN","bR"],
        ["bP","bP","bP","bP","bP","bP","bP","bP"],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["wP","wP","wP","wP","wP","wP","wP","wP"],
        ["wR","wN","wB","wQ","wK","wB","wN","wR"]
    ];

    const prefix = disadvantagedColor === "white" ? "w" : "b";
    const toRemove = preset.remove.slice(); // work off a copy — cross items off as found

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const piece = pieces[r][c];
            if(piece === "" || piece[0] !== prefix) continue;
            const type = piece[1];
            const idx = toRemove.indexOf(type);
            if(idx !== -1){
                pieces[r][c] = "";
                toRemove.splice(idx, 1);
            }
        }
    }

    return pieces;
}

// ============================================================
// Stage 1 practice entry point — lets you try a random Comeback
// position right now, offline against the AI, before online
// matchmaking and the two-game match/rating system (Stage 2) exist.
// You always play the disadvantaged side here, so you can feel out
// what the mode is actually like.
// ============================================================
function startComebackPractice(){

    const preset = pickRandomComebackPreset();
    const deficit = getComebackDeficit(preset);

    gameMode = "ai";
    ratedAIActive = false;
    isCoachMode = false;
    aiDifficulty = "easy";
    selectedTime = 600;

    closeTimeControl();
    newGame();

    // newGame() already set up a standard starting position — now
    // replace it with the Comeback preset and refresh everything that
    // depends on the starting position (the board render, the move
    // history's baseline snapshot, and threefold-repetition tracking).
    pieces = buildComebackPieces(preset, "white"); // human is always white in AI games
    positionHistory = [getPositionKey()];
    boardSnapshots = [snapshotPieces()];
    createBoard();

    showInfoPopup(
        "🔥 Comeback Challenge",
        "You're starting down about " + deficit + " points of material. Win by any means necessary!"
    );

}

// ============================================================
// Comeback Mode — rated solo vs AI (requires login)
// ============================================================

let isComebackGame = false;

function startComebackVsAI(){

    const preset = pickRandomComebackPreset();
    const deficit = getComebackDeficit(preset);

    isComebackGame = true;
    gameMode = "ai";
    ratedAIActive = false;   // separate rating track, not the normal rated-AI flow
    isCoachMode = false;
    aiDifficulty = "medium";
    selectedTime = 600;

    closeTimeControl();
    newGame(); // newGame() resets isComebackGame to false — restore it after
    isComebackGame = true;

    pieces = buildComebackPieces(preset, "white");
    positionHistory = [getPositionKey()];
    boardSnapshots = [snapshotPieces()];
    createBoard();

    showInfoPopup(
        "🔥 Comeback Challenge",
        "Rated match — you're starting down about " + deficit + " points of material. Win by any means necessary!"
    );

}

// Called from recordGameResult() in script.js instead of the normal
// rating/kingdom path whenever isComebackGame is true.
function recordComebackResult(myResult){

    isComebackGame = false; // consume the flag so the next game is normal

    if(!currentUser || !db) return;

    db.ref("users/" + currentUser.uid + "/public").transaction(function(data){
        if(!data) return data;
        data.comebackRating = data.comebackRating || 100;
        data.comebackWins = data.comebackWins || 0;
        data.comebackLosses = data.comebackLosses || 0;

        if(myResult === "win"){
            data.comebackRating += 8;
            data.comebackWins++;
        }else if(myResult === "loss"){
            data.comebackRating -= 8;
            data.comebackLosses++;
        }
        // draws: no change

        return data;
    }, function(error, committed, snapshot){
        if(error){
            console.error("Comeback rating save failed:", error);
            return;
        }
        if(!committed || !snapshot.val()) return;

        const delta = myResult === "win" ? 8 : myResult === "loss" ? -8 : 0;
        if(delta !== 0){
            const el = document.getElementById("popupRatingChange");
            if(el){
                el.textContent = "Comeback Rating: " + (delta > 0 ? "+" : "") + delta;
                el.style.color = delta > 0 ? "#4ade80" : "#e5484d";
                el.style.display = "block";
            }
        }
    });

}

// ============================================================
// Comeback Mode — online 2-game match (quick match + AI fallback)
// Preset is fixed for the whole match; whoever is White that
// game carries the deficit — so it "flips" simply by colors
// swapping between game 1 and game 2.
// ============================================================

let isComebackMatch = false;
let comebackMatchState = null;

function startComebackQuickMatch(){

    if(!db || !currentUser){
        showInfoPopup("🔒 Login Required", "Please log in to play Comeback Mode online.");
        return;
    }

    matchmakingSearchActive = true;
    showQuickMatchSearchingUI();

    matchmakingPendingRef = db.ref("comebackMatchmakingPending/" + currentUser.uid);
    matchmakingPendingRef.on("value", function(snap){
        const info = snap.val();
        if(!info || !matchmakingSearchActive) return;

        clearTimeout(matchmakingTimeoutHandle);
        clearInterval(quickMatchCountdownInterval);
        stopQuickMatchSearch();
        db.ref("comebackMatchmakingPending/" + currentUser.uid).set(null);
        closeQuickMatchSearchingUI();

        comebackMatchState = {
            matchId: info.matchId,
            role: info.role,
            presetIndex: info.presetIndex,
            vsAI: false
        };
        startComebackMatchGame(1);

    }, function(err){
        matchmakingSearchActive = false;
        closeQuickMatchSearchingUI();
        showInfoPopup("⚠️ Matchmaking Error", "Could not reach the queue: " + (err.code || err.message));
    });

    let matchedOpponentUid = null;
    let matchedMatchId = null;
    let matchedPresetIndex = null;

    db.ref("comebackMatchmakingQueue").transaction(function(queue){
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
            matchedMatchId = generateRoomCode();
            matchedPresetIndex = Math.floor(Math.random() * COMEBACK_PRESETS.length);
        }else{
            queue[myUid] = { joinedAt: now };
        }
        return queue;
    }, function(error, committed){
        if(error){
            matchmakingSearchActive = false;
            if(matchmakingPendingRef){ matchmakingPendingRef.off(); matchmakingPendingRef = null; }
            clearTimeout(matchmakingTimeoutHandle);
            closeQuickMatchSearchingUI();
            showInfoPopup("⚠️ Matchmaking Error", "Could not join the queue: " + (error.code || error.message));
            return;
        }
        if(!committed) return;
        if(matchedOpponentUid){
            db.ref("comebackMatchmakingPending/" + currentUser.uid).set({ matchId: matchedMatchId, role: "A", presetIndex: matchedPresetIndex });
            db.ref("comebackMatchmakingPending/" + matchedOpponentUid).set({ matchId: matchedMatchId, role: "B", presetIndex: matchedPresetIndex });
        }
    });

    matchmakingTimeoutHandle = setTimeout(function(){
        if(!matchmakingSearchActive) return;
        stopQuickMatchSearch();
        if(currentUser && db) db.ref("comebackMatchmakingQueue/" + currentUser.uid).remove();
        closeQuickMatchSearchingUI();
        startComebackAIMatch();
    }, 15000);

}

function startComebackAIMatch(){

    if(!currentUser || !db){
        showInfoPopup("🔒 Login Required", "Please log in to play Comeback Mode.");
        return;
    }

    comebackMatchState = {
        vsAI: true,
        presetIndex: Math.floor(Math.random() * COMEBACK_PRESETS.length),
        humanDeficitFirst: Math.random() < 0.5
    };

    showInfoPopup("🤖 No Opponents Found", "Starting a 2-game Comeback match against the AI instead.");

    startComebackMatchGame(1);

}

function startComebackMatchGame(gameNumber){

    const state = comebackMatchState;
    state.currentGameNumber = gameNumber;
    isComebackMatch = true;

    const preset = COMEBACK_PRESETS[state.presetIndex];

    if(state.vsAI){

        gameMode = "ai";
        ratedAIActive = false;
        isCoachMode = false;
        aiDifficulty = "medium";
        selectedTime = 600;
        closeTimeControl();
        newGame();
        isComebackMatch = true;

        const humanHasDeficit = (gameNumber === 1) ? state.humanDeficitFirst : !state.humanDeficitFirst;
        pieces = buildComebackPieces(preset, humanHasDeficit ? "white" : "black");
        positionHistory = [getPositionKey()];
        boardSnapshots = [snapshotPieces()];
        createBoard();

        showInfoPopup(
            "🔥 Comeback Match — Game " + gameNumber + " of 2",
            humanHasDeficit ? "You're down material this game. Win it back!" : "You're at full strength — the AI is down material this game."
        );

    }else{

        const myColorThisGame = (gameNumber === 1)
            ? (state.role === "A" ? "white" : "black")
            : (state.role === "A" ? "black" : "white");

        myColor = myColorThisGame;
        currentRoomCode = state.matchId + "-G" + gameNumber;
        selectedTime = 600;
        gameMode = "online";
        ratedAIActive = false;

        const myKingdom = getMyCurrentKingdom();
        db.ref("rooms/" + currentRoomCode + "/players/" + myColorThisGame).set({
            username: currentUsername,
            flag: currentUserFlag,
            rating: currentUserRating || null,
            photo: currentUserPhotoURL || null,
            uid: currentUser.uid,
            kingdom: kingdomState.currentLevel,
            kingdomEmoji: myKingdom.emoji,
            kingdomName: myKingdom.name
        });
        db.ref("rooms/" + currentRoomCode + "/status").set("playing");

        startOnlineGame(currentRoomCode);

        // Whoever is White this game carries the deficit — that's how the
        // "flip" happens between game 1 and game 2.
        pieces = buildComebackPieces(preset, "white");
        positionHistory = [getPositionKey()];
        boardSnapshots = [snapshotPieces()];
        createBoard();

        showInfoPopup(
            "🔥 Comeback Match — Game " + gameNumber + " of 2",
            "10 minutes. Whoever's White this game carries the material deficit."
        );

    }

}

function handleComebackMatchGameEnd(myResult){

    isComebackMatch = false;

    const state = comebackMatchState;
    if(!state) return;

    const capturedValues = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
    const sumCaptured = function(list){
        return list.reduce(function(sum, p){ return sum + (capturedValues[p[1]] || 0); }, 0);
    };

    const gameData = {
        myResult: myResult,
        myColorThisGame: state.vsAI ? "white" : myColor,
        whiteCapturedValue: sumCaptured(whiteCaptured),
        blackCapturedValue: sumCaptured(blackCaptured)
    };

    if(state.currentGameNumber === 1){
        state.game1 = gameData;
        setTimeout(function(){ startComebackMatchGame(2); }, 1200);
    }else{
        state.game2 = gameData;
        finalizeComebackMatch();
    }

}

function finalizeComebackMatch(){

    const state = comebackMatchState;
    const games = [state.game1, state.game2];

    const myWins = games.filter(function(g){ return g.myResult === "win"; }).length;
    const oppWins = games.filter(function(g){ return g.myResult === "loss"; }).length;

    const myCapturedTotal = games.reduce(function(sum, g){
        return sum + (g.myColorThisGame === "white" ? g.whiteCapturedValue : g.blackCapturedValue);
    }, 0);
    const oppCapturedTotal = games.reduce(function(sum, g){
        return sum + (g.myColorThisGame === "white" ? g.blackCapturedValue : g.whiteCapturedValue);
    }, 0);

    let matchResult;
    if(myWins > oppWins) matchResult = "win";
    else if(oppWins > myWins) matchResult = "loss";
    else if(myCapturedTotal > oppCapturedTotal) matchResult = "win";
    else if(oppCapturedTotal > myCapturedTotal) matchResult = "loss";
    else matchResult = "draw";

    recordComebackMatchResult(matchResult);
    comebackMatchState = null;

}

function recordComebackMatchResult(matchResult){

    if(!currentUser || !db) return;

    db.ref("users/" + currentUser.uid + "/public").transaction(function(data){
        if(!data) return data;
        data.comebackRating = data.comebackRating || 100;
        data.comebackMatchWins = data.comebackMatchWins || 0;
        data.comebackMatchLosses = data.comebackMatchLosses || 0;
        data.comebackMatchDraws = data.comebackMatchDraws || 0;

        if(matchResult === "win"){
            data.comebackRating += 16;
            data.comebackMatchWins++;
        }else if(matchResult === "loss"){
            data.comebackRating -= 16;
            data.comebackMatchLosses++;
        }else{
            data.comebackMatchDraws++;
        }
        return data;
    }, function(error, committed, snapshot){
        if(error){ console.error("Comeback match rating save failed:", error); return; }
        if(!committed || !snapshot.val()) return;

        const delta = matchResult === "win" ? 16 : matchResult === "loss" ? -16 : 0;
        const title = matchResult === "win" ? "🏆 Comeback Match Won!" : matchResult === "loss" ? "Comeback Match Lost" : "🤝 Comeback Match Drawn";
        const msg = matchResult === "draw"
            ? "1–1 on games, and captures were tied too — no rating change."
            : "Rating change: " + (delta > 0 ? "+" : "") + delta;

        setTimeout(function(){ showInfoPopup(title, msg); }, 600);
    });

}

function openComebackMode(){
    if(!currentUser || !db){
        showInfoPopup("🔒 Login Required", "Please log in to play Comeback Mode — it's rated, so it needs an account.");
        return;
    }
    document.getElementById("comebackMenuPopup").classList.add("show");
}
function closeComebackMenu(){
    document.getElementById("comebackMenuPopup").classList.remove("show");
}
