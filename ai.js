// ============================================================
// Stockfish integration
//
// Requires these two files in the SAME folder as this one:
//   stockfish-18-lite-single.js
//   stockfish-18-lite-single.wasm
// ============================================================

let stockfish = null;
let stockfishReady = false;
let multiPvMoves = {};
let latestSearchScoreCp = null;

const difficultySettings = {
    easy:   { elo: 1320, movetime: 400,  multipv: 3 },
    medium: { elo: 1600, movetime: 700,  multipv: 1 },
    hard:   { elo: 0,    movetime: 1200, multipv: 1 }
};

// Maps the player's own rating onto Stockfish strength + a candidate-
// move pool size, so the rated quick-match AI feels roughly matched to
// the player and gets more consistent (fewer mistakes) as they improve.
// Used only when ratedAIActive is true (set by startRatedAIMatch() in
// multiplayer.js) — the practice "Play vs AI" mode still uses the fixed
// difficultySettings above, picked by the person themselves.
function getRatedAISettings(rating){
    rating = rating || 100;
    const elo = Math.max(1320, Math.min(2600, 1320 + Math.round(rating * 1.4)));
    const movetime = Math.max(500, Math.min(1300, 500 + rating));
    let multipv;
    if(rating < 200) multipv = 4;
    else if(rating < 600) multipv = 3;
    else if(rating < 1200) multipv = 2;
    else multipv = 1;
    return { elo: elo, movetime: movetime, multipv: multipv };
}

try {

    stockfish = new Worker("stockfish-18-lite-single.js");

    stockfish.onerror = function(err){
        console.error("Stockfish failed to load:", err.message);
        alert("Stockfish worker error: " + err.message);
        stockfish = null;
    };

    setTimeout(function(){
        if(!stockfishReady){
            alert("Stockfish never became ready — it likely failed to load the .wasm file. Check that stockfish-18-lite-single.wasm is uploaded correctly.");
        }
    }, 6000);

    stockfish.onmessage = function(e){

        const line = typeof e.data === "string" ? e.data : "";

        if(line === "uciok"){
            stockfish.postMessage("isready");
            return;
        }

        if(line === "readyok"){
            stockfishReady = true;
            return;
        }

        if(line.indexOf("info") === 0 && line.indexOf(" pv ") !== -1){

            const tokens = line.split(" ");
            const multipvIndex = tokens.indexOf("multipv");
            const pvIndex = tokens.indexOf("pv");

            if(multipvIndex !== -1 && pvIndex !== -1){
                const rank = tokens[multipvIndex + 1];
                const move = tokens[pvIndex + 1];
                if(move){
                    multiPvMoves[rank] = move;
                }
            }

            return;
        }

        if(line.indexOf("info") === 0 && line.indexOf("score") !== -1){
            console.log("[Stockfish]", line);
            const scoreTokens = line.split(" ");
            const scoreIdx = scoreTokens.indexOf("score");
            if(scoreIdx !== -1 && scoreTokens[scoreIdx + 1]){
                if(scoreTokens[scoreIdx + 1] === "cp"){
                    latestSearchScoreCp = parseInt(scoreTokens[scoreIdx + 2], 10);
                }else if(scoreTokens[scoreIdx + 1] === "mate"){
                    const mateIn = parseInt(scoreTokens[scoreIdx + 2], 10);
                    // Treat mate scores as very large centipawn values so the
                    // same commentary thresholds still make sense.
                    latestSearchScoreCp = mateIn >= 0 ? (100000 - mateIn) : (-100000 - mateIn);
                }
            }
        }

        if(line.indexOf("bestmove") === 0){

            const parts = line.split(" ");
            let uciMove = parts[1];

            const settings = (typeof ratedAIActive !== "undefined" && ratedAIActive && typeof ratedAISettings !== "undefined" && ratedAISettings) ? ratedAISettings : (difficultySettings[aiDifficulty] || difficultySettings.medium);

            if(settings.multipv > 1){

                const candidates = [];
                for(let rank = 1; rank <= settings.multipv; rank++){
                    if(multiPvMoves[rank]) candidates.push(multiPvMoves[rank]);
                }

                if(candidates.length > 0){
                    // Weighted pick among the engine's top candidates — this
                    // is what makes the AI human-like: it doesn't always
                    // play its single best line. More candidates (lower
                    // rating opponents) means more frequent slip-ups.
                    const weights = [0.45, 0.25, 0.17, 0.13];
                    const roll = Math.random();
                    let cumulative = 0;
                    let chosenIndex = 0;
                    for(let i = 0; i < candidates.length; i++){
                        cumulative += weights[i] || (0.13 / Math.max(1, candidates.length - 3));
                        chosenIndex = i;
                        if(roll < cumulative) break;
                    }
                    uciMove = candidates[chosenIndex];
                }
            }

            multiPvMoves = {};

            if(typeof isCoachMode !== "undefined" && isCoachMode && typeof latestSearchScoreCp === "number" && typeof giveCoachCommentary === "function"){
                // The search ran with the coach (black) to move, so its score
                // is from black's perspective — flip it to get White's
                // (the player's) perspective, which is what the coach talks about.
                giveCoachCommentary(-latestSearchScoreCp);
            }
            latestSearchScoreCp = null;

            if(uciMove && uciMove !== "(none)"){
                playStockfishMove(uciMove);
            }

        }

    };

    stockfish.postMessage("uci");

} catch(err){
    console.error("Failed to start Stockfish worker:", err.message);
    stockfish = null;
}

