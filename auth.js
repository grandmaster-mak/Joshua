// ============================================================
// Player accounts via Firebase Authentication
// ============================================================

let auth = null;
let currentUser = null;
let currentUsername = null;
let currentUserCountry = null;
let currentUserFlag = "";
let currentUserRating = 100;
let currentUserPhotoURL = null;
let authNullRecoveryTimer = null;

let hasShownAuthenticatedProfile = false;
// ---- Title / star-rating tiers, shown under the player's name on Home ----
const PLAYER_TITLE_TIERS = [
    { min: 0,    title: "Beginner",     stars: 1 },
    { min: 400,  title: "Novice",       stars: 2 },
    { min: 800,  title: "Intermediate", stars: 3 },
    { min: 1200, title: "Advanced",     stars: 4 },
    { min: 1600, title: "Elite Player", stars: 5 }
];

function getPlayerTitle(rating){
    let result = PLAYER_TITLE_TIERS[0];
    for(const tier of PLAYER_TITLE_TIERS){
        if(rating >= tier.min) result = tier;
    }
    return result;
}

function getGreeting(){
    const hour = new Date().getHours();
    if(hour < 12) return "Good morning ☀️";
    if(hour < 18) return "Good afternoon 🌤️";
    return "Good evening 🌙";
}

// Save profile data to localStorage, including uid for offline restoration
function cacheProfile(data){
    try{
        localStorage.setItem("cachedProfile", JSON.stringify({
            uid: currentUser ? currentUser.uid : null,
            username: data.username || "",
            flag: data.flag || "",
            rating: data.rating || 100,
            wins: data.wins || 0,
            winStreak: data.winStreak || 0,
            bestStreak: data.bestStreak || 0,
            losses: data.losses || 0,
            draws: data.draws || 0,
            coins: (typeof data.coins === "number") ? data.coins : 0,
            gems: (typeof data.gems === "number") ? data.gems : 0,
            puzzleRating: data.puzzleRating || 800,
            puzzleStreak: data.puzzleStreak || 0,
            photoURL: data.photoURL || null
        }));
    }catch(e){}
}

// Helper to safely read cached profile data
function loadCachedProfileData(){
    try{
        return JSON.parse(localStorage.getItem("cachedProfile") || "null");
    }catch(e){
        return null;
    }
}

// Load cached profile data and apply to UI, restoring minimal currentUser if needed.
// This is the ONLY thing that runs before the screen paints — it never
// waits on a network call, so it's always instant, good connection or none.
function loadCachedProfile(){
    const cached = loadCachedProfileData();
    if(!cached) return;

    // Restore currentUser from cache if Firebase hasn't given us one
    if(cached.uid && !currentUser){
        currentUser = { uid: cached.uid, isOfflineRestored: true };
    }

    currentUsername = cached.username || null;
    currentUserFlag = cached.flag || "";
    currentUserRating = cached.rating || 100;
    currentUserPhotoURL = cached.photoURL || null;

    applyHomeHeader(cached);

    if(cached.username){
        const loggedOutEl = document.getElementById("loggedOutView");
        const loggedInEl = document.getElementById("loggedInView");
        const usernameEl = document.getElementById("loggedInUsername");
        if(loggedOutEl) loggedOutEl.style.display = "none";
        if(loggedInEl) loggedInEl.style.display = "block";
        if(usernameEl) usernameEl.textContent = currentUserFlag + " " + currentUsername;
    }
}

function togglePasswordVisibility() {
    const input = document.getElementById("authPassword");
    const btn = document.getElementById("togglePasswordBtn");
    if (!input) return;

    if (input.type === "password") {
        input.type = "text";
        if (btn) btn.textContent = "🙈";
    } else {
        input.type = "password";
        if (btn) btn.textContent = "👁️";
    }
}

