const board = document.getElementById("board");

let currentPlayer = "white";
let gameMode = "human";

// Online multiplayer state (used by multiplayer.js)
let myColor = null;
let currentRoomCode = null;
let applyingRemoteMove = false;
let aiDifficulty = "easy";
let selected = null;
let possibleMoves = [];
let lastMove = null;
let animationRunning = false;
let promotionSquare = null;
let promotionColor = null;
let remotePromotionPiece = null;
let pendingOnlinePromotionMove = null;
let moveHistory = [];
let positionHistory = [];
let undoStack = [];
let gameOver = false;
let whiteKingMoved = false;
let blackKingMoved = false;
let whitePlayer = "White";
let blackPlayer = "Black";
let whiteLeftRookMoved = false;
let whiteRightRookMoved = false;
let whiteTime = 600;
let blackTime = 600;
let selectedTime = 600;
let timer = null;
let blackLeftRookMoved = false;
let blackRightRookMoved = false;
let whiteCaptured = [];
let blackCaptured = [];
let halfMoveClock = 0;

let pieces = [
["bR","bN","bB","bQ","bK","bB","bN","bR"],
["bP","bP","bP","bP","bP","bP","bP","bP"],
["","","","","","","",""],
["","","","","","","",""],
["","","","","","","",""],
["","","","","","","",""],
["wP","wP","wP","wP","wP","wP","wP","wP"],
["wR","wN","wB","wQ","wK","wB","wN","wR"]
];

const moveSound = new Audio("sounds/Move.ogg");
const captureSound = new Audio("sounds/Capture.ogg");
const selectSound = new Audio("sounds/Select.ogg");
const checkSound = new Audio("sounds/check.mp3");
const checkmateSound = new Audio("sounds/check mate.mp3");

const pieceValues = {
    P: 100,
    N: 320,
    B: 340,
    R: 500,
    Q: 900,
    K: 20000
};

function createBoard(){

    board.innerHTML = "";

    // In online mode, the player who's Black sees the board flipped —
    // their own pieces at the bottom, just like a real physical board.
    const flipped = (gameMode === "online" && myColor === "black");

    for(let i = 0; i < 8; i++){

        for(let j = 0; j < 8; j++){

            const r = flipped ? 7 - i : i;
            const c = flipped ? 7 - j : j;

            const square = document.createElement("div");

            square.classList.add("square");

            if((r + c) % 2 === 0)
                square.classList.add("light");
            else
                square.classList.add("dark");

            square.dataset.row = r;
            square.dataset.col = c;

            if(selected && selected.r === r && selected.c === c){
                square.classList.add("selected");
            }

            if(
                lastMove &&
                (
                    (lastMove.from.r === r && lastMove.from.c === c) ||
                    (lastMove.to.r === r && lastMove.to.c === c)
                )
            ){
                square.classList.add("lastMove");
            }

            if(pieces[r][c] === "wK" && isKingInCheck("white")){
                square.classList.add("in-check");
            }

            if(pieces[r][c] === "bK" && isKingInCheck("black")){
                square.classList.add("in-check");
            }

            if(possibleMoves.some(move => move.r === r && move.c === c)){
                square.classList.add("possible");
            }

            if(pieces[r][c] !== ""){

                const img = document.createElement("img");
                img.src = "pieces/" + pieces[r][c] + ".svg";
                img.className = "piece";
                square.appendChild(img);

            }

            // Labels sit on the visual bottom row / left column,
            // regardless of whether the board is flipped.
            if(i === 7){
                const file = document.createElement("span");
                file.className = "fileLabel";
                file.textContent = "abcdefgh"[c];
                square.appendChild(file);
            }

            if(j === 0){
                const rank = document.createElement("span");
                rank.className = "rankLabel";
                rank.textContent = 8 - r;
                square.appendChild(rank);
            }

            square.onclick = () => clickSquare(r, c);

            board.appendChild(square);
        }

    }

}

function isWhite(piece){
    return piece.startsWith("w");
}

function isBlack(piece){
    return piece.startsWith("b");
}

// Squares a pawn currently threatens, regardless of what's on them.
// Used for check / attack detection (a pawn attacks its diagonals
// whether or not an enemy piece is actually sitting there).
function getPawnAttackSquares(r, c, piece){

    let squares = [];

    if(piece === "wP"){
        if(r > 0 && c > 0) squares.push({r: r - 1, c: c - 1});
        if(r > 0 && c < 7) squares.push({r: r - 1, c: c + 1});
    }

    if(piece === "bP"){
        if(r < 7 && c > 0) squares.push({r: r + 1, c: c - 1});
        if(r < 7 && c < 7) squares.push({r: r + 1, c: c + 1});
    }

    return squares;
}

