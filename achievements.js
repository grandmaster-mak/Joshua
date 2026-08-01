// ============================================================
// Achievements — a fixed set of badges players unlock by playing.
// Unlocked state is stored at users/{uid}/public/achievements/{id} as a
// timestamp, so it's covered by the same "public" read rule already in
// place for the leaderboard — no extra Firebase Rules changes needed.
//
// Each newly-unlocked achievement is also marked "unseen"
// (public/achievementsUnseen/{id} = true). The next time ANYONE opens
// that player's profile, the oldest unseen award plays as an animated
// coach hand-over sequence before the profile itself appears — like a
// WhatsApp status. Once shown, it's marked seen so it doesn't replay.
// ============================================================

const ACHIEVEMENT_DEFS = [
    { id: "first_win",     icon: "🥇", title: "First Win",        color: "#eab308", check: function(d){ return (d.wins || 0) >= 1; } },
    { id: "wins_10",       icon: "🏆", title: "10 Wins",           color: "#eab308", check: function(d){ return (d.wins || 0) >= 10; } },
    { id: "wins_50",       icon: "👑", title: "50 Wins",           color: "#eab308", check: function(d){ return (d.wins || 0) >= 50; } },
    { id: "wins_100",      icon: "💎", title: "100 Wins",          color: "#38bdf8", check: function(d){ return (d.wins || 0) >= 100; } },
    { id: "streak_3",      icon: "🔥", title: "3-Win Streak",      color: "#f97316", check: function(d){ return (d.bestStreak || 0) >= 3; } },
    { id: "streak_5",      icon: "⚡", title: "5 Straight Wins",   color: "#f97316", check: function(d){ return (d.bestStreak || 0) >= 5; } },
    { id: "streak_10",     icon: "🌟", title: "10-Win Streak",     color: "#f97316", check: function(d){ return (d.bestStreak || 0) >= 10; } },
    { id: "puzzle_10",     icon: "🧩", title: "Puzzle Streak 10",  color: "#22c55e", check: function(d){ return (d.puzzleStreak || 0) >= 10; } },
    { id: "puzzles_5",     icon: "🧠", title: "5 Puzzles Solved",  color: "#22c55e", check: function(d){ return (d.puzzlesSolved || 0) >= 5; } },
    { id: "rating_500",    icon: "📈", title: "Rating 500+",       color: "#38bdf8", check: function(d){ return (d.rating || 100) >= 500; } },
    { id: "rating_1000",   icon: "🚀", title: "Rating 1000+",      color: "#38bdf8", check: function(d){ return (d.rating || 100) >= 1000; } },
    { id: "beat_medium_ai",icon: "🤖", title: "Beat Medium AI",    color: "#a855f7", check: function(d){ return !!d.beatMediumAI; } },
    { id: "beat_hard_ai",  icon: "🦾", title: "Beat Hard AI",      color: "#a855f7", check: function(d){ return !!d.beatHardAI; } },
    { id: "daily_player",  icon: "📅", title: "3-Day Play Streak", color: "#22c55e", check: function(d){ return (d.dailyPlayStreak || 0) >= 3; } },
    { id: "leaderboard_1", icon: "🥇", title: "#1 on Leaderboard", color: "#ffd700", check: function(){ return false; } },
    { id: "leaderboard_2", icon: "🥈", title: "#2 on Leaderboard", color: "#c0c0c0", check: function(){ return false; } },
    { id: "leaderboard_3", icon: "🥉", title: "#3 on Leaderboard", color: "#cd7f32", check: function(){ return false; } },
    { id: "tournament_gold",   icon: "🥇", title: "Tournament Champion",   color: "#ffd700", check: function(){ return false; } },
    { id: "tournament_silver", icon: "🥈", title: "Tournament Runner-Up", color: "#c0c0c0", check: function(){ return false; } },
    { id: "tournament_bronze", icon: "🥉", title: "Tournament 3rd Place", color: "#cd7f32", check: function(){ return false; } }
];

function getAchievementDef(id){
    return ACHIEVEMENT_DEFS.find(function(d){ return d.id === id; });
}

// Directly unlocks one specific achievement (used for the leaderboard
// placements, which can't be derived from a single player's own stats).
// Called once per new game (any mode) to track "played today". Updates
// at most once per calendar day, guarded by a transaction so rapid game
// starts don't double-count. Feeds the "3-Day Play Streak" achievement.
function checkDailyPlayStreak(){

    if(typeof currentUser === "undefined" || !currentUser || typeof db === "undefined" || !db) return;

    const now = new Date();
    const todayKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.getFullYear() + "-" + String(yesterday.getMonth() + 1).padStart(2, "0") + "-" + String(yesterday.getDate()).padStart(2, "0");

    const ref = db.ref("users/" + currentUser.uid + "/public");

    ref.transaction(function(data){
        if(!data) return data;
        if(data.lastPlayedDate === todayKey) return data; // already counted today

        data.dailyPlayStreak = (data.lastPlayedDate === yesterdayKey) ? (data.dailyPlayStreak || 0) + 1 : 1;
        data.lastPlayedDate = todayKey;

        return data;
    }).then(function(result){
        if(typeof checkAchievements === "function") checkAchievements(currentUser.uid, result.snapshot.val());
    });

}

