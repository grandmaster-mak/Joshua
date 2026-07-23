// ============================================================
// Tournaments: Swiss system, flexible player count, creator picks rounds
// ============================================================

let activeTournamentId = null;
let activeTournamentPairingId = null;
let currentViewedTournamentId = null;

function openTournaments(){
    document.getElementById("appShell").style.display = "none";
    document.getElementById("tournamentsScreen").style.display = "flex";
    history.pushState({ screen: "tournaments", view: "list" }, "", "#tournaments");
    showTournamentsList();
}

function closeTournaments(){
    document.getElementById("tournamentsScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "tournaments"){
        history.back();
    }
}

function showTournamentsList(){
    document.getElementById("tournamentsListView").style.display = "block";
    document.getElementById("tournamentCreateView").style.display = "none";
    document.getElementById("tournamentDetailView").style.display = "none";
    stopTournamentDetailListener();
    loadTournamentsList();
}

function showCreateTournament(){
    history.pushState({ screen: "tournaments", view: "create" }, "", "#tournaments-create");
    renderCreateTournamentView();
}

function renderCreateTournamentView(){
    document.getElementById("tournamentsListView").style.display = "none";
    document.getElementById("tournamentCreateView").style.display = "block";
    document.getElementById("tournamentDetailView").style.display = "none";
    stopTournamentDetailListener();
    updateTournamentFormatUI();

    const startInput = document.getElementById("tournamentStartInput");
    if(startInput){
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        startInput.min = now.toISOString().slice(0, 16);
    }
}

function updateTournamentFormatUI(){
    const format = document.getElementById("tournamentFormatInput").value;
    document.getElementById("tournamentRoundsBox").style.display = format === "elimination" ? "none" : "block";
    document.getElementById("tournamentEliminationNote").style.display = format === "elimination" ? "block" : "none";
}

function loadTournamentsList(){

    if(!db) return;

    const list = document.getElementById("tournamentsList");
    list.innerHTML = '<p class="sub">Loading...</p>';

    db.ref("tournaments").orderByChild("createdAt").limitToLast(30).once("value").then(function(snapshot){

        if(!snapshot.exists()){
            list.innerHTML = '<p class="sub">No tournaments yet. Create the first one!</p>';
            return;
        }

        const items = [];
        snapshot.forEach(function(child){
            items.push({ id: child.key, data: child.val() });
        });
        items.reverse();

        list.innerHTML = "";

        items.forEach(function(item){

            const t = item.data;
            const playerCount = t.players ? Object.keys(t.players).length : 0;
            const capLabel = t.maxPlayers ? "/" + t.maxPlayers : "";
            const statusLabel = t.status === "registering" ? "Open" : t.status === "active" ? "Round " + t.currentRound + "/" + t.rounds : "Completed";
            const formatLabel = t.format === "elimination" ? "Single Elim." : "Swiss";
            const speedLabel = formatSpeedLabel(t.timeControl);
            const startLabel = (t.status === "registering" && t.scheduledStart) ? " · Starts " + formatScheduledStart(t.scheduledStart) : "";

            const card = document.createElement("div");
            card.className = "tournamentCard";
            card.onclick = function(){ openTournamentDetail(item.id); };
            card.innerHTML =
                '<div class="tournamentCardName">🏆 ' + escapeHtml(t.name) + '</div>' +
                '<div class="tournamentCardMeta">' + formatLabel + ' &middot; ' + speedLabel + ' &middot; ' + playerCount + capLabel + ' players &middot; ' + statusLabel + startLabel + '</div>';

            list.appendChild(card);

        });

    });

}

function formatSpeedLabel(seconds){
    if(seconds < 180) return "Bullet";
    if(seconds < 600) return "Blitz";
    if(seconds < 1800) return "Rapid";
    return "Classical";
}

function formatScheduledStart(timestamp){
    const d = new Date(timestamp);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const timePart = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return sameDay ? timePart : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + timePart;
}

