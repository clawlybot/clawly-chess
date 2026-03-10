// Clawly Chess – Chess.com-level features
// Minimax+α-β AI · algebraic notation · drag&drop · clock · resign · draw

const PIECES={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const FILES='abcdefgh';

// ── Global game state ────────────────────────────────────────
let G = newState();
let mode='2player', difficulty='medium', view='desktop';
let kiTurn=false, gameOver=false, flipped=false;
let promo=null;
let dragSrc=null;
let clockTimes={w:600,b:600};
let clockInterval=null, clockActive=null;

function newState(){
  return {
    board:['rnbqkbnr','pppppppp','........','........','........','........','PPPPPPPP','RNBQKBNR'].map(r=>r.split('')),
    cp:'w', ep:null,
    castle:{w:{k:1,q:1},b:{k:1,q:1}},
    cap:{w:[],b:[]},
    hist:[],          // {fr,fc,tr,tc,p,san,captured,epCap,cast,epSet,castle_snap,halfClock}
    halfClock:0,
    posHist:[],
  };
}

// ── Piece tables ─────────────────────────────────────────────
const VAL={p:100,n:320,b:330,r:500,q:900,k:20000};
const PST={
  p:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
  n:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
  b:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
  r:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
  q:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
  k_mid:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]],
  k_end:[[-50,-40,-30,-20,-20,-30,-40,-50],[-30,-20,-10,0,0,-10,-20,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-30,0,0,0,0,-30,-30],[-50,-30,-30,-30,-30,-30,-30,-50]],
};

// ── UI entry points ───────────────────────────────────────────
function startGame(gm){
  mode=gm;
  document.getElementById('mode-selector').style.display='none';
  document.getElementById('game-area').style.display='flex';
  document.getElementById('mode-display').textContent=
    gm==='computer'?`vs Computer (${diffLabel()})`:
    gm==='computer-black'?`vs Computer (${diffLabel()}, du=Schwarz)`:'Zu zweit';
  document.getElementById('btn-flip').style.display=(gm==='2player')?'inline-block':'none';
  flipped=(gm==='computer-black');
  stopClock();
  clockTimes={w:clockTimes.w,b:clockTimes.b};
  reset();
}
function diffLabel(){return{easy:'Leicht',medium:'Mittel',hard:'Schwer',expert:'Experte'}[difficulty];}
function setDifficulty(d){
  difficulty=d;
  document.querySelectorAll('.diff-btn').forEach(b=>b.classList.toggle('active',b.dataset.diff===d));
}
function showModeSelector(){
  stopClock();
  document.getElementById('mode-selector').style.display='block';
  document.getElementById('game-area').style.display='none';
}
function flipBoard(){flipped=!flipped;render();}

// ── Render ────────────────────────────────────────────────────
function render(){
  renderBoard();
  renderMoveHistory();
  renderCaptures();
  renderStatus();
  updateClockDisplay();
}

function renderBoard(){
  const el=document.getElementById('board');
  if(!el)return;
  el.innerHTML='';
  renderCoords();
  for(let ri=0;ri<8;ri++){
    for(let ci=0;ci<8;ci++){
      const r=flipped?7-ri:ri, c=flipped?7-ci:ci;
      const sq=document.createElement('div');
      sq.className='square '+((r+c)%2===0?'light':'dark');
      sq.dataset.r=r; sq.dataset.c=c;

      const p=G.board[r][c];
      if(p!=='.'){
        const sp=document.createElement('span');
        sp.className='piece'; sp.textContent=PIECES[p];
        sp.draggable=true;
        sp.addEventListener('dragstart',onDragStart);
        sq.appendChild(sp);
      }

      if(G.sel&&G.sel.r===r&&G.sel.c===c) sq.classList.add('selected');
      if(G.vmoves&&G.vmoves.some(m=>m.r===r&&m.c===c))
        sq.classList.add(p!=='.'?'capture-move':'valid-move');

      if(G.hist.length){
        const l=G.hist[G.hist.length-1];
        if((l.fr===r&&l.fc===c)||(l.tr===r&&l.tc===c)) sq.classList.add('last-move');
      }
      if(!gameOver&&incheck(G,'w')&&G.board[r][c]==='K') sq.classList.add('check');
      if(!gameOver&&incheck(G,'b')&&G.board[r][c]==='k') sq.classList.add('check');

      sq.addEventListener('click',()=>click(r,c));
      sq.addEventListener('dragover',e=>{e.preventDefault();sq.classList.add('drag-over');});
      sq.addEventListener('dragleave',()=>sq.classList.remove('drag-over'));
      sq.addEventListener('drop',e=>{e.preventDefault();sq.classList.remove('drag-over');onDrop(r,c);});
      el.appendChild(sq);
    }
  }
}

