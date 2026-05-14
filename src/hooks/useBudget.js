function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function useBudget(formData) {
  const totalBudget = toNumber(formData.totalBudget);
  const foodTotal = totalBudget;
  const isValid = foodTotal > 0;

  return {
    foodTotal,
    isValid,
  };
}
