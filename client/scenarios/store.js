async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
export const listScenarios = () => request('/api/scenarios');
export const loadScenario = id => request(`/api/scenarios/${encodeURIComponent(id)}`);
export const saveScenario = data => request(`/api/scenarios/${encodeURIComponent(data.scenario.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
