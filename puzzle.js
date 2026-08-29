// ============================================================
// Puzzles — Firebase-controlled, kingdom-gated, sequential unlock
// ============================================================
//
// Firebase structure this file expects/creates:
//
//   puzzles/{pushId}            -> { fen, solution:[...], description, rating }
//   users/{uid}/public/puzzleRating       -> number (default 800)
//   users/{uid}/public/puzzleStreak       -> number (daily SOLVE streak — separate from kingdom wins)
//   users/{uid}/public/puzzleBestStreak   -> number
//   users/{uid}/private/puzzleLastSolved  -> "YYYY-MM-DD"
//   users/{uid}/private/puzzleHistory/{pushId} -> { puzzleId, result, ratingChange, time }
//
// Firebase is the ONLY source of truth for puzzles — there is no local
// fallback pool. Add/edit puzzle entries directly under `puzzles/` in the
// Firebase console (see the JSON structure above).
//
// ---- How puzzles are organized ----
// All puzzles in Firebase are sorted chronologically by push ID (oldest
// first) and sliced into blocks of 20, one block per kingdom tier (see
// KINGDOM_LEVELS / kingdomState in script.js): puzzles 1-20 belong to
// Village, 21-40 to Town, 41-60 to Fortress, and so on.
//
// A tier's puzzles are only visible/playable once the player's saved
// kingdom (kingdomState.currentLevel) has reached that tier. WITHIN an
// unlocked tier, puzzles must be solved in order — solving puzzle N
// unlocks puzzle N+1; you can still tap back into an already-solved
// puzzle to replay it, but you can't skip ahead.
//
// ---- Daily gating ----
// Within an unlocked tier, only ONE brand-new (never-solved) puzzle
// becomes playable per calendar day. Solving today's new puzzle locks
// the next new one until the next calendar day (isNewPuzzleUnlockedToday).
// Already-solved puzzles are exempt from this — you can always replay
// any of them any time, with no daily limit.
//
// ---- Navigation ----
// openDailyPuzzle() — bound to every "Puzzles" entry point in the app —
// behaves like this:
//   - If there's an unsolved puzzle unlocked for TODAY specifically,
//     it skips the map screen entirely and loads that puzzle's board
//     directly.
//   - Otherwise (already solved today's, or waiting on a new day, or
//     waiting on kingdom promotion) it opens the Puzzle Map instead,
//     where the player can freely replay any already-solved puzzle.
// Finishing a puzzle (closePuzzle() while puzzleSolved is true) always
// returns to the Puzzle Map, never to the home screen directly.
//
// ---- Cache-first, like Recent Games / Friends list ----
// Both openDailyPuzzle() and openPuzzleMap() decide what to show
// INSTANTLY from whatever's saved on the device (cachePuzzlePool /
// cachePuzzleUserState) — no network wait, ever, even on a first
// launch after being offline. A real Firebase fetch always still runs
// in the background afterward and quietly corrects the cache for next
// time; it never discards fresh data just because it took a while
// (that was the old bug), and it never yanks the player out of a
// screen they're already looking at.
//
// ---- Replays don't affect rating/streak ----
// A puzzle only awards puzzleRating, bumps puzzlesSolved, updates the
// daily solve streak, and gets a new puzzleHistory entry the FIRST time
// it's ever solved. Every subsequent solve of that same puzzle (a
// deliberate replay from the Puzzle Map) is tracked purely client-side
// for the "Solved!" feedback message — it does not touch Firebase at
// all, so replaying old puzzles can never inflate your rating or count.
// This is driven by the `puzzleIsReplay` flag, set whenever a puzzle is
// loaded (loadPuzzleIntoBoard's second argument / playPuzzleObject's
// second argument) based on whether it was already marked solved at
// the point it was opened.
//
// ---- Done button ----
// #puzzleDoneBtn in the puzzleScreen header stays hidden until the
// current puzzle is solved (showPuzzleDoneButton()), then calls
// closePuzzle() same as the back arrow — which, since puzzleSolved is
// true at that point, routes to the Puzzle Map instead of Home.
// ============================================================

