import { useState } from 'react';
import InputForm from './components/InputForm.jsx';
import Loading from './components/Loading.jsx';
import Results from './components/Results.jsx';
import { useBudget } from './hooks/useBudget.js';
import { formatCoordinateLabel, getCurrentPosition, loadGoogleMaps, reverseGeocode } from './utils/maps.js';

const initialFormData = {
  days: 3,
  currency: 'KRW',
  totalBudget: '',
};

function App() {
  const [screen, setScreen] = useState('input');
  const [formData, setFormData] = useState(initialFormData);
  const [apiError, setApiError] = useState(null);
  const [locationInfo, setLocationInfo] = useState(null);

  const budgetCalc = useBudget(formData);
  const shouldUseGeocoding = import.meta.env.VITE_GOOGLE_MAPS_ENABLE_GEOCODING === 'true';

  const resolveLocation = async () => {
    const google = await loadGoogleMaps();
    const coords = await getCurrentPosition();

    if (shouldUseGeocoding) {
      try {
        const resolvedLocation = await reverseGeocode(google, coords);
        setLocationInfo(resolvedLocation);
        return;
      } catch {
        // Fall through to a generic location label when geocoding is unavailable.
      }
    }

    setLocationInfo({
      label: '현재 위치 주변',
      detailLabel: formatCoordinateLabel(coords),
      coords,
    });
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    if (apiError) {
      setApiError(null);
    }
  };

  const openResults = async () => {
    setApiError(null);
    setScreen('loading');

    try {
      await resolveLocation();
      setScreen('results');
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '위치를 불러오지 못했습니다.');
      setScreen('input');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!budgetCalc.isValid) {
      setApiError('식비 예산이 없습니다. 예산을 다시 확인해주세요.');
      return;
    }

    await openResults();
  };

  const handleReset = () => {
    setApiError(null);
    setLocationInfo(null);
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
              locationInfo={locationInfo}
              onReset={handleReset}
              onRetryLocation={openResults}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
