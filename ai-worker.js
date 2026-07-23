// ============================================================
// ai-worker.js — standalone custom minimax/alpha-beta chess engine
// meant to run inside a Web Worker.
//
// NOTE: this is a second, hand-rolled engine, separate from the
// Stockfish-based ai.js that index.html currently loads. It is NOT
// wired into index.html right now — nothing creates
// `new Worker("ai-worker.js")` yet. Kept as-is (with the previously
// truncated alphaBeta completed) so it's ready to use if you want to
// swap engines or offer it as an alternative difficulty mode later.
// ============================================================

let pieces = [];
let whiteKingMoved = false;
let blackKingMoved = false;
let whiteLeftRookMoved = false;
let whiteRightRookMoved = false;
let blackLeftRookMoved = false;
let blackRightRookMoved = false;

const pieceValues = { P: 100, N: 320, B: 340, R: 500, Q: 900, K: 20000 };

const pieceSquareTable = {
    P: [
        0,0,0,0,0,0,0,0,
        5,10,10,-20,-20,10,10,5,
        5,-5,-10,0,0,-10,-5,5,
        0,0,0,20,20,0,0,0,
        5,5,10,25,25,10,5,5,
        10,10,20,30,30,20,10,10,
        50,50,50,50,50,50,50,50,
        0,0,0,0,0,0,0,0
    ],
    N: [
        -50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,0,0,0,0,-20,-40,
        -30,0,10,15,15,10,0,-30,
        -30,5,15,20,20,15,5,-30,
        -30,0,15,20,20,15,0,-30,
        -30,5,10,15,15,10,5,-30,
        -40,-20,0,5,5,0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50
    ]
};

const kingMiddleTable = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
    20,20,0,0,0,0,20,20,
    20,30,10,0,0,10,30,20
];

const kingEndTable = [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,0,0,-10,-20,-30,
    -30,-10,20,30,30,20,-10,-30,
    -30,-10,30,40,40,30,-10,-30,
    -30,-10,30,40,40,30,-10,-30,
    -30,-10,20,30,30,20,-10,-30,
    -30,-30,0,0,0,0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50
];

const startSquares = {
    bN: [[0,1],[0,6]],
    bB: [[0,2],[0,5]],
    wN: [[7,1],[7,6]],
    wB: [[7,2],[7,5]]
};

function isOnStartSquare(piece, r, c){
    const squares = startSquares[piece];
    if(!squares) return false;
    return squares.some(sq => sq[0] === r && sq[1] === c);
}

function isPassedPawn(r, c, piece){

    if(piece === "wP"){
        for(let rr = r - 1; rr >= 0; rr--){
            for(let cc = c - 1; cc <= c + 1; cc++){
                if(cc < 0 || cc > 7) continue;
                if(pieces[rr][cc] === "bP") return false;
            }
        }
        return true;
    }

    if(piece === "bP"){
        for(let rr = r + 1; rr < 8; rr++){
            for(let cc = c - 1; cc <= c + 1; cc++){
                if(cc < 0 || cc > 7) continue;
                if(pieces[rr][cc] === "wP") return false;
            }
        }
        return true;
    }

    return false;
}

function getNonPawnMaterial(){
    let total = 0;
    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const piece = pieces[r][c];
            if(piece === "") continue;
            if(piece[1] !== "P" && piece[1] !== "K"){
                total += pieceValues[piece[1]];
            }
        }
    }
    return total;
}

let searchDeadline = 0;
let timeUp = false;
let killerMoves = [];

function isWhite(piece){ return piece.startsWith("w"); }
function isBlack(piece){ return piece.startsWith("b"); }

function getPawnAttackSquares(r, c, piece){
    let squares = [];
    if(piece === "wP"){
        if(r > 0 && c > 0) squares.push({r:r-1,c:c-1});
        if(r > 0 && c < 7) squares.push({r:r-1,c:c+1});
    }
    if(piece === "bP"){
        if(r < 7 && c > 0) squares.push({r:r+1,c:c-1});
        if(r < 7 && c < 7) squares.push({r:r+1,c:c+1});
    }
    return squares;
}