let currentPuzzle = null;
let puzzlePool = [];
let puzzleMoveIndex = 0;
let puzzleSolved = false;
let puzzleMistakeMade = false;
let puzzleOpenedFromMap = false;
let puzzleSnapshots = [];
let puzzleViewIndex = 0;
let puzzleHintSquare = null;
let puzzleIsReplay = false;

const PUZZLE_UNLOCKS_PER_TIER = 20;

function cachePuzzlePool(pool){
    try { localStorage.setItem("cachedPuzzlePool", JSON.stringify(pool)); } catch(e) {}
}

function loadCachedPuzzlePool(){
    try { return JSON.parse(localStorage.getItem("cachedPuzzlePool") || "null"); } catch(e) { return null; }
}

// ---- Cached "what have I solved, and when did I last solve something"
// state — this is what lets openDailyPuzzle() decide instantly, the same
// way Recent Games/Friends already paint instantly from cache.
function cachePuzzleUserState(solvedIds, lastSolvedDate){
    try { localStorage.setItem("cachedPuzzleUserState", JSON.stringify({ solvedIds: solvedIds, lastSolvedDate: lastSolvedDate })); } catch(e) {}
}

function loadCachedPuzzleUserState(){
    try { return JSON.parse(localStorage.getItem("cachedPuzzleUserState") || "null"); } catch(e) { return null; }
}

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

