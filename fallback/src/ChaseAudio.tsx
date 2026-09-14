import { useEffect, useRef, useState } from 'react';

export default function ChaseAudio({gap,running}:{gap:number;running:boolean}){
  const [enabled,setEnabled]=useState(false);
  const audio=useRef<{context:AudioContext;oscillator:OscillatorNode;gain:GainNode}|null>(null);
  const latest=useRef({gap,running});latest.current={gap,running};
  useEffect(()=>{
    if(!enabled)return;
    const timer=setInterval(()=>{
      const a=audio.current;if(!a)return;
      const active=latest.current.running&&!document.hidden;
      const proximity=Math.max(0,1-latest.current.gap/45);
      a.gain.gain.setTargetAtTime(active?.003+proximity*.035:0,a.context.currentTime,.15);
      a.oscillator.frequency.setTargetAtTime(560+Math.sin(Date.now()/260)*150,a.context.currentTime,.08);
    },80);
    return()=>clearInterval(timer);
  },[enabled]);
  useEffect(()=>()=>{audio.current?.oscillator.stop();void audio.current?.context.close();},[]);
  const toggle=async()=>{
    if(enabled){if(audio.current)audio.current.gain.gain.value=0;setEnabled(false);return;}
    try{
      if(!audio.current){const context=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain();gain.gain.value=0;oscillator.type='sine';oscillator.connect(gain);gain.connect(context.destination);oscillator.start();audio.current={context,oscillator,gain};}
      await audio.current.context.resume();setEnabled(true);
    }catch{setEnabled(false);}
  };
  return <button className="sound-toggle" aria-pressed={enabled} onClick={toggle}>{enabled?'警笛：开':'警笛：关'}</button>;
}
