// ============================================================
// Chat: shared screen for in-game chat and friend direct messages
// ============================================================

let activeChatPath = null;
let activeChatRef = null;
let activeChatPartnerName = "";

function buildDirectChatId(uidA, uidB){
    return [uidA, uidB].sort().join("_");
}

function openGameChat(){

    if(gameMode !== "online" || !currentRoomCode) return;

    const partnerName = myColor === "white" ? blackPlayer : whitePlayer;

    openChat("rooms/" + currentRoomCode + "/chat", partnerName);

}

function openFriendChat(friendUid, friendUsername){

    if(!currentUser) return;

    const chatId = buildDirectChatId(currentUser.uid, friendUid);

    openChat("messages/" + chatId, friendUsername);

}

function openChat(path, partnerName){

    if(!db) return;

    closeChatListener();

    activeChatPath = path;
    activeChatPartnerName = partnerName || "Chat";

    document.getElementById("chatWithName").textContent = activeChatPartnerName;
    document.getElementById("chatMessages").innerHTML = "";
    document.getElementById("chatInput").value = "";
    document.getElementById("chatScreen").style.display = "flex";

    activeChatRef = db.ref(activeChatPath).orderByChild("time").limitToLast(100);

    activeChatRef.on("child_added", function(snapshot){
        renderChatMessage(snapshot.val());
    });

}

function closeChatListener(){
    if(activeChatRef){
        activeChatRef.off();
        activeChatRef = null;
    }
    activeChatPath = null;
}

function closeChat(){
    closeChatListener();
    document.getElementById("chatScreen").style.display = "none";
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