function renderCoords(){
  const fl=document.getElementById('file-labels');
  const rl=document.getElementById('rank-labels');
  const fs=flipped?[...'hgfedcba']:[...'abcdefgh'];
  const rs=flipped?['1','2','3','4','5','6','7','8']:['8','7','6','5','4','3','2','1'];
  if(fl){fl.innerHTML='';fs.forEach(f=>{const d=document.createElement('div');d.textContent=f;fl.appendChild(d);});}
  if(rl){rl.innerHTML='';rs.forEach(r=>{const d=document.createElement('div');d.textContent=r;rl.appendChild(d);});}
}

// ── Drag & Drop ───────────────────────────────────────────────
function onDragStart(ev){
  const sq=ev.target.closest('.square');
  if(!sq||kiTurn||gameOver)return;
  const r=+sq.dataset.r,c=+sq.dataset.c;
  if(!isOwn(G,r,c)){ev.preventDefault();return;}
  dragSrc={r,c};
  G.sel={r,c}; G.vmoves=getm(G,r,c);
  renderBoard();
}
function onDrop(r,c){
  if(!dragSrc){return;}
  const mi=G.vmoves?G.vmoves.findIndex(m=>m.r===r&&m.c===c):-1;
  if(mi!==-1) executeMove(G.sel,{r,c},G.vmoves[mi]);
  else{G.sel=null;G.vmoves=[];renderBoard();}
  dragSrc=null;
}

// ── Click ─────────────────────────────────────────────────────
function click(r,c){
  if(kiTurn||gameOver)return;
  const mi=G.vmoves?G.vmoves.findIndex(m=>m.r===r&&m.c===c):-1;
  if(G.sel&&mi!==-1){executeMove(G.sel,{r,c},G.vmoves[mi]);return;}
  if(isOwn(G,r,c)){G.sel={r,c};G.vmoves=getm(G,r,c);renderBoard();}
  else{G.sel=null;G.vmoves=[];renderBoard();}
}

function isOwn(s,r,c){
  const p=s.board[r][c];
  return p!=='.'&&((s.cp==='w'&&p===p.toUpperCase())||(s.cp==='b'&&p===p.toLowerCase()));
}