// Properly initialize Firebase Auth with persistence and fallback
async function initAuth() {
    // Show the cached profile FIRST, before touching Firebase at all —
    // same instant-display pattern already used for Recent Games and
    // the Friends list, so the username/rating/stats appear the moment
    // the app opens, network or no network.
    loadCachedProfile();

    auth = firebase.auth();
    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        console.log("✅ Local persistence enabled");
    } catch (err) {
        console.error("❌ Local persistence failed, using in-memory:", err.message);
        try {
            await auth.setPersistence(firebase.auth.Auth.Persistence.IN_MEMORY);
            console.log("✅ In-memory persistence enabled");
        } catch (err2) {
            console.error("❌ Even in-memory failed:", err2.message);
        }
    }
    initAuthListener();
}

function countryCodeToFlag(code){
    if(!code) return "🏳️";
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => 127397 + c.charCodeAt()));
}

function applyHomeHeader(data){

    const usernameEl = document.getElementById("username");
    const ratingEl = document.getElementById("playerRating");
    const ratingBadgeEl = document.getElementById("playerRatingBadge");
    const winsEl = document.getElementById("gamesWon");
    const streakEl = document.getElementById("winStreak");
    const avatarImg = document.getElementById("homeProfileImg");
    const accountAvatarImg = document.getElementById("accountProfileImg");
    const greetingEl = document.getElementById("greetingLine");
    const starsEl = document.getElementById("playerStars");
    const coinEl = document.getElementById("coinBalance");
    const gemEl = document.getElementById("gemBalance");

    if(greetingEl) greetingEl.textContent = getGreeting();
    if(usernameEl && data.username) usernameEl.textContent = data.username;
    if(ratingEl) ratingEl.textContent = data.rating || 100;
    if(ratingBadgeEl) ratingBadgeEl.textContent = data.rating || 100;
    if(winsEl) winsEl.textContent = data.wins || 0;
    if(streakEl) streakEl.textContent = data.winStreak || 0;
    if(coinEl) coinEl.textContent = (typeof data.coins === "number") ? data.coins : 0;
    if(gemEl) gemEl.textContent = (typeof data.gems === "number") ? data.gems : 0;

    const tier = getPlayerTitle(data.rating || 100);
    if(starsEl){
        starsEl.innerHTML = "★".repeat(tier.stars) + "☆".repeat(5 - tier.stars) + '<span class="eliteLabel">' + tier.title + '</span>';
        starsEl.style.display = "block";
    }

    const totalGames = (data.wins || 0) + (data.losses || 0) + (data.draws || 0);
    const winRateDeltaEl = document.getElementById("winRateDelta");
    if(winRateDeltaEl){
        winRateDeltaEl.textContent = totalGames > 0 ? Math.round((data.wins || 0) / totalGames * 100) + "% Win Rate" : "";
    }

    const bestStreakDeltaEl = document.getElementById("bestStreakDelta");
    if(bestStreakDeltaEl){
        bestStreakDeltaEl.textContent = data.bestStreak ? "Best: " + data.bestStreak : "";
    }

    if(data.photoURL){
        if(avatarImg) avatarImg.src = data.photoURL;
        if(accountAvatarImg) accountAvatarImg.src = data.photoURL;
    }

    const accountRatingEl = document.getElementById("accountRatingValue");
    const accountWinsEl = document.getElementById("accountWinsValue");
    const accountStreakEl = document.getElementById("accountStreakValue");
    const winRateSubtitleEl = document.getElementById("winRateSubtitle");
    const bestStreakSubtitleEl = document.getElementById("bestStreakSubtitle");
    const puzzleRatingEl = document.getElementById("puzzleRatingValue");
    const puzzleStreakEl = document.getElementById("puzzleStreakValue");

    if(accountRatingEl) accountRatingEl.textContent = data.rating || 100;
    if(accountWinsEl) accountWinsEl.textContent = data.wins || 0;
    if(accountStreakEl) accountStreakEl.textContent = data.winStreak || 0;
    if(winRateSubtitleEl) winRateSubtitleEl.textContent = totalGames > 0 ? Math.round((data.wins || 0) / totalGames * 100) + "% Win Rate (" + totalGames + " games)" : "No games yet";
    if(bestStreakSubtitleEl) bestStreakSubtitleEl.textContent = data.bestStreak ? "Best streak: " + data.bestStreak : "";
    if(puzzleRatingEl) puzzleRatingEl.textContent = data.puzzleRating || 800;
    if(puzzleStreakEl) puzzleStreakEl.textContent = data.puzzleStreak || 0;

    if(typeof renderAchievementsGrid === "function") renderAchievementsGrid("accountAchievementsGrid", data.achievements);
}

