import { formatCurrency, formatMinutes } from '../utils/format.js';

const levelLabels = {
  budget: '가성비',
  mid: '적당함',
  splurge: '특별식',
};

function Results({ formData, budgetCalc, apiResult, apiError, onReset }) {
  return (
    <section className="panel results-panel">
      <div className="panel-header">
        <span className="eyebrow">추천 결과</span>
        <h1>{formData.city || '여행지'} 식비 플랜</h1>
        <p>예산과 여행 스타일을 기준으로 식당과 이동 정보를 함께 정리했어요.</p>
      </div>

      <div className="summary-grid">
        <article className="summary-card">
          <span>총 예산</span>
          <strong>{formatCurrency(formData.totalBudget, formData.currency)}</strong>
        </article>
        <article className="summary-card">
          <span>쇼핑</span>
          <strong>{formatCurrency(formData.shoppingSpend, formData.currency)}</strong>
        </article>
        <article className="summary-card">
          <span>교통</span>
          <strong>{formatCurrency(formData.transportSpend, formData.currency)}</strong>
        </article>
        <article className="summary-card summary-card-highlight">
          <span>식비</span>
          <strong>{formatCurrency(budgetCalc.foodTotal, formData.currency)}</strong>
        </article>
      </div>

      {apiError ? (
        <div className="callout error-callout">
          <p>{apiError}</p>
          <button className="secondary-button" type="button" onClick={onReset}>
            다시 입력하기
          </button>
        </div>
      ) : (
        <>
          <div className="callout">
            <strong>AI 추천 요약</strong>
            <p>{apiResult?.reasoning}</p>
          </div>

          <div className="results-grid">
            {(apiResult?.restaurants ?? []).map((restaurant) => (
              <article key={`${restaurant.name}-${restaurant.cuisine}`} className="restaurant-card">
                <div className="card-top">
                  <div>
                    <h2>{restaurant.name}</h2>
                    <div className="badge-row">
                      <span className="badge badge-cuisine">{restaurant.cuisine}</span>
                      <span className={`badge badge-level badge-${restaurant.price_level}`}>
                        {levelLabels[restaurant.price_level] ?? restaurant.price_level}
                      </span>
                    </div>
                  </div>
                  <div className="price-block">
                    <span>1인 예상</span>
                    <strong>
                      {formatCurrency(restaurant.price_per_person, restaurant.price_currency)}
                    </strong>
                  </div>
                </div>

                <p className="muted-italic">{restaurant.why}</p>

                <div className="tip-box">
                  <span>💡</span>
                  <p>{restaurant.tip}</p>
                </div>

                <div className="transit-box">
                  <strong>이동 정보</strong>
                  <p>{restaurant.transit?.method}</p>
                  <div className="transit-meta">
                    <span>{formatMinutes(restaurant.transit?.duration_minutes)}</span>
                    <span>
                      {formatCurrency(
                        restaurant.transit?.cost,
                        restaurant.transit?.cost_currency || formData.currency,
                      )}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <button className="primary-button reset-button" type="button" onClick={onReset}>
        다시 계획하기
      </button>
    </section>
  );
}

export default Results;