// ── Move generation ───────────────────────────────────────────
function getm(s,r,c){
  const bd=s.board,p=bd[r][c];
  if(p==='.')return[];
  const moves=[],iW=p===p.toUpperCase(),pc=p.toLowerCase(),d=iW?-1:1,st=iW?6:1;

  if(pc==='p'){
    if(vi(r+d,c)&&bd[r+d][c]==='.'){
      moves.push({r:r+d,c,pr:r+d===0||r+d===7});
      if(r===st&&vi(r+2*d,c)&&bd[r+2*d][c]==='.')
        moves.push({r:r+2*d,c,epSet:{r:r+d,c}});
    }
    for(const dc of[-1,1]){const nc=c+dc;
      if(vi(r+d,nc)){
        const t=bd[r+d][nc];
        if(t!=='.'&&iW!==(t===t.toUpperCase())) moves.push({r:r+d,c:nc,cap:t,pr:r+d===0||r+d===7});
        if(s.ep&&s.ep.r===r+d&&s.ep.c===nc) moves.push({r:r+d,c:nc,epCap:iW?'p':'P'});
      }
    }
  } else if(pc==='n'){
    [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>{
      const nr=r+dr,nc=c+dc;
      if(canMove(bd,r,c,nr,nc)) moves.push({r:nr,c:nc,cap:bd[nr][nc]!=='.'?bd[nr][nc]:null});
    });
  } else if(pc==='b') slideLine(bd,r,c,iW,[[-1,-1],[-1,1],[1,-1],[1,1]],moves);
  else if(pc==='r') slideLine(bd,r,c,iW,[[-1,0],[1,0],[0,-1],[0,1]],moves);
  else if(pc==='q') slideLine(bd,r,c,iW,[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],moves);
  else if(pc==='k'){
    [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc])=>{
      const nr=r+dr,nc=c+dc;
      if(canMove(bd,r,c,nr,nc)) moves.push({r:nr,c:nc,cap:bd[nr][nc]!=='.'?bd[nr][nc]:null});
    });
    const ri=s.castle[iW?'w':'b'];
    if(ri&&!incheck(s,iW?'w':'b')){
      if(ri.k&&canCastle(s,r,c,7,iW)) moves.push({r,c:6,cast:'k'});
      if(ri.q&&canCastle(s,r,c,0,iW)) moves.push({r,c:2,cast:'q'});
    }
  }
  return moves.filter(m=>legal(s,r,c,m));
}

function slideLine(bd,r,c,iW,dirs,moves){
  dirs.forEach(([dr,dc])=>{
    for(let i=1;i<8;i++){
      const nr=r+dr*i,nc=c+dc*i;
      if(!vi(nr,nc))break;
      const t=bd[nr][nc];
      if(t==='.') moves.push({r:nr,c:nc,cap:null});
      else{if(iW!==(t===t.toUpperCase())) moves.push({r:nr,c:nc,cap:t});break;}
    }
  });
}

function canMove(bd,fr,fc,tr,tc){
  return vi(tr,tc)&&(bd[tr][tc]==='.'||(bd[fr][fc]===bd[fr][fc].toUpperCase())!==(bd[tr][tc]===bd[tr][tc].toUpperCase()));
}

function canCastle(s,kr,kc,rc,iW){
  const bd=s.board;
  const d=rc>kc?1:-1;
  for(let c=kc+d;c!==rc;c+=d) if(bd[kr][c]!=='.')return false;
  for(let c=kc;c!==(rc>kc?6:2)+d;c+=d) if(attacked(s,kr,c,iW?'b':'w'))return false;
  return true;
}

function vi(r,c){return r>=0&&r<8&&c>=0&&c<8;}

function legal(s,fr,fc,m){
  const bd=s.board,p=bd[fr][fc],iW=p===p.toUpperCase();
  // Make move on copy
  const snap=bd.map(r=>[...r]);
  snap[m.r][m.c]=p; snap[fr][fc]='.';
  if(m.epCap) snap[iW?m.r+1:m.r-1][m.c]='.';
  if(m.cast){
    if(m.cast==='k'){snap[fr][7]='.';snap[fr][5]=iW?'R':'r';}
    else{snap[fr][0]='.';snap[fr][3]=iW?'R':'r';}
  }
  const tmp={...s,board:snap};
  return !incheck(tmp,iW?'w':'b');
}

