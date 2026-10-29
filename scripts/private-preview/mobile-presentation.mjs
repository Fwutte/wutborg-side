import fs from 'node:fs/promises';

// Adapt the protected presentation during packaging; no CMS content is changed.
export async function mobilePresentation(app, styles) {
  const replaceOnce = (before, after) => {
    if (app.split(before).length !== 2) throw new Error('Review the source presentation before applying mobile navigation.');
    app = app.replace(before, after);
  };
  replaceOnce(
    '<aside class="article-sidebar" aria-label="Navigation"><div class="toc-links">${nav}</div></aside>',
    '<aside class="article-sidebar" aria-label="Navigation"><details class="article-toc"><summary>${headings.length>1?\'På denne side\':\'Flere sider\'}<span aria-hidden="true">+</span></summary><div class="toc-links">${nav}</div></details></aside>',
  );
  replaceOnce(
    "  document.title=page?.documentTitle||'404';",
    "  const toc=main.querySelector('.article-toc');if(toc)toc.open=!matchMedia('(max-width:650px)').matches;\n  document.title=page?.documentTitle||'404';",
  );
  replaceOnce(
    "function bindUI(){",
    "function bindUI(){\nmatchMedia('(max-width:650px)').addEventListener?.('change',event=>{const toc=main.querySelector('.article-toc');if(toc)toc.open=!event.matches;});",
  );
  replaceOnce(
    "  const a=event.target.closest('a');",
    "  const a=event.target.closest('a');\n  if(a?.getAttribute('href')?.startsWith('#')&&a.closest('.article-toc')&&matchMedia('(max-width:650px)').matches)a.closest('.article-toc').open=false;",
  );
  const mobileStyles = await fs.readFile(new URL('./mobile-presentation.css', import.meta.url), 'utf8');
  return { app, styles: styles + '\n' + mobileStyles };
}
