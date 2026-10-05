const {validateGameState}=require('./simulation.cjs');
const {TAG}=require('./scenario.cjs');
const validSaveId=id=>typeof id==='string'&&TAG.test(id)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id);
function makeSave(state){return {format:'mandate-save',version:1,geography:state.geography,scenarioId:state.game.scenario.id,state:structuredClone(state)};}
function validateSave(save,hierarchy){
  if(!save||save.format!=='mandate-save'||save.version!==1||Object.keys(save).sort().join(',')!=='format,geography,scenarioId,state,version')throw new Error('Unsupported save format');
  if(save.geography!==hierarchy.id)throw new Error('Incompatible geography');
  validateGameState(save.state,hierarchy);
  if(save.geography!==save.state.geography||save.scenarioId!==save.state.game.scenario.id)throw new Error('Inconsistent save metadata');
  return save;
}
module.exports={makeSave,validateSave,validSaveId};