// ── Execute move (real) ───────────────────────────────────────
function executeMove(from,to,md){
  if(gameOver) return;
  const bd=G.board,p=bd[from.r][from.c],iW=p===p.toUpperCase();
  const captured=md.cap||null;

  // Pawn promotion
  if(md.pr){
    promo={from,to,md,p,iW};
    // Show promotion modal
    const pc=document.getElementById('promotion-modal');
    // Update modal piece colours
    const isBlack=!iW;
    document.querySelectorAll('.promotion-choices button').forEach((btn,i)=>{
      const pieces=isBlack?['q','r','b','n']:['Q','R','B','N'];
      const syms=['♛','♜','♝','♞'];
      const wsyms=['♕','♖','♗','♘'];
      btn.textContent=(isBlack?syms[i]:wsyms[i])+' '+(btn.getAttribute('data-label')||'');
      btn.onclick=()=>promote(pieces[i]);
    });
    pc.classList.add('show');
    G.sel=null; G.vmoves=[];
    renderBoard();
    return;
  }

  applyMoveToState(G,from,to,md,p,iW,captured);

  // Record san
  if(G.hist.length>0){
    const last=G.hist[G.hist.length-1];
    if(!last.san) last.san=buildSAN(from,to,md,p,captured,G);
  }

  G.sel=null; G.vmoves=[];

  if(G.hist.length===1) startClock();

  checkEnd();
  render();

  if(!gameOver&&mode==='computer'&&G.cp==='b'){
    kiTurn=true;
    document.getElementById('ki-thinking').style.display='block';
    setTimeout(kiMove,aiDelay());
  }
}

function applyMoveToState(s,from,to,md,p,iW,captured){
  const bd=s.board;
  const castleSnap=JSON.parse(JSON.stringify(s.castle));

  if(md.cast){
    if(md.cast==='k'){bd[from.r][7]='.';bd[from.r][5]=iW?'R':'r';}
    else{bd[from.r][0]='.';bd[from.r][3]=iW?'R':'r';}
  }
  if(md.epCap) bd[iW?to.r+1:to.r-1][to.c]='.';

  bd[to.r][to.c]=p;
  bd[from.r][from.c]='.';

  if(p.toLowerCase()==='k') s.castle[iW?'w':'b']={k:0,q:0};
  if(p.toLowerCase()==='r'){
    if(from.c===7) s.castle[iW?'w':'b'].k=0;
    if(from.c===0) s.castle[iW?'w':'b'].q=0;
  }
  // Rook moved by castling
  if(to.c===7&&bd[to.r][to.c]==='R'&&from.c!==7) s.castle.w.k=0;
  if(to.c===0&&bd[to.r][to.c]==='R'&&from.c!==0) s.castle.w.q=0;

  const prevEp=s.ep;
  s.ep=md.epSet||null;

  const prevHalf=s.halfClock;
  if(p.toLowerCase()==='p'||captured) s.halfClock=0;
  else s.halfClock++;

  if(captured) iW?s.cap.w.push(captured):s.cap.b.push(captured);
  if(md.epCap) iW?s.cap.w.push(md.epCap):s.cap.b.push(md.epCap);

  const san=buildSAN(from,to,md,p,captured,s);

  s.hist.push({fr:from.r,fc:from.c,tr:to.r,tc:to.c,p,san,captured,epCap:md.epCap,cast:md.cast,epSet:md.epSet,castleSnap,prevHalf,prevEp});

  s.posHist.push(boardKey(s));
  s.cp=s.cp==='w'?'b':'w';
}

// ── Algebraic notation ────────────────────────────────────────
function buildSAN(from,to,md,p,captured,s){
  const pc=p.toLowerCase();
  const toAlg=FILES[to.c]+(8-to.r);
  if(md.cast) return md.cast==='k'?'O-O':'O-O-O';
  let san='';
  if(pc==='p'){
    if(captured||md.epCap) san=FILES[from.c]+'x'+toAlg;
    else san=toAlg;
  } else {
    san=p.toUpperCase();
    // Disambiguation
    const ambig=[];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      if(r===from.r&&c===from.c) continue;
      if(s.board[r][c]===p){
        if(getm(s,r,c).some(m=>m.r===to.r&&m.c===to.c)) ambig.push({r,c});
      }
    }
    if(ambig.length>0){
      const sameFile=ambig.some(a=>a.c===from.c);
      const sameRank=ambig.some(a=>a.r===from.r);
      if(!sameFile) san+=FILES[from.c];
      else if(!sameRank) san+=(8-from.r);
      else san+=FILES[from.c]+(8-from.r);
    }
    if(captured) san+='x';
    san+=toAlg;
  }
  return san;
}

