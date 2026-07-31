// ============================================================
// Achievements — a fixed set of badges players unlock by playing.
// Unlocked state is stored at users/{uid}/public/achievements/{id} as a
// timestamp, so it's covered by the same "public" read rule already in
// place for the leaderboard — no extra Firebase Rules changes needed.
//
// Each newly-unlocked achievement is also marked "unseen"
// (public/achievementsUnseen/{id} = true). The next time the OWNER (and
// only the owner — never a visitor viewing their profile) looks at
// their own Account tab or their own Profile screen, the oldest unseen
// award shows as a small, discreet banner above their achievements grid
// — not a full-screen takeover, and not shown to anyone else. Once
// shown, it's marked seen so it never replays.
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
    { id: "leaderboard_3", icon: "🥉", title: "#3 on Leaderboard", color: "#cd7f32", check: function(){ return false; } }
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
// newly earned ones, marking each unseen for the reveal banner.
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

    ACHIEVEMENT_DEFS.forEach(function(def){
        const isUnlocked = !!unlockedMap[def.id];
        const badge = document.createElement("div");
        badge.className = "achievementBadge" + (isUnlocked ? " unlocked" : " locked");
        badge.innerHTML =
            '<div class="achievementIcon">' + def.icon + '</div>' +
            '<div class="achievementTitle">' + def.title + '</div>';
        container.appendChild(badge);
    });

}

// ============================================================
// Award reveal — small discreet inline banner (NOT full-screen).
//
// Fixed two bugs from the old fullscreen-overlay version:
//  1. It used to fire for whoever opened a profile — meaning viewing a
//     FRIEND's profile could trigger and mark THEIR unseen award as
//     seen on YOUR screen. checkAndShowOwnAwardBanner() now hard-checks
//     uid === currentUser.uid before doing anything, so it only ever
//     fires for the achievement's actual owner.
//  2. Two independent trigger points (Account tab switch + opening your
//     own Profile screen) could race and double-fire. awardBannerBusy
//     is a simple in-flight guard against that.
// ============================================================

let awardBannerBusy = false;

// uid/publicData: whose data this is. containerId: the achievements
// grid element to drop the banner above (e.g. "accountAchievementsGrid"
// or "profileAchievementsGrid" — whichever screen is currently showing).
function checkAndShowOwnAwardBanner(uid, publicData, containerId){

    // Hard safety check — never show or mark-seen an award that isn't
    // the current logged-in user's own.
    if(!currentUser || uid !== currentUser.uid) return;
    if(awardBannerBusy) return;

    const unseen = (publicData && publicData.achievementsUnseen) || {};
    const unseenIds = Object.keys(unseen).filter(function(id){ return unseen[id]; });
    if(unseenIds.length === 0) return;

    const achievements = publicData.achievements || {};
    unseenIds.sort(function(a, b){ return (achievements[a] || 0) - (achievements[b] || 0); });

    const nextId = unseenIds[0];
    const def = getAchievementDef(nextId);
    if(!def) return;

    awardBannerBusy = true;

    if(db) db.ref("users/" + uid + "/public/achievementsUnseen/" + nextId).set(false);

    showInlineAwardBanner(containerId, def);

    setTimeout(function(){ awardBannerBusy = false; }, 4500);

}

function showInlineAwardBanner(containerId, def){

    const grid = document.getElementById(containerId);
    if(!grid || !grid.parentNode || !def) return;

    const banner = document.createElement("div");
    banner.className = "inlineAwardBanner";
    banner.innerHTML =
        '<span class="inlineAwardBannerIcon" style="color:' + (def.color || "#ffd700") + ';">' + def.icon + '</span>' +
        '<div class="inlineAwardBannerText">' +
            '<b>New Award Unlocked</b>' +
            '<p>' + escapeHtml(def.title) + '</p>' +
        '</div>';

    grid.parentNode.insertBefore(banner, grid);

    requestAnimationFrame(function(){
        banner.classList.add("show");
    });

    setTimeout(function(){
        banner.classList.remove("show");
        setTimeout(function(){ if(banner.parentNode) banner.remove(); }, 400);
    }, 4000);

}
