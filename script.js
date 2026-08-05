// Give the page a JS-tracked history entry from the moment it loads, so
// the phone's physical back button always has something of ours to pop
// first — otherwise, sitting on Home with nothing opened yet, there's
// no history entry at all, and back exits the page immediately.
history.replaceState({ screen: null }, "", location.href);
history.pushState({ screen: null }, "", location.href);

const board = document.getElementById("board");

let currentPlayer = "white";
let gameMode = "human";
let isCoachMode = false;

// Tracks which bottom-nav tab (home/friends/account) was last active.
// The tab buttons don't push browser-history entries when tapped, so
// when a full-screen panel (Tournaments, Puzzles, Profile, etc.) is
// closed via the back button, the "previous" history state is often
// null — this is what popstate falls back to instead of hardcoding
// "home", so back correctly returns to whichever tab you actually came
// from instead of flashing there and then jumping to Home a moment later.
let lastActiveTab = "home";

// Set by multiplayer.js's startRatedAIMatch() when Play Online falls
// back to a rated AI opponent after no human match is found in time.
// Affects rating changes, chat button visibility, undo availability,
// and the restart-confirmation flow — everywhere a real online game
// already behaves specially, a rated AI match now behaves the same way.
let lastGameResult = null;
let ratedAIActive = false;
let ratedAISettings = null;

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

// Online opponent metadata (populated by multiplayer.js listenForPlayerInfo)
let whiteRating = null;
let blackRating = null;
let whitePhoto = null;
let blackPhoto = null;
let whiteUid = null;
let blackUid = null;

const DEFAULT_AVATAR_SRC = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 70 70'%3E%3Crect width='70' height='70' fill='%231c2028'/%3E%3Ccircle cx='35' cy='27' r='13' fill='%234a5060'/%3E%3Cpath d='M10 62c0-14 11-21 25-21s25 7 25 21' fill='%234a5060'/%3E%3C/svg%3E";
const MAN_AVATAR_SRC = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 70 70'%3E%3Ctext x='35' y='55' font-size='62' text-anchor='middle'%3E🤵%3C/text%3E%3C/svg%3E";

// ===== KINGDOM SYSTEM =====
const KINGDOM_LEVELS = [
  { id: 'village', name: 'Village', emoji: '🏕️', requiredStreak: 0, visualLevel: 1, description: 'A modest settlement' },
  { id: 'town', name: 'Town', emoji: '🏘️', requiredStreak: 3, visualLevel: 2, description: 'A growing community' },
  { id: 'fortress', name: 'Fortress', emoji: '🏰', requiredStreak: 5, visualLevel: 3, description: 'Protected by strong walls' },
  { id: 'city', name: 'City', emoji: '🏯', requiredStreak: 7, visualLevel: 4, description: 'A prosperous civilization' },
  { id: 'kingdom', name: 'Kingdom', emoji: '👑', requiredStreak: 8, visualLevel: 5, description: 'A royal realm' },
  { id: 'grand-kingdom', name: 'Grand Kingdom', emoji: '⚜️', requiredStreak: 9, visualLevel: 6, description: 'A grand and powerful realm' },
  { id: 'dominion', name: 'Dominion', emoji: '🦁', requiredStreak: 10, visualLevel: 7, description: 'A vast territory' },
  { id: 'empire', name: 'Empire', emoji: '🌎', requiredStreak: 12, visualLevel: 8, description: 'The greatest realm of all' }
];

let kingdomState = {
  currentLevel: 'village',
  consecutiveWins: 0,
  totalWins: 0
};

function getKingdomByStreak(streak) {
  let kingdom = KINGDOM_LEVELS[0];
  for (let i = KINGDOM_LEVELS.length - 1; i >= 0; i--) {
    if (streak >= KINGDOM_LEVELS[i].requiredStreak) {
      kingdom = KINGDOM_LEVELS[i];
      break;
    }
  }
  return kingdom;
}

function getNextKingdom(currentKingdom) {
  const currentIndex = KINGDOM_LEVELS.findIndex(k => k.id === currentKingdom.id);
  if (currentIndex < KINGDOM_LEVELS.length - 1) {
    return KINGDOM_LEVELS[currentIndex + 1];
  }
  return null;
}

function getProgressToNext(currentStreak, nextKingdom) {
  if (!nextKingdom) return 100;
  const currentKingdom = getKingdomByStreak(currentStreak);
  const currentRequired = currentKingdom.requiredStreak;
  const nextRequired = nextKingdom.requiredStreak;
  const progress = ((currentStreak - currentRequired) / (nextRequired - currentRequired)) * 100;
  return Math.min(Math.max(progress, 0), 100);
}
// ===== END KINGDOM SYSTEM =====

// Reads coach/lesson text out loud using the browser's built-in
// text-to-speech (no external API or key needed). Strips emoji first
// since screen readers/TTS engines otherwise try to announce them
// ("grinning face emoji") which sounds broken.
let cachedMaleVoice = null;
let maleVoiceSearched = false;

function findMaleVoice(){
    const voices = window.speechSynthesis.getVoices();
    if(!voices || voices.length === 0) return null;

    // Prefer a voice explicitly named "male" (and not also "female").
    let match = voices.find(function(v){ return /male/i.test(v.name) && !/female/i.test(v.name); });
    if(match) return match;

    // Fallback: common male voice names across Android/Chrome/Windows TTS engines.
    const maleNames = ["david", "mark", "james", "daniel", "alex", "fred", "george", "guy", "thomas", "arthur"];
    match = voices.find(function(v){
        const name = v.name.toLowerCase();
        return maleNames.some(function(n){ return name.indexOf(n) !== -1; });
    });
    return match || null;
}

function speakText(text){
    if(!text) return;
    if(!("speechSynthesis" in window)) return;
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu, "").trim();
    if(!clean) return;

    window.speechSynthesis.cancel(); // don't let lines queue up/overlap

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.15; // a bit faster than normal speaking pace
    utterance.pitch = 0.75; // lower pitch as a fallback even without a male-labeled voice available

    if(!cachedMaleVoice && !maleVoiceSearched){
        cachedMaleVoice = findMaleVoice();
        maleVoiceSearched = true;
        // Voice list often loads asynchronously on first page load — if it
        // wasn't ready yet, try again once it fires, for next time.
        if(!cachedMaleVoice && "onvoiceschanged" in window.speechSynthesis){
            window.speechSynthesis.onvoiceschanged = function(){
                cachedMaleVoice = findMaleVoice();
            };
        }
    }

    if(cachedMaleVoice) utterance.voice = cachedMaleVoice;

    // Mouth animates for exactly as long as speech is actually playing —
    // this one hook covers every screen that calls speakText().
    utterance.onstart = function(){ setCoachTalking(true); };
    utterance.onend = function(){ setCoachTalking(false); };
    utterance.onerror = function(){ setCoachTalking(false); };

    window.speechSynthesis.speak(utterance);
}

// Coach face controller — applies mood/talking/thinking state to every
// coach avatar currently in the DOM. Game bar, puzzle screen, and
// lessons screen all share the same .coachFace markup, so one call
// updates whichever one happens to be visible right now.
function setCoachMood(mood){
    document.querySelectorAll(".coachFace").forEach(function(el){
        el.classList.remove("mood-neutral", "mood-happy", "mood-concerned");
        el.classList.add("mood-" + (mood || "neutral"));
    });
}

function setCoachTalking(isTalking){
    document.querySelectorAll(".coachFace").forEach(function(el){
        el.classList.toggle("coachTalking", !!isTalking);
    });
}

