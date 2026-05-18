function runLocalCalc() {
  const price = parseFloat(document.getElementById('localPrice').value)||0;
  const ptLoc = document.getElementById('localLocation').value;
  const ptPurpose = document.getElementById('localPurpose').value;

  const imt = calcIMT(price, ptLoc, ptPurpose);
  // Calculate what IMT would be WITHOUT primary residence discount
  const imtNoDiscount = calcIMT(price, ptLoc, 'secondary');
  const discount = Math.max(0, imtNoDiscount - imt);
  const stampDuty = price * 0.008;
  const totalTaxes = imt + stampDuty;
  const effectiveRate = price > 0 ? (totalTaxes/price)*100 : 0;

  document.getElementById('resLocalIMT').textContent = fmtEUR(imt);
  document.getElementById('resLocalIMTNoDisc').textContent = fmtEUR(imtNoDiscount);
  document.getElementById('resLocalDiscount').textContent = '-' + fmtEUR(discount);
  document.getElementById('resLocalStamp').textContent = fmtEUR(stampDuty);
  document.getElementById('resLocalTotal').textContent = fmtEUR(totalTaxes);
  document.getElementById('resLocalRate').textContent = effectiveRate.toFixed(2) + '%';

  // Show discount info only for primary residences with actual discount
  if (ptPurpose === 'primary' && discount > 0) {
    document.getElementById('discountRow').style.display = 'flex';
    document.getElementById('discountPhase').style.display = 'block';
    document.getElementById('phaseSavings').textContent = fmtEUR(discount);

    // Visual bar: 0% at 101k, 100% at 633k
    let pct = 0;
    if (price <= 101917) pct = 0;
    else if (price >= 633453) pct = 100;
    else pct = ((price - 101917) / (633453 - 101917)) * 100;
    document.getElementById('phaseBar').style.width = pct + '%';
    document.getElementById('phaseBar').style.background = pct > 80 ? '#c64f2f' : pct > 50 ? '#efd48f' : '#16a34a';
  } else {
    document.getElementById('discountRow').style.display = 'none';
    document.getElementById('discountPhase').style.display = ptPurpose === 'primary' ? 'block' : 'none';
    document.getElementById('phaseSavings').textContent = '\u20ac0';
    document.getElementById('phaseBar').style.width = '100%';
    document.getElementById('phaseBar').style.background = '#c64f2f';
  }

  document.getElementById('local-results').style.display = 'block';
}