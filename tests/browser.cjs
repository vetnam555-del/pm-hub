const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const E=require('../js/tools/mix-engine.js');
const dir=path.resolve(__dirname,'..'),out=process.env.QA_DIR||path.join(dir,'qa-output');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const p=path.resolve(dir,'.'+decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(dir+path.sep)&&p!==dir){res.writeHead(403);res.end();return;}let file=p===dir?path.join(dir,'index.html'):p;if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>localStorage.setItem('pm_welcomed','1'));
 await page.goto(base+'/#tool-mediamix');await page.getByRole('heading',{name:'미디어믹스',exact:true}).waitFor();
 await page.screenshot({path:path.join(out,'empty-desktop.png'),fullPage:true});
 if(process.env.PRIVATE_PACK){await page.locator('#mix-file').setInputFiles(process.env.PRIVATE_PACK);await page.locator('#mix-import-dialog').waitFor({state:'visible'});await page.locator('[data-action="commit-import"]').click();assert.ok((await page.locator('#mix-body').innerText()).includes('38건'));}
 const p={...E.plan(),client:'검증 광고주',title:'9월 미디어플랜',date:'2026-09-07',start:'2026-09-01',end:'2026-09-30',budget:1100000,rows:[{...E.row(),amount:1100000,markup:10,rate:100,ctr:2,cvr:1,aov:50000,approved:true,source:'QA synthetic',sourceDate:'2026-09-01'}]};
 await page.evaluate(p=>{const db=JSON.parse(localStorage.getItem('pm_mix_studio_v1')||'{}');db.plan=p;db.saved=[];db.benchmarks=db.benchmarks||[];localStorage.setItem('pm_mix_studio_v1',JSON.stringify(db));},p);await page.reload();
 await page.locator('[data-view="preview"]').click();assert.ok((await page.locator('#mix-body').innerText()).includes('필수 입력 및 예산 검수 통과'));
 const event=page.waitForEvent('download');await page.locator('[data-action="xlsx"]').click();const download=await event;await download.saveAs(path.join(out,'verified-export.xlsx'));
 await page.screenshot({path:path.join(out,'preview-desktop.png'),fullPage:true});
 await page.locator('[data-view="compose"]').click();await page.locator('[data-edit="0"]').click();await page.locator('[data-field="cvr"]').fill('0');
 assert.equal(await page.locator('[data-field="cvr"]').evaluate(e=>document.activeElement===e),true,'typing retains focus');
 assert.ok((await page.locator('#mix-check').innerText()).includes('검토 확인'));await page.locator('[data-field="approved"]').check();
 await page.locator('[data-field="client"]').fill('변경 광고주');assert.equal(await page.locator('[data-field="approved"]').isChecked(),false,'client change invalidates approval');
 await page.locator('[data-action="save-plan"]').click({clickCount:1});assert.equal(await page.locator('#mix-saved option').count(),2,'first click after typing saves plan');
 await page.locator('[data-field="budget"]').fill('');assert.ok((await page.locator('#mix-check').innerText()).includes('총 예산'));await page.locator('[data-field="budget"]').fill('1100000');
 await page.locator('[data-field="scenario"]').selectOption('120');assert.equal(await page.locator('[data-field="scenario"]').inputValue(),'120');
 await page.locator('[data-action="save-plan"]').click();await page.reload();assert.equal(await page.locator('#mix-saved option').count(),3);
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'/#tool-mediamix');await page.locator('.mix-heading').waitFor();await page.screenshot({path:path.join(out,'compose-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.querySelector('.mix-studio').getBoundingClientRect().width<=window.innerWidth));
 console.log('mobile sidebar',await page.locator('#sidebar').evaluate(e=>({class:e.className,transform:getComputedStyle(e).transform,x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width,innerWidth:innerWidth})));
 await page.waitForFunction(()=>document.querySelector('#sidebar').getBoundingClientRect().right<=1);
 await page.screenshot({path:path.join(out,'mobile-viewport.png'),animations:'disabled'});
 await page.screenshot({path:path.join(out,'compose-mobile.png'),fullPage:true,animations:'disabled'});
 await page.locator('[data-view="library"]').click();await page.locator('#mix-brand').selectOption('공통 참고');await page.locator('#mix-media-filter').selectOption('meta-leads');await page.locator('[data-bench]').first().click();assert.ok((await page.locator('.mix-editor').innerText()).includes('전환 정의'));assert.equal(await page.locator('[data-field="goal"]').inputValue(),'리드');
 const routes=['home','tool-kpi','tool-utm','tool-budget','tool-report','tool-diagnose','tool-abtest','tool-bid','tool-pacing','utm-learn','benchmark','media','glossary','specs','faq','naming','sources','qa',...Array.from({length:12},(_,i)=>'week'+(i+1))];
 await page.setViewportSize({width:1440,height:1000});
 for(const route of routes){await page.goto(base+'/#'+route);await page.locator('#page-'+route+'.active').waitFor();assert.ok((await page.locator('#page-'+route).innerText()).trim().length>20,route);}
 await page.goto(base+'/#benchmark');await page.locator('#mix-open-library').click();await page.locator('#mix-brand').waitFor();
 // Exercise the actual XLSX importer including native Excel dates and percent cells.
 await page.evaluate(()=>new Promise((resolve,reject)=>{if(window.ExcelJS)return resolve();const s=document.createElement('script');s.src='js/vendor/exceljs.min.js';s.onload=resolve;s.onerror=reject;document.head.append(s);}));
 const imported=await page.evaluate(async()=>{
   const w=new ExcelJS.Workbook(),s=w.addWorksheet('벤치마크');s.addRow(['id','brand','product','source','sourceDate','ctr','vtr','goal','model']);
   s.addRow(['native-format','QA','google-video','QA',new Date('2026-09-01T00:00:00Z'),0.025,0.30,'기타','CPV']);s.getCell('E2').numFmt='yyyy-mm-dd';s.getCell('F2').numFmt='0.0%';s.getCell('G2').numFmt='0%';
   return MixWorkbook.importBench(await w.xlsx.writeBuffer(),'qa.xlsx');
 });assert.equal(imported.benchmarks[0].ctr,2.5);assert.equal(imported.benchmarks[0].vtr,30);assert.equal(imported.benchmarks[0].sourceDate,'2026-09-01');
 const badBackup={kind:'mix-backup',db:{plan:p,saved:[{...p,rows:[null]}],benchmarks:[]}};
 const alerts=[];page.on('dialog',d=>alerts.push(d.message()));
 const previous=await page.evaluate(()=>localStorage.getItem('pm_mix_studio_v1'));
 await page.locator('#mix-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(badBackup))});
 await page.waitForFunction(()=>!document.querySelector('#mix-import-dialog').open);assert.equal(await page.evaluate(()=>localStorage.getItem('pm_mix_studio_v1')),previous);
 assert.ok(alerts.some(x=>x.includes('가져오기 실패')));
 const smallPack={version:1,benchmarks:[{id:'qa-default',brand:'QA',product:'meta-leads',source:'QA',model:'',goal:'',sourceKind:'',markup:''}]};
 await page.locator('#mix-file').setInputFiles({name:'QA.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(smallPack))});await page.locator('#mix-import-dialog').waitFor({state:'visible'});await page.locator('[data-action="commit-import"]').click();
 await page.locator('#mix-brand').selectOption('QA');await page.locator('#mix-media-filter').selectOption('');await page.locator('[data-bench="qa-default"]').click();assert.equal(await page.locator('[data-field="model"]').inputValue(),'CPC');assert.equal(await page.locator('[data-field="goal"]').inputValue(),'리드');assert.equal(await page.locator('[data-field="markup"]').inputValue(),'0');
 smallPack.benchmarks[0].source='changed source';await page.locator('#mix-file').setInputFiles({name:'conflict.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(smallPack))});await page.locator('#mix-import-dialog').waitFor({state:'visible'});assert.ok((await page.locator('#mix-import-summary').innerText()).includes('내용 충돌 1건'));await page.locator('[data-action="cancel-import"]').click();
 const multi={...p,client:'모델별 검수',budget:5500000,rows:['CPC','CPM','CPV','CPI','SEND','FIXED'].map((model,i)=>({...E.row(),model,amount:i===5?0:1100000,markup:10,rate:model==='CPM'?2000:100,ctr:2,vtr:25,cvr:1,aov:50000,fixedClicks:1000,fixedImpr:10000,goal:model==='CPI'?'설치':model==='SEND'?'기타':'구매',approved:true,source:'QA source '+model,sourceDate:'2026-09-01'}))};
 const result=E.compute(multi);assert.deepEqual(result.errors,[]);
 await page.evaluate(p=>{const db=JSON.parse(localStorage.getItem('pm_mix_studio_v1'));db.plan=p;localStorage.setItem('pm_mix_studio_v1',JSON.stringify(db));},multi);await page.reload();await page.locator('[data-view="preview"]').click();
 const mixedDownload=page.waitForEvent('download');await page.locator('[data-action="xlsx"]').click();await (await mixedDownload).saveAs(path.join(out,'all-models.xlsx'));
 const paper=await page.locator('.mix-paper').innerText();for(const label of ['10,000 조회','10,000 설치','10,000 발송','산출 근거 및 운영 조건'])assert.ok(paper.includes(label),label);
 await page.screenshot({path:path.join(out,'mixed-preview-desktop.png'),fullPage:true});
 await page.evaluate(()=>document.body.classList.add('mix-print'));await page.pdf({path:path.join(out,'all-models.pdf'),preferCSSPageSize:true,printBackground:true});await page.evaluate(()=>document.body.classList.remove('mix-print'));
 fs.writeFileSync(path.join(out,'all-models-expected.json'),JSON.stringify({plan:multi,result},null,2));
 // A corrupt browser record is preserved, not silently overwritten with a new plan.
 const corrupt='{"plan":null,"saved":[],"benchmarks":[]}';await page.evaluate(s=>localStorage.setItem('pm_mix_studio_v1',s),corrupt);await page.reload();await page.locator('[data-field="client"]').fill('test recovery');assert.equal(await page.evaluate(()=>localStorage.getItem('pm_mix_studio_v1')),corrupt);assert.ok((await page.locator('#mix-save').innerText()).includes('원본은 유지'));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({routes:routes.length,errors,desktop:'1440x1000',mobile:'390x844',xlsx:'downloaded',importedPrivatePack:!!process.env.PRIVATE_PACK},null,2));console.log('PASS: '+routes.length+' routes; local import, edit, save, restore, scenario, export, responsive; no JS errors');
 }finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
