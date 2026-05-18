function updateRateHint() {
  const euribor = parseFloat(document.getElementById('euriborRate').value) || 2.65;
  const type = document.getElementById('mortgageType').value;
  let spread = 1.0, label = 'Mixed';
  if (type === 'fixed2') { spread = 2.0; label = 'Fixed'; }
  if (type === 'fixed3') { spread = 3.0; label = 'Fixed'; }
  const total = (euribor + spread).toFixed(2);
  document.getElementById('appliedRate').value = total + '%';
  document.getElementById('rateHint').textContent = label + ' rate = ' + euribor + '% EURIBOR + ' + spread + '% spread = ' + total + '% total interest';
}
document.getElementById('euriborRate').addEventListener('input', updateRateHint);
document.getElementById('mortgageType').addEventListener('change', updateRateHint);

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

  // Monthly mortgage payment
  let monthlyPayment = 0;
  let totalInterest = 0;
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
  document.getElementById('resLiquid').textContent = fmtEUR(remainingLiquid);
  document.getElementById('resLiquid').className = remainingLiquid >= 0 ? 'text-green-600 font-bold' : 'text-coral font-bold';

  document.getElementById('warningOffice').style.display = homeOffice ? 'block' : 'none';
  document.getElementById('shortfallWarning').style.display = remainingLiquid < 0 ? 'block' : 'none';
  if (remainingLiquid < 0) document.getElementById('shortfallAmt').textContent = fmtEUR(Math.abs(remainingLiquid));
  document.getElementById('calc-results').style.display = 'block';
}