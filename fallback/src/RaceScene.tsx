import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type Props = {gap:number; progress:number; running:boolean; role:'police'|'thief'; cinematic?:boolean};

export default function RaceScene(props: Props) {
  const mount=useRef<HTMLDivElement>(null);
  const latest=useRef(props); latest.current=props;
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const container=mount.current!;
    let renderer:THREE.WebGLRenderer;
    try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'}); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.2;
    container.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    scene.background=new THREE.Color('#b6c9d5');
    scene.fog=new THREE.Fog('#b6c9d5',48,145);
    const camera=new THREE.PerspectiveCamera(57,1,.1,220);
    scene.add(new THREE.HemisphereLight('#e6f4ff','#807665',2.2));
    const sunlight=new THREE.DirectionalLight('#ffdcad',3.4);
    sunlight.position.set(-25,40,-25); sunlight.castShadow=true;
    sunlight.shadow.mapSize.set(1024,1024);
    Object.assign(sunlight.shadow.camera,{left:-35,right:35,top:40,bottom:-40,near:1,far:120});
    sunlight.shadow.bias=-.0005; scene.add(sunlight);
    const materials=new Map<string,THREE.MeshStandardMaterial>();
    const material=(color:string)=>{
      if(!materials.has(color)) materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.8}));
      return materials.get(color)!;
    };
    const cube=new THREE.BoxGeometry(1,1,1);
    const box=(parent:THREE.Object3D,color:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{
      const mesh=new THREE.Mesh(cube,material(color)); mesh.position.set(x,y,z);mesh.scale.set(w,h,d);
      mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
    };
    box(scene,'#3a424a',0,-.14,-55,15,.25,230);
    box(scene,'#b8b7ae',-10,0,-55,5,.35,230);
    box(scene,'#b8b7ae',10,0,-55,5,.35,230);
    const street=new THREE.Group();scene.add(street);
    for(let i=0;i<24;i++) {
      const segment=new THREE.Group(); segment.position.z=15-i*9;street.add(segment);
      box(segment,'#eee6c8',0,.012,0,.13,.025,3);
      for(const side of [-1,1]) {
        box(segment,'#eee6c8',side*6.5,.015,0,.1,.025,8.9);
        const height=8+(i*7%13); const color=['#76909a','#c0b7a4','#9d9e91','#9ea8b6'][i%4];
        box(segment,color,side*16,height/2,0,9,height,8.5);
        box(segment,'#e1daca',side*11.4,3.5,0,.4,.4,8.6);
        box(segment,i%2?'#234a50':'#7d523b',side*11.35,2,0,.3,2.5,6);
        for(let y=5;y<height-1;y+=3) for(let z=-2.5;z<=2.5;z+=2.5) {
          box(segment,'#263b49',side*11.45,y,z,.12,1.7,1.25);
          box(segment,'#d7cfb3',side*11.3,y-.95,z,.35,.15,1.5);
        }
        if(i%2===0) {
          box(segment,'#304049',side*8.6,3.3,-3,.13,6.6,.13);
          box(segment,'#304049',side*7.9,6.6,-3,1.6,.14,.16);
          const lamp=box(segment,'#fff1be',side*7.2,6.5,-3,.7,.12,.4);
          if(i%4===0) {
            box(segment,'#725941',side*9.8,1.4,2,.3,2.8,.3);
            const leaves=new THREE.Mesh(new THREE.IcosahedronGeometry(1.6,1),material('#527762'));
            leaves.position.set(side*9.8,3.7,2); leaves.scale.y=1.3;leaves.castShadow=true;segment.add(leaves);
          }
        }
        if(i%5===1) {
          const car=new THREE.Group(); car.position.set(side*5.2,0,0);segment.add(car);
          box(car,['#a5babc','#b58166','#8392a7'][i%3],0,.65,0,1.7,.65,3.7);
          box(car,'#263f4e',0,1.15,-.15,1.45,.65,1.9);
          for(const x of [-.85,.85]) for(const z of [-1.1,1.1]) box(car,'#202629',x,.35,z,.22,.65,.65);
        }
      }
    }
    function runner(police:boolean) {
      const root=new THREE.Group();scene.add(root);
      const suit=police?'#244d80':'#b9573d';
      box(root,suit,0,1.35,0,.66,.8,.4);
      box(root,'#252d38',0,.91,0,.67,.12,.43);
      box(root,'#d9b18b',0,1.98,0,.4,.43,.4);
      box(root,police?'#18324f':'#322e2c',0,2.22,0,.46,.13,.46);
      if(police) {box(root,'#d6c077',-.19,1.57,-.215,.1,.15,.02);box(root,'#19314b',0,2.2,-.24,.5,.05,.22);}
      else box(root,'#564336',0,1.42,.32,.5,.65,.32);
      const limbs:THREE.Group[]=[];
      for(const side of [-1,1]) {
        const leg=new THREE.Group();leg.position.set(side*.2,.95,0);root.add(leg);
        box(leg,'#273344',0,-.38,0,.24,.75,.27);box(leg,'#182129',0,-.77,-.08,.27,.16,.45);limbs.push(leg);
        const arm=new THREE.Group();arm.position.set(side*.44,1.65,0);root.add(arm);
        box(arm,suit,0,-.23,0,.22,.5,.23);box(arm,'#d9b18b',0,-.52,-.02,.19,.14,.22);limbs.push(arm);
      }
      return {root,limbs};
    }
    const police=runner(true),thief=runner(false);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let distance=0,time=0,previous=performance.now(),frame=0;
    const resize=()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(container);resize();
    const animate=(now:number)=>{
      const dt=Math.min((now-previous)/1000,.05);previous=now;const p=latest.current;
      const target=p.cinematic?time*1.7:p.progress*2;
      distance+=(target-distance)*(1-Math.exp(-dt*5));time+=dt;
      street.children.forEach((seg,i)=>{seg.position.z=25-(((i*9-distance)%216+216)%216);});
      const gap=Math.max(1,Math.min(65,p.gap));
      const anchor=p.role==='thief'&&!p.cinematic?gap:0;
      police.root.position.set(-.9,0,anchor);thief.root.position.set(.9,0,-gap+anchor);
      for(const [idx,r] of [police,thief].entries()) {
        const run=p.running&&!reduced;
        r.root.position.y=run?Math.abs(Math.sin(time*10+idx))*.08:0;
        r.limbs.forEach((limb,j)=>{limb.rotation.x=run?Math.sin(time*10+idx+(j<2?0:Math.PI))*(j%2?-.6:.75):0;});
        r.root.rotation.x=run?-.08:0;
      }
      const cameraX=p.role==='thief'?.9:-.9;
      camera.position.set(cameraX,4.6,8.7);camera.lookAt(cameraX,1.15,-12);
      if(p.cinematic){camera.position.set(4.8,5.5,10.5);camera.lookAt(0,1,-15);}
      renderer.render(scene,camera);frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div ref={mount} className="three-scene" aria-label="3D 城市警察追小偷场景">{failed&&<p className="webgl-error">当前浏览器未能开启 3D，请启用硬件加速或换用 Chrome / Edge。打字和联机仍可使用。</p>}</div>;
}
