// ============================================================
// Analysis Board — move either color freely and get a live engine
// evaluation + best move suggestion.
//
// Runs its own separate Stockfish worker instance (not the one in ai.js)
// so it can never interfere with an actual AI/Coach game in progress —
// the two are completely independent.
//
// Re-uses the same shared board state (pieces/selected/possibleMoves/
// currentPlayer) and legal-move helpers (getLegalMoves, isWhite, etc.)
// that every other screen in this app already shares — only one screen
// is ever "live" at a time, and each one resets that state on open.
// ============================================================

let analysisStockfish = null;
let analysisStockfishReady = false;
let analysisBestMoveUci = null;
let analysisEvalCp = null;
let analysisEvalIsMate = false;
let analysisEvalPerspective = "white";
let analysisQueryTimer = null;
let analysisFlipped = false;

function initAnalysisEngine(){

    if(analysisStockfish) return;

    try{

        analysisStockfish = new Worker("stockfish-18-lite-single.js");

        analysisStockfish.onerror = function(err){
            console.error("Analysis engine failed to load:", err.message);
            const evalEl = document.getElementById("analysisEvalText");
            if(evalEl) evalEl.textContent = "Engine failed to load.";
            analysisStockfish = null;
        };

        analysisStockfish.onmessage = function(e){

            const line = typeof e.data === "string" ? e.data : "";

            if(line === "uciok"){
                analysisStockfish.postMessage("isready");
                return;
            }

            if(line === "readyok"){
                analysisStockfishReady = true;
                runAnalysisQuery();
                return;
            }

            if(line.indexOf("info") === 0 && line.indexOf("score") !== -1){

                const tokens = line.split(" ");
                const scoreIdx = tokens.indexOf("score");

                if(scoreIdx !== -1 && tokens[scoreIdx + 1]){
                    if(tokens[scoreIdx + 1] === "cp"){
                        analysisEvalCp = parseInt(tokens[scoreIdx + 2], 10);
                        analysisEvalIsMate = false;
                    }else if(tokens[scoreIdx + 1] === "mate"){
                        analysisEvalCp = parseInt(tokens[scoreIdx + 2], 10);
                        analysisEvalIsMate = true;
                    }
                }

                const pvIdx = tokens.indexOf("pv");
                if(pvIdx !== -1 && tokens[pvIdx + 1]) analysisBestMoveUci = tokens[pvIdx + 1];

                updateAnalysisDisplay();
                return;
            }

            if(line.indexOf("bestmove") === 0){
                const parts = line.split(" ");
                if(parts[1] && parts[1] !== "(none)") analysisBestMoveUci = parts[1];
                updateAnalysisDisplay();
            }

        };

        analysisStockfish.postMessage("uci");

    }catch(err){
        console.error("Failed to start analysis engine:", err.message);
        analysisStockfish = null;
    }

}

function openAnalysisBoard(){

    initAnalysisEngine();

    // Position picker opens FIRST — the board itself doesn't load until
    // a position is actually chosen in loadAnalysisPosition() below.
    document.getElementById("appShell").style.display = "none";
    document.getElementById("analysisScreen").style.display = "flex";
    history.pushState({ screen: "analysis" }, "", "#analysis");

    openAnalysisPositionPicker();

}

function closeAnalysisBoard(){
    document.getElementById("analysisScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "analysis"){
        history.back();
    }
}

function resetAnalysisBoard(){
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
    currentPlayer = "white";
    selected = null;
    possibleMoves = [];
    lastMove = null;
    createAnalysisBoard();
    queueAnalysisQuery();
}

function flipAnalysisBoard(){
    analysisFlipped = !analysisFlipped;
    createAnalysisBoard();
}
const ANALYSIS_CATEGORY_LABELS = { opening:"Openings", middlegame:"Middlegames", endgame:"Endgames" };

function openAnalysisPositionPicker(){

    const list = document.getElementById("analysisPositionList");
    if(!list || typeof ANALYSIS_POSITIONS === "undefined") return;

    list.innerHTML = "";

    ["opening", "middlegame", "endgame"].forEach(function(cat){

        const header = document.createElement("div");
        header.className = "sub";
        header.style.fontWeight = "700";
        header.style.margin = "14px 0 6px";
        header.textContent = ANALYSIS_CATEGORY_LABELS[cat];
        list.appendChild(header);

        ANALYSIS_POSITIONS.filter(function(p){ return p.category === cat; }).forEach(function(p){
            const row = document.createElement("div");
            row.className = "standingRow";
            row.style.cursor = "pointer";
            row.innerHTML = '<span class="standingName">' + p.label + '</span>';
            row.onclick = function(){ loadAnalysisPosition(p.fen); };
            list.appendChild(row);
        });

    });

    document.getElementById("analysisPositionPopup").classList.add("show");

}