function getPawnMoves(r, c, piece){
    let moves = [];
    if(piece === "wP"){
        if(r > 0 && pieces[r-1][c] === "") moves.push({r:r-1,c:c});
        if(r === 6 && pieces[r-1][c] === "" && pieces[r-2][c] === "") moves.push({r:r-2,c:c});
        if(r > 0 && c > 0 && isBlack(pieces[r-1][c-1])) moves.push({r:r-1,c:c-1});
        if(r > 0 && c < 7 && isBlack(pieces[r-1][c+1])) moves.push({r:r-1,c:c+1});
    }
    if(piece === "bP"){
        if(r < 7 && pieces[r+1][c] === "") moves.push({r:r+1,c:c});
        if(r === 1 && pieces[r+1][c] === "" && pieces[r+2][c] === "") moves.push({r:r+2,c:c});
        if(r < 7 && c > 0 && isWhite(pieces[r+1][c-1])) moves.push({r:r+1,c:c-1});
        if(r < 7 && c < 7 && isWhite(pieces[r+1][c+1])) moves.push({r:r+1,c:c+1});
    }
    return moves;
}

function getRookMoves(r, c, piece){
    let moves = [];
    const directions = [[-1,0],[1,0],[0,-1],[0,1]];
    for(const [dr, dc] of directions){
        let row = r + dr, col = c + dc;
        while(row >= 0 && row < 8 && col >= 0 && col < 8){
            if(pieces[row][col] === ""){
                moves.push({r:row, c:col});
            }else{
                if((isWhite(piece) && isBlack(pieces[row][col])) || (isBlack(piece) && isWhite(pieces[row][col]))){
                    moves.push({r:row, c:col});
                }
                break;
            }
            row += dr; col += dc;
        }
    }
    return moves;
}

function getBishopMoves(r, c, piece){
    let moves = [];
    const directions = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for(const [dr, dc] of directions){
        let row = r + dr, col = c + dc;
        while(row >= 0 && row < 8 && col >= 0 && col < 8){
            if(pieces[row][col] === ""){
                moves.push({r:row,c:col});
            }else{
                if((isWhite(piece) && isBlack(pieces[row][col])) || (isBlack(piece) && isWhite(pieces[row][col]))){
                    moves.push({r:row,c:col});
                }
                break;
            }
            row += dr; col += dc;
        }
    }
    return moves;
}

function getQueenMoves(r, c, piece){
    return [...getRookMoves(r, c, piece), ...getBishopMoves(r, c, piece)];
}

function getKnightMoves(r, c, piece){
    let moves = [];
    const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for(const [dr, dc] of knightMoves){
        let row = r + dr, col = c + dc;
        if(row >= 0 && row < 8 && col >= 0 && col < 8){
            if(pieces[row][col] === "" || (isWhite(piece) && isBlack(pieces[row][col])) || (isBlack(piece) && isWhite(pieces[row][col]))){
                moves.push({r:row,c:col});
            }
        }
    }
    return moves;
}

function getKingMoves(r, c, piece){
    let moves = [];
    const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for(const [dr, dc] of directions){
        let row = r + dr, col = c + dc;
        if(row >= 0 && row < 8 && col >= 0 && col < 8){
            if(pieces[row][col] === "" || (isWhite(piece) && isBlack(pieces[row][col])) || (isBlack(piece) && isWhite(pieces[row][col]))){
                moves.push({r:row,c:col});
            }
        }
    }
    if(piece === "wK" && !whiteKingMoved && !whiteRightRookMoved && canCastle(7,4,7,"black")) moves.push({r:7,c:6});
    if(piece === "wK" && !whiteKingMoved && !whiteLeftRookMoved && canCastle(7,4,0,"black")) moves.push({r:7,c:2});
    if(piece === "bK" && !blackKingMoved && !blackRightRookMoved && canCastle(0,4,7,"white")) moves.push({r:0,c:6});
    if(piece === "bK" && !blackKingMoved && !blackLeftRookMoved && canCastle(0,4,0,"white")) moves.push({r:0,c:2});
    return moves;
}

