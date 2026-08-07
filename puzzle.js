// ============================================================
// Daily Puzzle — Firebase-controlled
// ============================================================
//
// Firebase structure this file expects/creates:
//
//   puzzles/{pushId}            -> { fen, solution:[...], description, rating }
//   dailyPuzzles/{YYYY-MM-DD}   -> { puzzleId }   (which puzzle is "today's puzzle")
//   users/{uid}/public/puzzleRating       -> number (default 800)
//   users/{uid}/public/puzzleStreak       -> number
//   users/{uid}/public/puzzleBestStreak   -> number
//   users/{uid}/private/puzzleLastSolved  -> "YYYY-MM-DD"
//   users/{uid}/private/puzzleHistory/{pushId} -> { puzzleId, result, ratingChange, time }
//
// Firebase is the ONLY source of truth for puzzles — there is no local
// fallback pool. Add/edit puzzle entries directly under `puzzles/` in the
// Firebase console (see the JSON structure above).
//
// ---- Kingdom-gated unlocks ----
// How many puzzles are available depends on the player's kingdom tier
// (see KINGDOM_LEVELS / kingdomState in script.js): Village unlocks the
// first 20, Town unlocks another 20 (40 total), Fortress another 20 (60
// total), and so on. "Puzzle N" means the Nth puzzle ever added under
// puzzles/ in Firebase — push IDs sort chronologically — so this
// assumes puzzles are added in the order you want them unlocked.
//
// This gating affects two things:
//   1. Which puzzle CAN be picked as "today's" shared Daily Puzzle.
//   2. What shows up in the Puzzle List screen, where a player can
//      freely pick and replay any puzzle they've unlocked.
// ============================================================

let currentPuzzle = null;
let puzzlePool = [];
let puzzleMoveIndex = 0;
let puzzleSolved = false;
let puzzleMistakeMade = false;
let puzzleSnapshots = [];
let puzzleViewIndex = 0;
let puzzleHintSquare = null;

function pickRandom(arr){
    return arr[Math.floor(Math.random() * arr.length)];
}

const COACH_CORRECT_LINES = [
    "✅ Nice one! Keep going...",
    "✅ That's the idea!",
    "✅ Exactly right — what's next?",
    "✅ Good eye. Keep it up.",
    "✅ Sharp move — onward."
];

const COACH_WRONG_LINES = [
    "❌ Not quite — try again!",
    "❌ Hmm, that's not it. Look again.",
    "❌ Close, but no — try a different piece.",
    "❌ That doesn't quite work here. Give it another shot."
];

function todayDateString(){
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
}

// ---- Coach speech bubble: only one line shown at a time ----
// Showing a status message (feedback) replaces the puzzle description
// instead of stacking underneath it.

function showCoachDescription(text){
    const descEl = document.getElementById("puzzleDescription");
    const feedbackEl = document.getElementById("puzzleFeedback");
    const bubbleEl = document.querySelector(".coachBubble");
    descEl.textContent = text;
    descEl.style.display = "block";
    feedbackEl.textContent = "";
    feedbackEl.style.display = "none";
    if(bubbleEl) bubbleEl.classList.remove("coachGood", "coachBad");
    if(typeof setCoachThinking === "function") setCoachThinking(true);
    if(typeof setCoachMood === "function") setCoachMood("neutral");
    speakText(text);
}

function showCoachFeedback(text, tone){
    const descEl = document.getElementById("puzzleDescription");
    const feedbackEl = document.getElementById("puzzleFeedback");
    const bubbleEl = document.querySelector(".coachBubble");
    descEl.style.display = "none";
    feedbackEl.textContent = text;
    feedbackEl.style.display = "block";
    if(bubbleEl){
        bubbleEl.classList.remove("coachGood", "coachBad");
        if(tone === "good") bubbleEl.classList.add("coachGood");
        if(tone === "bad") bubbleEl.classList.add("coachBad");
    }
    if(typeof setCoachThinking === "function") setCoachThinking(false);
    if(typeof setCoachMood === "function") setCoachMood(tone === "good" ? "happy" : tone === "bad" ? "concerned" : "neutral");
    speakText(text);
}

// ---- Loading the pool from Firebase — Firebase is fully in control ----

function loadPuzzlePool(){

    if(!db){
        return Promise.reject(new Error("Not connected to Firebase."));
    }

    return db.ref("puzzles").once("value").then(function(snapshot){

        if(!snapshot.exists()){
            return [];
        }

        const out = [];
        snapshot.forEach(function(child){
            out.push(Object.assign({ id: child.key }, child.val()));
        });
        return out;

    }).catch(function(err){
        console.error("Failed to load puzzles from Firebase:", err.message);
        throw err;
    });

}

