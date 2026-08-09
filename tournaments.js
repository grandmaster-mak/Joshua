// ============================================================
// Tournaments: Swiss, Single Elimination, Double Elimination,
// Round Robin, and Arena — the five formats chess.com itself offers.
//
// Known simplifications vs chess.com's real system (documented honestly,
// not hidden):
// - Swiss pairing balances points/rating and avoids repeat opponents,
//   but doesn't do full color-balancing or Buchholz tiebreaks.
// - Double Elimination has no "bracket reset" — if the loser's-bracket
//   player wins the Grand Final, they're simply champion (no forced
//   second match), which is a common simplified variant.
// - Arena uses a simple 2-player matchmaking queue rather than a large-
//   scale matchmaking service.
//
// ---- Tournament share links (NEW) ----
// shareTournamentLink() builds a link like ?tournament={id} and shares
// or copies it. checkForIncomingTournament() checks for that param on
// page load and, if present, skips the tournaments list and opens that
// tournament's detail view directly — showing joined players and start
// time, with a Join button if the visitor hasn't joined yet. Unlike the
// challenge-a-friend link, this doesn't require login to VIEW (tournament
// reads are public per the Firebase rules), so it's checked immediately
// once this file loads rather than waiting on auth to resolve.
// ============================================================

let activeTournamentId = null;
let activeTournamentPairingId = null;
let activeTournamentBracket = "main"; // "main" | "winners" | "losers" | "grandFinal" | "arena"
let currentViewedTournamentId = null;
let arenaCountdownInterval = null;
let arenaPendingRef = null;

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
    const needsAutoRounds = (format === "elimination" || format === "double_elimination" || format === "round_robin");
    document.getElementById("tournamentRoundsBox").style.display = (format === "swiss") ? "block" : "none";
    document.getElementById("tournamentEliminationNote").style.display = needsAutoRounds ? "block" : "none";
    document.getElementById("tournamentDurationBox").style.display = (format === "arena") ? "block" : "none";
}

