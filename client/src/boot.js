import { applyMap } from '../../shared/config.js';
import { apiUrl } from './api.js';

(async () => {
  try {
    const mapUrl = import.meta.env.VITE_API_URL
      ? apiUrl('/map.json')
      : `${import.meta.env.BASE_URL}map.json`;
    const res = await fetch(mapUrl, { credentials: 'include' });
    if (res.ok) applyMap(await res.json());
  } catch { }

  await import('./main.js');
})();
