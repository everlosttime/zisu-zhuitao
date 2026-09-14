import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { chaseLayout, smoothPosition, riderTravel } from './chase-motion';

type Props={gap:number;progress:number;running:boolean;role:'police'|'thief';cinematic?:boolean};
export default function RaceScene(props:Props){
  const mount=useRef<HTMLDivElement>(null),latest=useRef(props);latest.current=props;
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const container=mount.current!;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});}catch{setFailed(true);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#9ecab4');
    const camera=new THREE.OrthographicCamera(-25,25,25,-25,.1,180);
    scene.add(new THREE.HemisphereLight('#eaf7ff','#587744',2.5));
    const sun=new THREE.DirectionalLight('#fff0c4',3);sun.position.set(-18,35,15);sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-38,right:38,top:45,bottom:-45,near:1,far:100});sun.shadow.bias=-.001;scene.add(sun);
    const geometry=new THREE.BoxGeometry(1,1,1),materials=new Map<string,THREE.MeshLambertMaterial>();
    const box=(parent:THREE.Object3D,color:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{
      if(!materials.has(color))materials.set(color,new THREE.MeshLambertMaterial({color}));
      const mesh=new THREE.Mesh(geometry,materials.get(color));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
    };
    box(scene,'#769c50',0,-.45,0,130,.7,170);
    box(scene,'#525f62',0,-.06,0,12,.16,170);
    for(const side of [-1,1]){box(scene,'#ded3ad',side*7,.02,0,2,.25,170);box(scene,'#f3e8c5',side*6,.1,0,.22,.25,170);}
    const street=new THREE.Group();scene.add(street);
    for(let i=0;i<18;i++){
      const segment=new THREE.Group();street.add(segment);
      box(segment,'#ebdda8',0,.04,0,.16,.03,3);
      for(const side of [-1,1]){
        const x=side*(12+(i%3)),h=2.5+(i%3)*.8;
        if(i%3!==0){
          const color=['#d8b484','#a7beb3','#cf9a78'][i%3];
          box(segment,color,x,h/2,0,5,h,5);
          box(segment,'#644b43',x,h+.15,0,5.6,.3,5.6);
          box(segment,i%2?'#ad6350':'#5b7873',x,h+.5,0,4.6,.45,4.6);
          box(segment,'#688e9b',x-side*2.52,1.8,-1,.08,.9,1);
          box(segment,'#688e9b',x-side*2.52,1.8,1,.08,.9,1);
          box(segment,'#7b5b42',x-side*2.53,.75,0,.1,1.5,.6);
          for(let tile=0;tile<5;tile++)box(segment,'#bbcaab',side*9,.18,tile-2,1,.12,.75);
        }
        const treeX=side*(9.3+(i%3===0?1:9));
        box(segment,'#806044',treeX,1.1,2,.55,2.2,.55);
        box(segment,'#3c734c',treeX,2.7,2,2.8,1.7,2.8);
        box(segment,'#5b9853',treeX-.3,3.8,1.8,2,1,2);
        for(let k=0;k<3;k++)box(segment,k%2?'#f3cc6c':'#c0d17a',side*(8.6+k*.6),.28,-2,.3,.4,.3);
        if(i%3===0){box(segment,'#565b51',side*7.4,1.8,-2,.18,3.6,.18);box(segment,'#ffe7a1',side*7.4,3.6,-2,.65,.4,.65);}
      }
    }
    function rider(police:boolean){
      const root=new THREE.Group();scene.add(root);
      const wheels:THREE.Group[]=[];
      for(const z of [-1.15,1.15]){
        const wheel=new THREE.Group();wheel.position.set(0,.58,z);root.add(wheel);wheels.push(wheel);
        // Square-edged eight-sided wheels keep the voxel silhouette while rotating smoothly.
        for(let n=0;n<8;n++){
          const a=n*Math.PI/4;
          const tread=box(wheel,'#26332e',0,Math.cos(a)*.43,Math.sin(a)*.43,police?.48:.23,.38,.38);tread.rotation.x=-a;
        }
        box(wheel,'#d1d9c8',0,0,0,police?.53:.28,.12,.8);box(wheel,'#d1d9c8',0,0,0,police?.53:.28,.8,.12);
      }
      box(root,police?'#e6e7cf':'#e3a34d',0,1,0,police?.8:.17,.23,2.2);
      const fork=box(root,'#a6b4ad',0,1.07,-1.03,.13,1.2,.15);fork.rotation.x=-.2;
      box(root,'#364840',0,1.65,-1.18,1.05,.12,.15);
      box(root,'#303a37',0,1.25,.37,.65,.16,.65);
      if(police){
        box(root,'#f0ead3',0,1.45,-.48,.85,.65,.75);
        box(root,'#35618a',0,1.82,-.6,.8,.18,.45);
        box(root,'#f5dc85',0,1.43,-.89,.45,.25,.06);
        for(const side of [-1,1])box(root,'#264d70',side*.55,1.02,.9,.35,.55,.65);
      }else{const frame=box(root,'#efb64e',0,1.05,.2,.13,.8,1.4);frame.rotation.x=.5;}
      const body=new THREE.Group();body.position.set(0,1.35,.15);root.add(body);
      box(body,police?'#346e9d':'#cf6e45',0,.55,0,.72,.8,.43);
      box(body,'#dcb58e',0,1.22,-.12,.52,.52,.52);
      box(body,police?'#243e5c':'#705735',0,1.5,-.1,.59,.17,.59);
      box(body,'#253b38',0,1.23,-.39,.4,.12,.05);
      if(!police)box(body,'#756b41',0,.62,.32,.58,.65,.3);
      const legs:THREE.Group[]=[];
      for(const side of [-1,1]){
        const arm=box(body,police?'#346e9d':'#cf6e45',side*.45,.65,-.38,.22,.23,.85);arm.rotation.x=-.25;
        box(body,'#dcb58e',side*.45,.7,-.8,.22,.2,.22);
        const leg=new THREE.Group();leg.position.set(side*.32,.1,0);body.add(leg);legs.push(leg);
        box(leg,'#334b55',0,-.2,-.22,.25,.55,.3);box(leg,'#eadfbe',0,-.51,-.32,.3,.2,.45);
      }
      const lights=[box(root,'#ec564f',-.24,1.35,1,.24,.2,.3),box(root,'#73c1ff',.24,1.35,1,.24,.2,.3)];
      if(!police)lights.forEach(l=>l.visible=false);
      const marker=box(root,police?'#68b8ff':'#ffce74',0,.035,0,1.65,.035,3.3);
      const dust:THREE.Mesh[]=[];
      for(let i=0;i<7;i++)dust.push(box(root,'#ddcda1',(i%3-1)*.4,.2,1.8+i*.25,.2,.2,.2));
      return {root,wheels,body,legs,lights,marker,dust};
    }
    const police=rider(true),thief=rider(false);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let previous=performance.now(),frame=0,time=0,distance=latest.current.progress*2,gap=latest.current.gap;
    let oldTarget=distance;const wheelPhases=[0,0];
    const labelElements=[...container.querySelectorAll<HTMLElement>('.rider-label')];
    const resize=()=>{renderer.setSize(container.clientWidth,container.clientHeight,false);};
    const observer=new ResizeObserver(resize);observer.observe(container);resize();
    const animate=(now:number)=>{
      const dt=Math.min((now-previous)/1000,.05);previous=now;time+=dt;
      const p=latest.current,target=p.cinematic?time*3:p.progress*2;
      if(target<oldTarget){distance=target;gap=p.gap;}oldTarget=target;
      const next=smoothPosition(distance,target,dt),delta=next-distance;distance=next;
      const oldGap=gap;gap=smoothPosition(gap,p.gap,dt);
      const layout=chaseLayout(gap,p.role);
      const travels=riderTravel(delta,gap-oldGap,p.role);
      const speeds=travels.map(travel=>p.running?Math.min(15,travel/Math.max(dt,.001)):0);
      street.children.forEach((segment,i)=>segment.position.z=60-((i*8-distance)%144+144)%144);
      police.root.position.set(-1.15,0,layout.policeZ);thief.root.position.set(1.15,0,layout.thiefZ);
      [police,thief].forEach((r,i)=>{
        const speed=speeds[i];
        wheelPhases[i]+=p.running?travels[i]*1.8:0;
        const phase=p.cinematic?time*5:wheelPhases[i];
        r.wheels.forEach(w=>w.rotation.x=reduced?0:phase);
        r.body.position.y=1.35+(reduced?0:Math.sin(phase*2)*Math.min(.035,speed*.004));
        r.root.rotation.z=reduced?0:Math.sin(time*2+i)*Math.min(.06,speed*.008);
        if(i===1)r.legs.forEach((leg,j)=>leg.rotation.x=reduced?0:Math.sin(phase+j*Math.PI)*Math.min(.6,speed*.12));
        r.marker.visible=(i===0)===(p.role==='police');
        r.lights.forEach((light,j)=>light.visible=i===0&&(!p.running||Math.sin(time*9+j*Math.PI)>0));
        r.dust.forEach((dust,j)=>{dust.visible=!reduced&&speed>1;dust.position.z=1.8+(time*speed*.4+j*.4)%3;dust.position.y=.15+(j%3)*.1;});
      });
      const aspect=container.clientWidth/Math.max(1,container.clientHeight);
      const vertical=Math.max(22,20/Math.max(.55,aspect));
      camera.left=-vertical*aspect;camera.right=vertical*aspect;camera.top=vertical;camera.bottom=-vertical;camera.updateProjectionMatrix();
      camera.position.set(16,35,24);camera.lookAt(0,0,0);
      renderer.render(scene,camera);
      [police,thief].forEach((r,i)=>{
        const point=new THREE.Vector3(r.root.position.x,3.7,r.root.position.z).project(camera),label=labelElements[i];
        if(label){label.style.left=`${(point.x*.5+.5)*100}%`;label.style.top=`${(-point.y*.5+.5)*100}%`;label.textContent=`${i===0?'警察 · 摩托':'小偷 · 自行车'}${(i===0)===(p.role==='police')?' · 你':''}`;}
      });
      frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();geometry.dispose();materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div ref={mount} className="three-scene voxel-scene" aria-label="斜俯视方块小镇：警察摩托追逐小偷自行车"><span className="rider-label police-label"/><span className="rider-label thief-label"/>{failed&&<p className="webgl-error">当前浏览器未能开启 3D，请启用硬件加速或换用 Chrome / Edge。打字和联机仍可使用。</p>}</div>;
}
