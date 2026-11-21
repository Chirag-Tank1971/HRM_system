import { useEffect, useState } from 'react';
import { hrApi } from '../services/hrApi';

// One request per page load: every screen that prints the company name shares it.
let cached: string | null = null;
let pending: Promise<string> | null = null;

function loadCompanyName(): Promise<string> {
  if (cached !== null) return Promise.resolve(cached);
  if (!pending) {
    pending = hrApi
      .getCompany()
      .then((c) => (cached = c?.name || ''))
      .catch(() => {
        pending = null; // try again next time
        return '';
      });
  }
  return pending;
}

/** The signed-in user's company name ('' until it loads, or if it can't be read). */
export function useCompanyName(): string {
  const [name, setName] = useState(cached || '');
  useEffect(() => {
    let alive = true;
    loadCompanyName().then((n) => alive && setName(n));
    return () => { alive = false; };
  }, []);
  return name;
}
