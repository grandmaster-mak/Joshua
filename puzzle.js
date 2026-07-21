// ============================================================
// Daily Puzzle: rotates through a set of real puzzles by date
// ============================================================

const PUZZLE_POOL = [
    { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", solution: ["a1a8"], description: "White to move. Find the checkmate in one." },
    { fen: "6k1/6pp/8/8/8/8/6PP/4R1K1 w - - 0 1", solution: ["e1e8"], description: "White to move. Deliver checkmate in one." },
    { fen: "r5k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", solution: ["a1a8"], description: "White to move. Trade rooks into a winning endgame — find the check." },
    { fen: "8/8/8/8/8/6k1/6p1/6K1 w - - 0 1", solution: ["g1f2"], description: "White to move. Hold the draw — find the only safe king move." },
    { fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", solution: ["b5c6", "d7c6", "f3e5"], description: "White to move. Win a pawn with a simple tactic." },
    { fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 2 2", solution: ["d1h5"], description: "White to move. Threaten mate on f7." },
    { fen: "4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", solution: ["e1e8"], description: "White to move. Trade into a won king and pawn endgame." },
    { fen: "6k1/pp4pp/8/8/8/8/PP4PP/2R3K1 w - - 0 1", solution: ["c1c8"], description: "White to move. Find the back-rank mate." },
    { fen: "r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1", solution: ["a1a8"], description: "White to move. Win material with a pin along the back rank." },
    { fen: "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1", solution: ["e3d4"], description: "White to move. Escort the pawn home — find the key square." }
];

let currentPuzzle = null;
let puzzleMoveIndex = 0;
let puzzleSolved = false;

function getTodayPuzzleIndex(){
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);
    return dayOfYear % PUZZLE_POOL.length;
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

    const index = getTodayPuzzleIndex();
    currentPuzzle = PUZZLE_POOL[index];
    puzzleMoveIndex = 0;
    puzzleSolved = false;

    pieces = fenToPieces(currentPuzzle.fen);
    currentPlayer = currentPuzzle.fen.split(" ")[1] === "w" ? "white" : "black";
    selected = null;
    possibleMoves = [];

    document.getElementById("puzzleDescription").textContent = currentPuzzle.description;
    document.getElementById("puzzleFeedback").textContent = "";

    document.getElementById("appShell").style.display = "none";
    document.getElementById("puzzleScreen").style.display = "flex";

    createPuzzleBoard();

    history.pushState({ screen: "puzzle" }, "", "#puzzle");

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
        }

    }, 500);

}
