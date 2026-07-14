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

const difficultySettings = {
    easy:   { elo: 1320, movetime: 400,  multipv: 3 },
    medium: { elo: 1600, movetime: 700,  multipv: 1 },
    hard:   { elo: 0,    movetime: 1200, multipv: 1 }
};

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
        }

        if(line.indexOf("bestmove") === 0){

            const parts = line.split(" ");
            let uciMove = parts[1];

            const settings = difficultySettings[aiDifficulty] || difficultySettings.medium;

            if(settings.multipv > 1){

                const candidates = [];
                for(let rank = 1; rank <= settings.multipv; rank++){
                    if(multiPvMoves[rank]) candidates.push(multiPvMoves[rank]);
                }

                if(candidates.length > 0){
                    const roll = Math.random();
                    if(roll < 0.5){
                        uciMove = candidates[0];
                    }else if(roll < 0.8 && candidates[1]){
                        uciMove = candidates[1];
                    }else if(candidates[2]){
                        uciMove = candidates[2];
                    }else{
                        uciMove = candidates[0];
                    }
                }
            }

            multiPvMoves = {};

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
    if(!stockfish) return;

    const settings = difficultySettings[aiDifficulty] || difficultySettings.medium;

    console.log("[Stockfish] Difficulty:", aiDifficulty, "Settings:", JSON.stringify(settings));

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
