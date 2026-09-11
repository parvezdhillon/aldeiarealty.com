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
  // A property can be offered for sale AND rent simultaneously —
  // Inmovilla sets accion to "Vender o Alquilar" and populates both price fields.
  const hasSale = priceSale > 0;
  const hasRent = priceRent > 0;
  const operation = (hasSale && hasRent) ? 'both' : hasRent ? 'rent' : 'sale';
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
    operation,
    priceSale: hasSale ? priceSale : null,
    priceRent: hasRent ? priceRent : null,
    // `price` stays the headline figure the finder sorts and filters on:
    // the sale price when there is one, otherwise the rent.
    price: hasSale ? priceSale : priceRent,
    priceLabelEN: operation === 'both'
      ? euro(priceSale) + ' or ' + euro(priceRent) + ' / month'
      : operation === 'rent' ? euro(priceRent) + ' / month' : euro(priceSale),
    priceLabelPT: operation === 'both'
      ? euro(priceSale) + ' ou ' + euro(priceRent) + ' / mês'
      : operation === 'rent' ? euro(priceRent) + ' / mês' : euro(priceSale),
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

// ---------- badge text (sale / rent / both) ----------
function badgeText(p, en) {
  if (p.operation === 'both') return en ? 'FOR SALE OR RENT' : 'VENDA OU ARRENDAMENTO';
  if (p.operation === 'rent') return en ? 'FOR RENT' : 'ARRENDAR';
  return en ? 'FOR SALE' : 'VENDA';
}

// ---------- card HTML (matches existing .prop-card design) ----------
function cardHtml(p, lang) {
  const en = lang === 'en';
  const badge = badgeText(p, en);
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

// ---------- SEO head: canonical, hreflang, Open Graph, JSON-LD ----------
const SITE = 'https://www.aldeiarealty.com';
const ORG_ID = SITE + '/#organization';

// Map an Inmovilla tipo_ofer onto the closest schema.org accommodation type.
function schemaTypeFor(p) {
  const t = String(p.type || '').toLowerCase();
  if (t.includes('apartamento') || t.includes('piso') || t.includes('flat')) return 'Apartment';
  if (t.includes('terreno') || t.includes('parcela')) return 'Place';
  return 'SingleFamilyResidence';
}

function seoHead(p, lang) {
  const en = lang === 'en';
  const enPath = 'property-' + p.slug + '.html';
  const ptPath = 'pt/imovel-' + p.slug + '.html';
  const selfPath = en ? enPath : ptPath;
  const title = en ? p.titleEN : p.titlePT;
  const desc = esc(((en ? p.descEN : p.descPT)[0] || title)).slice(0, 200);
  const img = p.photos[0] || (SITE + '/images/AldeiaRealty-Social-Preview.jpg');
  return `<link rel="canonical" href="${SITE}/${selfPath}" />
<link rel="alternate" hreflang="en" href="${SITE}/${enPath}" />
<link rel="alternate" hreflang="pt-PT" href="${SITE}/${ptPath}" />
<link rel="alternate" hreflang="x-default" href="${SITE}/${enPath}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Aldeia Realty" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="${SITE}/${selfPath}" />
<meta property="og:image" content="${img}" />
<meta property="og:locale" content="${en ? 'en_GB' : 'pt_PT'}" />
<meta property="og:locale:alternate" content="${en ? 'pt_PT' : 'en_GB'}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/x-icon" href="${en ? '' : '../'}logos/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="${en ? '' : '../'}logos/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="${en ? '' : '../'}logos/apple-touch-icon.png">
`;
}

function listingLd(p, lang) {
  const en = lang === 'en';
  const selfPath = en ? ('property-' + p.slug + '.html') : ('pt/imovel-' + p.slug + '.html');
  const title = en ? p.titleEN : p.titlePT;
  const paras = en ? p.descEN : p.descPT;

  const about = {
    '@type': schemaTypeFor(p),
    name: title,
    address: {
      '@type': 'PostalAddress',
      addressLocality: p.city || 'Caldas da Rainha',
      addressRegion: p.province || 'Leiria',
      addressCountry: 'PT',
    },
  };
  if (p.zone) about.address.addressLocality = p.city || p.zone;
  if (p.bedrooms) about.numberOfBedrooms = p.bedrooms;
  if (p.bathrooms) about.numberOfBathroomsTotal = p.bathrooms;
  if (p.areaBuilt) about.floorSize = { '@type': 'QuantitativeValue', value: Math.round(p.areaBuilt), unitCode: 'MTK' };
  if (p.plot) about.lotSize = { '@type': 'QuantitativeValue', value: Math.round(p.plot), unitCode: 'MTK' };
  if (p.yearBuilt && /^\d{4}$/.test(String(p.yearBuilt))) about.yearBuilt = Number(p.yearBuilt);
  const amenities = [];
  if (p.poolPrivate || p.poolShared) amenities.push('Swimming pool');
  if (p.parking) amenities.push('Parking');
  if (p.elevator) amenities.push('Lift');
  if (amenities.length) {
    about.amenityFeature = amenities.map(n => ({ '@type': 'LocationFeatureSpecification', name: n, value: true }));
  }

  // A property can be for sale AND for rent — emit an Offer for each.
  const offers = [];
  if (p.priceSale) {
    offers.push({
      '@type': 'Offer', price: p.priceSale, priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
      url: SITE + '/' + selfPath,
    });
  }
  if (p.priceRent) {
    offers.push({
      '@type': 'Offer', price: p.priceRent, priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
      unitCode: 'MON',
      url: SITE + '/' + selfPath,
    });
  }

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    '@id': SITE + '/' + selfPath + '#listing',
    url: SITE + '/' + selfPath,
    name: title,
    description: (paras[0] || title).slice(0, 500),
    inLanguage: en ? 'en' : 'pt-PT',
    identifier: p.ref,
    image: p.photos.slice(0, 12),
    provider: { '@id': ORG_ID },
    about,
  };
  if (offers.length) ld.offers = offers.length === 1 ? offers[0] : offers;
  if (p.updated) {
    const m = String(p.updated).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) ld.datePosted = m[0];
  }
  return '<script type="application/ld+json">\n'
    + JSON.stringify(ld, null, 2) + '\n</script>\n';
}

