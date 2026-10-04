// Wall time only requests fixed daily steps. Fractional real time is not GameState.
export class ClockDriver {
  constructor(simulation,{now=()=>performance.now(),interval=100}={}){
    this.simulation=simulation;this.now=now;this.carry=0;this.last=now();
    this.unsubscribe=simulation.subscribe(event=>{if(['pauseChanged','speedChanged','gameLoaded'].includes(event.type))this.reset();});
    this.timer=setInterval(()=>this.pump(),interval);
  }
  reset(){this.carry=0;this.last=this.now();}
  pump(){
    const current=this.now(),elapsed=Math.max(0,current-this.last);this.last=current;
    const clock=this.simulation.clock;if(clock.paused){this.carry=0;return;}
    // Cap suspension catch-up at one second; no background-tab spiral of work.
    this.carry+=Math.min(1000,elapsed)*clock.speed/1000;
    const count=Math.min(100,Math.floor(this.carry));if(!count)return;
    this.carry-=count;
    try{this.simulation.step(count);}catch(error){this.simulation.pause();this.error=error.message;}
  }
  dispose(){clearInterval(this.timer);this.unsubscribe();}
}
