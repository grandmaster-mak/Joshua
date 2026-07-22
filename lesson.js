// ============================================================
// Chess Lessons — Firebase-controlled, interactive
// ============================================================
//
// Firebase structure:
//
//   lessons/{lessonId} -> {
//       title, category, description, difficulty,
//       steps: [
//           { instruction, fen, solution: [...] },
//           ...
//       ]
//   }
//
//   users/{uid}/private/completedLessons/{lessonId} -> { completedAt, mistakesMade }
//   users/{uid}/public/lessonsCompleted -> number
//
// Like puzzles, Firebase is the only source of truth — lessons can be
// added or edited directly under `lessons/` without touching this file.
// ============================================================

let lessonPool = [];
let currentLesson = null;
let currentLessonId = null;
let lessonStepIndex = 0;
let lessonMoveIndex = 0;
let lessonMistakeMade = false;
let lessonCompletedIds = {};

// ---- Coach bubble helper (mirrors the puzzle screen's single-message bubble) ----

function showLessonMessage(text, isFeedback){
    const descEl = document.getElementById("lessonDescription");
    const feedbackEl = document.getElementById("lessonFeedback");

    if(isFeedback){
        descEl.style.display = "none";
        feedbackEl.textContent = text;
        feedbackEl.style.display = "block";
    }else{
        feedbackEl.textContent = "";
        feedbackEl.style.display = "none";
        descEl.textContent = text;
        descEl.style.display = "block";
    }
}

// ---- Loading lessons from Firebase ----

function loadLessonPool(){

    if(!db){
        return Promise.reject(new Error("Not connected to Firebase."));
    }

    return db.ref("lessons").once("value").then(function(snapshot){

        if(!snapshot.exists()){
            return [];
        }

        const out = [];
        snapshot.forEach(function(child){
            out.push(Object.assign({ id: child.key }, child.val()));
        });
        return out;

    }).catch(function(err){
        console.error("Failed to load lessons from Firebase:", err.message);
        throw err;
    });

}

function loadCompletedLessons(){

    if(typeof currentUser === "undefined" || !currentUser || !db){
        lessonCompletedIds = {};
        return Promise.resolve();
    }

    return db.ref("users/" + currentUser.uid + "/private/completedLessons").once("value").then(function(snapshot){
        lessonCompletedIds = snapshot.val() || {};
    }).catch(function(err){
        console.error("Failed to load completed lessons:", err.message);
        lessonCompletedIds = {};
    });

}

// ---- Lessons list screen ----

function openLessonsScreen(){

    document.getElementById("appShell").style.display = "none";
    document.getElementById("lessonsScreen").style.display = "flex";
    document.getElementById("lessonsListView").style.display = "block";
    document.getElementById("lessonActiveView").style.display = "none";

    document.getElementById("lessonsList").innerHTML = '<p class="sub">Loading lessons...</p>';

    history.pushState({ screen: "lessons" }, "", "#lessons");

    Promise.all([loadLessonPool(), loadCompletedLessons()]).then(function(results){

        lessonPool = results[0];
        renderLessonsList();

    }).catch(function(err){
        console.error("Failed to open lessons:", err.message);
        document.getElementById("lessonsList").innerHTML = '<p class="sub">Couldn\'t load lessons — check your connection and try again.</p>';
    });

}

function renderLessonsList(){

    const listEl = document.getElementById("lessonsList");

    if(!lessonPool || lessonPool.length === 0){
        listEl.innerHTML = '<p class="sub">No lessons have been added yet.</p>';
        return;
    }

    listEl.innerHTML = "";

    lessonPool.forEach(function(lesson){

        const isDone = !!lessonCompletedIds[lesson.id];

        const row = document.createElement("div");
        row.className = "friendCard";
        row.style.cursor = "pointer";
        row.onclick = function(){ openLesson(lesson.id); };

        row.innerHTML =
            '<div class="friendInfo">' +
                '<span class="friendName">' + (isDone ? "✅ " : "") + lesson.title + '</span>' +
                '<span class="friendRating">' + (lesson.category || "") + (lesson.difficulty ? " · " + lesson.difficulty : "") + '</span>' +
            '</div>';

        listEl.appendChild(row);

    });

}

