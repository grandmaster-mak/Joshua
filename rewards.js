// ============================================================
// Daily Challenge (home screen widget) + Daily Rewards (7-day streak)
//
// Firebase structure this file expects/creates:
//   users/{uid}/private/dailyChallenge/{YYYY-MM-DD} -> { completed, claimed }
//   users/{uid}/private/dailyReward -> { lastClaimDate: "YYYY-MM-DD", streak }
//   users/{uid}/public/coins, users/{uid}/public/gems (also touched by auth.js)
// ============================================================

const DAILY_REWARD_AMOUNTS = [
    { coins: 50,  gems: 0 },
    { coins: 50,  gems: 0 },
    { coins: 75,  gems: 0 },
    { coins: 75,  gems: 1 },
    { coins: 100, gems: 1 },
    { coins: 100, gems: 1 },
    { coins: 200, gems: 3 }
];

function todayKey(){
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

function yesterdayKey(){
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ============================================================
// Daily Challenge — "Win one ranked game today"
// ============================================================

function refreshDailyChallengeUI(){

    const bar = document.getElementById("dailyChallengeBar");
    const pct = document.getElementById("dailyChallengePct");
    const sub = document.getElementById("dailyChallengeSub");

    if(!bar || !pct) return;

    if(!currentUser || !db){
        bar.style.width = "0%";
        pct.textContent = "0%";
        return;
    }

    db.ref("users/" + currentUser.uid + "/private/dailyChallenge/" + todayKey()).once("value").then(function(snapshot){

        const state = snapshot.val();
        const done = !!(state && state.completed);

        bar.style.width = done ? "100%" : "0%";
        pct.textContent = done ? "100%" : "0%";
        if(sub) sub.textContent = done ? "Completed — reward claimed!" : "Win one ranked game today";

    });

}

// Called from script.js's recordGameResult(). Only AI and online games
// count as "ranked" here — local two-player games on one device aren't
// tied to an account, so there's nothing to rank.
function recordDailyChallengeProgress(myResult, mode){

    if(!currentUser || !db) return;
    if(myResult !== "win") return;
    if(mode !== "ai" && mode !== "online") return;

    const dateKey = todayKey();
    const ref = db.ref("users/" + currentUser.uid + "/private/dailyChallenge/" + dateKey);

    ref.transaction(function(current){
        if(current && current.completed) return current;
        return { completed: true, claimed: false };
    }).then(function(result){

        const state = result.snapshot.val();
        if(!state || !state.completed || state.claimed) {
            refreshDailyChallengeUI();
            return;
        }

        // First time completing it today — pay out the daily challenge
        // reward once and mark it claimed so a later transaction retry
        // (or another tab) can't double-pay it.
        db.ref("users/" + currentUser.uid + "/public").transaction(function(data){
            if(!data) return data;
            data.coins = (data.coins || 0) + 25;
            return data;
        });

        ref.child("claimed").set(true);

        refreshDailyChallengeUI();

    });

}

// ============================================================
// Daily Rewards — 7-day login streak
// ============================================================

function openDailyRewards(){
    document.getElementById("appShell").style.display = "none";
    document.getElementById("dailyRewardsScreen").style.display = "flex";
    history.pushState({ screen: "dailyRewards" }, "", "#daily-rewards");
    renderRewardsScreen();
}

function closeDailyRewards(){
    document.getElementById("dailyRewardsScreen").style.display = "none";
    document.getElementById("appShell").style.display = "flex";
    if(history.state && history.state.screen === "dailyRewards"){
        history.back();
    }
}

function renderRewardsScreen(){

    const statusEl = document.getElementById("dailyRewardStatus");
    const claimBtn = document.getElementById("claimRewardBtn");

    if(!currentUser || !db){
        if(statusEl) statusEl.textContent = "Log in to claim daily rewards.";
        if(claimBtn) claimBtn.style.display = "none";
        renderRewardsTrack(0);
        return;
    }

    db.ref("users/" + currentUser.uid + "/private/dailyReward").once("value").then(function(snapshot){

        const state = snapshot.val() || { lastClaimDate: null, streak: 0 };
        const claimedToday = state.lastClaimDate === todayKey();

        renderRewardsTrack(state.streak || 0, claimedToday);

        if(statusEl){
            statusEl.textContent = claimedToday
                ? "You've claimed today's reward — come back tomorrow!"
                : "Day " + (((state.streak || 0) % 7) + 1) + " of your streak is ready to claim.";
        }
        if(claimBtn){
            claimBtn.style.display = "block";
            claimBtn.disabled = claimedToday;
            claimBtn.style.opacity = claimedToday ? "0.5" : "1";
        }

    });

}

function renderRewardsTrack(streak, claimedToday){

    const track = document.getElementById("rewardsTrack");
    if(!track) return;

    track.innerHTML = "";

    const currentDayIndex = streak % 7; // 0-based position of the NEXT unclaimed day

    for(let i = 0; i < 7; i++){

        const reward = DAILY_REWARD_AMOUNTS[i];
        const isClaimed = i < currentDayIndex || (claimedToday && i === currentDayIndex);
        const isToday = i === currentDayIndex && !claimedToday;

        const cell = document.createElement("div");
        cell.className = "rewardDay" + (isClaimed ? " claimed" : "") + (isToday ? " today" : "");
        cell.innerHTML =
            '<div class="rewardDayLabel">Day ' + (i + 1) + '</div>' +
            '<div class="rewardDayIcon">' + (isClaimed ? "✅" : reward.gems > 0 ? "💎" : "🪙") + '</div>' +
            '<div class="rewardDayAmount">' + reward.coins + (reward.gems > 0 ? " +" + reward.gems + "💎" : "") + '</div>';

        track.appendChild(cell);
    }

}

function claimDailyReward(){

    if(!currentUser || !db) return;

    const ref = db.ref("users/" + currentUser.uid + "/private/dailyReward");

    ref.transaction(function(current){

        const state = current || { lastClaimDate: null, streak: 0 };
        const today = todayKey();

        if(state.lastClaimDate === today){
            return state; // already claimed today, no-op
        }

        const continuesStreak = state.lastClaimDate === yesterdayKey();
        const newStreak = continuesStreak ? (state.streak || 0) + 1 : 1;

        return { lastClaimDate: today, streak: newStreak };

    }).then(function(result){

        const state = result.snapshot.val();
        if(!state) return;

        const dayIndex = (state.streak - 1) % 7;
        const reward = DAILY_REWARD_AMOUNTS[dayIndex];

        db.ref("users/" + currentUser.uid + "/public").transaction(function(data){
            if(!data) return data;
            data.coins = (data.coins || 0) + reward.coins;
            data.gems = (data.gems || 0) + reward.gems;
            return data;
        }).then(function(publicResult){
            const publicData = publicResult.snapshot.val();
            if(publicData) applyHomeHeader(publicData);
        });

        renderRewardsScreen();
        refreshDailyRewardBadge();

    });

}

function refreshDailyRewardBadge(){

    const label = document.getElementById("dailyRewardsClaimLabel");
    if(!label) return;

    if(!currentUser || !db){
        label.textContent = "Claim Now";
        return;
    }

    db.ref("users/" + currentUser.uid + "/private/dailyReward/lastClaimDate").once("value").then(function(snapshot){
        const claimedToday = snapshot.val() === todayKey();
        label.textContent = claimedToday ? "Claimed ✓" : "Claim Now";
    });

}
