// ============================================================
// Friends: search by username, send/accept/decline requests
// ============================================================

// Escapes a string for safe insertion into innerHTML (prevents markup
// breaking / injection from usernames containing <, >, ", or ').
function escapeHtml(str){
    if(str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Race token for loadFriendsList — every call gets a new number, and
// only the MOST RECENT call is allowed to touch the DOM. This is what
// stops the "blink": if loadFriendsList() fires twice in quick
// succession (e.g. tab tap + an auth state re-fire), the first call's
// async work is abandoned instead of racing the second one and wiping
// out a freshly-arrived unread badge.
let friendSuggestionDebounceTimer = null;
let friendSuggestionQuerySeq = 0;
let friendsListLoadToken = 0;

function handleFriendSearchSuggestions(query){

    const container = document.getElementById("friendSuggestions");
    if(!container) return;

    const trimmed = query.trim();
    clearTimeout(friendSuggestionDebounceTimer);

    if(!trimmed || !currentUser){
        container.classList.remove("show");
        container.innerHTML = "";
        return;
    }

    const cachedMap = loadCachedUsernamesMap();
    if(cachedMap) renderFriendSuggestionsFromMap(trimmed, cachedMap, container);

    if(!db) return;

    const mySeq = ++friendSuggestionQuerySeq;

    // Wait for a short pause in typing, THEN ask Firebase only for
    // usernames starting with what's typed — not the whole list. This
    // is the actual fix: a tiny, targeted request instead of a full
    // download on every keystroke.
    friendSuggestionDebounceTimer = setTimeout(function(){

        const endRange = trimmed + "\uf8ff";

        db.ref("usernamesLower").orderByKey().startAt(trimmed.toLowerCase()).endAt(trimmed.toLowerCase() + "\uf8ff").limitToFirst(10).once("value").then(function(snap){

            if(mySeq !== friendSuggestionQuerySeq) return; // a newer keystroke already took over

            const freshMap = loadCachedUsernamesMap() || {};
            snap.forEach(function(child){ freshMap[child.key] = child.val(); });
            cacheUsernamesMap(freshMap);

            const currentInput = document.getElementById("friendSearchInput");
            if(currentInput && currentInput.value.trim() === trimmed){
                renderFriendSuggestionsFromMap(trimmed, freshMap, container);
            }

        }).catch(function(err){
            console.error("Friend suggestion refresh error:", err.message);
        });

    }, 350);

}
function renderFriendSuggestionsFromMap(trimmed, usernamesMap, container){

    const users = Object.keys(usernamesMap).map(function(username){
        return { username: username, uid: usernamesMap[username] };
    });

    const filtered = users.filter(function(u){
        return u.uid !== currentUser.uid &&
               u.username.toLowerCase().startsWith(trimmed.toLowerCase());
    }).slice(0, 10);

    if(filtered.length === 0){
        container.classList.remove("show");
        container.innerHTML = "";
        return;
    }

    let html = "";
    filtered.forEach(function(u){
        const cachedProfile = loadCachedUserProfile(u.uid);
        const flag = cachedProfile ? (cachedProfile.flag || "") : "";
        const photo = cachedProfile ? (cachedProfile.photoURL || DEFAULT_AVATAR_SRC) : DEFAULT_AVATAR_SRC;
        const cachedStatus = loadCachedFriendStatus(u.uid);
        html +=
            '<div class="friendSuggestionItem">' +
                '<div class="friendSuggestionMain" onclick="selectFriendSuggestion(\'' + u.uid + '\', \'' + escapeHtml(u.username) + '\')">' +
                    '<img class="friendSuggestionAvatar" src="' + photo + '" alt="">' +
                    '<span>' + escapeHtml(flag) + ' ' + escapeHtml(u.username) + '</span>' +
                '</div>' +
                '<span class="friendSuggestionStatusSlot" id="fsStatus_' + u.uid + '">' + friendStatusLabel(cachedStatus) + '</span>' +
            '</div>';
    });

    container.innerHTML = html;
    container.classList.add("show");

    if(!db) return;

    filtered.forEach(function(u){

        db.ref("users/" + u.uid + "/public").once("value").then(function(snap){
            const data = snap.val();
            if(data) cacheUserProfile(u.uid, data);
        }).catch(function(){});

        if(!currentUser) return;

        db.ref("users/" + currentUser.uid + "/private/friends/" + u.uid).once("value").then(function(fSnap){

            if(fSnap.exists()){
                cacheFriendStatus(u.uid, "friend");
                const slot = document.getElementById("fsStatus_" + u.uid);
                if(slot) slot.innerHTML = friendStatusLabel("friend");
                return;
            }

            db.ref("users/" + currentUser.uid + "/private/friendRequestsOutgoing/" + u.uid).once("value").then(function(rSnap){
                const status = rSnap.exists() ? "sent" : "none";
                cacheFriendStatus(u.uid, status);
                const slot = document.getElementById("fsStatus_" + u.uid);
                if(slot) slot.innerHTML = friendStatusLabel(status);
            });

        }).catch(function(){});

    });

}

// When a suggestion is clicked
function selectFriendSuggestion(uid, username){
    const input = document.getElementById("friendSearchInput");
    const container = document.getElementById("friendSuggestions");
    if(input) input.value = username;
    if(container){
        container.classList.remove("show");
        container.innerHTML = "";
    }
    searchForFriend();
}

function searchForFriend(){

    const query = document.getElementById("friendSearchInput").value.trim();
    const resultBox = document.getElementById("friendSearchResult");

    if(!query){
        resultBox.innerHTML = '<p class="sub">Enter a username to search.</p>';
        return;
    }
    if(!currentUser){
        resultBox.innerHTML = '<p class="sub">Please log in to add friends.</p>';
        return;
    }

    const cachedMap = loadCachedUsernamesMap();
    if(cachedMap && cachedMap[query] !== undefined){
        const foundUid = cachedMap[query];
        if(foundUid === currentUser.uid){
            resultBox.innerHTML = '<p class="sub">That\'s your own username.</p>';
        }else{
            renderSearchResult(foundUid, loadCachedUserProfile(foundUid) || {});
        }
    }else{
        resultBox.innerHTML = '<p class="sub">Searching...</p>';
    }

    if(!db) return;
    runFriendSearch(query, resultBox);
}

function runFriendSearch(query, resultBox){

    let stalledTimeout = setTimeout(function(){
        if(!resultBox.querySelector(".friendCard")){
            resultBox.innerHTML = '<p class="sub">Still searching — your connection seems slow...</p>';
        }
    }, 4000);

    db.ref("usernames/" + query).once("value")
        .then(function(snapshot){

            clearTimeout(stalledTimeout);
            const currentInput = document.getElementById("friendSearchInput");
            const stillRelevant = currentInput && currentInput.value.trim() === query;

            if(!snapshot.exists()){
                const map = loadCachedUsernamesMap() || {};
                delete map[query];
                cacheUsernamesMap(map);
                if(stillRelevant && !resultBox.querySelector(".friendCard")){
                    resultBox.innerHTML = '<p class="sub">No user found with that username.</p>';
                }
                return;
            }

            const foundUid = snapshot.val();
            const map = loadCachedUsernamesMap() || {};
            map[query] = foundUid;
            cacheUsernamesMap(map);

            if(foundUid === currentUser.uid){
                if(stillRelevant) resultBox.innerHTML = '<p class="sub">That\'s your own username.</p>';
                return;
            }

            return db.ref("users/" + foundUid + "/public").once("value").then(function(userSnap){
                const data = userSnap.val() || {};
                cacheUserProfile(foundUid, data);
                if(stillRelevant) renderSearchResult(foundUid, data);
            });

        })
        .catch(function(err){
            clearTimeout(stalledTimeout);
            if(!resultBox.querySelector(".friendCard")){
                resultBox.innerHTML = '<p class="sub">Search failed: ' + escapeHtml(err.message) + '</p>';
            }
        });

}

function renderSearchResult(uid, data){

    const resultBox = document.getElementById("friendSearchResult");
    const safeUsername = escapeHtml(data.username || "");

    resultBox.innerHTML =
        '<div class="friendCard">' +
            '<div class="friendIdentity" style="cursor:pointer;" onclick="openPlayerProfile(\'' + uid + '\')">' +
                '<img class="friendAvatarImg" src="' + (data.photoURL || DEFAULT_AVATAR_SRC) + '" alt="">' +
                '<div class="friendInfo">' +
                    '<span class="friendName">' + escapeHtml(data.flag || "") + ' ' + safeUsername + '</span>' +
                    '<span class="friendRating">Rating ' + (data.rating || 100) + '</span>' +
                '</div>' +
            '</div>' +
            '<span id="friendSearchActionSlot"><button class="btnSecondary" disabled>...</button></span>' +
        '</div>';

    if(!db || !currentUser) return;

    db.ref("users/" + currentUser.uid + "/private/friends/" + uid).once("value").then(function(friendSnap){
        const isFriend = friendSnap.exists();
        return db.ref("users/" + currentUser.uid + "/private/friendRequestsOutgoing/" + uid).once("value").then(function(reqSnap){
            const alreadyRequested = reqSnap.exists();
            const slot = document.getElementById("friendSearchActionSlot");
            if(!slot) return; // they searched something else already

            if(isFriend){
                slot.innerHTML = '<button class="btnSecondary" disabled>Already Friends</button>';
            }else if(alreadyRequested){
                slot.innerHTML = '<button class="btnSecondary" disabled>Request Sent</button>';
            }else{
                slot.innerHTML = '<button class="btnPrimary" data-friend-uid="' + uid + '" data-friend-name="' + safeUsername + '" onclick="sendFriendRequest(this.dataset.friendUid, this.dataset.friendName)">Add Friend</button>';
            }
        });
    });

}
function sendFriendRequest(targetUid, targetUsername){

    if(!currentUser || !db) return;

    db.ref("users/" + targetUid + "/private/friendRequestsIncoming/" + currentUser.uid).set({
        username: currentUsername,
        flag: currentUserFlag,
        rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
        photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
        time: Date.now()
    });

    db.ref("users/" + currentUser.uid + "/private/friendRequestsOutgoing/" + targetUid).set(true);

    const resultBox = document.getElementById("friendSearchResult");
    if(resultBox){
        resultBox.innerHTML = '<p class="sub">Friend request sent to ' + escapeHtml(targetUsername) + '.</p>';
    }
}

function loadFriendRequests(){

    if(!db || !currentUser) return;

    db.ref("users/" + currentUser.uid + "/private/friendRequestsIncoming").once("value").then(function(snapshot){

        const section = document.getElementById("friendRequestsSection");
        const list = document.getElementById("friendRequestsList");

        const navBadge = document.getElementById("friendsNavBadge");
        const requestCount = snapshot.exists() ? snapshot.numChildren() : 0;

        if(navBadge){
            if(requestCount > 0){
                navBadge.textContent = requestCount;
                navBadge.style.display = "flex";
            }else{
                navBadge.style.display = "none";
            }
        }

        if(!section || !list) return;

        if(!snapshot.exists()){
            section.style.display = "none";
            return;
        }

        section.style.display = "block";
        list.innerHTML = "";

        snapshot.forEach(function(child){

            const fromUid = child.key;
            const req = child.val();

            const row = document.createElement("div");
            row.className = "requestCard";
            row.innerHTML =
                '<div class="friendIdentity" style="cursor:pointer;" onclick="openPlayerProfile(\'' + fromUid + '\')">' +
                    '<img class="friendAvatarImg" src="' + (req.photo || DEFAULT_AVATAR_SRC) + '" alt="">' +
                    '<div class="friendInfo">' +
                        '<span class="friendName">' + escapeHtml(req.flag || "") + ' ' + escapeHtml(req.username) + '</span>' +
                        '<span class="friendRating">Rating ' + (req.rating || 100) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="requestActions">' +
                    '<button class="btnPrimary" data-from-uid="' + fromUid + '" onclick="acceptFriendRequest(this.dataset.fromUid)">Accept</button>' +
                    '<button class="btnSecondary" data-from-uid="' + fromUid + '" onclick="declineFriendRequest(this.dataset.fromUid)">Decline</button>' +
                '</div>';

            list.appendChild(row);

        });

    });

}

function acceptFriendRequest(fromUid){

    if(!db || !currentUser) return;

    db.ref("users/" + currentUser.uid + "/private/friends/" + fromUid).set(true);
    db.ref("users/" + fromUid + "/private/friends/" + currentUser.uid).set(true);

    db.ref("users/" + currentUser.uid + "/private/friendRequestsIncoming/" + fromUid).remove();
    db.ref("users/" + fromUid + "/private/friendRequestsOutgoing/" + currentUser.uid).remove();

    loadFriendRequests();
    loadFriendsList();
}

function declineFriendRequest(fromUid){

    if(!db || !currentUser) return;

    db.ref("users/" + currentUser.uid + "/private/friendRequestsIncoming/" + fromUid).remove();
    db.ref("users/" + fromUid + "/private/friendRequestsOutgoing/" + currentUser.uid).remove();

    loadFriendRequests();
}

// ---- Loads (or reloads) the friends list. Keeps cached rows visible
// while fetching live data, then swaps them in one go, so the list
// never flashes blank.
function cacheFriendsList(entries){
    try{ localStorage.setItem("cachedFriendsList", JSON.stringify(entries)); }catch(e){}
}

function loadCachedFriendsList(){
    try{ return JSON.parse(localStorage.getItem("cachedFriendsList") || "null"); }catch(e){ return null; }
}
function cacheUsernamesMap(map){
    try { localStorage.setItem("cachedUsernamesMap", JSON.stringify(map)); } catch(e) {}
}
function loadCachedUsernamesMap(){
    try { return JSON.parse(localStorage.getItem("cachedUsernamesMap") || "null"); } catch(e) { return null; }
}
function cacheUserProfile(uid, data){
    try {
        const all = JSON.parse(localStorage.getItem("cachedUserProfiles") || "{}");
        all[uid] = data;
        localStorage.setItem("cachedUserProfiles", JSON.stringify(all));
    } catch(e) {}
}
function loadCachedUserProfile(uid){
    try {
        const all = JSON.parse(localStorage.getItem("cachedUserProfiles") || "{}");
        return all[uid] || null;
    } catch(e) { return null; }
}
function renderFriendCardFromCache(uid, data){
    const safeUsername = escapeHtml(data.username);
    const row = document.createElement("div");
    row.className = "friendCard";
    row.innerHTML =
        '<div class="friendIdentity" style="cursor:pointer;" onclick="openPlayerProfile(\'' + uid + '\')">' +
            '<div class="friendAvatarWrap">' +
                '<img class="friendAvatarImg" src="' + (data.photoURL || DEFAULT_AVATAR_SRC) + '" alt="">' +
            '</div>' +
            '<div class="friendInfo">' +
                '<span class="friendName">' + escapeHtml(data.flag || "") + ' ' + safeUsername + '</span>' +
                '<span class="friendRating">Rating ' + (data.rating || 100) + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="friendActions">' +
            '<button class="friendMessageBtn" data-uid="' + uid + '" data-name="' + safeUsername + '" onclick="openFriendChat(this.dataset.uid, this.dataset.name)" title="Message">💬<span class="cardBadge" id="friendChatBadge_' + uid + '" style="display:none;"></span></button>' +
            '<button class="btnPrimary" data-uid="' + uid + '" data-name="' + safeUsername + '" onclick="challengeFriend(this.dataset.uid, this.dataset.name)">⚔️ Challenge</button>' +
        '</div>';
    return row;
}
function cacheFriendStatus(uid, status){
    try {
        const all = JSON.parse(localStorage.getItem("cachedFriendStatus") || "{}");
        all[uid] = status;
        localStorage.setItem("cachedFriendStatus", JSON.stringify(all));
    } catch(e) {}
}
function loadCachedFriendStatus(uid){
    try {
        const all = JSON.parse(localStorage.getItem("cachedFriendStatus") || "{}");
        return all[uid] || null;
    } catch(e) { return null; }
}
function friendStatusLabel(status){
    if(status === "friend") return '<span class="friendSuggestionStatus statusFriend">✓ Friend</span>';
    if(status === "sent") return '<span class="friendSuggestionStatus statusSent">Sent</span>';
    return '<span class="friendSuggestionStatus statusNone">+ Add</span>';
}
function loadFriendsList(){

    if(!db || !currentUser) return;

    const list = document.getElementById("friendsList");
    if(!list) return;

    const myToken = ++friendsListLoadToken;

    const cached = loadCachedFriendsList();
    if(cached && cached.length > 0){
        list.innerHTML = "";
        cached.forEach(function(entry){
            list.appendChild(renderFriendCardFromCache(entry.uid, entry.data));
        });
    }

    const cacheAccumulator = {};

    db.ref("users/" + currentUser.uid + "/private/friends").once("value").then(function(snapshot){

        if(myToken !== friendsListLoadToken) return;

        if(!snapshot.exists()){
            list.innerHTML = '<p class="sub">You haven\'t added any friends yet.</p>';
            if(typeof loadOnlineFriendsStrip === "function") loadOnlineFriendsStrip([]);
            cacheFriendsList([]);
            return;
        }

        const uids = [];
        snapshot.forEach(function(child){ uids.push(child.key); });

        if(typeof startFriendChatWatchers === "function") startFriendChatWatchers(uids);
        if(typeof loadOnlineFriendsStrip === "function") loadOnlineFriendsStrip(uids);

        let newRowsHtml = '';

        const friendPromises = uids.map(function(uid){
            return db.ref("users/" + uid + "/public").once("value").then(function(userSnap){
                const data = userSnap.val();
                if(!data) return null;
                cacheAccumulator[uid] = data;

                return db.ref("presence/" + uid).once("value").then(function(presenceSnap){
                    const isOnline = presenceSnap.val() === true;
                    const safeUsername = escapeHtml(data.username);

                    const rowHtml =
                        '<div class="friendCard">' +
                            '<div class="friendIdentity" style="cursor:pointer;" onclick="openPlayerProfile(\'' + uid + '\')">' +
                                '<div class="friendAvatarWrap">' +
                                    '<img class="friendAvatarImg" src="' + (data.photoURL || DEFAULT_AVATAR_SRC) + '" alt="">' +
                                    (isOnline ? '<span class="onlineDotSmall"></span>' : '') +
                                '</div>' +
                                '<div class="friendInfo">' +
                                    '<span class="friendName">' + escapeHtml(data.flag || "") + ' ' + safeUsername + '</span>' +
                                    '<span class="friendRating">Rating ' + (data.rating || 100) + '</span>' +
                                '</div>' +
                            '</div>' +
                            '<div class="friendActions">' +
                                '<button class="friendMessageBtn" data-uid="' + uid + '" data-name="' + safeUsername + '" onclick="openFriendChat(this.dataset.uid, this.dataset.name)" title="Message">💬<span class="cardBadge" id="friendChatBadge_' + uid + '" style="display:none;"></span></button>' +
                                '<button class="btnPrimary" data-uid="' + uid + '" data-name="' + safeUsername + '" onclick="challengeFriend(this.dataset.uid, this.dataset.name)">⚔️ Challenge</button>' +
                            '</div>' +
                        '</div>';

                    return rowHtml;
                });
            });
        });

        Promise.all(friendPromises).then(function(rows){
            if(myToken !== friendsListLoadToken) return;

            newRowsHtml = rows.filter(function(r){ return r !== null; }).join('');

            list.innerHTML = newRowsHtml || '<p class="sub">You haven\'t added any friends yet.</p>';

            cacheFriendsList(
                uids.map(function(u){ return { uid: u, data: cacheAccumulator[u] }; })
                    .filter(function(e){ return e.data; })
            );

            if(typeof updateFriendChatBadge === "function"){
                uids.forEach(function(uid){ updateFriendChatBadge(uid); });
            }
        });

    });

}

function loadFriendsData(){
    loadFriendRequests();
    loadFriendsList();
}

function challengeFriend(friendUid, friendUsername){

    if(!db || !currentUser) return;

    db.ref("users/" + friendUid + "/public/currentRoomCode").once("value").then(function(snap){
        const code = snap.val();
        if(code){
            document.getElementById("watchPromptText").textContent =
                friendUsername + " is currently in a game. Want to watch instead?";
            document.getElementById("watchPromptPopup").dataset.roomCode = code;
            document.getElementById("watchPromptPopup").classList.add("show");
            return;
        }
        actuallySendChallenge(friendUid, friendUsername);
    });

}

function actuallySendChallenge(friendUid, friendUsername){

    const code = generateRoomCode();

    myColor = "white";
    currentRoomCode = code;
    selectedTime = 600;

    db.ref("rooms/" + code).set({
        status: "waiting",
        createdAt: Date.now(),
        timeControl: selectedTime
    });

    db.ref("rooms/" + code + "/players/white").set({
        username: currentUsername,
        flag: currentUserFlag,
        rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
        photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
        uid: currentUser ? currentUser.uid : null
    });

    db.ref("users/" + friendUid + "/private/incomingChallenges/" + currentUser.uid).set({
        username: currentUsername,
        flag: currentUserFlag,
        code: code,
        time: Date.now()
    });

    if(typeof window.challengeStatusRef !== "undefined" && window.challengeStatusRef){
        try{ window.challengeStatusRef.off(); }catch(e){}
    }

    const statusRef = db.ref("rooms/" + code + "/status");
    window.challengeStatusRef = statusRef;

    statusRef.on("value", function(snapshot){
        if(snapshot.val() === "playing"){
            statusRef.off();
            closeInfoPopup();
            if(typeof hideAllScreensBeforeGame === "function") hideAllScreensBeforeGame();
            startOnlineGame(code);
        }
    });

    const declinedRef = db.ref("rooms/" + code + "/declined");
    window.challengeDeclinedRef = declinedRef;

    declinedRef.on("value", function(snapshot){
        if(snapshot.val() === true){
            declinedRef.off();
            statusRef.off();
            db.ref("rooms/" + code).remove();
            showInfoPopup("❌ Challenge Declined", friendUsername + " declined your challenge.");
        }
    });

    showInfoPopup("⚔️ Challenge Sent", "Challenge sent to " + friendUsername + " — waiting for them to accept.");

}

function listenForChallenges(){

    if(!db || !currentUser) return;

    db.ref("users/" + currentUser.uid + "/private/incomingChallenges").on("child_added", function(snapshot){

        const challenge = snapshot.val();
        const fromUid = snapshot.key;
        if(!challenge) return;

        showChallengePopup(challenge, fromUid);

    });

}

function showChallengePopup(challenge, fromUid){

    const nameEl = document.getElementById("challengeFromName");
    const popup = document.getElementById("challengePopup");
    if(!nameEl || !popup) return;

    nameEl.textContent = (challenge.flag || "") + " " + challenge.username;
    popup.dataset.fromUid = fromUid;
    popup.dataset.code = challenge.code;

    popup.classList.remove("show");
    void popup.offsetWidth;
    popup.classList.add("show");

}

function respondToChallenge(accepted){

    const popup = document.getElementById("challengePopup");
    if(!popup) return;

    const fromUid = popup.dataset.fromUid;
    const code = popup.dataset.code;

    popup.classList.remove("show");

    if(db && currentUser){
        db.ref("users/" + currentUser.uid + "/private/incomingChallenges/" + fromUid).remove();
    }

    if(!accepted){
        if(code && db){
            db.ref("rooms/" + code + "/declined").set(true);
        }
        return;
    }

    myColor = "black";
    currentRoomCode = code;

    db.ref("rooms/" + code + "/players/black").set({
        username: currentUsername,
        flag: currentUserFlag,
        rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
        photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
        uid: currentUser ? currentUser.uid : null
    });

    db.ref("rooms/" + code + "/status").set("playing");

    if(typeof hideAllScreensBeforeGame === "function") hideAllScreensBeforeGame();
    startOnlineGame(code);

}

function loadOnlineFriendsStrip(friendUids){

    const strip = document.getElementById("onlineFriendsStrip");
    const countEl = document.getElementById("onlineFriendsCount");
    if(!strip || !db) return;

    if(!friendUids || friendUids.length === 0){
        strip.innerHTML = '<p class="sub">No friends yet — search above to add some.</p>';
        if(countEl) countEl.textContent = "0";
        return;
    }

    const promises = friendUids.map(function(uid){

        return db.ref("presence/" + uid).once("value").then(function(presenceSnap){

            if(presenceSnap.val() !== true) return null;

            return db.ref("users/" + uid + "/public").once("value").then(function(userSnap){
                const data = userSnap.val();
                if(!data) return null;
                return { uid: uid, username: data.username, photoURL: data.photoURL };
            });

        });

    });

    Promise.all(promises).then(function(results){

        const online = results.filter(function(r){ return r !== null; });

        if(countEl) countEl.textContent = String(online.length);

        if(online.length === 0){
            strip.innerHTML = '<p class="sub">No friends online right now.</p>';
            return;
        }

        strip.innerHTML = "";

        online.slice(0, 8).forEach(function(friend){

            const item = document.createElement("div");
            item.className = "onlineFriendItem";
            item.onclick = function(){ openPlayerProfile(friend.uid); };
            item.innerHTML =
                '<div class="onlineFriendAvatarWrap">' +
                    '<img class="onlineFriendAvatarImg" src="' + (friend.photoURL || DEFAULT_AVATAR_SRC) + '" alt="">' +
                    '<span class="onlineFriendDot"></span>' +
                '</div>' +
                '<span class="onlineFriendName">' + escapeHtml(friend.username) + '</span>';

            strip.appendChild(item);

        });

        if(online.length > 8){
            const more = document.createElement("div");
            more.className = "onlineFriendItem";
            more.onclick = function(){ switchScreen("friends"); };
            more.innerHTML =
                '<div class="moreFriendsCircle">+' + (online.length - 8) + '</div>' +
                '<span class="onlineFriendName">More</span>';
            strip.appendChild(more);
        }

    });

}

// ============================================================
// Challenge a Friend — redesigned screen wiring
// ============================================================

function openChallengeScreen(){
    document.getElementById("challengeLinkArea").style.display = "none";
    document.getElementById("challengeScreen").style.display = "flex";
    history.pushState({ screen: "challenge" }, "", "#challenge");
}

window.addEventListener("DOMContentLoaded", function(){
    const cached = loadCachedFriendsList();
    if (cached && cached.length > 0) {
        const list = document.getElementById("friendsList");
        if(!list) return;
        list.innerHTML = "";
        cached.forEach(function(entry){
            list.appendChild(renderFriendCardFromCache(entry.uid, entry.data));
        });
    }
});

function closeChallengeScreen(){
    document.getElementById("challengeScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    history.replaceState({ screen: null }, "", location.href);
    switchScreen(lastActiveTab);
}

document.addEventListener("DOMContentLoaded", function(){

    const backBtn = document.getElementById("challengeBackBtn");
    if(backBtn) backBtn.addEventListener("click", closeChallengeScreen);

    const createBtn = document.getElementById("createChallengeBtn");
    if(createBtn) createBtn.addEventListener("click", function(){

        if(!db){
            alert("Could not connect — check your internet connection.");
            return;
        }

        const colorChoice = document.getElementById("challengeColor").value;
        const minutes = Number(document.getElementById("challengeTime").value);
        const seconds = minutes * 60;

        const code = generateRoomCode();

        myColor = colorChoice;
        currentRoomCode = code;
        selectedTime = seconds;

        db.ref("rooms/" + code).set({
            status: "waiting",
            createdAt: Date.now(),
            timeControl: seconds
        });

        db.ref("rooms/" + code + "/players/" + colorChoice).set({
            username: (typeof currentUsername !== "undefined" && currentUsername) ? currentUsername : "Guest",
            flag: (typeof currentUserFlag !== "undefined" && currentUserFlag) ? currentUserFlag : "🏳️",
            rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
            photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
            uid: currentUser ? currentUser.uid : null
        });

        const statusRef = db.ref("rooms/" + code + "/status");
        statusRef.on("value", function(snapshot){
            if(snapshot.val() === "playing"){
                statusRef.off();
                closeChallengeScreen();
                if(typeof hideAllScreensBeforeGame === "function") hideAllScreensBeforeGame();
                startOnlineGame(code);
            }
        });

        const link = location.origin + location.pathname + "#challenge=" + code;
        document.getElementById("challengeLinkInput").value = link;
        document.getElementById("challengeLinkArea").style.display = "block";

    });

    const copyBtn = document.getElementById("copyChallengeLink");
    if(copyBtn) copyBtn.addEventListener("click", function(){
        const input = document.getElementById("challengeLinkInput");
        input.select();
        if(navigator.clipboard && navigator.clipboard.writeText){
            navigator.clipboard.writeText(input.value).then(function(){
                showInfoPopup("🔗 Link Copied", "Challenge link copied — paste it anywhere to invite someone.");
            });
        }
    });

    const waBtn = document.getElementById("shareChallengeLink");
    if(waBtn) waBtn.addEventListener("click", function(){
        const link = document.getElementById("challengeLinkInput").value;
        const name = (typeof currentUsername !== "undefined" && currentUsername) ? currentUsername : "Someone";
        const text = encodeURIComponent(name + " challenged you to a game of chess! " + link);
        window.open("https://wa.me/?text=" + text, "_blank");
    });

    let pendingChallengeCode = null;
    let pendingChallengeColor = null;

    const acceptBtn = document.getElementById("acceptChallengeBtn");
    if(acceptBtn) acceptBtn.addEventListener("click", function(){

        document.getElementById("challengeAcceptScreen").style.display = "none";
        if(!pendingChallengeCode || !pendingChallengeColor) return;

        myColor = pendingChallengeColor;
        currentRoomCode = pendingChallengeCode;

        db.ref("rooms/" + pendingChallengeCode + "/players/" + pendingChallengeColor).set({
            username: (typeof currentUsername !== "undefined" && currentUsername) ? currentUsername : "Guest",
            flag: (typeof currentUserFlag !== "undefined" && currentUserFlag) ? currentUserFlag : "🏳️",
            rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
            photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
            uid: currentUser ? currentUser.uid : null
        });

        db.ref("rooms/" + pendingChallengeCode + "/status").set("playing");

        if(typeof hideAllScreensBeforeGame === "function") hideAllScreensBeforeGame();
        startOnlineGame(pendingChallengeCode);

    });

    const declineBtn = document.getElementById("declineChallengeBtn");
    if(declineBtn) declineBtn.addEventListener("click", function(){
        document.getElementById("challengeAcceptScreen").style.display = "none";
        pendingChallengeCode = null;
        pendingChallengeColor = null;
    });

    const hashMatch = (location.hash || "").match(/challenge=([A-Za-z0-9]+)/);
    if(hashMatch && db){

        const code = hashMatch[1].toUpperCase();
        history.replaceState({ screen: null }, "", location.pathname);

        db.ref("rooms/" + code).once("value").then(function(snapshot){

            if(!snapshot.exists()) return;
            const room = snapshot.val();
            if(room.status !== "waiting") return;

            const players = room.players || {};
            const takenColor = players.white ? "white" : (players.black ? "black" : null);
            if(!takenColor) return;

            const openColor = takenColor === "white" ? "black" : "white";
            const challenger = players[takenColor];

            pendingChallengeCode = code;
            pendingChallengeColor = openColor;

            document.getElementById("challengeAcceptAvatar").textContent = (challenger && challenger.flag) ? challenger.flag : "🏳️";
            document.getElementById("challengeAcceptName").textContent = (challenger && challenger.username) ? challenger.username : "Someone";
            document.getElementById("challengeAcceptColorIcon").textContent = openColor === "white" ? "♙" : "♟";
            document.getElementById("challengeAcceptColorValue").textContent = openColor === "white" ? "White" : "Black";
            document.getElementById("challengeAcceptTimeValue").textContent =
                (room.timeControl === -1) ? "Unlimited" : (Math.round((room.timeControl || 600) / 60) + " min");

            document.getElementById("challengeAcceptScreen").style.display = "flex";

        });

    }

});