function getPawnMoves(r, c, piece){

    let moves = [];

    if(piece === "wP"){

        if(r > 0 && pieces[r-1][c] === "")
            moves.push({r:r-1,c:c});

        if(r === 6 && pieces[r-1][c] === "" && pieces[r-2][c] === ""){
            moves.push({r:r-2,c:c});
        }

        if(r > 0 && c > 0 && isBlack(pieces[r-1][c-1])){
            moves.push({r:r-1,c:c-1});
        }

        if(r > 0 && c < 7 && isBlack(pieces[r-1][c+1])){
            moves.push({r:r-1,c:c+1});
        }
    }

    if(piece === "bP"){

        if(r < 7 && pieces[r+1][c] === "")
            moves.push({r:r+1,c:c});

        if(r === 1 && pieces[r+1][c] === "" && pieces[r+2][c] === ""){
            moves.push({r:r+2,c:c});
        }

        if(r < 7 && c > 0 && isWhite(pieces[r+1][c-1])){
            moves.push({r:r+1,c:c-1});
        }

        if(r < 7 && c < 7 && isWhite(pieces[r+1][c+1])){
            moves.push({r:r+1,c:c+1});
        }
    }

    return moves;
}

function getRookMoves(r, c, piece){

    let moves = [];

    const directions = [
        [-1,0],
        [1,0],
        [0,-1],
        [0,1]
    ];

    for(const [dr, dc] of directions){

        let row = r + dr;
        let col = c + dc;

        while(row >= 0 && row < 8 && col >= 0 && col < 8){

            if(pieces[row][col] === ""){
                moves.push({r:row, c:col});
            }else{

                if(
                    (isWhite(piece) && isBlack(pieces[row][col])) ||
                    (isBlack(piece) && isWhite(pieces[row][col]))
                ){
                    moves.push({r:row, c:col});
                }

                break;
            }

            row += dr;
            col += dc;
        }
    }

    return moves;
}

function getBishopMoves(r, c, piece){

    let moves = [];

    const directions = [
        [-1,-1],
        [-1,1],
        [1,-1],
        [1,1]
    ];

    for(const [dr, dc] of directions){

        let row = r + dr;
        let col = c + dc;

        while(row >= 0 && row < 8 && col >= 0 && col < 8){

            if(pieces[row][col] === ""){
                moves.push({r:row,c:col});
            }else{

                if(
                    (isWhite(piece) && isBlack(pieces[row][col])) ||
                    (isBlack(piece) && isWhite(pieces[row][col]))
                ){
                    moves.push({r:row,c:col});
                }

                break;
            }

            row += dr;
            col += dc;
        }

    }

    return moves;
}

function getQueenMoves(r, c, piece){
    return [
        ...getRookMoves(r, c, piece),
        ...getBishopMoves(r, c, piece)
    ];
}

function getKnightMoves(r, c, piece){

    let moves = [];

    const knightMoves = [
        [-2,-1], [-2,1],
        [-1,-2], [-1,2],
        [1,-2], [1,2],
        [2,-1], [2,1]
    ];

    for(const [dr, dc] of knightMoves){
        let row = r + dr;
        let col = c + dc;
        if(row >= 0 && row < 8 && col >= 0 && col < 8){
            if(
                pieces[row][col] === "" ||
                (isWhite(piece) && isBlack(pieces[row][col])) ||
                (isBlack(piece) && isWhite(pieces[row][col]))
            ){
                moves.push({r:row,c:col});
            }
        }
    }

    return moves;
}

function getKingMoves(r, c, piece){

    let moves = [];

    const directions = [
        [-1,-1], [-1,0], [-1,1],
        [0,-1],           [0,1],
        [1,-1],  [1,0],   [1,1]
    ];

    for(const [dr, dc] of directions){

        let row = r + dr;
        let col = c + dc;

        if(row >= 0 && row < 8 && col >= 0 && col < 8){

            if(
                pieces[row][col] === "" ||
                (isWhite(piece) && isBlack(pieces[row][col])) ||
                (isBlack(piece) && isWhite(pieces[row][col]))
            ){
                moves.push({r:row,c:col});
            }

        }

    }

    if(
        piece === "wK" &&
        !whiteKingMoved &&
        !whiteRightRookMoved &&
        canCastle(7,4,7,"black")
    ){
        moves.push({r:7,c:6});
    }

    if(
        piece === "wK" &&
        !whiteKingMoved &&
        !whiteLeftRookMoved &&
        canCastle(7,4,0,"black")
    ){
        moves.push({r:7,c:2});
    }

    if(
        piece === "bK" &&
        !blackKingMoved &&
        !blackRightRookMoved &&
        canCastle(0,4,7,"white")
    ){
        moves.push({r:0,c:6});
    }

    if(
        piece === "bK" &&
        !blackKingMoved &&
        !blackLeftRookMoved &&
        canCastle(0,4,0,"white")
    ){
        moves.push({r:0,c:2});
    }

    return moves;
}

