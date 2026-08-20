// ============================================================
// Opponent Clone — an AI opponent whose PLAYING STYLE (not literal
// move choices) is shaped by six traits computed from someone's real
// recorded games against you: Tactical Awareness, Aggression,
// Calculation, Defensive Solidity, Endgame Skill, and Opening Prep —
// the same six traits Chess DNA already scores for YOU, just aimed at
// an opponent this time.
//
// How the traits actually change play:
//  - Tactics/Aggression bias WHICH of Stockfish's candidate moves gets
//    picked (favors captures and advancing moves when those traits
//    are high).
//  - Calculation controls how long/deep the engine thinks.
//  - Opening/Endgame traits adjust search settings specifically during
//    those phases of the game.
//  - Defense checks whether the clone has a piece hanging right now
//    (reusing isSquareUnderAttack, same as the Coach feature) and, if
//    their Defense score is high, forces the engine's own top choice
//    instead of a riskier weighted pick.
//
// Honest limitation: traits are estimated from move notation and
// win/loss/game-length patterns across past games, not a full replay
// of every board position — a real, data-driven approximation, not a
// literal recreation of how they think. Gets sharper the more times
// you've actually played them.
// ============================================================

let cloneModeActive = false;
let cloneOpponentName = null;
let cloneTactics = 50;
let cloneAggression = 50;
let cloneCalculation = 50;
let cloneDefense = 50;
let cloneEndgame = 50;
let cloneOpening = 50;
let lastLossOpponentUid = null;
let lastLossOpponentName = null;

function suggestCloneAfterLoss(opponentUid, opponentName){
    lastLossOpponentUid = opponentUid;
    lastLossOpponentName = opponentName;
    const btn = document.getElementById("playCloneSuggestionBtn");
    if(btn && gameMode === "online" && isCloneGame === false && lastLossOpponentUid){
        btn.style.display = "block";
    } else {
        btn.style.display = "none";
    }
}

function startCloneFromSuggestion(){
    if(lastLossOpponentUid){
        document.getElementById("playCloneSuggestionBtn").style.display = "none";
        closePopup(); // close game over popup
        startCloneMatch(lastLossOpponentUid, lastLossOpponentName || "Opponent");
    }
}
function cloneClamp(n){
    return Math.max(5, Math.min(95, Math.round(n)));
}

function startCloneMatch(opponentUid, opponentName){

    if(!currentUser || !db) return;

    db.ref("users/" + currentUser.uid + "/opponentGames/" + opponentUid).once("value").then(function(snapshot){

        if(!snapshot.exists()){
            showInfoPopup("🧬 Not Enough Data", "You haven't played " + opponentName + " online yet — play them at least once to start building their clone.");
            return;
        }

        const games = [];
        snapshot.forEach(function(child){ games.push(child.val()); });

        buildCloneProfile(games);

        cloneModeActive = true;
        cloneModeActive = true;
isCloneGame = true;  
        cloneOpponentName = opponentName;

        gameMode = "ai";
        ratedAIActive = false;
        isCoachMode = false;
        aiDifficulty = "medium";
        selectedTime = 600;

        closeTimeControl();
        newGame();

        blackPlayer = opponentName + " (Clone)";
        blackFlag = "🧬";
        updatePlayerNames();

        const traitSummary =
            "Tactics " + cloneTactics + "% · Aggression " + cloneAggression + "% · Calculation " + cloneCalculation + "%\n" +
            "Defense " + cloneDefense + "% · Endgame " + cloneEndgame + "% · Opening " + cloneOpening + "%";

        showInfoPopup("🧬 Clone Ready", "An AI shaped by " + opponentName + "'s playing style, built from " + games.length + " game(s) between you.\n\n" + traitSummary + "\n\nUnrated practice — have fun!");

    });

}

