// ============================================================
// SCRIPT.JS - Core Chess Engine & UI
// ============================================================

// ============================================================
// APP STATE
// ============================================================
let currentPage = 'home';
let currentUser = null;
let currentUsername = 'Guest';
let currentRating = 1200;

// ============================================================
// NAVIGATION
// ============================================================
function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.top-nav .nav-links a').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    document.getElementById('homePage').style.display = page === 'home' ? 'block' : 'none';
    document.getElementById('gamePage').classList.toggle('active', page === 'play');
    document.getElementById('accountPage').classList.toggle('active', page === 'account');

    if (page === 'home') renderHome();
    if (page === 'account') renderAccount();
}

function toggleMenu() {
    const links = document.getElementById('navLinks');
    links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ============================================================
// RENDER HOME
// ============================================================
function renderHome() {
    const stats = JSON.parse(localStorage.getItem('chessStats') || '{"rating":1200,"wins":0,"losses":0,"draws":0,"streak":0}');
    document.getElementById('homeRating').textContent = stats.rating || 1200;
    document.getElementById('homeWins').textContent = stats.wins || 0;
    document.getElementById('homeLosses').textContent = stats.losses || 0;
    document.getElementById('homeDraws').textContent = stats.draws || 0;
    document.getElementById('homeStreak').textContent = stats.streak || 0;
    document.getElementById('navRating').textContent = '♟ ' + (stats.rating || 1200);
}

function renderAccount() {
    const stats = JSON.parse(localStorage.getItem('chessStats') || '{"rating":1200,"wins":0,"losses":0,"draws":0,"puzzleRating":800}');
    document.getElementById('profileName').textContent = currentUsername || 'Player';
    document.getElementById('profileRating').textContent = 'Rating: ' + (stats.rating || 1200);
    document.getElementById('profileWins').textContent = stats.wins || 0;
    document.getElementById('profileLosses').textContent = stats.losses || 0;
    document.getElementById('profileDraws').textContent = stats.draws || 0;
    document.getElementById('profilePuzzleRating').textContent = stats.puzzleRating || 800;
}

// ============================================================
// GAME ENGINE
// ============================================================
let gameState = {
    pieces: [],
    currentPlayer: 'white',
    selected: null,
    possibleMoves: [],
    moveHistory: [],
    gameOver: false,
    timer: null,
    whiteTime: 600,
    blackTime: 600,
    isOnline: false,
    myColor: 'white'
};

function startGame(mode) {
    if (mode === 'ai' || mode === 'friend') {
        openModal('timeControlModal');
        window._pendingMode = mode;
    } else if (mode === 'online') {
        openModal('timeControlModal');
        window._pendingMode = 'online';
    }
}

function setTimeControl(seconds) {
    closeModal('timeControlModal');
    const mode = window._pendingMode || 'friend';
    initGame(seconds, mode);
}

function initGame(timeControl, mode) {
    navigateTo('play');
    gameState.whiteTime = timeControl;
    gameState.blackTime = timeControl;
    gameState.isOnline = mode === 'online';
    gameState.myColor = mode === 'online' ? 'white' : 'white';
    gameState.moveHistory = [];
    gameState.gameOver = false;
    gameState.selected = null;
    gameState.possibleMoves = [];

    gameState.pieces = [
        ['bR','bN','bB','bQ','bK','bB','bN','bR'],
        ['bP','bP','bP','bP','bP','bP','bP','bP'],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['wP','wP','wP','wP','wP','wP','wP','wP'],
        ['wR','wN','wB','wQ','wK','wB','wN','wR']
    ];

    renderBoard();
    updateUI();
    startClock();

    if (mode === 'ai') {
        document.getElementById('topName').textContent = 'Computer';
        document.getElementById('topRating').textContent = '(AI)';
        document.getElementById('bottomName').textContent = 'You';
        document.getElementById('bottomRating').textContent = '(' + currentRating + ')';
    } else if (mode === 'online') {
        document.getElementById('topName').textContent = 'Opponent';
        document.getElementById('topRating').textContent = '(?)';
        document.getElementById('bottomName').textContent = 'You';
        document.getElementById('bottomRating').textContent = '(' + currentRating + ')';
        document.getElementById('gameChatContainer').style.display = 'flex';
    } else {
        document.getElementById('topName').textContent = 'Black';
        document.getElementById('topRating').textContent = '';
        document.getElementById('bottomName').textContent = 'White';
        document.getElementById('bottomRating').textContent = '';
        document.getElementById('gameChatContainer').style.display = 'none';
    }
}

function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    const flipped = gameState.isOnline && gameState.myColor === 'black';

    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const r = flipped ? 7 - i : i;
            const c = flipped ? 7 - j : j;
            const sq = document.createElement('div');
            sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
            sq.dataset.row = r;
            sq.dataset.col = c;

            if (gameState.selected && gameState.selected.r === r && gameState.selected.c === c) {
                sq.classList.add('selected');
            }

            if (gameState.possibleMoves.some(m => m.r === r && m.c === c)) {
                const isCapture = gameState.pieces[r][c] !== '';
                sq.classList.add(isCapture ? 'possible-capture' : 'possible');
            }

            const piece = gameState.pieces[r][c];
            if (piece) {
                const img = document.createElement('img');
                img.src = 'pieces/' + piece + '.svg';
                img.className = 'piece';
                img.alt = piece;
                sq.appendChild(img);
            }

            sq.onclick = () => clickSquare(r, c);
            board.appendChild(sq);
        }
    }
}

