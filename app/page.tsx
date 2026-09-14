"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock3, Copy, Footprints, RotateCcw, Shield, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { distanceGapMeters, normalizeForTyping, remainingRoundMs, scoreSubmission, STARTING_GAP } from "@/lib/game";

type Player = { name: string; ready: boolean; progress: number; correct: number; typed: number };
type Room = {
  code: string; status: "waiting" | "playing" | "finished"; round: number;
  role: "police" | "thief"; article: string; startedAt: number | null;
  serverNow: number; durationMs: number; winner: "police" | "thief" | "void" | null;
  police: Player; thief: Player | null;
};

async function api(body: Record<string, unknown>) {
  const response = await fetch("/api/game", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as { error?: string; token?: string; room?: Room };
  if (!response.ok) throw new Error(data.error || "操作失败，请稍后再试");
  return data;
}

export default function Home() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [token, setToken] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const composing = useRef(false);
  const seq = useRef(0);

  const acceptRoom = useCallback((next: Room) => {
    setRoom(next);
    setServerOffset(next.serverNow - Date.now());
    if (next.status === "finished") setTyped("");
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("zisu-room");
    if (!saved) return;
    try {
      const session = JSON.parse(saved) as { code: string; token: string; name: string; typed?: string };
      setName(session.name); setToken(session.token); setTyped(session.typed || "");
      fetch(`/api/game?code=${session.code}&token=${encodeURIComponent(session.token)}`)
        .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); acceptRoom(data.room); })
        .catch(() => sessionStorage.removeItem("zisu-room"));
    } catch { sessionStorage.removeItem("zisu-room"); }
  }, [acceptRoom]);

  useEffect(() => {
    if (!room || !token) return;
    const id = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/game?code=${room.code}&token=${encodeURIComponent(token)}`);
        const data = await response.json();
        if (response.ok) { acceptRoom(data.room); setError(""); }
        else setError(data.error || "连接中断，正在重试");
      } catch { setError("连接中断，正在重试"); }
    }, 500);
    return () => clearInterval(id);
  }, [room?.code, token, acceptRoom]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setError("");
    try {
      const data = await api({ action, code: room?.code || joinCode.toUpperCase(), token, name, ...extra });
      const nextToken = data.token || token;
      if (data.room) {
        setToken(nextToken); acceptRoom(data.room);
        sessionStorage.setItem("zisu-room", JSON.stringify({ code: data.room.code, token: nextToken, name, typed: "" }));
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败"); }
    finally { setBusy(false); }
  };

  const started = !!room?.startedAt && clock + serverOffset >= room.startedAt;
  const remaining = room?.startedAt ? remainingRoundMs(room.startedAt, clock + serverOffset, room.durationMs) : room?.durationMs || 120_000;
  const localScore = useMemo(() => room ? scoreSubmission(room.article, typed, 0) : null, [room?.article, typed]);
  const own = room ? (room.role === "police" ? room.police : room.thief) : null;
  const elapsedMinutes = room?.startedAt ? Math.max(1 / 60, ((clock + serverOffset) - room.startedAt) / 60_000) : 1;
  const speed = Math.round((own?.progress || 0) / Math.max(elapsedMinutes, 0.05));
  const accuracy = own?.typed ? Math.round((own.correct / own.typed) * 100) : 100;

  useEffect(() => {
    if (!room || !token || room.status !== "playing" || !started || composing.current) return;
    const id = window.setTimeout(async () => {
      try {
        const data = await api({ action: "sync", code: room.code, token, typed, seq: ++seq.current });
        if (data.room) acceptRoom(data.room);
        sessionStorage.setItem("zisu-room", JSON.stringify({ code: room.code, token, name, typed }));
      } catch { setError("输入进度同步失败，正在重试"); }
    }, 180);
    return () => clearTimeout(id);
  }, [typed, started, room?.status, room?.code, token, name, acceptRoom]);

  if (!room) {
    return <main className="landing-shell">
      <section className="lobby-card">
        <div className="brand"><span className="brand-mark"><Zap /></span><span>字速追逃</span></div>
        <div className="lobby-grid">
          <div className="lobby-copy">
            <span className="eyebrow">双人中文打字对战</span>
            <h1>打得快，<br/><em>追得上。</em></h1>
            <p>一个当警察，一个当小偷。两分钟里，每个正确的字都会改变两米追逐距离。</p>
            <div className="mini-rules"><span><Clock3/> 2 分钟一局</span><span><Users/> 房间号联机</span><span><Shield/> 无需注册</span></div>
          </div>
          <div className="join-panel">
            <label htmlFor="nickname">你的昵称</label>
            <Input id="nickname" value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="例如：小明" className="game-input" />
            <Button className="primary-action" size="lg" disabled={busy || !name.trim()} onClick={() => act("create")}><Shield/> 创建房间，当警察</Button>
            <div className="divider"><span>或者加入朋友的房间</span></div>
            <label htmlFor="room-code">六位房间号</label>
            <div className="join-row">
              <Input id="room-code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="例如：A7K2M9" className="game-input room-code-input" />
              <Button variant="outline" size="lg" disabled={busy || !name.trim() || joinCode.length !== 6} onClick={() => act("join")}>加入</Button>
            </div>
            {error && <p role="alert" className="error-message">{error}</p>}
          </div>
        </div>
      </section>
      <div className="corner-note">中文输入法友好 · 原创练习文章</div>
    </main>;
  }

  const gap = distanceGapMeters(room.police.progress, room.thief?.progress || 0);
  const policeLeft = Math.min(67, Math.max(3, 67 - Math.max(0, gap) * 2.7));
  const displayArticle = normalizeForTyping(room.article);
  const correct = localScore?.correctChars || 0;
  const typedLength = normalizeForTyping(typed).length;
  const countdown = room.startedAt ? Math.max(0, Math.ceil((room.startedAt - (clock + serverOffset)) / 1000)) : 0;

  return <main className="game-shell">
    <header className="game-header">
      <div className="brand compact"><span className="brand-mark"><Zap /></span><span>字速追逃</span></div>
      <button className="room-code" onClick={async () => { await navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label="复制房间号">
        房间 <strong>{room.code}</strong>{copied ? <Check/> : <Copy/>}
      </button>
      <span className="round-label">第 {room.round} 局</span>
    </header>

    <section className="race-stage" aria-label="警察追小偷比赛画面">
      <div className="sky-orb"/><div className="speed-lines"/>
      <div className="distance-pill">{gap <= 0 ? "抓到了！" : `相距 ${Math.ceil(gap)} 米`}</div>
      <div className="character police" style={{ left: `${policeLeft}%` }}><span>{room.police.name}</span></div>
      <div className="character thief" style={{ left: "72%" }}><span>{room.thief?.name || "等待加入"}</span></div>
      <div className="road"><i/><i/><i/><i/></div>
      {room.status === "playing" && !started && <div className="countdown">{countdown || "开始"}</div>}
    </section>

    <section className="game-board">
      <aside className="score-card police-score">
        <div className="player-title"><Shield/> 警察 <span>{room.police.ready ? "已准备" : "未准备"}</span></div>
        <strong>{room.police.name}</strong><b>{room.police.progress}<small> 字</small></b>
        <Progress value={Math.min(100, (room.police.progress / Math.max(1, STARTING_GAP / 2 + (room.thief?.progress || 0))) * 100)} />
      </aside>

      <div className="typing-card">
        <div className="typing-topline">
          <span className="timer"><Clock3/>{Math.floor(remaining / 60_000).toString().padStart(2,"0")}:{Math.floor((remaining % 60_000) / 1000).toString().padStart(2,"0")}</span>
          <span><Zap/> {speed} 字/分</span><span>正确率 {accuracy}%</span>
        </div>

        {room.status === "waiting" ? <div className="waiting-panel">
          <div className="waiting-icon"><Users/></div>
          <h2>{room.thief ? "双方就位，准备出发" : "房间已创建，等待朋友"}</h2>
          <p>{room.thief ? `${room.police.name} 对战 ${room.thief.name}` : `把房间号 ${room.code} 发给朋友`}</p>
          <Button size="lg" disabled={busy || !room.thief || !!own?.ready} onClick={() => act("ready")} className="ready-button">
            {own?.ready ? <><Check/> 已准备，等待对方</> : <><Footprints/> 我准备好了</>}
          </Button>
        </div> : room.status === "finished" ? <div className="result-panel">
          <span className="result-stamp">本局结束</span>
          <h2>{room.winner === "void" ? "本局无人输入" : room.winner === room.role ? "你赢了！" : "差一点，再来一局！"}</h2>
          <p>{room.winner === "police" ? "警察成功追上了小偷" : room.winner === "thief" ? "小偷坚持到了倒计时结束" : "双方都没有开始打字"}</p>
          <Button size="lg" onClick={() => { setTyped(""); seq.current = 0; act("replay"); }} disabled={busy}><RotateCcw/> 再来一局</Button>
        </div> : <>
          <div className="article-text" aria-label="需要输入的文章">
            <span className="done">{displayArticle.slice(0, correct)}</span>
            <span className={typedLength > correct ? "wrong" : "cursor-char"}>{displayArticle.slice(correct, Math.max(correct + 1, typedLength))}</span>
            <span>{displayArticle.slice(Math.max(correct + 1, typedLength), correct + 180)}</span>
          </div>
          <label htmlFor="typing-box">从高亮位置继续输入</label>
          <textarea id="typing-box" value={typed} disabled={!started || room.status !== "playing"} autoFocus spellCheck={false}
            onPaste={(event) => { event.preventDefault(); setError("对战中不能粘贴文字"); }}
            onDrop={(event) => event.preventDefault()}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={(event) => { composing.current = false; setTyped(event.currentTarget.value); }}
            onChange={(event) => setTyped(event.target.value)} placeholder={started ? "在这里开始输入……" : "倒计时结束后即可输入"}/>
          {localScore?.hasError && <p className="typing-error">当前输入有误，请退格改正后继续</p>}
        </>}
        {error && <p role="alert" className="error-message inline">{error}</p>}
      </div>

      <aside className="score-card thief-score">
        <div className="player-title"><Footprints/> 小偷 <span>{room.thief?.ready ? "已准备" : "未准备"}</span></div>
        <strong>{room.thief?.name || "等待朋友"}</strong><b>{room.thief?.progress || 0}<small> 字</small></b>
        <Progress value={Math.min(100, ((room.thief?.progress || 0) / Math.max(1, room.police.progress + STARTING_GAP)) * 100)} />
      </aside>
    </section>
  </main>;
}
