// ============================================================
// Chat: shared screen for in-game chat, friend direct messages, and
// local (non-Firebase) chat with the rated AI opponent.
// ============================================================

let activeChatPath = null;
let activeChatRef = null;
let activeChatPartnerName = "";
let activeChatReadKey = null;

function buildDirectChatId(uidA, uidB){
    return [uidA, uidB].sort().join("_");
}

function openGameChat(){

    if(gameMode === "ai" && ratedAIActive){
        openAIChat();
        return;
    }

    if(gameMode !== "online" || !currentRoomCode) return;

    const partnerName = myColor === "white" ? blackPlayer : whitePlayer;

    gameChatUnread = 0;
    updateGameChatBadge();

    openChat("rooms/" + currentRoomCode + "/chat", partnerName, "room_" + currentRoomCode);

}

// Fully local, non-Firebase chat with the rated AI opponent. Reuses the
// same chat screen and message-bubble rendering as real online chat.
function openAIChat(){

    closeChatListener();

    activeChatPath = "ai-local";
    activeChatPartnerName = blackPlayer || "Computer";
    activeChatReadKey = null;

    document.getElementById("chatWithName").textContent = activeChatPartnerName;
    const container = document.getElementById("chatMessages");
    container.innerHTML = "";
    aiChatMessages.forEach(function(msg){ renderChatMessage(msg); });
    document.getElementById("chatInput").value = "";
    document.getElementById("chatScreen").style.display = "flex";

    history.pushState({ screen: "chat" }, "", "#chat");

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
    // Let popstate be the ONLY thing that hides chatScreen — same
    // pattern as closePlayerProfile(). Hiding it here first (before
    // history.back() even fires the popstate event) was making the
    // chat-open check in script.js's popstate handler see it as already
    // closed, so it fell through to the live-game branch and showed the
    // resign/draw/abort menu on top of the board it had just revealed.
    if(history.state && history.state.screen === "chat"){
        history.back();
    }else{
        document.getElementById("chatScreen").style.display = "none";
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

    if(!text) return;

    if(activeChatPath === "ai-local"){

        const myTime = Date.now();
        const myFrom = currentUser ? currentUser.uid : "me";
        aiChatMessages.push({ from: myFrom, text: text, time: myTime });
        renderChatMessage({ from: myFrom, text: text, time: myTime });

        // --- Real AI chat via free Hugging Face API (no key needed) ---
        (async () => {
            try {
                const response = await fetch(
                    "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ inputs: text })
                    }
                );
                const data = await response.json();
                let reply = data.generated_text || "I didn't catch that.";

                // The model often repeats the user input at the start – strip it off
                if (reply.toLowerCase().startsWith(text.toLowerCase())) {
                    reply = reply.slice(text.length).trim();
                    if (!reply) reply = "Let's play!";
                }

                const replyTime = Date.now();
                aiChatMessages.push({ from: "ai-opponent", text: reply, time: replyTime });
                renderChatMessage({ from: "ai-opponent", text: reply, time: replyTime });
            } catch (err) {
                // If the API is down, fall back to a default reply
                const reply = "Hmm, I need a moment...";
                const replyTime = Date.now();
                aiChatMessages.push({ from: "ai-opponent", text: reply, time: replyTime });
                renderChatMessage({ from: "ai-opponent", text: reply, time: replyTime });
            }
        })();

        input.value = "";
        return;

    }

    if(!activeChatPath || !db || !currentUser) return;

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

// ============================================================
// Local AI chat — canned replies, pattern-matched against what the
// player actually typed before falling back to generic small talk.
// ============================================================

let aiChatMessages = [];

const AI_CHAT_LINES = [
    "Good luck, let's have a good game!",
    "Nice move.",
    "Hmm, interesting choice.",
    "I need to think about this one.",
    "This position is getting tricky.",
    "You're playing well today.",
    "Let's see how this unfolds.",
    "I almost missed that.",
    "Good game so far!",
    "I'll have to be careful here."
];

function pickAIChatReply(){
    return AI_CHAT_LINES[Math.floor(Math.random() * AI_CHAT_LINES.length)];
}

// Order matters: more specific patterns are checked before the
// catch-all "ends with ?" pattern at the bottom.
const AI_CHAT_PATTERNS = [
    { re:/\b(hi|hello|hey|yo)\b/,                           replies:["Hey there!", "Hello! Ready for a good game.", "Hi! Good luck to both of us."] },
    { re:/how\s*(are|'re)\s*(you|u)\b/,                     replies:["I'm doing well, thanks for asking! How about you?", "Can't complain — focused on this game though!"] },
    { re:/\bcan i ask (you )?(a )?question\b/,               replies:["Go ahead, ask away.", "Sure, what's on your mind?"] },
    { re:/\b(what'?s your name|who are you)\b/,              replies:["I'm your AI opponent for this match — no fancy name, just here to play!"] },
    { re:/\byour rating\b|\bhow good are you\b|\bare you rated\b/, replies:["I'm playing at roughly your level today — should be a fair fight!"] },
    { re:/\b(good game|gg|well played|nice game)\b/,         replies:["Good game to you too!", "That was fun — thanks for playing!"] },
    { re:/\b(nice move|good move|great move)\b/,             replies:["Thanks! I try.", "Glad you liked that one."] },
    { re:/\brematch\b|\bplay again\b/,                       replies:["Sounds good — let's see who wins the next one!"] },
    { re:/\b(thank you|thanks|thx)\b/,                       replies:["You're welcome!", "No problem at all."] },
    { re:/\b(bye|goodbye|see ya|see you|later)\b/,           replies:["See you next time — good luck out there!"] },
    { re:/\bhint\b|\bwhat should i play\b|\bbest move\b|\btell me the move\b/, replies:["Ha, nice try — I can't give away hints mid-game!", "That wouldn't be a fair game if I told you!"] },
    { re:/\b(lucky|luck)\b/,                                 replies:["Maybe a little — but I'll take it!", "Skill and a bit of luck, I think."] },
    { re:/\b(nervous|scared|worried)\b/,                     replies:["Don't worry, just play your natural game."] },
    { re:/\?\s*$/,                                           replies:["That's a good question — let's talk after the game, I need to focus!", "Hmm, good one — ask me again once we're done playing."] }
];

function getAIChatReply(userText){
    const text = (userText || "").toLowerCase().trim();
    for(let i = 0; i < AI_CHAT_PATTERNS.length; i++){
        if(AI_CHAT_PATTERNS[i].re.test(text)){
            const options = AI_CHAT_PATTERNS[i].replies;
            return options[Math.floor(Math.random() * options.length)];
        }
    }
    return pickAIChatReply();
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