// ===== KINGDOM PUZZLE UNLOCKS =====

const PUZZLE_UNLOCKS_PER_TIER = 20;

// How many puzzles the current player has unlocked, based on their
// saved kingdom tier (kingdomState.currentLevel, from script.js).
// Village = 20, Town = 40, Fortress = 60, etc. Falls back to the
// base amount if kingdom data isn't available for some reason.
function getUnlockedPuzzleCount(){
    if(typeof KINGDOM_LEVELS === "undefined" || typeof kingdomState === "undefined"){
        return PUZZLE_UNLOCKS_PER_TIER;
    }
    const tierIndex = KINGDOM_LEVELS.findIndex(function(k){ return k.id === kingdomState.currentLevel; });
    const safeIndex = tierIndex >= 0 ? tierIndex : 0;
    return (safeIndex + 1) * PUZZLE_UNLOCKS_PER_TIER;
}

// Sorts the full pool chronologically by push ID (oldest first) and
// slices it down to however many puzzles this player has unlocked.
function getUnlockedPuzzlePool(pool){
    const sorted = pool.slice().sort(function(a, b){
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return sorted.slice(0, getUnlockedPuzzleCount());
}

// ---- Picking "today's" puzzle, shared by everyone, stored in Firebase ----

function pickDeterministicPuzzle(pool){
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);
    return pool[dayOfYear % pool.length];
}

function loadTodaysPuzzle(pool){

    if(!pool || pool.length === 0){
        return Promise.reject(new Error("No puzzles found in Firebase."));
    }

    const dateKey = todayDateString();

    if(!db){
        return Promise.reject(new Error("Not connected to Firebase."));
    }

    const dailyRef = db.ref("dailyPuzzles/" + dateKey);

    return dailyRef.once("value").then(function(snapshot){

        if(snapshot.exists()){
            const puzzleId = snapshot.val().puzzleId;
            const found = pool.find(function(p){ return p.id === puzzleId; });
            if(found) return found;
        }

        // Nobody has claimed today's puzzle yet — pick one deterministically
        // and write it, guarded by a transaction so simultaneous visitors
        // all converge on the same puzzle (like chess.com's puzzle of the day).
        const chosen = pickDeterministicPuzzle(pool);

        return dailyRef.transaction(function(current){
            if(current) return current;
            return { puzzleId: chosen.id };
        }).then(function(result){
            const finalId = result.snapshot.val() ? result.snapshot.val().puzzleId : chosen.id;
            const found = pool.find(function(p){ return p.id === finalId; });
            return found || chosen;
        });

    }).catch(function(err){
        console.error("Failed to load today's puzzle:", err.message);
        return pickDeterministicPuzzle(pool);
    });

}

function fenToPieces(fen){

    const boardPart = fen.split(" ")[0];
    const rows = boardPart.split("/");
    const newPieces = [];

    for(let r = 0; r < 8; r++){
        const row = [];
        const rowStr = rows[r];
        for(let i = 0; i < rowStr.length; i++){
            const ch = rowStr[i];
            if(!isNaN(ch)){
                for(let n = 0; n < Number(ch); n++) row.push("");
            }else{
                const color = ch === ch.toUpperCase() ? "w" : "b";
                row.push(color + ch.toUpperCase());
            }
        }
        newPieces.push(row);
    }

    return newPieces;
}

// Shared setup used by both the Daily Puzzle flow and the Puzzle List —
// takes a puzzle object and gets the board/state/coach text ready for it.
function loadPuzzleIntoBoard(puzzle){

    currentPuzzle = puzzle;
    puzzleMoveIndex = 0;
    puzzleSolved = false;
    puzzleMistakeMade = false;
    puzzleHintSquare = null;
    selected = null;
    possibleMoves = [];

    pieces = fenToPieces(currentPuzzle.fen);
    currentPlayer = currentPuzzle.fen.split(" ")[1] === "w" ? "white" : "black";
    puzzleSnapshots = [{ pieces: JSON.parse(JSON.stringify(pieces)), currentPlayer: currentPlayer }];
    puzzleViewIndex = 0;

    showCoachDescription(currentPuzzle.description);
    updatePuzzleStatsDisplay();
    createPuzzleBoard();

}

function openDailyPuzzle(){

    currentPuzzle = null;
    puzzleMoveIndex = 0;
    puzzleSolved = false;
    puzzleMistakeMade = false;
    puzzleHintSquare = null;
    selected = null;
    possibleMoves = [];

    document.getElementById("puzzleDescription").textContent = "Loading today's puzzle...";
    document.getElementById("puzzleDescription").style.display = "block";
    document.getElementById("puzzleFeedback").textContent = "";
    document.getElementById("puzzleFeedback").style.display = "none";
    document.getElementById("puzzleBoard").innerHTML = "";

    document.getElementById("appShell").style.display = "none";
    document.getElementById("puzzleScreen").style.display = "flex";

    history.pushState({ screen: "puzzle" }, "", "#puzzle");

    loadPuzzlePool().then(function(pool){

        const unlockedPool = getUnlockedPuzzlePool(pool);
        puzzlePool = unlockedPool;

        return loadTodaysPuzzle(unlockedPool);

    }).then(function(puzzle){

        loadPuzzleIntoBoard(puzzle);

    }).catch(function(err){
        console.error("Failed to open daily puzzle:", err.message);
        const message = (err && err.message === "No puzzles found in Firebase.")
            ? "No puzzles have been added yet — add one under 'puzzles' in Firebase."
            : "Couldn't load today's puzzle — check your connection and try again.";
        document.getElementById("puzzleDescription").textContent = message;
        document.getElementById("puzzleDescription").style.display = "block";
        document.getElementById("puzzleFeedback").style.display = "none";
    });

}

function closePuzzle(){
    document.getElementById("puzzleScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "puzzle"){
        history.back();
    }
}

function createPuzzleBoard(){

    const boardEl = document.getElementById("puzzleBoard");
    boardEl.innerHTML = "";

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){

            const square = document.createElement("div");
            square.classList.add("square");
            square.classList.add((r + c) % 2 === 0 ? "light" : "dark");

            if(selected && selected.r === r && selected.c === c){
                square.classList.add("selected");
            }
            if(possibleMoves.some(function(m){ return m.r === r && m.c === c; })){
                square.classList.add("possible");
            }
            if(puzzleHintSquare && puzzleHintSquare.r === r && puzzleHintSquare.c === c){
                square.classList.add("puzzleHintGlow");
            }

            if(pieces[r][c] !== ""){
                const img = document.createElement("img");
                img.src = "pieces/" + pieces[r][c] + ".svg";
                img.className = "piece";
                square.appendChild(img);
            }

            square.onclick = (function(row, col){ return function(){ clickPuzzleSquare(row, col); }; })(r, c);

            boardEl.appendChild(square);
        }
    }
    updatePuzzleNavButtons();
}

