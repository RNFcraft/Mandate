async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
export const listScenarios = () => request('/api/scenarios');
export const loadScenario = (id,{population=false,politicalPreview=false}={}) => {
  const query=new URLSearchParams();if(population)query.set('population','1');if(politicalPreview){const value=politicalPreview===true?'1':politicalPreview;if(!['1','mandate-world-v1'].includes(value))throw Error('Unknown political preview dataset');query.set('politicalPreview',value);}
  return request(`/api/scenarios/${encodeURIComponent(id)}${query.size?'?'+query.toString():''}`);
};
export const saveScenario = data => request(`/api/scenarios/${encodeURIComponent(data.scenario.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