function isPossibleMove(r, c){
    return possibleMoves.some(move => move.r === r && move.c === c);
}

function getPossibleMoves(piece, r, c){

    if(piece === "wP" || piece === "bP")
        return getPawnMoves(r, c, piece);

    if(piece === "wR" || piece === "bR")
        return getRookMoves(r, c, piece);

    if(piece === "wB" || piece === "bB")
        return getBishopMoves(r, c, piece);

    if(piece === "wQ" || piece === "bQ")
        return getQueenMoves(r, c, piece);

    if(piece === "wN" || piece === "bN")
        return getKnightMoves(r, c, piece);

    if(piece === "wK" || piece === "bK")
        return getKingMoves(r, c, piece);

    return [];

}

// Legal moves only: filters out anything that would leave your own king in check.
function getLegalMoves(piece, r, c){

    const color = isWhite(piece) ? "white" : "black";
    const moves = getPossibleMoves(piece, r, c);

    return moves.filter(move => tryMove(r, c, move.r, move.c, color));
}

function findKing(color){

    const king = color === "white" ? "wK" : "bK";

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            if(pieces[r][c] === king){
                return {r, c};
            }
        }
    }

    return null;
}

function isSquareUnderAttack(row, col, attackerColor){

    for(let r = 0; r < 8; r++){

        for(let c = 0; c < 8; c++){

            const piece = pieces[r][c];

            if(piece === "") continue;

            if(attackerColor === "white" && !isWhite(piece)) continue;
            if(attackerColor === "black" && !isBlack(piece)) continue;

            let squares;

            if(piece === "wK" || piece === "bK"){

                squares = [];

                const directions = [
                    [-1,-1],[-1,0],[-1,1],
                    [0,-1],[0,1],
                    [1,-1],[1,0],[1,1]
                ];

                for(const [dr,dc] of directions){
                    let nr = r + dr;
                    let nc = c + dc;
                    if(nr>=0 && nr<8 && nc>=0 && nc<8){
                        squares.push({r:nr,c:nc});
                    }
                }

            }else if(piece === "wP" || piece === "bP"){

                squares = getPawnAttackSquares(r, c, piece);

            }else{

                squares = getPossibleMoves(piece, r, c);

            }

            if(squares.some(sq => sq.r === row && sq.c === col)){
                return true;
            }

        }

    }

    return false;

}

function isKingInCheck(color){

    const king = findKing(color);

    if(!king) return false;

    const enemy = color === "white" ? "black" : "white";

    return isSquareUnderAttack(king.r, king.c, enemy);

}

function canCastle(row, kingCol, rookCol, attackerColor){

    const rook = row === 7 ? "wR" : "bR";

    if(pieces[row][rookCol] !== rook)
        return false;

    let step = rookCol > kingCol ? 1 : -1;

    for(let c = kingCol + step; c != rookCol; c += step){
        if(pieces[row][c] !== "")
            return false;
    }

    for(let c = kingCol; c != kingCol + step * 3; c += step){
        if(isSquareUnderAttack(row, c, attackerColor))
            return false;
    }

    return true;

}

function tryMove(fromR, fromC, toR, toC, color){

    const movingPiece = pieces[fromR][fromC];
    const capturedPiece = pieces[toR][toC];

    pieces[toR][toC] = movingPiece;
    pieces[fromR][fromC] = "";

    const illegal = isKingInCheck(color);

    pieces[fromR][fromC] = movingPiece;
    pieces[toR][toC] = capturedPiece;

    return !illegal;
}

function hasLegalMoves(color){

    for(let r = 0; r < 8; r++){

        for(let c = 0; c < 8; c++){

            const piece = pieces[r][c];

            if(piece === "") continue;
            if(color === "white" && !isWhite(piece)) continue;
            if(color === "black" && !isBlack(piece)) continue;

            const moves = getPossibleMoves(piece, r, c);

            for(const move of moves){
                if(tryMove(r, c, move.r, move.c, color)){
                    return true;
                }
            }

        }

    }

    return false;
}

