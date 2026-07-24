// ============================================================
// Leaderboards — top players by rating / wins / puzzle rating
//
// Reads directly from users/*/public, which is already populated by
// auth.js (signup) and script.js/puzzle.js (game + puzzle results).
// No new Firebase structure is required for this feature.
// ============================================================

let currentLeaderboardTab = "rating";

function openLeaderboard(){
    document.getElementById("appShell").style.display = "none";
    document.getElementById("leaderboardScreen").style.display = "flex";
    history.pushState({ screen: "leaderboard" }, "", "#leaderboard");
    switchLeaderboardTab("rating");
}

function closeLeaderboard(){
    document.getElementById("leaderboardScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
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

    if(!db){
        list.innerHTML = '<p class="sub">Could not connect — check your internet connection.</p>';
        return;
    }

    list.innerHTML = '<p class="sub">Loading...</p>';

    // Firebase RTDB can only orderByChild + limitToLast on the field being
    // sorted, and "wins" needs the same treatment as rating/puzzleRating —
    // all three are plain numeric fields under users/{uid}/public.
    db.ref("users").orderByChild("public/" + field).limitToLast(50).once("value").then(function(snapshot){

        if(!snapshot.exists()){
            list.innerHTML = '<p class="sub">No players yet.</p>';
            return;
        }

        const rows = [];
        snapshot.forEach(function(child){
            const data = child.val();
            if(!data || !data.public || !data.public.username) return;
            rows.push({ uid: child.key, data: data.public });
        });

        rows.sort(function(a, b){ return (b.data[field] || 0) - (a.data[field] || 0); });

        if(rows.length === 0){
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

    }).catch(function(err){
        list.innerHTML = '<p class="sub">Could not load leaderboard: ' + escapeHtml(err.message) + '</p>';
    });

      }
          
