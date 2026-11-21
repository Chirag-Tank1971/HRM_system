import { useEffect, useState } from 'react';
import { hrApi } from '../services/hrApi';

// One request per page load: every screen that prints the company name shares it.
let cached: string | null = null;
let pending: Promise<string> | null = null;

/** Forget the cached name. Called on sign-in, sign-out and role switch so a different company never sees it. */
export function resetCompanyName(): void {
  cached = null;
  pending = null;
  generation++;
}
let generation = 0;

function loadCompanyName(): Promise<string> {
  if (cached !== null) return Promise.resolve(cached);
  if (!pending) {
    const gen = generation;
    pending = hrApi
      .getCompany()
      .then((c) => {
        const name = c?.name || '';
        if (gen === generation) cached = name; // a reply from before a sign-out is never kept
        return name;
      })
      .catch(() => {
        if (gen === generation) pending = null; // try again next time
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
