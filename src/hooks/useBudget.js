function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function useBudget(formData) {
  const days = Math.max(toNumber(formData.days), 1);
  const totalBudget = toNumber(formData.totalBudget);
  const shoppingSpend = toNumber(formData.shoppingSpend);
  const transportSpend = toNumber(formData.transportSpend);
  const foodTotal = totalBudget - shoppingSpend - transportSpend;
  const dailyFood = foodTotal / days;
  const isValid = foodTotal > 0;

  return {
    foodTotal,
    dailyFood,
    isValid,
  };
}
