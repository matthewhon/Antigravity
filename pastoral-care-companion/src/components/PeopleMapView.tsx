import React, { useEffect, useRef, useState } from 'react';
import { PcoPerson } from '../types';
import { firestore } from '../services/firestoreService';
import { Geolocation } from '@capacitor/geolocation';
import { Loader2, Navigation } from 'lucide-react';

interface PeopleMapViewProps {
  churchId: string;
  onSelectPerson: (person: PcoPerson) => void;
  people: PcoPerson[];
  loading: boolean;
}

export const PeopleMapView: React.FC<PeopleMapViewProps> = ({ churchId, onSelectPerson, people, loading }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);

  // Dynamically load leaflet CSS style tag
  const ensureLeafletCss = () => {
    const cssId = 'leaflet-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
  };

  // Map Initialization Effect
  useEffect(() => {
    if (loading || !mapContainerRef.current || people.length === 0) return;

    // Build list of people with geocoded addresses
    const geocodedPeople: { person: PcoPerson; lat: number; lng: number }[] = [];
    people.forEach(p => {
      const addr = p.addresses?.[0];
      if (addr?.lat != null && addr?.lng != null) {
        geocodedPeople.push({
          person: p,
          lat: addr.lat,
          lng: addr.lng
        });
      }
    });

    // Cleanup previous map instance if it exists
    if (mapInstance) {
      mapInstance.remove();
    }

    ensureLeafletCss();

    // Dynamically import Leaflet
    import('leaflet').then((LModule) => {
      const L = LModule.default || LModule;
      if (!mapContainerRef.current) return;

      // Initialize map, centering on first geocoded person or US center fallback
      const initialCenter: [number, number] = geocodedPeople.length > 0 
        ? [geocodedPeople[0].lat, geocodedPeople[0].lng] 
        : [39.8283, -98.5795];
      const initialZoom = geocodedPeople.length > 0 ? 11 : 4;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView(initialCenter, initialZoom);

      // Add TileLayer (using CartoDB Voyager which looks extremely clean on mobile)
      const isDark = document.documentElement.classList.contains('dark');
      const tilesUrl = isDark 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

      L.tileLayer(tilesUrl, {
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 3
      }).addTo(map);

      // Re-add Zoom control to top-right
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Plot geocoded markers
      const markerGroup = L.featureGroup();

      geocodedPeople.forEach(({ person, lat, lng }) => {
        const initials = person.name
          .split(' ')
          .slice(0, 2)
          .map(part => part[0])
          .join('')
          .toUpperCase();

        const pinHtml = person.avatar 
          ? `<div class="custom-map-pin"><img src="${person.avatar}" alt="${person.name}" /></div>`
          : `<div class="custom-map-pin"><span class="custom-map-pin-initials">${initials}</span></div>`;

        const icon = L.divIcon({
          html: pinHtml,
          className: 'custom-pin-icon',
          iconSize: [38, 38],
          iconAnchor: [19, 38],
          popupAnchor: [0, -38]
        });

        const popupContent = document.createElement('div');
        popupContent.className = "text-center p-1.5 font-sans leading-tight";
        popupContent.innerHTML = `
          <strong class="text-xs text-slate-800 font-black block">${person.name}</strong>
          <span class="text-[10px] text-slate-400 font-bold block mt-0.5">${person.membership || 'Contact'}</span>
          <div class="flex gap-1.5 justify-center mt-2.5">
            <button id="popup-btn-${person.id}" class="px-2.5 py-1 bg-indigo-600 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg shadow-sm">Profile</button>
            <button id="popup-dir-${person.id}" class="px-2.5 py-1 bg-emerald-600 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg shadow-sm">Directions</button>
          </div>
        `;

        // Listen for popup open to bind button click handler
        const marker = L.marker([lat, lng], { icon })
          .bindPopup(popupContent)
          .addTo(markerGroup);

        marker.on('popupopen', () => {
          const btn = document.getElementById(`popup-btn-${person.id}`);
          if (btn) {
            btn.onclick = () => {
              onSelectPerson(person);
            };
          }
          const dirBtn = document.getElementById(`popup-dir-${person.id}`);
          if (dirBtn) {
            dirBtn.onclick = () => {
              const url = `https://maps.apple.com/?daddr=${lat},${lng}`;
              window.open(url, '_system');
            };
          }
        });
      });

      markerGroup.addTo(map);

      // Zoom map to fit all points if we have them
      if (geocodedPeople.length > 0) {
        try {
          map.fitBounds(markerGroup.getBounds(), { padding: [40, 40] });
          if (map.getZoom() > 14) {
            map.setZoom(14);
          }
        } catch (e) {
          console.warn("fitBounds failed:", e);
        }
      }

      setMapInstance(map);
    }).catch(err => {
      console.error("Failed to load Leaflet module:", err);
    });

  }, [loading, people]);

  return (
    <div className="h-full w-full relative">
      {loading && (
        <div className="absolute inset-0 bg-slate-50 dark:bg-zinc-950/80 z-20 flex flex-col justify-center items-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
          <p className="text-xs font-bold uppercase tracking-wider">Drawing Member Map...</p>
        </div>
      )}

      {/* Map Element */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* GPS Location Pill */}
      {mapInstance && (
        <button
          onClick={async () => {
            try {
              // Request location permissions via Capacitor Geolocation
              const permission = await Geolocation.requestPermissions();
              if (permission.location !== 'granted') {
                alert("Location permissions are required to center the map.");
                return;
              }

              const pos = await Geolocation.getCurrentPosition();
              const center: [number, number] = [pos.coords.latitude, pos.coords.longitude];
              mapInstance.setView(center, 13);
              
              // Draw a blue marker for user's current GPS location
              import('leaflet').then((LModule) => {
                const L = LModule.default || LModule;
                L.circleMarker(center, {
                  radius: 8,
                  fillColor: '#3b82f6',
                  color: '#ffffff',
                  weight: 2,
                  fillOpacity: 0.9
                }).addTo(mapInstance).bindPopup("<strong class='text-xs font-bold'>Your Current Location</strong>").openPopup();
              });
            } catch (err) {
              alert("GPS location failed. Please verify location permissions.");
              console.error("Location error:", err);
            }
          }}
          className="absolute bottom-5 right-5 z-20 w-11 h-11 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-full flex items-center justify-center shadow-lg active:scale-95 text-slate-600 dark:text-zinc-400"
        >
          <Navigation size={18} />
        </button>
      )}
    </div>
  );
};
