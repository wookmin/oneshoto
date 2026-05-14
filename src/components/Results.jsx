import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchRecommendations } from '../utils/api.js';
import { buildDirectionsUrl, loadGoogleMaps, searchNearbyPlaces, searchPlace } from '../utils/maps.js';
import { formatCurrency, formatMinutes } from '../utils/format.js';

const tabs = [
  { key: 'food', label: '맛집/카페', icon: '⌘' },
  { key: 'shopping', label: '쇼핑', icon: '⌂' },
  { key: 'attraction', label: '명소', icon: '✦' },
];

const navItems = [
  { label: 'AI 추천', icon: '✦', active: true },
  { label: '홈', icon: '⌂', active: false },
  { label: '통계 분석', icon: '▥', active: false },
];

const fallbackCategoryConfig = {
  food: {
    keyword: 'restaurant cafe',
    type: 'restaurant',
    label: '맛집/카페',
  },
  shopping: {
    keyword: 'shopping store market',
    type: 'store',
    label: '쇼핑',
  },
  attraction: {
    keyword: 'tourist attraction museum park',
    type: 'tourist_attraction',
    label: '명소',
  },
};

const STARVATION_BUDGET_THRESHOLD = 1000;
const MAX_FIT_BOUNDS_ZOOM = 15;
const FOCUSED_PLACE_ZOOM = 16;

function getDisplayPriceLevel(rawLevel) {
  if (typeof rawLevel === 'string' && rawLevel) {
    return rawLevel;
  }

  const numericLevel = Number(rawLevel);

  if (!Number.isFinite(numericLevel)) {
    return 'mid';
  }

  if (numericLevel >= 3) {
    return 'splurge';
  }

  if (numericLevel >= 2) {
    return 'mid';
  }

  return 'budget';
}

function inferFallbackPriceEstimate(place, category) {
  const numericLevel = Number(place?.price_level);

  if (!Number.isFinite(numericLevel)) {
    return null;
  }

  if (category === 'food') {
    if (numericLevel >= 3) {
      return 30000;
    }

    if (numericLevel >= 2) {
      return 18000;
    }

    return 10000;
  }

  if (category === 'shopping') {
    if (numericLevel >= 3) {
      return 120000;
    }

    if (numericLevel >= 2) {
      return 70000;
    }

    return 30000;
  }

  if (numericLevel >= 3) {
    return 25000;
  }

  if (numericLevel >= 2) {
    return 15000;
  }

  return 8000;
}

function renderEstimateText(label, amount, currencyCode) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return `${label} 가격 정보 없음`;
  }

  return `${label} ${formatCurrency(numericAmount, currencyCode)}`;
}

function createLowBudgetRecommendation(category, budget) {
  if (category !== 'food') {
    return null;
  }

  if (budget < STARVATION_BUDGET_THRESHOLD) {
    return {
      category,
      destination: '현재 위치 주변',
      food_budget_total: budget,
      currency: 'KRW',
      reasoning: '총 식비 예산이 1,000원 미만이라 현실적으로 식사를 해결하기 어려운 수준입니다.',
      places: [
        {
          name: '오늘은 굶으세요',
          type: '초저예산',
          price_estimate: null,
          price_currency: 'KRW',
          price_level: 'budget',
          rating_hint: '예산 부족',
          why: '현재 예산으로는 외식은 물론 편의점 식사도 빠듯합니다.',
          tip: '예산을 조금 더 확보한 뒤 다시 추천받는 편이 안전합니다.',
          transit: {
            method: '이동 비추천',
            duration_minutes: 0,
            cost: 0,
            cost_currency: 'KRW',
          },
        },
      ],
    };
  }

  return null;
}