function openCurrencyShop(kind){
    showInfoPopup(
        kind === "gems" ? "💎 Get Gems" : "🪙 Get Coins",
        "The store isn't open yet — check back soon!"
    );
}

function openNotifications(){
    showInfoPopup("🔔 Notifications", "You're all caught up.");
}

function signUp(){

    if(!auth){
        document.getElementById("authStatus").textContent = "Could not connect to account system.";
        return;
    }

    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const username = document.getElementById("authUsername").value.trim();
const country = document.getElementById("authCountry").value;
if(username.length > 10){
    document.getElementById("authStatus").textContent = "Username must be 10 characters or less.";
    return;
}
    const preferredLanguage = document.getElementById("authLanguage").value;
    if(typeof applyLanguage === "function") applyLanguage(preferredLanguage);
    if(!email || !password || !username || !country){
        document.getElementById("authStatus").textContent = "Please fill in all fields, including country.";
        return;
    }

    document.getElementById("authStatus").textContent = "Checking username...";

    db.ref("usernames/" + username).once("value")
        .then(function(nameSnap){

            if(nameSnap.exists()){
                document.getElementById("authStatus").textContent = "That username is already taken.";
                return Promise.reject("username_taken");
            }

            document.getElementById("authStatus").textContent = "Creating account...";

            return auth.createUserWithEmailAndPassword(email, password);

        })
        .then(function(userCredential){

            const uid = userCredential.user.uid;

            const updates = {};
            updates["users/" + uid + "/public"] = {
                username: username,
                country: country,
                flag: countryCodeToFlag(country),
                createdAt: Date.now(),
                rating: 100,
                wins: 0,
                losses: 0,
                draws: 0,
                winStreak: 0,
                bestStreak: 0,
                coins: 100,
                gems: 5,
                puzzleRating: 800,
                puzzleStreak: 0
            };
            // ===== ADD KINGDOM INITIALIZATION =====
            updates["users/" + uid + "/kingdom"] = {
                currentLevel: 'village',
                consecutiveWins: 0,
                totalWins: 0
            };
            // ===== END KINGDOM INITIALIZATION =====
            updates["usernames/" + username] = uid;

            return db.ref().update(updates);

        })
        .then(function(){
            document.getElementById("authStatus").textContent = "Account created! You're now logged in.";
        })
        .catch(function(error){
            if(error === "username_taken") return;
            document.getElementById("authStatus").textContent = "Error: " + error.message;
        });

}

function logIn(){

    if(!auth){
        document.getElementById("authStatus").textContent = "Could not connect to account system.";
        return;
    }

    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const preferredLanguage = document.getElementById("authLanguage").value;
    if(typeof applyLanguage === "function") applyLanguage(preferredLanguage);

    if(!email || !password){
        document.getElementById("authStatus").textContent = "Please enter your email and password.";
        return;
    }

    document.getElementById("authStatus").textContent = "Logging in...";

    auth.signInWithEmailAndPassword(email, password)
        .catch(function(error){
            document.getElementById("authStatus").textContent = "Error: " + error.message;
        });

}

let userExplicitlyLoggedOut = false;

function logOut(){
    if(auth && currentUser && db){
        db.ref("presence/" + currentUser.uid).set(false);
    }
    if(auth){
        userExplicitlyLoggedOut = true;
        auth.signOut();
    }
    // Clear cached profile so it won't be restored after logout
    try {
        localStorage.removeItem("cachedProfile");
    } catch(e) {}
}

