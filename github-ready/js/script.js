// ===== SCROLL REVEAL =====
function initReveal() {
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -80px 0px' });
  reveals.forEach(el => observer.observe(el));
}

// ===== NAV SCROLL =====
function initNav() {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  const logo = nav.querySelector('img[alt="Aldeia Realty"]');
  const scrolledSrc = 'logos/AR-Logo-Horizontal-FullColour@2x.png';
  const transparentSrc = 'logos/AR-Logo-Horizontal-InverseColour@2x.png';
  function update() {
    if (window.scrollY > 100) {
      nav.classList.add('nav-scrolled');
      nav.classList.remove('nav-transparent');
      if (logo) logo.src = scrolledSrc;
    } else {
      nav.classList.add('nav-transparent');
      nav.classList.remove('nav-scrolled');
      if (logo) logo.src = transparentSrc;
    }
  }
  update();
  window.addEventListener('scroll', update, { passive: true });
}

// ===== MOBILE NAV =====
function initMobileNav() {
  const toggle = document.getElementById('mobileToggle');
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileOverlay');
  if (!toggle || !drawer || !overlay) return;
  function open() { drawer.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function close() { drawer.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow = ''; }
  toggle.addEventListener('click', () => drawer.classList.contains('open') ? close() : open());
  overlay.addEventListener('click', close);
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
}

// ===== ACCORDION =====
function initAccordion() {
  document.querySelectorAll('.accordion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      const isOpen = content.classList.contains('active');
      document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));
      if (!isOpen) content.classList.add('active');
    });
  });
}

// ===== CALCULATOR HELPERS =====
function toEUR(amount, currency, rate) {
  if (currency === 'EUR') return amount;
  if (currency === 'USD') return amount / rate;
  return amount;
}

function calcIMT(price, location, purpose) {
  let imt = 0;
  if (location === 'mainland' && purpose === 'primary') {
    if (price <= 101917) imt = 0;
    else if (price <= 139412) imt = price * 0.02 - 2038.34;
    else if (price <= 199642) imt = price * 0.05 - 6220.70;
    else if (price <= 316772) imt = price * 0.07 - 10213.54;
    else if (price <= 633453) imt = price * 0.08 - 13381.26;
    else if (price <= 1102920) imt = price * 0.06;
    else imt = price * 0.075;
  } else if (location === 'mainland' && purpose === 'secondary') {
    if (price <= 101917) imt = price * 0.01;
    else if (price <= 139412) imt = price * 0.02 - 1019.17;
    else if (price <= 199642) imt = price * 0.05 - 5201.53;
    else if (price <= 316772) imt = price * 0.07 - 9194.37;
    else if (price <= 633453) imt = price * 0.08 - 12362.09;
    else if (price <= 1102920) imt = price * 0.06;
    else imt = price * 0.075;
  } else if (location === 'islands' && purpose === 'primary') {
    if (price <= 127396) imt = 0;
    else if (price <= 174265) imt = price * 0.02 - 2547.92;
    else if (price <= 249552) imt = price * 0.05 - 7775.87;
    else if (price <= 395965) imt = price * 0.07 - 12766.91;
    else if (price <= 791816) imt = price * 0.08 - 16726.56;
    else if (price <= 1378650) imt = price * 0.06;
    else imt = price * 0.075;
  } else if (location === 'islands' && purpose === 'secondary') {
    if (price <= 127396) imt = price * 0.01;
    else if (price <= 174265) imt = price * 0.02 - 1273.96;
    else if (price <= 249552) imt = price * 0.05 - 6501.91;
    else if (price <= 395965) imt = price * 0.07 - 11492.95;
    else if (price <= 791816) imt = price * 0.08 - 15452.60;
    else if (price <= 1378650) imt = price * 0.06;
    else imt = price * 0.075;
  }
  return Math.max(0, imt);
}

function fmtEUR(n) { return '\u20ac' + Math.round(n).toLocaleString('en-US'); }

// ===== EXPAT CALCULATOR (with mortgage) =====
function updateRateHint() {
  const euriborEl = document.getElementById('euriborRate');
  const typeEl = document.getElementById('mortgageType');
  const appliedEl = document.getElementById('appliedRate');
  const hintEl = document.getElementById('rateHint');
  if (!euriborEl || !typeEl || !appliedEl) return;
  const euribor = parseFloat(euriborEl.value) || 2.65;
  const type = typeEl.value;
  let spread = 1.0, label = 'Mixed';
  if (type === 'fixed2') { spread = 2.0; label = 'Fixed'; }
  if (type === 'fixed3') { spread = 3.0; label = 'Fixed'; }
  const total = (euribor + spread).toFixed(2);
  appliedEl.value = total + '%';
  if (hintEl) hintEl.textContent = label + ' rate = ' + euribor + '% EURIBOR + ' + spread + '% spread = ' + total + '% total interest';
}

