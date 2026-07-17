// ============================================================
// Player accounts via Firebase Authentication
// ============================================================

let auth = null;
let currentUser = null;
let currentUsername = null;
let currentUserCountry = null;
let currentUserFlag = "";
let currentUserRating = 1200;
let currentUserPhotoURL = null;

function cacheProfile(data){
    try{
        localStorage.setItem("cachedProfile", JSON.stringify({
            username: data.username || "",
            flag: data.flag || "",
            rating: data.rating || 1200,
            wins: data.wins || 0,
            winStreak: data.winStreak || 0,
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
        currentUserRating = cached.rating || 1200;
        currentUserPhotoURL = cached.photoURL || null;

        const usernameEl = document.getElementById("username");
        const ratingEl = document.getElementById("playerRating");
        const winsEl = document.getElementById("gamesWon");
        const streakEl = document.getElementById("winStreak");
        const homeAvatar = document.getElementById("homeProfileImg");
        const accountAvatar = document.getElementById("accountProfileImg");

        if(usernameEl && cached.username) usernameEl.textContent = cached.username;
        if(ratingEl) ratingEl.textContent = cached.rating;
        if(winsEl) winsEl.textContent = cached.wins;
        if(streakEl) streakEl.textContent = cached.winStreak;

        if(cached.photoURL){
            if(homeAvatar) homeAvatar.src = cached.photoURL;
            if(accountAvatar) accountAvatar.src = cached.photoURL;
        }
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

function showAccountPopup(){
    document.getElementById("accountPopup").classList.add("show");
}

function closeAccountPopup(){
    document.getElementById("accountPopup").classList.remove("show");
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

            const updates = {};
            updates["users/" + uid + "/public"] = {
                username: username,
                country: country,
                flag: countryCodeToFlag(country),
                createdAt: Date.now(),
                rating: 1200,
                wins: 0,
                losses: 0,
                draws: 0,
                winStreak: 0
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

function logOut(){
    if(auth){
        auth.signOut();
    }
}

function initAuthListener(){

    if(!auth) return;

    auth.onAuthStateChanged(function(user){

        if(user){

            currentUser = user;

            db.ref("users/" + user.uid + "/public").once("value").then(function(snapshot){

                const data = snapshot.val() || {};

                cacheProfile(data);

                currentUsername = data.username || "Player";
                currentUserCountry = data.country || "";
                currentUserFlag = data.flag || countryCodeToFlag(data.country);
                currentUserRating = data.rating || 1200;
                currentUserPhotoURL = data.photoURL || null;

                document.getElementById("loggedOutView").style.display = "none";
                document.getElementById("loggedInView").style.display = "block";
                document.getElementById("loggedInUsername").textContent =
                    currentUserFlag + " " + currentUsername;

                const usernameEl = document.getElementById("username");
                const ratingEl = document.getElementById("playerRating");
                const winsEl = document.getElementById("gamesWon");
                const avatarImg = document.getElementById("homeProfileImg");
                const accountAvatarImg = document.getElementById("accountProfileImg");

                if(usernameEl){
                    usernameEl.textContent = currentUsername;
                }
                if(ratingEl){
                    ratingEl.textContent = data.rating || 1200;
                }
                if(winsEl){
                    winsEl.textContent = data.wins || 0;
                }

                const streakEl = document.getElementById("winStreak");
                if(streakEl){
                    streakEl.textContent = data.winStreak || 0;
                }

                if(typeof loadRecentGames === "function") loadRecentGames();
                if(typeof loadFriendsData === "function") loadFriendsData();

                if(data.photoURL){
                    if(avatarImg) avatarImg.src = data.photoURL;
                    if(accountAvatarImg) accountAvatarImg.src = data.photoURL;
                }

            }).catch(function(err){
                console.log("Offline — showing cached profile instead.");
            });

        }else{

            currentUser = null;
            currentUsername = null;
            currentUserCountry = null;
            currentUserFlag = "";
            currentUserRating = 1200;
            currentUserPhotoURL = null;

            document.getElementById("loggedOutView").style.display = "block";
            document.getElementById("loggedInView").style.display = "none";

            const usernameEl = document.getElementById("username");
            const ratingEl = document.getElementById("playerRating");
            const winsEl = document.getElementById("gamesWon");

            if(usernameEl) usernameEl.textContent = "player";
            if(ratingEl) ratingEl.textContent = "—";
            if(winsEl) winsEl.textContent = "—";

            const friendsListEl = document.getElementById("friendsList");
            const requestsSectionEl = document.getElementById("friendRequestsSection");
            const searchResultEl = document.getElementById("friendSearchResult");

            if(friendsListEl) friendsListEl.innerHTML = '<p class="sub">Log in to see your friends.</p>';
            if(requestsSectionEl) requestsSectionEl.style.display = "none";
            if(searchResultEl) searchResultEl.innerHTML = "";

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
                