// Fetches the live profile in the background and quietly updates the UI
// whenever (and if) it actually arrives — this NEVER blocks or delays
// what's already on screen. The cached profile (applied synchronously,
// with zero wait, the moment Firebase confirms a session) is what the
// person sees immediately; this just refines it once real data shows up,
// however long that takes — 200ms on good wifi, much longer on bad
// network, or never on no network at all. Either way the UI never sits
// waiting on it.
function refreshLiveProfileInBackground(uid){

    db.ref("users/" + uid + "/public").once("value").then(snapshot => {
    const data = snapshot.val();

    if (!data || !data.username) {
        console.log("Live profile is incomplete");
        return;
    }

    cacheProfile(data);

        currentUsername = data.username || "Player";
        currentUserCountry = data.country || "";
        currentUserFlag = data.flag || countryCodeToFlag(data.country);
        currentUserRating = data.rating || 100;
        currentUserPhotoURL = data.photoURL || null;

        document.getElementById("loggedOutView").style.display = "none";
        document.getElementById("loggedInView").style.display = "block";
        document.getElementById("loggedInUsername").textContent =
            currentUserFlag + " " + currentUsername;

        applyHomeHeader(data);

        if(typeof listenForChallenges === "function") listenForChallenges();
        if(typeof refreshDailyChallengeUI === "function") refreshDailyChallengeUI();
        if(typeof refreshDailyRewardBadge === "function") refreshDailyRewardBadge();

        // ---- Handle pending challenge after login ----
        if(typeof handlePendingChallenge === "function"){
            handlePendingChallenge();
        }

        // ---- Check for a pending challenge link ----
        if(typeof checkForIncomingChallenge === "function") checkForIncomingChallenge();

    }).catch(function(err){
        // No live data arrived (offline, poor network, or a genuine
        // error) — the cached profile is already showing, so there's
        // nothing further to do here.
        console.log("Live profile refresh did not complete:", err && err.message);
    });

}

function initAuthListener(){

    if(!auth) return;

    auth.onAuthStateChanged(function(user){

        if(user){
            // User is logged in (or Firebase restored session)
            clearTimeout(authNullRecoveryTimer);
            userExplicitlyLoggedOut = false;
            currentUser = user;

            // Apply whatever's cached RIGHT NOW, synchronously, no
            // network wait of any kind — this is what makes the account
            // screen, username, and everything else correct the instant
            // the app opens, regardless of connection quality.
            const cached = loadCachedProfileData();
            if(cached){
                applyHomeHeader(cached);
                const loggedOutEl = document.getElementById("loggedOutView");
                const loggedInEl = document.getElementById("loggedInView");
                const usernameEl = document.getElementById("loggedInUsername");
                if(loggedOutEl) loggedOutEl.style.display = "none";
                if(loggedInEl) loggedInEl.style.display = "block";
                if(usernameEl) usernameEl.textContent = (cached.flag || "") + " " + (cached.username || "");
            }

            if(db){
                const presenceRef = db.ref("presence/" + user.uid);
                presenceRef.set(true);
                presenceRef.onDisconnect().set(false);
            }

            // ===== LOAD KINGDOM DATA (after login) =====
            if (typeof loadKingdomData === "function") {
                loadKingdomData(user.uid);
            }
            if (typeof listenKingdomUpdates === "function") {
                listenKingdomUpdates(user.uid);
            }
            // ===== END KINGDOM LOAD =====

            if(typeof loadRecentGames === "function") loadRecentGames();
            if(typeof loadFriendRequests === "function") loadFriendRequests();

            // The real network fetch happens in the background and only
            // ever REFINES what's already showing — it can take as long
            // as it needs to and the UI never waits on it.
            refreshLiveProfileInBackground(user.uid);

        } else {
    clearTimeout(authNullRecoveryTimer);

    // Same principle as above: apply cache immediately, no delay,
    // whenever there's no confirmed session yet — Firebase can report
    // "no user yet" for a while on bad network before it resolves the
    // real (cached, offline-capable) session, and the person should
    // never see "player" or a logged-out screen during that gap if a
    // cached profile already exists.
    if(!userExplicitlyLoggedOut){
        const immediateCached = loadCachedProfileData();
        if(immediateCached && immediateCached.uid){
            loadCachedProfile();
        }
    }

    authNullRecoveryTimer = setTimeout(function(){

        if(auth.currentUser || currentUser) return;

        if(!userExplicitlyLoggedOut){
            const cached = loadCachedProfileData();
            if(cached && cached.uid){
                console.log("No auth session, but cached profile exists — restoring.");
                loadCachedProfile();
            } else {
                console.log("No auth session and no cached profile — showing login.");
                showLoggedOutState();
            }
        } else {
            console.log("User explicitly logged out — showing login.");
            showLoggedOutState();
        }

    }, 2500);

    return;
}
    });
}

