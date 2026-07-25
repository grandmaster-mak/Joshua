// ============================================================
// Play vs Coach — a full-strength AI opponent (reuses the existing
// Stockfish-backed AI engine as-is) with a running commentary layer.
//
// How it works:
// - openPlayVsCoach() just starts a normal "ai" mode game on hard
//   difficulty, with isCoachMode=true. Every existing AI/online/human
//   code path is untouched — this never introduces a new game mode at
//   the engine level, only a UI flag.
// - Every time the coach (Stockfish) finishes calculating its reply, the
//   evaluation score it already computed is reused (see ai.js) to judge
//   how the player's last move affected the position — no extra engine
//   calls needed.
// - Every time it becomes the player's turn again, the board is scanned
//   for any undefended piece under attack and the coach proactively
//   warns about it.
// ============================================================

let coachLastEvalCp = null;

function openPlayVsCoach(){

    isCoachMode = true;
    gameMode = "ai";
    aiDifficulty = "hard"; // Stockfish at full strength — meant to be very hard to beat.
    selectedTime = 600;

    closeTimeControl();
    newGame();

    setCoachText("Let's play — I'll comment on your moves as we go. Good luck!");

}

function resetCoachEval(){
    coachLastEvalCp = null;
}

function setCoachText(text){
    const el = document.getElementById("coachGameText");
    if(el) el.textContent = text;
}

// whiteEvalCp: the position's evaluation in centipawns from the player's
// (White's) perspective, positive = good for the player. Called right
// after the coach finishes thinking about its reply — i.e. it reflects
// how the player's last move changed the evaluation.
function giveCoachCommentary(whiteEvalCp){

    if(!isCoachMode) return;

    if(coachLastEvalCp === null){
        coachLastEvalCp = whiteEvalCp;
        return; // first move of the game — nothing to compare against yet
    }

    const delta = whiteEvalCp - coachLastEvalCp;
    coachLastEvalCp = whiteEvalCp;

    let line;

    if(delta <= -300){
        line = pickCoachLine([
            "😬 Ouch — that was a real blunder. You just handed me a big advantage.",
            "😬 That move loses significant material or position. Careful with the next one.",
            "😬 Big mistake there — I like my chances a lot more now."
        ]);
    }else if(delta <= -120){
        line = pickCoachLine([
            "❌ That's a weak move — your position just got noticeably worse.",
            "❌ Not your best. You gave up some ground there.",
            "❌ I wouldn't have played that — it costs you something."
        ]);
    }else if(delta < 60){
        line = pickCoachLine([
            "➖ A reasonable move — nothing gained, nothing lost.",
            "➖ Solid enough. The position's still roughly balanced.",
            "➖ Fine move. Let's see what you do next."
        ]);
    }else if(delta < 250){
        line = pickCoachLine([
            "✅ Good move — that improved your position.",
            "✅ Nice — you're gaining ground.",
            "✅ That's a strong choice."
        ]);
    }else{
        line = pickCoachLine([
            "🌟 Excellent move! That's a big improvement for you.",
            "🌟 Wow, that's a great find — real progress there.",
            "🌟 Strong play — you're doing well."
        ]);
    }

    if(whiteEvalCp <= -400){
        line += " You're in real trouble on the board right now.";
    }else if(whiteEvalCp >= 400){
        line += " And overall, you're clearly ahead — keep it up.";
    }

    setCoachText(line);

}

function pickCoachLine(arr){
    return arr[Math.floor(Math.random() * arr.length)];
}

// Warns about any of the player's own pieces that are currently under
// attack and have no defender — a purely board-logic check, no engine
// call needed (reuses isSquareUnderAttack/pieceValues from script.js).
function checkCoachHangingPieces(){

    if(!isCoachMode) return;
    if(typeof pieces === "undefined") return;

    let worst = null;

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){

            const piece = pieces[r][c];
            if(piece === "" || !isWhite(piece) || piece === "wK") continue;

            const isAttacked = isSquareUnderAttack(r, c, "black");
            if(!isAttacked) continue;

            const isDefended = isSquareUnderAttack(r, c, "white");
            if(isDefended) continue;

            const value = pieceValues[piece[1]];
            if(!worst || value > worst.value){
                worst = { r: r, c: c, value: value, piece: piece };
            }

        }
    }

    if(worst){
        const pieceNames = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen" };
        const name = pieceNames[worst.piece[1]] || "piece";
        setCoachText("⚠️ Watch out — your " + name + " on " + squareName(worst.r, worst.c) + " is undefended.");
    }else{
        setCoachText(pickCoachLine([
            "Your move — what's the plan?",
            "Take your time and look for the best move.",
            "No immediate threats to your pieces — think about your next idea.",
            "Your turn. Consider your opponent's threats too."
        ]));
    }

}