// Builds the six style traits from every past game's move list. Each
// game's "result" field is the RECORDING PLAYER'S (i.e. your) result,
// so it's read in reverse here to describe the opponent: you winning
// means they lost, and vice versa.
function buildCloneProfile(games){

    let totalMoves = 0, captures = 0, advances = 0;
    let opponentWins = 0, opponentLosses = 0;
    let shortLossCount = 0;      // they lost quickly -> weaker defense
    let longSurvivalCount = 0;   // long game they didn't lose -> stronger endgame
    let openingScoreSum = 0;
    const totalGames = games.length;

    games.forEach(function(game){

        const moves = game.moves || [];
        const oppColor = game.opponentColor || "black";
        const startIdx = oppColor === "white" ? 0 : 1;

        const theirMoves = [];
        for(let i = startIdx; i < moves.length; i += 2){
            if(moves[i]) theirMoves.push(moves[i]);
        }

        theirMoves.forEach(function(m){
            totalMoves++;
            if(m.indexOf("x") !== -1) captures++;
            const match = m.match(/([a-h])([1-8])$/);
            if(match){
                const rank = parseInt(match[2], 10);
                const inOpponentHalf = oppColor === "white" ? rank >= 5 : rank <= 4;
                if(inOpponentHalf) advances++;
            }
        });

        // game.result is YOUR result for this game.
        if(game.result === "win") opponentLosses++;
        else if(game.result === "loss") opponentWins++;

        if(game.result === "win" && moves.length < 24) shortLossCount++;
        if(moves.length >= 40 && game.result !== "win") longSurvivalCount++;

        const openingMoves = theirMoves.slice(0, Math.min(10, theirMoves.length));
        let score = 30;
        if(openingMoves.slice(0, 4).some(function(m){ return /^[de][45]$/.test(m); })) score += 20;
        if(openingMoves.some(function(m){ return /^K[gc][18]$/.test(m); })) score += 30;
        const developedCount = openingMoves.slice(0, 6).filter(function(m){ return /^[NB]x?/.test(m); }).length;
        score += Math.min(developedCount, 2) * 10;
        if(openingMoves.slice(0, 4).some(function(m){ return /^Qx?/.test(m); })) score -= 15;
        openingScoreSum += Math.max(5, Math.min(100, score));

    });

    cloneTactics = totalMoves > 0 ? cloneClamp((captures / totalMoves) * 160) : 50;
    cloneAggression = totalMoves > 0 ? cloneClamp((advances / totalMoves) * 140) : 50;

    const totalDecisive = opponentWins + opponentLosses;
    cloneCalculation = totalDecisive > 0 ? cloneClamp((opponentWins / totalDecisive) * 100) : 50;

    cloneDefense = totalGames > 0 ? cloneClamp(100 - (shortLossCount / totalGames) * 120) : 50;
    cloneEndgame = totalGames > 0 ? cloneClamp((longSurvivalCount / totalGames) * 140) : 50;
    cloneOpening = totalGames > 0 ? cloneClamp(openingScoreSum / totalGames) : 50;

}

// ---- Style-driven move behavior, used by ai.js during a Clone match ----

function cloneDetectPhase(){
    if(typeof moveHistory !== "undefined" && moveHistory.length < 20) return "opening";
    let nonPawnMaterial = 0;
    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const piece = pieces[r][c];
            if(!piece || piece[1] === "P" || piece[1] === "K") continue;
            nonPawnMaterial += pieceValues[piece[1]] || 0;
        }
    }
    return nonPawnMaterial <= 2600 ? "endgame" : "middlegame";
}

function cloneOwnPieceHanging(){
    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const piece = pieces[r][c];
            if(piece === "" || !isBlack(piece) || piece === "bK") continue;
            if(isSquareUnderAttack(r, c, "white") && !isSquareUnderAttack(r, c, "black")) return true;
        }
    }
    return false;
}

// Returns the {elo, movetime, multipv} to search with, shaped by
// whichever trait governs the current phase of the game.
function getCloneSearchSettings(){

    const phase = cloneDetectPhase();
    let multipv, movetime;

    if(phase === "opening"){
        multipv = cloneOpening >= 65 ? 1 : cloneOpening >= 35 ? 2 : 3;
        movetime = 500;
    }else if(phase === "endgame"){
        multipv = cloneEndgame >= 65 ? 1 : cloneEndgame >= 35 ? 2 : 3;
        movetime = 400 + cloneEndgame * 6;
    }else{
        multipv = cloneTactics >= 65 ? 1 : cloneTactics >= 35 ? 2 : 3;
        movetime = 400 + cloneCalculation * 6;
    }

    return { elo: 1600, movetime: Math.max(400, Math.min(1300, movetime)), multipv: multipv };

}

// Picks which of Stockfish's ranked candidate moves to actually play,
// weighted by style rather than picking the raw engine-best every time.
function pickCloneCandidateIndex(candidates){

    if(!candidates || candidates.length <= 1) return 0;

    // A high-Defense clone reliably addresses a hanging piece by just
    // playing the engine's own top suggestion; a low-Defense one keeps
    // rolling the weighted dice even while under threat.
    if(cloneOwnPieceHanging() && cloneDefense >= 55) return 0;

    const scores = candidates.map(function(uciMove, idx){

        let score = (candidates.length - idx) * 20;

        const toCoord = squareToCoords(uciMove.substring(2, 4));
        const isCapture = pieces[toCoord.r][toCoord.c] !== "";

        if(isCapture) score += (cloneTactics + cloneAggression) / 3;
        if(toCoord.r >= 4) score += cloneAggression / 4;

        return Math.max(1, score);

    });

    const total = scores.reduce(function(a, b){ return a + b; }, 0);
    let roll = Math.random() * total;

    for(let i = 0; i < scores.length; i++){
        roll -= scores[i];
        if(roll <= 0) return i;
    }

    return 0;

}
