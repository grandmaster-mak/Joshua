// ============================================================
// Player accounts via Firebase Authentication
// ============================================================

let auth = null;
let currentUser = null;
let currentUsername = null;
let currentUserCountry = null;
let currentUserFlag = "";

try{
    auth = firebase.auth();
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

    document.getElementById("authStatus").textContent = "Creating account...";

    auth.createUserWithEmailAndPassword(email, password)
        .then(function(userCredential){

            const uid = userCredential.user.uid;

            return db.ref("users/" + uid).set({
                username: username,
                country: country,
                flag: countryCodeToFlag(country),
                createdAt: Date.now(),
                rating: 1200,
                wins: 0,
                losses: 0,
                draws: 0
            });

        })
        .then(function(){
            document.getElementById("authStatus").textContent = "Account created! You're now logged in.";
        })
        .catch(function(error){
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

            db.ref("users/" + user.uid).once("value").then(function(snapshot){

                const data = snapshot.val() || {};

                currentUsername = data.username || "Player";
                currentUserCountry = data.country || "";
                currentUserFlag = data.flag || countryCodeToFlag(data.country);

                document.getElementById("loggedOutView").style.display = "none";
                document.getElementById("loggedInView").style.display = "block";
                document.getElementById("loggedInUsername").textContent =
                    currentUserFlag + " " + currentUsername;

                const usernameEl = document.getElementById("username");
                const ratingEl = document.getElementById("playerRating");
                const winsEl = document.getElementById("gamesWon");
                const avatarImg = document.getElementById("homeProfileImg");

                if(usernameEl){
                    usernameEl.textContent = currentUsername;
                }
                if(ratingEl){
                    ratingEl.textContent = data.rating || 1200;
                }
                if(winsEl){
                    winsEl.textContent = data.wins || 0;
                }
                if(avatarImg && data.photoURL){
                    avatarImg.src = data.photoURL;
                }

            });

        }else{

            currentUser = null;
            currentUsername = null;
            currentUserCountry = null;
            currentUserFlag = "";

            document.getElementById("loggedOutView").style.display = "block";
            document.getElementById("loggedInView").style.display = "none";

            const usernameEl = document.getElementById("username");
            const ratingEl = document.getElementById("playerRating");
            const winsEl = document.getElementById("gamesWon");

            if(usernameEl) usernameEl.textContent = "player";
            if(ratingEl) ratingEl.textContent = "—";
            if(winsEl) winsEl.textContent = "—";

        }
const streakEl = document.getElementById("winStreak");
if(streakEl){
    streakEl.textContent = data.winStreak || 0;
}

if(typeof loadRecentGames === "function") loadRecentGames();
    });

}

initAuthListener();
                    
