import { useState, useEffect } from 'react';

/**
 * Custom hook for responsive media queries
 * @param query - The media query string (e.g., '(max-width: 640px)')
 * @returns boolean indicating if the media query matches
 */
const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState<boolean>(() => {
    // Initialize with current match state, but handle SSR case
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    // Handle SSR case where window is not available
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia(query);

    // Update state to current match
    setMatches(mediaQuery.matches);

    // Create event handler
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add listener
    mediaQuery.addEventListener('change', handler);

    // Cleanup
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
};

/**
 * Predefined breakpoint hooks for common screen sizes
 */
export const useIsMobile = () => useMediaQuery('(max-width: 640px)'); // sm breakpoint
export const useIsTablet = () => useMediaQuery('(max-width: 768px)'); // md breakpoint
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)'); // lg breakpoint