function clickPuzzleSquare(r, c){

    if(puzzleSolved) return;
    if(!currentPuzzle) return;
    if(puzzleViewIndex !== puzzleSnapshots.length - 1) return; // reviewing an earlier position — step Forward back to the latest one before moving

    const piece = pieces[r][c];

    if(selected != null && "speechSynthesis" in window){
        window.speechSynthesis.cancel();
        if(typeof setCoachTalking === "function") setCoachTalking(false);
    }

    if(selected == null){
        if(piece === "") return;
        const pieceColor = isWhite(piece) ? "white" : "black";
        if(pieceColor !== currentPlayer) return;
        selected = { r: r, c: c };
        possibleMoves = getLegalMoves(piece, r, c);
        createPuzzleBoard();
        return;
    }

    const isTarget = possibleMoves.some(function(m){ return m.r === r && m.c === c; });

    if(!isTarget){
        selected = null;
        possibleMoves = [];
        createPuzzleBoard();
        return;
    }

    const fromR = selected.r;
    const fromC = selected.c;
    const files = "abcdefgh";
    const uciMove = files[fromC] + (8 - fromR) + files[c] + (8 - r);
    const expectedMove = currentPuzzle.solution[puzzleMoveIndex];

    selected = null;
    possibleMoves = [];

    if(uciMove !== expectedMove){
        puzzleMistakeMade = true;
        showCoachFeedback(pickRandom(COACH_WRONG_LINES), "bad");
        createPuzzleBoard();
        return;
    }

    const movingPiece = pieces[fromR][fromC];
    pieces[r][c] = movingPiece;
    pieces[fromR][fromC] = "";
    puzzleMoveIndex++;
    puzzleHintSquare = null;
    puzzleSnapshots.push({ pieces: JSON.parse(JSON.stringify(pieces)), currentPlayer: currentPlayer === "white" ? "black" : "white" });
    puzzleViewIndex = puzzleSnapshots.length - 1;

    if(puzzleMoveIndex >= currentPuzzle.solution.length){
        puzzleSolved = true;
        showCoachFeedback(puzzleMistakeMade ? "✅ Solved! You got there in the end." : "🏆 Flawless! Solved without a slip.", "good");
        createPuzzleBoard();
        recordPuzzleResult();
        return;
    }

    showCoachFeedback(pickRandom(COACH_CORRECT_LINES), "good");
    currentPlayer = currentPlayer === "white" ? "black" : "white";
    createPuzzleBoard();

    setTimeout(function(){

        const oppMove = currentPuzzle.solution[puzzleMoveIndex];
        const fromSq = oppMove.substring(0, 2);
        const toSq = oppMove.substring(2, 4);
        const fromCoord = squareToCoords(fromSq);
        const toCoord = squareToCoords(toSq);

        pieces[toCoord.r][toCoord.c] = pieces[fromCoord.r][fromCoord.c];
        pieces[fromCoord.r][fromCoord.c] = "";

        puzzleMoveIndex++;
        currentPlayer = currentPlayer === "white" ? "black" : "white";
        puzzleSnapshots.push({ pieces: JSON.parse(JSON.stringify(pieces)), currentPlayer: currentPlayer });
        puzzleViewIndex = puzzleSnapshots.length - 1;
        createPuzzleBoard();

        if(puzzleMoveIndex >= currentPuzzle.solution.length){
            puzzleSolved = true;
            showCoachFeedback(puzzleMistakeMade ? "✅ Solved! You got there in the end." : "🏆 Flawless! Solved without a slip.", "good");
            recordPuzzleResult();
        }else{
            showCoachFeedback("Your opponent replied " + oppMove.substring(0,2) + "-" + oppMove.substring(2,4) + ". Your move.", null);
        }

    }, 500);

}