function createTournament(){

    if(!db || !currentUser){
        alert("Please log in first.");
        return;
    }

    const name = document.getElementById("tournamentNameInput").value.trim();
    const format = document.getElementById("tournamentFormatInput").value;
    const rounds = Number(document.getElementById("tournamentRoundsInput").value);
    const timeControl = Number(document.getElementById("tournamentTimeInput").value);
    const maxPlayers = Number(document.getElementById("tournamentMaxPlayersInput").value);
    const startInputValue = document.getElementById("tournamentStartInput").value;
    const scheduledStart = startInputValue ? new Date(startInputValue).getTime() : null;

    if(!name){
        alert("Please enter a tournament name.");
        return;
    }

    if(scheduledStart && scheduledStart < Date.now()){
        alert("Start time can't be in the past.");
        return;
    }

    const newRef = db.ref("tournaments").push();
    const playerEntry = {};
    playerEntry[currentUser.uid] = {
        username: currentUsername,
        flag: currentUserFlag,
        rating: currentUserRating || 100,
        points: 0,
        byes: 0
    };

    newRef.set({
        name: name,
        format: format,
        // Single elimination's round count depends on how many players
        // actually join, so it's computed at start time instead of here.
        rounds: format === "elimination" ? null : rounds,
        timeControl: timeControl,
        maxPlayers: maxPlayers,
        scheduledStart: scheduledStart,
        status: "registering",
        createdBy: currentUser.uid,
        createdAt: Date.now(),
        currentRound: 0,
        players: playerEntry
    }).then(function(){
        history.replaceState({ screen: "tournaments", view: "detail", id: newRef.key }, "", "#tournaments-detail");
        renderTournamentDetailView(newRef.key);
    });

}

let currentTournamentDetailRef = null;

function stopTournamentDetailListener(){
    if(currentTournamentDetailRef){
        currentTournamentDetailRef.off();
        currentTournamentDetailRef = null;
    }
}

function openTournamentDetail(tournamentId){
    history.pushState({ screen: "tournaments", view: "detail", id: tournamentId }, "", "#tournaments-detail");
    renderTournamentDetailView(tournamentId);
}

function renderTournamentDetailView(tournamentId){

    currentViewedTournamentId = tournamentId;

    document.getElementById("tournamentsListView").style.display = "none";
    document.getElementById("tournamentCreateView").style.display = "none";
    document.getElementById("tournamentDetailView").style.display = "block";

    stopTournamentDetailListener();

    currentTournamentDetailRef = db.ref("tournaments/" + tournamentId);

    currentTournamentDetailRef.on("value", function(snapshot){

        if(currentViewedTournamentId !== tournamentId) return;

        const t = snapshot.val();
        if(!t) return;

        renderTournamentDetail(tournamentId, t);

    });

}

