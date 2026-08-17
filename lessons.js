// ============================================================
// Lessons — bite-sized tactics/opening lessons, Firebase-controlled the
// same way puzzles are (no lessons are built into the code itself).
//
// Firebase structure expected under "lessons":
//   lessons/{pushId} -> {
//     title: "Develop with Tempo",
//     icon: "📘",                (optional, defaults to 📘)
//     description: "...",        (shown on the lesson list card)
//     challenges: [
//       {
//         fen: "...",
//         instruction: "Develop and gain time...",
//         expectedMove: "c1g5",       // uci from-square+to-square
//         arrowFrom: "d5",            // optional — draws a hint arrow
//         arrowTo: "e4"                // optional
//       },
//       ...
//     ]
//   }
//
// Re-uses the same board state (pieces/selected/possibleMoves/
// currentPlayer) and move-legality helpers (getLegalMoves, isWhite, etc.)
// that script.js and puzzle.js already define — only one screen is ever
// "live" at a time, and each one resets that shared state when it opens.
// ============================================================

let lessonPool = [];
let currentLesson = null;
let lessonChallengeIndex = 0;
let lessonSolved = false;
function cacheLessons(lessons){
    try { localStorage.setItem("cachedLessons", JSON.stringify(lessons)); } catch(e) {}
}

function loadCachedLessons(){
    try { return JSON.parse(localStorage.getItem("cachedLessons") || "null"); } catch(e) { return null; }
}
function openLessons(){

    document.getElementById("appShell").style.display = "none";
    document.getElementById("lessonsScreen").style.display = "flex";
    history.pushState({ screen: "lessons", view: "list" }, "", "#lessons");

    showLessonsList();

}

function closeLessons(){
    document.getElementById("lessonsScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "lessons"){
        history.back();
    }
}

function showLessonsList(){

    document.getElementById("lessonsListView").style.display = "block";
    document.getElementById("lessonDetailView").style.display = "none";
    document.getElementById("lessonsHeaderTitle").textContent = "📘 Lessons";

    loadLessonsList();

}

function loadLessonsList(){

    const list = document.getElementById("lessonsList");
    if(!list) return;

    if(!db){
        list.innerHTML = '<p class="sub">Could not connect — check your internet connection.</p>';
        return;
    }

    list.innerHTML = '<p class="sub">Loading...</p>';

    db.ref("lessons").once("value").then(function(snapshot){

        if(!snapshot.exists()){
            list.innerHTML = '<p class="sub">No lessons have been added yet.</p>';
            return;
        }

        lessonPool = [];
        snapshot.forEach(function(child){
            lessonPool.push(Object.assign({ id: child.key }, child.val()));
        });

        list.innerHTML = "";

        lessonPool.forEach(function(lesson){

            const challengeCount = (lesson.challenges || []).length;

            const card = document.createElement("div");
            card.className = "tournamentCard";
            card.style.height = "auto";
            card.style.minHeight = "64px";
            card.onclick = function(){ openLessonDetail(lesson.id); };
            card.innerHTML =
                '<div class="tournamentCardName">' + (lesson.icon || "📘") + " " + escapeHtml(lesson.title || "Untitled Lesson") + '</div>' +
                '<div class="tournamentCardMeta">' + escapeHtml(lesson.description || "") + " · " + challengeCount + " challenge" + (challengeCount === 1 ? "" : "s") + '</div>';

            list.appendChild(card);

        });

    }).catch(function(err){
        list.innerHTML = '<p class="sub">Could not load lessons: ' + escapeHtml(err.message) + '</p>';
    });

}

function openLessonDetail(lessonId){

    currentLesson = lessonPool.find(function(l){ return l.id === lessonId; });
    if(!currentLesson || !currentLesson.challenges || currentLesson.challenges.length === 0) return;

    history.pushState({ screen: "lessons", view: "detail", id: lessonId }, "", "#lessons-detail");

    document.getElementById("lessonsListView").style.display = "none";
    document.getElementById("lessonDetailView").style.display = "block";
    document.getElementById("lessonsHeaderTitle").textContent = (currentLesson.icon || "📘") + " " + (currentLesson.title || "Lesson");

    lessonChallengeIndex = 0;
    loadLessonChallenge();

}

function loadLessonChallenge(){

    const challenge = currentLesson.challenges[lessonChallengeIndex];
    if(!challenge) return;

    lessonSolved = false;
    selected = null;
    possibleMoves = [];

    pieces = fenToPieces(challenge.fen);
    currentPlayer = challenge.fen.split(" ")[1] === "w" ? "white" : "black";

    const turnLabel = currentPlayer === "white" ? "White to move" : "Black to move";
    showLessonInstruction(turnLabel + ". " + (challenge.instruction || "Find the best move."));
    drawLessonArrow(challenge.arrowFrom, challenge.arrowTo);
    updateLessonProgress();
    createLessonBoard();

}

function showLessonInstruction(text){
    const instrEl = document.getElementById("lessonInstruction");
    const feedbackEl = document.getElementById("lessonFeedback");
    instrEl.textContent = text;
    instrEl.style.display = "block";
    feedbackEl.textContent = "";
    feedbackEl.style.display = "none";
    speakText(text);
}