function getPossibleMoves(piece, r, c){
    if(piece === "wP" || piece === "bP") return getPawnMoves(r, c, piece);
    if(piece === "wR" || piece === "bR") return getRookMoves(r, c, piece);
    if(piece === "wB" || piece === "bB") return getBishopMoves(r, c, piece);
    if(piece === "wQ" || piece === "bQ") return getQueenMoves(r, c, piece);
    if(piece === "wN" || piece === "bN") return getKnightMoves(r, c, piece);
    if(piece === "wK" || piece === "bK") return getKingMoves(r, c, piece);
    return [];
}

function findKing(color){
    const king = color === "white" ? "wK" : "bK";
    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            if(pieces[r][c] === king) return {r, c};
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
                const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
                for(const [dr,dc] of directions){
                    let nr = r + dr, nc = c + dc;
                    if(nr>=0 && nr<8 && nc>=0 && nc<8) squares.push({r:nr,c:nc});
                }
            }else if(piece === "wP" || piece === "bP"){
                squares = getPawnAttackSquares(r, c, piece);
            }else{
                squares = getPossibleMoves(piece, r, c);
            }

            if(squares.some(sq => sq.r === row && sq.c === col)) return true;
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
    if(pieces[row][rookCol] !== rook) return false;
    let step = rookCol > kingCol ? 1 : -1;
    for(let c = kingCol + step; c != rookCol; c += step){
        if(pieces[row][c] !== "") return false;
    }
    for(let c = kingCol; c != kingCol + step * 3; c += step){
        if(isSquareUnderAttack(row, c, attackerColor)) return false;
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
                if(tryMove(r, c, move.r, move.c, color)) return true;
            }
        }
    }
    return false;
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
                    allMoves.push({from:{r:r,c:c}, to:{r:move.r,c:move.c}});
                }
            }
        }
    }
    return allMoves;
}

function makeMove(move){
    const movingPiece = pieces[move.from.r][move.from.c];
    pieces[move.to.r][move.to.c] = movingPiece;
    pieces[move.from.r][move.from.c] = "";
    if(movingPiece === "bK"){
        if(move.from.c === 4 && move.to.c === 6){ pieces[0][5] = pieces[0][7]; pieces[0][7] = ""; }
        if(move.from.c === 4 && move.to.c === 2){ pieces[0][3] = pieces[0][0]; pieces[0][0] = ""; }
    }
    if(movingPiece === "wK"){
        if(move.from.c === 4 && move.to.c === 6){ pieces[7][5] = pieces[7][7]; pieces[7][7] = ""; }
        if(move.from.c === 4 && move.to.c === 2){ pieces[7][3] = pieces[7][0]; pieces[7][0] = ""; }
    }
    if(movingPiece === "bP" && move.to.r === 7) pieces[move.to.r][move.to.c] = "bQ";
    if(movingPiece === "wP" && move.to.r === 0) pieces[move.to.r][move.to.c] = "wQ";
}

function undoMoveAI(move, capturedPiece){
    let movingPiece = pieces[move.to.r][move.to.c];
    if(movingPiece === "bQ" && move.from.r === 6 && move.to.r === 7) movingPiece = "bP";
    if(movingPiece === "wQ" && move.from.r === 1 && move.to.r === 0) movingPiece = "wP";
    if(movingPiece === "bK"){
        if(move.from.c === 4 && move.to.c === 6){ pieces[0][7] = pieces[0][5]; pieces[0][5] = ""; }
        if(move.from.c === 4 && move.to.c === 2){ pieces[0][0] = pieces[0][3]; pieces[0][3] = ""; }
    }
    if(movingPiece === "wK"){
        if(move.from.c === 4 && move.to.c === 6){ pieces[7][7] = pieces[7][5]; pieces[7][5] = ""; }
        if(move.from.c === 4 && move.to.c === 2){ pieces[7][0] = pieces[7][3]; pieces[7][3] = ""; }
    }
    pieces[move.from.r][move.from.c] = movingPiece;
    pieces[move.to.r][move.to.c] = capturedPiece;
}