function squareName(r, c){
    const files = ["a","b","c","d","e","f","g","h"];
    return files[c] + (8 - r);
}

function getPositionKey(){
    return JSON.stringify({
        pieces: pieces,
        currentPlayer: currentPlayer
    });
}

function getMoveNotation(piece, fromR, fromC, toR, toC, isCapture){

    const files = ["a","b","c","d","e","f","g","h"];
    const destination = squareName(toR, toC);

    if(piece[1] === "P"){
        if(isCapture){
            return files[fromC] + "x" + destination;
        }
        return destination;
    }

    return piece[1] + (isCapture ? "x" : "") + destination;
}

function updateHistory(){

    const history = document.getElementById("history");
    history.innerHTML = "";

    for(let i = 0; i < moveHistory.length; i += 2){

        const row = document.createElement("div");
        row.className = "historyRow";

        const number = document.createElement("span");
        number.className = "moveNumber";
        number.textContent = (i / 2 + 1) + ".";

        const whiteMove = document.createElement("span");
        whiteMove.className = "whiteMove";
        whiteMove.textContent = moveHistory[i] || "";

        const blackMove = document.createElement("span");
        blackMove.className = "blackMove";
        blackMove.textContent = moveHistory[i + 1] || "";

        row.appendChild(number);
        row.appendChild(whiteMove);
        row.appendChild(blackMove);

        history.appendChild(row);
    }

}

function updateTurn(){

    let text = (currentPlayer === "white" ? whitePlayer : blackPlayer) + " to Move";

    if(gameMode === "ai" && currentPlayer === "black" && !gameOver){
        text = "🤖 AI is thinking...";
    }

    if(isKingInCheck(currentPlayer)){

        if(hasLegalMoves(currentPlayer)){

            text += " - CHECK!";

            checkSound.currentTime = 0;
            checkSound.play();

        }else{

            text += " - CHECKMATE!";

            checkmateSound.currentTime = 0;
            checkmateSound.play();

            const winner = currentPlayer === "white" ? "Black" : "White";

            showPopup("🏆 CHECKMATE!", winner + " Wins!");
        }

    }else if(!hasLegalMoves(currentPlayer)){
        text += " - STALEMATE!";
        showPopup("🤝 DRAW", "Stalemate");
    }

    document.getElementById("turn").textContent = text;
}

function formatTime(seconds){
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes + ":" + String(secs).padStart(2, "0");
}

// Which color's info shows in the top box vs the bottom box.
// Default: Black on top, White on bottom (matches the default
// un-flipped board). If you're playing Black online, your own board
// is flipped, so your info moves to the bottom to match.
function getOrientation(){

    if(gameMode === "online" && myColor === "black"){
        return { top: "white", bottom: "black" };
    }

    return { top: "black", bottom: "white" };
}

function updateTimers(){

    const orientation = getOrientation();

    const topTime = orientation.top === "white" ? whiteTime : blackTime;
    const bottomTime = orientation.bottom === "white" ? whiteTime : blackTime;

    const topIcon = orientation.top === "white" ? "⚪" : "⚫";
    const bottomIcon = orientation.bottom === "white" ? "⚪" : "⚫";

    const topLabel = orientation.top === "white" ? whitePlayer : blackPlayer;
    const bottomLabel = orientation.bottom === "white" ? whitePlayer : blackPlayer;

    document.getElementById("topTimer").textContent =
        topTime === -1
        ? topIcon + " " + topLabel + ": Unlimited"
        : topIcon + " " + topLabel + ": " + formatTime(topTime);

    document.getElementById("bottomTimer").textContent =
        bottomTime === -1
        ? bottomIcon + " " + bottomLabel + ": Unlimited"
        : bottomIcon + " " + bottomLabel + ": " + formatTime(bottomTime);
}

function startTimer(){

    clearInterval(timer);

    if(whiteTime === -1 && blackTime === -1){
        updateTimers();
        return;
    }

    timer = setInterval(function(){

        if(gameOver){
            clearInterval(timer);
            return;
        }

        if(currentPlayer === "white"){
            whiteTime--;
        }else{
            blackTime--;
        }

        updateTimers();

        if(whiteTime <= 0){
            clearInterval(timer);
            gameOver = true;
            showPopup("⏰ TIME!", "Black wins on time!");
        }

        if(blackTime <= 0){
            clearInterval(timer);
            gameOver = true;
            showPopup("⏰ TIME!", "White wins on time!");
        }

    },1000);

}

