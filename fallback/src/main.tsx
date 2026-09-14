import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Peer, { type DataConnection } from "peerjs";
import { ARTICLES } from "../../lib/articles.ts";
import { normalizeForTyping, remainingRoundMs, resolveWinner, scoreSubmission, STARTING_GAP } from "../../lib/game.ts";
import { applyPeerMessage, createPeerRoom, finishPeerRoom, normalizeRoomCode, replayPeerRoom, type PeerMessage, type PeerRoom, type Role } from "./peer-room.ts";
import "./style.css";

type WireMessage = PeerMessage | { type: "state"; room: PeerRoom } | { type: "replay-request" };
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, value => CODE_CHARS[value % CODE_CHARS.length]).join("");
}

function App() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(location.search).get("room")?.toUpperCase() || "");
  const [room, setRoom] = useState<PeerRoom | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const roomRef = useRef<PeerRoom | null>(null);

  const updateRoom = (next: PeerRoom) => { roomRef.current = next; setRoom(next); };
  const send = (message: WireMessage) => {
    const connection = connectionRef.current;
    if (connection?.open) connection.send(message);
  };
  const broadcast = (next: PeerRoom) => send({ type: "state", room: next });
  const startIfReady = (next: PeerRoom) => {
    if (next.status === "waiting" && next.police.ready && next.thief?.ready) {
      return applyPeerMessage(next, { type: "start", startedAt: Date.now() + 3000 });
    }
    return next;
  };
  const settle = (next: PeerRoom) => {
    if (next.status !== "playing" || !next.startedAt) return next;
    const winner = resolveWinner({
      policeProgress: next.police.progress,
      thiefProgress: next.thief?.progress || 0,
      elapsedMs: Date.now() - next.startedAt,
    });
    return winner ? finishPeerRoom(next, winner) : next;
  };

  useEffect(() => () => { connectionRef.current?.close(); peerRef.current?.destroy(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
      const current = roomRef.current;
      if (role === "police" && current?.status === "playing") {
        const next = settle(current);
        if (next !== current) { updateRoom(next); broadcast(next); }
      }
    }, 200);
    return () => clearInterval(timer);
  }, [role]);

  const acceptHostMessage = (message: WireMessage) => {
    const current = roomRef.current;
    if (!current) return;
    if (message.type === "join") {
      if (current.thief) { send({ type: "state", room: current }); return; }
      const next = applyPeerMessage(current, message);
      updateRoom(next); broadcast(next); return;
    }
    if (message.type === "ready" || message.type === "progress" || message.type === "start") {
      const next = settle(startIfReady(applyPeerMessage(current, message)));
      updateRoom(next); broadcast(next); return;
    }
    if (message.type === "replay-request" && current.status === "finished") {
      const next = replayPeerRoom(current, ARTICLES[current.round % ARTICLES.length]);
      setTyped(""); updateRoom(next); broadcast(next);
    }
  };

  const connectHandlers = (connection: DataConnection, isHost: boolean) => {
    connectionRef.current = connection;
    connection.on("data", data => {
      const message = data as WireMessage;
      if (!message || typeof message !== "object" || !("type" in message)) return;
      if (isHost) acceptHostMessage(message);
      else if (message.type === "state") { updateRoom(message.room); setError(""); }
    });
    connection.on("close", () => setError(isHost ? "对方已离开房间，可刷新页面重新创建" : "与房主的连接已断开，请重新加入"));
    connection.on("error", () => setError("联机通道出现异常，请刷新后重试"));
  };

  const createRoom = () => {
    setBusy(true); setError("");
    const code = randomCode();
    const peer = new Peer(`zisu-${code}`);
    peerRef.current = peer;
    peer.on("open", () => {
      setRole("police"); updateRoom(createPeerRoom(code, name, ARTICLES[Math.floor(Math.random() * ARTICLES.length)]));
      history.replaceState(null, "", `?room=${code}`); setBusy(false);
    });
    peer.on("connection", connection => {
      if (connectionRef.current?.open) { connection.close(); return; }
      connectHandlers(connection, true);
    });
    peer.on("error", event => { setBusy(false); setError(event.type === "unavailable-id" ? "房间号碰巧被占用，请重新创建" : "无法建立联机通道，请稍后重试"); });
  };

  const joinRoom = () => {
    const code = normalizeRoomCode(joinCode);
    if (!code) return setError("请输入正确的六位房间号");
    setBusy(true); setError("");
    const peer = new Peer(); peerRef.current = peer;
    peer.on("open", () => {
      const connection = peer.connect(`zisu-${code}`, { reliable: true });
      connectHandlers(connection, false);
      connection.on("open", () => { setRole("thief"); send({ type: "join", name }); setBusy(false); });
    });
    peer.on("error", event => { setBusy(false); setError(event.type === "peer-unavailable" ? "没有找到这个房间，请确认房主页面仍然打开" : "无法建立联机通道，请稍后重试"); });
  };

  const ready = () => {
    if (!room || !role) return;
    if (role === "police") {
      const next = startIfReady(applyPeerMessage(room, { type: "ready", role }));
      updateRoom(next); broadcast(next);
    } else send({ type: "ready", role });
  };

  const submitProgress = (value: string) => {
    setTyped(value);
    if (!room || !role || room.status !== "playing" || !room.startedAt || Date.now() < room.startedAt) return;
    const own = role === "police" ? room.police : room.thief;
    const score = scoreSubmission(room.article, value, own?.progress || 0);
    const message: PeerMessage = { type: "progress", role, progress: score.acceptedProgress, correct: score.correctChars, typed: score.typedChars };
    if (role === "police") { const next = settle(applyPeerMessage(room, message)); updateRoom(next); broadcast(next); }
    else send(message);
  };

  const replay = () => {
    if (!room) return;
    setTyped("");
    if (role === "police") { const next = replayPeerRoom(room, ARTICLES[room.round % ARTICLES.length]); updateRoom(next); broadcast(next); }
    else send({ type: "replay-request" });
  };

  if (!room) return <main className="landing-shell"><section className="lobby-card">
    <header className="brand"><span className="brand-mark">⚡</span><span>字速追逃</span><span className="backup-badge">独立联机入口</span></header>
    <div className="lobby-grid"><div className="lobby-copy"><span className="eyebrow">双人中文打字对战</span><h1>打得快，<br/><em>追得上。</em></h1><p>一个当警察，一个当小偷。两分钟里，每个正确的字都会改变追逐距离。</p><div className="mini-rules"><span>⏱ 2 分钟一局</span><span>👥 房间号联机</span><span>🔒 无需注册</span></div></div>
    <div className="join-panel"><label>你的昵称</label><input value={name} onChange={e=>setName(e.target.value)} maxLength={12} placeholder="例如：小明"/>
      <button className="primary" disabled={busy || !name.trim()} onClick={createRoom}>🛡 创建房间，当警察</button><div className="divider">或者加入朋友的房间</div>
      <label>六位房间号</label><div className="join-row"><input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0,6))} placeholder="例如：A7K2M9"/><button disabled={busy || !name.trim() || joinCode.length!==6} onClick={joinRoom}>加入</button></div>
      {busy && <p className="notice">正在建立联机通道……</p>}{error && <p className="error">{error}</p>}<p className="host-note">房主在对局期间请保持页面打开。</p>
    </div></div></section></main>;

  const own = role === "police" ? room.police : room.thief;
  const score = scoreSubmission(room.article, typed, own?.progress || 0);
  const started = !!room.startedAt && clock >= room.startedAt;
  const remaining = room.startedAt ? remainingRoundMs(room.startedAt, clock, room.durationMs) : room.durationMs;
  const elapsedMinutes = room.startedAt ? Math.max(.05, (clock-room.startedAt)/60000) : 1;
  const speed = Math.round((own?.progress || 0)/elapsedMinutes);
  const accuracy = own?.typed ? Math.round(own.correct/own.typed*100) : 100;
  const gap = STARTING_GAP + (room.thief?.progress || 0) - room.police.progress;
  const policeLeft = Math.min(67, Math.max(3, 67-Math.max(0,gap)*2.7));
  const article = normalizeForTyping(room.article), typedLength = normalizeForTyping(typed).length;
  const countdown = room.startedAt ? Math.max(0, Math.ceil((room.startedAt-clock)/1000)) : 0;
  const shareUrl = `${location.origin}${location.pathname}?room=${room.code}`;

  return <main className="game-shell"><header className="game-header"><div className="brand compact"><span className="brand-mark">⚡</span><span>字速追逃</span></div><button className="room-code" onClick={async()=>{await navigator.clipboard.writeText(shareUrl);setCopied(true);setTimeout(()=>setCopied(false),1500)}}>房间 <strong>{room.code}</strong> {copied?"✓":"⧉"}</button><span className="round-label">第 {room.round} 局</span></header>
    <section className="race-stage"><div className="sun"/><div className="distance-pill">{gap<=0?"抓到了！":`相距 ${Math.ceil(gap)} 米`}</div><div className="character police" style={{left:`${policeLeft}%`}}><span>{room.police.name}</span></div><div className="character thief"><span>{room.thief?.name||"等待加入"}</span></div><div className="road"/>{room.status==="playing"&&!started&&<div className="countdown">{countdown||"开始"}</div>}</section>
    <section className="game-board"><aside className="score-card police-score"><div>🛡 警察</div><strong>{room.police.name}</strong><b>{room.police.progress}<small> 字</small></b></aside>
    <div className="typing-card"><div className="typing-topline"><span className="timer">⏱ {String(Math.floor(remaining/60000)).padStart(2,"0")}:{String(Math.floor(remaining%60000/1000)).padStart(2,"0")}</span><span>⚡ {speed} 字/分</span><span>正确率 {accuracy}%</span></div>
      {room.status==="waiting"?<div className="center-panel"><div className="round-icon">👥</div><h2>{room.thief?"双方就位，准备出发":"房间已创建，等待朋友"}</h2><p>{room.thief?`${room.police.name} 对战 ${room.thief.name}`:`把房间号 ${room.code} 发给朋友`}</p><button className="primary ready" disabled={!room.thief||!!own?.ready} onClick={ready}>{own?.ready?"✓ 已准备，等待对方":"🏃 我准备好了"}</button></div>
      :room.status==="finished"?<div className="center-panel"><span className="result-stamp">本局结束</span><h2>{room.winner==="void"?"本局无人输入":room.winner===role?"你赢了！":"差一点，再来一局！"}</h2><p>{room.winner==="police"?"警察成功追上了小偷":room.winner==="thief"?"小偷坚持到了倒计时结束":"双方都没有开始打字"}</p><button className="primary ready" onClick={replay}>↻ 再来一局</button></div>
      :<><div className="article-text"><span className="done">{article.slice(0,score.correctChars)}</span><span className={typedLength>score.correctChars?"wrong":"cursor-char"}>{article.slice(score.correctChars,Math.max(score.correctChars+1,typedLength))}</span><span>{article.slice(Math.max(score.correctChars+1,typedLength),score.correctChars+180)}</span></div><label>从高亮位置继续输入</label><textarea value={typed} autoFocus disabled={!started} spellCheck={false} onPaste={e=>{e.preventDefault();setError("对战中不能粘贴文字")}} onChange={e=>submitProgress(e.target.value)} placeholder={started?"在这里开始输入……":"倒计时结束后即可输入"}/>{score.hasError&&<p className="typing-error">当前输入有误，请退格改正后继续</p>}</>}
      {error&&<p className="error">{error}</p>}</div>
    <aside className="score-card thief-score"><div>🏃 小偷</div><strong>{room.thief?.name||"等待朋友"}</strong><b>{room.thief?.progress||0}<small> 字</small></b></aside></section></main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
