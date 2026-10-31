import { useEffect } from 'react';

const BRAND = 'TERRALYTICS';

/** Sets the browser tab title to "<title> · TERRALYTICS" while the page is mounted. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${BRAND}` : `${BRAND} — Disaster-Response GIS Platform`;
  }, [title]);
}
