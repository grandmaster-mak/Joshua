// ============================================================
// Circles — Stage 1
//
// A Circle is a loose, ongoing group (like a hangout, not a locked
// team). Anyone can create one, invite friends to it, or let it show
// up on the public Discover list for strangers to find and join.
//
// Being a member of a Circle commits you to nothing by itself. To
// actually play, any member can PROPOSE A SESSION (a date/time).
// Every current member must then Accept or Decline that specific
// session — same idea as the existing Challenge-a-Friend accept flow,
// just done for a whole group at once instead of one person.
//
// Once everyone has responded:
//   - If the number who accepted is even, the organizer can Start the
//     Session immediately.
//   - If it's odd, the organizer manually picks one person to sit out
//     this round before starting.
// Starting a session randomly pairs the accepted members 2-by-2 and
// drops each pair straight into a normal online game room (reusing
// the exact same "rooms/{code}" structure multiplayer.js already
// uses), so everything downstream — moves, clocks, resign, draw,
// abandonment detection — just works unmodified.
//
// NOTE — deliberately NOT included in this stage:
//   - Mansion Build Points / spending economy (Stage 2)
//   - The visual Mansion + swipe-to-compare viewer (Stage 3)
//   - Avatar selection + "everyone gathers" intro animation (Stage 4)
//   - Push notifications for session start / mansion changes (Stage 5)
// This stage only proves out the group-agreement + pairing mechanic.
//
// Firebase structure this file expects/creates:
//
//   circles/{circleId}
//       name, createdBy, createdAt, isPublic
//       members/{uid} -> { username, flag, joinedAt }
//       pendingSession -> {
//           proposedBy, scheduledTime,
//           status: "voting" | "starting" | "confirmed" | "cancelled",
//           responses/{uid} -> "accepted" | "declined" | null,
//           sitOutUid, sessionId
//       }
//       lastSessionId
//
//   circleSessions/{sessionId}
//       circleId, startedAt
//       pairings/{pid} -> { white, black, roomCode, result }
//
//   users/{uid}/private/circleInvitesIncoming/{circleId}
//       -> { circleName, fromUid, fromUsername, time }
//
// Reuses existing helpers from other files: escapeHtml (friends.js),
// generateRoomCode (multiplayer.js), getMyCurrentKingdom/kingdomState
// (script.js), startOnlineGame/hideAllScreensBeforeGame (script.js /
// multiplayer.js), showInfoPopup, DEFAULT_AVATAR_SRC.
// ============================================================

let currentViewedCircleId = null;
let circleDetailRef = null;
let joinedCircleSessionIds = {}; // guards against double-joining the same session if the listener fires more than once
let shownGatheringSessionIds = {}; // guards against replaying the gathering animation if the listener fires more than once
let circleGatheringInterval = null;
let circleGatheringActiveSessionId = null;
// ---- Avatar selection ("Choose Your Character") ----
const AVATAR_OPTIONS = [
    { id: 1, image: "pieces/avatar_1.jpg", gatherBase: "vatar_1" },
    { id: 2, image: "pieces/avatar_2.jpg", gatherBase: "vatar_2" },
    { id: 3, image: "pieces/avatar_3.jpg", gatherBase: "vatar_3" },
    { id: 4, image: "pieces/avatar_4.jpg", gatherBase: "vatar_4" },
    { id: 5, image: "pieces/avatar_5.jpg", gatherBase: "vatar_5" },
    { id: 6, image: "pieces/avatar_6.jpg", gatherBase: "vatar_6" }
];

function cacheMyAvatarId(id){
    try{ localStorage.setItem("cachedAvatarId", JSON.stringify(id)); }catch(e){}
}
function loadCachedMyAvatarId(){
    try{
        const v = JSON.parse(localStorage.getItem("cachedAvatarId") || "null");
        return (typeof v === "number") ? v : null;
    }catch(e){ return null; }
}

function openAvatarPicker(){
    document.getElementById("appShell").style.display = "none";
    document.getElementById("avatarPickerScreen").style.display = "flex";
    history.pushState({ screen: "avatarPicker" }, "", "#avatarPicker");
    renderAvatarPickerGrid();
}

function closeAvatarPicker(){
    document.getElementById("avatarPickerScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "avatarPicker"){
        history.back();
    }
}

function renderAvatarPickerGrid(){
    const grid = document.getElementById("avatarPickerGrid");
    if(!grid) return;
    const currentId = loadCachedMyAvatarId();
    grid.innerHTML = "";
    AVATAR_OPTIONS.forEach(function(opt){
        const card = document.createElement("div");
        card.className = "avatarPickerCard" + (opt.id === currentId ? " avatarPickerCardActive" : "");
        card.innerHTML =
            '<img src="' + opt.image + '" alt="Avatar ' + opt.id + '">' +
            (opt.id === currentId ? '<span class="avatarPickerCheck">✓</span>' : '');
        card.onclick = function(){ selectMyAvatar(opt.id); };
        grid.appendChild(card);
    });
}

