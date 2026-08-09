// ============================================================
// Chat: shared screen for in-game chat, friend direct messages, and
// local (non-Firebase) chat with the rated AI opponent.
// ============================================================

let activeChatPath = null;
let activeChatRef = null;
let activeChatPartnerName = "";
let activeChatReadKey = null;

// FIX: Hugging Face's free serverless Inference API turned out to be
// broken/being phased out for the model we were using (confirmed via
// widespread reports of 502s and CORS failures on zephyr-7b-beta,
// completely unrelated to our setup — even Hugging Face's own official
// chat page for that model has the same complaints). Switched to
// OpenRouter instead: a stable, genuinely free tier (20 requests/min,
// 1000/day — far more than a chat feature like this needs) built for
// calling directly from browser-side fetch(), which is exactly what we
// need here since there's no backend server involved.
//
// This reads from window.HF_API_TOKEN, set in config.js (a file kept
// OUT of git via .gitignore, or otherwise added outside your GitHub
// repo) so the real key doesn't have to live in this file. Despite the
// variable name (kept as HF_API_TOKEN for continuity with our earlier
// setup), it now holds your OpenRouter key (starts with "sk-or-v1-").
const HF_API_TOKEN = (typeof window.HF_API_TOKEN !== "undefined") ? window.HF_API_TOKEN : "";

// A solid, stable free-tier chat model on OpenRouter.
const AI_CHAT_MODEL = "mistralai/mistral-7b-instruct:free";

// Used only if the API call fails outright (network issue, rate limit
// hit, etc.) — rotates so it's not the same line every time, and is
// never shown via alert() anymore.
const AI_CHAT_FALLBACK_LINES = [
    "Sorry, having trouble thinking of a reply right now — ask me again?",
    "My brain's lagging a bit — try that again in a moment.",
    "Hmm, lost my train of thought. What were you saying?",
    "Connection hiccup on my end — go ahead and repeat that."
];

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

        input.value = "";

        fetchAIChatReply(text).then(function(reply){
            const replyTime = Date.now();
            aiChatMessages.push({ from: "ai-opponent", text: reply, time: replyTime });
            renderChatMessage({ from: "ai-opponent", text: reply, time: replyTime });
        });

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

// Builds the message list OpenRouter's chat-completions endpoint
// expects: a system prompt setting the persona, followed by recent
// back-and-forth so replies stay contextual (so "how's it going" after
// "good morning" makes sense), ending with the newest thing said.
function buildAIChatMessages(latestText){

    const messages = [{
        role: "system",
        content: "You are a friendly, casual chess opponent chatting mid-game. Reply naturally and conversationally, like texting a friend — 1 to 3 sentences, no stage directions, no asterisks, no repeating the question back."
    }];

    const recentHistory = aiChatMessages.slice(-6);
    recentHistory.forEach(function(msg){
        messages.push({
            role: msg.from === "ai-opponent" ? "assistant" : "user",
            content: msg.text
        });
    });

    messages.push({ role: "user", content: latestText });

    return messages;
}

function fetchAIChatReply(text){

    if(!HF_API_TOKEN){
        console.error("AI chat error: no API key set (window.HF_API_TOKEN is empty).");
        return Promise.resolve(AI_CHAT_FALLBACK_LINES[Math.floor(Math.random() * AI_CHAT_FALLBACK_LINES.length)]);
    }

    return fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + HF_API_TOKEN
        },
        body: JSON.stringify({
            model: AI_CHAT_MODEL,
            messages: buildAIChatMessages(text),
            max_tokens: 120,
            temperature: 0.8
        })
    }).then(function(response){

        if(!response.ok){
            return response.text().then(function(errorText){
                throw new Error("API error " + response.status + ": " + errorText);
            });
        }

        return response.json();

    }).then(function(data){

        const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
            ? data.choices[0].message.content.trim()
            : "";

        if(!reply){
            return AI_CHAT_FALLBACK_LINES[Math.floor(Math.random() * AI_CHAT_FALLBACK_LINES.length)];
        }

        return reply;

    }).catch(function(err){
        console.error("AI chat error:", err.message);
        return AI_CHAT_FALLBACK_LINES[Math.floor(Math.random() * AI_CHAT_FALLBACK_LINES.length)];
    });

}

function insertEmoji(emoji){
    const input = document.getElementById("chatInput");
    if(!input) return;
    input.value += emoji;
    input.focus();
}

// ===== AI chat message storage (local array) =====
let aiChatMessages = [];

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
