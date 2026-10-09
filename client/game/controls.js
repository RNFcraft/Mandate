import kernel from '../../shared/simulation.cjs';
import persistence from '../../shared/save.cjs';
import {ClockDriver} from './clock.js';
export function gameControls(simulation,hierarchy){
  const panel=document.createElement('section');panel.className='game-controls';panel.setAttribute('aria-label','Игра');
  panel.innerHTML='<output id="game-date" aria-label="Игровая дата"></output><button id="game-play">Играть</button><label>Скорость <select id="game-speed"></select></label><input id="game-save-id" aria-label="ID сохранения" maxlength="64"><button id="game-save">Сохранить игру</button><select id="game-saves" aria-label="Сохранённые игры"><option value="">Сохранения</option></select><button id="game-load">Загрузить</button><output id="game-status" role="status"></output>';
  document.body.append(panel);const el=id=>panel.querySelector('#'+id);
  for(const speed of kernel.SPEEDS)el('game-speed').add(new Option(`${speed}×`,speed));
  el('game-save-id').value=`save-${simulation.scenario.id}`;
  const driver=new ClockDriver(simulation);
  const refresh=()=>{const clock=simulation.clock,d=clock.date;el('game-date').textContent=`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;el('game-play').textContent=clock.paused?'Играть':'Пауза';el('game-play').setAttribute('aria-pressed',String(!clock.paused));el('game-speed').value=String(clock.speed);};
  const unsubscribe=simulation.subscribe(event=>{if(event.type==='workerError'){el('game-play').disabled=el('game-speed').disabled=true;el('game-status').textContent='Simulation worker stopped; reload a saved campaign.';}if(['timeAdvanced','speedChanged','pauseChanged','gameLoaded'].includes(event.type))refresh();});
  el('game-play').onclick=async()=>{const result=await Promise.resolve(simulation.submit({type:simulation.clock.paused?'ResumeSimulation':'PauseSimulation'})).catch(error=>({ok:false,error:error.message}));if(!result.ok)el('game-status').textContent=result.error;};
  el('game-speed').onchange=async()=>{const result=await Promise.resolve(simulation.submit({type:'SetSimulationSpeed',speed:Number(el('game-speed').value)})).catch(error=>({ok:false,error:error.message}));if(!result.ok)el('game-status').textContent=result.error;};
  const api=async(url,options)=>{const response=await fetch(url,options),data=await response.json();if(!response.ok)throw new Error(data.error);return data;};
  const listing=async(selected='')=>{const rows=await api('/api/saves');el('game-saves').replaceChildren(new Option('Сохранения',''));for(const row of rows)el('game-saves').add(new Option(`${row.id} · ${row.scenarioId}`,row.id));el('game-saves').value=selected;};
  let busy=false;
  const perform=async(action)=>{if(busy)return;busy=true;el('game-save').disabled=el('game-load').disabled=true;try{await action();}catch(error){el('game-status').textContent=error.message;}finally{busy=false;el('game-save').disabled=el('game-load').disabled=false;}};
  el('game-save').onclick=()=>perform(async()=>{const id=el('game-save-id').value.trim();if(!persistence.validSaveId(id))throw new Error('Некорректный ID сохранения');const body=simulation.save?await simulation.save():JSON.stringify(persistence.makeSave(await simulation.snapshot()));await api(`/api/saves/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body});await listing(id);el('game-status').textContent=`Сохранено: ${id}`;});
  el('game-load').onclick=()=>perform(async()=>{const id=el('game-saves').value;if(!id)throw new Error('Выберите сохранение');const response=await fetch(`/api/saves/${id}`);if(!response.ok)throw Error('Unable to load save');const text=await response.text();if(simulation.worker)await simulation.load(text);else{const save=JSON.parse(text);persistence.validateSave(save,hierarchy);simulation.load(save.state);}el('game-save-id').value=id;el('game-status').textContent=`Загружено: ${id}`;});
  refresh();listing().catch(error=>{el('game-status').textContent=error.message;});
  return {driver,dispose(){driver.dispose();unsubscribe();panel.remove();}};
}