// ── Promotion ─────────────────────────────────────────────────
function promote(ch){
  if(!promo) return;
  const{from,to,md,p,iW}=promo;
  const piece=iW?ch.toUpperCase():ch.toLowerCase();
  const captured=md.cap||null;
  applyMoveToState(G,from,to,{...md,pr:false},p,iW,captured);
  // replace pawn with chosen piece
  G.board[to.r][to.c]=piece;
  // Fix SAN
  const last=G.hist[G.hist.length-1];
  if(last) last.san=(last.san||'').replace(/\w$/,'')+`=${ch.toUpperCase()}`;

  promo=null;
  document.getElementById('promotion-modal').classList.remove('show');
  G.sel=null; G.vmoves=[];
  if(G.hist.length===1) startClock();
  checkEnd();
  render();
  if(!gameOver&&mode==='computer'&&G.cp==='b'){
    kiTurn=true;
    document.getElementById('ki-thinking').style.display='block';
    setTimeout(kiMove,aiDelay());
  }
}

// ── Check / game end ──────────────────────────────────────────
function checkEnd(){
  const c=G.cp;
  if(!hasMoves(G,c)){
    gameOver=true; stopClock();
    if(incheck(G,c)){
      const winner=c==='w'?'Schwarz':'Weiß';
      showGameOver('Schachmatt!',`${winner} gewinnt!`);
    } else {
      showGameOver('Patt!','Unentschieden – kein Zug möglich.');
    }
    return;
  }
  if(G.halfClock>=100){
    gameOver=true; stopClock();
    showGameOver('Unentschieden!','50-Züge-Regel.'); return;
  }
  const key=boardKey(G);
  if(G.posHist.filter(k=>k===key).length>=3){
    gameOver=true; stopClock();
    showGameOver('Unentschieden!','Dreifache Stellungswiederholung.'); return;
  }
  if(insufficientMaterial(G)){
    gameOver=true; stopClock();
    showGameOver('Unentschieden!','Unzureichendes Material.'); return;
  }
}

function hasMoves(s,pl){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=s.board[r][c];
    if(p==='.')continue;
    if((pl==='w'&&p===p.toUpperCase())||(pl==='b'&&p===p.toLowerCase()))
      if(getm(s,r,c).length>0) return true;
  }
  return false;
}

function boardKey(s){
  return s.board.map(r=>r.join('')).join('|')+'|'+s.cp+'|'+s.castle.w.k+s.castle.w.q+s.castle.b.k+s.castle.b.q+'|'+(s.ep?s.ep.r+','+s.ep.c:'');
}

function insufficientMaterial(s){
  const pieces=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){const p=s.board[r][c];if(p!=='.')pieces.push(p.toLowerCase());}
  const nk=pieces.filter(p=>p!=='k');
  if(nk.length===0) return true;
  if(nk.length===1&&(nk[0]==='b'||nk[0]==='n')) return true;
  return false;
}

function incheck(s,pl){
  const k=findKing(s,pl);
  return k?attacked(s,k.r,k.c,pl==='w'?'b':'w'):false;
}
function findKing(s,pl){
  const k=pl==='w'?'K':'k';
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(s.board[r][c]===k) return{r,c};
  return null;
}

// ── Attack detection ──────────────────────────────────────────
function attacked(s,r,c,by){
  const bd=s.board;
  for(let i=0;i<8;i++) for(let j=0;j<8;j++){
    const p=bd[i][j]; if(p==='.')continue;
    const pw=p===p.toUpperCase();
    if((by==='w'&&!pw)||(by==='b'&&pw)) continue;
    if(pieceAttacks(bd,i,j,r,c)) return true;
  }
  return false;
}