function clickSquare(r, c) {
    if (gameState.gameOver) return;
    if (gameState.isOnline && gameState.currentPlayer !== gameState.myColor) return;

    const piece = gameState.pieces[r][c];

    if (!gameState.selected) {
        if (!piece) return;
        if (gameState.currentPlayer === 'white' && !piece.startsWith('w')) return;
        if (gameState.currentPlayer === 'black' && !piece.startsWith('b')) return;
        gameState.selected = { r, c };
        gameState.possibleMoves = getLegalMoves(piece, r, c);
        renderBoard();
        return;
    }

    const isTarget = gameState.possibleMoves.some(m => m.r === r && m.c === c);
    if (!isTarget) {
        if (piece && ((gameState.currentPlayer === 'white' && piece.startsWith('w')) ||
            (gameState.currentPlayer === 'black' && piece.startsWith('b')))) {
            gameState.selected = { r, c };
            gameState.possibleMoves = getLegalMoves(piece, r, c);
            renderBoard();
            return;
        }
        gameState.selected = null;
        gameState.possibleMoves = [];
        renderBoard();
        return;
    }

    const fromR = gameState.selected.r;
    const fromC = gameState.selected.c;
    const movingPiece = gameState.pieces[fromR][fromC];
    const captured = gameState.pieces[r][c];

    gameState.pieces[r][c] = movingPiece;
    gameState.pieces[fromR][fromC] = '';

    // Castling
    if (movingPiece === 'wK' && fromC === 4 && r === 7 && c === 6) {
        gameState.pieces[7][5] = gameState.pieces[7][7];
        gameState.pieces[7][7] = '';
    }
    if (movingPiece === 'wK' && fromC === 4 && r === 7 && c === 2) {
        gameState.pieces[7][3] = gameState.pieces[7][0];
        gameState.pieces[7][0] = '';
    }
    if (movingPiece === 'bK' && fromC === 4 && r === 0 && c === 6) {
        gameState.pieces[0][5] = gameState.pieces[0][7];
        gameState.pieces[0][7] = '';
    }
    if (movingPiece === 'bK' && fromC === 4 && r === 0 && c === 2) {
        gameState.pieces[0][3] = gameState.pieces[0][0];
        gameState.pieces[0][0] = '';
    }

    // Promotion
    if (movingPiece === 'wP' && r === 0) {
        openModal('promotionModal');
        window._pendingPromotion = { r, c, color: 'w' };
        gameState.selected = null;
        gameState.possibleMoves = [];
        renderBoard();
        return;
    }
    if (movingPiece === 'bP' && r === 7) {
        openModal('promotionModal');
        window._pendingPromotion = { r, c, color: 'b' };
        gameState.selected = null;
        gameState.possibleMoves = [];
        renderBoard();
        return;
    }

    finishMove(movingPiece, fromR, fromC, r, c, captured);
}

function choosePromotion(piece) {
    closeModal('promotionModal');
    const promo = window._pendingPromotion;
    if (!promo) return;
    gameState.pieces[promo.r][promo.c] = promo.color + piece;
    window._pendingPromotion = null;
    finishMove(gameState.pieces[promo.r][promo.c], promo.r, promo.c, promo.r, promo.c, null);
}

