// checker.js
const fs = require('fs');

const CONFIG = {
  minLen: 4,
  maxLen: 4, // 組合長度範圍
  chars: 'abcdefghijklmnopqrstuvwxyz0123456789-', // 字元集
  concurrency: 20, // 併發數量
  
  // ─── 分批設定 ───
  // 上一次結束時印出的最後一個字（若為第一次執行，請留空字串 ""）
  startWord: '', 

  // 每分鐘 1200 個 * 60 分鐘 * 6 小時 = 432,000 個
  batchLimit: 432000, 
};

// 產生器：支援從指定的 startWord 接續下去，並嚴格計算上限
function* generateNames(chars, min, max, startWord, limit) {
  const charArray = [...new Set(chars)];
  let skipping = Boolean(startWord);
  let generated = 0;

  function* gen(prefix, n) {
    if (generated >= limit) return;
    if (n === 0) {
      if (skipping) {
        if (prefix === startWord) {
          skipping = false; // 找到上次最後的字，接下來的項目開始放行
        }
        return;
      }
      yield prefix;
      generated++;
      return;
    }
    for (let c of charArray) {
      if (generated >= limit) return;
      yield* gen(prefix + c, n - 1);
    }
  }

  for (let n = min; n <= max; n++) {
    if (generated >= limit) break;
    // 若起始字比當前長度長，直接跳過該長度以節省時間
    if (skipping && startWord.length > n) continue;
    yield* gen('', n);
  }
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
  console.log(`🚀 啟動分批檢查器...`);
  console.log(`起點設定：${CONFIG.startWord ? `從 "${CONFIG.startWord}" 之後開始` : '從頭開始'}`);
  console.log(`本次預計上限：${CONFIG.batchLimit.toLocaleString()} 個 (約 6 小時)\n`);

  const nameGen = generateNames(CONFIG.chars, CONFIG.minLen, CONFIG.maxLen, CONFIG.startWord, CONFIG.batchLimit);
  let activeWorkers = 0, doneCount = 0;
  const hits = [];
  let lastCheckedWord = CONFIG.startWord;

  return new Promise((resolve) => {
    const next = async () => {
      const { value: name, done } = nameGen.next();
      
      if (done || !name) {
        if (activeWorkers === 0) {
          resolve({ hits, doneCount, lastCheckedWord });
        }
        return;
      }

      activeWorkers++;
      lastCheckedWord = name;

      try {
        const exists = await checkName(name);
        doneCount++;

        if (doneCount % 1000 === 0) {
          console.log(`⏱️ 已處理：${doneCount.toLocaleString()} / ${CONFIG.batchLimit.toLocaleString()} (目前：${name})`);
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

    for (let i = 0; i < CONFIG.concurrency; i++) {
      next();
    }
  });
}

function exportHTML({ hits, doneCount, lastCheckedWord }) {
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
<title>Netlify 分批檢查結果</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b0d10;color:#e9eef5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:760px;margin:auto;padding:20px}
h1{font-size:24px;margin:0 0 8px}
.card{background:#14181e;border:1px solid #28303a;border-radius:16px;padding:16px;margin-bottom:14px}
button{border:0;border-radius:10px;padding:9px 14px;background:#252c35;color:#e9eef5;font-weight:700;cursor:pointer}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.stat{background:#0d1116;border-radius:10px;padding:12px;text-align:center}
.stat b{display:block;font-size:18px;margin-top:3px;word-break:break-all}
.small{font-size:12px;color:#8793a2}
code{color:#f2cc60;background:#252c35;padding:2px 6px;border-radius:4px}
</style>
</head>
<body>
<main>
<h1>Netlify 批次掃描報告</h1>
<div class="small" style="margin-bottom:14px">產出時間：${new Date().toLocaleString()}</div>

<section class="card">
<div class="stats">
<div class="stat">本次檢查量<b>${doneCount.toLocaleString()}</b></div>
<div class="stat">疑似存在<b style="color:#7ee787">${hits.length}</b></div>
<div class="stat">最後檢查字元<b style="color:#f2cc60">${lastCheckedWord || '無'}</b></div>
</div>
<div style="margin-top:12px" class="small">
  👉 下次執行時，請將 <code>startWord</code> 設定為：<code>${lastCheckedWord}</code>
</div>
</section>

<section class="card">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
<strong>本次發現站點</strong>
</div>
<div id="results">
${resultRows || '<div class="small">本次批次未發現任何已建立的站點。</div>'}
</div>
</section>
</main>
</body>
</html>`;

  fs.writeFileSync('index.html', html, 'utf-8');
  console.log('📄 已更新 index.html');
}

startChecker().then((data) => {
  exportHTML(data);
  console.log('\n───────────────────────────────────');
  console.log(`🏁 本次批次結束！共檢查了 ${data.doneCount.toLocaleString()} 個。`);
  console.log(`📌 下次請將 startWord 設定為: "${data.lastCheckedWord}"`);
  console.log('───────────────────────────────────\n');
});
