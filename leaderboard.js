// ============================================================
// Leaderboards — top players by rating / wins / puzzle rating
//
// Reads directly from users/*/public, which is already populated by
// auth.js (signup) and script.js/puzzle.js (game + puzzle results).
// No new Firebase structure is required for this feature.
//
// Cache-first, same pattern as Puzzles/Friends/Profile: each tab
// (Rating/Wins/Puzzles) paints instantly from whatever was last seen on
// this device, then a real fetch always runs in the background and
// quietly corrects it — no blank "Loading..." wait on repeat visits.
// A sequence counter guards against a slow fetch for one tab landing
// after the person has already switched to a different tab.
// ============================================================

let currentLeaderboardTab = "rating";
let leaderboardLoadSeq = 0;

function cacheLeaderboard(field, rows){
    try {
        const all = JSON.parse(localStorage.getItem("cachedLeaderboards") || "{}");
        all[field] = rows;
        localStorage.setItem("cachedLeaderboards", JSON.stringify(all));
    } catch(e) {}
}

function loadCachedLeaderboard(field){
    try {
        const all = JSON.parse(localStorage.getItem("cachedLeaderboards") || "{}");
        return all[field] || null;
    } catch(e) { return null; }
}

function openLeaderboard(){
    saveAppShellScroll();
    document.getElementById("appShell").style.display = "none";
    document.getElementById("leaderboardScreen").style.display = "flex";
    history.pushState({ screen: "leaderboard" }, "", "#leaderboard");
    switchLeaderboardTab("rating");
}

function closeLeaderboard(){
    document.getElementById("leaderboardScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    restoreAppShellScroll();
    if(history.state && history.state.screen === "leaderboard"){
        history.back();
    }
}

function switchLeaderboardTab(tab){

    currentLeaderboardTab = tab;

    document.getElementById("lbTabRating").classList.toggle("active", tab === "rating");
    document.getElementById("lbTabWins").classList.toggle("active", tab === "wins");
    document.getElementById("lbTabPuzzle").classList.toggle("active", tab === "puzzleRating");

    loadLeaderboard(tab);

}

function loadLeaderboard(field){

    const list = document.getElementById("leaderboardList");
    if(!list) return;

    const mySeq = ++leaderboardLoadSeq;

    const cachedRows = loadCachedLeaderboard(field);
    if(cachedRows && cachedRows.length > 0){
        renderLeaderboardRows(field, cachedRows);
    }else{
        list.innerHTML = '<p class="sub">Loading...</p>';
    }

    if(!db){
        if(!cachedRows) list.innerHTML = '<p class="sub">Could not connect — check your internet connection.</p>';
        return;
    }

    // Firebase RTDB can only orderByChild + limitToLast on the field being
    // sorted, and "wins" needs the same treatment as rating/puzzleRating —
    // all three are plain numeric fields under users/{uid}/public.
    db.ref("users").orderByChild("public/" + field).limitToLast(50).once("value").then(function(snapshot){

        if(mySeq !== leaderboardLoadSeq) return; // person switched tabs before this landed
        if(currentLeaderboardTab !== field) return; // extra safety, same reason

        if(!snapshot.exists()){
            cacheLeaderboard(field, []);
            if(!cachedRows || cachedRows.length === 0) list.innerHTML = '<p class="sub">No players yet.</p>';
            return;
        }

        const rows = [];
        snapshot.forEach(function(child){
            const data = child.val();
            if(!data || !data.public || !data.public.username) return;
            rows.push({ uid: child.key, data: data.public });
        });

        rows.sort(function(a, b){ return (b.data[field] || 0) - (a.data[field] || 0); });

        if(field === "rating" && currentUser && typeof unlockAchievement === "function"){
            const myIndex = rows.findIndex(function(row){ return row.uid === currentUser.uid; });
            if(myIndex === 0) unlockAchievement(currentUser.uid, "leaderboard_1");
            else if(myIndex === 1) unlockAchievement(currentUser.uid, "leaderboard_2");
            else if(myIndex === 2) unlockAchievement(currentUser.uid, "leaderboard_3");
        }

        cacheLeaderboard(field, rows);

        if(rows.length === 0){
            list.innerHTML = '<p class="sub">No players yet.</p>';
            return;
        }

        renderLeaderboardRows(field, rows);

    }).catch(function(err){
        if(!cachedRows || cachedRows.length === 0){
            list.innerHTML = '<p class="sub">Could not load leaderboard: ' + escapeHtml(err.message) + '</p>';
        }
    });

}

function renderLeaderboardRows(field, rows){

    const list = document.getElementById("leaderboardList");
    if(!list) return;

    if(!rows || rows.length === 0){
        list.innerHTML = '<p class="sub">No players yet.</p>';
        return;
    }

    list.innerHTML = "";

    rows.slice(0, 50).forEach(function(row, index){

        const rank = index + 1;
        const isMe = currentUser && row.uid === currentUser.uid;

        const rankCls = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
        const rankLabel = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : String(rank);

        const subLabel = field === "wins" ? (row.data.wins || 0) + " wins" :
            field === "puzzleRating" ? "Streak: " + (row.data.puzzleStreak || 0) :
            (row.data.wins || 0) + "W / " + (row.data.losses || 0) + "L";

        const valueLabel = field === "wins" ? (row.data.wins || 0) : (row.data[field] || (field === "puzzleRating" ? 800 : 100));

        const el = document.createElement("div");
        el.className = "leaderboardRow" + (isMe ? " me" : "");
        el.style.cursor = "pointer";
        el.onclick = function(){ openPlayerProfile(row.uid); };
        el.innerHTML =
            '<span class="lbRank ' + rankCls + '">' + rankLabel + '</span>' +
            '<img class="lbAvatar" src="' + (row.data.photoURL || DEFAULT_AVATAR_SRC) + '" alt="">' +
            '<div class="lbInfo">' +
                '<div class="lbName">' + escapeHtml(row.data.flag || "") + ' ' + escapeHtml(row.data.username) + (isMe ? " (You)" : "") + '</div>' +
                '<div class="lbSub">' + subLabel + '</div>' +
            '</div>' +
            '<span class="lbRating">' + valueLabel + '</span>';

        list.appendChild(el);

    });

}