function selectMyAvatar(avatarId){
    cacheMyAvatarId(avatarId);
    renderAvatarPickerGrid();
    if(!db || !currentUser) return;
    db.ref("users/" + currentUser.uid + "/public/avatarId").set(avatarId).catch(function(err){
        console.error("Failed to save avatar choice:", err.message);
    });
}

// Set while the player is actually inside a Circle-session game, so
// mansion.js knows this particular win/loss counts toward the Mansion
// (as opposed to a Quick Match, tournament game, etc).
let activeCircleSessionId = null;
let activeCirclePairingId = null;

function isActiveCircleSessionGame(){
    return !!(activeCircleSessionId && activeCirclePairingId);
}

// Called from mansion.js's updateMansionOnGameResult once a Circle-
// session game ends. Records the result on the shared pairing (best-
// effort — whichever player's client reports first "wins" the write;
// the other's report becomes a harmless no-op since the field's
// already filled) and clears the active-session flags.
function finalizeCircleSessionGameResult(myResult){
    if(!activeCircleSessionId || !activeCirclePairingId || !db) return;
    const sessionId = activeCircleSessionId;
    const pid = activeCirclePairingId;
    activeCircleSessionId = null;
    activeCirclePairingId = null;

    db.ref("circleSessions/" + sessionId + "/pairings/" + pid + "/result").transaction(function(current){
        if(current) return;
        return myResult;
    }).catch(function(err){
        console.error("Failed to record circle session pairing result:", err.message);
    });
}

// ---- Top-level entry point, called from switchScreen('circles') ----

function loadCirclesData(){
    showCirclesListView();
    loadCircleInvites();
    loadMyCircles();
    loadDiscoverCircles();
}

function showCirclesListView(){
    document.getElementById("circlesListView").style.display = "block";
    document.getElementById("circleCreateView").style.display = "none";
    document.getElementById("circleDetailView").style.display = "none";
    stopCircleDetailListener();
}

function showCreateCircleView(){
    document.getElementById("circlesListView").style.display = "none";
    document.getElementById("circleCreateView").style.display = "block";
    document.getElementById("circleDetailView").style.display = "none";
}

function stopCircleDetailListener(){
    if(circleDetailRef){
        circleDetailRef.off();
        circleDetailRef = null;
    }
}

// ---- Cache-first list rendering (same instant-paint pattern as
// Recent Games / Friends / Tournaments elsewhere in this app) ----

function cacheCirclesList(items){
    try{ localStorage.setItem("cachedCirclesList", JSON.stringify(items)); }catch(e){}
}
function loadCachedCirclesList(){
    try{ return JSON.parse(localStorage.getItem("cachedCirclesList") || "null"); }catch(e){ return null; }
}

// ---- Create ----

function createCircle(){

    if(!db || !currentUser){
        showInfoPopup("🔒 Login Required", "Please log in to create a Circle.");
        return;
    }

    const nameInput = document.getElementById("circleNameInput");
    const name = nameInput ? nameInput.value.trim() : "";
    if(!name){
        alert("Please enter a Circle name.");
        return;
    }

    const isPublicInput = document.getElementById("circleIsPublicInput");
    const isPublic = isPublicInput ? isPublicInput.checked : true;

    const newRef = db.ref("circles").push();
    const memberEntry = {};
    memberEntry[currentUser.uid] = {
        username: currentUsername,
        flag: currentUserFlag,
        joinedAt: Date.now()
    };

    newRef.set({
        name: name,
        createdBy: currentUser.uid,
        createdAt: Date.now(),
        isPublic: !!isPublic,
        maxMembers: 10,
        members: memberEntry
    }).then(function(){
        if(nameInput) nameInput.value = "";
        openCircleDetail(newRef.key);
    }).catch(function(err){
        showInfoPopup("⚠️ Error", "Could not create Circle: " + err.message);
    });

}

// ---- Lists: My Circles / Discover ----
// NOTE: same simplification tournaments.js already uses elsewhere in
// this app (limitToLast + client-side filter rather than a dedicated
// per-user index) — fine at this app's current scale, would need a
// circleMemberships/{uid} index to stay fast at much larger scale.

function loadMyCircles(){

    const list = document.getElementById("myCirclesList");
    if(!list || !db || !currentUser) return;

    const cached = loadCachedCirclesList();
    if(cached && cached.length > 0){
        renderCircleListItems(list, cached, true);
    }else{
        list.innerHTML = '<p class="sub">Loading...</p>';
    }

    db.ref("circles").orderByChild("createdAt").limitToLast(200).once("value").then(function(snapshot){

        const mine = [];
        snapshot.forEach(function(child){
            const c = child.val();
            if(c.members && c.members[currentUser.uid]){
                mine.push({ id: child.key, data: c });
            }
        });
        mine.reverse();

        cacheCirclesList(mine);
        renderCircleListItems(list, mine, true);

    }).catch(function(err){
        if(!cached) list.innerHTML = '<p class="sub">Could not load your Circles: ' + escapeHtml(err.message) + '</p>';
    });

}