function saveUndoState(){

    undoStack.push({
        pieces: JSON.parse(JSON.stringify(pieces)),
        currentPlayer,
        whiteKingMoved,
        blackKingMoved,
        whiteLeftRookMoved,
        whiteRightRookMoved,
        blackLeftRookMoved,
        blackRightRookMoved,
        whiteCaptured: [...whiteCaptured],
        blackCaptured: [...blackCaptured],
        moveHistory: [...moveHistory],
        gameOver
    });

}

function clickSquare(r, c){

    if(gameMode === "ai" && currentPlayer === "black"){
        return;
    }

    if(gameMode === "online" && currentPlayer !== myColor){
        return;
    }

    if(animationRunning) return;
    if(gameOver) return;
    if(promotionSquare) return;

    const piece = pieces[r][c];

    if(selected == null){

        if(piece === "") return;
        if(currentPlayer === "white" && !isWhite(piece)) return;
        if(currentPlayer === "black" && !isBlack(piece)) return;

        selected = {r,c};
        selectSound.currentTime = 0;
        selectSound.play();

        possibleMoves = getLegalMoves(piece, r, c);

        createBoard();

    }else{

        if(!isPossibleMove(r,c)){

            // Clicking another one of your own pieces re-selects instead of deselecting.
            if(piece !== "" &&
               ((currentPlayer === "white" && isWhite(piece)) ||
                (currentPlayer === "black" && isBlack(piece)))
            ){
                selected = {r,c};
                selectSound.currentTime = 0;
                selectSound.play();
                possibleMoves = getLegalMoves(piece, r, c);
                createBoard();
                return;
            }

            selected = null;
            possibleMoves = [];
            createBoard();
            return;
        }

        const fromR = selected.r;
        const fromC = selected.c;

        executeMove(fromR, fromC, r, c, false);
    }

}

// Plays a move directly on the board, with no selection step and no
// green highlight — used for the AI's moves, since the human should
// never see the highlight flash for a move that isn't theirs.
function playAIMove(fromR, fromC, toR, toC){

    if(gameOver) return;
    if(promotionSquare) return;

    executeMove(fromR, fromC, toR, toC, true);
}

// Shared move-execution logic for both a human's confirmed click and
// the AI's chosen move. Slides the piece(s) visually first, then
// applies the real game-logic update once the slide finishes.
function executeMove(fromR, fromC, r, c, isAIMove){

    const movedPiece = pieces[fromR][fromC];
    const isCastle = (movedPiece === "wK" || movedPiece === "bK") && Math.abs(c - fromC) === 2;
    const isPromotionMove = (movedPiece === "wP" && r === 0) || (movedPiece === "bP" && r === 7);

    if(gameMode === "online" && !applyingRemoteMove && !isPromotionMove && typeof sendMoveToFirebase === "function"){
        sendMoveToFirebase(fromR, fromC, r, c, null);
    }

    const finish = function(){
        completeMove(fromR, fromC, r, c, isAIMove);
    };

    if(isCastle){

        const kingsideCastle = c > fromC;
        const rookFromC = kingsideCastle ? 7 : 0;
        const rookToC = kingsideCastle ? 5 : 3;

        animateCastleSlide(fromR, fromC, r, c, fromR, rookFromC, r, rookToC, finish);

    }else{

        animatePieceSlide(fromR, fromC, r, c, finish);

    }

}

// Low-level: slides a single piece image from one square to another
// using a CSS transform, without touching any game state. Returns
// false if there was nothing to animate (so callers can skip straight
// to finishing the move instead of waiting on a non-existent animation).
function slidePieceVisual(fromR, fromC, toR, toC){

    // createBoard() renders in visual order, not raw r/c order, when
    // the board is flipped — so the DOM child index for a given square
    // has to be computed the same way createBoard() placed it, or this
    // grabs the wrong square entirely (causing a phantom animation on
    // an unrelated square before the real board redraw "corrects" it).
    const flipped = (gameMode === "online" && myColor === "black");

    function domIndex(r, c){
        if(flipped){
            return (7 - r) * 8 + (7 - c);
        }
        return r * 8 + c;
    }

    const squares = board.children;
    const fromSquare = squares[domIndex(fromR, fromC)];
    const toSquare = squares[domIndex(toR, toC)];

    if(!fromSquare || !toSquare) return false;

    const pieceImg = fromSquare.querySelector(".piece");
    if(!pieceImg) return false;

    const fromRect = fromSquare.getBoundingClientRect();
    const toRect = toSquare.getBoundingClientRect();

    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;

    pieceImg.style.position = "relative";
    pieceImg.style.zIndex = "10";
    pieceImg.style.transition = "transform 0.22s ease";

    // Force layout so the browser registers the starting position
    // before we animate to the new one.
    void pieceImg.offsetWidth;

    pieceImg.style.transform = "translate(" + dx + "px, " + dy + "px)";

    return true;
}

