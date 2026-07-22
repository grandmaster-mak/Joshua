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
// ============================================================

let currentPuzzle = null;
let puzzlePool = [];
let puzzleMoveIndex = 0;
let puzzleSolved = false;
let puzzleMistakeMade = false;

function todayDateString(){
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
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

function openDailyPuzzle(){

    currentPuzzle = null;
    puzzleMoveIndex = 0;
    puzzleSolved = false;
    puzzleMistakeMade = false;
    selected = null;
    possibleMoves = [];

    document.getElementById("puzzleDescription").textContent = "Loading today's puzzle...";
    document.getElementById("puzzleFeedback").textContent = "";
    document.getElementById("puzzleBoard").innerHTML = "";

    document.getElementById("appShell").style.display = "none";
    document.getElementById("puzzleScreen").style.display = "flex";

    history.pushState({ screen: "puzzle" }, "", "#puzzle");

    loadPuzzlePool().then(function(pool){

        puzzlePool = pool;

        return loadTodaysPuzzle(pool);

    }).then(function(puzzle){

        currentPuzzle = puzzle;

        pieces = fenToPieces(currentPuzzle.fen);
        currentPlayer = currentPuzzle.fen.split(" ")[1] === "w" ? "white" : "black";

        document.getElementById("puzzleDescription").textContent = currentPuzzle.description;
        updatePuzzleStatsDisplay();
        createPuzzleBoard();

    }).catch(function(err){
        console.error("Failed to open daily puzzle:", err.message);
        const message = (err && err.message === "No puzzles found in Firebase.")
            ? "No puzzles have been added yet — add one under 'puzzles' in Firebase."
            : "Couldn't load today's puzzle — check your connection and try again.";
        document.getElementById("puzzleDescription").textContent = message;
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
}

function clickPuzzleSquare(r, c){

    if(puzzleSolved) return;
    if(!currentPuzzle) return;

    const piece = pieces[r][c];

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
        document.getElementById("puzzleFeedback").textContent = "❌ Not quite — try again!";
        createPuzzleBoard();
        return;
    }

    const movingPiece = pieces[fromR][fromC];
    pieces[r][c] = movingPiece;
    pieces[fromR][fromC] = "";
    puzzleMoveIndex++;

    if(puzzleMoveIndex >= currentPuzzle.solution.length){
        puzzleSolved = true;
        document.getElementById("puzzleFeedback").textContent = "✅ Solved! Well played.";
        createPuzzleBoard();
        recordPuzzleResult();
        return;
    }

    document.getElementById("puzzleFeedback").textContent = "✅ Correct! Keep going...";
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
        createPuzzleBoard();

        if(puzzleMoveIndex >= currentPuzzle.solution.length){
            puzzleSolved = true;
            document.getElementById("puzzleFeedback").textContent = "✅ Solved! Well played.";
            recordPuzzleResult();
        }

    }, 500);

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

        return data;

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
            
