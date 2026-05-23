/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Visual themes for Cinema Mode.
 * Each theme defines: background colour, CSS filter (applied to the canvas wrapper),
 * per-type node colours, link colour, and multipliers for link width / node size.
 */

export interface CinemaTheme {
  id: string;
  name: string;
  emoji: string;
  /** Three.js renderer clear colour */
  backgroundColor: string;
  /** CSS filter applied to the canvas wrapper div (not the UI chrome) */
  cssFilter: string;
  /** Per node-type hex/rgba colour */
  nodeColors: Record<string, string>;
  /** Link colour string used when NOT in tour-highlight mode */
  linkColor: string;
  /** Multiplier applied to base link width (1 = normal) */
  linkWidthMultiplier: number;
  /** ForceGraph3D nodeOpacity prop */
  nodeOpacity: number;
  /** Multiplier applied to nodeValFor() result — use < 1 to shrink nodes (outlines), > 1 to enlarge */
  nodeValMultiplier: number;
  /** Render a radial backdrop-filter blur overlay: edges blurred, centre sharp (bokeh DoF effect). */
  bokehOverlay?: boolean;
  /** Render a repeating dot-screen overlay in screen blend mode to simulate halftone printing. */
  dotOverlay?: boolean;
}

const DEFAULT_NODE_COLORS: Record<string, string> = {
  song: '#6366f1', keyword: '#374151',
  album: '#8b5cf6', artist: '#f59e0b',
  theme: '#10b981', tag: '#06b6d4', emotion: '#ec4899',
};

