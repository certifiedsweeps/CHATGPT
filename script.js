const form = document.getElementById('calculator-form');
const kpisEl = document.getElementById('kpis');
const tableBody = document.querySelector('#yearlyTable tbody');
const exportCsvBtn = document.getElementById('exportCsv');
const canvas = document.getElementById('growthChart');
const ctx = canvas.getContext('2d');

let latestYearlyRows = [];

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const COMPOUNDING_PER_YEAR = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

function addInterval(date, frequency) {
  const d = new Date(date);
  if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else if (frequency === 'biweekly') d.setDate(d.getDate() + 14);
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (frequency === 'annually') d.setFullYear(d.getFullYear() + 1);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toRate(valuePct) {
  return (Number(valuePct) || 0) / 100;
}

function parseInputs() {
  return {
    initial: Number(document.getElementById('initial').value) || 0,
    years: Math.max(1, Number(document.getElementById('years').value) || 1),
    apr: toRate(document.getElementById('apr').value),
    compounding: document.getElementById('compounding').value,
    feeRate: toRate(document.getElementById('feeRate').value),
    taxRate: toRate(document.getElementById('taxRate').value),
    inflation: toRate(document.getElementById('inflation').value),
    contribAmount: Number(document.getElementById('contribAmount').value) || 0,
    contribFreq: document.getElementById('contribFreq').value,
    contribTiming: document.getElementById('contribTiming').value,
    contribDelay: Number(document.getElementById('contribDelay').value) || 0,
    contribGrowth: toRate(document.getElementById('contribGrowth').value),
    withdrawAmount: Number(document.getElementById('withdrawAmount').value) || 0,
    withdrawFreq: document.getElementById('withdrawFreq').value,
    withdrawTiming: document.getElementById('withdrawTiming').value,
    withdrawDelay: Number(document.getElementById('withdrawDelay').value) || 0,
    withdrawGrowth: toRate(document.getElementById('withdrawGrowth').value),
  };
}

function calculateScenario(settings) {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + settings.years);

  let balance = settings.initial;
  let totalContribution = 0;
  let totalWithdrawal = 0;
  let totalInterestGross = 0;
  let totalFees = 0;
  let totalTaxes = 0;

  const yearly = [];
  const points = [{ date: new Date(startDate), balance }];

  let currentYearIndex = 1;
  let yearStartBalance = balance;
  let yearContrib = 0;
  let yearWithdraw = 0;
  let yearInterest = 0;
  let yearFees = 0;
  let yearTaxes = 0;

  const nextContribDate = settings.contribFreq === 'none'
    ? null
    : addInterval(new Date(startDate.getFullYear(), startDate.getMonth() + settings.contribDelay, startDate.getDate()), settings.contribFreq);

  const nextWithdrawDate = settings.withdrawFreq === 'none'
    ? null
    : addInterval(new Date(startDate.getFullYear(), startDate.getMonth() + settings.withdrawDelay, startDate.getDate()), settings.withdrawFreq);

  const nextCompoundDate = new Date(startDate);
  const nextFeeDate = addInterval(new Date(startDate), 'monthly');
  const nextTaxDate = addInterval(new Date(startDate), 'annually');

  let accruedTaxableInterest = 0;

  function contributionForDate(date) {
    if (!nextContribDate || !sameDay(date, nextContribDate)) return 0;
    const elapsedYears = (date - startDate) / (365.25 * 24 * 3600 * 1000);
    return settings.contribAmount * Math.pow(1 + settings.contribGrowth, elapsedYears);
  }

  function withdrawalForDate(date) {
    if (!nextWithdrawDate || !sameDay(date, nextWithdrawDate)) return 0;
    const elapsedYears = (date - startDate) / (365.25 * 24 * 3600 * 1000);
    return settings.withdrawAmount * Math.pow(1 + settings.withdrawGrowth, elapsedYears);
  }

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    if (settings.contribTiming === 'start') {
      const deposit = contributionForDate(d);
      if (deposit > 0) {
        balance += deposit;
        totalContribution += deposit;
        yearContrib += deposit;
        if (nextContribDate) {
          const updated = addInterval(nextContribDate, settings.contribFreq);
          nextContribDate.setTime(updated.getTime());
        }
      }
    }

    if (settings.withdrawTiming === 'start') {
      const withdrawal = Math.min(withdrawalForDate(d), balance);
      if (withdrawal > 0) {
        balance -= withdrawal;
        totalWithdrawal += withdrawal;
        yearWithdraw += withdrawal;
        if (nextWithdrawDate) {
          const updated = addInterval(nextWithdrawDate, settings.withdrawFreq);
          nextWithdrawDate.setTime(updated.getTime());
        }
      }
    }

    let interestToday = 0;
    if (settings.compounding === 'continuous') {
      const dailyRate = Math.exp(settings.apr / 365) - 1;
      interestToday = balance * dailyRate;
      balance += interestToday;
      accruedTaxableInterest += interestToday;
    } else if (settings.compounding === 'daily') {
      const dailyRate = settings.apr / 365;
      interestToday = balance * dailyRate;
      balance += interestToday;
      accruedTaxableInterest += interestToday;
    } else if (sameDay(d, nextCompoundDate)) {
      const periods = COMPOUNDING_PER_YEAR[settings.compounding];
      const periodRate = settings.apr / periods;
      interestToday = balance * periodRate;
      balance += interestToday;
      accruedTaxableInterest += interestToday;
      const updated = addInterval(nextCompoundDate, settings.compounding);
      nextCompoundDate.setTime(updated.getTime());
    }

    totalInterestGross += interestToday;
    yearInterest += interestToday;

    if (sameDay(d, nextFeeDate) && settings.feeRate > 0) {
      const monthlyFee = (settings.feeRate / 12) * balance;
      balance -= monthlyFee;
      totalFees += monthlyFee;
      yearFees += monthlyFee;
      const updated = addInterval(nextFeeDate, 'monthly');
      nextFeeDate.setTime(updated.getTime());
    }

    if (sameDay(d, nextTaxDate) && settings.taxRate > 0 && accruedTaxableInterest > 0) {
      const taxes = Math.min(balance, accruedTaxableInterest * settings.taxRate);
      balance -= taxes;
      totalTaxes += taxes;
      yearTaxes += taxes;
      accruedTaxableInterest = 0;
      const updated = addInterval(nextTaxDate, 'annually');
      nextTaxDate.setTime(updated.getTime());
    }

    if (settings.contribTiming === 'end') {
      const deposit = contributionForDate(d);
      if (deposit > 0) {
        balance += deposit;
        totalContribution += deposit;
        yearContrib += deposit;
        if (nextContribDate) {
          const updated = addInterval(nextContribDate, settings.contribFreq);
          nextContribDate.setTime(updated.getTime());
        }
      }
    }

    if (settings.withdrawTiming === 'end') {
      const withdrawal = Math.min(withdrawalForDate(d), balance);
      if (withdrawal > 0) {
        balance -= withdrawal;
        totalWithdrawal += withdrawal;
        yearWithdraw += withdrawal;
        if (nextWithdrawDate) {
          const updated = addInterval(nextWithdrawDate, settings.withdrawFreq);
          nextWithdrawDate.setTime(updated.getTime());
        }
      }
    }

    points.push({ date: new Date(d), balance });

    const elapsedYears = (d - startDate) / (365.25 * 24 * 3600 * 1000);
    if (elapsedYears >= currentYearIndex || sameDay(d, endDate)) {
      const inflationFactor = Math.pow(1 + settings.inflation, currentYearIndex);
      yearly.push({
        year: currentYearIndex,
        startingBalance: yearStartBalance,
        contributions: yearContrib,
        withdrawals: yearWithdraw,
        interestGross: yearInterest,
        fees: yearFees,
        taxes: yearTaxes,
        endingBalance: balance,
        realEnding: balance / inflationFactor,
      });
      currentYearIndex += 1;
      yearStartBalance = balance;
      yearContrib = 0;
      yearWithdraw = 0;
      yearInterest = 0;
      yearFees = 0;
      yearTaxes = 0;
    }
  }

  const inflationAdjustedEnd = balance / Math.pow(1 + settings.inflation, settings.years);
  return {
    endingBalance: balance,
    inflationAdjustedEnd,
    totalContribution,
    totalWithdrawal,
    totalInterestGross,
    totalFees,
    totalTaxes,
    netProfit: balance + totalWithdrawal - settings.initial - totalContribution,
    yearly,
    points,
  };
}