// Animates a single piece move (the normal case).
function animatePieceSlide(fromR, fromC, toR, toC, callback){

    const moved = slidePieceVisual(fromR, fromC, toR, toC);

    if(!moved){
        callback();
        return;
    }

    animationRunning = true;

    setTimeout(function(){
        animationRunning = false;
        callback();
    }, 220);

}

// Animates castling: the king and the rook slide to their new squares
// at the same time.
function animateCastleSlide(kingFromR, kingFromC, kingToR, kingToC, rookFromR, rookFromC, rookToR, rookToC, callback){

    const kingMoved = slidePieceVisual(kingFromR, kingFromC, kingToR, kingToC);
    slidePieceVisual(rookFromR, rookFromC, rookToR, rookToC);

    if(!kingMoved){
        callback();
        return;
    }

    animationRunning = true;

    setTimeout(function(){
        animationRunning = false;
        callback();
    }, 220);

}

function completeMove(fromR, fromC, r, c, isAIMove){

    const movedPiece = pieces[fromR][fromC];
    const capturedPiece = pieces[r][c];
    const isCapture = capturedPiece !== "";

    saveUndoState();

    pieces[r][c] = movedPiece;
    pieces[fromR][fromC] = "";

    lastMove = {
        from: {r: fromR, c: fromC},
        to: {r, c}
    };

    if(isCapture){
        captureSound.currentTime = 0;
        captureSound.play();

        if(isWhite(capturedPiece)){
            blackCaptured.push(capturedPiece);
        }else{
            whiteCaptured.push(capturedPiece);
        }
    }else{
        moveSound.currentTime = 0;
        moveSound.play();
    }

    if(movedPiece.endsWith("P") || isCapture){
        halfMoveClock = 0;
    }else{
        halfMoveClock++;
    }

    moveHistory.push(
        getMoveNotation(movedPiece, fromR, fromC, r, c, isCapture)
    );
    updateHistory();

    // Castling rook movement
    if(movedPiece === "wK" && fromC === 4 && c === 6){
        pieces[7][5] = pieces[7][7];
        pieces[7][7] = "";
    }
    if(movedPiece === "wK" && fromC === 4 && c === 2){
        pieces[7][3] = pieces[7][0];
        pieces[7][0] = "";
    }
    if(movedPiece === "bK" && fromC === 4 && c === 6){
        pieces[0][5] = pieces[0][7];
        pieces[0][7] = "";
    }
    if(movedPiece === "bK" && fromC === 4 && c === 2){
        pieces[0][3] = pieces[0][0];
        pieces[0][0] = "";
    }

    if(movedPiece === "wK") whiteKingMoved = true;
    if(movedPiece === "bK") blackKingMoved = true;

    if(movedPiece === "wR"){
        if(fromR === 7 && fromC === 0) whiteLeftRookMoved = true;
        if(fromR === 7 && fromC === 7) whiteRightRookMoved = true;
    }

    if(movedPiece === "bR"){
        if(fromR === 0 && fromC === 0) blackLeftRookMoved = true;
        if(fromR === 0 && fromC === 7) blackRightRookMoved = true;
    }

    selected = null;
    possibleMoves = [];

    updateCaptured();

    // Promotion check
    if(movedPiece === "wP" && r === 0){

        if(isAIMove){
            pieces[r][c] = "wQ";
            finishTurn();
        }else if(gameMode === "online" && applyingRemoteMove){
            pieces[r][c] = "w" + (remotePromotionPiece || "Q");
            remotePromotionPiece = null;
            finishTurn();
        }else{
            promotionSquare = {r, c};
            promotionColor = "w";
            pendingOnlinePromotionMove = (gameMode === "online") ? {fromR, fromC, toR:r, toC:c} : null;
            createBoard();
            showPromotion("w");
        }

        return;
    }

    if(movedPiece === "bP" && r === 7){

        if(isAIMove){
            pieces[r][c] = "bQ";
            finishTurn();
        }else if(gameMode === "online" && applyingRemoteMove){
            pieces[r][c] = "b" + (remotePromotionPiece || "Q");
            remotePromotionPiece = null;
            finishTurn();
        }else{
            promotionSquare = {r, c};
            promotionColor = "b";
            pendingOnlinePromotionMove = (gameMode === "online") ? {fromR, fromC, toR:r, toC:c} : null;
            createBoard();
            showPromotion("b");
        }

        return;
    }

    finishTurn();
}

