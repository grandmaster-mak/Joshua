// ============================================================
// Chess DNA — a post-game "personality read" of the match you just
// played: six playstyle traits scored 0-100, plus your standout
// strength and an area to focus on. Built entirely from the game's
// own move history and board snapshots already tracked during play —
// no separate engine analysis, so treat it as a fun pattern-read of
// THIS game, not a certified skill assessment.
// ============================================================

const CHESSDNA_CAPTURE_VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
const CHESSDNA_STARTING_COUNTS = { P: 8, N: 2, B: 2, R: 2, Q: 1 };

function chessDnaClamp(n){
    return Math.max(5, Math.min(100, Math.round(n)));
}

// Tallies remaining material by color/type on a given board snapshot,
// then returns how much value each side is missing (i.e. has had
// captured) relative to a full starting army.
function chessDnaMissingValue(piecesGrid){

    const remaining = {
        w: { P:0, N:0, B:0, R:0, Q:0 },
        b: { P:0, N:0, B:0, R:0, Q:0 }
    };

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const piece = piecesGrid[r][c];
            if(!piece) continue;
            const color = piece[0] === "w" ? "w" : "b";
            const type = piece[1];
            if(remaining[color][type] !== undefined) remaining[color][type]++;
        }
    }

    let whiteMissing = 0;
    let blackMissing = 0;

    Object.keys(CHESSDNA_STARTING_COUNTS).forEach(function(type){
        const startCount = CHESSDNA_STARTING_COUNTS[type];
        const value = CHESSDNA_CAPTURE_VALUES[type];
        whiteMissing += Math.max(0, startCount - remaining.w[type]) * value;
        blackMissing += Math.max(0, startCount - remaining.b[type]) * value;
    });

    return { whiteMissing: whiteMissing, blackMissing: blackMissing };

}

// Non-pawn material still on the board for BOTH sides combined, used to
// detect when the game has entered an endgame phase.
function chessDnaNonPawnMaterial(piecesGrid){

    let total = 0;
    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){
            const piece = piecesGrid[r][c];
            if(!piece || piece[1] === "P" || piece[1] === "K") continue;
            total += CHESSDNA_CAPTURE_VALUES[piece[1]] || 0;
        }
    }
    return total;

}