function loadDiscoverCircles(){

    const list = document.getElementById("discoverCirclesList");
    if(!list || !db) return;

    list.innerHTML = '<p class="sub">Loading...</p>';

    db.ref("circles").orderByChild("createdAt").limitToLast(50).once("value").then(function(snapshot){

        const items = [];
        snapshot.forEach(function(child){
            const c = child.val();
            const alreadyIn = currentUser && c.members && c.members[currentUser.uid];
            if(c.isPublic && !alreadyIn){
                items.push({ id: child.key, data: c });
            }
        });
        items.reverse();

        renderCircleListItems(list, items, false);

    }).catch(function(err){
        list.innerHTML = '<p class="sub">Could not load Circles: ' + escapeHtml(err.message) + '</p>';
    });

}

function renderCircleListItems(container, items, isMine){

    if(items.length === 0){
        container.innerHTML = '<p class="sub">' +
            (isMine ? "You haven't joined any Circles yet." : "No public Circles to discover right now.") +
            '</p>';
        return;
    }

    container.innerHTML = "";

    items.forEach(function(item){

        const c = item.data;
        const memberCount = c.members ? Object.keys(c.members).length : 0;

        const card = document.createElement("div");
        card.className = "tournamentCard"; // reuse existing card styling — no new CSS needed
        card.onclick = function(){ openCircleDetail(item.id); };
        card.innerHTML =
            '<div class="tournamentCardName">🏛️ ' + escapeHtml(c.name) + '</div>' +
            '<div class="tournamentCardMeta">' + memberCount + ' member' + (memberCount === 1 ? "" : "s") + '</div>';

        container.appendChild(card);

    });

}

// ---- Circle Invites (direct, from a friend) ----

function loadCircleInvites(){

    const list = document.getElementById("circleInvitesList");
    if(!list || !db || !currentUser) return;

    db.ref("users/" + currentUser.uid + "/private/circleInvitesIncoming").once("value").then(function(snapshot){

        if(!snapshot.exists()){
            list.innerHTML = '<p class="sub">No pending invites.</p>';
            return;
        }

        list.innerHTML = "";

        snapshot.forEach(function(child){

            const inv = child.val();
            const circleId = child.key;

            const row = document.createElement("div");
            row.className = "requestCard";
            row.innerHTML =
                '<div class="friendInfo">' +
                    '<span class="friendName">🏛️ ' + escapeHtml(inv.circleName) + '</span>' +
                    '<span class="friendRating">Invited by ' + escapeHtml(inv.fromUsername || "a friend") + '</span>' +
                '</div>' +
                '<div class="requestActions">' +
                    '<button class="btnPrimary" data-cid="' + circleId + '" onclick="acceptCircleInvite(this.dataset.cid)">Accept</button>' +
                    '<button class="btnSecondary" data-cid="' + circleId + '" onclick="declineCircleInvite(this.dataset.cid)">Decline</button>' +
                '</div>';

            list.appendChild(row);

        });

    });

}

function acceptCircleInvite(circleId){

    if(!db || !currentUser) return;

    db.ref("circles/" + circleId).transaction(function(c){
        if(!c) return c;

        const currentCount = c.members ? Object.keys(c.members).length : 0;
        if(!c.members || !c.members[currentUser.uid]){
            if(currentCount >= (c.maxMembers || 10)) return c; // full — no-op
        }

        if(!c.members) c.members = {};
        c.members[currentUser.uid] = {
            username: currentUsername,
            flag: currentUserFlag,
            joinedAt: Date.now()
        };
        return c;
    }).then(function(result){

        const c = result.snapshot.val();

        if(!result.committed || !c){
            showInfoPopup("⚠️ Circle Unavailable", "This Circle no longer exists.");
            return;
        }

        if(!c.members || !c.members[currentUser.uid]){
            showInfoPopup("🚪 Circle Full", "This Circle already has its maximum of " + (c.maxMembers || 10) + " people.");
            return;
        }

        db.ref("users/" + currentUser.uid + "/private/circleInvitesIncoming/" + circleId).remove();
        openCircleDetail(circleId);

    }).catch(function(err){
        showInfoPopup("⚠️ Error", "Could not accept invite: " + err.message);
    });
}
function declineCircleInvite(circleId){
    if(!db || !currentUser) return;
    db.ref("users/" + currentUser.uid + "/private/circleInvitesIncoming/" + circleId).remove();
    loadCircleInvites();
}

// ---- Join / Leave ----