function setCoachThinking(isThinking){
    document.querySelectorAll(".coachFace").forEach(function(el){
        el.classList.toggle("coachThinking", !!isThinking);
    });
}

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

    const topKingdom = getKingdomByStreak(kingdomState.consecutiveWins);
    const bottomKingdom = getKingdomByStreak(kingdomState.consecutiveWins);

    document.getElementById("topPlayerName").innerHTML = (topFlag ? topFlag + " " : "") + topName + ' <span class="playerKingdomBadge">' + topKingdom.emoji + ' ' + topKingdom.name + '</span>';
    document.getElementById("bottomPlayerName").innerHTML = (bottomFlag ? bottomFlag + " " : "") + bottomName + ' <span class="playerKingdomBadge">' + bottomKingdom.emoji + ' ' + bottomKingdom.name + '</span>';

    const topRating = orientation.top === "white" ? whiteRating : blackRating;
    const bottomRating = orientation.bottom === "white" ? whiteRating : blackRating;
    const topRatingEl = document.getElementById("topRatingLine");
    const bottomRatingEl = document.getElementById("bottomRatingLine");

    if(topRatingEl){
        if(gameMode === "online" && topRating){
            topRatingEl.textContent = "(" + topRating + ")";
            topRatingEl.style.display = "block";
        }else{
            topRatingEl.style.display = "none";
        }
    }

    if(bottomRatingEl){
        if(gameMode === "online" && bottomRating){
            bottomRatingEl.textContent = "(" + bottomRating + ")";
            bottomRatingEl.style.display = "block";
        }else{
            bottomRatingEl.style.display = "none";
        }
    }

    // Avatars: online shows each side's real photo; AI/Coach mode shows
    // your own photo on your side and a robot/coach icon on the other
    // side; local two-player just shows a generic silhouette for both.
    const topAvatarEl = document.getElementById("topPlayerAvatar");
    const bottomAvatarEl = document.getElementById("bottomPlayerAvatar");

    function avatarFor(side){
        if(gameMode === "online"){
            const photo = side === "white" ? whitePhoto : blackPhoto;
            return photo || DEFAULT_AVATAR_SRC;
        }
        if(gameMode === "ai"){
            if(side === "white") return currentUserPhotoURL || DEFAULT_AVATAR_SRC;
            return typeof MAN_AVATAR_SRC !== "undefined" ? MAN_AVATAR_SRC : DEFAULT_AVATAR_SRC;
        }
        return DEFAULT_AVATAR_SRC;
    }

    if(topAvatarEl) topAvatarEl.src = avatarFor(orientation.top);
    if(bottomAvatarEl) bottomAvatarEl.src = avatarFor(orientation.bottom);

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
            recordGameResult(gameMode === "ai" ? "loss" : "win", myOpponentName());
        }

        if(blackTime <= 0){
            clearInterval(timer);
            gameOver = true;
            showPopup("⏰ TIME!", "White wins on time!");
            recordGameResult(gameMode === "ai" ? "win" : "loss", myOpponentName());
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

    // Cut the coach off mid-sentence the moment the player interacts with
    // the board again — only relevant once they're actually making a
    // move (i.e. a piece is already selected and this tap completes it),
    // not on the initial "select a piece" tap.
    if(selected != null && "speechSynthesis" in window){
        window.speechSynthesis.cancel();
        if(typeof setCoachTalking === "function") setCoachTalking(false);
    }

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

function playAIMove(fromR, fromC, toR, toC, promotion){

    if(gameOver) return;
    if(promotionSquare) return;

    aiPromotionPiece = promotion || null;

    executeMove(fromR, fromC, toR, toC, true);
}

function executeMove(fromR, fromC, r, c, isAIMove){

    const movedPiece = pieces[fromR][fromC];
    const isCastle = (movedPiece === "wK" || movedPiece === "bK") && Math.abs(c - fromC) === 2;
    const isPromotionMove = (movedPiece === "wP" && r === 0) || (movedPiece === "bP" && r === 7);

    const wasRemoteMove = applyingRemoteMove;
    const aiPromotionForThisMove = aiPromotionPiece;
    const promotionPieceForThisMove = remotePromotionPiece;

    if(gameMode === "online" && !applyingRemoteMove && !isPromotionMove && typeof sendMoveToFirebase === "function"){
        sendMoveToFirebase(fromR, fromC, r, c, null);
    }

    const finish = function(){
        completeMove(fromR, fromC, r, c, isAIMove, wasRemoteMove, promotionPieceForThisMove, aiPromotionForThisMove);
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

function slidePieceVisual(fromR, fromC, toR, toC){

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

    void pieceImg.offsetWidth;

    pieceImg.style.transform = "translate(" + dx + "px, " + dy + "px)";

    return true;
}

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

function completeMove(fromR, fromC, r, c, isAIMove, wasRemoteMove, promotionPieceForThisMove, aiPromotionForThisMove){

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

    if(movedPiece === "wP" && r === 0){

        if(isAIMove){
            pieces[r][c] = "w" + (aiPromotionForThisMove ? aiPromotionForThisMove.toUpperCase() : "Q");
            finishTurn(wasRemoteMove);
        }else if(gameMode === "online" && wasRemoteMove){
            pieces[r][c] = "w" + (promotionPieceForThisMove || "Q");
            finishTurn(wasRemoteMove);
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
            pieces[r][c] = "b" + (aiPromotionForThisMove ? aiPromotionForThisMove.toUpperCase() : "Q");
            finishTurn(wasRemoteMove);
        }else if(gameMode === "online" && wasRemoteMove){
            pieces[r][c] = "b" + (promotionPieceForThisMove || "Q");
            finishTurn(wasRemoteMove);
        }else{
            promotionSquare = {r, c};
            promotionColor = "b";
            pendingOnlinePromotionMove = (gameMode === "online") ? {fromR, fromC, toR:r, toC:c} : null;
            createBoard();
            showPromotion("b");
        }

        return;
    }

    finishTurn(wasRemoteMove);
}

function choosePromotion(letter){

    if(!promotionSquare) return;

    const r = promotionSquare.r;
    const c = promotionSquare.c;

    pieces[r][c] = promotionColor + letter;

    if(pendingOnlinePromotionMove && typeof sendMoveToFirebase === "function"){
        const m = pendingOnlinePromotionMove;
        sendMoveToFirebase(m.fromR, m.fromC, m.toR, m.toC, letter);
        pendingOnlinePromotionMove = null;
    }

    promotionSquare = null;
    promotionColor = null;

    closePromotion();
    finishTurn(false);
}

function finishTurn(wasRemoteMove){

    positionHistory.push(getPositionKey());

    if(isThreefoldRepetition()){
        gameOver = true;
        createBoard();
        showPopup("🤝 DRAW", "Threefold Repetition");
        recordGameResult("draw", myOpponentName());
        return;
    }

    if(hasInsufficientMaterial()){
        gameOver = true;
        createBoard();
        showPopup("🤝 DRAW", "Insufficient Material");
        recordGameResult("draw", myOpponentName());
        return;
    }

    if(halfMoveClock >= 100){
        gameOver = true;
        createBoard();
        showPopup("🤝 DRAW", "50-Move Rule");
        recordGameResult("draw", myOpponentName());
        return;
    }

    const moverColor = currentPlayer;

    currentPlayer = currentPlayer === "white" ? "black" : "white";

    if(!hasLegalMoves(currentPlayer)){
        gameOver = true;
    }

    updateTurn();
    createBoard();

    if(gameMode === "online" && !wasRemoteMove && typeof pushClockUpdate === "function"){
        pushClockUpdate(moverColor);
    }

    if(isCoachMode && currentPlayer === "white" && !gameOver && typeof checkCoachHangingPieces === "function"){
        checkCoachHangingPieces();
    }

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

    // Material advantage, chess.com style — standard point values (not
    // the AI's internal centipawn pieceValues), shown as "+N" beside
    // whichever side has captured more material overall. Because this is
    // a NET difference, trading a pawn for a pawn cancels back to 0
    // automatically, and a captured queen (+9) followed by the opponent
    // capturing a rook back correctly nets down to +4 — no extra logic
    // needed for that, it falls out of the subtraction.
    const captureValues = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
    const materialValue = list => list.reduce((sum, p) => sum + (captureValues[p[1]] || 0), 0);

    const whiteScore = materialValue(whiteCaptured);
    const blackScore = materialValue(blackCaptured);
    const advantage = whiteScore - blackScore;

    if(advantage > 0){
        const target = orientation.top === "white" ? topBox : bottomBox;
        target.innerHTML += '<span class="captureAdvantage">+' + advantage + '</span>';
    }else if(advantage < 0){
        const target = orientation.top === "black" ? topBox : bottomBox;
        target.innerHTML += '<span class="captureAdvantage">+' + (-advantage) + '</span>';
    }

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

    document.getElementById("timeControlSection").style.display = mode === "online" ? "none" : "block";
    document.getElementById("startGameBtn").style.display = mode === "online" ? "none" : "block";

    document.getElementById("roomCodeDisplay").textContent = "";
    document.getElementById("onlineStatus").textContent = "";
}

function startNewGame(){

    selectedTime = Number(document.getElementById("timeControl").value);
    gameMode = document.getElementById("gameMode").value;
    aiDifficulty = document.getElementById("aiDifficulty").value;
    ratedAIActive = false;

    closeTimeControl();
    newGame();
}

function openPlaySetup(mode){
    isCoachMode = false;
    ratedAIActive = false;
    document.getElementById("gameMode").value = mode;
    updateGameMode();
    showTimeControl();
}

function newGame(){

    if(typeof stopOnlineListeners === "function") stopOnlineListeners();

    if(typeof checkDailyPlayStreak === "function") checkDailyPlayStreak();

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
if(gameMode === "ai"){
        whitePlayer = (typeof currentUsername !== "undefined" && currentUsername) ? currentUsername : "You";
        blackPlayer = isCoachMode ? "Coach" : "Computer";
        whiteFlag = (typeof currentUserFlag !== "undefined") ? currentUserFlag : "";
        blackFlag = isCoachMode ? "🧑‍🏫" : "🤖";
    }else if(gameMode === "human"){
        whitePlayer = "White";
        blackPlayer = "Black";
        whiteFlag = "";
        blackFlag = "";
    }

    const coachBarEl = document.getElementById("coachGameBar");
    if(coachBarEl) coachBarEl.style.display = isCoachMode ? "flex" : "none";
    if(isCoachMode && typeof resetCoachEval === "function") resetCoachEval();

    // For online mode, names/flags are set separately by multiplayer.js
    if(selectedTime === -1){
        whiteTime = -1;
        blackTime = -1;
    }else{
        whiteTime = selectedTime;
        blackTime = selectedTime;
    }

    updateTimers();

    if(gameMode !== "online"){
        startTimer();
    }

    updateCaptured();
    updateTurn();
    updateInGameControlsVisibility();

    positionHistory = [getPositionKey()];
    createBoard();

    if(document.getElementById("game").style.display !== "flex"){
        history.pushState({ screen: "game" }, "", "#game");
    }

    document.getElementById("appShell").style.display = "none";
    document.getElementById("game").style.display = "flex";
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

// Shows the game-over popup. Also resets any previous rating-change
// indicator so it doesn't linger from a prior online game — the correct
// value (if any) is filled back in by showRatingChangePopup() once
// recordGameResult() has finished saving. Also shows/hides the Chess
// DNA button depending on whether this game has "you" as a single
// player to analyze (AI or online — including rated AI matches).
function showPopup(title, message){
    document.getElementById("popupTitle").textContent = title;
    document.getElementById("popupMessage").textContent = message;

    const ratingChangeEl = document.getElementById("popupRatingChange");
    if(ratingChangeEl){
        ratingChangeEl.style.display = "none";
        ratingChangeEl.textContent = "";
    }

    const dnaBtn = document.getElementById("chessDnaBtn");
    if(dnaBtn){
        dnaBtn.style.display = (gameMode === "ai" || gameMode === "online") ? "block" : "none";
    }

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
    if(gameMode === "online" || (gameMode === "ai" && ratedAIActive)) return;

    if(gameOver) return;

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

// Undo doesn't make sense in a real online match against a live opponent
// (there's no way to ask them to un-make their move), so it's swapped out
// for Chat there instead — and a rated AI match behaves the same way
// since it counts toward rating just like a real online game does.
// Practice AI and local two-player games get Undo, no Chat.
function updateInGameControlsVisibility(){
    const undoBtn = document.getElementById("undo");
    const chatBtn = document.getElementById("gameChatBtn");
    const isRatedMatch = (gameMode === "online") || (gameMode === "ai" && ratedAIActive);
    if(undoBtn) undoBtn.style.display = isRatedMatch ? "none" : "flex";
    if(chatBtn) chatBtn.style.display = isRatedMatch ? "flex" : "none";
}

function handleRestartClick(){
    if(gameMode === "online" || (gameMode === "ai" && ratedAIActive)){
        showOnlineGameMenu();
    }else{
        newGame();
    }
}
function handleNewGameClick(){
    if(!gameOver){
        showOnlineGameMenu();
    }else{
        showTimeControl();
    }
}
function showKingMarkers(loserColor){

    const loserKing = loserColor === "white" ? "wK" : "bK";
    const winnerKing = loserColor === "white" ? "bK" : "wK";

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){

            if(pieces[r][c] === loserKing || pieces[r][c] === winnerKing){

                const flipped = (gameMode === "online" && myColor === "black");
                const domR = flipped ? 7 - r : r;
                const domC = flipped ? 7 - c : c;
                const square = board.children[domR * 8 + domC];
                if(!square) continue;

                const marker = document.createElement("span");

                if(pieces[r][c] === loserKing){
                    marker.textContent = "🚩";
                    marker.className = "resignFlag";
                }else{
                    marker.textContent = "👑";
                    marker.className = "winnerCrown";
                }

                square.appendChild(marker);
            }
        }
    }
}

function showOnlineGameMenu(){
    document.getElementById("onlineMenuPopup").classList.add("show");
}

function closeOnlineMenu(){
    document.getElementById("onlineMenuPopup").classList.remove("show");
}

function resignGame(){

    if(typeof sendGameEvent === "function"){
        sendGameEvent("resign");
    }

    gameOver = true;
    clearInterval(timer);
    closeOnlineMenu();

    const loser = gameMode === "online" ? myColor : currentPlayer;
    const winner = loser === "white" ? "Black" : "White";
    showPopup("🚩 Resignation", winner + " wins by resignation.");
    createBoard();
    showKingMarkers(loser);
    recordGameResult("loss", myOpponentName());
}

function abortGame(){

    if(typeof sendGameEvent === "function"){
        sendGameEvent("abort");
    }

    gameOver = true;
    clearInterval(timer);
    closeOnlineMenu();

    const loser = gameMode === "online" ? myColor : currentPlayer;
    const winner = loser === "white" ? "Black" : "White";
    showPopup("🏳️ Game Aborted", winner + " wins by abandonment.");
    createBoard();
    showKingMarkers(loser);
    recordGameResult("loss", myOpponentName());
}

function requestDraw(){

    closeOnlineMenu();

    if(gameMode === "online"){
        if(typeof sendGameEvent === "function"){
            sendGameEvent("drawOffer");
        }
        return;
    }

    gameOver = true;
    clearInterval(timer);
    showPopup("🤝 Draw", "Game drawn by agreement.");
    createBoard();
    recordGameResult("draw", myOpponentName());
}

function respondToDraw(accepted){

    document.getElementById("drawOfferPopup").classList.remove("show");

    if(typeof sendGameEvent === "function"){
        sendGameEvent("drawResponse", {accepted: accepted});
    }

    if(accepted){
        gameOver = true;
        clearInterval(timer);
        showPopup("🤝 Draw", "Game drawn by agreement.");
        createBoard();
        recordGameResult("draw", myOpponentName());
    }
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

function switchScreen(name){

    lastActiveTab = name;

    const screens = ["home", "friends", "kingdom", "account"];

    screens.forEach(function(s){
        document.getElementById(s + "Screen").style.display = (s === name) ? "flex" : "none";
    });

    document.querySelectorAll("#bottomNav .navBtn").forEach(function(btn){
        btn.classList.toggle("active", btn.dataset.screen === name);
    });

    if(name === "friends" && typeof loadFriendsData === "function"){
        loadFriendsData();
    }

    if(name === "account" && currentUser && db && typeof checkAndShowOwnAwardBanner === "function"){
        db.ref("users/" + currentUser.uid + "/public").once("value").then(function(snap){
            const data = snap.val();
            if(data) checkAndShowOwnAwardBanner(currentUser.uid, data, "accountAchievementsGrid");
        });
    }

    if (name === 'kingdom') {
        updateKingdomUI();
    }

}

// Home-screen quick-link cards (Tournaments/Puzzles/Leaderboards/Daily
// Rewards, and any future ones) call this instead of their open___()
// function directly. If the screen or the opener isn't actually available
// — wrong/partial deploy, feature not built yet, whatever the reason — the
// person sees a clear "Coming Soon" message instead of a click that
// silently does nothing.
function openFeatureOrComingSoon(screenId, openFnName, label){
    try{
        if(!document.getElementById(screenId) || typeof window[openFnName] !== "function"){
            showInfoPopup("🚧 " + label, label + " isn't available yet — check back soon!");
            return;
        }
        window[openFnName]();
    }catch(err){
        console.error("Failed to open " + label + ":", err);
        showInfoPopup("⚠️ " + label, "Something went wrong opening " + label + ". Please try again.");
    }
}

function showSettingsPopup(){
    document.getElementById("settingsPopup").classList.add("show");
}

function closeSettingsPopup(){
    document.getElementById("settingsPopup").classList.remove("show");
}

function showInfoPopup(title, message){
    document.getElementById("infoPopupTitle").textContent = title;
    document.getElementById("infoPopupMessage").textContent = message;
    document.getElementById("infoPopup").classList.add("show");
}

function closeInfoPopup(){
    document.getElementById("infoPopup").classList.remove("show");
}

function showComingSoon(){
    showInfoPopup("🏆 Tournaments", "Tournaments are coming soon — stay tuned!");
}

function myOpponentName(){
    if(gameMode === "ai") return "Computer";
    return myColor === "white" ? blackPlayer : whitePlayer;
}

function myOpponentUidAndPhoto(){
    if(gameMode === "ai") return { uid: null, photo: null };
    if(myColor === "white") return { uid: (typeof blackUid !== "undefined" ? blackUid : null), photo: (typeof blackPhoto !== "undefined" ? blackPhoto : null) };
    return { uid: (typeof whiteUid !== "undefined" ? whiteUid : null), photo: (typeof whitePhoto !== "undefined" ? whitePhoto : null) };
}

// Shows the "+8" / "-8" rating-change line on the game-over popup, once
// the rating update has actually been saved. Applies to real online
// games AND rated AI matches (ratedAIActive) — draws don't change
// rating, and practice AI/local games never show this at all.
function showRatingChangePopup(myResult){

    const el = document.getElementById("popupRatingChange");
    if(!el) return;

    if(gameMode !== "online" && !ratedAIActive){
        el.style.display = "none";
        return;
    }

    let delta = 0;
    if(myResult === "win") delta = 8;
    else if(myResult === "loss") delta = -8;

    if(delta === 0){
        el.style.display = "none";
        return;
    }

    el.textContent = "Rating: " + (delta > 0 ? "+" : "") + delta;
    el.style.color = delta > 0 ? "#4ade80" : "#e5484d";
    el.style.display = "block";

}

function recordGameResult(myResult, opponentName){

    lastGameResult = myResult;

    if(gameMode === "human") return;
    if(typeof currentUser === "undefined" || !currentUser) return;
    if(typeof db === "undefined" || !db) return;

    // ===== KINGDOM UPDATE =====
    if (myResult === 'win') {
        kingdomState.totalWins++;
        kingdomState.consecutiveWins++;
        
        const currentKingdom = KINGDOM_LEVELS.find(k => k.id === kingdomState.currentLevel);
        const nextKingdom = getNextKingdom(currentKingdom);
        
        if (nextKingdom && kingdomState.consecutiveWins >= nextKingdom.requiredStreak) {
            kingdomState.currentLevel = nextKingdom.id;
            setTimeout(function() {
                showInfoPopup('🎉 PROMOTION!', 'You advanced to ' + nextKingdom.emoji + ' ' + nextKingdom.name + '!');
            }, 500);
        }
    } else if (myResult === 'loss' || myResult === 'draw') {
        kingdomState.consecutiveWins = 0;
    }

    // Save kingdom data to Firebase
    if (typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined' && db) {
        db.ref("users/" + currentUser.uid + "/kingdom").set({
            currentLevel: kingdomState.currentLevel,
            consecutiveWins: kingdomState.consecutiveWins,
            totalWins: kingdomState.totalWins
        }).catch(function(err) {
            console.error('Failed to save kingdom data:', err);
        });
    }
    // ===== END KINGDOM UPDATE =====

    // IMPORTANT: this only touches users/{uid}/public, never the parent
    // users/{uid} node. A transaction on the parent would also read/write
    // the sibling "history" path, and could silently clobber a concurrent
    // history push with a stale snapshot — which is what was wiping out
    // recent games. Scoping it to /public keeps the two writes on
    // non-overlapping paths so neither can stomp on the other.
    const userPublicRef = db.ref("users/" + currentUser.uid + "/public");
    const opponentInfo = myOpponentUidAndPhoto();

    userPublicRef.transaction(function(data){
        if(!data) return data;
        data.wins = data.wins || 0;
        data.losses = data.losses || 0;
        data.draws = data.draws || 0;
        data.winStreak = data.winStreak || 0;
        data.bestStreak = data.bestStreak || 0;

        if(myResult === "win"){
            data.wins++;
            data.winStreak++;
            if(data.winStreak > data.bestStreak) data.bestStreak = data.winStreak;
        }else if(myResult === "loss"){
            data.losses++;
            data.winStreak = 0;
        }else{
            data.draws++;
            data.winStreak = 0;
        }

        // Rating changes for real online opponents AND for the rated
        // quick-match AI fallback — everything else (practice AI, local
        // 2-player, Coach) stays unrated.
        if(gameMode === "online" || ratedAIActive){
            data.rating = data.rating || 100;
            if(myResult === "win") data.rating += 8;
            else if(myResult === "loss") data.rating -= 8;
        }
        if(gameMode === "online"){
            data.currentRoomCode = null; // game's over — no longer "currently playing"
        }

        if(gameMode === "ai" && myResult === "win"){
            if(aiDifficulty === "medium") data.beatMediumAI = true;
            if(aiDifficulty === "hard") data.beatHardAI = true;
        }

        return data;
    }, function(error, committed, snapshot){
        if(error) alert("Stats save failed: " + error.message);
    }).then(function(result){
        if(typeof checkAchievements === "function") checkAchievements(currentUser.uid, result.snapshot.val());
        showRatingChangePopup(myResult);
    });

    db.ref("users/" + currentUser.uid + "/history").push({
        opponent: opponentName || "Unknown",
        opponentPhoto: opponentInfo.photo || null,
        opponentUid: opponentInfo.uid || null,
        result: myResult,
        mode: gameMode,
        time: Date.now()
    }).then(function(){
        if(typeof loadRecentGames === "function") loadRecentGames();
    }).catch(function(err){
        alert("History save failed: " + err.message);
    });

    if(typeof activeTournamentBracket !== "undefined" && activeTournamentBracket === "arena" && typeof recordArenaGameResult === "function"){
        recordArenaGameResult(myResult);
    }else if(typeof recordTournamentGameResult === "function"){
        recordTournamentGameResult(myResult);
    }
    if(typeof recordDailyChallengeProgress === "function") recordDailyChallengeProgress(myResult, gameMode);

    // Save this game's full move list against this specific opponent —
    // builds up the data an Opponent Clone is generated from (see
    // clone.js). Only real online opponents can be cloned, never AI.
    if(gameMode === "online" && opponentInfo.uid && typeof moveHistory !== "undefined"){
        const opponentColorForClone = myColor === "white" ? "black" : "white";
        db.ref("users/" + currentUser.uid + "/opponentGames/" + opponentInfo.uid).push({
            moves: moveHistory.slice(),
            opponentColor: opponentColorForClone,
            result: myResult,
            time: Date.now()
        }).catch(function(err){
            console.error("Failed to save opponent game data for Clone:", err.message);
        });
}
}

function cacheRecentGames(entries){
    try{ localStorage.setItem("cachedRecentGames", JSON.stringify(entries)); }catch(e){}
}

function loadCachedRecentGames(){
    try{ return JSON.parse(localStorage.getItem("cachedRecentGames") || "null"); }catch(e){ return null; }
}

function renderRecentGamesRows(entries, containerId){

    const list = document.getElementById(containerId || "recentGamesList");
    if(!list) return;

    if(!entries) return; // nothing cached and nothing loaded yet — leave existing placeholder as-is

    if(entries.length === 0){
        list.innerHTML = '<p class="sub">No games played yet.</p>';
        return;
    }

    list.innerHTML = "";
    entries.forEach(function(entry){

        const label = entry.result === "win" ? "You Won" : entry.result === "loss" ? "You Lost" : "Draw";
        const cls = entry.result === "win" ? "gameWon" : entry.result === "loss" ? "gameLost" : "gameDrawn";

        const avatarSrc = entry.opponentPhoto || DEFAULT_AVATAR_SRC;
        const timeLabel = formatRelativeTime(entry.time);
        const modeLabel = entry.mode === "ai" ? "vs AI" : entry.mode === "online" ? "Online Match" : "Local";

        const row = document.createElement("div");
        row.className = "gameRow";

        row.innerHTML =
            '<div class="gameOpponentInfo">' +
                '<div class="gameAvatarWrap">' +
                    '<img class="gameAvatarImg" src="' + avatarSrc + '" alt="">' +
                '</div>' +
                '<div class="gameOpponentText">' +
                    '<span class="gameOpponent"></span>' +
                    '<span class="gameMeta">' + modeLabel + '<span class="liveStatusText"></span></span>' +
                '</div>' +
            '</div>' +
            '<div class="gameResultCol">' +
                '<span class="gameResult ' + cls + '">' + label + '</span>' +
                '<span class="gameTime">' + timeLabel + '</span>' +
            '</div>';

        row.querySelector(".gameOpponent").textContent = entry.opponent || "Unknown";

        if(entry.opponentUid){

            const infoEl = row.querySelector(".gameOpponentInfo");
            infoEl.style.cursor = "pointer";
            infoEl.onclick = function(){ openPlayerProfile(entry.opponentUid); };

            if(entry.mode === "online" && typeof startCloneMatch === "function"){
                const cloneBtn = document.createElement("button");
                cloneBtn.className = "cloneBtn";
                cloneBtn.textContent = "🧬 Clone";
                cloneBtn.onclick = function(e){
                    e.stopPropagation();
                    startCloneMatch(entry.opponentUid, entry.opponent || "Opponent");
                };
                row.querySelector(".gameResultCol").appendChild(cloneBtn);
            }

            if(db){
                db.ref("presence/" + entry.opponentUid).once("value").then(function(presenceSnap){
                    const statusEl = row.querySelector(".liveStatusText");
                    if(!statusEl) return;
                    if(presenceSnap.val() === true){
                        statusEl.textContent = " · 🟢 Online now";
                        statusEl.classList.add("liveOnline");
                    }else{
                        statusEl.textContent = " · Offline";
                    }
                }).catch(function(){
                    const statusEl = row.querySelector(".liveStatusText");
                    if(statusEl) statusEl.textContent = " · Status unavailable";
                });
            }

        }

        list.appendChild(row);
    });

}

function loadRecentGames(){
    if(!db || !currentUser) return;

    // Paint instantly from whatever was cached last time this loaded
    // successfully — keeps Recent Games usable while offline instead of
    // sitting blank or stuck on a stale placeholder.
    renderRecentGamesRows(loadCachedRecentGames());

    db.ref("users/" + currentUser.uid + "/history")
        .orderByChild("time")
        .limitToLast(5)
        .once("value")
        .then(function(snapshot){

            const entries = [];
            snapshot.forEach(function(child){ entries.push(child.val()); });
            entries.reverse();

            cacheRecentGames(entries);
            renderRecentGamesRows(entries);

        }).catch(function(){
            // Offline / request failed — leave the cache-painted rows
            // above exactly as they are instead of clearing them out.
        });
}
// Full game history — up to 300 games, separate from the 5-item
// Recent Games preview on Home. Reuses renderRecentGamesRows() with a
// different container id, so rows look and behave identically
// (clickable opponents, live online/offline status, Clone button).
function openGameHistory(){

    if(!db || !currentUser){
        showInfoPopup("🔒 Log In Required", "Please log in to view your game history.");
        return;
    }

    document.getElementById("appShell").style.display = "none";
    document.getElementById("gameHistoryScreen").style.display = "flex";
    history.pushState({ screen: "gameHistory" }, "", "#history");

    const list = document.getElementById("gameHistoryList");
    if(list) list.innerHTML = '<p class="sub">Loading...</p>';

    db.ref("users/" + currentUser.uid + "/history")
        .orderByChild("time")
        .limitToLast(300)
        .once("value")
        .then(function(snapshot){

            const entries = [];
            snapshot.forEach(function(child){ entries.push(child.val()); });
            entries.reverse();

            renderRecentGamesRows(entries, "gameHistoryList");

        }).catch(function(err){
            if(list) list.innerHTML = '<p class="sub">Could not load game history: ' + err.message + '</p>';
        });

}

function closeGameHistory(){
    document.getElementById("gameHistoryScreen").style.display = "none";
    if(history.state && history.state.screen === "gameHistory"){
        history.back();
    }
}
function formatRelativeTime(timestamp){
    if(!timestamp) return "";
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if(mins < 1) return "just now";
    if(mins < 60) return mins + " min ago";
    const hours = Math.floor(mins / 60);
    if(hours < 24) return hours + "h ago";
    const days = Math.floor(hours / 24);
    return days + "d ago";
}

// ===== KINGDOM UI FUNCTIONS =====
function updateKingdomUI() {
  const currentKingdom = KINGDOM_LEVELS.find(k => k.id === kingdomState.currentLevel) || KINGDOM_LEVELS[0];
  const nextKingdom = getNextKingdom(currentKingdom);
  const progress = getProgressToNext(kingdomState.consecutiveWins, nextKingdom);
  
  const crownEl = document.getElementById('rulerCrown');
  const nameDisplayEl = document.getElementById('kingdomNameDisplay');
  const descEl = document.getElementById('kingdomDescription');
  const streakEl = document.getElementById('kingdomStreak');
  const totalWinsEl = document.getElementById('kingdomTotalWins');
  
  if (crownEl) crownEl.textContent = currentKingdom.emoji;
  if (nameDisplayEl) nameDisplayEl.textContent = currentKingdom.emoji + ' ' + currentKingdom.name;
  if (descEl) descEl.textContent = currentKingdom.description;
  if (streakEl) streakEl.textContent = kingdomState.consecutiveWins;
  if (totalWinsEl) totalWinsEl.textContent = kingdomState.totalWins;
  
  const avatarEl = document.getElementById('rulerAvatar');
  if (avatarEl && typeof currentUser !== 'undefined' && currentUser && currentUser.photoURL) {
    avatarEl.src = currentUser.photoURL;
  }
  
  const nameEl = document.getElementById('rulerName');
  if (nameEl && typeof currentUsername !== 'undefined' && currentUsername) {
    nameEl.textContent = currentUsername;
  }
  
  const nextLabelEl = document.getElementById('nextKingdomLabel');
  const progressFillEl = document.getElementById('progressFill');
  const progressTextEl = document.getElementById('progressText');
  
  if (nextKingdom) {
    if (nextLabelEl) nextLabelEl.textContent = nextKingdom.emoji + ' ' + nextKingdom.name;
    if (progressFillEl) progressFillEl.style.width = Math.min(progress, 100) + '%';
    if (progressTextEl) progressTextEl.textContent = kingdomState.consecutiveWins + ' / ' + nextKingdom.requiredStreak + ' wins';
  } else {
    if (nextLabelEl) nextLabelEl.textContent = '🏆 MAX LEVEL';
    if (progressFillEl) progressFillEl.style.width = '100%';
    if (progressTextEl) progressTextEl.textContent = 'Maximum level reached!';
  }
  
  updateKingdomScene(currentKingdom.visualLevel);
  updateParticles(currentKingdom.visualLevel);
}

function updateKingdomScene(level) {
  const buildingsContainer = document.getElementById('kingdomBuildings');
  if (!buildingsContainer) return;
  buildingsContainer.innerHTML = '';
  
  const bg = document.getElementById('kingdomBackground');
  if (!bg) return;
  
  const gradients = [
    ['#4a7c59', '#2d4a3e'],
    ['#6b8f71', '#4a6b50'],
    ['#8a6e4b', '#5a4a3a'],
    ['#7a9e9f', '#4a7a7b'],
    ['#c9a96e', '#8a7a4a'],
    ['#d4b896', '#a68b6a'],
    ['#b89a7a', '#7a6a5a'],
    ['#c9b896', '#a89a7a']
  ];
  const gradient = gradients[Math.min(level - 1, gradients.length - 1)] || gradients[0];
  bg.style.background = 'linear-gradient(135deg, ' + gradient[0] + ', ' + gradient[1] + ')';
  
  if (level >= 1) {
    const numHuts = Math.min(level + 2, 8);
    for (let i = 0; i < numHuts; i++) {
      const hut = document.createElement('div');
      hut.className = 'kingdomBuilding';
      hut.style.height = (20 + Math.random() * 20) + 'px';
      hut.style.width = (15 + Math.random() * 15) + 'px';
      buildingsContainer.appendChild(hut);
    }
  }
  
  if (level >= 3) {
    for (let i = 0; i < 3; i++) {
      const wall = document.createElement('div');
      wall.className = 'kingdomWall';
      wall.style.height = (30 + i * 15) + 'px';
      buildingsContainer.appendChild(wall);
    }
  }
  
  if (level >= 5) {
    const palace = document.createElement('div');
    palace.className = 'kingdomPalace';
    palace.style.width = '60px';
    palace.style.height = '50px';
    palace.style.position = 'relative';
    buildingsContainer.appendChild(palace);
    
    for (let i = 0; i < 2; i++) {
      const tower = document.createElement('div');
      tower.className = 'kingdomBuilding';
      tower.style.width = '15px';
      tower.style.height = '35px';
      tower.style.margin = '0 5px';
      buildingsContainer.appendChild(tower);
    }
  }
  
  if (level >= 7) {
    for (let i = 0; i < 3; i++) {
      const territory = document.createElement('div');
      territory.className = 'kingdomTerritory';
      territory.style.height = (25 + i * 10) + 'px';
      territory.style.width = (20 + i * 5) + 'px';
      buildingsContainer.appendChild(territory);
    }
  }
  
  if (level >= 8) {
    for (let i = 0; i < 4; i++) {
      const empire = document.createElement('div');
      empire.className = 'kingdomEmpire';
      empire.style.height = (30 + i * 15) + 'px';
      empire.style.width = (20 + i * 5) + 'px';
      buildingsContainer.appendChild(empire);
    }
  }
}

function updateParticles(level) {
  const container = document.getElementById('particlesContainer');
  if (!container) return;
  container.innerHTML = '';
  
  if (level < 3) return;
  
  const numParticles = Math.min(level * 2, 20);
  for (let i = 0; i < numParticles; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    const size = 3 + Math.random() * 8;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 60 + '%';
    particle.style.animationDelay = (Math.random() * 3) + 's';
    particle.style.animationDuration = (2 + Math.random() * 2) + 's';
    container.appendChild(particle);
  }
}

// Load kingdom data when user logs in
if (typeof currentUser !== 'undefined' && currentUser && typeof db !== 'undefined' && db) {
    db.ref("users/" + currentUser.uid + "/kingdom").once("value").then(function(snap) {
        const data = snap.val();
        if (data) {
            kingdomState.currentLevel = data.currentLevel || 'village';
            kingdomState.consecutiveWins = data.consecutiveWins || 0;
            kingdomState.totalWins = data.totalWins || 0;
            if (document.getElementById('kingdomScreen') && document.getElementById('kingdomScreen').style.display === 'flex') {
                updateKingdomUI();
            }
        }
    }).catch(function(err) {
        console.error('Failed to load kingdom data:', err);
    });

    // Listen for kingdom updates
    db.ref("users/" + currentUser.uid + "/kingdom").on("value", function(snap) {
        const data = snap.val();
        if (data) {
            kingdomState.currentLevel = data.currentLevel || 'village';
            kingdomState.consecutiveWins = data.consecutiveWins || 0;
            kingdomState.totalWins = data.totalWins || 0;
            if (document.getElementById('kingdomScreen') && document.getElementById('kingdomScreen').style.display === 'flex') {
                updateKingdomUI();
            }
        }
    });
}
// ===== END KINGDOM UI FUNCTIONS =====

// ===== Physical/phone back-button support =====
// Every open___() function already does history.pushState({screen, view}, ...),
// and newGame() does the same for the board. This listens for the back
// button itself (which doesn't call our close___() functions) and re-syncs
// the visible screen to match, so back steps through detail -> list -> Home,
// same as the in-app back arrows — and never silently drops a live game.
window.addEventListener("popstate", function(event){

    const state = event.state;

    // Closing the Analysis position-picker popup via the back button
    // must just close the popup itself, the same as tapping Cancel —
    // it should never fall through to whatever screen is showing
    // underneath it (the Analysis board, or Home if no position has
    // been picked yet). This check runs first since a .popup isn't a
    // tracked history state on its own, so without this, back button
    // presses were being absorbed by whatever WAS driving history
    // (the screen behind the popup) instead of the popup itself.
    const analysisPopupEl = document.getElementById("analysisPositionPopup");
    if(analysisPopupEl && analysisPopupEl.classList.contains("show")){
        if(typeof closeAnalysisPositionPicker === "function") closeAnalysisPositionPicker();
        return;
    }

    // Closing an open chat (in-game chat or a friend DM) via the back
    // button must just close chat and reveal whatever's behind it — it
    // should never trigger the live-game resign/draw/abort menu. This
    // check must run FIRST: #game stays display:flex the entire time
    // chat is open (chat is just an overlay on top of it), so without
    // this check, the live-game branch below runs instead and wrongly
    // assumes you're trying to leave the game itself.
    if(document.getElementById("chatScreen").style.display === "flex"){
        document.getElementById("chatScreen").style.display = "none";
        if(typeof closeChatListener === "function") closeChatListener();
        return;
    }

    // A live game must never be silently left by the back button — push
    // its state right back on and surface the same resign/draw/abort
    // options the in-game menu icon shows.
    if(document.getElementById("game").style.display === "flex"){

        if(gameMode === "online" && myColor === null){
            // Spectating — nothing to protect, just leave.
            leaveSpectating();
            return;
        }

        if(!gameOver){
            // Game still in progress — protect it, ask before leaving.
            history.pushState({ screen: "game" }, "", "#game");
            showOnlineGameMenu();
            return;
        }

        // Game already finished (resigned/aborted/drawn/checkmated/timed
        // out) — nothing left to protect, so just leave the board and any
        // leftover result popup, straight back to Home. Also close Chess
        // DNA here if it's open — #game staying visible means THIS branch
        // runs before the generic full-screen-panel cleanup below ever
        // gets a chance to, which is exactly what let DNA get stuck onscreen.
        closePopup();
        const dnaScreenEl = document.getElementById("chessDnaScreen");
        if(dnaScreenEl) dnaScreenEl.style.display = "none";
        document.getElementById("game").style.display = "none";
        document.getElementById("appShell").style.display = "flex";
        switchScreen("home");
        return;
    }

    if(!state || !state.screen){
        document.getElementById("tournamentsScreen").style.display = "none";
        document.getElementById("puzzleScreen").style.display = "none";
        document.getElementById("leaderboardScreen").style.display = "none";
        document.getElementById("dailyRewardsScreen").style.display = "none";
        document.getElementById("chatScreen").style.display = "none";
        document.getElementById("analysisScreen").style.display = "none";
        document.getElementById("lessonsScreen").style.display = "none";
        document.getElementById("profileScreen").style.display = "none";
        document.getElementById("gameHistoryScreen").style.display = "none";
        const dnaScreenEl2 = document.getElementById("chessDnaScreen");
        if(dnaScreenEl2) dnaScreenEl2.style.display = "none";
        if(typeof matchmakingSearchActive !== "undefined" && matchmakingSearchActive && typeof cancelQuickMatchManually === "function"){
            cancelQuickMatchManually();
        }
        document.getElementById("appShell").style.display = "flex";
        switchScreen(lastActiveTab);
        return;
    }

    if(state.screen === "tournaments"){
        document.getElementById("appShell").style.display = "none";
        document.getElementById("tournamentsScreen").style.display = "flex";
        if(state.view === "create") renderCreateTournamentView();
        else if(state.view === "detail") renderTournamentDetailView(state.id);
        else showTournamentsList();
        return;
    }

    if(state.screen === "puzzle"){
        document.getElementById("appShell").style.display = "none";
        document.getElementById("puzzleScreen").style.display = "flex";
        return;
    }

    if(state.screen === "leaderboard"){
        document.getElementById("appShell").style.display = "none";
        document.getElementById("leaderboardScreen").style.display = "flex";
        return;
    }

    if(state.screen === "dailyRewards"){
        document.getElementById("appShell").style.display = "none";
        document.getElementById("dailyRewardsScreen").style.display = "flex";
        return;
    }

    if(state.screen === "analysis"){
        document.getElementById("appShell").style.display = "none";
        document.getElementById("analysisScreen").style.display = "flex";
        return;
    }

    if(state.screen === "profile"){
        document.getElementById("appShell").style.display = "none";
        document.getElementById("profileScreen").style.display = "flex";
        if(state.uid) loadPlayerProfile(state.uid);
        return;
    }

    if(state.screen === "chat"){
        document.getElementById("chatScreen").style.display = "flex";
        return;
    }
if(state.screen === "chessdna"){
        document.getElementById("chessDnaScreen").style.display = "flex";
        return;
    }

    if(state.screen === "gameHistory"){
        document.getElementById("gameHistoryScreen").style.display = "flex";
        return;
    }

});
    

createCoordinates();
// ===== KINGDOM UI FUNCTIONS =====

function updateKingdomUI() {
    const currentKingdom = KINGDOM_LEVELS.find(k => k.id === kingdomState.currentLevel) || KINGDOM_LEVELS[0];
    const nextKingdom = getNextKingdom(currentKingdom);
    const progress = getProgressToNext(kingdomState.consecutiveWins, nextKingdom);

    // Update crown emoji
    const crownEl = document.getElementById('rulerCrown');
    if (crownEl) crownEl.textContent = currentKingdom.emoji;

    // Update kingdom name display
    const nameDisplayEl = document.getElementById('kingdomNameDisplay');
    if (nameDisplayEl) nameDisplayEl.textContent = currentKingdom.emoji + ' ' + currentKingdom.name;

    // Update description
    const descEl = document.getElementById('kingdomDescription');
    if (descEl) descEl.textContent = currentKingdom.description;

    // Update stats
    const streakEl = document.getElementById('kingdomStreak');
    if (streakEl) streakEl.textContent = kingdomState.consecutiveWins;

    const totalWinsEl = document.getElementById('kingdomTotalWins');
    if (totalWinsEl) totalWinsEl.textContent = kingdomState.totalWins;

    // Update ruler avatar
    const avatarEl = document.getElementById('rulerAvatar');
    if (avatarEl && typeof currentUser !== 'undefined' && currentUser && currentUser.photoURL) {
        avatarEl.src = currentUser.photoURL;
    }

    // Update ruler name
    const nameEl = document.getElementById('rulerName');
    if (nameEl && typeof currentUsername !== 'undefined' && currentUsername) {
        nameEl.textContent = currentUsername;
    }

    // Update progress
    const nextLabelEl = document.getElementById('nextKingdomLabel');
    const progressFillEl = document.getElementById('progressFill');
    const progressTextEl = document.getElementById('progressText');

    if (nextKingdom) {
        if (nextLabelEl) nextLabelEl.textContent = nextKingdom.emoji + ' ' + nextKingdom.name;
        if (progressFillEl) progressFillEl.style.width = Math.min(progress, 100) + '%';
        if (progressTextEl) progressTextEl.textContent = kingdomState.consecutiveWins + ' / ' + nextKingdom.requiredStreak + ' wins';
    } else {
        if (nextLabelEl) nextLabelEl.textContent = '🏆 MAX LEVEL';
        if (progressFillEl) progressFillEl.style.width = '100%';
        if (progressTextEl) progressTextEl.textContent = 'Maximum level reached!';
    }

    // Update kingdom journey
    updateKingdomJourney(currentKingdom);
}

function updateKingdomJourney(currentKingdom) {
    const container = document.getElementById('kingdomJourney');
    if (!container) return;

    container.innerHTML = '';

    KINGDOM_LEVELS.forEach(function(kingdom) {
        const isCompleted = kingdomState.currentLevel === kingdom.id || 
            KINGDOM_LEVELS.indexOf(kingdom) < KINGDOM_LEVELS.findIndex(k => k.id === kingdomState.currentLevel);
        const isCurrent = kingdom.id === kingdomState.currentLevel;
        const isLocked = !isCompleted && !isCurrent;

        const step = document.createElement('div');
        step.className = 'kingdom-step';
        if (isCompleted) step.classList.add('completed');
        if (isCurrent) step.classList.add('current');
        if (isLocked) step.classList.add('locked');

        step.innerHTML = `
            <span class="step-emoji">${kingdom.emoji}</span>
            <span class="step-name">${kingdom.name}</span>
            <span class="step-icon">${isCompleted ? '✅' : isCurrent ? '●' : '🔒'}</span>
        `;

        container.appendChild(step);
    });
}
// ===== KINGDOM SYSTEM WITH IMAGES =====

// Kingdom image path mapping
function getKingdomImagePath(kingdomId) {
    const images = {
        'village': 'pieces/village.png',
        'town': 'pieces/town.png',
        'fortress': 'pieces/fortress.png',
        'city': 'pieces/city.png',
        'kingdom': 'pieces/kingdom.png',
        'grand-kingdom': 'pieces/grand_kingdom.png',
        'dominion': 'pieces/dominion.png',
        'empire': 'pieces/empire.png'
    };
    return images[kingdomId] || images['village'];
}

// Update Kingdom UI with image background
function updateKingdomUI() {
    const currentKingdom = KINGDOM_LEVELS.find(k => k.id === kingdomState.currentLevel) || KINGDOM_LEVELS[0];
    const nextKingdom = getNextKingdom(currentKingdom);
    const progress = getProgressToNext(kingdomState.consecutiveWins, nextKingdom);

    // Update background image
    const bgImg = document.getElementById('kingdomBackgroundImg');
    if (bgImg) {
        const imgPath = getKingdomImagePath(currentKingdom.id);
        bgImg.src = imgPath;
        bgImg.onerror = function() {
            // Fallback if image doesn't load
            this.style.display = 'none';
            document.getElementById('kingdomImageContainer').style.background = '#fdecd2';
        };
    }

    // Update crown
    const crownEl = document.getElementById('kingdomRulerCrown');
    if (crownEl) crownEl.textContent = currentKingdom.emoji;

    // Update kingdom name badge
    const badgeEl = document.getElementById('kingdomNameBadge');
    if (badgeEl) badgeEl.textContent = currentKingdom.emoji + ' ' + currentKingdom.name;

    // Update ruler name
    const rulerName = document.getElementById('kingdomRulerName');
    if (rulerName && typeof currentUsername !== 'undefined' && currentUsername) {
        rulerName.textContent = currentUsername;
    }

    // Update ruler title
    const rulerTitle = document.getElementById('kingdomRulerTitle');
    if (rulerTitle) rulerTitle.textContent = currentKingdom.name;

    // Update ruler avatar
    const avatarEl = document.getElementById('kingdomRulerAvatar');
    if (avatarEl && typeof currentUser !== 'undefined' && currentUser && currentUser.photoURL) {
        avatarEl.src = currentUser.photoURL;
    }

    // Update stats
    const statCurrent = document.getElementById('kingdomStatCurrent');
    if (statCurrent) statCurrent.textContent = currentKingdom.name;

    const statStreak = document.getElementById('kingdomStatStreak');
    if (statStreak) statStreak.textContent = kingdomState.consecutiveWins;

    const statWinsNeeded = document.getElementById('kingdomStatWinsNeeded');
    if (statWinsNeeded) {
        if (nextKingdom) {
            const needed = nextKingdom.requiredStreak - kingdomState.consecutiveWins;
            statWinsNeeded.textContent = Math.max(0, needed);
        } else {
            statWinsNeeded.textContent = '🎉';
        }
    }

    // Update progress
    const nextLabel = document.getElementById('kingdomNextLabel');
    const progressFill = document.getElementById('kingdomProgressFill');
    const progressText = document.getElementById('kingdomProgressText');

    if (nextKingdom) {
        if (nextLabel) nextLabel.textContent = nextKingdom.emoji + ' ' + nextKingdom.name;
        if (progressFill) progressFill.style.width = Math.min(progress, 100) + '%';
        if (progressText) progressText.textContent = kingdomState.consecutiveWins + ' / ' + nextKingdom.requiredStreak + ' wins';
    } else {
        if (nextLabel) nextLabel.textContent = '🏆 MAX LEVEL';
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = 'Maximum level reached!';
    }

    // Update description
    const descEl = document.getElementById('kingdomDescription');
    if (descEl) descEl.textContent = currentKingdom.description;

    // Update kingdom journey
    updateKingdomJourney(currentKingdom);
}

function updateKingdomJourney(currentKingdom) {
    const container = document.getElementById('kingdomJourney');
    if (!container) return;

    container.innerHTML = '';

    KINGDOM_LEVELS.forEach(function(kingdom) {
        const kingdomIndex = KINGDOM_LEVELS.indexOf(kingdom);
        const currentIndex = KINGDOM_LEVELS.findIndex(k => k.id === kingdomState.currentLevel);
        const isCompleted = kingdomIndex < currentIndex;
        const isCurrent = kingdom.id === kingdomState.currentLevel;
        const isLocked = kingdomIndex > currentIndex;

        const step = document.createElement('div');
        step.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            padding: 6px 4px;
            border-radius: 10px;
            min-width: 44px;
            flex: 1;
            text-align: center;
            background: ${isCompleted ? '#dcf5e4' : isCurrent ? '#ffe4d6' : '#f5f5f5'};
            ${isCurrent ? 'border: 2px solid #FF7A1A;' : ''}
            opacity: ${isLocked ? '0.5' : '1'};
            transition: all 0.3s ease;
        `;

        step.innerHTML = `
            <div style="font-size: 18px;">${kingdom.emoji}</div>
            <div style="font-size: 7px; font-weight: 600; color: ${isCurrent ? '#FF7A1A' : isCompleted ? '#22c55e' : '#aaa'}; line-height: 1.2; max-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${kingdom.name}</div>
            <div style="font-size: 10px; margin-top: 1px;">${isCompleted ? '✅' : isCurrent ? '●' : '🔒'}</div>
        `;

        container.appendChild(step);
    });
}

// ===== END KINGDOM UI FUNCTIONS =====
