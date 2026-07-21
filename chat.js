// ============================================================
// Chat: shared screen for in-game chat and friend direct messages
// ============================================================

let activeChatPath = null;
let activeChatRef = null;
let activeChatPartnerName = "";
let activeChatReadKey = null;

function buildDirectChatId(uidA, uidB){
    return [uidA, uidB].sort().join("_");
}

function openGameChat(){

    if(gameMode !== "online" || !currentRoomCode) return;

    const partnerName = myColor === "white" ? blackPlayer : whitePlayer;

    gameChatUnread = 0;
    updateGameChatBadge();

    openChat("rooms/" + currentRoomCode + "/chat", partnerName, "room_" + currentRoomCode);

}

function openFriendChat(friendUid, friendUsername){

    if(!currentUser) return;

    friendChatUnread[friendUid] = 0;
    updateFriendChatBadge(friendUid);

    const chatId = buildDirectChatId(currentUser.uid, friendUid);

    openChat("messages/" + chatId, friendUsername, chatId);

}

function markChatRead(readKey){
    if(!currentUser || !db || !readKey) return;
    db.ref("users/" + currentUser.uid + "/private/chatLastRead/" + readKey).set(Date.now());
}

function openChat(path, partnerName, readKey){

    if(!db) return;

    closeChatListener();

    activeChatPath = path;
    activeChatPartnerName = partnerName || "Chat";
    activeChatReadKey = readKey || null;

    document.getElementById("chatWithName").textContent = activeChatPartnerName;
    document.getElementById("chatMessages").innerHTML = "";
    document.getElementById("chatInput").value = "";
    document.getElementById("chatScreen").style.display = "flex";

    history.pushState({ screen: "chat" }, "", "#chat");

    markChatRead(readKey);

    activeChatRef = db.ref(activeChatPath).orderByChild("time").limitToLast(100);

    activeChatRef.on("child_added", function(snapshot){
        renderChatMessage(snapshot.val());
        markChatRead(readKey);
    });

}

function closeChatListener(){
    if(activeChatRef){
        activeChatRef.off();
        activeChatRef = null;
    }
    activeChatPath = null;
    activeChatReadKey = null;
}

function closeChat(){
    closeChatListener();
    document.getElementById("chatScreen").style.display = "none";
    if(history.state && history.state.screen === "chat"){
        history.back();
    }
}

function renderChatMessage(msg){

    if(!msg) return;

    const container = document.getElementById("chatMessages");
    if(!container) return;

    const isMine = currentUser && msg.from === currentUser.uid;

    const bubble = document.createElement("div");
    bubble.className = "chatBubble " + (isMine ? "chatBubbleMine" : "chatBubbleTheirs");
    bubble.textContent = msg.text || "";

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;

}

function sendChatMessage(){

    const input = document.getElementById("chatInput");
    const text = input.value.trim();

    if(!text || !activeChatPath || !db || !currentUser) return;

    db.ref(activeChatPath).push({
        from: currentUser.uid,
        fromName: currentUsername || "Player",
        text: text,
        time: Date.now()
    });

    input.value = "";

}

function insertEmoji(emoji){
    const input = document.getElementById("chatInput");
    if(!input) return;
    input.value += emoji;
    input.focus();
}

// ===== Unread badge tracking: in-game chat =====

let gameChatUnread = 0;
let gameChatBgRef = null;

function startGameChatWatcher(){

    stopGameChatWatcher();

    if(gameMode !== "online" || !currentRoomCode || !db || !currentUser) return;

    const watchedRoomCode = currentRoomCode;
    const readKey = "room_" + watchedRoomCode;

    db.ref("users/" + currentUser.uid + "/private/chatLastRead/" + readKey).once("value").then(function(lastReadSnap){

        const lastRead = lastReadSnap.val() || 0;

        gameChatBgRef = db.ref("rooms/" + watchedRoomCode + "/chat").orderByChild("time").limitToLast(50);

        gameChatBgRef.on("child_added", function(snapshot){

            const msg = snapshot.val();
            if(!msg || !currentUser || msg.from === currentUser.uid) return;
            if(msg.time <= lastRead) return;

            const isChatOpen = document.getElementById("chatScreen").style.display === "flex" &&
                activeChatPath === ("rooms/" + watchedRoomCode + "/chat");

            if(!isChatOpen){
                gameChatUnread++;
                updateGameChatBadge();
            }

        });

    });

}

function stopGameChatWatcher(){
    if(gameChatBgRef){
        gameChatBgRef.off();
        gameChatBgRef = null;
    }
    gameChatUnread = 0;
    updateGameChatBadge();
}

function updateGameChatBadge(){
    const badge = document.getElementById("gameChatBadge");
    if(!badge) return;
    if(gameChatUnread > 0){
        badge.textContent = gameChatUnread;
        badge.style.display = "flex";
    }else{
        badge.style.display = "none";
    }
}

// ===== Unread badge tracking: friend direct messages =====

let friendChatUnread = {};
let friendChatWatchers = {};

function startFriendChatWatchers(friendUids){

    Object.keys(friendChatWatchers).forEach(function(uid){
        if(friendChatWatchers[uid]) friendChatWatchers[uid].off();
    });
    friendChatWatchers = {};

    if(!currentUser || !db) return;

    friendUids.forEach(function(friendUid){

        const chatId = buildDirectChatId(currentUser.uid, friendUid);
        const chatPath = "messages/" + chatId;

        db.ref("users/" + currentUser.uid + "/private/chatLastRead/" + chatId).once("value").then(function(lastReadSnap){

            const lastRead = lastReadSnap.val() || 0;

            const ref = db.ref(chatPath).orderByChild("time").limitToLast(50);
            friendChatWatchers[friendUid] = ref;

            ref.on("child_added", function(snapshot){

                const msg = snapshot.val();
                if(!msg || msg.from === currentUser.uid) return;
                if(msg.time <= lastRead) return;

                const isChatOpen = document.getElementById("chatScreen").style.display === "flex" &&
                    activeChatPath === chatPath;

                if(!isChatOpen){
                    friendChatUnread[friendUid] = (friendChatUnread[friendUid] || 0) + 1;
                    updateFriendChatBadge(friendUid);
                }

            });

        });

    });

}

function updateFriendChatBadge(friendUid){
    const badge = document.getElementById("friendChatBadge_" + friendUid);
    if(!badge) return;
    const count = friendChatUnread[friendUid] || 0;
    if(count > 0){
        badge.textContent = count;
        badge.style.display = "flex";
    }else{
        badge.style.display = "none";
    }
}