function joinCircle(circleId){

    if(!db || !currentUser){
        showInfoPopup("🔒 Login Required", "Please log in to join a Circle.");
        return;
    }

    db.ref("circles/" + circleId).transaction(function(c){
        if(!c) return c;
        if(!c.isPublic) return c; // not joinable without a direct invite
        if(c.members && c.members[currentUser.uid]) return c; // already a member — no-op

        const currentCount = c.members ? Object.keys(c.members).length : 0;
        if(currentCount >= (c.maxMembers || 10)) return c; // full — no-op

        if(!c.members) c.members = {};
        c.members[currentUser.uid] = {
            username: currentUsername,
            flag: currentUserFlag,
            joinedAt: Date.now()
        };
        return c;
    }).then(function(result){

        const c = result.snapshot.val();

        if(!result.committed || !c){
            showInfoPopup("⚠️ Circle Unavailable", "This Circle no longer exists.");
            return;
        }

        if(!c.members || !c.members[currentUser.uid]){
            showInfoPopup("🚪 Circle Full", "This Circle already has its maximum of " + (c.maxMembers || 10) + " people.");
            return;
        }

        openCircleDetail(circleId);

    }).catch(function(err){
        showInfoPopup("⚠️ Error", "Could not join Circle: " + err.message);
    });

}

function leaveCircle(circleId){

    if(!db || !currentUser) return;
    if(!confirm("Leave this Circle? Your Mansion progress is tied to your account, not the Circle, so you won't lose it.")) return;

    db.ref("circles/" + circleId + "/members/" + currentUser.uid).remove().then(function(){
        showCirclesListView();
        loadCirclesData();
    }).catch(function(err){
        showInfoPopup("⚠️ Error", "Could not leave Circle: " + err.message);
    });

}

// ---- Invite a friend into an existing Circle ----

function inviteFriendToCircle(circleId, circleName, friendUid){

    if(!db || !currentUser) return;

    db.ref("users/" + friendUid + "/private/circleInvitesIncoming/" + circleId).set({
        circleName: circleName,
        fromUid: currentUser.uid,
        fromUsername: currentUsername,
        time: Date.now()
    }).then(function(){
        showInfoPopup("✅ Invite Sent", "They'll see your Circle invite next time they open Circles.");
    }).catch(function(err){
        showInfoPopup("⚠️ Error", "Could not send invite: " + err.message);
    });

}

// ---- Detail screen ----

function openCircleDetail(circleId){

    currentViewedCircleId = circleId;

    document.getElementById("circlesListView").style.display = "none";
    document.getElementById("circleCreateView").style.display = "none";
    document.getElementById("circleDetailView").style.display = "block";

    stopCircleDetailListener();

    circleDetailRef = db.ref("circles/" + circleId);
    circleDetailRef.on("value", function(snapshot){

        if(currentViewedCircleId !== circleId) return;

        const c = snapshot.val();
        if(!c){
            showInfoPopup("Circle Not Found", "This Circle no longer exists.");
            showCirclesListView();
            return;
        }

        renderCircleDetail(circleId, c);

    });

}