function finishMove(movingPiece, fromR, fromC, toR, toC, captured) {
    const notation = getMoveNotation(movingPiece, fromR, fromC, toR, toC, !!captured);
    gameState.moveHistory.push(notation);
    gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
    gameState.selected = null;
    gameState.possibleMoves = [];

    updateUI();
    renderBoard();

    if (!hasLegalMoves(gameState.currentPlayer)) {
        const inCheck = isKingInCheck(gameState.currentPlayer);
        if (inCheck) {
            gameState.gameOver = true;
            const winner = gameState.currentPlayer === 'white' ? 'Black' : 'White';
            document.getElementById('gameOverTitle').textContent = '🏆 Checkmate!';
            document.getElementById('gameOverMessage').textContent = winner + ' wins!';
            document.getElementById('gameOverIcon').textContent = '🏆';
            openModal('gameOverModal');
            updateStats(gameState.currentPlayer === 'white' ? 'loss' : 'win');
        } else {
            gameState.gameOver = true;
            document.getElementById('gameOverTitle').textContent = '🤝 Draw';
            document.getElementById('gameOverMessage').textContent = 'Stalemate!';
            document.getElementById('gameOverIcon').textContent = '🤝';
            openModal('gameOverModal');
            updateStats('draw');
        }
        stopClock();
    }

    if (!gameState.gameOver && !gameState.isOnline && gameState.currentPlayer === 'black') {
        setTimeout(makeAIMove, 500);
    }
}

// ============================================================
// AI (Simplified - random legal moves)
// ============================================================
function makeAIMove() {
    if (gameState.gameOver || gameState.currentPlayer !== 'black') return;
    const moves = getAllLegalMoves('black');
    if (moves.length === 0) return;
    const move = moves[Math.floor(Math.random() * moves.length)];
    const piece = gameState.pieces[move.from.r][move.from.c];
    const captured = gameState.pieces[move.to.r][move.to.c];
    gameState.pieces[move.to.r][move.to.c] = piece;
    gameState.pieces[move.from.r][move.from.c] = '';
    finishMove(piece, move.from.r, move.from.c, move.to.r, move.to.c, !!captured);
}

// ============================================================
// CHESS HELPERS
// ============================================================
function getLegalMoves(piece, r, c) {
    const moves = [];
    const color = piece.startsWith('w') ? 'white' : 'black';
    const enemy = color === 'white' ? 'black' : 'white';

    if (piece === 'wP') {
        if (r > 0 && !gameState.pieces[r-1][c]) moves.push({r:r-1,c:c});
        if (r === 6 && !gameState.pieces[5][c] && !gameState.pieces[4][c]) moves.push({r:4,c:c});
        if (r > 0 && c > 0 && gameState.pieces[r-1][c-1] && gameState.pieces[r-1][c-1].startsWith('b')) moves.push({r:r-1,c:c-1});
        if (r > 0 && c < 7 && gameState.pieces[r-1][c+1] && gameState.pieces[r-1][c+1].startsWith('b')) moves.push({r:r-1,c:c+1});
    }
    if (piece === 'bP') {
        if (r < 7 && !gameState.pieces[r+1][c]) moves.push({r:r+1,c:c});
        if (r === 1 && !gameState.pieces[2][c] && !gameState.pieces[3][c]) moves.push({r:3,c:c});
        if (r < 7 && c > 0 && gameState.pieces[r+1][c-1] && gameState.pieces[r+1][c-1].startsWith('w')) moves.push({r:r+1,c:c-1});
        if (r < 7 && c < 7 && gameState.pieces[r+1][c+1] && gameState.pieces[r+1][c+1].startsWith('w')) moves.push({r:r+1,c:c+1});
    }

    if (piece === 'wN' || piece === 'bN') {
        const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightMoves) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                if (!gameState.pieces[nr][nc] || gameState.pieces[nr][nc].startsWith(enemy[0])) {
                    moves.push({r:nr,c:nc});
                }
            }
        }
    }

    if (piece === 'wB' || piece === 'bB') {
        const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
        for (const [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                if (!gameState.pieces[nr][nc]) moves.push({r:nr,c:nc});
                else { if (gameState.pieces[nr][nc].startsWith(enemy[0])) moves.push({r:nr,c:nc}); break; }
                nr += dr; nc += dc;
            }
        }
    }

    if (piece === 'wR' || piece === 'bR') {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                if (!gameState.pieces[nr][nc]) moves.push({r:nr,c:nc});
                else { if (gameState.pieces[nr][nc].startsWith(enemy[0])) moves.push({r:nr,c:nc}); break; }
                nr += dr; nc += dc;
            }
        }
    }

    if (piece === 'wQ' || piece === 'bQ') {
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                if (!gameState.pieces[nr][nc]) moves.push({r:nr,c:nc});
                else { if (gameState.pieces[nr][nc].startsWith(enemy[0])) moves.push({r:nr,c:nc}); break; }
                nr += dr; nc += dc;
            }
        }
    }

    if (piece === 'wK' || piece === 'bK') {
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                if (!gameState.pieces[nr][nc] || gameState.pieces[nr][nc].startsWith(enemy[0])) {
                    moves.push({r:nr,c:nc});
                }
            }
        }
    }

    return moves.filter(m => {
        const captured = gameState.pieces[m.r][m.c];
        gameState.pieces[m.r][m.c] = piece;
        gameState.pieces[r][c] = '';
        const legal = !isKingInCheck(color);
        gameState.pieces[r][c] = piece;
        gameState.pieces[m.r][m.c] = captured;
        return legal;
    });
}