function showLessonFeedback(text){
    const instrEl = document.getElementById("lessonInstruction");
    const feedbackEl = document.getElementById("lessonFeedback");
    instrEl.style.display = "none";
    feedbackEl.textContent = text;
    feedbackEl.style.display = "block";
    speakText(text);
}

function updateLessonProgress(){
    const total = currentLesson.challenges.length;
    const stepper = document.getElementById("lessonProgressStepper");
    const countBox = document.getElementById("lessonProgressCount");
    if(!stepper || total === 0) return;

    let html = "";
    for(let i = 0; i < total; i++){
        const isCompleted = i < lessonChallengeIndex;
        const isCurrent = i === lessonChallengeIndex;

        html += '<div class="lesson-step-dot' + (isCompleted ? ' completed' : '') + (isCurrent ? ' current' : '') + '">' + (i + 1) + '</div>';

        if(i < total - 1){
            html += '<div class="lesson-step-line' + (i < lessonChallengeIndex ? ' completed' : '') + '"></div>';
        }
    }

    stepper.innerHTML = html;
    if(countBox) countBox.textContent = (lessonChallengeIndex + 1) + "/" + total;
}

function drawLessonArrow(fromSq, toSq){

    // Arrows disabled for Lessons — hint arrows were removed per request.
    // Kept this function in place (instead of deleting it) since it's
    // still called from loadLessonChallenge() below; it now always just
    // hides the line instead of drawing one.
    const line = document.getElementById("lessonArrowLine");
    if(!line) return;

    line.style.display = "none";

}

function createLessonBoard(){

    const boardEl = document.getElementById("lessonBoard");
    boardEl.innerHTML = "";

    for(let r = 0; r < 8; r++){
        for(let c = 0; c < 8; c++){

            const square = document.createElement("div");
            square.classList.add("square");
            square.classList.add((r + c) % 2 === 0 ? "light" : "dark");

            if(selected && selected.r === r && selected.c === c){
                square.classList.add("selected");
            }
            if(possibleMoves.some(function(m){ return m.r === r && m.c === c; })){
                square.classList.add("possible");
            }

            if(pieces[r][c] !== ""){
                const img = document.createElement("img");
                img.src = "pieces/" + pieces[r][c] + ".svg";
                img.className = "piece";
                square.appendChild(img);
            }

            // Rank label on first column
            if(c === 0){
                const rank = document.createElement("span");
                rank.className = "rankLabel";
                rank.textContent = 8 - r;
                square.appendChild(rank);
            }

            // File label on last row
            if(r === 7){
                const file = document.createElement("span");
                file.className = "fileLabel";
                file.textContent = "abcdefgh"[c];
                square.appendChild(file);
            }

            square.onclick = (function(row, col){ return function(){ clickLessonSquare(row, col); }; })(r, c);

            boardEl.appendChild(square);
        }
    }

}

function clickLessonSquare(r, c){

    if(lessonSolved) return;
    if(!currentLesson) return;

    const challenge = currentLesson.challenges[lessonChallengeIndex];
    const piece = pieces[r][c];

    if(selected != null && "speechSynthesis" in window){
        window.speechSynthesis.cancel();
        if(typeof setCoachTalking === "function") setCoachTalking(false);
    }

    if(selected == null){
        if(piece === "") return;
        const pieceColor = isWhite(piece) ? "white" : "black";
        if(pieceColor !== currentPlayer) return;
        selected = { r: r, c: c };
        possibleMoves = getLegalMoves(piece, r, c);
        createLessonBoard();
        return;
    }

    const isTarget = possibleMoves.some(function(m){ return m.r === r && m.c === c; });

    if(!isTarget){
        selected = null;
        possibleMoves = [];
        createLessonBoard();
        return;
    }

    const fromR = selected.r;
    const fromC = selected.c;
    const files = "abcdefgh";
    const uciMove = files[fromC] + (8 - fromR) + files[c] + (8 - r);

    selected = null;
    possibleMoves = [];

    if(uciMove !== challenge.expectedMove){
        showLessonFeedback("❌ Not quite — try again!");
        createLessonBoard();
        return;
    }

    const movingPiece = pieces[fromR][fromC];
    pieces[r][c] = movingPiece;
    pieces[fromR][fromC] = "";
    lessonSolved = true;

    createLessonBoard();

    const isLastChallenge = (lessonChallengeIndex >= currentLesson.challenges.length - 1);

    if(isLastChallenge){
        showLessonFeedback("🎉 Lesson complete — nice work!");
        if(typeof recordLessonCompleted === "function") recordLessonCompleted(currentLesson.id);
    }else{
        showLessonFeedback("✅ Correct! Moving to the next challenge...");
        setTimeout(function(){
            lessonChallengeIndex++;
            loadLessonChallenge();
        }, 1200);
    }

}

function showLessonHint(){
    if(!currentLesson || lessonSolved) return;
    const challenge = currentLesson.challenges[lessonChallengeIndex];
    if(!challenge) return;
    const fromSq = challenge.expectedMove.substring(0, 2);
    showLessonFeedback("💡 Try moving the piece on " + fromSq + ".");
}

function recordLessonCompleted(lessonId){
    if(typeof currentUser === "undefined" || !currentUser || !db) return;
    db.ref("users/" + currentUser.uid + "/private/lessonsCompleted/" + lessonId).set(Date.now());
}
