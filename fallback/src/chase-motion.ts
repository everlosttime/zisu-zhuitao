export function smoothPosition(current:number,target:number,dt:number){
  return current+(target-current)*(1-Math.exp(-Math.max(0,dt)*8));
}
export function chaseLayout(gap:number,role:'police'|'thief'){
  const separation=Math.min(22,Math.max(0,gap)*.65);
  const bias=role==='police'?-1:1;
  return {policeZ:separation/2+bias,thiefZ:-separation/2+bias,compressed:gap>30};
}
export function riderTravel(ownDelta:number,gapDelta:number,role:'police'|'thief'){
  return role==='police'?[Math.max(0,ownDelta),Math.max(0,ownDelta+gapDelta)]:[Math.max(0,ownDelta-gapDelta),Math.max(0,ownDelta)];
}
