export function contentPresentation(app) {
  const replacements = [
    ['<section class="hero">', '<section class="hero" data-home-section="hero">'],
    ['<section class="section"><div class="container"><div class="age-grid">', '<section class="section" data-home-section="offers"><div class="container"><div class="age-grid">'],
    ['<section class="nature">', '<section class="nature" data-home-section="nature">'],
    ['<section class="section everyday">', '<section class="section everyday" data-home-section="videos">'],
    ['<section class="section"><div class="container"><div class="section-heading"><h2>${esc(h.practicalHeading', '<section class="section" data-home-section="practical"><div class="container"><div class="section-heading"><h2>${esc(h.practicalHeading'],
    ['<section class="visit">', '<section class="visit" data-home-section="visit">'],
    ['<section class="source-home-content">', '<section class="source-home-content" data-home-section="source">'],
    ["${filmCard('vuggestue')}${filmCard('om/mad-og-maaltider')}${filmCard('om/foraeldresamarbejde')}", "${(h.videoPages||['vuggestue','om/mad-og-maaltider','om/foraeldresamarbejde']).map(filmCard).join('')}"],
    ["${['praktisk/venteliste','praktisk/priser','praktisk/aabningstider','praktisk/intranet'].filter(get)", "${(h.practicalPages||['praktisk/venteliste','praktisk/priser','praktisk/aabningstider','praktisk/intranet']).filter(get)"],
  ];
  for (const [before, after] of replacements) { if (!app.includes(before)) throw new Error('Review the homepage before packaging content sections.'); app = app.replace(before, after); }
  return app.replace('\nbootstrap();', `
const fixedHomepage=homepage;
homepage=function(){
  const container=document.createElement('div');container.innerHTML=fixedHomepage();
  const home=siteConfig?.home||{};
  if(home.extraHtml){const section=document.createElement('section');section.className='section';section.dataset.homeSection='extra';const body=document.createElement('div');body.className='container article-body';body.innerHTML=home.extraHtml;section.append(body);container.append(section);}
  const order=home.sectionOrder||['hero','offers','nature','videos','practical','visit','extra','source'];
  for(const key of order){const section=container.querySelector('[data-home-section="'+key+'"]');if(section)container.append(section);}
  return container.innerHTML;
};
bootstrap();`);
}
