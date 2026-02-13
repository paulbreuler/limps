import { addIcon } from 'obsidian';

export const LIMPS_HUB_ICON = 'limps-hub';
export const LIMPS_GRAPH_ICON = 'limps-graph';

const HUB_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"></circle>
  <circle cx="5" cy="6" r="2"></circle>
  <circle cx="19" cy="6" r="2"></circle>
  <circle cx="5" cy="18" r="2"></circle>
  <circle cx="19" cy="18" r="2"></circle>
  <path d="M10.3 10.3L6.4 7.4"></path>
  <path d="M13.7 10.3L17.6 7.4"></path>
  <path d="M10.3 13.7L6.4 16.6"></path>
  <path d="M13.7 13.7L17.6 16.6"></path>
</svg>
`;

const GRAPH_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="5" cy="8" r="1.8"></circle>
  <circle cx="12" cy="4.5" r="1.8"></circle>
  <circle cx="19" cy="8" r="1.8"></circle>
  <circle cx="8.5" cy="17" r="1.8"></circle>
  <circle cx="15.5" cy="17" r="1.8"></circle>
  <path d="M6.7 7.2L10.3 5.3"></path>
  <path d="M13.7 5.3L17.3 7.2"></path>
  <path d="M6.3 9.5L7.8 15.2"></path>
  <path d="M17.7 9.5L16.2 15.2"></path>
  <path d="M10.1 16.9H13.9"></path>
</svg>
`;

export function registerLimpsIcons(): void {
  addIcon(LIMPS_HUB_ICON, HUB_SVG);
  addIcon(LIMPS_GRAPH_ICON, GRAPH_SVG);
}
