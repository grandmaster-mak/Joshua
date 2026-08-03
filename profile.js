// ============================================================
// Player Profile — opened by tapping anyone's avatar/name anywhere they
// appear (friends list, search results, online friends strip). Shows
// their public stats and recent games, and — if they're online and
// currently in a game — a live "Watch" button that drops you straight
// into spectating, no room code needed.
//
// Requires one more Firebase Rules addition beyond what's already been
// set up for the leaderboard: users/{uid}/history needs to be readable
// by any logged-in user, the same way users/{uid}/public already is —
// otherwise "Recent Games" here will show a permission error. See the
// note at the bottom of this file for the exact rule to add.
// ============================================================

let currentProfileUid = null;
let currentProfileUsername = null;
let currentProfileIsFriend = false;
let profilePresenceRef = null;
let profileRoomRef = null;
let profileFriendUids = [];
let profileFriendsShownCount = 0;

function openPlayerProfile(uid){

    if(!uid || !db) return;

    currentProfileUid = uid;

    document.getElementById("appShell").style.display = "none";
    document.getElementById("profileScreen").style.display = "flex";
    history.pushState({ screen: "profile", uid: uid }, "", "#profile");

    loadPlayerProfile(uid);

}

// Fixed: previously this forced appShell/Home to show FIRST and then
// called history.back(), which let popstate correct the screen a moment
// later — that's the "hijack" flash when going Profile A -> Profile B
// and hitting back. Now popstate is the ONLY thing that decides what to
// show; this function just triggers the navigation.
function closePlayerProfile(){
    stopProfileLiveListeners();
    if(history.state && history.state.screen === "profile"){
        history.back();
    }else{
        document.getElementById("profileScreen").style.display = "none";
        document.getElementById("appShell").style.display = "flex";
    }
}

// Used when we're about to open ANOTHER screen (chat, a challenge result,
// spectating) rather than going back to Home. Just hides the profile
// screen without touching history — the destination screen pushes its
// own state on top, so the back button still works correctly afterward
// (back from chat returns to this profile, not all the way to Home).
function hideProfileScreenOnly(){
    stopProfileLiveListeners();
    document.getElementById("profileScreen").style.display = "none";
}

function stopProfileLiveListeners(){
    if(profilePresenceRef) profilePresenceRef.off();
    if(profileRoomRef) profileRoomRef.off();
    profilePresenceRef = null;
    profileRoomRef = null;
}

function loadPlayerProfile(uid){

    document.getElementById("profileRecentGamesList").innerHTML = '<p class="sub">Loading...</p>';

    db.ref("users/" + uid + "/public").once("value").then(function(snapshot){

        const data = snapshot.val();
        if(!data){
            document.getElementById("profileUsername").textContent = "Player not found";
            return;
        }

        renderPlayerProfile(uid, data);

        // Only the OWNER of an achievement ever sees the "new award"
        // banner — viewing someone else's profile must never trigger it
        // or mark anything as seen on their behalf.
        if(currentUser && uid === currentUser.uid && typeof checkAndShowOwnAwardBanner === "function"){
            checkAndShowOwnAwardBanner(uid, data, "profileAchievementsGrid");
        }

    }).catch(function(err){
        document.getElementById("profileRecentGamesList").innerHTML = '<p class="sub">Could not load profile: ' + escapeHtml(err.message) + '</p>';
    });

}
function renderPlayerProfile(uid, data){

        currentProfileUsername = data.username || "Player";

        document.getElementById("profileAvatarImg").src = data.photoURL || DEFAULT_AVATAR_SRC;
        document.getElementById("profileUsername").textContent = (data.flag ? data.flag + " " : "") + currentProfileUsername;
        document.getElementById("profileRatingValue").textContent = data.rating || 100;
        document.getElementById("profileWinsValue").textContent = data.wins || 0;
        document.getElementById("profileStreakValue").textContent = data.winStreak || 0;
        document.getElementById("profilePuzzleValue").textContent = data.puzzleRating || 800;

        const isMe = currentUser && uid === currentUser.uid;
        document.getElementById("profileMessageBtn").style.display = isMe ? "none" : "block";
        document.getElementById("profileChallengeBtn").style.display = isMe ? "none" : "block";

        if(!isMe && currentUser){
            db.ref("users/" + currentUser.uid + "/private/friends/" + uid).once("value").then(function(friendSnap){
                currentProfileIsFriend = friendSnap.exists();
                document.getElementById("profileAddFriendBtn").style.display = currentProfileIsFriend ? "none" : "block";
            });
        }else{
            currentProfileIsFriend = true; // viewing your own profile
            document.getElementById("profileAddFriendBtn").style.display = "none";
        }

        startProfileLiveListeners(uid);
        loadProfileRecentGames(uid);
        loadProfileFriendsList(uid);
        if(typeof renderAchievementsGrid === "function") renderAchievementsGrid("profileAchievementsGrid", data.achievements);

}

