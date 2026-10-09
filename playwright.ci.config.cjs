const {defineConfig}=require('@playwright/test');
const base=require('./playwright.config.cjs');
module.exports=defineConfig({...base,testMatch:['**/economy.spec.cjs','**/economy-demand.spec.cjs','**/production-chains.spec.cjs','**/settlements.spec.cjs','**/world-economy.spec.cjs','**/map.spec.cjs','**/simulation.spec.cjs','**/population.spec.cjs','**/gameplay-provinces.spec.cjs','**/independent-gameplay.spec.cjs','**/province-runtime.spec.cjs'],use:{...base.use,launchOptions:{}}});