function squareToCoords(square){
    const files = "abcdefgh";
    const col = files.indexOf(square[0]);
    const row = 8 - parseInt(square[1], 10);
    return { r: row, c: col };
}

function playStockfishMove(uciMove){

    const from = squareToCoords(uciMove.substring(0, 2));
    const to = squareToCoords(uciMove.substring(2, 4));

    const promotion = uciMove.length > 4 ? uciMove[4] : null;

    setTimeout(function(){
        playAIMove(from.r, from.c, to.r, to.c, promotion);
    }, 300);

}

function boardToFEN(){

    let fen = "";

    for(let r = 0; r < 8; r++){

        let empty = 0;

        for(let c = 0; c < 8; c++){

            const piece = pieces[r][c];

            if(piece === ""){
                empty++;
            }else{

                if(empty > 0){
                    fen += empty;
                    empty = 0;
                }

                const letter = piece[1];
                fen += piece[0] === "w" ? letter : letter.toLowerCase();
            }
        }

        if(empty > 0) fen += empty;
        if(r < 7) fen += "/";
    }

    fen += currentPlayer === "white" ? " w " : " b ";

    let castling = "";
    if(!whiteKingMoved && !whiteRightRookMoved) castling += "K";
    if(!whiteKingMoved && !whiteLeftRookMoved) castling += "Q";
    if(!blackKingMoved && !blackRightRookMoved) castling += "k";
    if(!blackKingMoved && !blackLeftRookMoved) castling += "q";
    if(castling === "") castling = "-";

    const fullMoveNumber = Math.floor(moveHistory.length / 2) + 1;

    fen += castling + " - " + halfMoveClock + " " + fullMoveNumber;

    return fen;
}

function makeAIMove(){

    if(gameOver) return;
    if(currentPlayer !== "black") return;

    // If this is a Clone match and they've actually played this exact
    // position before, use their real historical move instead of
    // Stockfish — no engine call needed for a book hit.
    if(typeof cloneModeActive !== "undefined" && cloneModeActive && typeof getCloneBookMove === "function"){
        const bookMove = getCloneBookMove();
        if(bookMove && typeof playCloneBookMove === "function"){
            const played = playCloneBookMove(bookMove);
            if(played) return;
        }
    }

    if(!stockfish) return;

    // Outside the book, fall back to Stockfish — biased toward the
    // clone's tactical sharpness (more consistently strong = fewer
    // candidate moves considered) when in Clone mode.
    let settings;
    if(typeof cloneModeActive !== "undefined" && cloneModeActive){
        const multipv = cloneTactics >= 70 ? 1 : cloneTactics >= 40 ? 2 : 3;
        settings = { elo: 1600, movetime: 700, multipv: multipv };
    }else{
        settings = (typeof ratedAIActive !== "undefined" && ratedAIActive && typeof ratedAISettings !== "undefined" && ratedAISettings) ? ratedAISettings : (difficultySettings[aiDifficulty] || difficultySettings.medium);
    }
    console.log("[Stockfish] Difficulty:", (typeof ratedAIActive !== "undefined" && ratedAIActive) ? "rated-ai" : aiDifficulty, "Settings:", JSON.stringify(settings));

    multiPvMoves = {};

    if(settings.elo > 0){
        stockfish.postMessage("setoption name UCI_LimitStrength value true");
        stockfish.postMessage("setoption name UCI_Elo value " + settings.elo);
    }else{
        stockfish.postMessage("setoption name UCI_LimitStrength value false");
        stockfish.postMessage("setoption name Skill Level value 20");
    }

    stockfish.postMessage("setoption name MultiPV value " + settings.multipv);
    stockfish.postMessage("position fen " + boardToFEN());
    stockfish.postMessage("go movetime " + settings.movetime);

}