// ---- Hint: glow the square of the piece that should move next ----

function showPuzzleHint(){

    if(!currentPuzzle || puzzleSolved) return;
    if(puzzleViewIndex !== puzzleSnapshots.length - 1) return; // don't hint while reviewing history

    const expectedMove = currentPuzzle.solution[puzzleMoveIndex];
    if(!expectedMove) return;

    const fromSq = expectedMove.substring(0, 2);
    puzzleHintSquare = squareToCoords(fromSq);

    showCoachFeedback("💡 Try moving the piece on " + fromSq + ".", null);
    createPuzzleBoard();

}

// ---- Back / Forward: step through this attempt's move history ----
// (Purely a review tool — you can only make new moves once you're back at
// the latest position; stepping back just looks, it doesn't undo.)

function puzzleStepBack(){
    if(puzzleViewIndex <= 0) return;
    puzzleViewIndex--;
    renderPuzzleSnapshot();
}

function puzzleStepForward(){
    if(puzzleViewIndex >= puzzleSnapshots.length - 1) return;
    puzzleViewIndex++;
    renderPuzzleSnapshot();
}

function renderPuzzleSnapshot(){
    const snap = puzzleSnapshots[puzzleViewIndex];
    if(!snap) return;
    pieces = JSON.parse(JSON.stringify(snap.pieces));
    currentPlayer = snap.currentPlayer;
    selected = null;
    possibleMoves = [];
    createPuzzleBoard();
}

function updatePuzzleNavButtons(){
    const backBtn = document.getElementById("puzzleBackBtn");
    const forwardBtn = document.getElementById("puzzleForwardBtn");
    if(backBtn) backBtn.disabled = (puzzleViewIndex <= 0);
    if(forwardBtn) forwardBtn.disabled = (puzzleViewIndex >= puzzleSnapshots.length - 1);
}

// ---- Recording results to Firebase: rating + streak, like chess.com ----

function recordPuzzleResult(){

    if(typeof currentUser === "undefined" || !currentUser) return;
    if(typeof db === "undefined" || !db) return;
    if(!currentPuzzle) return;

    const dateKey = todayDateString();
    const ratingChange = puzzleMistakeMade ? 3 : 8;

    const userPublicRef = db.ref("users/" + currentUser.uid + "/public");
    const userPrivateRef = db.ref("users/" + currentUser.uid + "/private");

    userPublicRef.transaction(function(data){

        if(!data) return data;

        data.puzzleRating = (data.puzzleRating || 800) + ratingChange;
        data.puzzleStreak = data.puzzleStreak || 0;
        data.puzzleBestStreak = data.puzzleBestStreak || 0;
        data.puzzlesSolved = (data.puzzlesSolved || 0) + 1;

        return data;

    }).then(function(result){
        if(typeof checkAchievements === "function") checkAchievements(currentUser.uid, result.snapshot.val());
    });

    userPrivateRef.child("puzzleLastSolved").once("value").then(function(snapshot){

        const lastSolved = snapshot.val();

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, "0") + "-" + String(yesterday.getDate()).padStart(2, "0");

        if(lastSolved === dateKey){
            // Already recorded today's solve — don't double count the streak.
            updatePuzzleStatsDisplay();
            return;
        }

        const continuesStreak = (lastSolved === yesterdayKey);

        userPublicRef.transaction(function(data){

            if(!data) return data;

            data.puzzleStreak = continuesStreak ? (data.puzzleStreak || 0) + 1 : 1;
            if(data.puzzleStreak > (data.puzzleBestStreak || 0)){
                data.puzzleBestStreak = data.puzzleStreak;
            }

            return data;

        }).then(function(){
            updatePuzzleStatsDisplay();
        });

        userPrivateRef.child("puzzleLastSolved").set(dateKey);

        userPrivateRef.child("puzzleHistory").push({
            puzzleId: currentPuzzle.id,
            result: puzzleMistakeMade ? "solved-with-mistakes" : "solved",
            ratingChange: ratingChange,
            time: Date.now()
        });

    });

}

