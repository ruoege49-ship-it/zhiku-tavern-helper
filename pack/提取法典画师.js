// 在「法典图鉴」网页的控制台里运行（电脑浏览器 F12 → Console，整段粘贴回车）
// 默认提取 NovelAI 5 画师词典；想要 4.5 的把下面改成 'artist_nai45_personal'
(async (BOOK = new URLSearchParams(location.search).get('c') || 'artist_nai5_personal') => {
  const src = await import(new URL('assets/data-source.js', location.origin + '/').href);
  await src.initializeDataSource?.();
  const data = await src.fetchDataJson(BOOK + '.json');

  // 不管数据长什么样，把所有带 artist: 的提示词都找出来
  const prompts = [];
  const walk = (v, title) => {
    if (typeof v === 'string') { if (/artist\s*:/i.test(v)) prompts.push({ title, text: v }); return; }
    if (Array.isArray(v)) { v.forEach(x => walk(x, title)); return; }
    if (v && typeof v === 'object') {
      const t = v.title || v.name || title;
      for (const [k, x] of Object.entries(v)) if (!/^(image|img|thumb|src|url|path|id)s?$/i.test(k)) walk(x, t);
    }
  };
  walk(data, '');

  const NAME = /artist\s*:\s*([^,{}\[\]|\n]+?)\s*(?=,|::|[{}\[\]|\n]|$)/gi;
  const count = new Map(), strings = new Map();
  for (const p of prompts) {
    const names = [...p.text.matchAll(NAME)].map(m => m[1].replace(/^\d+(\.\d+)?::/, '').trim()).filter(Boolean);
    for (const n of new Set(names)) count.set(n, (count.get(n) || 0) + 1);
    if (names.length >= 2) {
      const key = [...new Set(names.map(n => n.toLowerCase()))].sort().join('|');
      if (!strings.has(key)) strings.set(key, (p.title ? '# ' + p.title + '\n' : '') + p.text.trim());
    }
  }
  const artists = [...count].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const save = (name, text) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  save(`${BOOK}_画师.txt`, artists.join('\n') + '\n');
  if (strings.size) save(`${BOOK}_画师串.txt`, [...strings.values()].join('\n\n') + '\n');
  console.log(`提取到 ${artists.length} 位画师、${strings.size} 条画师串（来自 ${prompts.length} 条提示词）`);
})().catch(e => console.error('提取失败：', e));