// ---------- homepage section ----------
// Same cards as the properties page, but homepage copy, the dove background the
// old "Coming soon / sample listings" block used, a max of three cards, and a
// "browse all" button underneath.
function homeSectionHtml(props, lang) {
  const en = lang === 'en';
  if (!props.length) return ''; // empty feed → section disappears
  const shown = props.slice(0, 3);
  const kicker = en ? 'Available now' : 'Dispon&iacute;vel agora';
  const h2 = en
    ? 'Homes we are <em>listing right now</em>.'
    : 'Im&oacute;veis que estamos a <em>angariar agora</em>.';
  const sub = en
    ? 'Listed and represented by Aldeia Realty. Updated daily from our property system.'
    : 'Angariados e representados pela Aldeia Realty. Atualizado diariamente a partir do nosso sistema.';
  const more = en ? 'Browse All Properties &rarr;' : 'Ver Todos os Im&oacute;veis &rarr;';
  return `<section class="section dove">
  <div class="container">
    <div class="section-header"><div class="kicker">${kicker}</div><h2>${h2}</h2><p class="sub">${sub}</p></div>
    <div class="grid-3">
${shown.map(p => cardHtml(p, lang)).join('\n')}
    </div>
    <div style="text-align:center;margin-top:32px">
      <a class="btn btn-secondary" href="properties.html">${more}</a>
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
  const badge = badgeText(p, en);
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
  const thumbs = p.photos.map((u, i) =>
    `<img src="${u}" loading="lazy" decoding="async" alt="${esc(title)} ${i + 1}" data-i="${i}" class="pd-thumb${i === 0 ? ' is-active' : ''}">`
  ).join('\n        ');
  const photosJson = JSON.stringify(p.photos);
  return `<!DOCTYPE html>
<html lang="${en ? 'en' : 'pt'}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Aldeia Realty</title>
<meta name="description" content="${esc(paras[0] || title).slice(0, 155)}">
${seoHead(p, lang)}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Domine:wght@400;700&family=Work+Sans:wght@400;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${cssPath}">
<style>
.pd-wrap{max-width:1088px;margin:0 auto;padding:0 20px}
.pd-gallery{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-top:24px}
.pd-main img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:3px}
.pd-thumbs{display:grid;grid-template-columns:1fr 1fr;gap:10px;max-height:560px;overflow-y:auto;padding-right:4px}
.pd-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:12px;margin-top:28px}
.pd-head h1{font-family:Domine,serif;font-weight:700;font-size:clamp(24px,3.4vw,36px);line-height:1.12;color:#1c0a04;max-width:700px}
.pd-price{font-family:Domine,serif;font-weight:700;font-size:clamp(22px,3vw,32px);color:#296662;white-space:normal}
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
.pd-main{position:relative}
.pd-main img{cursor:zoom-in}
.pd-arrow{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;padding:0;border:0;border-radius:50%;background:rgba(28,10,4,0.55);color:#f4ecdc;font-size:19px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s}
.pd-arrow:hover{background:#296662}
.pd-arrow.prev{left:12px}
.pd-arrow.next{right:12px}
.pd-count{position:absolute;right:12px;bottom:12px;background:rgba(28,10,4,0.6);color:#f4ecdc;font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:0.12em;padding:5px 10px;border-radius:2px;pointer-events:none}
.pd-thumb{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:3px;cursor:pointer;border:1px solid rgba(41,102,98,0.15);transition:border-color .15s,opacity .15s}
.pd-thumb:hover{opacity:0.85}
.pd-thumb.is-active{border:2px solid #efd48f}
.pd-lb{position:fixed;inset:0;background:rgba(12,6,3,0.94);display:none;align-items:center;justify-content:center;z-index:9999}
.pd-lb.open{display:flex}
.pd-lb img{max-width:92vw;max-height:86vh;object-fit:contain;border-radius:3px}
.pd-lb .pd-arrow{width:52px;height:52px;font-size:23px;background:rgba(244,236,220,0.14)}
.pd-lb-close{position:absolute;top:16px;right:22px;background:none;border:0;color:#f4ecdc;font-size:34px;line-height:1;cursor:pointer}
.pd-lb-count{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);color:#f4ecdc;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:0.16em}
@media(max-width:820px){.pd-gallery,.pd-cols{grid-template-columns:1fr}.pd-thumbs{grid-template-columns:repeat(4,1fr);max-height:340px}.pd-arrow{width:38px;height:38px;font-size:16px}}
</style>
${listingLd(p, lang)}</head>
<body style="background:#fbf8f3">
<div class="pd-wrap">
  <div class="pd-nav">
    <a href="${homeHref}"><img src="${logoPath}" alt="Aldeia Realty" style="height:40px;width:auto;display:block"></a>
    <div><a href="${backHref}">${t.back}</a> &nbsp;&nbsp; <a href="${otherLangHref}">${en ? 'PT' : 'EN'}</a></div>
  </div>
  <div class="pd-gallery">
    <div class="pd-main">
      <img id="mainPhoto" src="${p.photos[0] || ''}" alt="${esc(title)}">
      <button type="button" class="pd-arrow prev" id="pdPrev" aria-label="&#8592;">&#10094;</button>
      <button type="button" class="pd-arrow next" id="pdNext" aria-label="&#8594;">&#10095;</button>
      <div class="pd-count"><span id="pdIdx">1</span> / <span class="pdTotal">${p.photos.length}</span> ${t.photos}</div>
    </div>
    <div class="pd-thumbs" id="pdThumbs">
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
<div class="pd-lb" id="pdLb" role="dialog" aria-modal="true">
  <button type="button" class="pd-lb-close" id="pdLbClose" aria-label="Close">&times;</button>
  <button type="button" class="pd-arrow prev" id="pdLbPrev" aria-label="&#8592;">&#10094;</button>
  <img id="pdLbImg" src="" alt="${esc(title)}">
  <button type="button" class="pd-arrow next" id="pdLbNext" aria-label="&#8594;">&#10095;</button>
  <div class="pd-lb-count"><span id="pdLbIdx">1</span> / <span class="pdTotal">${p.photos.length}</span></div>
</div>
<script>
(function(){
  var main = document.getElementById('mainPhoto');
  if (!main) return;
  var i = 0;
  var idxEl = document.getElementById('pdIdx');
  var lb = document.getElementById('pdLb');
  var lbImg = document.getElementById('pdLbImg');
  var lbIdx = document.getElementById('pdLbIdx');
  var totals = Array.prototype.slice.call(document.querySelectorAll('.pdTotal'));
  var thumbs = [];
  var PHOTOS = [];

  // The gallery is driven by the thumbnails that actually load. If the CDN has
  // lost a photo since the last build, its thumb is removed and the count and
  // arrows adjust, instead of leaving a broken-image tile at the end of the rail.
  function sync(){
    thumbs = Array.prototype.slice.call(document.querySelectorAll('.pd-thumb'));
    PHOTOS = thumbs.map(function(t){ return t.getAttribute('src'); });
    for (var z = 0; z < totals.length; z++) totals[z].textContent = PHOTOS.length;
  }
  sync();
  if (!PHOTOS.length) return;

  for (var q = 0; q < thumbs.length; q++) {
    (function(el){
      el.addEventListener('error', function(){
        var was = PHOTOS[i];
        if (el.parentNode) el.parentNode.removeChild(el);
        sync();
        if (!PHOTOS.length) return;
        var at = PHOTOS.indexOf(was);
        show(at === -1 ? Math.min(i, PHOTOS.length - 1) : at, false);
      });
    })(thumbs[q]);
  }

  function show(n, scroll){
    i = (n + PHOTOS.length) % PHOTOS.length;
    main.src = PHOTOS[i];
    if (idxEl) idxEl.textContent = i + 1;
    if (lbIdx) lbIdx.textContent = i + 1;
    if (lb.classList.contains('open')) lbImg.src = PHOTOS[i];
    for (var k = 0; k < thumbs.length; k++) {
      if (k === i) { thumbs[k].classList.add('is-active'); } else { thumbs[k].classList.remove('is-active'); }
    }
    if (scroll && thumbs[i] && thumbs[i].scrollIntoView) {
      thumbs[i].scrollIntoView({ block: 'nearest' });
    }
  }
  function step(d){ show(i + d, true); }
  function openLb(){ lbImg.src = PHOTOS[i]; lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeLb(){ lb.classList.remove('open'); document.body.style.overflow = ''; }

  document.getElementById('pdPrev').addEventListener('click', function(e){ e.stopPropagation(); step(-1); });
  document.getElementById('pdNext').addEventListener('click', function(e){ e.stopPropagation(); step(1); });
  document.getElementById('pdLbPrev').addEventListener('click', function(e){ e.stopPropagation(); step(-1); });
  document.getElementById('pdLbNext').addEventListener('click', function(e){ e.stopPropagation(); step(1); });
  document.getElementById('pdLbClose').addEventListener('click', closeLb);
  main.addEventListener('click', openLb);
  lb.addEventListener('click', function(e){ if (e.target === lb) closeLb(); });

  // Index by live position, not the build-time data-i, so clicks stay correct
  // after a dead thumbnail has been pruned.
  for (var j = 0; j < thumbs.length; j++) {
    (function(el){
      el.addEventListener('click', function(){
        var at = thumbs.indexOf(el);
        if (at !== -1) show(at, false);
      });
    })(thumbs[j]);
  }

  document.addEventListener('keydown', function(e){
    if (e.key === 'ArrowLeft') { step(-1); }
    else if (e.key === 'ArrowRight') { step(1); }
    else if (e.key === 'Escape' && lb.classList.contains('open')) { closeLb(); }
  });

  var x0 = null;
  function tStart(e){ x0 = e.changedTouches[0].clientX; }
  function tEnd(e){
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    x0 = null;
  }
  var swipers = [main, lb];
  for (var s = 0; s < swipers.length; s++) {
    swipers[s].addEventListener('touchstart', tStart, { passive: true });
    swipers[s].addEventListener('touchend', tEnd, { passive: true });
  }

  show(0, false);
})();
</script>
</body>
</html>`;
}

// ---------- inject cards into properties pages via markers ----------
const START = '<!-- AR:LISTINGS:START (auto-generated - do not edit between markers) -->';
const END = '<!-- AR:LISTINGS:END -->';
const HOME_START = '<!-- AR:HOME-LISTINGS:START (auto-generated - do not edit between markers) -->';
const HOME_END = '<!-- AR:HOME-LISTINGS:END -->';
function injectSection(filePath, html, startMarker, endMarker) {
  const s = startMarker || START;
  const e = endMarker || END;
  let src = fs.readFileSync(filePath, 'utf8');
  const block = s + '\n' + html + '\n' + e;
  if (src.includes(s) && src.includes(e)) {
    src = src.replace(new RegExp(escapeRe(s) + '[\\s\\S]*?' + escapeRe(e)), block);
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

// ---------- sitemap: keep the listing URLs in step with the feed ----------
const SITEMAP_START = '  <!-- AR:SITEMAP-LISTINGS:START (auto-generated - do not edit between markers) -->';
const SITEMAP_END = '  <!-- AR:SITEMAP-LISTINGS:END -->';
function updateSitemap(props) {
  const file = path.join(ROOT, 'sitemap.xml');
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('AR:SITEMAP-LISTINGS:START')) {
    console.warn('Skipped sitemap.xml — AR:SITEMAP-LISTINGS markers not found.');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const entries = [];
  for (const p of props) {
    const en = SITE + '/property-' + p.slug + '.html';
    const pt = SITE + '/pt/imovel-' + p.slug + '.html';
    const alts = `    <xhtml:link rel="alternate" hreflang="en" href="${en}" />
    <xhtml:link rel="alternate" hreflang="pt-PT" href="${pt}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />`;
    for (const loc of [en, pt]) {
      entries.push(`  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
${alts}
  </url>`);
    }
  }
  const block = SITEMAP_START + '\n' + entries.join('\n') + '\n' + SITEMAP_END;
  src = src.replace(
    new RegExp(escapeRe(SITEMAP_START) + '[\\s\\S]*?' + escapeRe(SITEMAP_END)),
    block
  );
  fs.writeFileSync(file, src);
  console.log('Updated sitemap.xml');
}

// ---------- drop dead photo URLs ----------
// Inmovilla's feed keeps referencing photos that have been deleted from the CDN
// (e.g. AR20260828 declared numfotos=79 with slots 76-79 returning 404), which
// rendered as broken-image thumbnails at the end of the gallery. Verify each URL
// and drop only the definitively-gone ones — a timeout or a 5xx keeps the photo,
// so a flaky build never silently strips a good gallery.
async function dropDeadPhotos(props) {
  const CONC = 12;
  const jobs = [];
  for (const p of props) for (const url of p.photos) jobs.push({ p, url });
  const dead = new Set();
  let n = 0;
  async function worker() {
    while (n < jobs.length) {
      const job = jobs[n++];
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        let res = await fetch(job.url, { method: 'HEAD', signal: ctl.signal });
        clearTimeout(timer);
        if (res.status === 404 || res.status === 410) dead.add(job.url);
      } catch (e) {
        // network hiccup — keep the photo
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  if (dead.size) {
    for (const p of props) {
      const before = p.photos.length;
      p.photos = p.photos.filter(u => !dead.has(u));
      if (p.photos.length !== before) {
        console.log('  ' + p.ref + ': dropped ' + (before - p.photos.length) + ' dead photo URL(s), ' + p.photos.length + ' remain');
      }
    }
  } else {
    console.log('  all photo URLs resolved');
  }
}

// ---------- main ----------
(async () => {
  const xml = await getFeedXml();
  const props = blocks(xml, 'propiedad').map(parseProperty)
    .filter(p => p.id && (p.price > 0));
  console.log('Listings in feed:', props.length, props.map(p => p.ref).join(', '));

  console.log('Verifying photo URLs...');
  await dropDeadPhotos(props);

  // 1. JSON for the Property Finder
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  for (const lang of ['en', 'pt']) {
    const en = lang === 'en';
    const json = props.map(p => ({
      ref: p.ref, operation: p.operation, price: p.price,
      priceSale: p.priceSale, priceRent: p.priceRent,
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

  // 4. Homepage: the same live listings, max three, replacing the old
  //    "Coming soon / sample listings" block. Markers only — never guess a
  //    position on the homepage.
  for (const [file, lang] of [['index.html', 'en'], [path.join('pt', 'index.html'), 'pt']]) {
    const full = path.join(ROOT, file);
    const src = fs.readFileSync(full, 'utf8');
    if (src.includes(HOME_START) && src.includes(HOME_END)) {
      injectSection(full, homeSectionHtml(props, lang), HOME_START, HOME_END);
    } else {
      console.warn('Skipped ' + file + ' — AR:HOME-LISTINGS markers not found.');
    }
  }

  // 5. Sitemap entries for the listing pages
  updateSitemap(props);

  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
