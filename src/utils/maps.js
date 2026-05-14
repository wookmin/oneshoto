let googleMapsPromise;

function createMapsScriptUrl(apiKey) {
  const params = new URLSearchParams({
    key: apiKey,
    libraries: 'places,marker',
    loading: 'async',
  });

  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

export function loadGoogleMaps() {
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return Promise.reject(
      new Error('Google Maps API 키가 없습니다. .env 파일에 VITE_GOOGLE_MAPS_API_KEY를 추가해주세요.'),
    );
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-maps-loader="true"]');

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google), { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Google Maps 스크립트를 불러오지 못했습니다.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = createMapsScriptUrl(apiKey);
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = 'true';
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('Google Maps 스크립트를 불러오지 못했습니다.'));
    document.head.appendChild(script);
  }).catch((error) => {
    googleMapsPromise = undefined;
    throw error;
  });

  return googleMapsPromise;
}

export function getCurrentPosition() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('이 브라우저에서는 현재 위치를 지원하지 않습니다.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('위치 권한이 거부되었습니다. 브라우저 권한을 확인해주세요.'));
          return;
        }

        reject(new Error('현재 위치를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  });
}

function pickAddressComponent(components, type) {
  return components.find((component) => component.types?.includes(type))?.long_name || '';
}

export function formatCoordinateLabel(coords) {
  if (!coords) {
    return '현재 위치';
  }

  return `위도 ${coords.lat.toFixed(4)}, 경도 ${coords.lng.toFixed(4)}`;
}

export async function reverseGeocode(google, location) {
  const geocoder = new google.maps.Geocoder();
  const response = await geocoder.geocode({ location });
  const result = response.results?.[0];

  if (!result) {
    throw new Error('현재 위치의 도시 정보를 확인하지 못했습니다.');
  }

  const components = result.address_components || [];
  const district =
    pickAddressComponent(components, 'sublocality_level_1') ||
    pickAddressComponent(components, 'sublocality') ||
    pickAddressComponent(components, 'neighborhood');
  const city =
    pickAddressComponent(components, 'locality') ||
    pickAddressComponent(components, 'administrative_area_level_2') ||
    pickAddressComponent(components, 'administrative_area_level_1');
  const region =
    pickAddressComponent(components, 'administrative_area_level_1') ||
    pickAddressComponent(components, 'administrative_area_level_2');
  const country = pickAddressComponent(components, 'country');
  const label = [city, district].filter(Boolean).join(' ') || [region, city].filter(Boolean).join(' ');

  return {
    city,
    district,
    region,
    country,
    label: label || result.formatted_address || formatCoordinateLabel(location),
    formattedAddress: result.formatted_address || '',
    coords: location,
  };
}

export function searchPlace(service, query, location) {
  return new Promise((resolve, reject) => {
    service.textSearch(
      {
        query,
        location,
        radius: 15000,
      },
      (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.length) {
          resolve(results[0]);
          return;
        }

        if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve(null);
          return;
        }

        reject(new Error('식당 위치를 Google Maps에서 찾지 못했습니다.'));
      },
    );
  });
}

export function searchNearbyPlaces(service, { keyword, location, type }) {
  return new Promise((resolve, reject) => {
    service.nearbySearch(
      {
        location,
        radius: 3000,
        keyword,
        type,
      },
      (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.length) {
          resolve(results);
          return;
        }

        if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
          return;
        }

        reject(new Error('주변 장소를 Google Maps에서 찾지 못했습니다.'));
      },
    );
  });
}

export function buildDirectionsUrl(place) {
  if (!place?.place_id) {
    return null;
  }

  return `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(place.place_id)}`;
}
