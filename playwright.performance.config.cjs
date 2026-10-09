const {defineConfig}=require('@playwright/test'),base=require('./playwright.config.cjs');
module.exports=defineConfig({...base,testMatch:'**/performance.benchmark.cjs',use:{...base.use,deviceScaleFactor:1,launchOptions:{}}});
