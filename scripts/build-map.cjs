const fs = require('node:fs/promises');
const path = require('node:path');
const mapshaper = require('mapshaper');
const esbuild = require('esbuild');

async function main() {
  const root = path.resolve(__dirname, '..');
  process.chdir(root);
  await fs.mkdir('client/data', { recursive: true });
  // Shared topology preserves adjacent borders when simplifying the 1:10m source.
  await mapshaper.runCommands('-i data/map/countries/ne_10m_admin_0_countries.shp name=countries -filter-fields ADM0_A3,NAME,MAPCOLOR13 -i data/map/regions/ne_10m_admin_1_states_provinces.shp name=regions -filter-fields adm1_code,adm0_a3,name -merge-layers target=countries,regions force name=combined -simplify weighted 12% keep-shapes -split "adm1_code ? \'regions\' : \'countries\'" -o client/data/world.topo.json format=topojson quantization=100000');
  const topology = JSON.parse(await fs.readFile('client/data/world.topo.json', 'utf8'));
  const palette = ['#a88e69','#748d73','#8395a3','#a17778','#999775','#7e8fa1','#b08e79','#8a809c','#6f9690','#a694af','#b2a078','#8a9c86','#9a7c64'];
  const countries = topology.objects.countries.geometries.map(g => {
    const p = g.properties;
    g.id = p.ADM0_A3; delete g.properties;
    return { id: g.id, name: p.NAME, color: palette[((p.MAPCOLOR13 - 1) % palette.length + palette.length) % palette.length] };
  });
  const owners = {}, regions = [];
  for (const g of topology.objects.regions.geometries) {
    const p = g.properties; g.id = p.adm1_code; delete g.properties;
    if (!g.id || owners[g.id]) throw new Error(`Invalid or duplicate region ID: ${g.id}`);
    owners[g.id] = p.adm0_a3;
    regions.push({ id: g.id, name: p.name || g.id });
  }
  const countryIds = new Set(countries.map(c => c.id));
  if (countryIds.size !== countries.length || countryIds.has(undefined)) throw new Error('Invalid or duplicate country ID');
  for (const owner of Object.values(owners)) if (!countryIds.has(owner)) throw new Error(`Unknown country: ${owner}`);
  await fs.writeFile('client/data/world.topo.json', JSON.stringify(topology));
  await fs.writeFile('client/data/state.json', JSON.stringify({ countries, regions, owners }));
  await fs.writeFile('client/data/geography.json', JSON.stringify({ id: 'natural-earth-admin1-v1', regions }));
  for (const id of ['modern', '1700']) {
    const folder = `scenarios/${id}`;
    await fs.mkdir(folder, { recursive: true });
    // Rebuilding never overwrites authored scenarios.
    try { await fs.access(`${folder}/scenario.json`); continue; } catch {}
    const scenario = { id, name: id === 'modern' ? 'Natural Earth — современный импорт' : '1700 — пустой шаблон', year: id === 'modern' ? 2026 : 1700, version: 1, geography: 'natural-earth-admin1-v1' };
    const politicalCountries = id === 'modern' ? countries.map(c => ({ ...c, shortName: c.name, capitalRegionId: null, governmentType: 'unspecified' })) : [];
    const ownership = id === 'modern' ? owners : Object.fromEntries(regions.map(r => [r.id, null]));
    await fs.writeFile(`${folder}/countries.json`, JSON.stringify(politicalCountries, null, 2));
    await fs.writeFile(`${folder}/ownership.json`, JSON.stringify(ownership, null, 2));
    await fs.writeFile(`${folder}/scenario.json`, JSON.stringify(scenario, null, 2));
  }
  await esbuild.build({ entryPoints: ['client/map/main.js'], outfile: 'client/map.bundle.js', bundle: true, format: 'esm', minify: true, sourcemap: true, external: ['/editor/audit.js'] });
  console.log(`Built ${countries.length} countries and ${regions.length} regions.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
