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

// Helper to translate coach strings via i18n, with English fallback
function coachT(key, fallback){
    if(typeof t === "function"){
        const translated = t(key);
        if(translated !== key) return translated;
    }
    return fallback;
}

function openPlayVsCoach(){

    isCoachMode = true;
    ratedAIActive = false;
    gameMode = "ai";
    aiDifficulty = "hard"; // Stockfish at full strength — meant to be very hard to beat.
    selectedTime = 600;

    closeTimeControl();
    newGame();

    setCoachText(coachT("coach.openingLine", "Let's play — I'll comment on your moves as we go. Good luck!"));

}

function resetCoachEval(){
    coachLastEvalCp = null;
}

function setCoachText(text){
    const el = document.getElementById("coachGameText");
    if(el) el.textContent = text;
    speakText(text);
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
    let mood;

    if(delta <= -300){
        mood = "concerned";
        line = pickCoachLine([
            coachT("coach.blunder1", "😬 Ouch — that was a real blunder. You just handed me a big advantage."),
            coachT("coach.blunder2", "😬 That move loses significant material or position. Careful with the next one."),
            coachT("coach.blunder3", "😬 Big mistake there — I like my chances a lot more now.")
        ]);
    }else if(delta <= -120){
        mood = "concerned";
        line = pickCoachLine([
            coachT("coach.weak1", "❌ That's a weak move — your position just got noticeably worse."),
            coachT("coach.weak2", "❌ Not your best. You gave up some ground there."),
            coachT("coach.weak3", "❌ I wouldn't have played that — it costs you something.")
        ]);
    }else if(delta < 60){
        mood = "neutral";
        line = pickCoachLine([
            coachT("coach.neutral1", "➖ A reasonable move — nothing gained, nothing lost."),
            coachT("coach.neutral2", "➖ Solid enough. The position's still roughly balanced."),
            coachT("coach.neutral3", "➖ Fine move. Let's see what you do next.")
        ]);
    }else if(delta < 250){
        mood = "happy";
        line = pickCoachLine([
            coachT("coach.good1", "✅ Good move — that improved your position."),
            coachT("coach.good2", "✅ Nice — you're gaining ground."),
            coachT("coach.good3", "✅ That's a strong choice.")
        ]);
    }else{
        mood = "happy";
        line = pickCoachLine([
            coachT("coach.excellent1", "🌟 Excellent move! That's a big improvement for you."),
            coachT("coach.excellent2", "🌟 Wow, that's a great find — real progress there."),
            coachT("coach.excellent3", "🌟 Strong play — you're doing well.")
        ]);
    }

    if(whiteEvalCp <= -400){
        line += " " + coachT("coach.trouble", "You're in real trouble on the board right now.");
    }else if(whiteEvalCp >= 400){
        line += " " + coachT("coach.ahead", "And overall, you're clearly ahead — keep it up.");
    }

    if(typeof setCoachThinking === "function") setCoachThinking(false);
    if(typeof setCoachMood === "function") setCoachMood(mood);

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
        if(typeof setCoachThinking === "function") setCoachThinking(false);
        if(typeof setCoachMood === "function") setCoachMood("concerned");
        setCoachText(
            coachT("coach.hangingPiece", "⚠️ Watch out — your %PIECE% on %SQUARE% is undefended.")
                .replace("%PIECE%", name)
                .replace("%SQUARE%", squareName(worst.r, worst.c))
        );
    }else{
        if(typeof setCoachThinking === "function") setCoachThinking(true);
        if(typeof setCoachMood === "function") setCoachMood("neutral");
        setCoachText(pickCoachLine([
            coachT("coach.yourMove1", "Your move — what's the plan?"),
            coachT("coach.yourMove2", "Take your time and look for the best move."),
            coachT("coach.yourMove3", "No immediate threats to your pieces — think about your next idea."),
            coachT("coach.yourMove4", "Your turn. Consider your opponent's threats too.")
        ]));
    }

}
