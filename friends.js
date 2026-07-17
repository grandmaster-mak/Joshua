// ============================================================
// Friends: search by username, send/accept/decline requests
// ============================================================

function searchForFriend(){

    const query = document.getElementById("friendSearchInput").value.trim();
    const resultBox = document.getElementById("friendSearchResult");

    if(!query){
        resultBox.innerHTML = '<p class="sub">Enter a username to search.</p>';
        return;
    }

    if(!db || !currentUser){
        resultBox.innerHTML = '<p class="sub">Please log in to add friends.</p>';
        return;
    }

    resultBox.innerHTML = '<p class="sub">Searching...</p>';

    db.ref("usernames/" + query).once("value")
        .then(function(snapshot){

            if(!snapshot.exists()){
                resultBox.innerHTML = '<p class="sub">No user found with that username.</p>';
                return;
            }

            const foundUid = snapshot.val();

            if(foundUid === currentUser.uid){
                resultBox.innerHTML = '<p class="sub">That\'s your own username.</p>';
                return;
            }

            return db.ref("users/" + foundUid + "/public").once("value").then(function(userSnap){
                renderSearchResult(foundUid, userSnap.val() || {});
            });

        })
        .catch(function(err){
            resultBox.innerHTML = '<p class="sub">Search failed: ' + err.message + '</p>';
        });

}

function renderSearchResult(uid, data){

    const resultBox = document.getElementById("friendSearchResult");

    db.ref("users/" + currentUser.uid + "/private/friends/" + uid).once("value").then(function(friendSnap){

        const isFriend = friendSnap.exists();

        db.ref("users/" + currentUser.uid + "/private/friendRequestsOutgoing/" + uid).once("value").then(function(reqSnap){

            const alreadyRequested = reqSnap.exists();

            let buttonHtml;

            if(isFriend){
                buttonHtml = '<button class="btnSecondary" disabled>Already Friends</button>';
            }else if(alreadyRequested){
                buttonHtml = '<button class="btnSecondary" disabled>Request Sent</button>';
            }else{
                buttonHtml = '<button class="btnPrimary" onclick="sendFriendRequest(\'' + uid + '\', \'' + data.username + '\')">Add Friend</button>';
            }

            resultBox.innerHTML =
                '<div class="friendCard">' +
                    '<div class="friendIdentity">' +
                        '<img class="friendAvatarImg" src="' + (data.photoURL || DEFAULT_AVATAR_SRC) + '" alt="">' +
                        '<div class="friendInfo">' +
                            '<span class="friendName">' + (data.flag || "") + ' ' + data.username + '</span>' +
                            '<span class="friendRating">Rating ' + (data.rating || 100) + '</span>' +
                        '</div>' +
                    '</div>' +
                    buttonHtml +
                '</div>';

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
        resultBox.innerHTML = '<p class="sub">Friend request sent to ' + targetUsername + '.</p>';
    }
}

function loadFriendRequests(){

    if(!db || !currentUser) return;

    db.ref("users/" + currentUser.uid + "/private/friendRequestsIncoming").once("value").then(function(snapshot){

        const section = document.getElementById("friendRequestsSection");
        const list = document.getElementById("friendRequestsList");
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
                '<div class="friendIdentity">' +
                    '<img class="friendAvatarImg" src="' + (req.photo || DEFAULT_AVATAR_SRC) + '" alt="">' +
                    '<div class="friendInfo">' +
                        '<span class="friendName">' + (req.flag || "") + ' ' + req.username + '</span>' +
                        '<span class="friendRating">Rating ' + (req.rating || 100) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="requestActions">' +
                    '<button class="btnPrimary" onclick="acceptFriendRequest(\'' + fromUid + '\')">Accept</button>' +
                    '<button class="btnSecondary" onclick="declineFriendRequest(\'' + fromUid + '\')">Decline</button>' +
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

function loadFriendsList(){

    if(!db || !currentUser) return;

    const list = document.getElementById("friendsList");
    if(!list) return;

    db.ref("users/" + currentUser.uid + "/private/friends").once("value").then(function(snapshot){

        if(!snapshot.exists()){
            list.innerHTML = '<p class="sub">You haven\'t added any friends yet.</p>';
            return;
        }

        const uids = [];
        snapshot.forEach(function(child){ uids.push(child.key); });

        list.innerHTML = "";

        uids.forEach(function(uid){
            db.ref("users/" + uid + "/public").once("value").then(function(userSnap){

                const data = userSnap.val();
                if(!data) return;

                db.ref("presence/" + uid).once("value").then(function(presenceSnap){

                    const isOnline = presenceSnap.val() === true;

                    const row = document.createElement("div");
                    row.className = "friendCard";
                    row.innerHTML =
                        '<div class="friendIdentity">' +
                            '<div class="friendAvatarWrap">' +
                                '<img class="friendAvatarImg" src="' + (data.photoURL || DEFAULT_AVATAR_SRC) + '" alt="">' +
                                (isOnline ? '<span class="onlineDotSmall"></span>' : '') +
                            '</div>' +
                            '<div class="friendInfo">' +
                                '<span class="friendName">' + (data.flag || "") + ' ' + data.username + '</span>' +
                                '<span class="friendRating">Rating ' + (data.rating || 100) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="friendActions">' +
                            '<button class="friendMessageBtn" onclick="openFriendChat(\'' + uid + '\', \'' + data.username + '\')" title="Message">💬</button>' +
                            '<button class="btnPrimary" onclick="challengeFriend(\'' + uid + '\', \'' + data.username + '\')">⚔️ Challenge</button>' +
                        '</div>';

                    list.appendChild(row);

                });

            });
        });

    });

}

function loadFriendsData(){
    loadFriendRequests();
    loadFriendsList();
}

function challengeFriend(friendUid, friendUsername){

    if(!db || !currentUser) return;

    const code = generateRoomCode();

    myColor = "white";
    currentRoomCode = code;

    db.ref("rooms/" + code).set({
        status: "waiting",
        createdAt: Date.now()
    });

    db.ref("rooms/" + code + "/players/white").set({
        username: currentUsername,
        flag: currentUserFlag,
        rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
        photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null
    });

    db.ref("users/" + friendUid + "/private/incomingChallenges/" + currentUser.uid).set({
        username: currentUsername,
        flag: currentUserFlag,
        code: code,
        time: Date.now()
    });

    const statusRef = db.ref("rooms/" + code + "/status");

    statusRef.on("value", function(snapshot){
        if(snapshot.val() === "playing"){
            statusRef.off();
            startOnlineGame(code);
        }
    });

    alert("Challenge sent to " + friendUsername + " — waiting for them to accept.");

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

    if(!accepted) return;

    myColor = "black";
    currentRoomCode = code;

    db.ref("rooms/" + code + "/players/black").set({
        username: currentUsername,
        flag: currentUserFlag,
        rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
        photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null
    });

    db.ref("rooms/" + code + "/status").set("playing");

    startOnlineGame(code);

                }
           
