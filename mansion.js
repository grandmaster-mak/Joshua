// ============================================================
// Mansion — first testable slice (Fence only)
//
// Deliberately minimal: one ordered list of 4 images, one integer per
// player (users/{uid}/public/mansion/fenceStage) tracking progress,
// and a plain viewer screen with zero game attached — just there so
// you can open it any time and see exactly where you stand.
//
// A win advances fenceStage by 1 (capped at the last stage, index 3).
// A loss steps it back by 1 (floored at 0, back to bare land). Draws
// don't move it either way.
//
// This hooks into the SAME win/loss moment that already updates
// Kingdom progress in recordGameResult() (script.js) — which already
// only fires for online/rated-AI games, never local two-player games
// (recordGameResult returns early for gameMode === "human"). So this
// inherits that same scope automatically, with zero extra rules.
//
// More zones (House, Driveway, Pool, etc.) and a real Build-Points
// economy come later — this is only here to prove the core mechanic
// feels right before building anything bigger on top of it.
// ============================================================

const MANSION_FENCE_STAGES = [
    { id: "land",     label: "Bare Land",           image: "pieces/fence_1_land.jpg" },
    { id: "plain",    label: "Fence Built",          image: "pieces/fence_2_plain.jpg" },
    { id: "lights",   label: "Fence Lit Up",         image: "pieces/fence_3_lights.jpg" },
    { id: "security", label: "Security Post Added",  image: "pieces/fence_4_security.jpg" }
];

function cacheMansionStage(stage){
    try{ localStorage.setItem("cachedMansionStage", JSON.stringify(stage)); }catch(e){}
}

function loadCachedMansionStage(){
    try{
        const v = JSON.parse(localStorage.getItem("cachedMansionStage") || "null");
        return (typeof v === "number") ? v : 0;
    }catch(e){
        return 0;
    }
}

// Called from recordGameResult() in script.js right after a win/loss is
// already confirmed and saved — see the patch instructions for exactly
// where. Uses a transaction so two rapid results in a row (unlikely,
// but possible on a flaky connection retry) can never race each other.
function updateMansionOnGameResult(myResult){

    if(typeof currentUser === "undefined" || !currentUser || typeof db === "undefined" || !db) return;
    if(myResult !== "win" && myResult !== "loss") return; // draws don't move the fence

    // Mansion progress now only comes from real Circle sessions, not
    // any online win — see activeCircleSessionId in circles.js.
    if(typeof isActiveCircleSessionGame !== "function" || !isActiveCircleSessionGame()) return;
    if(typeof finalizeCircleSessionGameResult === "function") finalizeCircleSessionGameResult(myResult);

    const ref = db.ref("users/" + currentUser.uid + "/public/mansion/fenceStage");

    ref.transaction(function(current){
        let stage = (typeof current === "number") ? current : 0;
        if(myResult === "win"){
            stage = Math.min(MANSION_FENCE_STAGES.length - 1, stage + 1);
        }else{
            stage = Math.max(0, stage - 1);
        }
        return stage;
    }).then(function(result){

        if(!result.committed) return;

        const newStage = result.snapshot.val() || 0;
        cacheMansionStage(newStage);

        // If the Mansion viewer happens to already be open, refresh it
        // live instead of requiring the player to back out and reopen.
        const screenEl = document.getElementById("mansionScreen");
        if(screenEl && screenEl.style.display === "flex"){
            renderMansionViewer(newStage);
        }

    }).catch(function(err){
        console.error("Failed to update mansion stage:", err.message);
    });

}

// ---- Standalone viewer — "My Mansion" button on the Circles screen ----

function openMyMansion(){

    document.getElementById("appShell").style.display = "none";
    document.getElementById("mansionScreen").style.display = "flex";
    history.pushState({ screen: "mansion" }, "", "#mansion");

    // Instant paint from cache, same pattern as everything else in this
    // app (Recent Games, Friends, Puzzles) — zero network wait.
    renderMansionViewer(loadCachedMansionStage());

    if(!currentUser || !db) return;

    db.ref("users/" + currentUser.uid + "/public/mansion/fenceStage").once("value").then(function(snap){
        const stage = snap.val() || 0;
        cacheMansionStage(stage);
        renderMansionViewer(stage);
    }).catch(function(err){
        console.error("Failed to load mansion stage:", err.message);
    });

}

function closeMyMansion(){
    document.getElementById("mansionScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "mansion"){
        history.back();
    }
}

function renderMansionViewer(stage){

    const safeStage = Math.max(0, Math.min(MANSION_FENCE_STAGES.length - 1, stage || 0));
    const info = MANSION_FENCE_STAGES[safeStage];

    const img = document.getElementById("mansionViewerImage");
    const label = document.getElementById("mansionViewerLabel");
    const progress = document.getElementById("mansionViewerProgress");

    if(img) img.src = info.image;
    if(label) label.textContent = info.label;
    if(progress) progress.textContent = "Stage " + (safeStage + 1) + " of " + MANSION_FENCE_STAGES.length;

}