function closeLessons(){
    document.getElementById("lessonsScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "lessons"){
        history.back();
    }
}

// ---- Active lesson: stepping through instruction + moves ----

function openLesson(lessonId){

    const lesson = lessonPool.find(function(l){ return l.id === lessonId; });
    if(!lesson) return;

    currentLesson = lesson;
    currentLessonId = lessonId;
    lessonStepIndex = 0;
    lessonMoveIndex = 0;
    lessonMistakeMade = false;

    document.getElementById("lessonsListView").style.display = "none";
    document.getElementById("lessonActiveView").style.display = "block";
    document.getElementById("lessonTitle").textContent = lesson.title;

    loadLessonStep();

}

function loadLessonStep(){

    const step = currentLesson.steps[lessonStepIndex];

    pieces = fenToPieces(step.fen);
    currentPlayer = step.fen.split(" ")[1] === "w" ? "white" : "black";
    lessonMoveIndex = 0;
    selected = null;
    possibleMoves = [];

    document.getElementById("lessonStepCounter").textContent =
        "Step " + (lessonStepIndex + 1) + " of " + currentLesson.steps.length;

    showLessonMessage(step.instruction, false);

    createLessonBoard();

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

            square.onclick = (function(row, col){ return function(){ clickLessonSquare(row, col); }; })(r, c);

            boardEl.appendChild(square);
        }
    }
}

function clickLessonSquare(r, c){

    if(!currentLesson) return;

    const step = currentLesson.steps[lessonStepIndex];
    const piece = pieces[r][c];

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
    const expectedMove = step.solution[lessonMoveIndex];

    selected = null;
    possibleMoves = [];

    if(uciMove !== expectedMove){
        lessonMistakeMade = true;
        showLessonMessage("❌ Not quite — try again!", true);
        createLessonBoard();
        return;
    }

    const movingPiece = pieces[fromR][fromC];
    pieces[r][c] = movingPiece;
    pieces[fromR][fromC] = "";
    lessonMoveIndex++;

    if(lessonMoveIndex >= step.solution.length){
        createLessonBoard();
        advanceLessonStep();
        return;
    }

    showLessonMessage("✅ Good move! Keep going...", true);
    currentPlayer = currentPlayer === "white" ? "black" : "white";
    createLessonBoard();

    setTimeout(function(){

        const oppMove = step.solution[lessonMoveIndex];
        const fromSq = oppMove.substring(0, 2);
        const toSq = oppMove.substring(2, 4);
        const fromCoord = squareToCoords(fromSq);
        const toCoord = squareToCoords(toSq);

        pieces[toCoord.r][toCoord.c] = pieces[fromCoord.r][fromCoord.c];
        pieces[fromCoord.r][fromCoord.c] = "";

        lessonMoveIndex++;
        currentPlayer = currentPlayer === "white" ? "black" : "white";
        createLessonBoard();

        if(lessonMoveIndex >= step.solution.length){
            advanceLessonStep();
        }

    }, 500);

}

function advanceLessonStep(){

    lessonStepIndex++;

    if(lessonStepIndex >= currentLesson.steps.length){
        showLessonMessage("✅ Lesson complete! Well played.", true);
        recordLessonResult();
        return;
    }

    setTimeout(function(){
        loadLessonStep();
    }, 700);

}

// ---- Recording completion to Firebase ----

function recordLessonResult(){

    if(typeof currentUser === "undefined" || !currentUser) return;
    if(typeof db === "undefined" || !db) return;
    if(!currentLessonId) return;

    lessonCompletedIds[currentLessonId] = true;

    db.ref("users/" + currentUser.uid + "/private/completedLessons/" + currentLessonId).set({
        completedAt: Date.now(),
        mistakesMade: lessonMistakeMade
    });

    db.ref("users/" + currentUser.uid + "/public/lessonsCompleted").transaction(function(count){
        return (count || 0) + 1;
    });

        }
          
