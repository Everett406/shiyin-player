/* covers.js — 生成式封面（mock 阶段用，接 API 后用真实专辑图） */
(function(){
  function srand(s){let x=s*9301+49297;return()=>{x=(x*9301+49297)%233280;return x/233280}}
  function shade(h,a){const n=parseInt(h.slice(1),16),f=v=>Math.max(0,Math.min(255,v+a));
    return"#"+[f(n>>16),f(n>>8&255),f(n&255)].map(v=>v.toString(16).padStart(2,"0")).join("")}

  window.makeCover = function(s, size=300){
    const c=document.createElement("canvas");c.width=c.height=size;
    const x=c.getContext("2d"),rnd=srand(s.id*7+s.art*13),[a,b,d]=s.pal;
    const g=x.createLinearGradient(0,0,size,size);
    g.addColorStop(0,a);g.addColorStop(1,shade(a,-18));
    x.fillStyle=g;x.fillRect(0,0,size,size);
    x.globalAlpha=.9;
    const st=s.art%4;
    if(st===0){
      x.fillStyle=b;x.beginPath();x.arc(size*(.3+rnd()*.4),size*(.35+rnd()*.25),size*.22,0,7);x.fill();
      x.strokeStyle=d;x.lineWidth=size*.012;
      for(let i=0;i<5;i++){x.beginPath();x.arc(size/2,size*1.05,size*(.35+i*.14),Math.PI*1.15,Math.PI*1.85);x.stroke()}
    }else if(st===1){
      for(let i=0;i<6;i++){x.fillStyle=i%2?b:d;x.globalAlpha=.16+rnd()*.3;
        x.save();x.translate(size/2,size/2);x.rotate(-.6);
        x.fillRect(-size,-size+rnd()*size*2,size*2,size*(.05+rnd()*.12));x.restore()}
      x.globalAlpha=.95;x.fillStyle=d;x.beginPath();x.arc(size*.68,size*.34,size*.16,0,7);x.fill();
    }else if(st===2){
      x.strokeStyle=b;
      for(let i=1;i<9;i++){x.globalAlpha=.1+i*.09;x.lineWidth=size*(.008+rnd()*.01);
        x.beginPath();x.arc(size*(.2+rnd()*.6),size*(.2+rnd()*.6),i*size*.07,0,7);x.stroke()}
      x.globalAlpha=.9;x.fillStyle=d;x.beginPath();x.arc(size*.5,size*.5,size*.07,0,7);x.fill();
    }else{
      for(let l=0;l<3;l++){x.fillStyle=shade(a,14+l*16);x.globalAlpha=.85;x.beginPath();x.moveTo(0,size);
        for(let px=0;px<=size;px+=size/8)
          x.lineTo(px,size*(.35+l*.2)+Math.sin(px*.02+l*2+s.id)*size*.09+rnd()*size*.05);
        x.lineTo(size,size);x.fill()}
      x.globalAlpha=.95;x.fillStyle=b;x.beginPath();x.arc(size*.72,size*.26,size*.1,0,7);x.fill();
    }
    x.globalAlpha=.06;
    for(let i=0;i<size*2;i++){x.fillStyle=rnd()>.5?"#fff":"#000";x.fillRect(rnd()*size,rnd()*size,1,1)}
    return c.toDataURL();
  };
})();
