// ============================================================
// i18n – Language system for the whole app
// ============================================================

const translations = {
  en: {
    // Navigation
    "nav.home": "Home",
    "nav.friends": "Friends",
    "nav.kingdom": "Kingdom",
    "nav.account": "Account",

    // Home screen
    "home.greetingMorning": "Good morning ☀️",
    "home.greetingAfternoon": "Good afternoon ☀️",
    "home.greetingEvening": "Good evening 🌙",
    "home.hello": "Hello",
    "home.rating": "Rating",
    "home.online": "Online",
    "home.settings": "Settings",
    "home.playNow": "Play Now",
    "home.playAI": "Play vs AI",
    "home.playOnline": "Play Online",
    "home.yourStats": "Your Stats",
    "home.recentGames": "Recent Games",
    "home.viewAll": "View All",
    "home.noGames": "No games played yet.",
    "home.tournaments": "Tournaments",
    "home.puzzles": "Puzzles",
    "home.leaderboards": "Leaderboards",
    "home.dailyRewards": "Daily Rewards",
    "home.playCoach": "Play Coach",
    "home.lessons": "Lessons",
    "home.analysis": "Analysis",
    "home.onlineFriends": "Online Friends",

    // Friends screen
    "friends.title": "Friends",
    "friends.subtitle": "Find people by their username and send a friend request.",
    "friends.searchPlaceholder": "Search by username",
    "friends.yourFriends": "Your Friends",
    "friends.friendRequests": "Friend Requests",
    "friends.noFriends": "Log in to see your friends.",

    // Account screen
    "account.title": "Account",
    "account.loggedOut": "Sign in to save your progress and rating",
    "account.email": "Email",
    "account.password": "Password",
    "account.country": "Select Country",
    "account.signUp": "Sign Up",
    "account.logIn": "Log In",
    "account.rating": "Rating",
    "account.gamesWon": "Games Won",
    "account.winStreak": "Win Streak",
    "account.puzzleRating": "Puzzle Rating",

    // Kingdom screen
    "kingdom.title": "My Kingdom",

    // Settings
    "settings.title": "Settings",
    "settings.accent": "App Accent Colour",
    "settings.boardColours": "Board Colours",
    "settings.gameplay": "Gameplay",
    "settings.sounds": "Sounds",
    "settings.language": "Language",
    "settings.reset": "Reset to Defaults"
  },
  fr: {
    "nav.home": "Accueil",
    "nav.friends": "Amis",
    "nav.kingdom": "Royaume",
    "nav.account": "Compte",

    "home.greetingMorning": "Bonjour ☀️",
    "home.greetingAfternoon": "Bon après-midi ☀️",
    "home.greetingEvening": "Bonsoir 🌙",
    "home.hello": "Bonjour",
    "home.rating": "Classement",
    "home.online": "En ligne",
    "home.settings": "Paramètres",
    "home.playNow": "Jouer maintenant",
    "home.playAI": "Jouer contre l'IA",
    "home.playOnline": "Jouer en ligne",
    "home.yourStats": "Vos statistiques",
    "home.recentGames": "Parties récentes",
    "home.viewAll": "Voir tout",
    "home.noGames": "Aucune partie jouée.",
    "home.tournaments": "Tournois",
    "home.puzzles": "Puzzles",
    "home.leaderboards": "Classements",
    "home.dailyRewards": "Récompenses quotidiennes",
    "home.playCoach": "Jouer avec le coach",
    "home.lessons": "Leçons",
    "home.analysis": "Analyse",
    "home.onlineFriends": "Amis en ligne",

    "friends.title": "Amis",
    "friends.subtitle": "Trouvez des personnes par nom d'utilisateur et envoyez une demande d'ami.",
    "friends.searchPlaceholder": "Rechercher par nom d'utilisateur",
    "friends.yourFriends": "Vos amis",
    "friends.friendRequests": "Demandes d'ami",
    "friends.noFriends": "Connectez-vous pour voir vos amis.",

    "account.title": "Compte",
    "account.loggedOut": "Connectez-vous pour sauvegarder votre progression et votre classement",
    "account.email": "E-mail",
    "account.password": "Mot de passe",
    "account.country": "Sélectionnez un pays",
    "account.signUp": "S'inscrire",
    "account.logIn": "Se connecter",
    "account.rating": "Classement",
    "account.gamesWon": "Parties gagnées",
    "account.winStreak": "Série de victoires",
    "account.puzzleRating": "Classement puzzles",

    "kingdom.title": "Mon Royaume",

    "settings.title": "Paramètres",
    "settings.accent": "Couleur d'accent de l'application",
    "settings.boardColours": "Couleurs de l'échiquier",
    "settings.gameplay": "Jeu",
    "settings.sounds": "Sons",
    "settings.language": "Langue",
    "settings.reset": "Réinitialiser les paramètres"
  },
  es: {
    // Add Spanish translations here (same keys)
  },
  pt: {
    // Add Portuguese translations here (same keys)
  }
};

let currentLanguage = 'en';

function t(key) {
    return (translations[currentLanguage] && translations[currentLanguage][key]) || translations.en[key] || key;
}

function applyLanguage(lang) {
    currentLanguage = lang;
    try {
        const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
        settings.language = lang;
        localStorage.setItem('appSettings', JSON.stringify(settings));
    } catch(e) {}

    // Update text
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
}

function getStoredLanguage() {
    try {
        const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
        return settings.language || 'en';
    } catch(e) {
        return 'en';
    }
}

// Apply the stored language as soon as the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    currentLanguage = getStoredLanguage();
    applyLanguage(currentLanguage);
});
