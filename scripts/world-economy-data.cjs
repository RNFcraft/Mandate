const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const json=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
async function loadWorldData(){
  const [hierarchy,adjacency,scenario,countries,ownership,population,controllers,politicalGeography,polities,polityRelations]=await Promise.all(['client/data/map-v2/hierarchy.json','client/data/map-v2/adjacency.json','scenarios/1700/scenario.json','scenarios/1700/countries.json','scenarios/1700/ownership.json','scenarios/1700/population.json','scenarios/1700/controllers.json','scenarios/1700/political-geography.json','scenarios/1700/polities.json','scenarios/1700/polity-relations.json'].map(json));
  return {hierarchy,adjacency,scenario:{scenario,countries,ownership,population,controllers,politicalGeography,polities,polityRelations}};
}
module.exports={loadWorldData};