function getAllLegalMoves(color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = gameState.pieces[r][c];
            if (!piece) continue;
            if (color === 'white' && !piece.startsWith('w')) continue;
            if (color === 'black' && !piece.startsWith('b')) continue;
            const legal = getLegalMoves(piece, r, c);
            for (const m of legal) moves.push({from: {r, c}, to: m});
        }
    }
    return moves;
}

function hasLegalMoves(color) {
    return getAllLegalMoves(color).length > 0;
}

function findKing(color) {
    const king = color === 'white' ? 'wK' : 'bK';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (gameState.pieces[r][c] === king) return {r, c};
        }
    }
    return null;
}

function isKingInCheck(color) {
    const king = findKing(color);
    if (!king) return false;
    const enemy = color === 'white' ? 'black' : 'white';
    const enemyMoves = getAllLegalMoves(enemy);
    return enemyMoves.some(m => m.to.r === king.r && m.to.c === king.c);
}

function getMoveNotation(piece, fromR, fromC, toR, toC, isCapture) {
    const files = 'abcdefgh';
    const dest = files[toC] + (8 - toR);
    if (piece[1] === 'P') return isCapture ? files[fromC] + 'x' + dest : dest;
    return piece[1] + (isCapture ? 'x' : '') + dest;
}

// ============================================================
// UI UPDATE
// ============================================================
function updateUI() {
    const turn = gameState.currentPlayer === 'white' ? 'White' : 'Black';
    document.getElementById('turnIndicator').textContent = turn + ' to Move';

    const historyEl = document.getElementById('moveHistory');
    historyEl.innerHTML = '';
    for (let i = 0; i < gameState.moveHistory.length; i += 2) {
        const num = document.createElement('span');
        num.className = 'move-number';
        num.textContent = (i/2 + 1) + '.';
        const w = document.createElement('span');
        w.className = 'move white-move';
        w.textContent = gameState.moveHistory[i] || '';
        const b = document.createElement('span');
        b.className = 'move black-move';
        b.textContent = gameState.moveHistory[i + 1] || '';
        historyEl.appendChild(num);
        historyEl.appendChild(w);
        historyEl.appendChild(b);
    }
    if (gameState.moveHistory.length === 0) {
        historyEl.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">Game starts here...</span>';
    }
    historyEl.scrollTop = historyEl.scrollHeight;
}

// ============================================================
// CLOCK
// ============================================================
function startClock() {
    stopClock();
    gameState.timer = setInterval(() => {
        if (gameState.gameOver) return;
        if (gameState.currentPlayer === 'white') gameState.whiteTime--;
        else gameState.blackTime--;
        updateClockDisplay();
        if (gameState.whiteTime <= 0 || gameState.blackTime <= 0) {
            stopClock();
            gameState.gameOver = true;
            const loser = gameState.whiteTime <= 0 ? 'White' : 'Black';
            const winner = loser === 'White' ? 'Black' : 'White';
            document.getElementById('gameOverTitle').textContent = '⏰ Time\'s Up!';
            document.getElementById('gameOverMessage').textContent = winner + ' wins on time!';
            document.getElementById('gameOverIcon').textContent = '⏰';
            openModal('gameOverModal');
            updateStats(loser === 'White' ? 'loss' : 'win');
        }
    }, 1000);
}