function pieceAttacks(bd,fr,fc,tr,tc){
  const p=bd[fr][fc].toLowerCase(),dr=tr-fr,dc=tc-fc;
  switch(p){
    case'p':{const d=bd[fr][fc]==='P'?-1:1;return Math.abs(dc)===1&&dr===d;}
    case'n':return(Math.abs(dr)===2&&Math.abs(dc)===1)||(Math.abs(dr)===1&&Math.abs(dc)===2);
    case'b':return Math.abs(dr)===Math.abs(dc)&&pathClear(bd,fr,fc,tr,tc);
    case'r':return(dr===0||dc===0)&&pathClear(bd,fr,fc,tr,tc);
    case'q':return(Math.abs(dr)===Math.abs(dc)||dr===0||dc===0)&&pathClear(bd,fr,fc,tr,tc);
    case'k':return Math.abs(dr)<=1&&Math.abs(dc)<=1;
  }
  return false;
}
function pathClear(bd,fr,fc,tr,tc){
  const sdr=Math.sign(tr-fr),sdc=Math.sign(tc-fc);
  let r=fr+sdr,c=fc+sdc;
  while(r!==tr||c!==tc){if(bd[r][c]!=='.')return false;r+=sdr;c+=sdc;}
  return true;
}

// ── AI – Minimax with α-β pruning ────────────────────────────
function aiDelay(){return{easy:200,medium:400,hard:600,expert:800}[difficulty];}
function aiDepth(){return{easy:1,medium:2,hard:3,expert:4}[difficulty];}

function kiMove(){
  try {
    const result=minimaxRoot(G,aiDepth(),'b');
    if(result.move){
      const{fr,fc,to}=result.move;
      executeMove({r:fr,c:fc},{r:to.r,c:to.c},to);
    }
  } finally {
    kiTurn=false;
    document.getElementById('ki-thinking').style.display='none';
  }
}

function minimaxRoot(s,depth,aiColor){
  const moves=collectMoves(s,aiColor);
  if(moves.length===0) return{score:0,move:null};
  // Order: captures first, then by PST
  orderMoves(s,moves);
  let best={score:-Infinity,move:null};
  for(const m of moves){
    const ns=cloneState(s);
    const p=ns.board[m.fr][m.fc],iW=p===p.toUpperCase(),captured=m.to.cap||null;
    applyMoveToState(ns,{r:m.fr,c:m.fc},{r:m.to.r,c:m.to.c},m.to,p,iW,captured);
    // Handle promotion (always queen for AI)
    if(m.to.pr) ns.board[m.to.r][m.to.c]=aiColor==='b'?'q':'Q';
    const score=-negamax(ns,depth-1,-Infinity,Infinity,aiColor==='w'?'b':'w');
    if(score>best.score){best={score,move:m};}
  }
  return best;
}

function negamax(s,depth,alpha,beta,color){
  if(depth===0) return colorEval(s,color);
  const moves=collectMoves(s,color);
  if(moves.length===0){
    return incheck(s,color)?-100000+depth:0;
  }
  orderMoves(s,moves);
  let best=-Infinity;
  for(const m of moves){
    const ns=cloneState(s);
    const p=ns.board[m.fr][m.fc],iW=p===p.toUpperCase(),captured=m.to.cap||null;
    applyMoveToState(ns,{r:m.fr,c:m.fc},{r:m.to.r,c:m.to.c},m.to,p,iW,captured);
    if(m.to.pr) ns.board[m.to.r][m.to.c]=color==='b'?'q':'Q';
    const score=-negamax(ns,depth-1,-beta,-alpha,color==='w'?'b':'w');
    best=Math.max(best,score);
    alpha=Math.max(alpha,score);
    if(alpha>=beta) break;
  }
  return best;
}

function colorEval(s,color){
  return (color==='w'?1:-1)*staticEval(s);
}

