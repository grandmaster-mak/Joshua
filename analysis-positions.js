// ============================================================
// Analysis position library — 30 preset positions (10 openings,
// 10 middlegames, 10 endgames) selectable from the Analysis screen.
// Only the piece-placement and side-to-move fields of each FEN matter
// here — analysisBoardToFEN() rebuilds castling/move-count fields
// fresh from board state, so those parts of these FENs are unused.
// ============================================================

const ANALYSIS_POSITIONS = [

    // ---- Openings ----
    { category:"opening", label:"Starting Position", fen:"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
    { category:"opening", label:"Italian Game", fen:"r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3" },
    { category:"opening", label:"Ruy Lopez", fen:"r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3" },
    { category:"opening", label:"Sicilian Defense", fen:"rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" },
    { category:"opening", label:"French Defense", fen:"rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" },
    { category:"opening", label:"Caro-Kann Defense", fen:"rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" },
    { category:"opening", label:"Queen's Gambit", fen:"rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2" },
    { category:"opening", label:"King's Indian Setup", fen:"rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3" },
    { category:"opening", label:"English Opening", fen:"rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1" },
    { category:"opening", label:"Scandinavian Defense", fen:"rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" },

    // ---- Middlegames ----
    { category:"middlegame", label:"Kingside Attack", fen:"r1bq1rk1/ppp2ppp/2n2n2/3pp3/3PP3/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 12" },
    { category:"middlegame", label:"Isolated Queen Pawn", fen:"r2q1rk1/pp3ppp/2p2n2/8/3P4/2N2N2/PP3PPP/R1BQ1RK1 b - - 0 14" },
    { category:"middlegame", label:"Closed Center Structure", fen:"rnbqk2r/ppp2ppp/5n2/3pP3/8/5N2/PPP2PPP/RNBQK2R w KQkq - 0 8" },
    { category:"middlegame", label:"Piece Trade Down", fen:"r2q1rk1/ppp2ppp/2n2n2/2b2b2/4P3/2N2N2/PPP2PPP/R2Q1RK1 w - - 0 12" },
    { category:"middlegame", label:"Symmetrical Fianchetto", fen:"r1bq1rk1/ppp2pbp/2n2np1/3pp3/3PP3/2N2NP1/PPP2PBP/R1BQ1RK1 w - - 0 10" },
    { category:"middlegame", label:"Traded Fianchetto Bishops", fen:"r1bq1rk1/ppp2p1p/2n2np1/3pp3/3PP3/2N2NP1/PPP2P1P/R1BQ1RK1 w - - 0 12" },
    { category:"middlegame", label:"Queenless Middlegame", fen:"r1b2rk1/ppp2pbp/2n2np1/3pp3/3PP3/2N2NP1/PPP2PBP/R1B2RK1 w - - 0 15" },
    { category:"middlegame", label:"Queenside Majority Push", fen:"r1bq1rk1/2p2pbp/2n2np1/pp1pp3/3PP3/2N2NP1/PPP2PBP/R1BQ1RK1 w - - 0 13" },
    { category:"middlegame", label:"Kingside Pawn Storm", fen:"r1bq1rk1/ppp2pbp/2n2np1/3pp3/3PP2P/2N2NP1/PPP2PB1/R1BQ1RK1 w - - 0 14" },
    { category:"middlegame", label:"Rooks Traded Off", fen:"2bq1rk1/ppp2pbp/2n2np1/3pp3/3PP3/2N2NP1/PPP2PBP/2BQ1RK1 w - - 0 16" },

    // ---- Endgames ----
    { category:"endgame", label:"King & Pawn vs King", fen:"4k3/8/4K3/4P3/8/8/8/8 w - - 0 1" },
    { category:"endgame", label:"Rook vs Lone King", fen:"k7/R7/2K5/8/8/8/8/8 b - - 0 1" },
    { category:"endgame", label:"Queen vs Rook", fen:"k7/8/8/3Q4/8/8/r7/6K1 b - - 0 1" },
    { category:"endgame", label:"Same-Color Bishop Endgame", fen:"8/8/2k1b3/p7/P7/2K1B3/8/8 w - - 0 1" },
    { category:"endgame", label:"Opposite-Color Bishops", fen:"8/6b1/5k2/3p4/3P4/1B3K2/8/8 w - - 0 1" },
    { category:"endgame", label:"Knight Endgame", fen:"8/pp4n1/4k3/8/8/2N1K3/PP6/8 w - - 0 1" },
    { category:"endgame", label:"Rook & Pawn Endgame", fen:"6k1/3R4/5PK1/8/8/8/8/r7 b - - 0 1" },
    { category:"endgame", label:"Two Bishops Mating Technique", fen:"k7/8/4K3/5B2/6B1/8/8/8 w - - 0 1" },
    { category:"endgame", label:"Connected Passed Pawns", fen:"4k3/8/2KPP3/8/8/8/8/8 w - - 0 1" },
    { category:"endgame", label:"Queen vs Advanced Pawn", fen:"7Q/8/8/8/8/3K4/1p6/1k6 w - - 0 1" }

];
