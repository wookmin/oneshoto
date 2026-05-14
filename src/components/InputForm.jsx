import { formatCurrency } from '../utils/format.js';

const citySuggestions = ['Tokyo', 'Osaka', 'Paris', 'Bangkok', 'New York', 'London', 'Barcelona', 'Singapore'];
const currencies = ['KRW', 'USD', 'JPY', 'EUR', 'THB', 'SGD'];
const styles = [
  { value: 'budget backpacker', label: '알뜰 배낭여행자' },
  { value: 'balanced traveler', label: '균형형 여행자' },
  { value: 'comfort seeker', label: '편안함 추구형' },
  { value: 'luxury traveler', label: '럭셔리 여행자' },
];

function InputForm({ formData, budgetCalc, apiError, onChange, onSubmit }) {
  const hasInlineError = !budgetCalc.isValid && Number(formData.totalBudget || 0) > 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="eyebrow">Travel Budget Advisor</span>
        <h1>여행 식비 추천 플래너</h1>
        <p>
          총 예산에서 쇼핑과 교통 지출을 먼저 제외하고, 남은 식비 예산에 맞는 식당 5곳을
          추천해드려요.
        </p>
      </div>

      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field">
          <span>여행 도시</span>
          <input
            name="city"
            type="text"
            list="city-suggestions"
            placeholder="예: Tokyo"
            value={formData.city}
            onChange={onChange}
            required
          />
          <datalist id="city-suggestions">
            {citySuggestions.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
        </label>

        <div className="field-row">
          <label className="field">
            <span>여행 기간</span>
            <input
              name="days"
              type="number"
              min="1"
              step="1"
              value={formData.days}
              onChange={onChange}
              required
            />
          </label>

          <label className="field">
            <span>통화</span>
            <select name="currency" value={formData.currency} onChange={onChange}>
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>총 여행 예산</span>
          <input
            name="totalBudget"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={formData.totalBudget}
            onChange={onChange}
            required
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>쇼핑 지출</span>
            <input
              name="shoppingSpend"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={formData.shoppingSpend}
              onChange={onChange}
            />
          </label>

          <label className="field">
            <span>교통 지출</span>
            <input
              name="transportSpend"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={formData.transportSpend}
              onChange={onChange}
            />
          </label>
        </div>

        <label className="field">
          <span>여행 스타일</span>
          <select name="style" value={formData.style} onChange={onChange}>
            {styles.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </label>

        <div className="budget-preview">
          <strong>남은 식비 예산</strong>
          <p>{formatCurrency(budgetCalc.foodTotal, formData.currency)}</p>
          <span>일 {formatCurrency(budgetCalc.dailyFood, formData.currency)}</span>
        </div>

        {hasInlineError && (
          <p className="error-text">식비 예산이 없습니다. 지출을 다시 확인해주세요.</p>
        )}

        {apiError && <p className="error-text">{apiError}</p>}

        <button className="primary-button" type="submit" disabled={!budgetCalc.isValid}>
          추천받기
        </button>
      </form>
    </section>
  );
}

export default InputForm;