function staticEval(s){
  let score=0,total=0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=s.board[r][c]; if(p==='.')continue;
    const pc=p.toLowerCase();
    if(pc!=='k') total+=VAL[pc];
  }
  const endgame=total<1500;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=s.board[r][c]; if(p==='.')continue;
    const isW=p===p.toUpperCase(),pc=p.toLowerCase();
    const sign=isW?1:-1;
    const pr=isW?r:7-r,pc2=isW?c:7-c;
    let pst=0;
    if(pc==='k') pst=(endgame?PST.k_end:PST.k_mid)[pr][pc2];
    else if(PST[pc]) pst=PST[pc][pr][pc2];
    score+=sign*(VAL[pc]+pst);
  }
  return score;
}

function collectMoves(s,color){
  const moves=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=s.board[r][c]; if(p==='.')continue;
    const isW=p===p.toUpperCase();
    if((color==='w'&&!isW)||(color==='b'&&isW)) continue;
    getm(s,r,c).forEach(to=>moves.push({fr:r,fc:c,to}));
  }
  return moves;
}

function orderMoves(s,moves){
  moves.sort((a,b)=>{
    const va=a.to.cap?VAL[a.to.cap.toLowerCase()]||0:0;
    const vb=b.to.cap?VAL[b.to.cap.toLowerCase()]||0:0;
    return vb-va;
  });
}

function cloneState(s){
  return{
    board:s.board.map(r=>[...r]),
    cp:s.cp,
    ep:s.ep?{...s.ep}:null,
    castle:{w:{...s.castle.w},b:{...s.castle.b}},
    cap:{w:[...s.cap.w],b:[...s.cap.b]},
    hist:[...s.hist],
    halfClock:s.halfClock,
    posHist:[...s.posHist],
  };
}

