(function(){
  'use strict';
  let loading;
  function excel(){if(window.ExcelJS)return Promise.resolve(window.ExcelJS);if(!loading)loading=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='js/vendor/exceljs.min.js?v=32';s.onload=()=>resolve(window.ExcelJS);s.onerror=()=>{loading=null;reject(Error('엑셀 모듈을 불러오지 못했습니다. 연결을 확인하세요.'));};document.head.append(s);});return loading;}
  const headers=['id','brand','product','media','campaign','device','model','rate','ctr','cvr','aov','markup','amount','fixedImpr','fixedClicks','source','sourceDate','sourceKind','note','vtr','goal','industry','costBasis'];
  function style(ws,head=1){ws.views=[{state:'frozen',ySplit:head}];ws.eachRow((row,i)=>{row.eachCell(c=>{c.font={name:'맑은 고딕',size:10,color:{argb:'FF24282B'}};c.alignment={vertical:'middle',wrapText:true};c.border={bottom:{style:'hair',color:{argb:'FFDDE2E5'}}};if(typeof c.value==='number'||c.value?.formula)c.numFmt='#,##0.00;[Red](#,##0.00);0';});row.height=i===head?32:28;});const h=ws.getRow(head);h.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF184C46'}};c.font={name:'맑은 고딕',size:10,bold:true,color:{argb:'FFFFFFFF'}};});ws.pageSetup={paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:`${head}:${head}`,margins:{left:.25,right:.25,top:.4,bottom:.4,header:.1,footer:.1}};ws.headerFooter={oddFooter:'&L미디어믹스 제안 · 예상치&R&P / &N'};}
  async function output(wb,name){wb.calcProperties.fullCalcOnLoad=true;const b=await wb.xlsx.writeBuffer();const a=document.createElement('a'),u=URL.createObjectURL(new Blob([b],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}
  async function exportPlan(p,result,draft){
    const X=await excel(),wb=new X.Workbook();wb.creator=p.agency||'PM Hub';
    const overview=wb.addWorksheet('제안 요약');
    overview.addRows([['미디어믹스 제안',draft?'검토용 초안':'제출용 예상안'],['광고주',p.client],['캠페인',p.title],['작성 주체',p.agency],['작성일',p.date],['집행 기간',p.start+' ~ '+p.end],['공급가 (수수료 포함)',result.totals.amount],['청구 VAT',result.totals.tax],['청구 총액',result.totals.gross],['매체비 (수수료·VAT 제외)',result.totals.media],['대행 수수료',result.totals.fee],['단가 시나리오',Number(p.scenario)/100],['안내','예상치는 성과를 보장하지 않습니다. 예산·기간·소재·타기팅에 따라 달라집니다.'],['지표 기준','CPC·CPM: 실매체비 / CPA·ROAS: 수수료 포함 공급가. 클릭 기반 전환, 구매만 매출 산출.'],['합산 기준','전환 정의가 다른 구매·리드·설치는 합산하지 않습니다. 미산출 값은 빈칸이며 0이 아닙니다. 메시지는 발송량으로 별도 관리합니다.'],['검수 결과',draft?result.errors.join('\n')||'입력 검수 통과':'필수 입력·예산 검수 통과'],['주의사항',result.warnings.join('\n')||'없음']]);overview.columns=[{width:32},{width:110}];style(overview);overview.getRow(1).height=42;[13,14,15,16,17].forEach(i=>overview.getRow(i).height=60);
    const front=wb.addWorksheet('미디어믹스');
    const ws=wb.addWorksheet('계산 상세');
    ws.addRow(['매체','캠페인','기기','전환 정의','시작일','종료일','일수','공급가(수수료 포함)','마크업(%)','실매체비','수수료','계산 기준','시나리오 적용단가','예상 노출','예상 클릭','CTR(%)','매체 CPC','매체 CPM','입력 CVR(%)','예상 전환','객단가','예상 매출','광고주 CPA','광고주 ROAS(%)','일예산','예상 조회','예상 설치','예상 발송','타기팅','비고']);
    result.rows.forEach((r,i)=>{
      const k=i+2, val=v=>v==null?null:v;
      ws.addRow([r.name,r.type,r.device,r.goal,r.start,r.end,r.days,r.amount,window.MixEngine.num(r.markup),null,null,r.model,r.effectiveRate,r.impr,r.clicks,r.ctr,r.cpc,r.cpm,window.MixEngine.num(r.cvr),r.conv,window.MixEngine.num(r.aov),r.revenue,r.cpa,r.roas,r.daily,r.views,r.installs,r.sends,r.target,r.note]);
      const formula=(col,f,v)=>{if(Number.isFinite(v))ws.getCell(col+k).value={formula:`IFERROR(${f},"")`,result:v};};
      formula('J',`H${k}/(1+I${k}/100)`,r.media);formula('K',`H${k}-J${k}`,r.fee);
      if(r.model==='CPC'){formula('O',`J${k}/M${k}`,r.clicks);if(window.MixEngine.num(r.ctr)>0)formula('N',`O${k}/'산출 근거'!H${k}*100`,r.impr);}
      if(r.model==='CPM'){formula('N',`J${k}/M${k}*1000`,r.impr);formula('O',`N${k}*'산출 근거'!H${k}/100`,r.clicks);}
      if(r.model==='CPV'){formula('Z',`J${k}/M${k}`,r.views);formula('N',`Z${k}/'산출 근거'!J${k}*100`,r.impr);formula('O',`N${k}*'산출 근거'!H${k}/100`,r.clicks);}
      if(r.model==='CPI')formula('AA',`J${k}/M${k}`,r.installs);
      if(r.model==='SEND')formula('AB',`J${k}/M${k}`,r.sends);
      if(r.model==='FIXED'){
        if(window.MixEngine.num(r.fixedClicks)==null)formula('O',`N${k}*'산출 근거'!H${k}/100`,r.clicks);
        if(window.MixEngine.num(r.fixedImpr)==null)formula('N',`O${k}/'산출 근거'!H${k}*100`,r.impr);
      }
      formula('P',`O${k}/N${k}*100`,r.ctr);formula('Q',`J${k}/O${k}`,r.cpc);formula('R',`J${k}/N${k}*1000`,r.cpm);
      formula('T',r.model==='CPI'?`AA${k}`:`O${k}*S${k}/100`,r.conv);formula('V',`T${k}*U${k}`,r.revenue);formula('W',`H${k}/T${k}`,r.cpa);formula('X',`V${k}/H${k}*100`,r.roas);formula('Y',`H${k}/G${k}`,r.daily);
    });
    const last=result.rows.length+1,total=last+1;ws.addRow(['TOTAL']);
    for(const [col,k]of [['H','amount'],['J','media'],['K','fee'],['N','impr'],['O','clicks'],['T','conv'],['V','revenue']])if(result.totals[k]!=null)ws.getCell(col+total).value={formula:`SUM(${col}2:${col}${last})`,result:result.totals[k]};
    for(const [col,f,k]of [['P',`O${total}/N${total}*100`,'ctr'],['Q',`J${total}/O${total}`,'cpc'],['W',`H${total}/T${total}`,'cpa'],['X',`V${total}/H${total}*100`,'roas']])if(result.totals[k]!=null)ws.getCell(col+total).value={formula:`IFERROR(${f},"")`,result:result.totals[k]};
    ws.columns=Array.from({length:30},(_,i)=>({width:i===0?18:i===1?30:i>=28?36:15}));style(ws);ws.autoFilter=`A1:AD${last}`;ws.getRow(total).font={bold:true};
    const evidence=wb.addWorksheet('산출 근거');evidence.addRow(['매체','캠페인','성격','기준일','출처','계산 기준','기준단가','입력 CTR(%)','입력 CVR(%)','입력 VTR(%)','검토 확인','비고']);
    result.rows.forEach(r=>evidence.addRow([r.name,r.type,r.sourceKind,r.sourceDate,r.source,r.model,window.MixEngine.num(r.rate),window.MixEngine.num(r.ctr),window.MixEngine.num(r.cvr),window.MixEngine.num(r.vtr),r.approved?'확인':'미확인',r.note]));evidence.columns=Array.from({length:12},(_,i)=>({width:i===4?65:i===11?45:20}));style(evidence);
    const groups=wb.addWorksheet('매체별 요약');groups.addRow(['매체','공급가','실매체비','수수료']);[...new Set(result.rows.map(r=>r.name))].forEach(name=>{const rs=result.rows.filter(r=>r.name===name);groups.addRow([name,...['amount','media','fee'].map(k=>rs.reduce((s,r)=>s+r[k],0))]);});groups.columns=[{width:30},{width:22},{width:22},{width:22}];style(groups);
    front.addRow(['매체','캠페인 / 기기','공급가','예상 노출','예상 클릭','CTR(%)','매체 CPC','매체 CPM','전환 정의','예상 전환','광고주 CPA','예상 매출','광고주 ROAS(%)','기간 / 비고']);
    result.rows.forEach((r,i)=>{const k=i+2;front.addRow([r.name,r.type+' / '+r.device,r.amount,r.impr,r.clicks,r.ctr,r.cpc,r.cpm,r.goal,r.conv,r.cpa,r.revenue,r.roas,r.start+'~'+r.end+' '+(r.note||'')]);for(const [a,b]of [['C','H'],['D','N'],['E','O'],['F','P'],['G','Q'],['H','R'],['J','T'],['K','W'],['L','V'],['M','X']]){const v=front.getCell(a+k).value;if(v!=null)front.getCell(a+k).value={formula:`'계산 상세'!${b}${k}`,result:v};}});
    front.addRow(['TOTAL','',result.totals.amount,result.totals.impr,result.totals.clicks,result.totals.ctr,result.totals.cpc,null,'',result.totals.conv,result.totals.cpa,result.totals.revenue,result.totals.roas,'예상치 · 성과 미보장']);
    for(const [a,b]of [['C','H'],['D','N'],['E','O'],['F','P'],['G','Q'],['J','T'],['K','W'],['L','V'],['M','X']]){const v=front.getCell(a+total).value;if(v!=null)front.getCell(a+total).value={formula:`'계산 상세'!${b}${total}`,result:v};}
    for(const [cell,formula,value]of [['B7',`'계산 상세'!H${total}`,result.totals.amount],['B8',`ROUND(B7*${window.MixEngine.num(p.tax)}/100,0)`,result.totals.tax],['B9','B7+B8',result.totals.gross],['B10',`'계산 상세'!J${total}`,result.totals.media],['B11','B7-B10',result.totals.fee]])if(Number.isFinite(value))overview.getCell(cell).value={formula,result:value};
    groups.eachRow((row,i)=>{if(i===1)return;for(const [a,b]of [['B','H'],['C','J'],['D','K']]){const v=row.getCell(a).value;row.getCell(a).value={formula:`SUMIF('계산 상세'!A2:A${last},A${i},'계산 상세'!${b}2:${b}${last})`,result:v};}});
    front.columns=Array.from({length:14},(_,i)=>({width:i===1?28:i===13?44:i===0?18:15}));style(front);front.getRow(total).font={bold:true};front.autoFilter=`A1:N${last}`;
    const separate=result.rows.map((r,i)=>({r,k:i+2})).filter(({r})=>['CPV','CPI','SEND'].includes(r.model));
    if(separate.length){
      front.addRow([]);const header=front.addRow(['매체','캠페인','물량 단위','예상 물량']);
      header.eachCell(c=>{c.font={name:'맑은 고딕',bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF184C46'}};});
      separate.forEach(({r,k})=>{const [unit,col,value]=r.model==='CPV'?['조회','Z',r.views]:r.model==='CPI'?['설치','AA',r.installs]:['발송','AB',r.sends];const line=front.addRow([r.name,r.type,unit,value]);if(value!=null)line.getCell(4).value={formula:`'계산 상세'!${col}${k}`,result:value};});
    }
    overview.addRow(['수정 및 검수 기준','검수 결과는 브라우저 내보내기 시점 기준입니다. 단가·예산·캠페인 변경 후에는 브라우저에서 다시 검수·출력하세요.']);
    if(p.autoSummary&&p.autoSettings){overview.addRow(['업종 / 목표',p.autoSettings.industry+' / '+p.autoSettings.objective]);}
    if(p.autoSummary)overview.addRow(['자동 구성 기준',p.autoSummary]);
    if(p.autoExcluded?.length)overview.addRow(['자동 구성 제외',p.autoExcluded.join('\n')]);
    // Size wrapped source notes and show identity on separately printed worksheets.
    wb.eachSheet(sheet=>{
      sheet.headerFooter.oddHeader='&L'+String(p.client||'광고주 미입력').replace(/&/g,'&&')+' · '+String(p.title||'미디어믹스').replace(/&/g,'&&')+'&R'+(draft?'검토용 초안':'예상안');
      sheet.eachRow(row=>{let lines=1;row.eachCell((cell,col)=>{if(typeof cell.value==='string'){const width=Math.max(8,(sheet.getColumn(col).width||15)-2);lines=Math.max(lines,...cell.value.split('\n').map(s=>Math.ceil(Array.from(s).reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0)/width)));}if(!cell.font?.name)cell.font={name:'맑은 고딕',size:10};cell.alignment={vertical:'middle',wrapText:true};});row.height=Math.min(409,Math.max(row.height||28,lines*14+10));});
      sheet.pageSetup.printArea=`A1:${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}`;
    });
    await output(wb,`${draft?'검토용_':''}${(p.client||'미디어믹스').replace(/[\\/:*?"<>|]/g,'_')}_${(p.date||'날짜미입력')}_미디어믹스.xlsx`);
  }
  async function template(){
    const X=await excel(),wb=new X.Workbook(),ws=wb.addWorksheet('벤치마크');ws.addRow(headers);
    ws.columns=headers.map(()=>({width:20}));style(ws);
    const note=wb.addWorksheet('입력 기준');note.addRows([['필드','기준'],['필수 항목','id / industry(업종) / product / source. brand는 비공개 원본 식별용 선택 항목.'],['비율','CTR/CVR 1.5는 1.5%. Excel 백분율 셀도 지원.'],['단가','rate는 실매체비 기준. VAT·수수료 제외.'],['자료 구분','실적 / 과거 제안 / 참고값 / 가정. sourceDate: YYYY-MM-DD'],['전환 정의','goal: 구매 / 리드 / 설치 / 기타. CVR은 클릭 기준. 정의가 없으면 자동 전환율 적용 불가.'],['업종','industry는 플래너 업종명 사용. 같은 업종만 자동 구성.'],['브랜드검색','FIXED는 광고주별 견적·물량이 달라 자동 구성 제외.'],['제품 ID',window.MixEngine.products.map(x=>x.id+' = '+x.media+' '+x.campaign).join('\n')]]);
    note.addRow(['비용 기준 확인','costBasis: media-net = VAT·수수료 제외 단가 확인됨 / review-required 또는 공란 = 자동 구성 제외, 원본 보존']);
    note.columns=[{width:20},{width:100}];style(note);note.getRow(9).height=400;await output(wb,'벤치마크_입력양식.xlsx');
  }
  async function importBench(buf,name){
    const X=await excel(),wb=new X.Workbook();await wb.xlsx.load(buf);const ws=wb.getWorksheet('벤치마크');
    if(!ws)throw Error('벤치마크 시트가 없습니다. 입력 양식 또는 제공된 JSON 자료팩을 사용하세요.');
    const cols={};ws.getRow(1).eachCell((c,i)=>{const h=String(c.value).trim();if(cols[h])throw Error('중복 열: '+h);cols[h]=i;});
    for(const h of ['id','product','source'])if(!cols[h])throw Error('필수 열 누락: '+h);
    if(!cols.industry&&!cols.brand)throw Error('업종(industry) 열이 필요합니다.');
    const benchmarks=[];ws.eachRow((row,i)=>{
      if(i===1||!row.getCell(cols.id).value)return;const b={};
      headers.forEach(h=>{const cell=cols[h]?row.getCell(cols[h]):null;let v=cell?.value;
        if(v instanceof Date&&h==='sourceDate')v=v.toISOString().slice(0,10);
        else if(v&&typeof v==='object')throw Error(i+'행: 수식 대신 확정된 값으로 입력하세요.');
        if(['ctr','cvr','vtr','markup'].includes(h)&&typeof v==='number'&&/%/.test((cell.numFmt||'').replace(/"[^"]*"|\\./g,'')))v*=100;
        b[h]=v??'';
      });
      b.source=b.source||name;benchmarks.push(b);
    });
    return window.MixEngine.validatePack({version:1,benchmarks});
  }
  window.MixWorkbook={exportPlan,template,importBench};
})();