function closeAnalysisPositionPicker(){

    document.getElementById("analysisPositionPopup").classList.remove("show");

    // If no position has ever been chosen yet (board array is still
    // empty/never built), cancelling the picker should exit Analysis
    // entirely instead of leaving an unrendered blank board behind it.
    const boardEl = document.getElementById("analysisBoard");
    if(boardEl && boardEl.children.length === 0){
        closeAnalysisBoard();
    }

}
// Hides just the popup itself, no side effects — used when a position
// was actually picked (a board is about to be built immediately after,
// so there's nothing to "fall back" from). Kept separate from
// closeAnalysisPositionPicker(), which has extra logic for the Cancel/
// back-button case where NOTHING was picked and the board may still be
// empty.
function hideAnalysisPositionPopupOnly(){
    document.getElementById("analysisPositionPopup").classList.remove("show");
}
function loadAnalysisPosition(fen){

    pieces = fenToPieces(fen); // fenToPieces is defined in puzzle.js
    currentPlayer = fen.split(" ")[1] === "w" ? "white" : "black";

    selected = null;
    possibleMoves = [];
    lastMove = null;
    analysisFlipped = false;

    // Just hide the popup — NOT closeAnalysisPositionPicker(), which
    // would incorrectly treat a still-empty board (true on a fresh app
    // load, before createAnalysisBoard() below has ever run) as "nothing
    // was picked" and bounce back to Home even though a position WAS
    // just chosen.
    hideAnalysisPositionPopupOnly();

    createAnalysisBoard();
    queueAnalysisQuery();

}
function createAnalysisBoard(){

    const boardEl = document.getElementById("analysisBoard");
    boardEl.innerHTML = "";

    const mainArrow = document.getElementById("analysisArrowMain");
    const ponderArrow = document.getElementById("analysisArrowPonder");
    if(mainArrow) mainArrow.style.display = "none";
    if(ponderArrow) ponderArrow.style.display = "none";
    for(let i = 0; i < 8; i++){
        for(let j = 0; j < 8; j++){

            const r = analysisFlipped ? 7 - i : i;
            const c = analysisFlipped ? 7 - j : j;

            const square = document.createElement("div");
            square.classList.add("square");
            square.classList.add((r + c) % 2 === 0 ? "light" : "dark");

            if(selected && selected.r === r && selected.c === c){
                square.classList.add("selected");
            }
            if(possibleMoves.some(function(m){ return m.r === r && m.c === c; })){
                square.classList.add("possible");
            }
            if(lastMove && ((lastMove.from.r === r && lastMove.from.c === c) || (lastMove.to.r === r && lastMove.to.c === c))){
                square.classList.add("lastMove");
            }

            if(pieces[r][c] !== ""){
                const img = document.createElement("img");
                img.src = "pieces/" + pieces[r][c] + ".svg";
                img.className = "piece";
                square.appendChild(img);
            }

            square.onclick = (function(row, col){ return function(){ clickAnalysisSquare(row, col); }; })(r, c);

            boardEl.appendChild(square);
        }
    }

}

// Unlike a real game, any piece of either color can be moved at any
// time — this is a sandbox for exploring positions, not a rule-enforced
// match. getLegalMoves already derives the piece's own color internally,
// so no "is it your turn" gate is needed here.
function clickAnalysisSquare(r, c){

    const piece = pieces[r][c];

    if(selected == null){
        if(piece === "") return;
        selected = { r: r, c: c };
        possibleMoves = getLegalMoves(piece, r, c);
        createAnalysisBoard();
        return;
    }

    const isTarget = possibleMoves.some(function(m){ return m.r === r && m.c === c; });

    if(!isTarget){
        if(piece !== ""){
            selected = { r: r, c: c };
            possibleMoves = getLegalMoves(piece, r, c);
            createAnalysisBoard();
            return;
        }
        selected = null;
        possibleMoves = [];
        createAnalysisBoard();
        return;
    }

    const fromR = selected.r;
    const fromC = selected.c;
    const movedPiece = pieces[fromR][fromC];

    lastMove = { from: { r: fromR, c: fromC }, to: { r: r, c: c } };

    pieces[r][c] = movedPiece;
    pieces[fromR][fromC] = "";

    // Simple auto-queen promotion — analysis positions rarely hinge on
    // underpromotion, and keeping this a one-tap sandbox matters more here.
    if(movedPiece === "wP" && r === 0) pieces[r][c] = "wQ";
    if(movedPiece === "bP" && r === 7) pieces[r][c] = "bQ";

    currentPlayer = isWhite(movedPiece) ? "black" : "white";
    selected = null;
    possibleMoves = [];

    createAnalysisBoard();
    queueAnalysisQuery();

}