// ── Clock ──────────────────────────────────────────────────────
function startClock(){
  if(clockInterval) return;
  clockActive=G.cp;
  clockInterval=setInterval(()=>{
    if(gameOver){stopClock();return;}
    clockTimes[clockActive]--;
    updateClockDisplay();
    if(clockTimes[clockActive]<=0){
      clockTimes[clockActive]=0;
      stopClock(); gameOver=true;
      const winner=clockActive==='w'?'Schwarz':'Weiß';
      showGameOver('Zeit abgelaufen!',`${winner} gewinnt!`);
    }
  },1000);
}
function stopClock(){clearInterval(clockInterval);clockInterval=null;clockActive=null;}
function updateClockDisplay(){
  ['w','b'].forEach(pl=>{
    const el=document.getElementById('clock-'+pl);
    if(!el) return;
    const t=clockTimes[pl];
    const m=Math.floor(t/60),sec=t%60;
    el.textContent=`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    el.className='clock-time'+(t<=30?' low':'')+(clockActive===pl?' active':'');
  });
}
function setClockTime(minutes){
  stopClock();
  clockTimes={w:minutes*60,b:minutes*60};
  updateClockDisplay();
  document.querySelectorAll('.clock-btn').forEach(b=>b.classList.toggle('active',+b.dataset.min===minutes));
}

// ── Status & Captures ──────────────────────────────────────────
function renderStatus(){
  clockActive=G.cp; // switch clock side
  const el=document.getElementById('status');
  if(!el||gameOver) return;
  const x=incheck(G,G.cp);
  el.textContent=(G.cp==='w'?'Weiß':'Schwarz')+' ist am Zug'+(x?' — Schach!':'');
  el.className='status '+(G.cp==='w'?'white-turn':'black-turn')+(x?' check':'');
}

function renderCaptures(){
  const order='qrbnp';
  const sort=arr=>[...arr].sort((a,b)=>order.indexOf(a.toLowerCase())-order.indexOf(b.toLowerCase()));
  const fmt=arr=>sort(arr).map(p=>`<span class="cap-piece">${PIECES[p]}</span>`).join('');
  document.getElementById('captured-white').innerHTML=fmt(G.cap.w);
  document.getElementById('captured-black').innerHTML=fmt(G.cap.b);
  const score=G.cap.w.reduce((s,p)=>s+(VAL[p.toLowerCase()]||0),0)
             -G.cap.b.reduce((s,p)=>s+(VAL[p.toLowerCase()]||0),0);
  const adv=document.getElementById('material-adv');
  if(adv) adv.textContent=score>0?`+${score}`:score<0?`+${-score}`:'';
}

function renderMoveHistory(){
  const el=document.getElementById('move-list');
  if(!el) return;
  el.innerHTML='';
  for(let i=0;i<G.hist.length;i+=2){
    const row=document.createElement('div');
    row.className='move-row';
    const num=document.createElement('span');
    num.className='move-num';
    num.textContent=`${Math.floor(i/2)+1}.`;
    const w=document.createElement('span');
    w.className='move-san'+(i===G.hist.length-1?' current':'');
    w.textContent=G.hist[i].san||'';
    row.appendChild(num); row.appendChild(w);
    if(G.hist[i+1]){
      const b=document.createElement('span');
      b.className='move-san'+(i+1===G.hist.length-1?' current':'');
      b.textContent=G.hist[i+1].san||'';
      row.appendChild(b);
    }
    el.appendChild(row);
  }
  el.scrollTop=el.scrollHeight;
}

// ── Game Over / Controls ───────────────────────────────────────
function showGameOver(title,msg){
  document.getElementById('game-over-title').textContent=title;
  document.getElementById('game-over-message').textContent=msg;
  document.getElementById('game-over-modal').classList.add('show');
  render();
}

function closeModal(id){document.getElementById(id).classList.remove('show');}

function resign(){
  if(gameOver) return;
  gameOver=true; stopClock();
  const winner=G.cp==='w'?'Schwarz':'Weiß';
  showGameOver('Aufgabe!',`${winner} gewinnt durch Aufgabe.`);
}

function offerDraw(){
  if(gameOver) return;
  document.getElementById('draw-modal').classList.add('show');
}
function acceptDraw(){
  gameOver=true; stopClock();
  closeModal('draw-modal');
  showGameOver('Unentschieden!','Remis durch gegenseitige Einigung.');
}

function undo(){
  if(G.hist.length===0||gameOver) return;
  const steps=(mode==='computer'&&G.hist.length>=2)?2:1;
  // Rebuild from scratch
  const moves=G.hist.slice(0,-steps).map(h=>({fr:h.fr,fc:h.fc,tr:h.tr,tc:h.tc,p:h.p,san:h.san,captured:h.captured,epCap:h.epCap,cast:h.cast,epSet:h.epSet}));
  G=newState();
  // Replay saved moves (fast replay without san rebuild)
  for(const m of moves){
    const p=G.board[m.fr][m.fc],iW=p===p.toUpperCase();
    const md={cap:m.captured,epCap:m.epCap,cast:m.cast,epSet:m.epSet,pr:false};
    applyMoveToState(G,{r:m.fr,c:m.fc},{r:m.tr,c:m.tc},md,p,iW,m.captured);
    G.hist[G.hist.length-1].san=m.san;
  }
  G.sel=null; G.vmoves=[];
  render();
}

function reset(){
  stopClock();
  G=newState();
  kiTurn=false; gameOver=false; promo=null; dragSrc=null;
  clockTimes={w:clockTimes.w,b:clockTimes.b};
  document.getElementById('promotion-modal')?.classList.remove('show');
  document.getElementById('game-over-modal')?.classList.remove('show');
  document.getElementById('draw-modal')?.classList.remove('show');
  document.getElementById('ki-thinking').style.display='none';
  updateClockDisplay();
  render();
  // If computer plays white... (not implemented for now)
}

document.addEventListener('DOMContentLoaded',()=>{
  setDifficulty('medium');
  setClockTime(10);
  render();
});