// Live presence + "currently playing" — updates the online dot and the
// Watch button in real time while the profile screen is open, so if the
// player starts or finishes a game while you're looking at their
// profile, the button appears/disappears without needing to reopen it.
function startProfileLiveListeners(uid){

    stopProfileLiveListeners();

    profilePresenceRef = db.ref("presence/" + uid);
    profilePresenceRef.on("value", function(snap){
        const isOnline = snap.val() === true;
        document.getElementById("profileOnlineDot").style.display = isOnline ? "block" : "none";
        document.getElementById("profileOnlineStatus").textContent = isOnline ? "Online" : "Offline";
    });

    profileRoomRef = db.ref("users/" + uid + "/public/currentRoomCode");
    profileRoomRef.on("value", function(snap){
        const code = snap.val();
        document.getElementById("profileWatchBtn").style.display = code ? "block" : "none";
    });

}

function loadProfileRecentGames(uid){

    const list = document.getElementById("profileRecentGamesList");

    db.ref("users/" + uid + "/history").orderByChild("time").limitToLast(5).once("value").then(function(snapshot){

        if(!snapshot.exists()){
            list.innerHTML = '<p class="sub">No games played yet.</p>';
            return;
        }

        const entries = [];
        snapshot.forEach(function(child){ entries.push(child.val()); });
        entries.reverse();

        list.innerHTML = "";

        entries.forEach(function(entry){

            const label = entry.result === "win" ? "Won" : entry.result === "loss" ? "Lost" : "Draw";
            const cls = entry.result === "win" ? "gameWon" : entry.result === "loss" ? "gameLost" : "gameDrawn";
            const avatarSrc = entry.opponentPhoto || DEFAULT_AVATAR_SRC;
            // Renamed from "Online" to "Online Match" — this is the match
            // TYPE (permanently recorded at game-end), not a live status.
            // It will always say this for every online game, forever,
            // regardless of whether the opponent is online right now.
            const modeLabel = entry.mode === "ai" ? "vs AI" : entry.mode === "online" ? "Online Match" : "Local";

            const row = document.createElement("div");
            row.className = "gameRow";
            row.innerHTML =
                '<div class="gameOpponentInfo">' +
                    '<div class="gameAvatarWrap">' +
                        '<img class="gameAvatarImg" src="' + avatarSrc + '" alt="">' +
                    '</div>' +
                    '<div class="gameOpponentText">' +
                        '<span class="gameOpponent">vs ' + escapeHtml(entry.opponent || "Unknown") + '</span>' +
                        '<span class="gameMeta">' + modeLabel + '<span class="liveStatusText"></span></span>' +
                    '</div>' +
                '</div>' +
                '<span class="gameResult ' + cls + '">' + label + '</span>';

            if(entry.opponentUid){

                const infoEl = row.querySelector(".gameOpponentInfo");
                infoEl.style.cursor = "pointer";
                infoEl.onclick = function(){ openPlayerProfile(entry.opponentUid); };

                // Explicit text either way — "Online now" or "Offline" —
                // instead of a dot that only appears sometimes, so it's
                // always obvious the live check actually ran and isn't
                // silently broken.
                db.ref("presence/" + entry.opponentUid).once("value").then(function(presenceSnap){
                    const statusEl = row.querySelector(".liveStatusText");
                    if(!statusEl) return;
                    if(presenceSnap.val() === true){
                        statusEl.textContent = " · 🟢 Online now";
                        statusEl.classList.add("liveOnline");
                    }else{
                        statusEl.textContent = " · Offline";
                    }
                }).catch(function(){
                    const statusEl = row.querySelector(".liveStatusText");
                    if(statusEl) statusEl.textContent = " · Status unavailable";
                });

            }

            list.appendChild(row);

        });

    }).catch(function(err){
        list.innerHTML = '<p class="sub">Could not load recent games: ' + escapeHtml(err.message) + '</p>';
    });

}

// Shows this player's friends list in batches of 5. Requires a Firebase
// Rules addition beyond what's already set up: users/{uid}/private/friends
// needs to be readable by any logged-in user (a sibling rule under
// "friends", separate from the rest of "private" which stays owner-only).
// See the note at the bottom of this file for the exact rule to add.
function loadProfileFriendsList(uid){

    const list = document.getElementById("profileFriendsList");
    const seeMoreBtn = document.getElementById("profileFriendsSeeMoreBtn");
    list.innerHTML = '<p class="sub">Loading...</p>';
    seeMoreBtn.style.display = "none";

    db.ref("users/" + uid + "/private/friends").once("value").then(function(snapshot){

        if(!snapshot.exists()){
            profileFriendUids = [];
            list.innerHTML = '<p class="sub">No friends yet.</p>';
            return;
        }

        profileFriendUids = Object.keys(snapshot.val());
        profileFriendsShownCount = 0;
        list.innerHTML = "";
        renderNextProfileFriendsBatch();

    }).catch(function(err){
        list.innerHTML = '<p class="sub">Could not load friends: ' + escapeHtml(err.message) + '</p>';
    });

}