function choosePromotion(letter){

    if(!promotionSquare) return;

    const r = promotionSquare.r;
    const c = promotionSquare.c;

    pieces[r][c] = promotionColor + letter;

    promotionSquare = null;
    promotionColor = null;

    closePromotion();
    finishTurn();
}

function finishTurn(){

    positionHistory.push(getPositionKey());

    if(isThreefoldRepetition()){
        gameOver = true;
        createBoard();
        showPopup("🤝 DRAW", "Threefold Repetition");
        return;
    }

    if(hasInsufficientMaterial()){
        gameOver = true;
        createBoard();
        showPopup("🤝 DRAW", "Insufficient Material");
        return;
    }

    if(halfMoveClock >= 100){
        gameOver = true;
        createBoard();
        showPopup("🤝 DRAW", "50-Move Rule");
        return;
    }

    currentPlayer = currentPlayer === "white" ? "black" : "white";

    if(!hasLegalMoves(currentPlayer)){
        gameOver = true;
    }

    updateTurn();
    createBoard();

    if(gameMode === "ai" && currentPlayer === "black" && !gameOver){
        setTimeout(makeAIMove, 400);
    }
}

function updateCaptured(){

    const orientation = getOrientation();

    const topBox = document.getElementById("topCaptured");
    const bottomBox = document.getElementById("bottomCaptured");

    const topList = orientation.top === "white" ? whiteCaptured : blackCaptured;
    const bottomList = orientation.bottom === "white" ? whiteCaptured : blackCaptured;

    topBox.innerHTML = "";
    bottomBox.innerHTML = "";

    topList.forEach(piece => {
        topBox.innerHTML += '<img src="pieces/' + piece + '.svg" class="capturedPiece">';
    });

    bottomList.forEach(piece => {
        bottomBox.innerHTML += '<img src="pieces/' + piece + '.svg" class="capturedPiece">';
    });

}

function showTimeControl(){
    updateGameMode();
    document.getElementById("timeControlPopup").classList.add("show");
}

function closeTimeControl(){
    document.getElementById("timeControlPopup").classList.remove("show");
}

function updateGameMode(){

    const mode = document.getElementById("gameMode").value;

    document.getElementById("difficultyBox").style.display = mode === "ai" ? "block" : "none";
    document.getElementById("onlineBox").style.display = mode === "online" ? "block" : "none";

    // Online mode is driven by the Create/Join buttons instead of
    // "Start Game", and doesn't use a synced time control yet.
    document.getElementById("timeControlSection").style.display = mode === "online" ? "none" : "block";
    document.getElementById("startGameBtn").style.display = mode === "online" ? "none" : "block";

    document.getElementById("roomCodeDisplay").textContent = "";
    document.getElementById("onlineStatus").textContent = "";
}

function startNewGame(){

    selectedTime = Number(document.getElementById("timeControl").value);
    gameMode = document.getElementById("gameMode").value;
    aiDifficulty = document.getElementById("aiDifficulty").value;

    closeTimeControl();
    newGame();
}

function newGame(){

    pieces = [
        ["bR","bN","bB","bQ","bK","bB","bN","bR"],
        ["bP","bP","bP","bP","bP","bP","bP","bP"],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["","","","","","","",""],
        ["wP","wP","wP","wP","wP","wP","wP","wP"],
        ["wR","wN","wB","wQ","wK","wB","wN","wR"]
    ];

    moveHistory = [];
    updateHistory();
    undoStack = [];

    currentPlayer = "white";
    selected = null;
    possibleMoves = [];
    gameOver = false;
    halfMoveClock = 0;
    lastMove = null;
    promotionSquare = null;
    promotionColor = null;

    whiteKingMoved = false;
    blackKingMoved = false;
    whiteLeftRookMoved = false;
    whiteRightRookMoved = false;
    blackLeftRookMoved = false;
    blackRightRookMoved = false;

    whiteCaptured = [];
    blackCaptured = [];

    if(selectedTime === -1){
        whiteTime = -1;
        blackTime = -1;
    }else{
        whiteTime = selectedTime;
        blackTime = selectedTime;
    }

    updateTimers();
    startTimer();
    updateCaptured();
    updateTurn();

    positionHistory = [getPositionKey()];
    createBoard();
    if(gameMode === "online") return;
}

