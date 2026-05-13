/**
 * Minimal theme tokens that mirror the cursor/canvas useHostTheme() shape.
 * Pulls live CSS variables defined in styles.css so the same component code
 * works in light and dark mode.
 */

function cssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface HostTheme {
  kind: string;
  bg: { editor: string; chrome: string; elevated: string };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    quaternary: string;
    link: string;
    onAccent: string;
  };
  stroke: { primary: string; secondary: string; tertiary: string };
  fill: { primary: string; secondary: string; tertiary: string; quaternary: string };
  accent: { primary: string; control: string; controlHover: string };
  diff: {
    insertedLine: string;
    removedLine: string;
    stripAdded: string;
    stripRemoved: string;
  };
}

export function useHostTheme(): HostTheme {
  const isLight =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: light)').matches;
  return {
    kind: isLight ? 'light' : 'dark',
    bg: {
      editor: cssVar('--bg') || (isLight ? '#fcfcfc' : '#181818'),
      chrome: cssVar('--bg-chrome') || (isLight ? '#f8f8f8' : '#141414'),
      elevated: cssVar('--bg-elevated') || (isLight ? '#fcfcfc' : '#1d1d1d'),
    },
    text: {
      primary: cssVar('--text') || (isLight ? 'rgba(20,20,20,0.94)' : 'rgba(228,228,228,0.92)'),
      secondary:
        cssVar('--text-secondary') ||
        (isLight ? 'rgba(20,20,20,0.74)' : 'rgba(228,228,228,0.55)'),
      tertiary:
        cssVar('--text-tertiary') ||
        (isLight ? 'rgba(20,20,20,0.54)' : 'rgba(228,228,228,0.37)'),
      quaternary:
        cssVar('--text-quaternary') ||
        (isLight ? 'rgba(20,20,20,0.36)' : 'rgba(228,228,228,0.26)'),
      link: cssVar('--accent') || (isLight ? '#3685bf' : '#87c3ff'),
      onAccent: cssVar('--accent-text') || (isLight ? '#fcfcfc' : '#181c22'),
    },
    stroke: {
      primary: cssVar('--stroke') || (isLight ? 'rgba(20,20,20,0.2)' : 'rgba(228,228,228,0.2)'),
      secondary:
        cssVar('--stroke-subtle') ||
        (isLight ? 'rgba(20,20,20,0.12)' : 'rgba(228,228,228,0.12)'),
      tertiary:
        cssVar('--stroke-subtle') ||
        (isLight ? 'rgba(20,20,20,0.08)' : 'rgba(228,228,228,0.08)'),
    },
    fill: {
      primary: 'rgba(228,228,228,0.19)',
      secondary: 'rgba(228,228,228,0.12)',
      tertiary: cssVar('--fill-tertiary') || 'rgba(228,228,228,0.07)',
      quaternary: 'rgba(228,228,228,0.04)',
    },
    accent: {
      primary: cssVar('--accent') || (isLight ? '#3685bf' : '#599ce7'),
      control: cssVar('--accent') || (isLight ? '#3685bf' : '#599ce7'),
      controlHover: isLight ? '#2e76ab' : '#6aabe9',
    },
    diff: {
      insertedLine: 'rgba(63,162,102,0.2)',
      removedLine: 'rgba(184,0,73,0.2)',
      stripAdded: 'rgba(63,162,102,0.56)',
      stripRemoved: 'rgba(252,107,131,0.56)',
    },
  };
}
