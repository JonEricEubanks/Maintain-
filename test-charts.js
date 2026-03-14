const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  const logs = [];
  page.on('console', msg => logs.push('[' + msg.type() + '] ' + msg.text()));
  page.on('pageerror', err => logs.push('PAGE_ERROR: ' + err.message));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  
  // Full DOM dump
  const report = await page.evaluate(() => {
    const r = [];
    r.push('Title: ' + document.title);
    r.push('Body children: ' + document.body.children.length);
    r.push('Total elements: ' + document.querySelectorAll('*').length);
    
    // Show all visible text nodes  
    const textNodes = [];
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,button,a,label,li,div').forEach(el => {
      const t = el.textContent.trim();
      if (t.length > 2 && t.length < 80 && !textNodes.includes(t)) {
        textNodes.push(t);
      }
    });
    r.push('\nVisible text (' + textNodes.length + '):');
    textNodes.slice(0, 30).forEach(t => r.push('  ' + t));
    
    // All buttons
    const btns = document.querySelectorAll('button');
    r.push('\nButtons: ' + btns.length);
    btns.forEach((b, i) => {
      r.push(`  btn${i}: "${b.textContent.trim().substring(0,40)}" class="${(b.className||'').substring(0,40)}" visible=${b.offsetParent !== null}`);
    });
    
    // All clickable
    const clickables = document.querySelectorAll('[onclick], [role="button"], a[href]');
    r.push('\nClickables: ' + clickables.length);
    
    // Body innerHTML size
    r.push('\nBody innerHTML length: ' + document.body.innerHTML.length);
    
    // Root div
    const root = document.getElementById('root');
    r.push('Root: ' + (root ? root.children.length + ' children, innerHTML=' + root.innerHTML.length : 'NOT FOUND'));
    
    return r.join('\n');
  });
  
  console.log(report);
  
  if (logs.length > 0) {
    console.log('\nConsole:');
    logs.forEach(l => console.log(l));
  }
  
  await browser.close();
})();