function computeChessDNA(){

    if(typeof moveHistory === "undefined" || moveHistory.length === 0) return null;
    if(gameMode !== "ai" && gameMode !== "online") return null;

    const myColorForDna = (gameMode === "online") ? myColor : "white";
    if(!myColorForDna) return null; // spectator — no "you" to analyze

    const myIsWhite = myColorForDna === "white";

    // My own moves only, in order — even indices are White's moves,
    // odd are Black's, since moveHistory alternates starting with White.
    const myMoves = moveHistory.filter(function(_, i){
        return myIsWhite ? (i % 2 === 0) : (i % 2 === 1);
    });

    const totalMyMoves = myMoves.length;
    if(totalMyMoves === 0) return null;

    // --- Material swing, read straight off the final board snapshot ---
    const finalPieces = (typeof pieces !== "undefined") ? pieces : null;
    let materialWon = 0, materialLost = 0;

    if(finalPieces){
        const missing = chessDnaMissingValue(finalPieces);
        materialWon = myIsWhite ? missing.blackMissing : missing.whiteMissing;
        materialLost = myIsWhite ? missing.whiteMissing : missing.blackMissing;
    }
    const netMaterial = materialWon - materialLost;

    const captureCount = myMoves.filter(function(m){ return m.indexOf("x") !== -1; }).length;

    // --- 1. Tactics: how often you found a capture, weighted by how
    // favorable those captures were overall ---
    const tactics = chessDnaClamp(
        (captureCount / totalMyMoves) * 130 + Math.min(materialWon, 12) * 2.5
    );

    // --- 2. Calculation: proxy'd by your net material outcome — coming
    // out ahead in exchanges suggests you calculated them correctly ---
    const calculation = chessDnaClamp(50 + netMaterial * 5.5);

    // --- 3. Defense: how little material you leaked, with a small
    // resilience bonus if you still didn't lose the game ---
    let defense = chessDnaClamp(100 - materialLost * 6);
    if(typeof lastGameResult !== "undefined" && lastGameResult && lastGameResult !== "loss"){
        defense = chessDnaClamp(defense + 8);
    }

    // --- 4. Aggression: how often your moves landed in the opponent's
    // half of the board ---
    let advanceCount = 0;
    myMoves.forEach(function(m){
        const match = m.match(/([a-h])([1-8])$/);
        if(!match) return;
        const rank = parseInt(match[2], 10);
        const inOpponentHalf = myIsWhite ? rank >= 5 : rank <= 4;
        if(inOpponentHalf) advanceCount++;
    });
    const aggression = chessDnaClamp((advanceCount / totalMyMoves) * 120 + captureCount * 2);

    // --- 5. Endgame: only scored if the game actually reached one ---
    let endgame = null;
    if(typeof positionHistory !== "undefined" && positionHistory.length > 0){

        let endgameStartIndex = -1;
        for(let i = 0; i < positionHistory.length; i++){
            const snap = JSON.parse(positionHistory[i]);
            if(chessDnaNonPawnMaterial(snap.pieces) <= 26){
                endgameStartIndex = i;
                break;
            }
        }

        if(endgameStartIndex !== -1){
            const snapAtStart = JSON.parse(positionHistory[endgameStartIndex]);
            const missingAtStart = chessDnaMissingValue(snapAtStart.pieces);
            const myEdgeAtStart = myIsWhite
                ? (missingAtStart.blackMissing - missingAtStart.whiteMissing)
                : (missingAtStart.whiteMissing - missingAtStart.blackMissing);

            const result = (typeof lastGameResult !== "undefined") ? lastGameResult : null;
            let base = 50;
            if(result === "win") base = 78;
            else if(result === "draw") base = 55;
            else if(result === "loss") base = 32;

            let bonus = 0;
            if(result === "win" && myEdgeAtStart <= 0) bonus = 15; // won without a material edge
            if(result === "loss" && myEdgeAtStart > 0) bonus = -15; // had the edge, didn't convert

            endgame = chessDnaClamp(base + bonus);
        }
    }

    // --- 6. Opening prep: quick heuristic read of your first ~10 moves ---
    const openingMoves = myMoves.slice(0, Math.min(10, totalMyMoves));
    let openingScore = 30;
    if(openingMoves.slice(0, 4).some(function(m){ return /^[de][45]$/.test(m); })) openingScore += 20;
    if(openingMoves.some(function(m){ return /^K[gc][18]$/.test(m); })) openingScore += 30;
    const developedCount = openingMoves.slice(0, 6).filter(function(m){ return /^[NB]x?/.test(m); }).length;
    openingScore += Math.min(developedCount, 2) * 10;
    if(openingMoves.slice(0, 4).some(function(m){ return /^Qx?/.test(m); })) openingScore -= 15;
    const opening = chessDnaClamp(openingScore);

    const traits = {
        tactics: tactics,
        calculation: calculation,
        defense: defense,
        aggression: aggression,
        endgame: endgame,
        opening: opening
    };

    const labels = {
        tactics:     { name: "Tactical Awareness", strength: "spotting tactical shots", weakness: "your tactics — look harder for forcing moves and captures" },
        calculation: { name: "Calculation",        strength: "calculating exchanges accurately", weakness: "calculation — some of your trades didn't come out in your favor" },
        defense:     { name: "Defensive Solidity", strength: "keeping your position solid", weakness: "defense — you're giving up material a bit too easily" },
        aggression:  { name: "Aggression",         strength: "attacking, aggressive chess", weakness: "aggression — try pushing further into your opponent's position" },
        endgame:     { name: "Endgame Skill",      strength: "converting the endgame", weakness: "converting endgames — this is worth extra practice" },
        opening:     { name: "Opening Prep",       strength: "strong opening preparation", weakness: "opening prep — develop pieces and castle earlier" }
    };

    const scored = Object.keys(traits).filter(function(k){ return traits[k] !== null; });
    scored.sort(function(a, b){ return traits[b] - traits[a]; });

    const strengthKey = scored[0];
    const weaknessKey = scored[scored.length - 1];

    return {
        traits: traits,
        labels: labels,
        strengthKey: strengthKey,
        weaknessKey: weaknessKey
    };

}

function openChessDNA(){

    const dna = computeChessDNA();
    const body = document.getElementById("chessDnaBody");
    if(!body) return;

    if(!dna){
        body.innerHTML = '<p class="sub" style="text-align:center;padding:20px 0;">Chess DNA needs a player\'s own moves — not available while spectating, or for local two-player games.</p>';
    }else{

        let rows = "";
        Object.keys(dna.traits).forEach(function(key){
            const value = dna.traits[key];
            const label = dna.labels[key].name;
            if(value === null){
                rows +=
                    '<div class="dnaRow">' +
                        '<div class="dnaRowTop"><span>' + label + '</span><span class="dnaRowPct">N/A</span></div>' +
                        '<div class="dnaBarTrack"><div class="dnaBarFill" style="width:0%;background:#3a3f4a;"></div></div>' +
                        '<p class="sub" style="margin:2px 0 0;font-size:11px;">Game ended before reaching an endgame</p>' +
                    '</div>';
                return;
            }
            rows +=
                '<div class="dnaRow">' +
                    '<div class="dnaRowTop"><span>' + label + '</span><span class="dnaRowPct">' + value + '%</span></div>' +
                    '<div class="dnaBarTrack"><div class="dnaBarFill" style="width:' + value + '%;"></div></div>' +
                '</div>';
        });

        const strengthLabel = dna.labels[dna.strengthKey].strength;
        const weaknessLabel = dna.labels[dna.weaknessKey].weakness;

        body.innerHTML =
            '<p class="sub" style="text-align:center;margin-bottom:14px;">A read of the game you just played — not a certified rating, just a fun pattern check.</p>' +
            rows +
            '<div class="dnaCallout dnaCalloutGood">🌟 <b>Your standout:</b> ' + strengthLabel + '.</div>' +
            '<div class="dnaCallout dnaCalloutFocus">🎯 <b>Focus on:</b> ' + weaknessLabel + '.</div>';

    }

    document.getElementById("chessDnaPopup").classList.add("show");

}

function closeChessDNA(){
    document.getElementById("chessDnaPopup").classList.remove("show");
}
