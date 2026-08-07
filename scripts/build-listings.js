#!/usr/bin/env node
/**
 * Aldeia Realty — Inmovilla XML feed → website listings
 * ------------------------------------------------------
 * Fetches the nightly Inmovilla XML feed and generates:
 *   1. Static listing cards inside properties.html and pt/properties.html
 *      (between AR:LISTINGS:START / AR:LISTINGS:END markers)
 *   2. One detail page per listing:  property-<ref>.html (EN)
 *      and pt/imovel-<ref>.html (PT)
 *   3. data/listings-en.json + data/listings-pt.json for the Property Finder
 *
 * Runs in GitHub Actions daily. No npm dependencies — plain Node 18+.
 *
 * Env:
 *   INMOVILLA_XML_URL   the secret feed URL (set as a GitHub Actions secret)
 *   LISTINGS_XML_FILE   optional local file path (used for testing instead of URL)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---------- fetch ----------
async function getFeedXml() {
  const localFile = process.env.LISTINGS_XML_FILE;
  if (localFile) {
    console.log('Reading feed from local file:', localFile);
    return fs.readFileSync(localFile, 'utf8');
  }
  const url = process.env.INMOVILLA_XML_URL;
  if (!url) throw new Error('INMOVILLA_XML_URL is not set (and no LISTINGS_XML_FILE given)');
  console.log('Fetching feed from Inmovilla…');
  const res = await fetch(url, { headers: { 'User-Agent': 'AldeiaRealty-SiteBuilder/1.0' } });
  if (!res.ok) throw new Error('Feed fetch failed: HTTP ' + res.status);
  return await res.text();
}

// ---------- tiny XML helpers (fixed, trusted schema from Inmovilla) ----------
function blocks(xml, tag) {
  const re = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}
function field(block, tag) {
  const m = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Inmovilla uses ~ as line break and ~~ as paragraph break
function descToParas(raw) {
  return raw.split(/~+/).map(s => s.trim()).filter(Boolean);
}
function euro(n) {
  return Number(n).toLocaleString('pt-PT').replace(/ /g, '.') + ' €';
}

// ---------- parse one <propiedad> ----------
function parseProperty(b) {
  const priceSale = parseInt(field(b, 'precioinmo') || '0', 10);
  const priceRent = parseInt(field(b, 'precioalq') || '0', 10);
  const isRent = priceRent > 0 && priceSale === 0;
  const bedrooms = (parseInt(field(b, 'habdobles') || '0', 10) + parseInt(field(b, 'habitaciones') || '0', 10)) || null;
  const photos = [];
  for (let i = 1; i <= parseInt(field(b, 'numfotos') || '0', 10); i++) {
    const u = field(b, 'foto' + i);
    if (u) photos.push(u);
  }
  return {
    id: field(b, 'id'),
    ref: field(b, 'ref'),
    slug: field(b, 'ref').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    operation: isRent ? 'rent' : 'sale',
    price: isRent ? priceRent : priceSale,
    priceLabelEN: isRent ? euro(priceRent) + ' / month' : euro(priceSale),
    priceLabelPT: isRent ? euro(priceRent) + ' / mês' : euro(priceSale),
    type: field(b, 'tipo_ofer'),
    city: field(b, 'ciudad'),
    zone: field(b, 'zona'),
    province: field(b, 'provincia'),
    bedrooms,
    bathrooms: parseInt(field(b, 'banyos') || '0', 10) || null,
    areaBuilt: parseFloat(field(b, 'm_cons') || '0') || null,
    areaUseful: parseFloat(field(b, 'm_uties') || '0') || null,
    plot: parseFloat(field(b, 'm_parcela') || '0') || null,
    floor: field(b, 'planta'),
    yearBuilt: field(b, 'antiguedad'),
    condition: field(b, 'conservacion'),
    parking: parseInt(field(b, 'parking') || '0', 10) > 0,
    poolPrivate: field(b, 'piscina_prop') === '1',
    poolShared: field(b, 'piscina_com') === '1',
    elevator: field(b, 'ascensor') === '1',
    energyLetter: field(b, 'energialetra'),
    energyCert: field(b, 'refcertificado'),
    exclusive: field(b, 'exclu') === '1',
    agent: field(b, 'agente'),
    updated: field(b, 'fechaact'),
    titleEN: field(b, 'titulo2') || field(b, 'titulo8'),
    descEN: descToParas(field(b, 'descrip2') || field(b, 'descrip8')),
    titlePT: field(b, 'titulo8') || field(b, 'titulo2'),
    descPT: descToParas(field(b, 'descrip8') || field(b, 'descrip2')),
    photos,
  };
}

// ---------- card HTML (matches existing .prop-card design) ----------
function cardHtml(p, lang) {
  const en = lang === 'en';
  const badge = p.operation === 'rent' ? (en ? 'FOR RENT' : 'ARRENDAR') : (en ? 'FOR SALE' : 'VENDA');
  const title = en ? p.titleEN : p.titlePT;
  const priceLabel = en ? p.priceLabelEN : p.priceLabelPT;
  const detailHref = en ? ('property-' + p.slug + '.html') : ('imovel-' + p.slug + '.html');
  const facts = [
    p.bedrooms ? 'T' + p.bedrooms : null,
    p.bathrooms ? (p.bathrooms + ' ' + (en ? 'bath' : 'WC')) : null,
    p.areaBuilt ? (Math.round(p.areaBuilt) + ' m²') : null,
    p.energyLetter ? ((en ? 'Energy ' : 'Energ. ') + p.energyLetter) : null,
  ].filter(Boolean).join(' · ');
  const linkText = en ? 'View Property &rarr;' : 'Ver Im&oacute;vel &rarr;';
  return `      <div class="prop-card">
        <a href="${detailHref}" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;height:100%">
        <div class="prop-img" style="background-image:url('${p.photos[0] || ''}')"><div class="prop-badge">${badge}</div></div>
        <div class="prop-body">
          <div class="prop-loc">${esc(p.city)} &middot; ${priceLabel}</div>
          <h3>${esc(title)}</h3>
          <p>${esc(facts)}${p.exclusive ? (en ? ' · Exclusive listing' : ' · Exclusivo Aldeia') : ''}</p>
          <span class="prop-link">${linkText}</span>
        </div>
        </a>
      </div>`;
}

function sectionHtml(props, lang) {
  const en = lang === 'en';
  if (!props.length) return ''; // empty feed → section disappears, samples remain
  const kicker = en ? 'Available now' : 'Dispon&iacute;vel agora';
  const h2 = en ? 'Our <em>current listings</em>.' : 'Os nossos <em>im&oacute;veis atuais</em>.';
  const sub = en
    ? 'Listed and represented by Aldeia Realty. Updated daily from our property system.'
    : 'Angariados e representados pela Aldeia Realty. Atualizado diariamente a partir do nosso sistema.';
  return `<section class="section white">
  <div class="container">
    <div class="section-header"><div class="kicker">${kicker}</div><h2>${h2}</h2><p class="sub">${sub}</p></div>
    <div class="grid-3">
${props.map(p => cardHtml(p, lang)).join('\n')}
    </div>
  </div>
</section>`;
}

// ---------- detail page ----------
function detailHtml(p, lang) {
  const en = lang === 'en';
  const cssPath = en ? 'css/style.css' : '../css/style.css';
  const backHref = en ? 'properties.html' : 'properties.html';
  const otherLangHref = en ? ('pt/imovel-' + p.slug + '.html') : ('../property-' + p.slug + '.html');
  const homeHref = en ? 'index.html' : 'index.html';
  const contactHref = en ? 'contact.html' : 'contact.html';
  const logoPath = en ? 'logos/AR-Logo-Horizontal-FullColour@2x.png' : '../logos/AR-Logo-Horizontal-FullColour@2x.png';
  const title = en ? p.titleEN : p.titlePT;
  const paras = en ? p.descEN : p.descPT;
  const priceLabel = en ? p.priceLabelEN : p.priceLabelPT;
  const badge = p.operation === 'rent' ? (en ? 'FOR RENT' : 'ARRENDAR') : (en ? 'FOR SALE' : 'VENDA');
  const t = en ? {
    back: '&larr; All properties', facts: 'Property Facts', desc: 'About this property',
    beds: 'Bedrooms', baths: 'Bathrooms', built: 'Built area', useful: 'Useful area',
    floor: 'Floor', year: 'Year built', cond: 'Condition', park: 'Parking', energy: 'Energy rating',
    ref: 'Reference', cta: 'Arrange a viewing', ctaSub: 'Speak with ' + (p.agent || 'our team') + ' — English spoken.',
    contact: 'Contact us', whatsapp: 'WhatsApp', photos: 'Photos', yes: 'Yes', condMap: { 'Para reformar': 'To renovate', 'Buen estado': 'Good condition' },
  } : {
    back: '&larr; Todos os im&oacute;veis', facts: 'Caracter&iacute;sticas', desc: 'Sobre este im&oacute;vel',
    beds: 'Quartos', baths: 'Casas de banho', built: '&Aacute;rea bruta', useful: '&Aacute;rea &uacute;til',
    floor: 'Andar', year: 'Ano de constru&ccedil;&atilde;o', cond: 'Estado', park: 'Estacionamento', energy: 'Cert. energ&eacute;tico',
    ref: 'Refer&ecirc;ncia', cta: 'Agendar visita', ctaSub: 'Fale com ' + (p.agent || 'a nossa equipa') + '.',
    contact: 'Contacte-nos', whatsapp: 'WhatsApp', photos: 'Fotografias', yes: 'Sim', condMap: { 'Para reformar': 'Para renovar', 'Buen estado': 'Bom estado' },
  };
  const condDisplay = t.condMap[p.condition] || p.condition;
  const factRows = [
    [t.ref, p.ref], [t.beds, p.bedrooms ? 'T' + p.bedrooms : null], [t.baths, p.bathrooms],
    [t.built, p.areaBuilt ? p.areaBuilt + ' m²' : null], [t.useful, p.areaUseful ? p.areaUseful + ' m²' : null],
    [t.floor, p.floor || null], [t.year, p.yearBuilt || null], [t.cond, condDisplay || null],
    [t.park, p.parking ? t.yes : null], [t.energy, p.energyLetter ? p.energyLetter + (p.energyCert ? ' (' + p.energyCert + ')' : '') : null],
  ].filter(r => r[1] !== null && r[1] !== '' && r[1] !== undefined);
  const thumbs = p.photos.slice(0, 24).map((u, i) =>
    `<img src="${u}" loading="lazy" alt="${esc(title)} — ${i + 1}" onclick="document.getElementById('mainPhoto').src=this.src" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:3px;cursor:pointer;border:1px solid rgba(41,102,98,0.15)">`
  ).join('\n        ');
  return `<!DOCTYPE html>
<html lang="${en ? 'en' : 'pt'}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Aldeia Realty</title>
<meta name="description" content="${esc(paras[0] || title).slice(0, 155)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Domine:wght@400;700&family=Work+Sans:wght@400;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${cssPath}">
<style>
.pd-wrap{max-width:1088px;margin:0 auto;padding:0 20px}
.pd-gallery{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-top:24px}
.pd-main img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:3px}
.pd-thumbs{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-height:560px;overflow-y:auto;padding-right:4px}
.pd-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:12px;margin-top:28px}
.pd-head h1{font-family:Domine,serif;font-weight:700;font-size:clamp(24px,3.4vw,36px);line-height:1.12;color:#1c0a04;max-width:700px}
.pd-price{font-family:Domine,serif;font-weight:700;font-size:clamp(22px,3vw,32px);color:#296662;white-space:nowrap}
.pd-loc{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#296662;font-weight:600;margin-top:6px}
.pd-cols{display:grid;grid-template-columns:2fr 1fr;gap:36px;margin:34px 0 60px}
.pd-desc h2,.pd-facts h2{font-family:Domine,serif;font-weight:700;font-size:20px;color:#1c0a04;margin-bottom:14px}
.pd-desc p{font-size:15px;line-height:1.7;color:rgba(28,10,4,0.80);margin-bottom:14px}
.pd-facts{background:#fff;border:1px solid rgba(41,102,98,0.18);border-radius:3px;padding:24px;height:fit-content}
.pd-facts table{width:100%;border-collapse:collapse;font-size:14px}
.pd-facts td{padding:8px 0;border-bottom:1px solid rgba(41,102,98,0.10);color:rgba(28,10,4,0.80)}
.pd-facts td:first-child{font-family:"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:#296662;font-weight:600}
.pd-cta{background:#296662;border-top:3px solid #efd48f;border-radius:3px;padding:24px;margin-top:18px;color:#f4ecdc}
.pd-cta h3{font-family:Domine,serif;font-size:19px;margin-bottom:6px;color:#f4ecdc}
.pd-cta p{font-size:13.5px;color:rgba(244,236,220,0.85);margin-bottom:14px}
.pd-cta a{display:inline-block;margin:0 8px 8px 0;padding:10px 18px;border-radius:3px;font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;text-decoration:none}
.pd-cta .b1{background:#efd48f;color:#1c0a04}.pd-cta .b2{border:1px solid rgba(244,236,220,0.6);color:#f4ecdc}
.pd-nav{display:flex;justify-content:space-between;align-items:center;padding:18px 0}
.pd-nav a{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#296662;text-decoration:none;font-weight:600}
.pd-badge{display:inline-block;background:#efd48f;color:#1c0a04;font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;padding:5px 11px;border-radius:2px;margin-bottom:10px}
@media(max-width:820px){.pd-gallery,.pd-cols{grid-template-columns:1fr}.pd-thumbs{grid-template-columns:repeat(4,1fr);max-height:none}}
</style>
</head>
<body style="background:#fbf8f3">
<div class="pd-wrap">
  <div class="pd-nav">
    <a href="${homeHref}"><img src="${logoPath}" alt="Aldeia Realty" style="height:40px;width:auto;display:block"></a>
    <div><a href="${backHref}">${t.back}</a> &nbsp;&nbsp; <a href="${otherLangHref}">${en ? 'PT' : 'EN'}</a></div>
  </div>
  <div class="pd-gallery">
    <div class="pd-main"><img id="mainPhoto" src="${p.photos[0] || ''}" alt="${esc(title)}"></div>
    <div class="pd-thumbs">
        ${thumbs}
    </div>
  </div>
  <div class="pd-head">
    <div><span class="pd-badge">${badge}${p.exclusive ? ' · EXCLUSIVE' : ''}</span>
      <h1>${esc(title)}</h1>
      <div class="pd-loc">${esc(p.zone)} &middot; ${esc(p.city)} &middot; ${esc(p.province)}</div>
    </div>
    <div class="pd-price">${priceLabel}</div>
  </div>
  <div class="pd-cols">
    <div class="pd-desc">
      <h2>${t.desc}</h2>
      ${paras.map(x => '<p>' + esc(x) + '</p>').join('\n      ')}
    </div>
    <div>
      <div class="pd-facts">
        <h2>${t.facts}</h2>
        <table>${factRows.map(r => '<tr><td>' + r[0] + '</td><td style="text-align:right">' + esc(String(r[1])) + '</td></tr>').join('')}</table>
      </div>
      <div class="pd-cta">
        <h3>${t.cta}</h3>
        <p>${t.ctaSub}</p>
        <a class="b1" href="${contactHref}">${t.contact}</a>
        <a class="b2" href="https://wa.me/351913148143" target="_blank" rel="noopener">${t.whatsapp}</a>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ---------- inject cards into properties pages via markers ----------
const START = '<!-- AR:LISTINGS:START (auto-generated - do not edit between markers) -->';
const END = '<!-- AR:LISTINGS:END -->';
function injectSection(filePath, html) {
  let src = fs.readFileSync(filePath, 'utf8');
  const block = START + '\n' + html + '\n' + END;
  if (src.includes(START) && src.includes(END)) {
    src = src.replace(new RegExp(escapeRe(START) + '[\\s\\S]*?' + escapeRe(END)), block);
  } else {
    // First run: insert just before the sample-listings section
    const anchor = '<section class="section">';
    const idx = src.indexOf(anchor);
    if (idx === -1) throw new Error('Cannot find insertion anchor in ' + filePath);
    src = src.slice(0, idx) + block + '\n' + src.slice(idx);
  }
  fs.writeFileSync(filePath, src);
  console.log('Updated', path.relative(ROOT, filePath));
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---------- main ----------
(async () => {
  const xml = await getFeedXml();
  const props = blocks(xml, 'propiedad').map(parseProperty)
    .filter(p => p.id && (p.price > 0));
  console.log('Listings in feed:', props.length, props.map(p => p.ref).join(', '));

  // 1. JSON for the Property Finder
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  for (const lang of ['en', 'pt']) {
    const en = lang === 'en';
    const json = props.map(p => ({
      ref: p.ref, operation: p.operation, price: p.price,
      priceLabel: en ? p.priceLabelEN : p.priceLabelPT,
      title: en ? p.titleEN : p.titlePT,
      description: ((en ? p.descEN : p.descPT)[1] || (en ? p.descEN : p.descPT)[0] || '').slice(0, 180),
      location: p.city, bedrooms: p.bedrooms, bathrooms: p.bathrooms,
      image: p.photos[0] || null,
      url: en ? ('property-' + p.slug + '.html') : ('pt/imovel-' + p.slug + '.html'),
    }));
    fs.writeFileSync(path.join(ROOT, 'data', 'listings-' + lang + '.json'), JSON.stringify({ generated: new Date().toISOString(), listings: json }, null, 2));
  }
  console.log('Wrote data/listings-en.json and data/listings-pt.json');

  // 2. Detail pages
  for (const p of props) {
    fs.writeFileSync(path.join(ROOT, 'property-' + p.slug + '.html'), detailHtml(p, 'en'));
    fs.writeFileSync(path.join(ROOT, 'pt', 'imovel-' + p.slug + '.html'), detailHtml(p, 'pt'));
    console.log('Wrote property-' + p.slug + '.html and pt/imovel-' + p.slug + '.html');
  }

  // 3. Cards injected into the properties pages
  injectSection(path.join(ROOT, 'properties.html'), sectionHtml(props, 'en'));
  injectSection(path.join(ROOT, 'pt', 'properties.html'), sectionHtml(props, 'pt'));

  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