function formatFormatLabel(format){
    if(format === "elimination") return "Single Elim.";
    if(format === "double_elimination") return "Double Elim.";
    if(format === "round_robin") return "Round Robin";
    if(format === "arena") return "Arena";
    return "Swiss";
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
            let statusLabel;
            if(t.status === "registering") statusLabel = "Open";
            else if(t.status === "active") statusLabel = (t.format === "arena") ? "Live" : "Round " + t.currentRound + "/" + t.rounds;
            else statusLabel = "Completed";

            const formatLabel = formatFormatLabel(t.format);
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
    const durationMinutes = Number(document.getElementById("tournamentDurationInput").value);
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

    const tournamentData = {
        name: name,
        format: format,
        // Elimination/Double-Elim/Round-Robin round counts depend on how
        // many players actually join, so they're computed at start time.
        rounds: (format === "swiss") ? rounds : null,
        timeControl: timeControl,
        maxPlayers: maxPlayers,
        scheduledStart: scheduledStart,
        status: "registering",
        createdBy: currentUser.uid,
        createdAt: Date.now(),
        currentRound: 0,
        players: playerEntry
    };

    if(format === "arena"){
        tournamentData.durationMinutes = durationMinutes;
    }

    newRef.set(tournamentData).then(function(){
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
    stopArenaCountdown();
    stopArenaPendingListener();
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
    const isArena = (t.format === "arena");

    let statusText = "";
    if(t.status === "registering"){
        statusText = playerUids.length + (t.maxPlayers ? "/" + t.maxPlayers : "") + " players joined";
        if(t.scheduledStart) statusText += " — starts automatically at " + formatScheduledStart(t.scheduledStart);
    }else if(t.status === "active"){
        statusText = isArena ? "Live now" : "Round " + t.currentRound + " of " + t.rounds;
    }else{
        statusText = "Completed" + (t.champion && players[t.champion] ? " — 🏆 " + players[t.champion].username + " wins!" : "");
    }

    document.getElementById("tournamentDetailStatus").textContent = statusText;

    const formatLabel = formatFormatLabel(t.format);
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
    const arenaCountdownEl = document.getElementById("tournamentArenaCountdown");
    const arenaPlayBtn = document.getElementById("tournamentArenaPlayBtn");
    const arenaStatusEl = document.getElementById("tournamentArenaStatus");
    const pairingsLabel = document.getElementById("tournamentPairingsLabel");

    joinBtn.style.display = (t.status === "registering" && currentUser && !alreadyJoined) ? "block" : "none";
    // The manual Start button only ever appears when there's no scheduled
    // time — once a time is set, the tournament can ONLY begin
    // automatically at that moment, never early.
    startBtn.style.display = (t.status === "registering" && isCreator && playerUids.length >= 2 && !t.scheduledStart) ? "block" : "none";

    if(isArena){

        pairingsLabel.textContent = "Live Games";

        if(t.status === "active"){
            startArenaCountdown(tournamentId, t.arenaEndsAt);
            startArenaPendingListener(tournamentId);
            if(alreadyJoined){
                arenaPlayBtn.style.display = "block";
                arenaStatusEl.style.display = "block";
                db.ref("tournaments/" + tournamentId + "/arenaQueue/" + currentUser.uid).once("value").then(function(snap){
                    arenaStatusEl.textContent = snap.exists() ? "Searching for an opponent..." : "Tap Find Opponent to play.";
                });
            }else{
                arenaPlayBtn.style.display = "none";
                arenaStatusEl.style.display = "none";
            }
        }else{
            arenaCountdownEl.style.display = "none";
            arenaPlayBtn.style.display = "none";
            arenaStatusEl.style.display = "none";
        }

        nextRoundBtn.style.display = "none";

    }else{

        arenaCountdownEl.style.display = "none";
        arenaPlayBtn.style.display = "none";
        arenaStatusEl.style.display = "none";
        pairingsLabel.textContent = (t.format === "double_elimination") ? "Current Round" : "Current Round";

        let roundComplete = false;
        if(t.status === "active" && t.rounds_data && t.rounds_data[t.currentRound]){
            roundComplete = isRoundComplete(t, t.rounds_data[t.currentRound]);
        }
        nextRoundBtn.style.display = (t.status === "active" && isCreator && roundComplete) ? "block" : "none";
        nextRoundBtn.textContent = (t.format !== "round_robin" && t.currentRound >= t.rounds) ? "Finish Tournament" :
            (t.format === "round_robin" && t.currentRound >= t.rounds) ? "Finish Tournament" : "Start Next Round";

    }

    const standingsBox = document.getElementById("tournamentStandings");
    const sorted = playerUids.map(function(uid){ return { uid: uid, data: players[uid] }; })
        .sort(function(a, b){ return (b.data.points || 0) - (a.data.points || 0); });

    standingsBox.innerHTML = "";
    sorted.forEach(function(p, index){
        const row = document.createElement("div");
        row.className = "standingRow";
        row.style.cursor = "pointer";
        row.onclick = function(){ openPlayerProfile(p.uid); };
        row.innerHTML =
            '<span class="standingRank">' + (index + 1) + '</span>' +
            '<span class="standingName">' + escapeHtml(p.data.flag || "") + ' ' + escapeHtml(p.data.username) + '</span>' +
            '<span class="standingPoints">' + (p.data.points || 0) + '</span>';
        standingsBox.appendChild(row);
    });

    // Tournament placement awards — same client-triggered pattern already
    // used by checkTournamentAutoStart: any viewer whose OWN browser sees
    // a completed tournament checks their OWN placement and unlocks their
    // OWN award. unlockAchievement() already no-ops if already unlocked,
    // so this is safe to run every time this screen re-renders.
    if(t.status === "completed" && currentUser){
        const myIndex = sorted.findIndex(function(p){ return p.uid === currentUser.uid; });
        if(myIndex === 0 && typeof unlockAchievement === "function") unlockAchievement(currentUser.uid, "tournament_gold");
        else if(myIndex === 1 && typeof unlockAchievement === "function") unlockAchievement(currentUser.uid, "tournament_silver");
        else if(myIndex === 2 && typeof unlockAchievement === "function") unlockAchievement(currentUser.uid, "tournament_bronze");
    }

    const pairingsBox = document.getElementById("tournamentPairings");
    pairingsBox.innerHTML = "";

    if(isArena && t.status === "active"){
        renderArenaPairings(tournamentId, t);
        return;
    }

    if(t.status === "active" && t.rounds_data && t.rounds_data[t.currentRound]){

        if(t.format === "double_elimination"){
            renderDoubleEliminationPairings(tournamentId, t, players);
        }else{
            renderStandardPairings(tournamentId, t, players, t.rounds_data[t.currentRound]);
        }

    }

}
function isRoundComplete(t, roundInfo){
    if(t.format === "double_elimination"){
        const winnersDone = !roundInfo.winners || Object.keys(roundInfo.winners.pairings || {}).every(function(pid){ return !!roundInfo.winners.pairings[pid].result; });
        const losersDone = !roundInfo.losers || Object.keys(roundInfo.losers.pairings || {}).every(function(pid){ return !!roundInfo.losers.pairings[pid].result; });
        return winnersDone && losersDone;
    }
    const pairings = roundInfo.pairings || {};
    return Object.keys(pairings).every(function(pid){ return !!pairings[pid].result; });
}

function renderStandardPairings(tournamentId, t, players, roundInfo){

    const pairingsBox = document.getElementById("tournamentPairings");
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
            '<button class="btnPrimary" style="width:auto;padding:6px 14px;font-size:12px;" data-tid="' + tournamentId + '" data-pid="' + pid + '" data-bracket="main" onclick="joinTournamentMatch(this.dataset.tid, this.dataset.pid, this.dataset.bracket)">Play</button>' : '';

        row.innerHTML =
            '<div><div class="pairingNames">' +
                '<span style="cursor:pointer;" onclick="openPlayerProfile(\'' + p.white + '\')">' + escapeHtml(whiteName) + '</span>' +
                ' vs ' +
                '<span style="cursor:pointer;" onclick="openPlayerProfile(\'' + p.black + '\')">' + escapeHtml(blackName) + '</span>' +
            '</div>' +
            '<div class="pairingResult">' + resultLabel + '</div></div>' + playBtn;

        pairingsBox.appendChild(row);

    });

    if(roundInfo.bye && players[roundInfo.bye]){
        const byeRow = document.createElement("div");
        byeRow.className = "pairingRow";
        byeRow.style.cursor = "pointer";
        byeRow.onclick = function(){ openPlayerProfile(roundInfo.bye); };
        const byeLabel = (t.format === "elimination" || t.format === "double_elimination") ? "Bye (advances automatically)" : "Bye (free point)";
        byeRow.innerHTML = '<div class="pairingNames">' + escapeHtml(players[roundInfo.bye].username) + '</div><div class="pairingResult">' + byeLabel + '</div>';
        pairingsBox.appendChild(byeRow);
    }

}