function calculateDistanceKm(from, to) {
  if (!from || !to) {
    return null;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDiff = toRadians(to.lat - from.lat);
  const lngDiff = toRadians(to.lng - from.lng);
  const startLat = toRadians(from.lat);
  const endLat = toRadians(to.lat);

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function createMarkerContent(isSelected, isCurrent = false) {
  const markerElement = document.createElement('div');
  markerElement.className = `map-marker ${isSelected ? 'map-marker-selected' : ''} ${isCurrent ? 'map-marker-current' : ''}`.trim();
  return markerElement;
}

function Results({ formData, budgetCalc, locationInfo, onReset, onRetryLocation }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const currentMarkerRef = useRef(null);
  const markersRef = useRef([]);

  const [activeTab, setActiveTab] = useState('food');
  const [recommendationsByTab, setRecommendationsByTab] = useState({});
  const [selectedIndexByTab, setSelectedIndexByTab] = useState({});
  const [showInsightsByTab, setShowInsightsByTab] = useState({});
  const [mapPlacesByTab, setMapPlacesByTab] = useState({});
  const [loadingByTab, setLoadingByTab] = useState({});
  const [errorByTab, setErrorByTab] = useState({});
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const lowBudgetMode = budgetCalc.foodTotal < STARVATION_BUDGET_THRESHOLD ? 'starve' : 'normal';
  const availableTabs = lowBudgetMode === 'normal' ? tabs : tabs.filter((tab) => tab.key === 'food');

  const activeRecommendation = recommendationsByTab[activeTab];
  const activePlaces = activeRecommendation?.places ?? [];
  const activeSelectedIndex = selectedIndexByTab[activeTab] ?? 0;
  const showInsights = showInsightsByTab[activeTab] ?? false;
  const selectedPlace = activePlaces[activeSelectedIndex] ?? null;
  const selectedMapPlace = mapPlacesByTab[activeTab]?.[activeSelectedIndex] ?? null;

  const visibleMarkers = useMemo(() => {
    return activePlaces.map((place, index) => ({
      place,
      mapPlace: mapPlacesByTab[activeTab]?.[index] ?? null,
      index,
    }));
  }, [activePlaces, activeTab, mapPlacesByTab]);

  useEffect(() => {
    let isMounted = true;

    async function initializeMap() {
      if (!locationInfo?.coords) {
        return;
      }

      try {
        const google = await loadGoogleMaps();
        const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

        if (!mapContainerRef.current || !isMounted) {
          return;
        }

        const map = new google.maps.Map(mapContainerRef.current, {
          center: locationInfo.coords,
          zoom: 10,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
        });

        mapRef.current = map;
        currentMarkerRef.current = new AdvancedMarkerElement({
          map,
          position: locationInfo.coords,
          title: '현재 위치',
          content: createMarkerContent(true, true),
        });

        setMapReady(true);
      } catch (error) {
        setMapError(error instanceof Error ? error.message : '지도를 초기화하지 못했습니다.');
      }
    }

    initializeMap();

    return () => {
      isMounted = false;
    };
  }, [locationInfo]);

  useEffect(() => {
    if (!locationInfo?.coords || !mapReady) {
      return;
    }

    const current = loadingByTab.food;
    const existing = recommendationsByTab.food;
    const failed = errorByTab.food;
    if (!current && !existing && !failed) {
      void loadCategory('food');
    }
  }, [errorByTab.food, locationInfo, loadingByTab.food, mapReady, recommendationsByTab.food]);

  useEffect(() => {
    if (!locationInfo?.coords || !mapReady) {
      return;
    }

    const existing = recommendationsByTab[activeTab];
    const loading = loadingByTab[activeTab];
    const failed = errorByTab[activeTab];

    if (!existing && !loading && !failed) {
      void loadCategory(activeTab);
    }
  }, [activeTab, errorByTab, loadingByTab, locationInfo, mapReady, recommendationsByTab]);

  useEffect(() => {
    if (!mapReady || !locationInfo?.coords || !activeRecommendation || mapPlacesByTab[activeTab]) {
      return;
    }

    void resolveMapPlaces(activeTab, activeRecommendation.places);
  }, [activeRecommendation, activeTab, locationInfo, mapPlacesByTab, mapReady]);

  useEffect(() => {
    let isMounted = true;

    async function renderMarkers() {
      if (!mapRef.current || !window.google?.maps) {
        return;
      }

      const { AdvancedMarkerElement } = await window.google.maps.importLibrary('marker');

      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];

      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(locationInfo?.coords);

      visibleMarkers.forEach(({ mapPlace, place, index }) => {
        if (!mapPlace?.position || !isMounted) {
          return;
        }

        const marker = new AdvancedMarkerElement({
          map: mapRef.current,
          position: mapPlace.position,
          title: place.name,
          content: createMarkerContent(index === activeSelectedIndex),
        });

        marker.addListener('click', () => {
          setSelectedIndexByTab((current) => ({
            ...current,
            [activeTab]: index,
          }));
        });

        markersRef.current.push(marker);
        bounds.extend(mapPlace.position);
      });

      if (!bounds.isEmpty() && isMounted) {
        mapRef.current.fitBounds(bounds, 72);
        window.google.maps.event.addListenerOnce(mapRef.current, 'idle', () => {
          if (mapRef.current && mapRef.current.getZoom() > MAX_FIT_BOUNDS_ZOOM) {
            mapRef.current.setZoom(MAX_FIT_BOUNDS_ZOOM);
          }
        });
      }
    }

    void renderMarkers();

    return () => {
      isMounted = false;
    };
  }, [activeSelectedIndex, activeTab, locationInfo, visibleMarkers]);

  useEffect(() => {
    if (!mapRef.current || !selectedMapPlace?.position) {
      return;
    }

    mapRef.current.panTo(selectedMapPlace.position);

    if (mapRef.current.getZoom() < FOCUSED_PLACE_ZOOM) {
      mapRef.current.setZoom(FOCUSED_PLACE_ZOOM);
    }
  }, [selectedMapPlace]);

  async function loadCategory(category) {
    if (!locationInfo?.coords || !mapRef.current) {
      return;
    }

    setLoadingByTab((current) => ({ ...current, [category]: true }));
    setErrorByTab((current) => ({ ...current, [category]: null }));

    try {
      const lowBudgetRecommendation = createLowBudgetRecommendation(category, budgetCalc.foodTotal);

      if (lowBudgetRecommendation) {
        setRecommendationsByTab((current) => ({ ...current, [category]: lowBudgetRecommendation }));
        setSelectedIndexByTab((current) => ({ ...current, [category]: 0 }));
        setShowInsightsByTab((current) => ({ ...current, [category]: false }));
        setMapPlacesByTab((current) => ({ ...current, [category]: [null] }));
        setErrorByTab((current) => ({
          ...current,
          [category]: '예산이 1,000원 미만이라 식사 추천 대신 안내만 표시합니다.',
        }));
        return;
      }

      const result = await fetchRecommendations({
        category,
        days: Number(formData.days),
        currency: 'KRW',
        foodBudgetTotal: budgetCalc.foodTotal,
        coordinates: locationInfo.coords,
      });

      setRecommendationsByTab((current) => ({ ...current, [category]: result }));
      setSelectedIndexByTab((current) => ({ ...current, [category]: 0 }));
      setShowInsightsByTab((current) => ({ ...current, [category]: false }));
    } catch (error) {
      try {
        const { recommendation: fallbackResult, mapPlaces } = await buildFallbackRecommendations(category);
        setRecommendationsByTab((current) => ({ ...current, [category]: fallbackResult }));
        setMapPlacesByTab((current) => ({ ...current, [category]: mapPlaces }));
        setSelectedIndexByTab((current) => ({ ...current, [category]: 0 }));
        setShowInsightsByTab((current) => ({ ...current, [category]: false }));
        setErrorByTab((current) => ({
          ...current,
          [category]: 'Gemini 호출이 제한되어 Google 지도 기반 추천으로 전환했습니다.',
        }));
      } catch (fallbackError) {
      setErrorByTab((current) => ({
        ...current,
        [category]:
          fallbackError instanceof Error
            ? fallbackError.message
            : error instanceof Error
              ? error.message
              : '추천을 불러오지 못했습니다.',
      }));
      }
    } finally {
      setLoadingByTab((current) => ({ ...current, [category]: false }));
    }
  }

  async function buildFallbackRecommendations(category) {
    const config = fallbackCategoryConfig[category];
    const service = new window.google.maps.places.PlacesService(mapRef.current);
    const nearbyResults = await searchNearbyPlaces(service, {
      keyword: config.keyword,
      location: locationInfo.coords,
      type: config.type,
    });

    const topResults = nearbyResults.slice(0, 3);
    const places = topResults.map((place) => ({
      name: place.name || '추천 장소',
      type: config.label,
      price_estimate: inferFallbackPriceEstimate(place, category),
      price_currency: 'KRW',
      price_level: getDisplayPriceLevel(place.price_level),
      rating_hint: place.rating ? String(place.rating) : 'Google Maps 추천',
      why: `${config.label} 카테고리에서 현재 위치 기준 접근성이 좋은 장소예요.`,
      tip: '운영 시간과 방문 가능 여부는 Google Maps에서 한 번 더 확인해 주세요.',
      transit: {
        method: '도보',
        duration_minutes: 10,
        cost: 0,
        cost_currency: 'KRW',
      },
    }));

    const mapPlaces = topResults.map((place) => {
      const lat = place.geometry?.location?.lat?.();
      const lng = place.geometry?.location?.lng?.();

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      const position = { lat, lng };

      return {
        position,
        address: place.vicinity || place.formatted_address || '',
        rating: place.rating || null,
        openNow: place.opening_hours?.open_now ?? null,
        distanceKm: calculateDistanceKm(locationInfo.coords, position),
        directionsUrl: buildDirectionsUrl(place),
      };
    });

    return {
      recommendation: {
        category,
        destination: '현재 위치 주변',
        food_budget_total: budgetCalc.foodTotal,
        currency: 'KRW',
        reasoning: 'Gemini 응답이 지연되어 Google Maps 주변 검색 결과를 먼저 보여드리고 있어요.',
        places,
      },
      mapPlaces,
    };
  }

  async function resolveMapPlaces(category, places) {
    if (!mapRef.current || !locationInfo?.coords) {
      return;
    }

    try {
      const service = new window.google.maps.places.PlacesService(mapRef.current);
      const resolved = await Promise.all(
        places.map(async (place) => {
          try {
            const result = await searchPlace(service, place.name, locationInfo.coords);

            if (!result?.geometry?.location) {
              return null;
            }

            const position = {
              lat: result.geometry.location.lat(),
              lng: result.geometry.location.lng(),
            };

            return {
              position,
              address: result.formatted_address || '',
              rating: result.rating || null,
              openNow: result.opening_hours?.open_now ?? null,
              distanceKm: calculateDistanceKm(locationInfo.coords, position),
              directionsUrl: buildDirectionsUrl(result),
            };
          } catch {
            return null;
          }
        }),
      );

      setMapPlacesByTab((current) => ({
        ...current,
        [category]: resolved,
      }));
    } catch (error) {
      setMapError(error instanceof Error ? error.message : '지도에서 장소를 연결하지 못했습니다.');
    }
  }

  function handleTabClick(category) {
    setActiveTab(category);
  }

  function handleSelectPlace(index) {
    setSelectedIndexByTab((current) => ({
      ...current,
      [activeTab]: index,
    }));
    setShowInsightsByTab((current) => ({
      ...current,
      [activeTab]: false,
    }));
  }

  function handleToggleInsights() {
    setShowInsightsByTab((current) => ({
      ...current,
      [activeTab]: !showInsights,
    }));
  }

  function renderDetailMeta() {
    if (!selectedPlace) {
      return null;
    }

    const statusText =
      selectedMapPlace?.openNow === true
        ? '영업 중'
        : selectedMapPlace?.openNow === false
          ? '영업 종료'
          : selectedPlace.rating_hint || '추천 장소';

    return (
      <div className="detail-meta-row">
        <span>
          {selectedMapPlace?.distanceKm != null
            ? `${Math.round(selectedMapPlace.distanceKm * 1000)}m`
            : '근처'}
        </span>
        <span>{selectedPlace.transit?.duration_minutes ? `도보 ${selectedPlace.transit.duration_minutes}분` : '이동 정보 제공'}</span>
        <span>★ {(selectedMapPlace?.rating ?? selectedPlace.rating_hint) || '추천'}</span>
        <span className="detail-status">{statusText}</span>
      </div>
    );
  }

  function renderCategorySpecificInfo() {
    if (!selectedPlace) {
      return null;
    }

    if (activeTab === 'food') {
      return (
        <div className="detail-chip-row">
          <span className="detail-chip">{selectedPlace.type}</span>
          <span className="detail-chip">{renderEstimateText('예상', selectedPlace.price_estimate, selectedPlace.price_currency)}</span>
          <span className="detail-chip">{selectedPlace.price_level}</span>
        </div>
      );
    }

    if (activeTab === 'shopping') {
      return (
        <div className="detail-chip-row">
          <span className="detail-chip">{selectedPlace.type}</span>
          <span className="detail-chip">
            {renderEstimateText('예상 소비', selectedPlace.price_estimate, selectedPlace.price_currency)}
          </span>
        </div>
      );
    }

    return (
      <div className="detail-chip-row">
        <span className="detail-chip">{selectedPlace.type}</span>
        <span className="detail-chip">
          {renderEstimateText('예상 비용', selectedPlace.price_estimate, selectedPlace.price_currency)}
        </span>
      </div>
    );
  }

  const activeError = errorByTab[activeTab];
  const activeLoading = loadingByTab[activeTab];

  return (
    <section className="results-phone">
      <header className="map-header">
        <div className="avatar-badge">Y</div>
        <div className="brand-lockup">oneshot</div>
        <button className="icon-button" type="button" aria-label="알림">
          ◌
        </button>
      </header>

      <div className="map-stage">
        <div ref={mapContainerRef} className="map-surface" />

        <div className="tab-strip">
          {availableTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab-pill ${activeTab === tab.key ? 'tab-pill-active' : ''}`}
              onClick={() => handleTabClick(tab.key)}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="sheet">
          <div className="sheet-handle" />

          <div className="sheet-summary">
            <div>
              <p className="sheet-label">현재 위치</p>
              <strong>{locationInfo?.label || '위치 확인 중'}</strong>
            </div>
            <div>
              <p className="sheet-label">총 예산</p>
              <strong>{formatCurrency(formData.totalBudget, 'KRW')}</strong>
            </div>
          </div>

          {lowBudgetMode === 'starve' && (
            <div className="sheet-error">
              <p>예산이 1,000원 미만이라 식사 추천 대신 안내만 표시합니다.</p>
            </div>
          )}

          <div className="sheet-rail">
            {recommendationsByTab[activeTab]?.places?.map((place, index) => (
              <button
                key={`${place.name}-${index}`}
                type="button"
                className={`rail-chip ${activeSelectedIndex === index ? 'rail-chip-active' : ''}`}
                onClick={() => handleSelectPlace(index)}
              >
                {place.name}
              </button>
            ))}
          </div>

          {activeLoading && !recommendationsByTab[activeTab] ? (
            <div className="sheet-placeholder">
              <p>{tabs.find((tab) => tab.key === activeTab)?.label} 추천을 불러오는 중입니다...</p>
            </div>
          ) : activeError && !recommendationsByTab[activeTab] ? (
            <div className="sheet-error">
              <p>{activeError}</p>
              <button className="primary-button compact-button" type="button" onClick={() => loadCategory(activeTab)}>
                다시 시도
              </button>
              <button className="secondary-button compact-button" type="button" onClick={onRetryLocation}>
                위치 다시 읽기
              </button>
            </div>
          ) : selectedPlace ? (
            <>
              <div className="detail-header">
                <div className="detail-title-row">
                  <h2>{selectedPlace.name}</h2>
                  <button className="detail-toggle-button" type="button" onClick={handleToggleInsights}>
                    {showInsights ? '간단히' : 'AI 분석'}
                  </button>
                </div>
              </div>

              {renderDetailMeta()}
              {renderCategorySpecificInfo()}

              {showInsights && (
                <div className="detail-copy">
                  <p>{selectedPlace.why}</p>
                  <div className="detail-note">
                    <strong>Tip</strong>
                    <span>{selectedPlace.tip}</span>
                  </div>
                </div>
              )}

              <div className="detail-actions">
                <a
                  className="primary-button detail-action-button"
                  href={selectedMapPlace?.directionsUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                >
                  길찾기
                </a>
              </div>
            </>
          ) : (
            <div className="sheet-placeholder">
              <p>{mapError || '추천 장소를 준비하는 중입니다.'}</p>
              <button className="secondary-button compact-button" type="button" onClick={onReset}>
                입력으로 돌아가기
              </button>
            </div>
          )}
        </div>
      </div>

      <nav className="bottom-nav" aria-label="하단 네비게이션">
        {navItems.map((item) => (
          <div key={item.label} className={`bottom-nav-item ${item.active ? 'bottom-nav-item-active' : ''}`}>
            <span>{item.icon}</span>
            <small>{item.label}</small>
          </div>
        ))}
      </nav>
    </section>
  );
}

export default Results;