function evaluateBoard(){
    let score = 0;
    const blackInCheck = isKingInCheck("black");
    const whiteInCheck = isKingInCheck("white");

    const nonPawnMaterial = getNonPawnMaterial();
    const isEndgame = nonPawnMaterial <= 2600;

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const piece = pieces[r][c];
            if(piece === "") continue;

            let value = pieceValues[piece[1]];
            const index = r * 8 + c;

            if(piece[1] === "K"){

                const table = isEndgame ? kingEndTable : kingMiddleTable;
                if(isBlack(piece)) value += table[index];
                else value += table[63 - index];

            }else if(pieceSquareTable[piece[1]]){

                if(isBlack(piece)) value += pieceSquareTable[piece[1]][index];
                else value += pieceSquareTable[piece[1]][63 - index];

            }

            if(r >= 2 && r <= 5 && c >= 2 && c <= 5) value += 20;
            if(piece[1] === "N" && r >= 2 && r <= 5 && c >= 2 && c <= 5) value += 40;
            if(piece[1] === "B") value += 15;

            if((piece[1] === "N" || piece[1] === "B") && !isEndgame){
                if(!isOnStartSquare(piece, r, c)){
                    value += 15;
                }
            }

            if(piece[1] === "R"){
                let blocked = false;
                for(let i = 0; i < 8; i++){
                    if(i !== r && pieces[i][c] !== "" && pieces[i][c][1] === "P"){ blocked = true; break; }
                }
                if(!blocked) value += 30;
            }

            if(piece[1] === "Q"){
                const moves = getPossibleMoves(piece, r, c);
                value += moves.length * 2;
            }

            if(piece[1] === "P"){

                const advancement = isBlack(piece) ? r : (7 - r);
                value += advancement * 12;

                if(isPassedPawn(r, c, piece)){
                    value += 20 + advancement * (isEndgame ? 25 : 12);
                }
            }

            if(!isEndgame){
                if(piece === "bK" && c === 6) value += 60;
                if(piece === "wK" && c === 6) value += 60;
            }

            if(isBlack(piece)){
                score += value;
                if(blackInCheck) score -= 50;
            }else{
                score -= value;
                if(whiteInCheck) score += 50;
            }
        }
    }

    let whiteBishops = 0, blackBishops = 0;
    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            if(pieces[r][c] === "wB") whiteBishops++;
            if(pieces[r][c] === "bB") blackBishops++;
        }
    }
    if(blackBishops >= 2) score += 40;
    if(whiteBishops >= 2) score -= 40;

    return score;
}

function quiescence(alpha, beta, maximizing){

    if(Date.now() > searchDeadline){
        timeUp = true;
        return evaluateBoard();
    }

    const standPat = evaluateBoard();

    if(maximizing){
        if(standPat >= beta) return beta;
        if(alpha < standPat) alpha = standPat;
    }else{
        if(standPat <= alpha) return alpha;
        if(beta > standPat) beta = standPat;
    }

    const color = maximizing ? "black" : "white";
    const moves = getAllMoves(color).filter(move => pieces[move.to.r][move.to.c] !== "");

    for(const move of moves){

        const captured = pieces[move.to.r][move.to.c];
        makeMove(move);
        const score = quiescence(alpha, beta, !maximizing);
        undoMoveAI(move, captured);

        if(maximizing){
            if(score >= beta) return beta;
            if(score > alpha) alpha = score;
        }else{
            if(score <= alpha) return alpha;
            if(score < beta) beta = score;
        }

        if(timeUp) return maximizing ? alpha : beta;
    }

    return maximizing ? alpha : beta;
}

