import { useState } from 'react';
import InputForm from './components/InputForm.jsx';
import Loading from './components/Loading.jsx';
import Results from './components/Results.jsx';
import { useBudget } from './hooks/useBudget.js';
import { fetchRecommendations } from './utils/api.js';

const initialFormData = {
  city: '',
  days: 3,
  currency: 'KRW',
  totalBudget: '',
  shoppingSpend: '',
  transportSpend: '',
  style: 'balanced traveler',
};

function App() {
  const [screen, setScreen] = useState('input');
  const [formData, setFormData] = useState(initialFormData);
  const [apiResult, setApiResult] = useState(null);
  const [apiError, setApiError] = useState(null);

  const budgetCalc = useBudget(formData);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!budgetCalc.isValid) {
      setApiError('식비 예산이 없습니다. 지출을 다시 확인해주세요.');
      return;
    }

    setApiError(null);
    setScreen('loading');

    try {
      const result = await fetchRecommendations({
        city: formData.city.trim(),
        days: Number(formData.days),
        currency: formData.currency,
        dailyFood: budgetCalc.dailyFood,
        style: formData.style,
      });

      setApiResult(result);
      setScreen('results');
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '추천을 불러오지 못했습니다.');
      setApiResult(null);
      setScreen('results');
    }
  };

  const handleReset = () => {
    setApiError(null);
    setApiResult(null);
    setScreen('input');
  };

  return (
    <div className="app-shell">
      <div className="app-backdrop" />
      <main className="app-main">
        {screen === 'input' && (
          <div key="input" className="screen-enter">
            <InputForm
              formData={formData}
              budgetCalc={budgetCalc}
              apiError={apiError}
              onChange={handleFieldChange}
              onSubmit={handleSubmit}
            />
          </div>
        )}

        {screen === 'loading' && (
          <div key="loading" className="screen-enter">
            <Loading />
          </div>
        )}

        {screen === 'results' && (
          <div key="results" className="screen-enter">
            <Results
              formData={formData}
              budgetCalc={budgetCalc}
              apiResult={apiResult}
              apiError={apiError}
              onReset={handleReset}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
