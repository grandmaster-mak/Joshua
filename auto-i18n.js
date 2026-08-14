// ============================================================
// auto-i18n.js – Automatically adds data-i18n attributes to
// elements whose visible text matches the dictionary below.
// ============================================================

const englishToKey = {
  // Navigation
  "Home": "nav.home",
  "Friends": "nav.friends",
  "Kingdom": "nav.kingdom",
  "Account": "nav.account",

  // Home screen
  "Good morning ☀️": "home.greetingMorning",
  "Good afternoon 🌤️": "home.greetingAfternoon",
  "Good evening 🌙": "home.greetingEvening",
  "Hello": "home.hello",
  "Rating": "home.rating",
  "Online": "home.online",
  "Settings": "home.settings",
  "Play Now": "home.playNow",
  "Play vs AI": "home.playAI",
  "Play Online": "home.playOnline",
  "Your Stats": "home.yourStats",
  "Recent Games": "home.recentGames",
  "View All": "home.viewAll",
  "No games played yet.": "home.noGames",
  "Tournaments": "home.tournaments",
  "Puzzles": "home.puzzles",
  "Leaderboards": "home.leaderboards",
  "Daily Rewards": "home.dailyRewards",
  "Play Coach": "home.playCoach",
  "Lessons": "home.lessons",
  "Analysis": "home.analysis",
  "Online Friends": "home.onlineFriends",
  "Active now": "home.activeNow",
  "Customise": "home.customise",
  "Two players, one device": "home.playNowDesc",
  "Challenge the computer": "home.playAIDesc",
  "Find an opponent automatically": "home.playOnlineDesc",
  "Win one ranked game today": "home.dailyChallengeDesc",

  // Friends screen
  "Find people by their username and send a friend request.": "friends.subtitle",
  "Search by username": "friends.searchPlaceholder",
  "Search": "friends.search",
  "Friend Requests": "friends.friendRequests",
  "Your Friends": "friends.yourFriends",
  "Recently Active ▾": "friends.recentlyActive",
  "Log in to see your friends.": "friends.noFriends",
  "Challenge a Friend": "friends.challengeFriend",
  "Add more friends": "friends.addMore",
  "The more friends you have, the better your games get!": "friends.addMoreDesc",
  "Find Friends": "friends.findFriends",

  // Account screen
  "Sign in to save your progress and rating": "account.loggedOut",
  "Email": "account.email",
  "Password": "account.password",
  "Select Country": "account.country",
  "Sign Up": "account.signUp",
  "Log In": "account.logIn",
  "Games Won": "account.gamesWon",
  "Win Streak": "account.winStreak",
  "Puzzle Rating": "account.puzzleRating",
  "Change Profile Photo": "account.changePhoto",
  "Puzzle streak:": "account.puzzleStreakLabel",
  "Awards": "account.awards",
  "Keep playing to earn awards!": "account.awardsTeaser",
  "Play games, solve puzzles and complete lessons to unlock achievements.": "account.awardsDesc",
  "View Awards": "account.viewAwards",
  "Quick Access": "account.quickAccess",
  "Solve puzzles and improve your skills": "account.puzzlesDesc",
  "Learn from the best and level up": "account.lessonsDesc",
  "Get live advice while you play": "account.coachDesc",
  "Compete and win exciting prizes": "account.tournamentsDesc",
  "Explore positions with engine eval": "account.analysisDesc",
  "Manage your friends list": "account.friendsDesc",

  // Kingdom screen
  "My Kingdom": "kingdom.title",
  "Current": "kingdom.current",
  "Consecutive Wins": "kingdom.consecutiveWins",
  "Wins Needed": "kingdom.winsNeeded",
  "Kingdom Journey": "kingdom.journey",
  "Ruler of": "kingdom.rulerOf",

  // Settings screen
  "App Accent Colour": "settings.accent",
  "Board Colours": "settings.boardColours",
  "Gameplay": "settings.gameplay",
  "Sounds": "settings.sounds",
  "Language": "settings.language",
  "Reset to Defaults": "settings.reset",
  "Last-move highlight": "settings.lastMoveHighlight",
  "Auto-promote to Queen": "settings.autoPromote",
  "Confirm before resigning": "settings.confirmResign",
  "Board flip (offline games)": "settings.boardFlip",
  "Piece move sound": "settings.moveSound",
  "Check sound": "settings.checkSound",
  "Checkmate sound": "settings.checkmateSound",
  "Background music": "settings.bgm",

  // Challenge screen
  "Create a game and send a link to any friend": "challenge.subtitle",
  "Your colour": "challenge.yourColor",
  "White": "challenge.white",
  "Black": "challenge.black",
  "Time control": "challenge.timeControl",
  "Create Challenge Link": "challenge.create",
  "Secure link": "challenge.secureLink",
  "Only your friend with the link can join": "challenge.secureLinkDesc",
  "Fair game": "challenge.fairGame",
  "Same time control for both players": "challenge.fairGameDesc",
  "Easy to share": "challenge.easyShare",
  "Share via any app you prefer": "challenge.easyShareDesc",
  "Share this link with your friend": "challenge.shareLink",
  "Copy Link": "challenge.copyLink",
  "Share via WhatsApp": "challenge.whatsapp",
  "Your friend can open this link to join the challenge.": "challenge.infoNote"
};

function autoAddI18n() {
  // Handle leaf elements with text
  document.querySelectorAll('body *').forEach(el => {
    if (el.children.length === 0) {
      const text = (el.textContent || '').trim();
      if (text && englishToKey[text]) {
        el.setAttribute('data-i18n', englishToKey[text]);
      }
    }
  });

  // Handle placeholders
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    const ph = el.getAttribute('placeholder');
    if (ph && englishToKey[ph]) {
      el.setAttribute('data-i18n-placeholder', englishToKey[ph]);
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  autoAddI18n();
  if (typeof applyLanguage === 'function') {
    applyLanguage(getStoredLanguage());
  }
});