function renderTournamentDetail(tournamentId, t){

    document.getElementById("tournamentDetailName").textContent = "🏆 " + t.name;

    const players = t.players || {};
    const playerUids = Object.keys(players);
    const isCreator = currentUser && t.createdBy === currentUser.uid;
    const alreadyJoined = currentUser && players[currentUser.uid];

    let statusText = "";
    if(t.status === "registering") statusText = playerUids.length + (t.maxPlayers ? "/" + t.maxPlayers : "") + " players joined";
    else if(t.status === "active") statusText = "Round " + t.currentRound + " of " + t.rounds;
    else statusText = "Completed" + (t.champion && players[t.champion] ? " — 🏆 " + players[t.champion].username + " wins!" : "");

    document.getElementById("tournamentDetailStatus").textContent = statusText;

    const formatLabel = t.format === "elimination" ? "Single Elimination" : "Swiss System";
    const speedLabel = formatSpeedLabel(t.timeControl);
    const startNote = (t.status === "registering" && t.scheduledStart) ? " · Starts " + formatScheduledStart(t.scheduledStart) : "";
    const metaEl = document.getElementById("tournamentDetailMeta");
    if(metaEl) metaEl.textContent = formatLabel + " · " + speedLabel + startNote;

    // Any viewer's browser can flip a scheduled tournament from
    // "registering" to "active" once its start time has passed — the
    // transaction inside guards against it firing more than once even if
    // several people have this screen open at the same moment.
    checkTournamentAutoStart(tournamentId, t);

    const joinBtn = document.getElementById("tournamentJoinBtn");
    const startBtn = document.getElementById("tournamentStartBtn");
    const nextRoundBtn = document.getElementById("tournamentNextRoundBtn");

    joinBtn.style.display = (t.status === "registering" && currentUser && !alreadyJoined) ? "block" : "none";
    startBtn.style.display = (t.status === "registering" && isCreator && playerUids.length >= 2) ? "block" : "none";

    let roundComplete = false;
    if(t.status === "active" && t.rounds_data && t.rounds_data[t.currentRound]){
        const pairings = t.rounds_data[t.currentRound].pairings || {};
        roundComplete = Object.keys(pairings).every(function(pid){ return !!pairings[pid].result; });
    }
    nextRoundBtn.style.display = (t.status === "active" && isCreator && roundComplete) ? "block" : "none";
    nextRoundBtn.textContent = (t.currentRound >= t.rounds) ? "Finish Tournament" : "Start Next Round";

    const standingsBox = document.getElementById("tournamentStandings");
    const sorted = playerUids.map(function(uid){ return { uid: uid, data: players[uid] }; })
        .sort(function(a, b){ return (b.data.points || 0) - (a.data.points || 0); });

    standingsBox.innerHTML = "";
    sorted.forEach(function(p, index){
        const row = document.createElement("div");
        row.className = "standingRow";
        row.innerHTML =
            '<span class="standingRank">' + (index + 1) + '</span>' +
            '<span class="standingName">' + escapeHtml(p.data.flag || "") + ' ' + escapeHtml(p.data.username) + '</span>' +
            '<span class="standingPoints">' + (p.data.points || 0) + '</span>';
        standingsBox.appendChild(row);
    });

    const pairingsBox = document.getElementById("tournamentPairings");
    pairingsBox.innerHTML = "";

    if(t.status === "active" && t.rounds_data && t.rounds_data[t.currentRound]){

        const roundInfo = t.rounds_data[t.currentRound];
        const pairings = roundInfo.pairings || {};

        Object.keys(pairings).forEach(function(pid){

            const p = pairings[pid];
            const whiteName = players[p.white] ? players[p.white].username : "?";
            const blackName = players[p.black] ? players[p.black].username : "?";

            const resultLabel = !p.result ? "In progress" :
                p.result === "draw" ? "Draw" :
                p.result === "white" ? whiteName + " won" : blackName + " won";

            const row = document.createElement("div");
            row.className = "pairingRow";

            const isMyGame = currentUser && (p.white === currentUser.uid || p.black === currentUser.uid);
            const playBtn = (isMyGame && !p.result) ?
                '<button class="btnPrimary" style="width:auto;padding:6px 14px;font-size:12px;" data-tid="' + tournamentId + '" data-pid="' + pid + '" onclick="joinTournamentMatch(this.dataset.tid, this.dataset.pid)">Play</button>' : '';

            row.innerHTML =
                '<div><div class="pairingNames">' + escapeHtml(whiteName) + ' vs ' + escapeHtml(blackName) + '</div>' +
                '<div class="pairingResult">' + resultLabel + '</div></div>' + playBtn;

            pairingsBox.appendChild(row);

        });

        if(roundInfo.bye && players[roundInfo.bye]){
            const byeRow = document.createElement("div");
            byeRow.className = "pairingRow";
            const byeLabel = t.format === "elimination" ? "Bye (advances automatically)" : "Bye (free point)";
            byeRow.innerHTML = '<div class="pairingNames">' + escapeHtml(players[roundInfo.bye].username) + '</div><div class="pairingResult">' + byeLabel + '</div>';
            pairingsBox.appendChild(byeRow);
        }

    }

}

function joinTournament(){

    if(!currentViewedTournamentId || !currentUser || !db) return;

    const tournamentRef = db.ref("tournaments/" + currentViewedTournamentId);

    tournamentRef.transaction(function(t){

        if(!t) return t;
        if(t.status !== "registering") return t; // already started/finished, no-op
        if(t.players && t.players[currentUser.uid]) return t; // already joined, no-op

        const currentCount = t.players ? Object.keys(t.players).length : 0;
        if(t.maxPlayers && currentCount >= t.maxPlayers) return t; // full, no-op

        if(!t.players) t.players = {};
        t.players[currentUser.uid] = {
            username: currentUsername,
            flag: currentUserFlag,
            rating: currentUserRating || 100,
            points: 0,
            byes: 0
        };

        return t;

    }).then(function(result){

        const t = result.snapshot.val();
        if(!t) return;

        const joined = t.players && t.players[currentUser.uid];
        const currentCount = t.players ? Object.keys(t.players).length : 0;

        if(!joined && t.maxPlayers && currentCount >= t.maxPlayers){
            showInfoPopup("🏆 Tournament Full", "This tournament already has its maximum of " + t.maxPlayers + " players.");
        }

    });

}