function renderNextProfileFriendsBatch(){

    const list = document.getElementById("profileFriendsList");
    const seeMoreBtn = document.getElementById("profileFriendsSeeMoreBtn");

    const batch = profileFriendUids.slice(profileFriendsShownCount, profileFriendsShownCount + 5);

    const lookups = batch.map(function(friendUid){
        return db.ref("users/" + friendUid + "/public").once("value").then(function(snap){
            return { uid: friendUid, data: snap.val() };
        });
    });

    Promise.all(lookups).then(function(results){

        results.forEach(function(result){
            if(!result.data) return;

            const row = document.createElement("div");
            row.className = "friendIdentity profileFriendRowLight";
            row.style.cursor = "pointer";
            row.style.marginBottom = "10px";
            row.onclick = function(){ openPlayerProfile(result.uid); };
            row.innerHTML =
                '<img class="friendAvatarImg" src="' + (result.data.photoURL || DEFAULT_AVATAR_SRC) + '" alt="">' +
                '<div class="friendInfo">' +
                    '<span class="friendName">' + escapeHtml(result.data.flag || "") + ' ' + escapeHtml(result.data.username || "Player") + '</span>' +
                    '<span class="friendRating">Rating ' + (result.data.rating || 100) + '</span>' +
                '</div>' +
                '<button class="profileFriendMsgBtn" data-uid="' + result.uid + '" data-name="' + escapeHtml(result.data.username || "Player") + '" onclick="event.stopPropagation(); openFriendChat(this.dataset.uid, this.dataset.name);">💬</button>';
            list.appendChild(row);
        });

        profileFriendsShownCount += batch.length;

        if(profileFriendsShownCount >= profileFriendUids.length){
            seeMoreBtn.style.display = "none";
        }else{
            seeMoreBtn.style.display = "block";
        }

        if(profileFriendsShownCount === 0){
            list.innerHTML = '<p class="sub">No friends yet.</p>';
        }

    });

}

function showMoreProfileFriends(){
    renderNextProfileFriendsBatch();
}

function messageFromProfile(){
    if(!currentProfileUid || !currentUser) return;
    if(!currentProfileIsFriend){
        showInfoPopup("👋 Add Them First", "Add " + currentProfileUsername + " as a friend before messaging them.");
        return;
    }
    // Deliberately NOT calling hideProfileScreenOnly() here — profileScreen
    // stays showing underneath, and openFriendChat() below pushes its own
    // "chat" history state on top of it cleanly. This is what lets the
    // back button correctly reveal the profile again with no gap/flash,
    // instead of a black frame from profileScreen having been hidden
    // early without any history state to properly return to.
    openFriendChat(currentProfileUid, currentProfileUsername);
}

function addFriendFromProfile(){
    if(!currentProfileUid || !currentUser) return;
    sendFriendRequest(currentProfileUid, currentProfileUsername);
    document.getElementById("profileAddFriendBtn").style.display = "none";
}

// If they're currently playing, offer to watch instead of sending a
// challenge that they can't respond to right now.
function challengeFromProfile(){

    if(!currentProfileUid || !currentUser) return;

    db.ref("users/" + currentProfileUid + "/public/currentRoomCode").once("value").then(function(snap){
        const code = snap.val();
        if(code){
            document.getElementById("watchPromptText").textContent =
                currentProfileUsername + " is currently in a game. Want to watch instead?";
            document.getElementById("watchPromptPopup").dataset.roomCode = code;
            document.getElementById("watchPromptPopup").classList.add("show");
        }else{
            hideProfileScreenOnly();
            challengeFriend(currentProfileUid, currentProfileUsername);
        }
    });

}

function closeWatchPrompt(){
    document.getElementById("watchPromptPopup").classList.remove("show");
}

function confirmWatchFromPrompt(){
    const code = document.getElementById("watchPromptPopup").dataset.roomCode;
    closeWatchPrompt();
    hideProfileScreenOnly();
    if(code) spectateRoom(code);
}

function watchFromProfile(){
    if(!currentProfileUid) return;
    db.ref("users/" + currentProfileUid + "/public/currentRoomCode").once("value").then(function(snap){
        const code = snap.val();
        if(!code){
            showInfoPopup("👀 Watch", "This player just finished — nothing to watch right now.");
            return;
        }
        hideProfileScreenOnly();
        spectateRoom(code);
    });
}

// ============================================================
// FIREBASE RULES NOTE:
// Recent Games on someone else's profile reads users/{uid}/history,
// which isn't covered by the earlier "public" read rule. Add this
// alongside the existing "public" rule, as a sibling under the same
// "$uid" block:
//
//   "history": {
//     ".read": "auth != null"
//   }
//
// The Friends list on someone else's profile also needs one more rule —
// add ".read" as a sibling INSIDE the existing "friends" block under
// "private" (the rest of "private" stays owner-only; this only opens up
// the friends list specifically):
//
//   "friends": {
//     ".read": "auth != null",
//     "$otherUid": {
//       ".write": "auth != null && (auth.uid == $uid || auth.uid == $otherUid)"
//     }
//   }
//
// Without these, Recent Games and Friends on other players' profiles
// will show a permission error, the same way the leaderboard and lessons
// did before their fixes.
// ============================================================
