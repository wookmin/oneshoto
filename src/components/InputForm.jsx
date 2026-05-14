import { formatCurrency } from '../utils/format.js';

function InputForm({ formData, budgetCalc, apiError, onChange, onSubmit }) {
  const hasInlineError = !budgetCalc.isValid && Number(formData.totalBudget || 0) > 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="eyebrow">Travel Budget Advisor</span>
        <h1>현재 위치 기반 식비 추천</h1>
        <p>현재 위치를 자동으로 읽고, 입력한 총 식비 예산 안에서 가장 합리적인 식당 3곳을 추천해드려요.</p>
      </div>

      <form className="form-grid" onSubmit={onSubmit}>
        <div className="location-pill">
          <strong>현재 위치 자동 사용</strong>
          <span>추천받기를 누르면 브라우저 위치 권한을 요청합니다.</span>
        </div>

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
          <span>총 식비 예산</span>
          <input
            name="totalBudget"
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={formData.totalBudget}
            onChange={onChange}
            required
          />
        </label>

        <div className="budget-preview">
          <strong>{formData.days}일 동안 사용할 총 식비 예산</strong>
          <p>{formatCurrency(budgetCalc.foodTotal, 'KRW')}</p>
        </div>

        {hasInlineError && <p className="error-text">식비 예산이 없습니다. 예산을 다시 확인해주세요.</p>}
        {apiError && <p className="error-text">{apiError}</p>}

        <button className="primary-button" type="submit" disabled={!budgetCalc.isValid}>
          현재 위치로 추천받기
        </button>
      </form>
    </section>
  );
}

export default InputForm;