function startTournament(){

    if(!currentViewedTournamentId || !db) return;

    db.ref("tournaments/" + currentViewedTournamentId).once("value").then(function(snapshot){

        const t = snapshot.val();
        if(!t) return;

        const playerUids = Object.keys(t.players || {});
        const updates = {};

        if(t.format === "elimination"){
            const pairingResult = generateEliminationPairings(playerUids);
            updates["tournaments/" + currentViewedTournamentId + "/rounds"] = Math.ceil(Math.log2(playerUids.length));
            updates["tournaments/" + currentViewedTournamentId + "/rounds_data/1"] = pairingResult;
        }else{
            const pairingResult = generateSwissPairings(playerUids, t.players, {});
            updates["tournaments/" + currentViewedTournamentId + "/rounds_data/1"] = pairingResult;
        }

        updates["tournaments/" + currentViewedTournamentId + "/status"] = "active";
        updates["tournaments/" + currentViewedTournamentId + "/currentRound"] = 1;

        db.ref().update(updates);

    });

}

// A tournament with a scheduled start time opens itself automatically once
// that time passes and at least 2 players have joined — no creator action
// needed. Wrapped in a transaction on the whole node so it can safely fire
// from several people's browsers at once and still only ever run once.
function checkTournamentAutoStart(tournamentId, t){

    if(t.status !== "registering") return;
    if(!t.scheduledStart) return;
    if(Date.now() < t.scheduledStart) return;

    const playerUids = Object.keys(t.players || {});
    if(playerUids.length < 2) return; // not enough players yet — keep waiting

    db.ref("tournaments/" + tournamentId).transaction(function(current){

        if(!current) return current;
        if(current.status !== "registering") return current; // someone already started it
        if(!current.scheduledStart || Date.now() < current.scheduledStart) return current;

        const uids = Object.keys(current.players || {});
        if(uids.length < 2) return current;

        const pairingResult = current.format === "elimination"
            ? generateEliminationPairings(uids)
            : generateSwissPairings(uids, current.players, {});

        current.status = "active";
        current.currentRound = 1;
        if(!current.rounds_data) current.rounds_data = {};
        current.rounds_data[1] = pairingResult;
        if(current.format === "elimination"){
            current.rounds = Math.ceil(Math.log2(uids.length));
        }

        return current;

    });

}