function unlockAchievement(uid, id){
    if(!db) return;
    const ref = db.ref("users/" + uid + "/public");
    ref.transaction(function(data){
        if(!data) return data;
        if(!data.achievements) data.achievements = {};
        if(data.achievements[id]) return data; // already unlocked, no-op
        data.achievements[id] = Date.now();
        if(!data.achievementsUnseen) data.achievementsUnseen = {};
        data.achievementsUnseen[id] = true;
        return data;
    });
}

// Called right after a game's stats are saved. Compares the just-updated
// public data against every achievement's condition and unlocks any
// newly earned ones, marking each unseen for the reveal animation.
function checkAchievements(uid, publicData){

    if(!publicData || !db) return;

    const unlocked = publicData.achievements || {};
    const newlyUnlocked = [];

    ACHIEVEMENT_DEFS.forEach(function(def){
        if(!unlocked[def.id] && def.check(publicData)){
            newlyUnlocked.push(def);
        }
    });

    if(newlyUnlocked.length === 0) return;

    const updates = {};
    newlyUnlocked.forEach(function(def){
        updates["users/" + uid + "/public/achievements/" + def.id] = Date.now();
        updates["users/" + uid + "/public/achievementsUnseen/" + def.id] = true;
    });
    db.ref().update(updates);

}

// Renders the full badge set into a container, greying out locked ones.
function renderAchievementsGrid(containerId, unlockedMap){

    const container = document.getElementById(containerId);
    if(!container) return;

    unlockedMap = unlockedMap || {};
    container.innerHTML = "";

    // Only earned awards are shown at all — locked ones stay completely
    // hidden (no greyed-out placeholder) until actually unlocked.
    const unlockedDefs = ACHIEVEMENT_DEFS.filter(function(def){ return !!unlockedMap[def.id]; });

    if(unlockedDefs.length === 0){
        container.innerHTML = '<p class="sub" style="grid-column:1/-1;">No awards earned yet.</p>';
        return;
    }

    unlockedDefs.forEach(function(def){
        const badge = document.createElement("div");
        badge.className = "achievementBadge unlocked";
        badge.innerHTML =
            '<div class="achievementIcon">' + def.icon + '</div>' +
            '<div class="achievementTitle">' + def.title + '</div>';
        container.appendChild(badge);
    });

}

// ============================================================
// The animated "coach hands over the award" reveal sequence.
// Not an actual video file (no video-generation capability here) — this
// is a real CSS/JS animation built from the same coach avatar already
// used elsewhere, that achieves the same moment.
// ============================================================

function playAwardRevealAnimation(def, onDone){

    const overlay = document.getElementById("awardRevealOverlay");
    if(!overlay || !def){
        if(onDone) onDone();
        return;
    }

    document.getElementById("awardRevealIcon").textContent = def.icon;
    document.getElementById("awardRevealTitle").textContent = def.title;
    document.getElementById("awardRevealIcon").style.color = def.color || "#ffd700";
    document.getElementById("awardRevealGlow").style.background =
        "radial-gradient(circle, " + (def.color || "#ffd700") + "55 0%, transparent 70%)";

    overlay.style.display = "flex";
    overlay.classList.remove("awardRevealPlaying");
    void overlay.offsetWidth; // restart the CSS animation from scratch
    overlay.classList.add("awardRevealPlaying");

    if(typeof speakText === "function"){
        speakText("New award unlocked: " + def.title + "!");
    }

    setTimeout(function(){
        overlay.style.display = "none";
        overlay.classList.remove("awardRevealPlaying");
        if(onDone) onDone();
    }, 3200);

}

// Finds the oldest unseen achievement for a player (if any), plays its
// reveal, marks it seen, then continues. If there's nothing unseen,
// continues immediately — the caller doesn't need to know which case it was.
function playNextUnseenAwardThen(uid, publicData, onDone){

    const unseen = (publicData && publicData.achievementsUnseen) || {};
    const unseenIds = Object.keys(unseen).filter(function(id){ return unseen[id]; });

    if(unseenIds.length === 0){
        if(onDone) onDone();
        return;
    }

    const achievements = publicData.achievements || {};
    unseenIds.sort(function(a, b){ return (achievements[a] || 0) - (achievements[b] || 0); });

    const nextId = unseenIds[0];
    const def = getAchievementDef(nextId);

    if(db) db.ref("users/" + uid + "/public/achievementsUnseen/" + nextId).set(false);

    playAwardRevealAnimation(def, function(){
        onDone();
    });

}
