// ============================================================
// Player accounts via Firebase Authentication
// Requires Email/Password sign-in to be enabled in the
// Firebase Console under Authentication → Sign-in method.
// ============================================================

let auth = null;
let currentUser = null;
let currentUsername = null;

try{
    auth = firebase.auth();
}catch(err){
    console.error("Firebase Auth failed to initialize:", err.message);
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

    if(!email || !password || !username){
        document.getElementById("authStatus").textContent = "Please fill in email, password, and username.";
        return;
    }

    document.getElementById("authStatus").textContent = "Creating account...";

    auth.createUserWithEmailAndPassword(email, password)
        .then(function(userCredential){

            const uid = userCredential.user.uid;

            return db.ref("users/" + uid).set({
                username: username,
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

// Fires automatically whenever login state changes — on page load,
// after signup, after login, and after logout.
function initAuthListener(){

    if(!auth) return;

    auth.onAuthStateChanged(function(user){

        if(user){

            currentUser = user;

            db.ref("users/" + user.uid + "/username").once("value").then(function(snapshot){

                currentUsername = snapshot.val() || "Player";

                document.getElementById("loggedOutView").style.display = "none";
                document.getElementById("loggedInView").style.display = "block";
                document.getElementById("loggedInUsername").textContent = "Logged in as: " + currentUsername;

            });

        }else{

            currentUser = null;
            currentUsername = null;

            document.getElementById("loggedOutView").style.display = "block";
            document.getElementById("loggedInView").style.display = "none";

        }

    });

}

initAuthListener();