function updatePuzzleStatsDisplay(){

    const ratingEl = document.getElementById("puzzleRatingValue");
    const streakEl = document.getElementById("puzzleStreakValue");

    if(!ratingEl && !streakEl) return;
    if(typeof currentUser === "undefined" || !currentUser || !db) return;

    db.ref("users/" + currentUser.uid + "/public").once("value").then(function(snapshot){

        const data = snapshot.val() || {};

        if(ratingEl) ratingEl.textContent = data.puzzleRating || 800;
        if(streakEl) streakEl.textContent = data.puzzleStreak || 0;

    });

}

// ===== PUZZLE LIST SCREEN =====
// Lets a player browse and freely replay any puzzle they've unlocked
// via their kingdom tier, instead of only ever seeing "today's puzzle".

function openPuzzleList(){

    document.getElementById("appShell").style.display = "none";
    document.getElementById("puzzleListScreen").style.display = "flex";
    history.pushState({ screen: "puzzleList" }, "", "#puzzleList");

    const listEl = document.getElementById("puzzleListItems");
    if(listEl) listEl.innerHTML = '<p class="sub">Loading...</p>';

    const countEl = document.getElementById("puzzleListUnlockedCount");
    if(countEl) countEl.textContent = getUnlockedPuzzleCount();

    loadPuzzlePool().then(function(pool){

        const unlockedPool = getUnlockedPuzzlePool(pool);

        if(typeof currentUser === "undefined" || !currentUser || !db){
            renderPuzzleList(unlockedPool, {});
            return;
        }

        return db.ref("users/" + currentUser.uid + "/private/puzzleHistory").once("value").then(function(snapshot){
            const solvedIds = {};
            if(snapshot.exists()){
                snapshot.forEach(function(child){
                    const entry = child.val();
                    if(entry && entry.puzzleId) solvedIds[entry.puzzleId] = true;
                });
            }
            renderPuzzleList(unlockedPool, solvedIds);
        });

    }).catch(function(err){
        console.error("Failed to load puzzle list:", err.message);
        if(listEl) listEl.innerHTML = '<p class="sub">Couldn\'t load puzzles — check your connection and try again.</p>';
    });

}

function renderPuzzleList(unlockedPool, solvedIds){

    const listEl = document.getElementById("puzzleListItems");
    if(!listEl) return;

    if(!unlockedPool || unlockedPool.length === 0){
        listEl.innerHTML = '<p class="sub">No puzzles have been added yet.</p>';
        return;
    }

    listEl.innerHTML = "";

    unlockedPool.forEach(function(puzzle, index){

        const isSolved = !!solvedIds[puzzle.id];

        const row = document.createElement("div");
        row.className = "gameRow";
        row.style.cursor = "pointer";
        row.onclick = function(){ playSpecificPuzzle(puzzle); };

        row.innerHTML =
            '<div class="gameOpponentInfo">' +
                '<div class="gameOpponentText">' +
                    '<span class="gameOpponent">Puzzle ' + (index + 1) + '</span>' +
                    '<span class="gameMeta">Rating ' + (puzzle.rating || "?") + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="gameResultCol">' +
                '<span class="gameResult ' + (isSolved ? "gameWon" : "gameDrawn") + '">' + (isSolved ? "Solved" : "Unsolved") + '</span>' +
            '</div>';

        listEl.appendChild(row);

    });

}

function closePuzzleList(){
    document.getElementById("puzzleListScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "puzzleList"){
        history.back();
    }
}

function playSpecificPuzzle(puzzle){
    document.getElementById("puzzleListScreen").style.display = "none";
    document.getElementById("puzzleScreen").style.display = "flex";
    history.pushState({ screen: "puzzle" }, "", "#puzzle");
    loadPuzzleIntoBoard(puzzle);
}