function alphaBeta(depth, alpha, beta, maximizing){

    if(Date.now() > searchDeadline){
        timeUp = true;
        return evaluateBoard();
    }

    if(depth === 0) return quiescence(alpha, beta, maximizing);
    if(!hasLegalMoves("white")) return isKingInCheck("white") ? 100000 : 0;
    if(!hasLegalMoves("black")) return isKingInCheck("black") ? -100000 : 0;

    const color = maximizing ? "black" : "white";
    let moves = getAllMoves(color);
    if(moves.length === 0) return evaluateBoard();

    const killer = killerMoves[depth];
    if(killer){
        const killerIndex = moves.findIndex(m =>
            m.from.r === killer.from.r && m.from.c === killer.from.c &&
            m.to.r === killer.to.r && m.to.c === killer.to.c
        );
        if(killerIndex > 0){
            const [k] = moves.splice(killerIndex, 1);
            moves.unshift(k);
        }
    }

    if(maximizing){

        let best = -Infinity;

        for(const move of moves){
            const captured = pieces[move.to.r][move.to.c];
            makeMove(move);
            best = Math.max(best, alphaBeta(depth - 1, alpha, beta, false));
            undoMoveAI(move, captured);
            alpha = Math.max(alpha, best);
            if(beta <= alpha){
                killerMoves[depth] = move;
                break;
            }
            if(timeUp) break;
        }

        return best;

    }else{

        let best = Infinity;

        for(const move of moves){
            const captured = pieces[move.to.r][move.to.c];
            makeMove(move);
            best = Math.min(best, alphaBeta(depth - 1, alpha, beta, true));
            undoMoveAI(move, captured);
            beta = Math.min(beta, best);
            if(beta <= alpha){
                killerMoves[depth] = move;
                break;
            }
            if(timeUp) break;
        }

        return best;

    }
}

// Iterative deepening: search depth 1, then 2, then 3... until the time
// budget runs out, always keeping the best move found by the last fully
// completed depth (a partial/aborted depth's result is discarded).
function findBestMove(color, timeBudgetMs){

    searchDeadline = Date.now() + timeBudgetMs;
    timeUp = false;
    killerMoves = [];

    const maximizing = color === "black";
    let bestMove = null;
    let depth = 1;

    while(!timeUp && depth <= 6){

        let currentBest = null;
        let currentBestScore = maximizing ? -Infinity : Infinity;

        const moves = getAllMoves(color);

        for(const move of moves){
            const captured = pieces[move.to.r][move.to.c];
            makeMove(move);
            const score = alphaBeta(depth - 1, -Infinity, Infinity, !maximizing);
            undoMoveAI(move, captured);

            if(timeUp) break;

            if(maximizing && score > currentBestScore){
                currentBestScore = score;
                currentBest = move;
            }else if(!maximizing && score < currentBestScore){
                currentBestScore = score;
                currentBest = move;
            }
        }

        if(!timeUp && currentBest){
            bestMove = currentBest;
        }

        depth++;
    }

    return bestMove;
}

// ---- Worker message protocol ----
// Main thread posts: { pieces, color, timeBudgetMs, castling state fields }
// Worker posts back: { from, to } or null if no legal move was found.
self.onmessage = function(e){

    const msg = e.data || {};

    pieces = msg.pieces;
    whiteKingMoved = !!msg.whiteKingMoved;
    blackKingMoved = !!msg.blackKingMoved;
    whiteLeftRookMoved = !!msg.whiteLeftRookMoved;
    whiteRightRookMoved = !!msg.whiteRightRookMoved;
    blackLeftRookMoved = !!msg.blackLeftRookMoved;
    blackRightRookMoved = !!msg.blackRightRookMoved;

    const move = findBestMove(msg.color || "black", msg.timeBudgetMs || 1000);

    self.postMessage(move);

};
