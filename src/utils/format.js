export function formatCurrency(amount, currencyCode) {
  const numeric = Number(amount);
  const safeAmount = Number.isFinite(numeric) ? numeric : 0;

  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: currencyCode || 'KRW',
    maximumFractionDigits: currencyCode === 'JPY' || currencyCode === 'KRW' ? 0 : 2,
  }).format(safeAmount);
}

export function formatMinutes(mins) {
  const numeric = Number(mins);
  const safeMinutes = Number.isFinite(numeric) ? Math.max(Math.round(numeric), 0) : 0;
  return `약 ${safeMinutes}분`;
}
