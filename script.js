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
let aiPromotionPiece = null;
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
let whiteFlag = "";
let blackFlag = "";
let whiteRating = null;
let blackRating = null;
let whitePhoto = null;
let blackPhoto = null;

const DEFAULT_AVATAR_SRC = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 70 70'%3E%3Crect width='70' height='70' fill='%231c2028'/%3E%3Ccircle cx='35' cy='27' r='13' fill='%234a5060'/%3E%3Cpath d='M10 62c0-14 11-21 25-21s25 7 25 21' fill='%234a5060'/%3E%3C/svg%3E";
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

const bgMusic = new Audio("sounds/Background.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.4;
let bgMusicStarted = false;

function tryStartBgMusic(){
    if(bgMusicStarted) return;
    bgMusicStarted = true;
    playBgMusic();
}

function playBgMusic(){
    if(!bgMusicStarted) return;
    bgMusic.play().catch(function(){});
}

function stopBgMusic(){
    bgMusic.pause();
}

document.addEventListener("click", tryStartBgMusic, { once: true });
document.addEventListener("touchstart", tryStartBgMusic, { once: true });

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
    history.innerHTML = moveHistory.join(" ");

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
            const winnerColor = currentPlayer === "white" ? "black" : "white";
            const iWon = gameMode === "ai" ? winnerColor === "white" : winnerColor === myColor;
            recordGameResult(iWon ? "win" : "loss", myOpponentName());

        }

    }else if(!hasLegalMoves(currentPlayer)){
        text += " - STALEMATE!";
        showPopup("🤝 DRAW", "Stalemate");
        recordGameResult("draw", myOpponentName());
    }

    document.getElementById("turn").textContent = text;
}

function formatTime(seconds){
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes + ":" + String(secs).padStart(2, "0");
}

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
        ? topIcon + " Unlimited"
        : topIcon + " " + formatTime(topTime);

    document.getElementById("bottomTimer").textContent =
        bottomTime === -1
        ? bottomIcon + " Unlimited"
        : bottomIcon + " " + formatTime(bottomTime);

    updatePlayerNames();
}
function updatePlayerNames(){

    const orientation = getOrientation();

    const topName = orientation.top === "white" ? whitePlayer : blackPlayer;
    const bottomName = orientation.bottom === "white" ? whitePlayer : blackPlayer;

    const topFlag = orientation.top === "white" ? whiteFlag : blackFlag;
    const bottomFlag = orientation.bottom === "white" ? whiteFlag : blackFlag;

    const topRating = orientation.top === "white" ? whiteRating : blackRating;
    const bottomRating = orientation.bottom === "white" ? whiteRating : blackRating;

    const topPhoto = orientation.top === "white" ? whitePhoto : blackPhoto;
    const bottomPhoto = orientation.bottom === "white" ? whitePhoto : blackPhoto;

    document.getElementById("topPlayerName").textContent = (topFlag ? topFlag + " " : "") + topName;
    document.getElementById("bottomPlayerName").textContent = (bottomFlag ? bottomFlag + " " : "") + bottomName;

    const topAvatarImg = document.getElementById("topPlayerAvatarImg");
    const bottomAvatarImg = document.getElementById("bottomPlayerAvatarImg");

    if(topAvatarImg) topAvatarImg.src = topPhoto || DEFAULT_AVATAR_SRC;
    if(bottomAvatarImg) bottomAvatarImg.src = bottomPhoto || DEFAULT_AVATAR_SRC;

    const topRatingEl = document.getElementById("topPlayerRating");
    const bottomRatingEl = document.getElementById("bottomPlayerRating");

    if(topRatingEl){
        if(topRating){
            topRatingEl.textContent = "Rating " + topRating;
            topRatingEl.style.display = "block";
        }else{
            topRatingEl.style.display = "none";
        }
    }

    if(bottomRatingEl){
        if(bottomRating){
            bottomRatingEl.textContent = "Rating " + bottomRating;
            bottomRatingEl.style.display = "block";
        }else{
            bottomRatingEl.style.display = "none";
        }
    }

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
   
