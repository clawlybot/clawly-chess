// Chess Game with 2-Player, PC Mode, Mobile Mode, and AI
const PIECES = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

let board = [], currentPlayer = 'w', selected = null, validMoves = [], history = [];
let captured = { w: [], b: [] }, enPassant = null;
let castle = { w: { k: 1, q: 1 }, b: { k: 1, q: 1 } };
let promotion = null, gameMode = '2player', viewMode = 'desktop';

function init() {
    return [
        'rnbqkbnr', 'pppppppp', '........', '........',
        '........', '........', 'PPPPPPPP', 'RNBQKBNR'
    ].map(r => r.split(''));
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    
    boardEl.innerHTML = '';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.className = 'square';
            
            // Correct chessboard coloring: light if (row+col) is even, dark if odd
            const isLight = (row + col) % 2 === 0;
            square.classList.add(isLight ? 'light' : 'dark');
            
            square.dataset.row = row;
            square.dataset.col = col;
            
            const piece = board[row][col];
            if (piece !== '.') {
                square.textContent = PIECES[piece];
            }
            
            // Selection
            if (selected && selected.row === row && selected.col === col) {
                square.classList.add('selected');
            }
            
            // Valid moves
            const isValidMove = validMoves.some(m => m.row === row && m.col === col);
            if (isValidMove) {
                square.classList.add(board[row][col] !== '.' ? 'capture-move' : 'valid-move');
            }
            
            // Last move
            if (history.length > 0) {
                const last = history[history.length - 1];
                if ((last.fromRow === row && last.fromCol === col) ||
                    (last.toRow === row && last.toCol === col)) {
                    square.classList.add('last-move');
                }
            }
            
            // Check indication
            if (inCheck(currentPlayer)) {
                const kingPos = findKing(currentPlayer);
                if (kingPos && kingPos.row === row && kingPos.col === col) {
                    square.classList.add('check');
                }
            }
            
            square.onclick = () => clickSquare(row, col);
            boardEl.appendChild(square);
        }
    }
    
    updateStatus();
    renderCaptured();
}

function clickSquare(row, col) {
    const piece = board[row][col];
    const isOwnPiece = piece !== '.' && 
        ((currentPlayer === 'w' && piece === piece.toUpperCase()) ||
         (currentPlayer === 'b' && piece === piece.toLowerCase()));
    
    const moveIndex = validMoves.findIndex(m => m.row === row && m.col === col);
    
    if (selected && moveIndex !== -1) {
        makeMove(selected, { row, col }, validMoves[moveIndex]);
        return;
    }
    
    if (isOwnPiece) {
        selected = { row, col };
        validMoves = getMoves(row, col);
        renderBoard();
    } else {
        selected = null;
        validMoves = [];
        renderBoard();
    }
}

function getMoves(row, col) {
    const piece = board[row][col];
    if (piece === '.') return [];
    
    const moves = [];
    const isWhite = piece === piece.toUpperCase();
    const pieceType = piece.toLowerCase();
    const dir = isWhite ? -1 : 1;
    const startRow = isWhite ? 6 : 1;
    
    if (pieceType === 'p') {
        // Forward
        if (isValid(row + dir, col) && board[row + dir][col] === '.') {
            moves.push({ row: row + dir, col: col, promotion: row + dir === 0 || row + dir === 7 });
            // Double step
            if (row === startRow && board[row + 2 * dir][col] === '.') {
                moves.push({ row: row + 2 * dir, col: col, enPassant: { row: row + dir, col: col } });
            }
        }
        // Captures
        for (const dc of [-1, 1]) {
            const newCol = col + dc;
            if (isValid(row + dir, newCol)) {
                const target = board[row + dir][newCol];
                if (target !== '.' && isWhite !== (target === target.toUpperCase())) {
                    moves.push({ row: row + dir, col: newCol, capture: true, 
                                 promotion: row + dir === 0 || row + dir === 7 });
                }
                // En passant
                if (enPassant && enPassant.row === row + dir && enPassant.col === newCol) {
                    moves.push({ row: row + dir, col: newCol, enPassant: true });
                }
            }
        }
    } else if (pieceType === 'n') {
        const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        jumps.forEach(([dr, dc]) => {
            const nr = row + dr, nc = col + dc;
            if (canMove(row, col, nr, nc)) {
                moves.push({ row: nr, col: nc, capture: board[nr][nc] !== '.' });
            }
        });
    } else if (pieceType === 'b') {
        addLineMoves(row, col, [[-1,-1],[-1,1],[1,-1],[1,1]], moves);
    } else if (pieceType === 'r') {
        addLineMoves(row, col, [[-1,0],[1,0],[0,-1],[0,1]], moves);
    } else if (pieceType === 'q') {
        addLineMoves(row, col, [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]], moves);
    } else if (pieceType === 'k') {
        const steps = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        steps.forEach(([dr, dc]) => {
            const nr = row + dr, nc = col + dc;
            if (canMove(row, col, nr, nc)) {
                moves.push({ row: nr, col: nc, capture: board[nr][nc] !== '.' });
            }
        });
        // Castling
        const info = castle[isWhite ? 'w' : 'b'];
        if (info && !inCheck(isWhite ? 'w' : 'b')) {
            // Kingside
            if (info.k && canCastle(row, col, 7, isWhite)) {
                moves.push({ row: row, col: 6, castling: 'k' });
            }
            // Queenside
            if (info.q && canCastle(row, col, 0, isWhite)) {
                moves.push({ row: row, col: 2, castling: 'q' });
            }
        }
    }
    
    return moves.filter(m => isLegal(row, col, m));
}

function addLineMoves(row, col, directions, moves) {
    const piece = board[row][col];
    const isWhite = piece === piece.toUpperCase();
    
    directions.forEach(([dr, dc]) => {
        for (let i = 1; i < 8; i++) {
            const nr = row + dr * i, nc = col + dc * i;
            if (!isValid(nr, nc)) break;
            const target = board[nr][nc];
            if (target === '.') {
                moves.push({ row: nr, col: nc });
            } else {
                if (isWhite !== (target === target.toUpperCase())) {
                    moves.push({ row: nr, col: nc, capture: true });
                }
                break;
            }
        }
    });
}

function canMove(fromRow, fromCol, toRow, toCol) {
    if (!isValid(toRow, toCol)) return false;
    const fromPiece = board[fromRow][fromCol];
    const toPiece = board[toRow][toCol];
    if (toPiece === '.') return true;
    return (fromPiece === fromPiece.toUpperCase()) !== (toPiece === toPiece.toUpperCase());
}

function isValid(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function canCastle(kingRow, kingCol, rookCol, isWhite) {
    const dir = rookCol > kingCol ? 1 : -1;
    // Check spaces between
    for (let c = kingCol + dir; c !== rookCol; c += dir) {
        if (board[kingRow][c] !== '.') return false;
    }
    // Check squares king passes