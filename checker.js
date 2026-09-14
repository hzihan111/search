// checker.js
const fs = require('fs');

const CONFIG = {
  minLen: 1,
  maxLen: 3, 
  chars: 'abcdefghijklmnopqrstuvwxyz0123456789-',
  concurrency: 10,
};

function* generateNames(chars, min, max) {
  const charArray = [...new Set(chars)];
  function* gen(prefix, n) {
    if (n === 0) { yield prefix; return; }
    for (let c of charArray) yield* gen(prefix + c, n - 1);
  }
  for (let n = min; n <= max; n++) yield* gen('', n);
}

function countTotal(chars, min, max) {
  const base = new Set(chars).size;
  let total = 0;
  for (let n = min; n <= max; n++) total += Math.pow(base, n);
  return total;
}

async function checkName(name) {
  const url = `https://${name}.netlify.app/`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.status !== 404;
  } catch (error) {
    return false;
  }
}

async function startChecker() {
  const totalCombinations = countTotal(CONFIG.chars, CONFIG.minLen, CONFIG.maxLen);
  console.log(`🚀 啟動檢查器...\n長度: ${CONFIG.minLen}-${CONFIG.maxLen}\n總組合數: ${totalCombinations.toLocaleString()}\n`);
  
  const nameGen = generateNames(CONFIG.chars, CONFIG.minLen, CONFIG.maxLen);
  let activeWorkers = 0, doneCount = 0;
  const hits = [];

  return new Promise((resolve) => {
    const next = async () => {
      const { value: name, done } = nameGen.next();
      if (done) {
        if (activeWorkers === 0) resolve({ hits, total: totalCombinations, done: doneCount });
        return;
      }
      activeWorkers++;
      
      try {
        const exists = await checkName(name);
        doneCount++;
        
        if (doneCount % 500 === 0) {
          console.log(`⏱️ 目前已檢查: ${doneCount}/${totalCombinations}`);
        }
        if (exists) {
          console.log(`✅ [發現] https://${name}.netlify.app/`);
          hits.push(name);
        }
      } finally {
        activeWorkers--;
        next();
      }
    };
    for (let i = 0; i < CONFIG.concurrency; i++) next();
  });
}

function exportHTML({ hits, total, done }) {
  const resultRows = hits.map(name => `
    <div style="display:flex;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #252c35">
      <span style="flex:1;word-break:break-all;color:#7ee787">${name}.netlify.app</span>
      <button class="secondary" onclick="window.open('https://${name}.netlify.app/','_blank','noopener')">新分頁</button>
    </div>
  `).join('');

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Netlify 名稱檢查結果</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b0d10;color:#e9eef5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:760px;margin:auto;padding:20px}
h1{font-size:25px;margin:0 0 8px}
.card{background:#14181e;border:1px solid #28303a;border-radius:16px;padding:16px;margin-bottom:14px}
button{border:0;border-radius:10px;padding:9px 14px;background:#252c35;color:#e9eef5;font-weight:700;cursor:pointer}
button:hover{background:#343e4a}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.stat{background:#0d1116;border-radius:10px;padding:12px;text-align:center}
.stat b{display:block;font-size:20px;margin-top:3px}
.progress{height:8px;background:#252c35;border-radius:99px;overflow:hidden;margin-top:12px}
#bar{height:100%;width:100%;background:#7ee787}
.small{font-size:12px;color:#8793a2}
</style>
</head>
<body>
<main>
<h1>Netlify 名稱檢查結果報告</h1>
<div class="small" style="margin-bottom:14px">產出時間：${new Date().toLocaleString()}</div>

<section class="card">
<div class="stats">
<div class="stat">總數<b>${total.toLocaleString()}</b></div>
<div class="stat">已檢查<b>${done.toLocaleString()}</b></div>
<div class="stat">疑似存在<b style="color:#7ee787">${hits.length}</b></div>
</div>
<div class="progress"><div id="bar"></div></div>
</section>

<section class="card">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
<strong>掃描結果清單</strong><span class="small">已完成</span>
</div>
<div id="results">
${resultRows || '<div class="small">未發現任何已建立的站點。</div>'}
</div>
</section>
</main>
</body>
</html>`;

  fs.writeFileSync('index.html', html, 'utf-8');
  console.log('📄 已成功產出單一 index.html 檔案');
}

startChecker().then(data => {
  exportHTML(data);
  console.log('\n🎉 檢查完畢！');
});
  
