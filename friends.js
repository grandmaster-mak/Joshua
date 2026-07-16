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

    db.ref("users").orderByChild("username").equalTo(query).once("value")
        .then(function(snapshot){

            if(!snapshot.exists()){
                resultBox.innerHTML = '<p class="sub">No user found with that username.</p>';
                return;
            }

            let found = null;
            let foundUid = null;

            snapshot.forEach(function(child){
                if(child.key !== currentUser.uid){
                    found = child.val();
                    foundUid = child.key;
                }
            });

            if(!found){
                resultBox.innerHTML = '<p class="sub">No user found with that username.</p>';
                return;
            }

            renderSearchResult(foundUid, found);

        })
        .catch(function(err){
            resultBox.innerHTML = '<p class="sub">Search failed: ' + err.message + '</p>';
        });

}

function renderSearchResult(uid, data){

    const resultBox = document.getElementById("friendSearchResult");

    db.ref("users/" + currentUser.uid + "/friends/" + uid).once("value").then(function(friendSnap){

        const isFriend = friendSnap.exists();

        db.ref("users/" + currentUser.uid + "/friendRequestsOutgoing/" + uid).once("value").then(function(reqSnap){

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
                    '<div class="friendInfo">' +
                        '<span class="friendName">' + (data.flag || "") + ' ' + data.username + '</span>' +
                        '<span class="friendRating">Rating ' + (data.rating || 1200) + '</span>' +
                    '</div>' +
                    buttonHtml +
                '</div>';

        });

    });

}

function sendFriendRequest(targetUid, targetUsername){

    if(!currentUser || !db) return;

    db.ref("users/" + targetUid + "/friendRequestsIncoming/" + currentUser.uid).set({
        username: currentUsername,
        flag: currentUserFlag,
        rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 1200,
        time: Date.now()
    });

    db.ref("users/" + currentUser.uid + "/friendRequestsOutgoing/" + targetUid).set(true);

    const resultBox = document.getElementById("friendSearchResult");
    if(resultBox){
        resultBox.innerHTML = '<p class="sub">Friend request sent to ' + targetUsername + '.</p>';
    }
}

function loadFriendRequests(){

    if(!db || !currentUser) return;

    db.ref("users/" + currentUser.uid + "/friendRequestsIncoming").once("value").then(function(snapshot){

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
                '<div class="friendInfo">' +
                    '<span class="friendName">' + (req.flag || "") + ' ' + req.username + '</span>' +
                    '<span class="friendRating">Rating ' + (req.rating || 1200) + '</span>' +
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

    db.ref("users/" + currentUser.uid + "/friends/" + fromUid).set(true);
    db.ref("users/" + fromUid + "/friends/" + currentUser.uid).set(true);

    db.ref("users/" + currentUser.uid + "/friendRequestsIncoming/" + fromUid).remove();
    db.ref("users/" + fromUid + "/friendRequestsOutgoing/" + currentUser.uid).remove();

    loadFriendRequests();
    loadFriendsList();
}

function declineFriendRequest(fromUid){

    if(!db || !currentUser) return;

    db.ref("users/" + currentUser.uid + "/friendRequestsIncoming/" + fromUid).remove();
    db.ref("users/" + fromUid + "/friendRequestsOutgoing/" + currentUser.uid).remove();

    loadFriendRequests();
}

function loadFriendsList(){

    if(!db || !currentUser) return;

    const list = document.getElementById("friendsList");
    if(!list) return;

    db.ref("users/" + currentUser.uid + "/friends").once("value").then(function(snapshot){

        if(!snapshot.exists()){
            list.innerHTML = '<p class="sub">You haven\'t added any friends yet.</p>';
            return;
        }

        const uids = [];
        snapshot.forEach(function(child){ uids.push(child.key); });

        list.innerHTML = "";

        uids.forEach(function(uid){
            db.ref("users/" + uid).once("value").then(function(userSnap){

                const data = userSnap.val();
                if(!data) return;

                const row = document.createElement("div");
                row.className = "friendCard";
                row.innerHTML =
                    '<div class="friendInfo">' +
                        '<span class="friendName">' + (data.flag || "") + ' ' + data.username + '</span>' +
                        '<span class="friendRating">Rating ' + (data.rating || 1200) + '</span>' +
                    '</div>';

                list.appendChild(row);
            });
        });

    });

}

function loadFriendsData(){
    loadFriendRequests();
    loadFriendsList();
}
