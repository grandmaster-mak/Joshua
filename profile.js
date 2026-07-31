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
let profilePresenceRef = null;
let profileRoomRef = null;

function openPlayerProfile(uid){

    if(!uid || !db) return;

    currentProfileUid = uid;

    document.getElementById("appShell").style.display = "none";
    document.getElementById("profileScreen").style.display = "flex";
    history.pushState({ screen: "profile", uid: uid }, "", "#profile");

    loadPlayerProfile(uid);

}

function closePlayerProfile(){
    stopProfileLiveListeners();
    document.getElementById("profileScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "profile"){
        history.back();
    }
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
                document.getElementById("profileAddFriendBtn").style.display = friendSnap.exists() ? "none" : "block";
            });
        }else{
            document.getElementById("profileAddFriendBtn").style.display = "none";
        }

        startProfileLiveListeners(uid);
        loadProfileRecentGames(uid);
        if(typeof loadAwardsGrid === "function") loadAwardsGrid(uid, "profileAwardsGrid");

    }).catch(function(err){
        document.getElementById("profileRecentGamesList").innerHTML = '<p class="sub">Could not load profile: ' + escapeHtml(err.message) + '</p>';
    });

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

// Reuses the same row renderer script.js's Home "Recent Games" list uses
// (renderRecentGameRow) so both places show identical, fully-detailed
// rows: opponent photo, live rating, online dot, mode, result, and time —
// instead of the old bare-bones version that only showed name + result.
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
            if(typeof renderRecentGameRow === "function"){
                renderRecentGameRow(list, entry);
            }
        });

    }).catch(function(err){
        list.innerHTML = '<p class="sub">Could not load recent games: ' + escapeHtml(err.message) + '</p>';
    });

}

function messageFromProfile(){

    if(!currentProfileUid || !currentUser) return;

    // IMPORTANT: don't call closePlayerProfile() here. That function does
    // history.back(), which fires its popstate asynchronously — often
    // AFTER openFriendChat() below has already pushed the chat's own
    // history state. When that stale popstate finally arrives, it lands
    // on whatever was on the stack before the profile was even opened,
    // and the app's global popstate handler then tears down the chat
    // screen and drops the user back on Home. That was the bug: tapping
    // Message appeared to just bounce straight to the home screen.
    //
    // Instead, just hide the profile screen directly (no history.back())
    // and let openFriendChat() push its own "chat" state on top of the
    // existing "profile" state. The phone back button then correctly
    // steps chat -> profile -> home, same as everywhere else in the app.
    stopProfileLiveListeners();
    document.getElementById("profileScreen").style.display = "none";

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
            closePlayerProfile();
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
    closePlayerProfile();
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
        closePlayerProfile();
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
// Without this, profileRecentGamesList will show a permission_denied
// error the same way the leaderboard and lessons did before their fixes.
// ============================================================
