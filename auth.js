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

// ---- Title / star-rating tiers, shown under the player's name on Home ----
// (Purely cosmetic — derived from rating, not stored separately.)
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

function cacheProfile(data){
    try{
        localStorage.setItem("cachedProfile", JSON.stringify({
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

function loadCachedProfile(){
    try{
        const cached = JSON.parse(localStorage.getItem("cachedProfile") || "null");
        if(!cached) return;

        currentUsername = cached.username || null;
        currentUserFlag = cached.flag || "";
        currentUserRating = cached.rating || 100;
        currentUserPhotoURL = cached.photoURL || null;

        applyHomeHeader(cached);

    }catch(e){}
}

try{
    auth = firebase.auth();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
}catch(err){
    console.error("Firebase Auth failed to initialize:", err.message);
}

function countryCodeToFlag(code){
    if(!code) return "🏳️";
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => 127397 + c.charCodeAt()));
}

// Fills in every home-header/account element from a profile-shaped object
// (works for both the live Firebase snapshot and the cached-offline copy).
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

    // Account screen mirrors
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

            // Reserve the username with the uid as its value, guarded by a
            // security rule requiring this path to be currently empty — this
            // closes the race window between the check above and this write.
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
}

function initAuthListener(){

    if(!auth) return;

    auth.onAuthStateChanged(function(user){

        if(user){

            currentUser = user;

            if(db){
                const presenceRef = db.ref("presence/" + user.uid);
                presenceRef.set(true);
                presenceRef.onDisconnect().set(false);
            }

            db.ref("users/" + user.uid + "/public").once("value").then(function(snapshot){

                const data = snapshot.val() || {};

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

                if(typeof loadRecentGames === "function") loadRecentGames();
                if(typeof loadFriendsData === "function") loadFriendsData();
                if(typeof listenForChallenges === "function") listenForChallenges();
                if(typeof refreshDailyChallengeUI === "function") refreshDailyChallengeUI();
                if(typeof refreshDailyRewardBadge === "function") refreshDailyRewardBadge();

            }).catch(function(err){
                console.log("Offline — showing cached profile instead.");
            });

        }else{

            currentUser = null;

            if(!userExplicitlyLoggedOut){
                console.log("Auth check came back empty, but this wasn't an explicit logout — keeping the cached profile displayed rather than resetting to placeholders (likely a network hiccup).");
                return;
            }

            currentUsername = null;
            currentUserCountry = null;
            currentUserFlag = "";
            currentUserRating = 100;
            currentUserPhotoURL = null;
            userExplicitlyLoggedOut = false;

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

    });

}

initAuthListener();
loadCachedProfile();

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