function createCoordinates(){

    const files = document.getElementById("filesTop");
    const ranks = document.getElementById("ranksLeft");

    files.innerHTML = "";
    ranks.innerHTML = "";

    ["a","b","c","d","e","f","g","h"].forEach(letter => {
        const div = document.createElement("div");
        div.textContent = letter;
        files.appendChild(div);
    });

    for(let i = 8; i >= 1; i--){
        const div = document.createElement("div");
        div.textContent = i;
        ranks.appendChild(div);
    }

}

function showPopup(title, message){
    document.getElementById("popupTitle").textContent = title;
    document.getElementById("popupMessage").textContent = message;
    document.getElementById("gameOverPopup").classList.add("show");
}

function closePopup(){
    document.getElementById("gameOverPopup").classList.remove("show");
}

function showPromotion(color){

    document.getElementById("promoteQ").src = "pieces/" + color + "Q.svg";
    document.getElementById("promoteR").src = "pieces/" + color + "R.svg";
    document.getElementById("promoteB").src = "pieces/" + color + "B.svg";
    document.getElementById("promoteN").src = "pieces/" + color + "N.svg";

    document.getElementById("promotionPopup").classList.add("show");
}

function closePromotion(){
    document.getElementById("promotionPopup").classList.remove("show");
}

function undoMove(){
    if(gameMode === "online") return;

    if(gameOver) return;

    // In AI mode, undo both the AI's move and your own in one press.
    if(gameMode === "ai" && undoStack.length >= 2){
        undoStack.pop();
    }

    if(undoStack.length === 0) return;

    const last = undoStack.pop();

    pieces = last.pieces;
    currentPlayer = last.currentPlayer;

    whiteKingMoved = last.whiteKingMoved;
    blackKingMoved = last.blackKingMoved;
    whiteLeftRookMoved = last.whiteLeftRookMoved;
    whiteRightRookMoved = last.whiteRightRookMoved;
    blackLeftRookMoved = last.blackLeftRookMoved;
    blackRightRookMoved = last.blackRightRookMoved;

    whiteCaptured = last.whiteCaptured;
    blackCaptured = last.blackCaptured;
    moveHistory = last.moveHistory;
    gameOver = last.gameOver;

    if(positionHistory.length > 0) positionHistory.pop();

    updateHistory();
    updateCaptured();
    updateTurn();

    selected = null;
    possibleMoves = [];
    lastMove = null;
    promotionSquare = null;
    promotionColor = null;

    createBoard();
}

function hasInsufficientMaterial(){

    let whitePieces = [];
    let blackPieces = [];

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const piece = pieces[r][c];
            if(piece === "") continue;
            if(isWhite(piece)){
                whitePieces.push(piece);
            }else{
                blackPieces.push(piece);
            }
        }
    }

    if(whitePieces.length === 1 && blackPieces.length === 1){
        return true;
    }

    if(whitePieces.length === 2 && blackPieces.length === 1){
        if(whitePieces.includes("wB") || whitePieces.includes("wN")){
            return true;
        }
    }

    if(blackPieces.length === 2 && whitePieces.length === 1){
        if(blackPieces.includes("bB") || blackPieces.includes("bN")){
            return true;
        }
    }

    return false;
}

function isThreefoldRepetition(){

    const current = getPositionKey();
    let count = 0;

    for(const position of positionHistory){
        if(position === current){
            count++;
        }
    }

    return count >= 3;
}

function getAllMoves(color){

    let allMoves = [];

    for(let r = 0; r < 8; r++){

        for(let c = 0; c < 8; c++){

            let piece = pieces[r][c];

            if(piece === "") continue;
            if(color === "white" && !isWhite(piece)) continue;
            if(color === "black" && !isBlack(piece)) continue;

            let moves = getPossibleMoves(piece, r, c);

            moves.sort((a, b) => {
                const valueA = pieces[a.r][a.c] === "" ? 0 : pieceValues[pieces[a.r][a.c][1]];
                const valueB = pieces[b.r][b.c] === "" ? 0 : pieceValues[pieces[b.r][b.c][1]];
                return valueB - valueA;
            });

            for(let move of moves){
                if(tryMove(r,c,move.r,move.c,color)){
                    allMoves.push({
                        from: {r:r, c:c},
                        to: {r:move.r, c:move.c}
                    });
                }
            }

        }

    }

    return allMoves;
}

createCoordinates();
showTimeControl();
createBoard();