function stopClock() {
    if (gameState.timer) { clearInterval(gameState.timer); gameState.timer = null; }
}

function updateClockDisplay() {
    document.getElementById('topClock').textContent = formatTime(gameState.blackTime);
    document.getElementById('bottomClock').textContent = formatTime(gameState.whiteTime);
    document.getElementById('topClock').classList.toggle('low', gameState.blackTime < 10);
    document.getElementById('bottomClock').classList.toggle('low', gameState.whiteTime < 10);
}

function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
}

// ============================================================
// GAME CONTROLS
// ============================================================
function undoMove() {
    alert('Undo feature coming soon!');
}

function offerDraw() {
    if (gameState.isOnline) {
        alert('Draw offer sent to opponent.');
    } else {
        gameState.gameOver = true;
        stopClock();
        document.getElementById('gameOverTitle').textContent = '🤝 Draw';
        document.getElementById('gameOverMessage').textContent = 'Draw by agreement.';
        document.getElementById('gameOverIcon').textContent = '🤝';
        openModal('gameOverModal');
        updateStats('draw');
    }
}

function resignGame() {
    if (confirm('Are you sure you want to resign?')) {
        gameState.gameOver = true;
        stopClock();
        const winner = gameState.currentPlayer === 'white' ? 'Black' : 'White';
        document.getElementById('gameOverTitle').textContent = '🚩 Resignation';
        document.getElementById('gameOverMessage').textContent = winner + ' wins by resignation.';
        document.getElementById('gameOverIcon').textContent = '🚩';
        openModal('gameOverModal');
        updateStats('loss');
    }
}

function newGame() {
    if (gameState.timer) stopClock();
    const stats = JSON.parse(localStorage.getItem('chessStats') || '{}');
    initGame(600, 'friend');
}

function toggleChat() {
    const container = document.getElementById('gameChatContainer');
    container.style.display = container.style.display === 'flex' ? 'none' : 'flex';
}

function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    const container = document.getElementById('chatMessages');
    const bubble = document.createElement('div');
    bubble.style.cssText = 'align-self:flex-end;background:var(--green);padding:6px 12px;border-radius:12px;font-size:13px;max-width:80%;';
    bubble.textContent = msg;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    input.value = '';
}

// ============================================================
// STATS
// ============================================================
function updateStats(result) {
    const stats = JSON.parse(localStorage.getItem('chessStats') || '{"rating":1200,"wins":0,"losses":0,"draws":0,"streak":0}');
    if (result === 'win') {
        stats.wins++;
        stats.streak++;
        stats.rating = Math.min(3000, stats.rating + 10);
    } else if (result === 'loss') {
        stats.losses++;
        stats.streak = 0;
        stats.rating = Math.max(100, stats.rating - 8);
    } else if (result === 'draw') {
        stats.draws++;
        stats.streak = 0;
    }
    localStorage.setItem('chessStats', JSON.stringify(stats));
    renderHome();
}

// ============================================================
// AUTH (simplified - uses Firebase from auth.js)
// ============================================================
function updateAuthUI(user) {
    if (user) {
        currentUser = user;
        currentUsername = user.displayName || user.email?.split('@')[0] || 'Player';
        db.ref('users/' + user.uid + '/public').once('value').then(snap => {
            const data = snap.val() || {};
            currentRating = data.rating || 1200;
            currentUsername = data.username || currentUsername;
            renderHome();
            renderAccount();
            document.getElementById('navAvatar').innerHTML = '<img src="' + (data.photoURL || '') + '" alt="">';
        });
    } else {
        currentUser = null;
        currentUsername = 'Guest';
        currentRating = 1200;
        renderHome();
        renderAccount();
        document.getElementById('navAvatar').innerHTML = '<span>👤</span>';
    }
}

// ============================================================
// INIT
// ============================================================
renderHome();
renderAccount();

// Hero board preview
(function renderHeroBoard() {
    const board = document.getElementById('heroBoard');
    board.innerHTML = '';
    for (let i = 0; i < 64; i++) {
        const sq = document.createElement('div');
        const r = Math.floor(i / 8);
        const c = i % 8;
        sq.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        board.appendChild(sq);
    }
})();

console.log('♟️ ChessArena loaded!');