function renderDoubleEliminationPairings(tournamentId, t, players){

    const pairingsBox = document.getElementById("tournamentPairings");
    const roundInfo = t.rounds_data[t.currentRound];

    if(roundInfo.grandFinal){
        const header = document.createElement("div");
        header.className = "sub";
        header.style.fontWeight = "700";
        header.textContent = "🏆 Grand Final";
        pairingsBox.appendChild(header);
        renderStandardPairings(tournamentId, t, players, roundInfo.winners);
        return;
    }

    if(roundInfo.winners && Object.keys(roundInfo.winners.pairings || {}).length + (roundInfo.winners.bye ? 1 : 0) > 0){
        const header = document.createElement("div");
        header.className = "sub";
        header.style.fontWeight = "700";
        header.textContent = "Winners Bracket";
        pairingsBox.appendChild(header);
        renderStandardPairings(tournamentId, t, players, roundInfo.winners);
    }

    if(roundInfo.losers && Object.keys(roundInfo.losers.pairings || {}).length + (roundInfo.losers.bye ? 1 : 0) > 0){
        const header = document.createElement("div");
        header.className = "sub";
        header.style.fontWeight = "700";
        header.style.marginTop = "14px";
        header.textContent = "Losers Bracket";
        pairingsBox.appendChild(header);
        renderStandardPairings(tournamentId, t, players, roundInfo.losers);
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

        // If that just filled the tournament to its cap, start it right
        // here in the same atomic transaction — no need for the creator
        // to manually click "Start Tournament". (Arena tournaments don't
        // auto-start just from filling up — they wait for their scheduled
        // time or a manual start, since Arena is meant to run for a fixed
        // clock duration regardless of headcount.)
        const newCount = Object.keys(t.players).length;
        if(t.maxPlayers && newCount >= t.maxPlayers && t.format !== "arena"){
            beginTournamentInPlace(t);
        }

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

// Mutates a tournament object (inside a transaction) into its "active"
// state — pairing generation branches by format. Shared by the
// auto-fill-up trigger, the scheduled-time trigger, and manual start.
function beginTournamentInPlace(t){

    const uids = Object.keys(t.players);

    if(t.format === "arena"){
        t.status = "active";
        t.arenaEndsAt = getServerNow() + (t.durationMinutes || 30) * 60000;
        return;
    }

    if(t.format === "round_robin"){
        const schedule = generateRoundRobinSchedule(uids);
        t.status = "active";
        t.currentRound = 1;
        t.rounds = schedule.length;
        t.rounds_data = {};
        schedule.forEach(function(roundInfo, i){ t.rounds_data[i + 1] = roundInfo; });
        if(schedule[0] && schedule[0].bye){
            t.players[schedule[0].bye].points = (t.players[schedule[0].bye].points || 0) + 1;
            t.players[schedule[0].bye].byes = (t.players[schedule[0].bye].byes || 0) + 1;
        }
        return;
    }

    if(t.format === "double_elimination"){
        const pairingResult = generateEliminationPairings(uids);
        t.status = "active";
        t.currentRound = 1;
        t.rounds_data = { 1: { winners: pairingResult, losers: null } };
        return;
    }

    if(t.format === "elimination"){
        const pairingResult = generateEliminationPairings(uids);
        t.status = "active";
        t.currentRound = 1;
        t.rounds = Math.ceil(Math.log2(uids.length));
        t.rounds_data = { 1: pairingResult };
        return;
    }

    // Swiss
    const pairingResult = generateSwissPairings(uids, t.players, {});
    t.status = "active";
    t.currentRound = 1;
    t.rounds_data = { 1: pairingResult };
    if(pairingResult.bye){
        t.players[pairingResult.bye].points = (t.players[pairingResult.bye].points || 0) + 1;
        t.players[pairingResult.bye].byes = (t.players[pairingResult.bye].byes || 0) + 1;
    }

}

function startTournament(){

    if(!currentViewedTournamentId || !db) return;

    db.ref("tournaments/" + currentViewedTournamentId).transaction(function(t){
        if(!t) return t;
        if(t.status !== "registering") return t;
        if(t.scheduledStart) return t; // scheduled tournaments never start manually
        beginTournamentInPlace(t);
        return t;
    });

}

// A tournament with a scheduled start time opens itself automatically once
// that time passes and at least 2 players have joined (or, if a player cap
// is set, once it's actually full). Wrapped in a transaction so it can
// safely fire from several people's browsers at once and still only ever
// run once.
function checkTournamentAutoStart(tournamentId, t){

    if(t.status !== "registering") return;
    if(!t.scheduledStart) return;
    if(Date.now() < t.scheduledStart) return;

    const playerUids = Object.keys(t.players || {});
    const requiredCount = t.maxPlayers || 2;
    if(playerUids.length < requiredCount) return; // not full yet — keep waiting

    db.ref("tournaments/" + tournamentId).transaction(function(current){

        if(!current) return current;
        if(current.status !== "registering") return current; // someone already started it
        if(!current.scheduledStart || Date.now() < current.scheduledStart) return current;

        const uids = Object.keys(current.players || {});
        const requiredNow = current.maxPlayers || 2;
        if(uids.length < requiredNow) return current;

        beginTournamentInPlace(current);

        return current;

    });

}

// ============================================================
// Swiss pairing
// ============================================================

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

// ============================================================
// Single/Double Elimination pairing
// ============================================================

// Randomly seeds players into a knockout bracket. An odd/non-power-of-2
// count gets one random bye each round rather than requiring exact powers
// of 2, same as how most casual knockout brackets are run.
function generateEliminationPairings(playerUids){

    const shuffled = playerUids.slice();
    for(let i = shuffled.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
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
// counts as an automatic win).
function generateEliminationNextRound(previousRoundInfo){

    const winners = [];

    Object.keys(previousRoundInfo.pairings || {}).forEach(function(pid){
        const p = previousRoundInfo.pairings[pid];
        if(p.result === "white") winners.push(p.white);
        else if(p.result === "black") winners.push(p.black);
    });

    if(previousRoundInfo.bye) winners.push(previousRoundInfo.bye);

    return generateEliminationPairings(winners);

}

// ============================================================
// Round Robin — full schedule generated up front (circle method)
// ============================================================

function generateRoundRobinSchedule(playerUids){

    const players = playerUids.slice();
    if(players.length % 2 !== 0) players.push(null); // bye placeholder

    const n = players.length;
    const rounds = [];

    for(let r = 0; r < n - 1; r++){

        const roundPairings = {};
        let byeUid = null;

        for(let i = 0; i < n / 2; i++){
            const a = players[i];
            const b = players[n - 1 - i];
            if(a === null){ byeUid = b; continue; }
            if(b === null){ byeUid = a; continue; }
            const pairId = "p" + i;
            const whiteFirst = (r + i) % 2 === 0;
            roundPairings[pairId] = {
                white: whiteFirst ? a : b,
                black: whiteFirst ? b : a,
                result: null,
                roomCode: null
            };
        }

        rounds.push({ pairings: roundPairings, bye: byeUid });

        // Rotate: keep the first player fixed, rotate everyone else.
        players.splice(1, 0, players.pop());

    }

    return rounds;

}

// ============================================================
// Double Elimination round advancement
// ============================================================

function advanceEliminationRound(t, tournamentId){

    const currentRoundInfo = t.rounds_data[t.currentRound];
    if(!currentRoundInfo) return;

    const nextRoundResult = generateEliminationNextRound(currentRoundInfo);
    const remaining = Object.keys(nextRoundResult.pairings).length * 2 + (nextRoundResult.bye ? 1 : 0);

    const updates = {};

    if(remaining <= 1){
        const championUid = nextRoundResult.bye ||
            (Object.values(nextRoundResult.pairings)[0] && Object.values(nextRoundResult.pairings)[0].white);
        updates["tournaments/" + tournamentId + "/status"] = "completed";
        if(championUid) updates["tournaments/" + tournamentId + "/champion"] = championUid;
        db.ref().update(updates);
        return;
    }

    const nextRound = t.currentRound + 1;
    updates["tournaments/" + tournamentId + "/currentRound"] = nextRound;
    updates["tournaments/" + tournamentId + "/rounds_data/" + nextRound] = nextRoundResult;

    db.ref().update(updates);

}

function advanceDoubleEliminationRound(t, tournamentId){

    const roundInfo = t.rounds_data[t.currentRound];

    if(roundInfo.grandFinal){
        const gfPairing = Object.values(roundInfo.winners.pairings)[0];
        const championUid = gfPairing.result === "white" ? gfPairing.white : gfPairing.black;
        db.ref("tournaments/" + tournamentId + "/status").set("completed");
        db.ref("tournaments/" + tournamentId + "/champion").set(championUid);
        return;
    }

    const winnersInfo = roundInfo.winners || { pairings: {}, bye: null };
    const losersInfo = roundInfo.losers || { pairings: {}, bye: null };

    const winnersStay = [];
    const droppedToLosers = [];
    Object.keys(winnersInfo.pairings).forEach(function(pid){
        const p = winnersInfo.pairings[pid];
        if(p.result === "white"){ winnersStay.push(p.white); droppedToLosers.push(p.black); }
        else if(p.result === "black"){ winnersStay.push(p.black); droppedToLosers.push(p.white); }
    });
    if(winnersInfo.bye) winnersStay.push(winnersInfo.bye);

    const losersStay = [];
    Object.keys(losersInfo.pairings).forEach(function(pid){
        const p = losersInfo.pairings[pid];
        if(p.result === "white") losersStay.push(p.white);
        else if(p.result === "black") losersStay.push(p.black);
        // the loser of a losers-bracket game is fully eliminated (2nd loss)
    });
    if(losersInfo.bye) losersStay.push(losersInfo.bye);

    const newLosersPool = losersStay.concat(droppedToLosers);

    const nextRound = t.currentRound + 1;
    const updates = {};

    if(winnersStay.length === 1 && newLosersPool.length === 1){
        // Both brackets down to their champion — Grand Final.
        const whiteFirst = Math.random() < 0.5;
        const gfPairings = {
            p0: {
                white: whiteFirst ? winnersStay[0] : newLosersPool[0],
                black: whiteFirst ? newLosersPool[0] : winnersStay[0],
                result: null,
                roomCode: null
            }
        };
        updates["tournaments/" + tournamentId + "/currentRound"] = nextRound;
        updates["tournaments/" + tournamentId + "/rounds_data/" + nextRound] = { grandFinal: true, winners: { pairings: gfPairings, bye: null }, losers: null };
        db.ref().update(updates);
        return;
    }

    const nextWinners = winnersStay.length > 1 ? generateEliminationPairings(winnersStay) : { pairings: {}, bye: winnersStay[0] || null };
    const nextLosers = newLosersPool.length > 1 ? generateEliminationPairings(newLosersPool) : { pairings: {}, bye: newLosersPool[0] || null };

    updates["tournaments/" + tournamentId + "/currentRound"] = nextRound;
    updates["tournaments/" + tournamentId + "/rounds_data/" + nextRound] = { winners: nextWinners, losers: nextLosers };

    db.ref().update(updates);

}

// Fixed race condition: this used to read the tournament ONCE, then write
// its result back using the LIVE currentViewedTournamentId global — if
// the person tapped into a different tournament before the write landed,
// the round data could land on the wrong tournament. Now the id is
// captured locally the moment the button is tapped and threaded through
// every helper, so later navigation can never redirect the write.
function advanceTournamentRound(){

    if(!currentViewedTournamentId || !db) return;

    const tournamentId = currentViewedTournamentId;

    db.ref("tournaments/" + tournamentId).once("value").then(function(snapshot){

        const t = snapshot.val();
        if(!t) return;

        if(t.format === "double_elimination"){
            advanceDoubleEliminationRound(t, tournamentId);
            return;
        }

        if(t.format === "elimination"){
            advanceEliminationRound(t, tournamentId);
            return;
        }

        if(t.format === "round_robin"){
            if(t.currentRound >= t.rounds){
                db.ref("tournaments/" + tournamentId + "/status").set("completed");
                return;
            }
            const nextRound = t.currentRound + 1;
            const nextRoundInfo = t.rounds_data[nextRound];
            const updates = { ["tournaments/" + tournamentId + "/currentRound"]: nextRound };
            if(nextRoundInfo && nextRoundInfo.bye){
                updates["tournaments/" + tournamentId + "/players/" + nextRoundInfo.bye + "/points"] =
                    (t.players[nextRoundInfo.bye].points || 0) + 1;
                updates["tournaments/" + tournamentId + "/players/" + nextRoundInfo.bye + "/byes"] =
                    (t.players[nextRoundInfo.bye].byes || 0) + 1;
            }
            db.ref().update(updates);
            return;
        }

        // Swiss
        if(t.currentRound >= t.rounds){
            db.ref("tournaments/" + tournamentId + "/status").set("completed");
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
        updates["tournaments/" + tournamentId + "/currentRound"] = nextRound;
        updates["tournaments/" + tournamentId + "/rounds_data/" + nextRound] = pairingResult;

        if(pairingResult.bye){
            updates["tournaments/" + tournamentId + "/players/" + pairingResult.bye + "/points"] =
                (t.players[pairingResult.bye].points || 0) + 1;
            updates["tournaments/" + tournamentId + "/players/" + pairingResult.bye + "/byes"] =
                (t.players[pairingResult.bye].byes || 0) + 1;
        }

        db.ref().update(updates);

    });

}

// ============================================================
// Joining an in-progress match (Swiss/Elimination/Double-Elim/Round Robin)
// ============================================================

function joinTournamentMatch(tournamentId, pairingId, bracket){

    bracket = bracket || "main";

    db.ref("tournaments/" + tournamentId).once("value").then(function(snapshot){

        const t = snapshot.val();
        if(!t) return;

        const round = t.currentRound;
        const roundInfo = t.rounds_data[round];
        const pairing = (bracket === "main") ? roundInfo.pairings[pairingId] :
            (bracket === "winners") ? roundInfo.winners.pairings[pairingId] :
            (bracket === "losers") ? roundInfo.losers.pairings[pairingId] :
            roundInfo.winners.pairings[pairingId]; // grandFinal

        if(!pairing || !currentUser) return;

        const amWhite = pairing.white === currentUser.uid;
        const amBlack = pairing.black === currentUser.uid;
        if(!amWhite && !amBlack) return;

        activeTournamentId = tournamentId;
        activeTournamentPairingId = pairingId;
        activeTournamentBracket = bracket;

        selectedTime = t.timeControl;
        gameMode = "online";

        if(pairing.roomCode){

            myColor = amWhite ? "white" : "black";
            currentRoomCode = pairing.roomCode;
            closeTournaments();
            startOnlineGame(pairing.roomCode);

        }else{

            const code = generateRoomCode();
            const pairingPath = (bracket === "main") ? "rounds_data/" + round + "/pairings/" + pairingId :
                (bracket === "winners" || bracket === "grandFinal") ? "rounds_data/" + round + "/winners/pairings/" + pairingId :
                "rounds_data/" + round + "/losers/pairings/" + pairingId;

            db.ref("tournaments/" + tournamentId + "/" + pairingPath + "/roomCode")
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
                        photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
                        uid: currentUser ? currentUser.uid : null
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
    const bracket = activeTournamentBracket;

    activeTournamentId = null;
    activeTournamentPairingId = null;
    activeTournamentBracket = "main";

    db.ref("tournaments/" + tournamentId).once("value").then(function(snapshot){

        const t = snapshot.val();
        if(!t) return;

        const round = t.currentRound;
        const roundInfo = t.rounds_data[round];
        const pairingPath = (bracket === "main") ? "pairings/" + pairingId :
            (bracket === "winners" || bracket === "grandFinal") ? "winners/pairings/" + pairingId :
            "losers/pairings/" + pairingId;

        const pairing = (bracket === "main") ? roundInfo.pairings[pairingId] :
            (bracket === "winners" || bracket === "grandFinal") ? roundInfo.winners.pairings[pairingId] :
            roundInfo.losers.pairings[pairingId];

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

        db.ref("tournaments/" + tournamentId + "/rounds_data/" + round + "/" + pairingPath + "/result")
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

// ============================================================
// Arena — continuous matchmaking within a fixed time window
// ============================================================

function startArenaCountdown(tournamentId, endsAt){

    stopArenaCountdown();
    if(!endsAt) return;

    const el = document.getElementById("tournamentArenaCountdown");
    el.style.display = "block";

    function tick(){
        const remaining = Math.max(0, endsAt - getServerNow());
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        el.textContent = "⏱ " + mins + ":" + String(secs).padStart(2, "0") + " remaining";
        if(remaining <= 0){
            stopArenaCountdown();
            checkArenaEnd(tournamentId);
        }
    }

    tick();
    arenaCountdownInterval = setInterval(tick, 1000);

}

function stopArenaCountdown(){
    if(arenaCountdownInterval){
        clearInterval(arenaCountdownInterval);
        arenaCountdownInterval = null;
    }
}

function checkArenaEnd(tournamentId){
    db.ref("tournaments/" + tournamentId).transaction(function(t){
        if(!t) return t;
        if(t.status !== "active" || t.format !== "arena") return t;
        if(!t.arenaEndsAt || getServerNow() < t.arenaEndsAt) return t;
        t.status = "completed";
        const uids = Object.keys(t.players || {});
        uids.sort(function(a, b){ return (t.players[b].points || 0) - (t.players[a].points || 0); });
        t.champion = uids[0] || null;
        return t;
    });
}

// Puts the current player into the matchmaking queue, or instantly pairs
// them with whoever's already waiting.
function joinArenaQueue(tournamentId){

    if(!tournamentId || !currentUser || !db) return;

    const statusEl = document.getElementById("tournamentArenaStatus");

    db.ref("tournaments/" + tournamentId).transaction(function(t){

        if(!t || t.format !== "arena" || t.status !== "active") return t;

        const myUid = currentUser.uid;
        if(!t.arenaQueue) t.arenaQueue = {};
        if(!t.arenaPairings) t.arenaPairings = {};
        if(!t.arenaPending) t.arenaPending = {};

        if(t.arenaPending[myUid]) return t; // already matched, waiting to be picked up

        const others = Object.keys(t.arenaQueue).filter(function(u){ return u !== myUid; });

        if(others.length > 0){
            const opponent = others[0];
            delete t.arenaQueue[opponent];
            delete t.arenaQueue[myUid];

            const pairId = "a" + Date.now() + Math.floor(Math.random() * 1000);
            const whiteFirst = Math.random() < 0.5;

            t.arenaPairings[pairId] = {
                white: whiteFirst ? myUid : opponent,
                black: whiteFirst ? opponent : myUid,
                result: null,
                roomCode: null,
                createdAt: Date.now()
            };
            t.arenaPending[myUid] = pairId;
            t.arenaPending[opponent] = pairId;
        }else{
            t.arenaQueue[myUid] = Date.now();
        }

        return t;

    }).then(function(){
        if(statusEl){
            statusEl.style.display = "block";
            statusEl.textContent = "Searching for an opponent...";
        }
    });

}

// Listens for this player being matched, and jumps straight into the game
// the moment a pairing appears for them.
function startArenaPendingListener(tournamentId){

    stopArenaPendingListener();
    if(!currentUser) return;

    arenaPendingRef = db.ref("tournaments/" + tournamentId + "/arenaPending/" + currentUser.uid);

    arenaPendingRef.on("value", function(snap){

        const pairId = snap.val();
        if(!pairId) return;

        joinArenaMatch(tournamentId, pairId);

        db.ref("tournaments/" + tournamentId + "/arenaPending/" + currentUser.uid).set(null);

    });

}

function stopArenaPendingListener(){
    if(arenaPendingRef){
        arenaPendingRef.off();
        arenaPendingRef = null;
    }
}

function joinArenaMatch(tournamentId, pairId){

    db.ref("tournaments/" + tournamentId).once("value").then(function(snapshot){

        const t = snapshot.val();
        if(!t || !t.arenaPairings || !t.arenaPairings[pairId]) return;

        const pairing = t.arenaPairings[pairId];
        const amWhite = pairing.white === currentUser.uid;
        const amBlack = pairing.black === currentUser.uid;
        if(!amWhite && !amBlack) return;

        activeTournamentId = tournamentId;
        activeTournamentPairingId = pairId;
        activeTournamentBracket = "arena";

        selectedTime = t.timeControl;
        gameMode = "online";

        if(pairing.roomCode){
            myColor = amWhite ? "white" : "black";
            currentRoomCode = pairing.roomCode;
            closeTournaments();
            startOnlineGame(pairing.roomCode);
            return;
        }

        const code = generateRoomCode();

        db.ref("tournaments/" + tournamentId + "/arenaPairings/" + pairId + "/roomCode")
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
                    photo: (typeof currentUserPhotoURL !== "undefined" && currentUserPhotoURL) ? currentUserPhotoURL : null,
                    uid: currentUser ? currentUser.uid : null
                });

                if(finalCode !== code){
                    db.ref("rooms/" + finalCode + "/status").set("playing");
                }

                closeTournaments();
                startOnlineGame(finalCode);

            });

    });

}

// Called from recordGameResult when the game that just ended was an
// Arena match — awards points (with a streak bonus, like chess.com's
// Arena) instead of the round-based points system.
function recordArenaGameResult(myResult){

    if(!activeTournamentId || !activeTournamentPairingId || !currentUser) return;

    const tournamentId = activeTournamentId;
    const pairId = activeTournamentPairingId;

    activeTournamentId = null;
    activeTournamentPairingId = null;
    activeTournamentBracket = "main";

    db.ref("tournaments/" + tournamentId).once("value").then(function(snapshot){

        const t = snapshot.val();
        if(!t || !t.arenaPairings || !t.arenaPairings[pairId]) return;

        const pairing = t.arenaPairings[pairId];
        const amWhite = pairing.white === currentUser.uid;
        const resultValue = myResult === "draw" ? "draw" : (myResult === "win") === amWhite ? "white" : "black";

        db.ref("tournaments/" + tournamentId + "/arenaPairings/" + pairId + "/result")
            .transaction(function(current){ if(current) return; return resultValue; });

        db.ref("tournaments/" + tournamentId + "/players/" + currentUser.uid).transaction(function(player){
            if(!player) return player;
            player.winStreakArena = player.winStreakArena || 0;
            let pointsEarned = 0;
            if(myResult === "win"){
                player.winStreakArena++;
                pointsEarned = (player.winStreakArena >= 3) ? 2 : 1; // streak bonus, like chess.com Arena
            }else if(myResult === "draw"){
                player.winStreakArena = 0;
                pointsEarned = 0.5;
            }else{
                player.winStreakArena = 0;
                pointsEarned = 0;
            }
            player.points = (player.points || 0) + pointsEarned;
            return player;
        });

    });

}

function renderArenaPairings(tournamentId, t){

    const pairingsBox = document.getElementById("tournamentPairings");
    const pairings = t.arenaPairings || {};
    const players = t.players || {};

    const activeOnes = Object.keys(pairings).filter(function(pid){ return !pairings[pid].result; });

    if(activeOnes.length === 0){
        pairingsBox.innerHTML = '<p class="sub">No games in progress right now.</p>';
        return;
    }

    activeOnes.slice(-10).reverse().forEach(function(pid){

        const p = pairings[pid];
        const whiteName = players[p.white] ? players[p.white].username : "?";
        const blackName = players[p.black] ? players[p.black].username : "?";

        const row = document.createElement("div");
        row.className = "pairingRow";
        row.innerHTML =
            '<div class="pairingNames">' +
                '<span style="cursor:pointer;" onclick="openPlayerProfile(\'' + p.white + '\')">' + escapeHtml(whiteName) + '</span>' +
                ' vs ' +
                '<span style="cursor:pointer;" onclick="openPlayerProfile(\'' + p.black + '\')">' + escapeHtml(blackName) + '</span>' +
            '</div>';
        pairingsBox.appendChild(row);

    });

}

// ============================================================
// Tournament share link (NEW)
// ============================================================

// Shares (or copies, as a fallback) a link that opens this tournament's
// detail view directly — the joined-players list and start time — for
// anyone who taps it, regardless of whether they're logged in yet.
function shareTournamentLink(tournamentId){

    if(!tournamentId) return;

    const link = "https://joshua-sable-ten.vercel.app/?tournament=" + tournamentId;

    if(navigator.share){
        navigator.share({
            title: "Join my chess tournament!",
            text: "Come join my tournament — tap to see who's in and when it starts.",
            url: link
        }).catch(function(){
            // User cancelled the native share sheet — nothing to do.
        });
        return;
    }

    // Fallback for browsers without navigator.share: copy to clipboard.
    const tempInput = document.createElement("input");
    tempInput.value = link;
    tempInput.style.position = "fixed";
    tempInput.style.opacity = "0";
    document.body.appendChild(tempInput);
    tempInput.select();
    try{
        document.execCommand("copy");
        showInfoPopup("🔗 Link Copied", "Tournament link copied — paste it anywhere to invite people.");
    }catch(e){
        showInfoPopup("🔗 Tournament Link", link);
    }
    document.body.removeChild(tempInput);

}

// Checks the URL for a ?tournament={id} param and, if present, skips
// the tournaments list and opens that tournament's detail view directly.
// Unlike checkForIncomingChallenge() in script.js, this does NOT wait
// for auth to resolve — tournament reads are public (".read": true in
// the Firebase rules), so a visitor can see who's joined and the start
// time before logging in; they'll only need to log in to tap Join.
// Called once at the bottom of this file, since db is already
// initialized by the time this script runs (multiplayer.js loads first).
function checkForIncomingTournament(){

    if(window.tournamentParamChecked) return; // only act on this once per page load
    const params = new URLSearchParams(window.location.search);
    const tournamentId = params.get("tournament");
    if(!tournamentId) return;

    window.tournamentParamChecked = true;

    document.getElementById("appShell").style.display = "none";
    document.getElementById("tournamentsScreen").style.display = "flex";
    history.pushState({ screen: "tournaments", view: "detail", id: tournamentId }, "", "#tournaments-detail");
    renderTournamentDetailView(tournamentId);

}

checkForIncomingTournament();
