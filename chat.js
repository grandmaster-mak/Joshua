// ============================================================
// Chat: shared screen for in-game chat, friend direct messages, and
// local (non-Firebase) chat with the rated AI opponent.
// ============================================================

let activeChatPath = null;
let activeChatRef = null;
let activeChatPartnerName = "";
let activeChatReadKey = null;

// FIX: Hugging Face's free Inference API rejects almost all requests
// with no auth token — that's what was silently failing every time and
// falling back to the canned "give me a moment" line. Paste your free
// token from huggingface.co/settings/tokens here. This token IS visible
// to anyone who inspects your page's network requests — that's a real
// tradeoff of calling an AI API directly from client-side code with no
// backend server to hide it behind. Fine for a free hobby token; just
// don't reuse a token you use elsewhere for anything sensitive.
const HF_API_TOKEN = "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";

// A real instruction-following model instead of the old DialoGPT — this
// is what actually lets it "just answer a normal question naturally"
// instead of producing disconnected, generic text.
const AI_CHAT_MODEL = "HuggingFaceH4/zephyr-7b-beta";

// Used only if the API call fails outright (network issue, model
// temporarily unavailable) — rotates so it's not the same line every
// time, and is never shown via alert() anymore.
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

// Builds a short back-and-forth transcript from recent messages so the
// model has context (so "how's it going" after "good morning" makes
// sense), formatted the way Zephyr expects its chat prompts.
function buildAIChatPrompt(latestText){

    const recentHistory = aiChatMessages.slice(-6);
    let transcript = "<|system|>\nYou are a friendly, casual chess opponent chatting mid-game. Reply naturally and conversationally, like texting a friend — 1 to 3 sentences, no stage directions, no asterisks, no repeating the question back.</s>\n";

    recentHistory.forEach(function(msg){
        if(msg.from === "ai-opponent"){
            transcript += "<|assistant|>\n" + msg.text + "</s>\n";
        }else{
            transcript += "<|user|>\n" + msg.text + "</s>\n";
        }
    });

    transcript += "<|user|>\n" + latestText + "</s>\n<|assistant|>\n";

    return transcript;
}

function fetchAIChatReply(text){

    const prompt = buildAIChatPrompt(text);

    const callHuggingFace = function(retries){

        return fetch("https://api-inference.huggingface.co/models/" + AI_CHAT_MODEL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + HF_API_TOKEN
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 120,
                    temperature: 0.8,
                    return_full_text: false
                },
                options: { wait_for_model: true }
            })
        }).then(function(response){

            if(response.status === 503 && retries > 0){
                return response.json().then(function(errorData){
                    const waitTime = (errorData.estimated_time || 5) * 1000;
                    return new Promise(function(resolve){ setTimeout(resolve, waitTime); })
                        .then(function(){ return callHuggingFace(retries - 1); });
                });
            }

            if(!response.ok){
                return response.text().then(function(errorText){
                    throw new Error("API error " + response.status + ": " + errorText);
                });
            }

            return response.json();

        });
    };

    return callHuggingFace(3).then(function(data){

        let reply = (Array.isArray(data) && data[0] && data[0].generated_text) ? data[0].generated_text : "";
        reply = reply.split("<|user|>")[0].split("</s>")[0].trim();

        if(!reply){
            return AI_CHAT_FALLBACK_LINES[Math.floor(Math.random() * AI_CHAT_FALLBACK_LINES.length)];
        }

        return reply;

    }).catch(function(err){
        console.error("AI chat error:", err.message);
        // TEMPORARY — shows the real error as the reply itself so we can
        // see it on mobile without needing dev tools. Revert this once
        // the issue is found.
        return "[DEBUG ERROR] " + err.message;
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