function renderKpis(result) {
  const items = [
    ['Ending Balance', money.format(result.endingBalance)],
    ['Inflation-Adjusted Ending Value', money.format(result.inflationAdjustedEnd)],
    ['Total Contributions', money.format(result.totalContribution)],
    ['Total Withdrawals', money.format(result.totalWithdrawal)],
    ['Gross Interest Earned', money.format(result.totalInterestGross)],
    ['Total Fees Paid', money.format(result.totalFees)],
    ['Total Taxes Paid', money.format(result.totalTaxes)],
    ['Net Profit (including withdrawals)', money.format(result.netProfit)],
  ];

  kpisEl.innerHTML = items.map(([title, value]) => `
    <article class="kpi">
      <h4>${title}</h4>
      <p>${value}</p>
    </article>
  `).join('');
}

function renderTable(rows) {
  tableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${money.format(row.startingBalance)}</td>
      <td>${money.format(row.contributions)}</td>
      <td>${money.format(row.withdrawals)}</td>
      <td>${money.format(row.interestGross)}</td>
      <td>${money.format(row.fees)}</td>
      <td>${money.format(row.taxes)}</td>
      <td>${money.format(row.endingBalance)}</td>
      <td>${money.format(row.realEnding)}</td>
    </tr>
  `).join('');
}

function renderChart(points) {
  const width = canvas.width;
  const height = canvas.height;
  const pad = 40;
  ctx.clearRect(0, 0, width, height);

  const balances = points.map((p) => p.balance);
  const min = Math.min(...balances, 0);
  const max = Math.max(...balances, 1);

  const x = (i) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (val) => height - pad - ((val - min) / (max - min || 1)) * (height - pad * 2);

  ctx.strokeStyle = '#8391ad';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.stroke();

  ctx.strokeStyle = '#2b6ef2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(x(i), y(p.balance));
    else ctx.lineTo(x(i), y(p.balance));
  });
  ctx.stroke();

  ctx.fillStyle = '#9fb1d4';
  ctx.font = '12px sans-serif';
  ctx.fillText(money.format(max), 4, pad + 3);
  ctx.fillText(money.format(min), 4, height - pad + 3);
  ctx.fillText('Start', pad, height - 12);
  ctx.fillText('End', width - pad - 25, height - 12);
}

function toCsv(rows) {
  const header = ['Year', 'Starting Balance', 'Contributions', 'Withdrawals', 'Interest Gross', 'Fees', 'Taxes', 'Ending Balance', 'Real Ending Value'];
  const lines = rows.map((r) => [
    r.year,
    r.startingBalance.toFixed(2),
    r.contributions.toFixed(2),
    r.withdrawals.toFixed(2),
    r.interestGross.toFixed(2),
    r.fees.toFixed(2),
    r.taxes.toFixed(2),
    r.endingBalance.toFixed(2),
    r.realEnding.toFixed(2),
  ].join(','));

  return [header.join(','), ...lines].join('\n');
}

function runCalculation() {
  const settings = parseInputs();
  const result = calculateScenario(settings);
  latestYearlyRows = result.yearly;
  renderKpis(result);
  renderTable(result.yearly);
  renderChart(result.points);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  runCalculation();
});

exportCsvBtn.addEventListener('click', () => {
  if (!latestYearlyRows.length) return;
  const csv = toCsv(latestYearlyRows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'investment-schedule.csv';
  link.click();
  URL.revokeObjectURL(url);
});

runCalculation();