function showLoggedOutState(){
    currentUser = null;
    currentUsername = null;
    currentUserCountry = null;
    currentUserFlag = "";
    currentUserRating = 100;
    currentUserPhotoURL = null;
    // Do NOT reset userExplicitlyLoggedOut here! It should remain true after explicit logout.

    // ---- Check for a pending challenge link ----
    if(typeof checkForIncomingChallenge === "function") checkForIncomingChallenge();

    document.getElementById("loggedOutView").style.display = "block";
    document.getElementById("loggedInView").style.display = "none";

    const usernameEl = document.getElementById("username");
    const ratingEl = document.getElementById("playerRating");
    const ratingBadgeEl = document.getElementById("playerRatingBadge");
    const winsEl = document.getElementById("gamesWon");
    const starsEl = document.getElementById("playerStars");

    if(usernameEl) usernameEl.textContent = "player";
    if(ratingEl) ratingEl.textContent = "—";
    if(ratingBadgeEl) ratingBadgeEl.textContent = "—";
    if(winsEl) winsEl.textContent = "—";
    if(starsEl) starsEl.style.display = "none";

    const friendsListEl = document.getElementById("friendsList");
    const requestsSectionEl = document.getElementById("friendRequestsSection");
    const searchResultEl = document.getElementById("friendSearchResult");
    const onlineFriendsStripEl = document.getElementById("onlineFriendsStrip");

    if(friendsListEl) friendsListEl.innerHTML = '<p class="sub">Log in to see your friends.</p>';
    if(requestsSectionEl) requestsSectionEl.style.display = "none";
    if(searchResultEl) searchResultEl.innerHTML = "";
    if(onlineFriendsStripEl) onlineFriendsStripEl.innerHTML = '<p class="sub">Log in to see online friends.</p>';
}

// ---- Language selector on login screen ----
const authLanguageSelect = document.getElementById("authLanguage");
if(authLanguageSelect){
    authLanguageSelect.value = (typeof currentLanguage !== "undefined") ? currentLanguage : "en";
    authLanguageSelect.addEventListener("change", function(){
        const lang = this.value;
        if(typeof applyLanguage === "function") applyLanguage(lang);
        const settingLang = document.getElementById("settingLanguage");
        if(settingLang) settingLang.value = lang;
    });
}

function handleProfilePhotoSelect(event){

    const file = event.target.files[0];
    if(!file) return;

    if(!currentUser || !db){
        alert("Please log in first.");
        return;
    }

    if(!file.type.startsWith("image/")){
        alert("Please choose an image file.");
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e){

        const img = new Image();

        img.onload = function(){

            const size = 200;
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");

            const scale = Math.max(size / img.width, size / img.height);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            const offsetX = (size - drawW) / 2;
            const offsetY = (size - drawH) / 2;

            ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

            db.ref("users/" + currentUser.uid + "/public/photoURL").set(dataUrl)
                .then(function(){
                    currentUserPhotoURL = dataUrl;
                    const homeAvatar = document.getElementById("homeProfileImg");
                    const accountAvatar = document.getElementById("accountProfileImg");
                    if(homeAvatar) homeAvatar.src = dataUrl;
                    if(accountAvatar) accountAvatar.src = dataUrl;
                })
                .catch(function(err){
                    alert("Could not save photo: " + err.message);
                });

        };

        img.src = e.target.result;

    };

    reader.readAsDataURL(file);

}

// Start the auth system
initAuth();
