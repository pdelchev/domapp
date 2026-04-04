'use client';

/**
 * LocationPicker — OpenStreetMap-based location picker for the deal analyzer.
 *
 * Click on map or search address → reverse geocode → detect nearby POIs.
 * Returns: country, city, area, lat, lng, nearby amenities (metro, school, hospital, park).
 *
 * Uses: Leaflet + react-leaflet for map, Nominatim for geocoding, Overpass for POIs.
 * All APIs are free and require no API key.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon (Leaflet + webpack/next.js issue)
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface LocationResult {
  country: string;
  city: string;
  area: string;
  lat: number;
  lng: number;
  nearMetro: boolean;
  nearSchool: boolean;
  nearHospital: boolean;
  nearPark: boolean;
  displayName: string;
}

// City center coordinates for quick jumps
const CITY_CENTERS: Record<string, [number, number]> = {
  'Sofia': [42.6977, 23.3219],
  'Plovdiv': [42.1354, 24.7453],
  'Varna': [43.2141, 27.9147],
  'Burgas': [42.5048, 27.4626],
  'Dubai': [25.2048, 55.2708],
  'Abu Dhabi': [24.4539, 54.3773],
  'London': [51.5074, -0.1278],
  'Manchester': [53.4808, -2.2426],
  'Birmingham': [52.4862, -1.8904],
  'Leeds': [53.8008, -1.5491],
  'Edinburgh': [55.9533, -3.1883],
  'Bristol': [51.4545, -2.5879],
};

interface Props {
  locale: string;
  onSelect: (result: LocationResult) => void;
  initialCity?: string;
}

// Reverse geocode via Nominatim
async function reverseGeocode(lat: number, lng: number): Promise<{ country: string; city: string; area: string; displayName: string }> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`,
    { headers: { 'User-Agent': 'DomApp/1.0' } }
  );
  const data = await res.json();
  const addr = data.address || {};

  const country = addr.country || '';
  const city = addr.city || addr.town || addr.village || addr.municipality || '';
  const area = addr.suburb || addr.neighbourhood || addr.quarter || addr.district || '';
  const displayName = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  return { country, city, area, displayName };
}

// Query Overpass API for nearby POIs within radius (meters)
async function queryNearbyPOIs(lat: number, lng: number, radius = 800): Promise<{
  nearMetro: boolean; nearSchool: boolean; nearHospital: boolean; nearPark: boolean;
}> {
  const query = `
    [out:json][timeout:10];
    (
      node["railway"="station"](around:${radius},${lat},${lng});
      node["railway"="subway_entrance"](around:${radius},${lat},${lng});
      node["station"="subway"](around:${radius},${lat},${lng});
      node["amenity"="school"](around:${radius * 1.5},${lat},${lng});
      way["amenity"="school"](around:${radius * 1.5},${lat},${lng});
      node["amenity"="hospital"](around:${radius * 2},${lat},${lng});
      way["amenity"="hospital"](around:${radius * 2},${lat},${lng});
      node["leisure"="park"](around:${radius},${lat},${lng});
      way["leisure"="park"](around:${radius},${lat},${lng});
    );
    out tags;
  `;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = await res.json();
    const elements = data.elements || [];

    let nearMetro = false, nearSchool = false, nearHospital = false, nearPark = false;
    for (const el of elements) {
      const tags = el.tags || {};
      if (tags.railway === 'station' || tags.railway === 'subway_entrance' || tags.station === 'subway') nearMetro = true;
      if (tags.amenity === 'school') nearSchool = true;
      if (tags.amenity === 'hospital') nearHospital = true;
      if (tags.leisure === 'park') nearPark = true;
    }
    return { nearMetro, nearSchool, nearHospital, nearPark };
  } catch {
    return { nearMetro: false, nearSchool: false, nearHospital: false, nearPark: false };
  }
}

// Search address via Nominatim
async function searchAddress(query: string): Promise<{ lat: number; lng: number; displayName: string }[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=en`,
    { headers: { 'User-Agent': 'DomApp/1.0' } }
  );
  const data = await res.json();
  return data.map((r: { lat: string; lon: string; display_name: string }) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    displayName: r.display_name,
  }));
}

// Map click handler component
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Component to fly to coordinates
function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 14, { duration: 1 });
    }
  }, [center, map]);
  return null;
}

export default function LocationPicker({ locale, onSelect, initialCity }: Props) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ lat: number; lng: number; displayName: string }[]>([]);
  const [locationInfo, setLocationInfo] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set initial center based on city
  const initialCenter: [number, number] = initialCity && CITY_CENTERS[initialCity]
    ? CITY_CENTERS[initialCity]
    : [42.6977, 23.3219]; // Default: Sofia

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setPosition([lat, lng]);
    setLoading(true);
    setLocationInfo(locale === 'en' ? 'Detecting location...' : 'Откриване на локация...');
    setSearchResults([]);

    try {
      const [geo, pois] = await Promise.all([
        reverseGeocode(lat, lng),
        queryNearbyPOIs(lat, lng),
      ]);

      setLocationInfo(geo.displayName);
      onSelect({
        country: geo.country,
        city: geo.city,
        area: geo.area,
        lat,
        lng,
        nearMetro: pois.nearMetro,
        nearSchool: pois.nearSchool,
        nearHospital: pois.nearHospital,
        nearPark: pois.nearPark,
        displayName: geo.displayName,
      });
    } catch {
      setLocationInfo(locale === 'en' ? 'Could not detect location' : 'Неуспешно откриване на локация');
    } finally {
      setLoading(false);
    }
  }, [locale, onSelect]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchAddress(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 500);
  }, []);

  const handleSelectResult = useCallback((r: { lat: number; lng: number }) => {
    setSearchResults([]);
    setSearchQuery('');
    setFlyTarget([r.lat, r.lng]);
    handleMapClick(r.lat, r.lng);
  }, [handleMapClick]);

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={locale === 'en' ? 'Search address or place...' : 'Търсене на адрес или място...'}
          className="w-full h-10 px-3 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <svg className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute z-[1000] mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {searchResults.map((r, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 border-b border-gray-100 last:border-0"
                onClick={() => handleSelectResult(r)}
              >
                {r.displayName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick city buttons */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(CITY_CENTERS).map(([city, coords]) => (
          <button
            key={city}
            onClick={() => {
              setFlyTarget(coords);
              setPosition(null);
            }}
            className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 rounded-md transition-colors"
          >
            {city}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 300 }}>
        <MapContainer
          center={initialCenter}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} />
          <FlyTo center={flyTarget} />
          {position && <Marker position={position} icon={defaultIcon} />}
        </MapContainer>
      </div>

      {/* Location info */}
      {(locationInfo || loading) && (
        <div className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${loading ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-700'}`}>
          {loading ? (
            <svg className="w-4 h-4 animate-spin mt-0.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <span>📍</span>
          )}
          <span className="leading-snug">{locationInfo}</span>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        {locale === 'en'
          ? 'Click on the map to auto-detect location, nearby metro, schools, hospitals & parks'
          : 'Кликнете на картата за автоматично откриване на локация, метро, училища, болници и паркове'}
      </p>
    </div>
  );
}
