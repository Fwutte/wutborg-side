// Keep public-facing page URLs inside the existing protected application.
export function cleanRoutes(app) {
  const replaceOnce = (before, after) => {
    if (app.split(before).length !== 2) throw new Error('Review the presentation source before applying clean URLs.');
    app = app.replace(before, after);
  };
  replaceOnce(
    "const link=id=>`?side=${id}${siteConfig?.preview?'&preview=1':''}`;",
    "const link=id=>'/oenskelandet/'+id.split('/').map(encodeURIComponent).join('/')+(siteConfig?.preview?'?preview=1':'');\n" +
    "const routeId=()=>{const requested=new URLSearchParams(location.search).get('side')??location.pathname.replace(/^\\/oenskelandet\\/?/,'').replace(/\\/$/,'').replace(/^index\\.html$/,'');const page=content.find(page=>page.id===requested||page.aliases?.includes(requested));if(page&&page.id!==requested)history.replaceState({},'',link(page.id)+location.hash);return page?.id??requested;};\n" +
    "const isPageLink=a=>{const href=a?.getAttribute('href')||'';if(!href.startsWith('/oenskelandet/')||a.hasAttribute('download')||a.target&&a.target!=='_self')return false;const id=href.split(/[?#]/)[0].slice('/oenskelandet/'.length);return !id||/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(id)&&!['api','admin','uploads','data','runtime-lib'].includes(id.split('/')[0]);};\n" +
    "function normalizePageLinks(){document.querySelectorAll('a[href]').forEach(a=>{const href=a.getAttribute('href');if(href.startsWith('?')||href.startsWith('/oenskelandet/?')){const old=new URL(href,'https://wutborg.dk/oenskelandet/');const id=old.searchParams.get('side');if(id!==null||href==='?')a.setAttribute('href',link(id||'')+old.hash);}});}",
  );
  replaceOnce("const id=new URLSearchParams(location.search).get('side')||'';const page=get(id);", "const id=routeId();const page=get(id);");
  replaceOnce("  document.title=page?.documentTitle||'404';", "  normalizePageLinks();\n  document.title=page?.documentTitle||'404';");
  replaceOnce("a&&a.getAttribute('href')?.startsWith('?')", 'a&&isPageLink(a)');
  replaceOnce('const get=id=>content.find(p=>p.id===id);', 'const get=id=>content.find(p=>p.id===id||p.aliases?.includes(id));');
  replaceOnce('...Object.fromEntries(content.map(p=>[p.id,p.navigationLabel||p.heading]))', '...Object.fromEntries(content.flatMap(p=>[p.id,...(p.aliases||[])].map(id=>[id,p.navigationLabel||p.heading])))');
  app = app.replaceAll('href="?"', 'href="/oenskelandet/"').replaceAll("a.href='?preview=1'", "a.href=link('')");
  return app;
}