function runExpatCalc() {
  const exRate = parseFloat(document.getElementById('exRate').value) || 1.08;
  const salePrice = toEUR(parseFloat(document.getElementById('salePrice').value)||0, document.getElementById('currSale').value, exRate);
  const mortgageBal = toEUR(parseFloat(document.getElementById('mortgageBalance').value)||0, document.getElementById('currMortgage').value, exRate);
  const cashOnHand = toEUR(parseFloat(document.getElementById('cashOnHand').value)||0, document.getElementById('currCash').value, exRate);
  const purchasePrice = parseFloat(document.getElementById('purchasePrice').value)||0;
  const downpayment = parseFloat(document.getElementById('downpaymentAmount').value)||0;
  const ptLoc = document.getElementById('ptLocation').value;
  const ptPurpose = document.getElementById('ptPurpose').value;
  const homeOffice = document.getElementById('homeOffice').checked;

  const euribor = parseFloat(document.getElementById('euriborRate').value)||2.65;
  const mType = document.getElementById('mortgageType').value;
  let spread = 1.0;
  if (mType === 'fixed2') spread = 2.0;
  if (mType === 'fixed3') spread = 3.0;
  const annualRate = (euribor + spread) / 100;
  const termYears = parseInt(document.getElementById('loanTerm').value)||25;

  const equity = salePrice - mortgageBal;
  const totalCashPool = equity + cashOnHand;
  const newMortgage = Math.max(0, purchasePrice - downpayment);
  const imt = calcIMT(purchasePrice, ptLoc, ptPurpose);
  const stampDuty = purchasePrice * 0.008;
  const totalTaxes = imt + stampDuty;
  const totalCashReq = downpayment + totalTaxes;
  const remainingLiquid = totalCashPool - totalCashReq;

  let monthlyPayment = 0, totalInterest = 0;
  if (newMortgage > 0 && annualRate > 0) {
    const monthlyRate = annualRate / 12;
    const numPayments = termYears * 12;
    monthlyPayment = newMortgage * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    totalInterest = monthlyPayment * numPayments - newMortgage;
  }

  document.getElementById('resCashPool').textContent = fmtEUR(totalCashPool);
  document.getElementById('resDownpayment').textContent = fmtEUR(downpayment);
  document.getElementById('resClosing').textContent = fmtEUR(totalTaxes);
  document.getElementById('resTaxBreakdown').textContent = '(IMT: ' + fmtEUR(imt) + ' | Stamp: ' + fmtEUR(stampDuty) + ')';
  document.getElementById('resNewMortgage').textContent = fmtEUR(newMortgage);
  document.getElementById('resInterestRate').textContent = ((annualRate)*100).toFixed(2) + '%';
  document.getElementById('resLoanTerm').textContent = termYears + ' years';
  document.getElementById('resMonthly').textContent = fmtEUR(monthlyPayment) + '/mo';
  document.getElementById('resTotalInterest').textContent = fmtEUR(totalInterest);
  const liquidEl = document.getElementById('resLiquid');
  liquidEl.textContent = fmtEUR(remainingLiquid);
  liquidEl.className = remainingLiquid >= 0 ? 'text-green-600 font-bold' : 'text-coral font-bold';

  const warnOffice = document.getElementById('warningOffice');
  if (warnOffice) warnOffice.style.display = homeOffice ? 'block' : 'none';
  const warnShort = document.getElementById('shortfallWarning');
  if (warnShort) warnShort.style.display = remainingLiquid < 0 ? 'block' : 'none';
  if (remainingLiquid < 0) {
    const shortAmt = document.getElementById('shortfallAmt');
    if (shortAmt) shortAmt.textContent = fmtEUR(Math.abs(remainingLiquid));
  }
  document.getElementById('calc-results').style.display = 'block';
}

// ===== LOCAL TAX CALCULATOR (with IMT discount phasing) =====
function runLocalCalc() {
  const price = parseFloat(document.getElementById('localPrice').value)||0;
  const ptLoc = document.getElementById('localLocation').value;
  const ptPurpose = document.getElementById('localPurpose').value;

  const imt = calcIMT(price, ptLoc, ptPurpose);
  const imtNoDiscount = calcIMT(price, ptLoc, 'secondary');
  const discount = Math.max(0, imtNoDiscount - imt);
  const stampDuty = price * 0.008;
  const totalTaxes = imt + stampDuty;
  const effectiveRate = price > 0 ? (totalTaxes/price)*100 : 0;

  document.getElementById('resLocalIMT').textContent = fmtEUR(imt);
  const noDiscEl = document.getElementById('resLocalIMTNoDisc');
  if (noDiscEl) noDiscEl.textContent = fmtEUR(imtNoDiscount);
  const discRow = document.getElementById('discountRow');
  if (discRow) discRow.style.display = (ptPurpose === 'primary' && discount > 0) ? 'flex' : 'none';
  const discEl = document.getElementById('resLocalDiscount');
  if (discEl) discEl.textContent = '-' + fmtEUR(discount);
  document.getElementById('resLocalStamp').textContent = fmtEUR(stampDuty);
  document.getElementById('resLocalTotal').textContent = fmtEUR(totalTaxes);
  document.getElementById('resLocalRate').textContent = effectiveRate.toFixed(2) + '%';

  const phaseEl = document.getElementById('discountPhase');
  if (phaseEl) {
    if (ptPurpose === 'primary') {
      phaseEl.style.display = 'block';
      const savingsEl = document.getElementById('phaseSavings');
      if (savingsEl) savingsEl.textContent = fmtEUR(discount);
      const barEl = document.getElementById('phaseBar');
      const posEl = document.getElementById('phasePosition');
      let pct = 0;
      if (price <= 101917) pct = 0;
      else if (price >= 633453) pct = 100;
      else pct = ((price - 101917) / (633453 - 101917)) * 100;
      if (barEl) {
        barEl.style.width = pct + '%';
        barEl.style.background = pct > 80 ? '#c64f2f' : pct > 50 ? '#efd48f' : '#16a34a';
      }
      if (posEl) posEl.textContent = pct < 10 ? 'Full discount' : pct > 90 ? 'No discount' : 'Your property';
    } else {
      phaseEl.style.display = 'none';
    }
  }

  document.getElementById('local-results').style.display = 'block';
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initReveal();
  initNav();
  initMobileNav();
  initAccordion();
});
