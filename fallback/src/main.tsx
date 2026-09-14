import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ARTICLES } from "../../lib/articles.ts";
import { distanceGapMeters, normalizeForTyping, remainingRoundMs, resolveWinner, scoreSubmission } from "../../lib/game.ts";
import { applyPeerMessage, createPeerRoom, estimateHostClockOffset, finishPeerRoom, normalizeRoomCode, replayPeerRoom, type PeerMessage, type PeerRoom, type Role } from "./peer-room.ts";
import "./style.css";
import "./cinema.css";
import RaceScene from "./RaceScene";
import ChaseAudio from "./ChaseAudio";
import { subtitleWindow } from "./subtitles";
import { createConnectionWatchdog, type ConnectionWatchdog } from "./connection";
import { connectRelay, type RelayConnection, type RelayStatus } from "./relay-transport";

type WireMessage = PeerMessage
  | { type: "state"; room: PeerRoom }
  | { type: "replay-request" }
  | { type: "clock-ping"; clientSentAt: number }
  | { type: "clock-pong"; clientSentAt: number; hostNow: number };
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
  const composing = useRef(false);
  const [imeDraft,setImeDraft] = useState<string|null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectionStage, setConnectionStage] = useState("");
  const [lastConnectionAction, setLastConnectionAction] = useState<"create" | "join" | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [hostOffset, setHostOffset] = useState(0);
  const [copied, setCopied] = useState(false);
  const relayRef = useRef<RelayConnection | null>(null);
  const roomRef = useRef<PeerRoom | null>(null);
  const attemptRef = useRef(0);
  const watchdogRef = useRef<ConnectionWatchdog | null>(null);
  const joinRetryRef = useRef<number | null>(null);
  const lastHeartbeatRef = useRef(0);

  const updateRoom = (next: PeerRoom) => { if (roomRef.current && next.round !== roomRef.current.round) setTyped(""); roomRef.current = next; setRoom(next); };
  const send = (message: WireMessage) => {
    relayRef.current?.send(message, message.type === "state");
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

  useEffect(() => () => {
    watchdogRef.current?.finish();
    if (joinRetryRef.current) clearInterval(joinRetryRef.current);
    relayRef.current?.close();
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      const current = roomRef.current;
      if (role === "police" && current) {
        const next = current.status === "playing" ? settle(current) : current;
        if (next !== current) updateRoom(next);
        if (next !== current || now - lastHeartbeatRef.current >= 1_500) {
          broadcast(next);
          lastHeartbeatRef.current = now;
        }
      }
    }, 200);
    return () => clearInterval(timer);
  }, [role]);
  useEffect(() => {
    if (role !== "thief") return;
    const ping = () => send({ type: "clock-ping", clientSentAt: Date.now() });
    ping();
    const timer = window.setInterval(ping, 5000);
    return () => clearInterval(timer);
  }, [role]);

  const acceptHostMessage = (message: WireMessage) => {
    const current = roomRef.current;
    if (!current) return;
    if (message.type === "clock-ping") {
      send({ type: "clock-pong", clientSentAt: message.clientSentAt, hostNow: Date.now() });
      return;
    }
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

  const failConnection = (attempt: number, action: "create" | "join") => {
    if (attempt !== attemptRef.current) return;
    attemptRef.current += 1;
    watchdogRef.current?.finish();
    if (joinRetryRef.current) clearInterval(joinRetryRef.current);
    joinRetryRef.current = null;
    relayRef.current?.close();
    relayRef.current = null;
    setBusy(false);
    setConnectionStage("");
    setError(action === "create"
      ? "无法连接实时联机服务器，请检查网络后点“重新创建”"
      : "没有收到房主响应。请确认房间号正确、房主页面保持打开，然后点“重新加入”");
  };

  const beginConnection = (stage: string, action: "create" | "join") => {
    attemptRef.current += 1;
    watchdogRef.current?.finish();
    if (joinRetryRef.current) clearInterval(joinRetryRef.current);
    joinRetryRef.current = null;
    relayRef.current?.close();
    relayRef.current = null;
    setBusy(true);
    setError("");
    setConnectionStage(stage);
    setLastConnectionAction(action);
    return attemptRef.current;
  };

  const relayStatus = (attempt: number, status: RelayStatus) => {
    if (attempt !== attemptRef.current) return;
    if (status === "online") {
      if (roomRef.current) setError("");
      return;
    }
    if (roomRef.current) setError("联机服务器短暂断开，正在自动重连……");
  };

  const createRoom = async () => {
    const attempt = beginConnection("正在连接实时联机服务器……", "create");
    const code = randomCode();
    watchdogRef.current = createConnectionWatchdog(20000, () => failConnection(attempt, "create"));
    try {
      const relay = await connectRelay({
        code,
        role: "police",
        onMessage: data => {
          if (attempt !== attemptRef.current || !data || typeof data !== "object" || !("type" in data)) return;
          acceptHostMessage(data as WireMessage);
        },
        onStatus: status => relayStatus(attempt, status),
      });
      if (attempt !== attemptRef.current) { relay.close(); return; }
      relayRef.current = relay;
      watchdogRef.current?.finish();
      const next = createPeerRoom(code, name, ARTICLES[Math.floor(Math.random() * ARTICLES.length)]);
      setRole("police"); updateRoom(next); relay.send({ type: "state", room: next }, true);
      history.replaceState(null, "", `?room=${code}`); setBusy(false); setConnectionStage("");
    } catch {
      failConnection(attempt, "create");
    }
  };

  const joinRoom = async () => {
    const code = normalizeRoomCode(joinCode);
    if (!code) return setError("请输入正确的六位房间号");
    const attempt = beginConnection("正在连接实时联机服务器……", "join");
    watchdogRef.current = createConnectionWatchdog(22000, () => failConnection(attempt, "join"));
    try {
      const relay = await connectRelay({
        code,
        role: "thief",
        onMessage: data => {
          if (attempt !== attemptRef.current || !data || typeof data !== "object" || !("type" in data)) return;
          const message = data as WireMessage;
          if (message.type === "state" && message.room.code === code) {
            updateRoom(message.room); setRole("thief"); setError(""); setBusy(false); setConnectionStage("");
            watchdogRef.current?.finish();
            if (joinRetryRef.current) clearInterval(joinRetryRef.current);
            joinRetryRef.current = null;
          } else if (message.type === "clock-pong") {
            setHostOffset(estimateHostClockOffset(message.clientSentAt, Date.now(), message.hostNow));
          }
        },
        onStatus: status => relayStatus(attempt, status),
      });
      if (attempt !== attemptRef.current) { relay.close(); return; }
      relayRef.current = relay;
      setConnectionStage("已连接服务器中继，正在寻找房主……");
      const announce = () => relay.send({ type: "join", name });
      announce();
      if (watchdogRef.current?.pending) joinRetryRef.current = window.setInterval(announce, 1_500);
    } catch {
      failConnection(attempt, "join");
    }
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
    const synchronizedNow = Date.now() + (role === "thief" ? hostOffset : 0);
    if (!room || !role || room.status !== "playing" || !room.startedAt || synchronizedNow < room.startedAt) return;
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
  const synchronizedClock = clock + (role === "thief" ? hostOffset : 0);
  const started = !!room?.startedAt && synchronizedClock >= room.startedAt;
  useEffect(() => { if(started && room?.status === 'playing') inputRef.current?.focus(); }, [started, room?.status]);

  if (!room) return <main className="cinema-lobby">
    <RaceScene gap={18} progress={0} running role="police" cinematic/>
    <div className="lobby-shade"/>
    <header className="cinema-brand"><span className="brand-symbol">Z</span> 字速追逃 <small>3D CHASE</small></header>
    <section className="lobby-intro"><span className="overline">中文打字 · 双人实时追逐</span><h1>下一秒，<br/>追上你。</h1><p>穿过街道，紧追不舍。<br/>每一个正确的字，让你前进两米。</p><div className="lobby-tags"><span>方块小镇 · 坐骑追逐</span><span>字幕式打字</span><span>120 秒追逐</span></div></section>
    <section className="connection-panel"><span className="overline">准备进入街道</span><h2>和朋友跑一场</h2><label htmlFor="nickname">你的昵称</label><input id="nickname" value={name} onChange={e=>setName(e.target.value)} maxLength={8} placeholder="输入你的名字"/>
      <button className="primary" disabled={busy || !name.trim()} onClick={createRoom}>创建房间 · 扮演警察 <span>↗</span></button><div className="divider">已有房间？加入追逐</div>
      <label htmlFor="roomcode">六位房间号</label><div className="join-row"><input id="roomcode" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0,6))} placeholder="A7K2M9"/><button disabled={busy || !name.trim() || joinCode.length!==6} onClick={joinRoom}>{error && lastConnectionAction === "join" ? "重新加入" : "加入"}</button></div>
      {busy && <p className="notice" aria-live="polite">{connectionStage}</p>}{error && <p role="alert" className="error">{error}</p>}<p className="host-note">使用实时服务器转发，无需点对点穿透。双方对局时请保持页面打开。</p>
    </section><footer className="lobby-footer">双手就位。目光向前。 <span>每字 2 米 / 初始间距 20 米</span></footer>
  </main>;

  const own = role === "police" ? room.police : room.thief;
  const score = scoreSubmission(room.article, typed, own?.progress || 0);
  const remaining = room.startedAt ? remainingRoundMs(room.startedAt, synchronizedClock, room.durationMs) : room.durationMs;
  const elapsedMinutes = room.startedAt ? Math.max(.05, (synchronizedClock-room.startedAt)/60000) : 1;
  const speed = Math.round((own?.progress || 0)/elapsedMinutes);
  const accuracy = own?.typed ? Math.round(own.correct/own.typed*100) : 100;
  const gap = distanceGapMeters(room.police.progress, room.thief?.progress || 0);
  const subtitle=subtitleWindow(room.article,score.correctChars);
  const completed=Math.max(0,score.correctChars-subtitle.start);
  const countdown = room.startedAt ? Math.max(0, Math.ceil((room.startedAt-synchronizedClock)/1000)) : 0;
  const shareUrl = `${location.origin}${location.pathname}?room=${room.code}`;
  const currentInput=typed.slice(subtitle.start);

  return <main className={`chase-game voxel-game ${gap < 10 ? "danger-near" : ""}`}>
    <ChaseAudio gap={gap} running={room.status==='playing'&&started}/>
    <RaceScene gap={gap} progress={own?.progress||0} running={room.status==='playing'&&started} role={role||'police'}/>
    <div className="scene-vignette"/>
    <header className="chase-hud"><div className="cinema-brand"><span className="brand-symbol">Z</span> 字速追逃 <small>3D</small></div><button className="share-room" onClick={async()=>{try {await navigator.clipboard.writeText(shareUrl);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{setError(`请手动分享房间号：${room.code}`);}}}>房间 {room.code} <span>{copied?'已复制':'复制邀请'}</span></button><span className="hud-round">第 {room.round} 局</span></header>
    <div className="race-summary"><span className="overline">{role==='police'?'你的目标：追上前方的小偷':'你的目标：坚持到倒计时结束'}</span><div className="distance-number">{Math.max(0,Math.ceil(gap))}<small>米</small></div><span className="distance-caption">{gap<=0?'追捕成功':gap>30?'真实距离 · 画面间距已压缩':'双方距离'}</span></div>
    {room.status === "playing" && <div role="status" className={`chase-pressure ${gap < 10 ? "is-danger" : ""}`}>{gap < 10 ? (role === "thief" ? "警察就在身后！继续打字加速" : "马上追上！继续打字冲刺") : (role === "thief" ? "留意身后的摩托 · 打字拉开距离" : "盯紧前方自行车 · 打字追近")}</div>}
    <aside className="players-hud"><div><i className="police-dot"/><span>警察 · {room.police.name}</span><b>{room.police.progress*2} 米</b></div><div><i className="thief-dot"/><span>小偷 · {room.thief?.name||'等待加入'}</span><b>{(room.thief?.progress||0)*2} 米</b></div></aside>
    <div className="timer-hud"><span>剩余时间</span><strong>{String(Math.floor(remaining/60000)).padStart(2,'0')}:{String(Math.floor(remaining%60000/1000)).padStart(2,'0')}</strong></div>
    {room.status==='playing'&&!started&&<div className="start-count"><small>双手就位 · 即将出发</small><strong>{countdown||'开始'}</strong></div>}
    {room.status==='waiting'?<section className="race-modal"><span className="overline">{room.thief?'对手已就位':'街道已经准备好'}</span><h2>{room.thief?'准备，开始追逐':'等待朋友加入'}</h2><p>{room.thief?`${room.police.name} 对战 ${room.thief.name}`:`把房间号 ${room.code} 发给朋友`}</p><button className="primary" disabled={!room.thief||!!own?.ready} onClick={ready}>{own?.ready?'已准备 · 等待对方':'我准备好了 →'}</button><small>每字两米，初始相距二十米。</small></section>
    :room.status==='finished'?<section className="race-modal"><span className="overline">本局结束</span><h2>{room.winner==='void'?'本局无人输入':room.winner===role?'这次，你赢了。':'再来，一定追上。'}</h2><p>{room.winner==='police'?'警察成功追上小偷':room.winner==='thief'?'小偷坚持到了最后一秒':'准备好后再出发'}</p><button className="primary" onClick={replay}>再来一局 ↗</button></section>
    :<section className="subtitle-deck" aria-label="打字字幕"><div className="subtitle-meta"><span>跟着字幕，继续向前</span><span>{speed} 字/分 <i/> 正确率 {accuracy}%</span></div><div className="chinese-subtitle" aria-label="当前中文字幕"><span className="subtitle-done">{subtitle.text.slice(0,completed)}</span><span className={score.hasError?'subtitle-wrong':'subtitle-current'}>{subtitle.text.slice(completed,completed+1)}</span><span>{subtitle.text.slice(completed+1)}</span></div><label className="sr-only" htmlFor="subtitle-input">输入当前字幕</label><textarea ref={inputRef} id="subtitle-input" rows={1} value={imeDraft ?? currentInput} disabled={!started} spellCheck={false} onPaste={e=>{e.preventDefault();setError('对战中不能粘贴文字');}} onDrop={e=>e.preventDefault()} onCompositionStart={e=>{composing.current=true;setImeDraft(e.currentTarget.value);}} onCompositionEnd={e=>{composing.current=false;setImeDraft(null);submitProgress(typed.slice(0,subtitle.start)+e.currentTarget.value);}} onChange={e=>{if(composing.current)setImeDraft(e.target.value);else submitProgress(typed.slice(0,subtitle.start)+e.target.value);}} placeholder={started?'在这里输入上方字幕……':'倒计时结束后开始输入'}/><div className="subtitle-hint">{score.hasError?'有个字打错了，退格修正后继续':'中文输入法可用 · 中英文标点通用 · 每字前进 2 米'}</div></section>}
    {error&&<p role="alert" className="floating-error">{error}</p>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