// Randomly seeds players into a knockout bracket. An odd/non-power-of-2
// count gets one random bye each round rather than requiring exact powers
// of 2, same as how most casual knockout brackets are run.
function generateEliminationPairings(playerUids){

    const shuffled = playerUids.slice();
    for(let i = shuffled.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    let byeUid = null;
    if(shuffled.length % 2 !== 0){
        byeUid = shuffled.pop();
    }

    const pairings = {};
    for(let i = 0; i < shuffled.length; i += 2){
        const pairId = "p" + (i / 2);
        const whiteFirst = Math.random() < 0.5;
        pairings[pairId] = {
            white: whiteFirst ? shuffled[i] : shuffled[i + 1],
            black: whiteFirst ? shuffled[i + 1] : shuffled[i],
            result: null,
            roomCode: null
        };
    }

    return { pairings: pairings, bye: byeUid || null };

}

// Builds the next knockout round from the previous one's winners (a bye
// counts as an automatic win). If only one player remains, the bracket is
// finished — the caller is responsible for checking that.
function generateEliminationNextRound(previousRoundInfo, players){

    const winners = [];

    Object.keys(previousRoundInfo.pairings || {}).forEach(function(pid){
        const p = previousRoundInfo.pairings[pid];
        if(p.result === "white") winners.push(p.white);
        else if(p.result === "black") winners.push(p.black);
        // unresolved pairings shouldn't happen here — advanceTournamentRound
        // already checks the round is complete before calling this.
    });

    if(previousRoundInfo.bye) winners.push(previousRoundInfo.bye);

    return generateEliminationPairings(winners);

}

function generateSwissPairings(playerUids, playersData, previousOpponents){

    const sorted = playerUids.slice().sort(function(a, b){
        const pa = (playersData[a] && playersData[a].points) || 0;
        const pb = (playersData[b] && playersData[b].points) || 0;
        if(pb !== pa) return pb - pa;
        const ra = (playersData[a] && playersData[a].rating) || 0;
        const rb = (playersData[b] && playersData[b].rating) || 0;
        return rb - ra;
    });

    let byeUid = null;

    if(sorted.length % 2 !== 0){
        for(let i = sorted.length - 1; i >= 0; i--){
            const uid = sorted[i];
            const hasHadBye = playersData[uid] && playersData[uid].byes > 0;
            if(!hasHadBye){
                byeUid = uid;
                break;
            }
        }
        if(!byeUid) byeUid = sorted[sorted.length - 1];
        sorted.splice(sorted.indexOf(byeUid), 1);
    }

    const pairings = {};
    const used = {};

    for(let i = 0; i < sorted.length; i++){

        const a = sorted[i];
        if(used[a]) continue;

        let opponent = null;

        for(let j = i + 1; j < sorted.length; j++){
            const b = sorted[j];
            if(used[b]) continue;
            const alreadyPlayed = previousOpponents[a] && previousOpponents[a][b];
            if(!alreadyPlayed){
                opponent = b;
                break;
            }
        }

        if(!opponent){
            for(let j = i + 1; j < sorted.length; j++){
                if(!used[sorted[j]]){ opponent = sorted[j]; break; }
            }
        }

        if(opponent){
            used[a] = true;
            used[opponent] = true;

            const pairId = "p" + Object.keys(pairings).length;
            const whiteFirst = Math.random() < 0.5;

            pairings[pairId] = {
                white: whiteFirst ? a : opponent,
                black: whiteFirst ? opponent : a,
                result: null,
                roomCode: null
            };
        }
    }

    return { pairings: pairings, bye: byeUid || null };

}

function joinTournamentMatch(tournamentId, pairingId){

    db.ref("tournaments/" + tournamentId).once("value").then(function(snapshot){

        const t = snapshot.val();
        if(!t) return;

        const round = t.currentRound;
        const pairing = t.rounds_data[round].pairings[pairingId];

        if(!pairing || !currentUser) return;

        const amWhite = pairing.white === currentUser.uid;
        const amBlack = pairing.black === currentUser.uid;
        if(!amWhite && !amBlack) return;

        activeTournamentId = tournamentId;
        activeTournamentPairingId = pairingId;

        selectedTime = t.timeControl;
        gameMode = "online";

        if(pairing.roomCode){

            myColor = amWhite ? "white" : "black";
            currentRoomCode = pairing.roomCode;
            closeTournaments();
            startOnlineGame(pairing.roomCode);

        }else{

            const code = generateRoomCode();

            db.ref("tournaments/" + tournamentId + "/rounds_data/" + round + "/pairings/" + pairingId + "/roomCode")
                .transaction(function(current){
                    if(current) return;
                    return code;
                }).then(function(result){

                    const finalCode = result.snapshot.val();

                    myColor = amWhite ? "white" : "black";
                    currentRoomCode = finalCode;

                    db.ref("rooms/" + finalCode).set({ status: "waiting", createdAt: Date.now() });

                    db.ref("rooms/" + finalCode + "/players/" + myColor).set({
                        username: currentUsername,
                        flag: currentUserFlag,
                        rating: (typeof currentUserRating !== "undefined" && currentUserRating) ? currentUserRating : 100,
                        photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null
                    });

                    if(finalCode !== code){
                        db.ref("rooms/" + finalCode + "/status").set("playing");
                    }

                    closeTournaments();
                    startOnlineGame(finalCode);

                });

        }

    });

}

function recordTournamentGameResult(myResult){

    if(!activeTournamentId || !activeTournamentPairingId || !currentUser) return;

    const tournamentId = activeTournamentId;
    const pairingId = activeTournamentPairingId;

    activeTournamentId = null;
    activeTournamentPairingId = null;

    db.ref("tournaments/" + tournamentId).once("value").then(function(snapshot){

        const t = snapshot.val();
        if(!t) return;

        const round = t.currentRound;
        const pairing = t.rounds_data[round].pairings[pairingId];
        if(!pairing) return;

        const amWhite = pairing.white === currentUser.uid;

        let resultValue;
        if(myResult === "draw"){
            resultValue = "draw";
        }else if(myResult === "win"){
            resultValue = amWhite ? "white" : "black";
        }else{
            resultValue = amWhite ? "black" : "white";
        }

        db.ref("tournaments/" + tournamentId + "/rounds_data/" + round + "/pairings/" + pairingId + "/result")
            .transaction(function(current){
                if(current) return;
                return resultValue;
            });

        const myPoints = myResult === "win" ? 1 : myResult === "draw" ? 0.5 : 0;

        db.ref("tournaments/" + tournamentId + "/players/" + currentUser.uid + "/points")
            .transaction(function(current){
                return (current || 0) + myPoints;
            });

    });

}

function advanceTournamentRound(){

    if(!currentViewedTournamentId || !db) return;

    db.ref("tournaments/" + currentViewedTournamentId).once("value").then(function(snapshot){

        const t = snapshot.val();
        if(!t) return;

        if(t.format === "elimination"){
            advanceEliminationRound(t);
            return;
        }

        if(t.currentRound >= t.rounds){
            db.ref("tournaments/" + currentViewedTournamentId + "/status").set("completed");
            return;
        }

        const playerUids = Object.keys(t.players || {});
        const previousOpponents = {};
        playerUids.forEach(function(uid){ previousOpponents[uid] = {}; });

        for(let r = 1; r <= t.currentRound; r++){
            const roundInfo = t.rounds_data[r];
            if(!roundInfo || !roundInfo.pairings) continue;
            Object.keys(roundInfo.pairings).forEach(function(pid){
                const p = roundInfo.pairings[pid];
                if(!previousOpponents[p.white]) previousOpponents[p.white] = {};
                if(!previousOpponents[p.black]) previousOpponents[p.black] = {};
                previousOpponents[p.white][p.black] = true;
                previousOpponents[p.black][p.white] = true;
            });
        }

        const nextRound = t.currentRound + 1;
        const pairingResult = generateSwissPairings(playerUids, t.players, previousOpponents);

        const updates = {};
        updates["tournaments/" + currentViewedTournamentId + "/currentRound"] = nextRound;
        updates["tournaments/" + currentViewedTournamentId + "/rounds_data/" + nextRound] = pairingResult;

        if(pairingResult.bye){
            updates["tournaments/" + currentViewedTournamentId + "/players/" + pairingResult.bye + "/points"] =
                (t.players[pairingResult.bye].points || 0) + 1;
            updates["tournaments/" + currentViewedTournamentId + "/players/" + pairingResult.bye + "/byes"] =
                (t.players[pairingResult.bye].byes || 0) + 1;
        }

        db.ref().update(updates);

    });

}

function advanceEliminationRound(t){

    const currentRoundInfo = t.rounds_data[t.currentRound];
    if(!currentRoundInfo) return;

    const nextRoundResult = generateEliminationNextRound(currentRoundInfo, t.players);
    const remaining = Object.keys(nextRoundResult.pairings).length * 2 + (nextRoundResult.bye ? 1 : 0);

    const updates = {};

    if(remaining <= 1){
        // Only one player left standing (or the whole thing collapsed to a
        // single bye) — the bracket is finished.
        const championUid = nextRoundResult.bye ||
            (Object.values(nextRoundResult.pairings)[0] && Object.values(nextRoundResult.pairings)[0].white);
        updates["tournaments/" + currentViewedTournamentId + "/status"] = "completed";
        if(championUid) updates["tournaments/" + currentViewedTournamentId + "/champion"] = championUid;
        db.ref().update(updates);
        return;
    }

    const nextRound = t.currentRound + 1;
    updates["tournaments/" + currentViewedTournamentId + "/currentRound"] = nextRound;
    updates["tournaments/" + currentViewedTournamentId + "/rounds_data/" + nextRound] = nextRoundResult;

    db.ref().update(updates);

}