function renderCircleDetail(circleId, c){

    const isMember = !!(c.members && c.members[currentUser.uid]);
    const isOrganizer = c.createdBy === currentUser.uid;
    const memberUids = c.members ? Object.keys(c.members) : [];

    document.getElementById("circleDetailName").textContent = "🏛️ " + c.name;
    document.getElementById("circleDetailMemberCount").textContent = memberUids.length + " member" + (memberUids.length === 1 ? "" : "s");

    const joinBox = document.getElementById("circleJoinAction");
    if(!isMember){
        joinBox.innerHTML = c.isPublic
            ? '<button class="btnPrimary" data-cid="' + circleId + '" onclick="joinCircle(this.dataset.cid)">Join Circle</button>'
            : '<p class="sub">This Circle is invite-only.</p>';
    }else{
        joinBox.innerHTML = isOrganizer
            ? '<p class="sub">You created this Circle.</p>'
            : '<button class="btnDanger" data-cid="' + circleId + '" onclick="leaveCircle(this.dataset.cid)">Leave Circle</button>';
    }

    const membersBox = document.getElementById("circleMembersList");
    membersBox.innerHTML = "";
    memberUids.forEach(function(uid){
        const m = c.members[uid];
        const safeName = escapeHtml(m.username).replace(/"/g, "&quot;");
        const row = document.createElement("div");
        row.className = "friendCard";
        row.innerHTML =
            '<div class="friendIdentity">' +
                '<div class="friendInfo">' +
                    '<span class="friendName">' + escapeHtml(m.flag || "") + ' ' + escapeHtml(m.username) + (uid === c.createdBy ? " 👑" : "") + '</span>' +
                '</div>' +
            '</div>' +
            '<button class="btnSecondary" style="width:auto; padding:8px 12px; font-size:12px;" data-uid="' + uid + '" data-name="' + safeName + '" onclick="openMemberMansion(this.dataset.uid, this.dataset.name)">🏛️ Mansion</button>';
        membersBox.appendChild(row);
    });

    const inviteSection = document.getElementById("circleInviteSection");
    if(isMember){
        inviteSection.style.display = "block";
        renderCircleInviteFriendsList(circleId, c);
    }else{
        inviteSection.style.display = "none";
    }

    const sessionSection = document.getElementById("circleSessionSection");
    if(isMember){
        sessionSection.style.display = "block";
        renderCircleSessionContent(circleId, c, isOrganizer);
    }else{
        sessionSection.style.display = "none";
    }

}

function renderCircleInviteFriendsList(circleId, c){

    const box = document.getElementById("circleInviteFriendsList");
    if(!box || !db || !currentUser) return;

    box.innerHTML = '<p class="sub">Loading friends...</p>';

    db.ref("users/" + currentUser.uid + "/private/friends").once("value").then(function(snapshot){

        if(!snapshot.exists()){
            box.innerHTML = '<p class="sub">Add some friends first to invite them here.</p>';
            return;
        }

        const friendUids = [];
        snapshot.forEach(function(child){ friendUids.push(child.key); });

        const notYetIn = friendUids.filter(function(uid){ return !(c.members && c.members[uid]); });

        if(notYetIn.length === 0){
            box.innerHTML = '<p class="sub">All your friends are already in this Circle.</p>';
            return;
        }

        box.innerHTML = "";
        const safeCircleName = escapeHtml(c.name).replace(/'/g, "\\'");

        notYetIn.forEach(function(uid){
            db.ref("users/" + uid + "/public").once("value").then(function(userSnap){

                const data = userSnap.val();
                if(!data) return;

                const row = document.createElement("div");
                row.className = "friendCard";
                row.innerHTML =
                    '<div class="friendIdentity">' +
                        '<div class="friendInfo">' +
                            '<span class="friendName">' + escapeHtml(data.flag || "") + ' ' + escapeHtml(data.username) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<button class="btnPrimary" style="width:auto;" data-uid="' + uid + '" onclick="inviteFriendToCircle(\'' + circleId + '\', \'' + safeCircleName + '\', this.dataset.uid)">Invite</button>';

                box.appendChild(row);

            });
        });

    });

}

// ---- Session proposal + voting ----

function proposeCircleSession(circleId){

    const input = document.getElementById("circleSessionTimeInput");
    const dtValue = input ? input.value : "";
    if(!dtValue){
        alert("Pick a date and time.");
        return;
    }

    const scheduledTime = new Date(dtValue).getTime();
    if(!scheduledTime || scheduledTime < Date.now()){
        alert("Pick a time in the future.");
        return;
    }

    db.ref("circles/" + circleId).transaction(function(c){

        if(!c) return c;
        if(!c.members || !c.members[currentUser.uid]) return c; // not a member — no-op
        if(c.pendingSession && c.pendingSession.status === "voting") return c; // one already in progress

        const responses = {};
        Object.keys(c.members).forEach(function(uid){ responses[uid] = null; });
        responses[currentUser.uid] = "accepted"; // proposer auto-accepts

        c.pendingSession = {
            proposedBy: currentUser.uid,
            scheduledTime: scheduledTime,
            status: "voting",
            responses: responses,
            sitOutUid: null
        };

        return c;

    }).catch(function(err){
        showInfoPopup("⚠️ Error", "Could not propose session: " + err.message);
    });

}

function respondToCircleSession(circleId, accepted){

    db.ref("circles/" + circleId).transaction(function(c){
        if(!c || !c.pendingSession || c.pendingSession.status !== "voting") return c;
        if(!c.pendingSession.responses) c.pendingSession.responses = {};
        c.pendingSession.responses[currentUser.uid] = accepted ? "accepted" : "declined";
        return c;
    }).catch(function(err){
        showInfoPopup("⚠️ Error", "Could not respond: " + err.message);
    });

}

function renderCircleSessionContent(circleId, c, isOrganizer){

    const box = document.getElementById("circleSessionContent");
    if(!box) return;

    const ps = c.pendingSession;

    if(!ps || ps.status === "cancelled" || ps.status === "confirmed"){
        box.innerHTML =
            '<input type="datetime-local" id="circleSessionTimeInput" style="margin-bottom:10px;">' +
            '<button class="btnPrimary" data-cid="' + circleId + '" onclick="proposeCircleSession(this.dataset.cid)">Propose a Session</button>';
        return;
    }

    if(ps.status === "starting"){
        box.innerHTML = '<p class="sub">Starting the session...</p>';
        return;
    }

    // status === "voting"
    const responses = ps.responses || {};
    const memberUids = Object.keys(responses);
    const acceptedUids = memberUids.filter(function(uid){ return responses[uid] === "accepted"; });
    const declinedUids = memberUids.filter(function(uid){ return responses[uid] === "declined"; });
    const pendingUids = memberUids.filter(function(uid){ return !responses[uid]; });

    function nameFor(uid){ return escapeHtml((c.members[uid] || {}).username || "?"); }

    let html = '<p class="sub">Proposed time: ' + escapeHtml(new Date(ps.scheduledTime).toLocaleString()) + '</p>';
    html += '<p class="sub">✅ Accepted: ' + (acceptedUids.map(nameFor).join(", ") || "—") + '</p>';
    if(declinedUids.length > 0) html += '<p class="sub">❌ Declined: ' + declinedUids.map(nameFor).join(", ") + '</p>';
    if(pendingUids.length > 0) html += '<p class="sub">⏳ Waiting on: ' + pendingUids.map(nameFor).join(", ") + '</p>';

    box.innerHTML = html;

    const myResponse = responses[currentUser.uid];
    if(!myResponse){
        const respondRow = document.createElement("div");
        respondRow.innerHTML =
            '<button class="btnPrimary" data-cid="' + circleId + '" onclick="respondToCircleSession(this.dataset.cid, true)">Accept</button>' +
            '<button class="btnSecondary" data-cid="' + circleId + '" onclick="respondToCircleSession(this.dataset.cid, false)">Decline</button>';
        box.appendChild(respondRow);
    }

    if(pendingUids.length === 0 && isOrganizer){

        if(acceptedUids.length < 2){

            const p = document.createElement("p");
            p.className = "sub";
            p.textContent = "Not enough people accepted to start a session.";
            box.appendChild(p);

        }else if(acceptedUids.length % 2 === 0){

            const startBtn = document.createElement("button");
            startBtn.className = "btnPrimary";
            startBtn.textContent = "Start Session";
            startBtn.onclick = function(){ startCircleSessionTransaction(circleId, null); };
            box.appendChild(startBtn);

        }else{

            const label = document.createElement("span");
            label.className = "fieldLabel";
            label.textContent = "Odd number accepted — pick who sits out this round";
            box.appendChild(label);

            const select = document.createElement("select");
            select.id = "circleSitOutSelect";
            acceptedUids.forEach(function(uid){
                const opt = document.createElement("option");
                opt.value = uid;
                opt.textContent = (c.members[uid] || {}).username || uid;
                select.appendChild(opt);
            });
            box.appendChild(select);

            const confirmBtn = document.createElement("button");
            confirmBtn.className = "btnPrimary";
            confirmBtn.textContent = "Confirm and Start";
            confirmBtn.onclick = function(){ startCircleSessionTransaction(circleId, select.value); };
            box.appendChild(confirmBtn);

        }
    }

}

// ---- Starting a session: lock, pair, and create the actual game rooms ----
//
// Uses a two-step pattern: first a small transaction on JUST the status
// field claims the session (so two people tapping "Start" at the same
// moment can't both proceed and create duplicate pairings/sessions),
// then a normal multi-path update writes the real pairing data once
// only the winning caller reaches that point.

function startCircleSessionTransaction(circleId, sitOutUid){

    const circleRef = db.ref("circles/" + circleId);

    circleRef.child("pendingSession/status").transaction(function(current){
        if(current !== "voting") return; // already claimed, started, or cancelled by someone else — abort
        return "starting";
    }).then(function(lockResult){

        if(!lockResult.committed) return; // someone else already claimed it

        circleRef.once("value").then(function(snapshot){

            const c = snapshot.val();
            if(!c || !c.pendingSession) return;

            const responses = c.pendingSession.responses || {};
            let acceptedUids = Object.keys(responses).filter(function(uid){ return responses[uid] === "accepted"; });

            if(sitOutUid && acceptedUids.indexOf(sitOutUid) !== -1){
                acceptedUids = acceptedUids.filter(function(uid){ return uid !== sitOutUid; });
            }

            if(acceptedUids.length < 2 || acceptedUids.length % 2 !== 0){
                circleRef.child("pendingSession/status").set("voting"); // release the lock — not actually ready
                return;
            }

            const shuffled = acceptedUids.slice();
            for(let i = shuffled.length - 1; i > 0; i--){
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
            }

            const pairings = {};
            for(let i = 0; i < shuffled.length; i += 2){
                const pairId = "p" + (i / 2);
                const whiteFirst = Math.random() < 0.5;
                pairings[pairId] = {
                    white: whiteFirst ? shuffled[i] : shuffled[i + 1],
                    black: whiteFirst ? shuffled[i + 1] : shuffled[i],
                    roomCode: null,
                    result: null
                };
            }

            const avatarFetches = shuffled.map(function(uid){
                return db.ref("users/" + uid + "/public/avatarId").once("value").then(function(snap){
                    return { uid: uid, avatarId: snap.val() || null };
                }).catch(function(){
                    return { uid: uid, avatarId: null };
                });
            });

            Promise.all(avatarFetches).then(function(avatarResults){

                const avatarByUid = {};
                avatarResults.forEach(function(r){ avatarByUid[r.uid] = r.avatarId; });

                const participantsInfo = {};
                shuffled.forEach(function(uid){
                    participantsInfo[uid] = {
                        username: (c.members[uid] || {}).username || "Player",
                        flag: (c.members[uid] || {}).flag || "",
                        avatarId: avatarByUid[uid] || null
                    };
                });

                const sessionId = db.ref("circleSessions").push().key;

                const updates = {};
                updates["circleSessions/" + sessionId] = { circleId: circleId, startedAt: Date.now(), pairings: pairings, participants: participantsInfo };
                updates["circles/" + circleId + "/pendingSession/status"] = "confirmed";
                updates["circles/" + circleId + "/pendingSession/sessionId"] = sessionId;
                updates["circles/" + circleId + "/pendingSession/sitOutUid"] = sitOutUid || null;
                updates["circles/" + circleId + "/lastSessionId"] = sessionId;

                db.ref().update(updates).catch(function(err){
                    showInfoPopup("⚠️ Error", "Could not save the session: " + err.message);
                });

            });

        });

    }).catch(function(err){
        showInfoPopup("⚠️ Error", "Could not start the session: " + err.message);
    });

}

// ---- Global listener: notices when a session you're in gets confirmed,
// even if you're not currently looking at Circles, and drops you
// straight into your own paired game. Called once from auth.js after
// login, alongside listenForChallenges(). ----

function listenForMyCircleSessions(){

    if(!db || !currentUser) return;

    db.ref("circles").orderByChild("createdAt").limitToLast(200).on("child_changed", function(snapshot){

        const c = snapshot.val();
        if(!c || !c.members || !c.members[currentUser.uid]) return;
        if(!c.pendingSession || c.pendingSession.status !== "confirmed") return;
        if(!c.pendingSession.sessionId) return;
        if(c.pendingSession.sitOutUid === currentUser.uid) return; // sitting out this round — no gathering/game for them

        showCircleGatheringScreen(c.pendingSession.sessionId);

    });

}

function maybeJoinMyCirclePairing(sessionId){

    if(joinedCircleSessionIds[sessionId]) return;

    db.ref("circleSessions/" + sessionId + "/pairings").once("value").then(function(snap){

        const pairings = snap.val() || {};

        Object.keys(pairings).forEach(function(pid){

            const p = pairings[pid];
            const amWhite = p.white === currentUser.uid;
            const amBlack = p.black === currentUser.uid;
            if(!amWhite && !amBlack) return;

            joinedCircleSessionIds[sessionId] = true;

            if(p.roomCode){
                myColor = amWhite ? "white" : "black";
                currentRoomCode = p.roomCode;
                selectedTime = 600;
                gameMode = "online";
                activeCircleSessionId = sessionId;
                activeCirclePairingId = pid;
                if(typeof hideAllScreensBeforeGame === "function") hideAllScreensBeforeGame();
                startOnlineGame(p.roomCode);
                return;
            }

            const code = generateRoomCode();

            db.ref("circleSessions/" + sessionId + "/pairings/" + pid + "/roomCode").transaction(function(current){
                if(current) return;
                return code;
            }).then(function(result){

                const finalCode = result.snapshot.val();

                myColor = amWhite ? "white" : "black";
                currentRoomCode = finalCode;
                selectedTime = 600;
                gameMode = "online";
                activeCircleSessionId = sessionId;
                activeCirclePairingId = pid;

                db.ref("rooms/" + finalCode).set({ status: "waiting", createdAt: Date.now() });

                const myKingdom = (typeof getMyCurrentKingdom === "function")
                    ? getMyCurrentKingdom()
                    : { emoji: "🏕️", name: "Village" };

                db.ref("rooms/" + finalCode + "/players/" + myColor).set({
                    username: currentUsername,
                    flag: currentUserFlag,
                    rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
                    photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
                    uid: currentUser.uid,
                    kingdom: (typeof kingdomState !== "undefined") ? kingdomState.currentLevel : "village",
                    kingdomEmoji: myKingdom.emoji,
                    kingdomName: myKingdom.name
                });

                if(finalCode !== code){
                    db.ref("rooms/" + finalCode + "/status").set("playing");
                }

                if(typeof hideAllScreensBeforeGame === "function") hideAllScreensBeforeGame();
                startOnlineGame(finalCode);

            });

        });

    });

}

// ---- Gathering screen — shown to every participant (except whoever's
// sitting out) the moment a session is confirmed, before anyone is
// dropped into their own individual board. Uses plain placeholder
// circles (initials) for now — swap buildGatheringAvatarHtml() for an
// <img> once real avatar art exists; nothing else in this flow needs
// to change. ----

function showCircleGatheringScreen(sessionId){

    if(shownGatheringSessionIds[sessionId]) return;
    shownGatheringSessionIds[sessionId] = true;

    if(typeof hideAllScreensBeforeGame === "function") hideAllScreensBeforeGame();
    document.getElementById("circleGatheringScreen").style.display = "flex";

    db.ref("circleSessions/" + sessionId).once("value").then(function(snap){

        const session = snap.val();
        if(!session){
            document.getElementById("circleGatheringScreen").style.display = "none";
            maybeJoinMyCirclePairing(sessionId);
            return;
        }

        renderCircleGatheringTables(session);

        circleGatheringActiveSessionId = sessionId;

        let remaining = 13;
        const countdownEl = document.getElementById("circleGatheringCountdown");
        if(countdownEl) countdownEl.textContent = "Taking your seats in " + remaining + "...";

        circleGatheringInterval = setInterval(function(){
            remaining--;
            if(countdownEl) countdownEl.textContent = remaining > 0 ? "Taking your seats in " + remaining + "..." : "Let's play!";
            if(remaining <= 0){
                clearInterval(circleGatheringInterval);
                setTimeout(function(){
                    document.getElementById("circleGatheringScreen").style.display = "none";
                    maybeJoinMyCirclePairing(sessionId);
                }, 600);
            }
        }, 1000);

    }).catch(function(err){
        console.error("Failed to load gathering session:", err.message);
        document.getElementById("circleGatheringScreen").style.display = "none";
        maybeJoinMyCirclePairing(sessionId);
    });

}

function renderCircleGatheringTables(session){

    const stage = document.getElementById("circleGatheringStage");
    const othersList = document.getElementById("circleGatheringOthersList");
    if(!stage) return;

    stage.querySelectorAll(".circleGatheringAvatarActor, .circleGatheringHandshakeIcon").forEach(function(el){ el.remove(); });

    const participants = session.participants || {};
    const pairings = session.pairings || {};

    let myPid = null, myInfo = null, opponentInfo = null;

    Object.keys(pairings).forEach(function(pid){
        const p = pairings[pid];
        if(p.white === currentUser.uid || p.black === currentUser.uid){
            myPid = pid;
            const oppUid = (p.white === currentUser.uid) ? p.black : p.white;
            myInfo = participants[currentUser.uid] || { username: currentUsername, flag: currentUserFlag, avatarId: loadCachedMyAvatarId() };
            opponentInfo = participants[oppUid] || { username: "Player", flag: "" };
        }
    });

    if(myInfo){
        createGatheringActor(stage, myInfo, { startLeft: 78, startTop: 118, endLeft: 66, endTop: 52 });
    }
    if(opponentInfo){
        createGatheringActor(stage, opponentInfo, { startLeft: 22, startTop: 118, endLeft: 34, endTop: 52 });
    }

    const handshake = document.createElement("div");
    handshake.className = "circleGatheringHandshakeIcon";
    handshake.textContent = "🤝";
    handshake.style.left = "50%";
    handshake.style.top = "48%";
    stage.appendChild(handshake);
    setTimeout(function(){ handshake.classList.add("show"); }, 6200);

    if(othersList){
        const otherPids = Object.keys(pairings).filter(function(pid){ return pid !== myPid; });
        if(otherPids.length === 0){
            othersList.innerHTML = "";
        }else{
            let html = '<p class="sub" style="margin-bottom:6px;">Also playing right now:</p>';
            otherPids.forEach(function(pid){
                const p = pairings[pid];
                const wName = (participants[p.white] || {}).username || "Player";
                const bName = (participants[p.black] || {}).username || "Player";
                html += '<p class="sub" style="margin:2px 0;">' + escapeHtml(wName) + ' vs ' + escapeHtml(bName) + '</p>';
            });
            othersList.innerHTML = html;
        }
    }

}

function createGatheringActor(stage, info, pos){

    const avatarOption = AVATAR_OPTIONS.find(function(a){ return a.id === info.avatarId; });
    const actor = document.createElement("div");
    actor.className = "circleGatheringAvatarActor";
    actor.style.left = pos.startLeft + "%";
    actor.style.top = pos.startTop + "%";

    if(avatarOption){
        const base = "pieces/" + avatarOption.gatherBase;
        actor.innerHTML =
            '<img class="frameActive" src="' + base + '_a.png" alt="">' +
            '<img src="' + base + '_b.png" alt="">' +
            '<img src="' + base + '_c.png" alt="">' +
            '<span class="circleGatheringActorName">' + escapeHtml(info.flag || "") + ' ' + escapeHtml(info.username) + '</span>';
    }else{
        actor.innerHTML =
            '<div style="width:100%;height:100%;border-radius:10px;background:linear-gradient(135deg,#3b7bff,#2158d6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;">' +
                escapeHtml((info.username || "?").charAt(0).toUpperCase()) +
            '</div>' +
            '<span class="circleGatheringActorName">' + escapeHtml(info.flag || "") + ' ' + escapeHtml(info.username) + '</span>';
    }

    stage.appendChild(actor);

    let walkInterval = null;
    if(avatarOption){
        const frames = actor.querySelectorAll("img");
        const order = [0, 1, 0, 2];
        let step = 0;
        walkInterval = setInterval(function(){
            frames.forEach(function(f){ f.classList.remove("frameActive"); });
            frames[order[step % order.length]].classList.add("frameActive");
            step++;
        }, 180);
    }

    requestAnimationFrame(function(){
        requestAnimationFrame(function(){
            actor.style.left = pos.endLeft + "%";
            actor.style.top = pos.endTop + "%";
        });
    });

    setTimeout(function(){
        if(walkInterval) clearInterval(walkInterval);
        const frames = actor.querySelectorAll("img");
        frames.forEach(function(f){ f.classList.remove("frameActive"); });
        if(frames[0]) frames[0].classList.add("frameActive");
    }, 6000);

}