export const CINEMA_THEMES: CinemaTheme[] = [
  {
    id: 'default',   name: 'Default',    emoji: '🎨',
    backgroundColor: '#030712', cssFilter: '',
    nodeColors: DEFAULT_NODE_COLORS,
    linkColor: 'rgba(100,116,139,0.2)', linkWidthMultiplier: 1, nodeOpacity: 0.92, nodeValMultiplier: 1,
  },
  {
    id: 'sepia',     name: 'Sepia',      emoji: '📜',
    backgroundColor: '#130d05', cssFilter: 'sepia(0.85) contrast(1.1)',
    nodeColors: DEFAULT_NODE_COLORS,
    linkColor: 'rgba(180,140,80,0.28)', linkWidthMultiplier: 1, nodeOpacity: 0.9, nodeValMultiplier: 1,
  },
  {
    id: 'negative',  name: 'Negative',   emoji: '📷',
    backgroundColor: '#fcfcfc', cssFilter: 'invert(1)',
    nodeColors: DEFAULT_NODE_COLORS,
    linkColor: 'rgba(0,0,0,0.3)', linkWidthMultiplier: 1, nodeOpacity: 0.92, nodeValMultiplier: 1,
  },
  {
    id: 'sketch',    name: 'Sketch',     emoji: '✏️',
    backgroundColor: '#f5f2ec', cssFilter: 'grayscale(1) contrast(2.2) brightness(0.65)',
    nodeColors: { song: '#2a2a2a', keyword: '#888888', album: '#111111', artist: '#0a0a0a', theme: '#444444', tag: '#555555', emotion: '#333333' },
    linkColor: 'rgba(20,20,20,0.65)', linkWidthMultiplier: 2, nodeOpacity: 0.95, nodeValMultiplier: 1,
  },
  {
    id: 'solarized', name: 'Solarized',  emoji: '☀️',
    backgroundColor: '#002b36', cssFilter: '',
    nodeColors: { song: '#268bd2', album: '#2aa198', artist: '#b58900', theme: '#859900', tag: '#6c71c4', keyword: '#586e75', emotion: '#d33682' },
    linkColor: 'rgba(88,110,117,0.35)', linkWidthMultiplier: 1, nodeOpacity: 0.93, nodeValMultiplier: 1,
  },
  {
    id: 'posterized',name: 'Posterized', emoji: '🖼️',
    backgroundColor: '#050505', cssFilter: 'contrast(350%) saturate(160%) brightness(80%)',
    nodeColors: DEFAULT_NODE_COLORS,
    linkColor: 'rgba(255,255,255,0.35)', linkWidthMultiplier: 1.2, nodeOpacity: 0.95, nodeValMultiplier: 1,
  },
  {
    id: 'comic',     name: 'Comic',      emoji: '💥',
    backgroundColor: '#fffce0', cssFilter: 'saturate(220%) contrast(135%)',
    nodeColors: { song: '#ff2255', album: '#ff6600', artist: '#ffcc00', theme: '#00cc44', tag: '#0099ff', keyword: '#999999', emotion: '#cc00ff' },
    linkColor: 'rgba(0,0,0,0.5)', linkWidthMultiplier: 2.8, nodeOpacity: 1, nodeValMultiplier: 1.2,
  },
  {
    id: 'depth',     name: 'Depth Map',  emoji: '🌊',
    backgroundColor: '#000000', cssFilter: 'grayscale(1) contrast(1.2)',
    nodeColors: { song: '#aaaaaa', album: '#dddddd', artist: '#ffffff', theme: '#888888', tag: '#999999', keyword: '#444444', emotion: '#cccccc' },
    linkColor: 'rgba(180,180,180,0.18)', linkWidthMultiplier: 1, nodeOpacity: 0.88, nodeValMultiplier: 1,
  },
  {
    id: 'neon',      name: 'Neon',       emoji: '💡',
    backgroundColor: '#000011', cssFilter: 'brightness(1.05) saturate(140%)',
    nodeColors: { song: '#00ffff', album: '#ff00ff', artist: '#ffff00', theme: '#00ff44', tag: '#ff8800', keyword: '#334466', emotion: '#ff0088' },
    linkColor: 'rgba(0,200,255,0.22)', linkWidthMultiplier: 1.6, nodeOpacity: 0.95, nodeValMultiplier: 1,
  },
  {
    id: 'outlines',  name: 'Outlines',   emoji: '⭕',
    backgroundColor: '#060608', cssFilter: '',
    nodeColors: { song: '#1e1e2e', album: '#1e1e2e', artist: '#1e1e2e', theme: '#1e1e2e', tag: '#1e1e2e', keyword: '#1e1e2e', emotion: '#1e1e2e' },
    linkColor: 'rgba(200,210,255,0.65)', linkWidthMultiplier: 3, nodeOpacity: 0.25, nodeValMultiplier: 0.3,
  },
  {
    id: 'bokeh',     name: 'Bokeh',      emoji: '📸',
    backgroundColor: '#000814', cssFilter: 'brightness(1.08) saturate(1.15)',
    nodeColors: { song: '#818cf8', keyword: '#4b5563', album: '#a78bfa', artist: '#fbbf24', theme: '#34d399', tag: '#22d3ee', emotion: '#f472b6' },
    linkColor: 'rgba(120,130,200,0.22)', linkWidthMultiplier: 1, nodeOpacity: 0.96, nodeValMultiplier: 1,
    bokehOverlay: true,
  },
  {
    id: 'halftone',  name: 'Halftone',   emoji: '🔘',
    backgroundColor: '#02000f', cssFilter: 'contrast(1.2) saturate(1.4)',
    nodeColors: { song: '#6366f1', keyword: '#374151', album: '#8b5cf6', artist: '#f59e0b', theme: '#10b981', tag: '#06b6d4', emotion: '#ec4899' },
    linkColor: 'rgba(100,116,139,0.28)', linkWidthMultiplier: 1, nodeOpacity: 0.93, nodeValMultiplier: 1,
    dotOverlay: true,
  },
];

export const DEFAULT_THEME_ID = 'default';

export function getTheme(id: string): CinemaTheme {
  return CINEMA_THEMES.find(t => t.id === id) ?? CINEMA_THEMES[0]!;
}