// Builds a FEN for whatever is on the board right now. Castling rights
// and move counters aren't tracked for freely-arranged analysis
// positions — a fixed "no castling, move 1" is a safe, standard
// simplification for ad-hoc position evaluation.
function analysisBoardToFEN(){

    let fen = "";

    for(let r = 0; r < 8; r++){

        let empty = 0;

        for(let c = 0; c < 8; c++){
            const piece = pieces[r][c];
            if(piece === ""){
                empty++;
            }else{
                if(empty > 0){ fen += empty; empty = 0; }
                const letter = piece[1];
                fen += piece[0] === "w" ? letter : letter.toLowerCase();
            }
        }

        if(empty > 0) fen += empty;
        if(r < 7) fen += "/";
    }

    fen += currentPlayer === "white" ? " w " : " b ";
    fen += "- - 0 1";

    return fen;

}

function queueAnalysisQuery(){
    clearTimeout(analysisQueryTimer);
    analysisQueryTimer = setTimeout(runAnalysisQuery, 200);
}

function runAnalysisQuery(){

    if(!analysisStockfish || !analysisStockfishReady) return;

    analysisBestMoveUci = null;
    analysisEvalCp = null;
    analysisEvalPerspective = currentPlayer;

    const evalEl = document.getElementById("analysisEvalText");
    if(evalEl) evalEl.textContent = "Thinking...";

    analysisStockfish.postMessage("position fen " + analysisBoardToFEN());
    analysisStockfish.postMessage("go movetime 800");

}
// Draws a move arrow on the analysis board — from-square to to-square,
// accounting for board flip. lineId/headId pick which of the two arrow
// styles (solid green "best move" vs dashed blue "then likely") to draw.
function drawAnalysisArrow(lineId, uciMove){

    const line = document.getElementById(lineId);
    if(!line) return;

    if(!uciMove || uciMove.length < 4){
        line.style.display = "none";
        return;
    }

    const from = squareToCoords(uciMove.substring(0, 2));
    const to = squareToCoords(uciMove.substring(2, 4));

    function displayCoords(r, c){
        const dr = analysisFlipped ? 7 - r : r;
        const dc = analysisFlipped ? 7 - c : c;
        return { x: dc * 12.5 + 6.25, y: dr * 12.5 + 6.25 };
    }

    const p1 = displayCoords(from.r, from.c);
    const p2 = displayCoords(to.r, to.c);

    // Pull the tip back slightly so the arrowhead doesn't bury itself
    // under the destination square's piece image.
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const shorten = 5;
    const tipX = p2.x - (dx / dist) * shorten;
    const tipY = p2.y - (dy / dist) * shorten;

    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", tipX);
    line.setAttribute("y2", tipY);
    line.style.display = "block";

}
function updateAnalysisDisplay(){

    const evalEl = document.getElementById("analysisEvalText");
    const bestEl = document.getElementById("analysisBestMoveText");
    const ponderEl = document.getElementById("analysisPonderText");
    if(!evalEl) return;

    if(analysisEvalCp !== null){

        // The engine's score is from whichever side was to move when the
        // query was sent — normalize it to always read from White's
        // perspective so the number means the same thing every time.
        const whiteEval = analysisEvalPerspective === "white" ? analysisEvalCp : -analysisEvalCp;

        let label;
        if(analysisEvalIsMate){
            const mateIn = analysisEvalPerspective === "white" ? analysisEvalCp : -analysisEvalCp;
            label = "Mate in " + Math.abs(mateIn) + (mateIn > 0 ? " (White)" : " (Black)");
        }else{
            const pawns = (whiteEval / 100).toFixed(2);
            label = (whiteEval > 0 ? "+" : "") + pawns;
        }

        evalEl.textContent = "Eval: " + label;

    }

    const moves = analysisBestMoveUci ? analysisBestMoveUci.split(" ").filter(Boolean) : [];
    const mainMove = moves[0] || null;
    const ponderMove = moves[1] || null;

    drawAnalysisArrow("analysisArrowMain", mainMove);
    drawAnalysisArrow("analysisArrowPonder", ponderMove);

    if(bestEl){
        bestEl.textContent = mainMove ? "Suggested: " + squareName(squareToCoords(mainMove.substring(0,2)).r, squareToCoords(mainMove.substring(0,2)).c).toUpperCase() + " → " + squareName(squareToCoords(mainMove.substring(2,4)).r, squareToCoords(mainMove.substring(2,4)).c).toUpperCase() : "";
    }
    if(ponderEl){
        ponderEl.textContent = ponderMove ? "Then likely: " + ponderMove.substring(0,2).toUpperCase() + " → " + ponderMove.substring(2,4).toUpperCase() : "";
    }

}