// A brand-new (never-solved) puzzle is only unlockable once per calendar
// day — solving one today locks the next new puzzle until tomorrow.
// Already-solved puzzles are exempt: you can always replay those.
function isNewPuzzleUnlockedToday(lastSolvedDate){
    if(!lastSolvedDate) return true;
    return lastSolvedDate !== todayDateString();
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
//
// IMPORTANT FIX: the old version used Promise.race([realFetch, 3s-timeout])
// and simply discarded the real fetch if it hadn't landed within 3
// seconds. On a slow connection that meant a puzzle that took, say, 4
// seconds to arrive from Firebase was thrown away every single time —
// the cache never got updated, forever, on that connection. Now the
// real fetch is NEVER abandoned: it always finishes and always saves
// to cache, no matter how long it takes. The timeout below only
// controls how long we're willing to wait before falling back to
// showing the cache — it never cancels or discards the real fetch.
function loadPuzzlePool(){

    const cached = loadCachedPuzzlePool();

    if(!db){
        if(cached) return Promise.resolve(cached);
        return Promise.reject(new Error("Not connected to Firebase."));
    }

    return new Promise(function(resolve, reject){

        let settled = false;

        const timeout = setTimeout(function(){
            if(!settled && cached){
                settled = true;
                resolve(cached);
            }
        }, 1200);

        db.ref("puzzles").once("value").then(function(snapshot){

            clearTimeout(timeout);

            const out = [];
            if(snapshot.exists()){
                snapshot.forEach(function(child){
                    out.push(Object.assign({ id: child.key }, child.val()));
                });
            }

            cachePuzzlePool(out); // always saved, whether or not we already resolved from cache

            if(!settled){
                settled = true;
                resolve(out);
            }else if(typeof onPuzzlePoolRefreshed === "function"){
                onPuzzlePoolRefreshed(out);
            }

        }).catch(function(err){
            clearTimeout(timeout);
            console.error("Failed to load puzzles from Firebase:", err.message);
            if(!settled){
                settled = true;
                if(cached){ resolve(cached); } else { reject(err); }
            }
        });

    });

}

function sortPuzzlesChronologically(pool){
    return pool.slice().sort(function(a, b){
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

// Index (0-based) of the player's current kingdom tier within
// KINGDOM_LEVELS. Falls back to 0 (Village) if kingdom data isn't
// available for some reason.
function getCurrentTierIndex(){
    if(typeof KINGDOM_LEVELS === "undefined" || typeof kingdomState === "undefined"){
        return 0;
    }
    const idx = KINGDOM_LEVELS.findIndex(function(k){ return k.id === kingdomState.currentLevel; });
    return idx >= 0 ? idx : 0;
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

// Shared setup used whenever a specific puzzle is opened for play —
// takes a puzzle object and gets the board/state/coach text ready for it.
//
// isReplay: pass true when this puzzle was already marked solved at the
// moment it was opened (i.e. the player deliberately picked an already-
// solved tile from the Puzzle Map to practice again). When true, solving
// it again will NOT touch Firebase rating/streak/history — see
// recordPuzzleResult() below.
function loadPuzzleIntoBoard(puzzle, isReplay){

    currentPuzzle = puzzle;
    puzzleMoveIndex = 0;
    puzzleSolved = false;
    puzzleMistakeMade = false;
    puzzleHintSquare = null;
    puzzleIsReplay = !!isReplay;
    selected = null;
    possibleMoves = [];

    pieces = fenToPieces(currentPuzzle.fen);
    currentPlayer = currentPuzzle.fen.split(" ")[1] === "w" ? "white" : "black";
    puzzleSnapshots = [{ pieces: JSON.parse(JSON.stringify(pieces)), currentPlayer: currentPlayer }];
    puzzleViewIndex = 0;

    const doneBtn = document.getElementById("puzzleDoneBtn");
    if(doneBtn) doneBtn.style.display = "none";

    showCoachDescription(currentPuzzle.description);
    updatePuzzleStatsDisplay();
    createPuzzleBoard();

}

// ---- Instant, cache-only decision: which puzzle (if any) should open
// immediately, and what should the map look like right now — computed
// with zero network wait, exactly like Recent Games/Friends paint from
// cache before any fetch completes. Returns null only if there is no
// cached puzzle pool at all yet (i.e. this device has never loaded
// puzzles before).
function getInstantPuzzleDecision(){

    const cachedPool = loadCachedPuzzlePool();
    if(!cachedPool || cachedPool.length === 0) return null;

    const sorted = sortPuzzlesChronologically(cachedPool);
    const cachedState = loadCachedPuzzleUserState();
    const solvedIds = (cachedState && cachedState.solvedIds) || {};
    const lastSolvedDate = (cachedState && cachedState.lastSolvedDate) || null;

    const currentTierIndex = getCurrentTierIndex();
    const tierPuzzles = sorted.slice(
        currentTierIndex * PUZZLE_UNLOCKS_PER_TIER,
        currentTierIndex * PUZZLE_UNLOCKS_PER_TIER + PUZZLE_UNLOCKS_PER_TIER
    );

    let nextPlayableLocal = -1;
    for(let i = 0; i < PUZZLE_UNLOCKS_PER_TIER; i++){
        const p = tierPuzzles[i];
        if(p && !solvedIds[p.id]){
            nextPlayableLocal = i;
            break;
        }
    }

    const newUnlockedToday = isNewPuzzleUnlockedToday(lastSolvedDate);

    if(nextPlayableLocal !== -1 && newUnlockedToday && tierPuzzles[nextPlayableLocal]){
        return { mode: "puzzle", puzzle: tierPuzzles[nextPlayableLocal], sorted: sorted, solvedIds: solvedIds, lastSolvedDate: lastSolvedDate };
    }

    return { mode: "map", sorted: sorted, solvedIds: solvedIds, lastSolvedDate: lastSolvedDate };

}

// Runs after the screen is already showing something (from cache or a
// bare "Loading..."). Always fetches the real, current truth from
// Firebase — however long that takes — and quietly updates the local
// cache for next time. If the Puzzle Map happens to be the screen still
// on display when this lands, it refreshes it in place; it never
// redirects the player out of a puzzle board they're actively solving.
function refreshPuzzleDataInBackground(){

    loadPuzzlePool().then(function(pool){

        const sorted = sortPuzzlesChronologically(pool);

        if(typeof currentUser === "undefined" || !currentUser || !db){
            const mapVisible = document.getElementById("puzzleMapScreen") && document.getElementById("puzzleMapScreen").style.display === "flex";
            if(mapVisible) renderPuzzleMap(sorted, {}, null);
            return;
        }

        db.ref("users/" + currentUser.uid + "/private").once("value").then(function(snapshot){

            const priv = snapshot.val() || {};
            const solvedIds = {};
            if(priv.puzzleHistory){
                Object.keys(priv.puzzleHistory).forEach(function(key){
                    const entry = priv.puzzleHistory[key];
                    if(entry && entry.puzzleId) solvedIds[entry.puzzleId] = true;
                });
            }

            cachePuzzleUserState(solvedIds, priv.puzzleLastSolved || null);

            const mapVisible = document.getElementById("puzzleMapScreen") && document.getElementById("puzzleMapScreen").style.display === "flex";
            if(mapVisible){
                renderPuzzleMap(sorted, solvedIds, priv.puzzleLastSolved || null);
            }

        }).catch(function(err){
            console.error("Failed to refresh puzzle solve-state:", err.message);
        });

    }).catch(function(err){
        console.error("Failed to refresh puzzle pool:", err.message);
        const cachedPool = loadCachedPuzzlePool();
        if(!cachedPool || cachedPool.length === 0){
            const bodyEl = document.getElementById("puzzleMapBody");
            if(bodyEl) bodyEl.innerHTML = '<p class="sub">Couldn\'t load puzzles — check your connection and try again.</p>';
        }
    });

}

// Bound to every "Puzzles" entry point in the app (Home quicklink,
// Account stats row, Account Quick Access row).
//
// Decides INSTANTLY from cache whether to jump straight into today's
// puzzle or show the map — no network wait at all if this device has
// opened puzzles before. Always kicks off a background refresh
// afterward to keep the cache correct for next time.
function openDailyPuzzle(){

    const instant = getInstantPuzzleDecision();

    if(instant && instant.mode === "puzzle"){

        document.getElementById("appShell").style.display = "none";
        document.getElementById("puzzleMapScreen").style.display = "none";
        document.getElementById("puzzleScreen").style.display = "flex";
        puzzleOpenedFromMap = false;
        history.pushState({ screen: "puzzle" }, "", "#puzzle");
        loadPuzzleIntoBoard(instant.puzzle, false);

    }else{

        document.getElementById("appShell").style.display = "none";
        document.getElementById("puzzleMapScreen").style.display = "flex";
        history.pushState({ screen: "puzzleMap" }, "", "#puzzleMap");

        if(instant){
            renderPuzzleMap(instant.sorted, instant.solvedIds, instant.lastSolvedDate);
        }else{
            const bodyEl = document.getElementById("puzzleMapBody");
            if(bodyEl) bodyEl.innerHTML = '<p class="sub">Loading...</p>';
        }

    }

    refreshPuzzleDataInBackground();

}

// Closes the puzzle board.
function closePuzzle(){
    history.back();
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

            // Rank label on first column
            if(c === 0){
                const rank = document.createElement("span");
                rank.className = "rankLabel";
                rank.textContent = 8 - r;
                square.appendChild(rank);
            }

            // File label on last row
            if(r === 7){
                const file = document.createElement("span");
                file.className = "fileLabel";
                file.textContent = "abcdefgh"[c];
                square.appendChild(file);
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
        showPuzzleDoneButton();
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
            showPuzzleDoneButton();
            recordPuzzleResult();
        }else{
            showCoachFeedback("Your opponent replied " + oppMove.substring(0,2) + "-" + oppMove.substring(2,4) + ". Your move.", null);
        }

    }, 500);

}

// Reveals the "✅ Done" button in the puzzle screen header once the
// current puzzle has been solved, so the player can explicitly confirm
// they're finished and head back to the batch/grid view.
function showPuzzleDoneButton(){
    const doneBtn = document.getElementById("puzzleDoneBtn");
    if(doneBtn) doneBtn.style.display = "inline-block";
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
// Note: puzzleStreak here is the DAILY SOLVE streak (solved at least one
// puzzle today, yesterday, etc.) — a separate feature from kingdom wins.
//
// IMPORTANT: if this solve is a replay (puzzleIsReplay === true — the
// player deliberately reopened an already-solved puzzle from the Puzzle
// Map), this function does nothing at all. No rating change, no
// puzzlesSolved bump, no streak update, no new history entry. Replays
// are purely for practice and must never inflate stats.
//
// ALSO updates the local solved-state cache immediately (optimistically),
// even before any Firebase write completes — so re-opening Puzzles right
// after solving, even fully offline, never shows this same puzzle again.

function recordPuzzleResult(){

    if(puzzleIsReplay) return;
    if(!currentPuzzle) return;

    const dateKey = todayDateString();

    const existingState = loadCachedPuzzleUserState() || { solvedIds: {}, lastSolvedDate: null };
    const updatedSolvedIds = Object.assign({}, existingState.solvedIds || {});
    updatedSolvedIds[currentPuzzle.id] = true;
    cachePuzzleUserState(updatedSolvedIds, dateKey);

    if(typeof currentUser === "undefined" || !currentUser) return;
    if(typeof db === "undefined" || !db) return;

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

// ============================================================
// ===== PUZZLE MAP SCREEN =====
// Kingdom-by-kingdom puzzle path: each unlocked kingdom shows its own
// 20-puzzle grid, solved in sequence. This is where the player lands
// once they've already solved today's new puzzle (or are waiting on
// the next day / next promotion) — from here they can freely replay
// any already-solved puzzle at their own pace, with no effect on
// rating or streak.
//
// Like openDailyPuzzle(), this now paints INSTANTLY from cache and
// refreshes in the background — no waiting screen on repeat visits.
// ============================================================

function openPuzzleMap(replace){

    document.getElementById("puzzleMapScreen").style.display = "flex";
    document.getElementById("puzzleScreen").style.display = "none";
    document.getElementById("appShell").style.display = "none";

    if(replace){
        history.replaceState({ screen: "puzzleMap" }, "", "#puzzleMap");
    }else{
        history.pushState({ screen: "puzzleMap" }, "", "#puzzleMap");
    }

    const cachedPool = loadCachedPuzzlePool();
    const cachedState = loadCachedPuzzleUserState();
    const bodyEl = document.getElementById("puzzleMapBody");

    if(cachedPool && cachedPool.length > 0){
        renderPuzzleMap(
            sortPuzzlesChronologically(cachedPool),
            (cachedState && cachedState.solvedIds) || {},
            (cachedState && cachedState.lastSolvedDate) || null
        );
    }else if(bodyEl){
        bodyEl.innerHTML = '<p class="sub">Loading...</p>';
    }

    refreshPuzzleDataInBackground();

}

function closePuzzleMap(){
    history.back();
}

function renderPuzzleMap(sortedPool, solvedIds, lastSolvedDate){

    const bodyEl = document.getElementById("puzzleMapBody");
    if(!bodyEl) return;

    const currentTierIndex = getCurrentTierIndex();
    const totalTiers = KINGDOM_LEVELS.length;
    const totalPuzzlesInGame = totalTiers * PUZZLE_UNLOCKS_PER_TIER;

    let totalSolved = 0;
    Object.keys(solvedIds).forEach(function(){ totalSolved++; });

    const totalSolvedEl = document.getElementById("puzzleMapTotalSolved");
    const totalCountEl = document.getElementById("puzzleMapTotalCount");
    if(totalSolvedEl) totalSolvedEl.textContent = totalSolved;
    if(totalCountEl) totalCountEl.textContent = totalPuzzlesInGame;

    bodyEl.innerHTML = "";

    for(let tierIndex = 0; tierIndex < totalTiers; tierIndex++){

        const kingdom = KINGDOM_LEVELS[tierIndex];
        const tierPuzzles = sortedPool.slice(
            tierIndex * PUZZLE_UNLOCKS_PER_TIER,
            tierIndex * PUZZLE_UNLOCKS_PER_TIER + PUZZLE_UNLOCKS_PER_TIER
        );

        bodyEl.appendChild(buildPuzzleKingdomCard(kingdom, tierIndex, tierPuzzles, solvedIds, currentTierIndex, lastSolvedDate));
    }

    const progressPct = totalPuzzlesInGame > 0 ? Math.min(100, (totalSolved / totalPuzzlesInGame) * 100) : 0;

    const progressCard = document.createElement("div");
    progressCard.style.cssText = "background:#fdecd2; border-radius:16px; padding:16px 18px; display:flex; align-items:center; gap:14px; margin-top:4px;";
    progressCard.innerHTML =
        '<div style="font-size:22px;">🧩</div>' +
        '<div style="flex:1;">' +
            '<div style="display:flex; justify-content:space-between; font-weight:700; color:#1a1a1a; font-size:14px; margin-bottom:6px;">' +
                '<span>Overall Progress</span><span>' + totalSolved + '/' + totalPuzzlesInGame + '</span>' +
            '</div>' +
            '<div style="height:8px; background:rgba(255,122,26,0.2); border-radius:6px; overflow:hidden;">' +
                '<div style="height:100%; width:' + progressPct + '%; background:linear-gradient(90deg,#FF7A1A,#ffb066); border-radius:6px;"></div>' +
            '</div>' +
            '<p style="margin:6px 0 0; color:#8a7050; font-size:12px;">Keep solving to build your kingdom!</p>' +
        '</div>';
    bodyEl.appendChild(progressCard);

}

// Builds one kingdom's card: header (image, name, lock/current badge,
// description, X/20 solved), the 20-tile grid, and either a "Play"
// button (next unsolved puzzle, only if unlocked for today), a
// "come back tomorrow" note, or a "Conquered" banner.
function buildPuzzleKingdomCard(kingdom, tierIndex, tierPuzzles, solvedIds, currentTierIndex, lastSolvedDate){

    const isUnlocked = tierIndex <= currentTierIndex;
    const isCurrent = tierIndex === currentTierIndex;
    const newUnlockedToday = isNewPuzzleUnlockedToday(lastSolvedDate);

    let solvedCount = 0;
    let nextPlayableLocal = -1;

    for(let i = 0; i < PUZZLE_UNLOCKS_PER_TIER; i++){
        const p = tierPuzzles[i];
        const isSolved = !!(p && solvedIds[p.id]);
        if(isSolved) solvedCount++;
        if(isUnlocked && p && nextPlayableLocal === -1 && !isSolved){
            nextPlayableLocal = i;
        }
    }

    const conquered = isUnlocked && solvedCount === PUZZLE_UNLOCKS_PER_TIER;
    const prevKingdom = tierIndex > 0 ? KINGDOM_LEVELS[tierIndex - 1] : null;

    const descText = !isUnlocked
        ? ("Complete " + (prevKingdom ? prevKingdom.name : "the previous kingdom") + " puzzles to unlock this place.")
        : (conquered ? ("You've solved all " + kingdom.name + " puzzles.") : kingdom.description);

    const badgeHtml = !isUnlocked
        ? '<span style="background:#eee; color:#8a8580; font-size:11px; font-weight:700; padding:3px 10px; border-radius:10px; margin-left:8px; white-space:nowrap;">🔒 Locked</span>'
        : (isCurrent ? '<span style="background:#ffe4d6; color:#FF7A1A; font-size:11px; font-weight:700; padding:3px 10px; border-radius:10px; margin-left:8px; white-space:nowrap;">Current</span>' : '');

    const card = document.createElement("div");
    card.style.cssText =
        "position:relative; overflow:hidden; border-radius:20px; margin-bottom:16px; " +
        "box-shadow:0 4px 16px rgba(0,0,0,0.06); " +
        "background-image:url('" + getKingdomImagePath(kingdom.id) + "'); " +
        "background-size:cover; background-position:center;";
    let tilesHtml = "";

    for(let i = 0; i < PUZZLE_UNLOCKS_PER_TIER; i++){

        const p = tierPuzzles[i];
        const num = i + 1;
        const isSolved = !!(p && solvedIds[p.id]);
        const isPlayable = isUnlocked && !!p && (isSolved || (i === nextPlayableLocal && newUnlockedToday));

        let tileBg, tileColor, extra;

        if(!isUnlocked || !p){
            tileBg = "#eeeeee";
            tileColor = "#bbb";
            extra = '<span style="font-size:10px;">🔒</span>';
        }else if(isSolved){
            tileBg = "#fdf0e4";
            tileColor = "#FF7A1A";
            extra = '<span style="color:#22c55e; font-size:12px;">✔</span>';
        }else if(i === nextPlayableLocal){
            if(newUnlockedToday){
                tileBg = "#FF7A1A";
                tileColor = "#fff";
                extra = "";
            }else{
                tileBg = "#f5f5f5";
                tileColor = "#bbb";
                extra = '<span style="font-size:10px;">⏳</span>';
            }
        }else{
            tileBg = "#f5f5f5";
            tileColor = "#bbb";
            extra = "";
        }

        tilesHtml +=
            '<div data-local-idx="' + i + '" class="puzzleMapTile" ' +
                 'style="background:' + tileBg + '; color:' + tileColor + '; ' +
                 'border-radius:12px; height:52px; display:flex; flex-direction:column; align-items:center; justify-content:center; ' +
                 'font-weight:800; font-size:16px; gap:2px; ' + (isPlayable ? "cursor:pointer;" : "cursor:default;") + '">' +
                num + extra +
            '</div>';
    }

    const headerTextShadow = "text-shadow:0 1px 4px rgba(255,255,255,0.9), 0 0 10px rgba(255,255,255,0.7);";

    card.innerHTML =
        '<div class="puzzleMapCardContent" style="position:relative; z-index:2; padding:18px;">' +
            '<div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:14px; gap:10px;">' +
                '<div style="min-width:0;">' +
                    '<div style="display:flex; align-items:center; flex-wrap:wrap;"><span style="font-weight:800; font-size:19px; color:#1a1a1a; ' + headerTextShadow + '">' + escapeHtml(kingdom.name) + '</span>' + badgeHtml + '</div>' +
                    '<p style="color:#3a3530; font-size:13px; margin:4px 0 0; font-weight:600; ' + headerTextShadow + '">' + escapeHtml(descText) + '</p>' +
                '</div>' +
                '<div style="text-align:right; white-space:nowrap;">' +
                    '<div style="font-weight:800; color:#1a1a1a; font-size:14px; ' + headerTextShadow + '">🚩 ' + solvedCount + '/' + PUZZLE_UNLOCKS_PER_TIER + '</div>' +
                    '<div style="color:#3a3530; font-size:10px; font-weight:600; ' + headerTextShadow + '">Puzzles Solved</div>' +
                '</div>' +
            '</div>' +
            '<div style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px;">' + tilesHtml + '</div>' +
        '</div>';

    const contentWrap = card.querySelector(".puzzleMapCardContent");

    card.querySelectorAll(".puzzleMapTile").forEach(function(tileEl){
        const localIdx = Number(tileEl.dataset.localIdx);
        const p = tierPuzzles[localIdx];
        const isSolved = !!(p && solvedIds[p.id]);
        const playable = isUnlocked && !!p && (isSolved || (localIdx === nextPlayableLocal && newUnlockedToday));
        if(playable){
            tileEl.onclick = function(){ playPuzzleObject(p, isSolved); };
        }
    });

    if(conquered){
        const banner = document.createElement("div");
        banner.style.cssText = "margin-top:14px; background:#e6f7ea; border-radius:14px; padding:12px 14px; display:flex; align-items:center; gap:10px;";
        banner.innerHTML =
            '<span style="color:#22c55e; font-size:18px;">✔</span>' +
            '<div><b style="color:#1a1a1a; font-size:14px;">' + escapeHtml(kingdom.name) + ' Conquered!</b>' +
            '<p style="margin:2px 0 0; color:#8a8580; font-size:12px;">You\'ve solved all ' + escapeHtml(kingdom.name) + ' puzzles.</p></div>';
        contentWrap.appendChild(banner);
    }else if(isUnlocked && nextPlayableLocal !== -1 && newUnlockedToday){
        const playBtn = document.createElement("button");
        playBtn.className = "btnPrimary";
        playBtn.style.marginTop = "14px";
        playBtn.textContent = "▶ Play";
        playBtn.onclick = function(){ playPuzzleObject(tierPuzzles[nextPlayableLocal], false); };
        contentWrap.appendChild(playBtn);
    }else if(isUnlocked && nextPlayableLocal !== -1 && !newUnlockedToday){
        const waitNote = document.createElement("div");
        waitNote.style.cssText = "margin-top:14px; background:#fff7ed; border-radius:14px; padding:10px 14px; text-align:center; color:#8a7050; font-size:13px; font-weight:600;";
        waitNote.textContent = "⏳ Come back tomorrow for your next puzzle!";
        contentWrap.appendChild(waitNote);
    }

    return card;
}

// Opens a specific puzzle object (from the map) for play.
// isReplay: true when this puzzle was already solved (so this solve
// won't award rating/streak/history — see loadPuzzleIntoBoard).
function playPuzzleObject(puzzle, isReplay){
    if(!puzzle) return;
    document.getElementById("puzzleMapScreen").style.display = "none";
    document.getElementById("puzzleScreen").style.display = "flex";
    puzzleOpenedFromMap = true;
    history.pushState({ screen: "puzzle" }, "", "#puzzle");
    loadPuzzleIntoBoard(puzzle, isReplay);
}
