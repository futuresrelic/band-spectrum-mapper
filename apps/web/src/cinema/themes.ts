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
  {
    id: 'dali',       name: 'Dalí Dream',  emoji: '🕰️',
    backgroundColor: '#0c0502',
    cssFilter: 'sepia(0.55) hue-rotate(-18deg) saturate(1.8) contrast(1.1)',
    nodeColors: {
      song: '#d97706', keyword: '#92400e', album: '#b45309', artist: '#fbbf24',
      theme: '#7c2d12', tag: '#ea580c', emotion: '#dc2626',
    },
    linkColor: 'rgba(180,83,9,0.28)', linkWidthMultiplier: 1.2, nodeOpacity: 0.94, nodeValMultiplier: 1.1,
  },
  {
    id: 'escher',     name: 'Escher',      emoji: '♾️',
    backgroundColor: '#e8e8e0',
    cssFilter: 'grayscale(1) contrast(2.8) brightness(0.62)',
    nodeColors: {
      song: '#0a0a0a', keyword: '#606060', album: '#1a1a1a', artist: '#000000',
      theme: '#383838', tag: '#505050', emotion: '#101010',
    },
    linkColor: 'rgba(0,0,0,0.55)', linkWidthMultiplier: 3, nodeOpacity: 0.99, nodeValMultiplier: 0.8,
  },
  {
    id: 'aurora',     name: 'Aurora',     emoji: '🌌',
    backgroundColor: '#010408',
    cssFilter: 'brightness(1.1) saturate(1.4)',
    nodeColors: {
      song: '#00ff87', keyword: '#0d2a20', album: '#7c3aed',
      artist: '#06b6d4', theme: '#10b981', tag: '#d946ef', emotion: '#f472b6',
    },
    linkColor: 'rgba(0,200,130,0.14)', linkWidthMultiplier: 1.2, nodeOpacity: 0.94, nodeValMultiplier: 1,
  },
  {
    id: 'cyberpunk',  name: 'Cyberpunk',  emoji: '🔮',
    backgroundColor: '#0a0015',
    cssFilter: 'contrast(1.15) saturate(1.6)',
    nodeColors: {
      song: '#ff2d78', keyword: '#1a0025', album: '#9600ff',
      artist: '#00f5ff', theme: '#ff6b2b', tag: '#00ff94', emotion: '#ffee00',
    },
    linkColor: 'rgba(255,45,120,0.2)', linkWidthMultiplier: 1.5, nodeOpacity: 0.95, nodeValMultiplier: 1,
  },
  {
    id: 'matrix',     name: 'Matrix',     emoji: '💻',
    backgroundColor: '#000800',
    cssFilter: 'saturate(0.65)',
    nodeColors: {
      song: '#00ff41', keyword: '#003300', album: '#00cc33',
      artist: '#aaffaa', theme: '#00ff88', tag: '#00aa22', emotion: '#33ff44',
    },
    linkColor: 'rgba(0,255,65,0.18)', linkWidthMultiplier: 1, nodeOpacity: 0.9, nodeValMultiplier: 1,
  },
  {
    id: 'blueprint',  name: 'Blueprint',  emoji: '📐',
    backgroundColor: '#061228',
    cssFilter: '',
    nodeColors: {
      song: '#c8d8ff', keyword: '#2a4880', album: '#a0b8ff',
      artist: '#ffffff', theme: '#90c0ff', tag: '#70a0ff', emotion: '#ffb090',
    },
    linkColor: 'rgba(100,150,255,0.35)', linkWidthMultiplier: 1.5, nodeOpacity: 0.9, nodeValMultiplier: 1,
  },
  {
    id: 'lush',       name: 'Lush',       emoji: '💎',
    backgroundColor: '#060410',
    cssFilter: 'saturate(1.3) brightness(1.05)',
    nodeColors: {
      song: '#dc2626', keyword: '#1c1030', album: '#7c3aed',
      artist: '#ca8a04', theme: '#2563eb', tag: '#0d9488', emotion: '#db2777',
    },
    linkColor: 'rgba(180,100,200,0.15)', linkWidthMultiplier: 1, nodeOpacity: 0.95, nodeValMultiplier: 1,
  },
  {
    id: 'moonrise',   name: 'Moonrise',   emoji: '🌙',
    backgroundColor: '#020508',
    cssFilter: 'saturate(0.55) brightness(0.9)',
    nodeColors: {
      song: '#6b8cba', keyword: '#1a2030', album: '#4a6888',
      artist: '#c5d8f0', theme: '#4a7098', tag: '#7b9cc0', emotion: '#9ab0cc',
    },
    linkColor: 'rgba(100,140,180,0.2)', linkWidthMultiplier: 1, nodeOpacity: 0.85, nodeValMultiplier: 1,
  },
  {
    id: 'infrared',   name: 'Infrared',   emoji: '🔥',
    backgroundColor: '#0a0000',
    cssFilter: 'saturate(1.5) contrast(1.1)',
    nodeColors: {
      song: '#ff4400', keyword: '#330000', album: '#ff8800',
      artist: '#ffee00', theme: '#cc2200', tag: '#ff6600', emotion: '#ff0055',
    },
    linkColor: 'rgba(255,80,0,0.2)', linkWidthMultiplier: 1.3, nodeOpacity: 0.94, nodeValMultiplier: 1,
  },
  {
    id: 'deep-ocean', name: 'Deep Ocean', emoji: '🌊',
    backgroundColor: '#010814',
    cssFilter: 'saturate(1.4) brightness(1.05)',
    nodeColors: {
      song: '#00b4d8', keyword: '#023e5c', album: '#0077b6',
      artist: '#90e0ef', theme: '#00f5d4', tag: '#48cae4', emotion: '#7b2d8b',
    },
    linkColor: 'rgba(0,150,200,0.18)', linkWidthMultiplier: 1.2, nodeOpacity: 0.93, nodeValMultiplier: 1,
  },
  {
    id: 'obsidian',   name: 'Obsidian',   emoji: '🌋',
    backgroundColor: '#050304',
    cssFilter: 'contrast(1.25) saturate(1.3)',
    nodeColors: {
      song: '#e44c2c', keyword: '#1a1010', album: '#b03010',
      artist: '#ff8c42', theme: '#6b1a0a', tag: '#d4502a', emotion: '#ff4040',
    },
    linkColor: 'rgba(200,60,20,0.18)', linkWidthMultiplier: 1, nodeOpacity: 0.92, nodeValMultiplier: 1,
  },
  {
    id: 'golden-hour',name: 'Golden Hour',emoji: '🌅',
    backgroundColor: '#080400',
    cssFilter: 'saturate(1.6) brightness(1.05)',
    nodeColors: {
      song: '#f4a261', keyword: '#3d1a00', album: '#e76f51',
      artist: '#ffd166', theme: '#e9c46a', tag: '#f77f00', emotion: '#c94040',
    },
    linkColor: 'rgba(244,162,97,0.2)', linkWidthMultiplier: 1.2, nodeOpacity: 0.95, nodeValMultiplier: 1,
  },
  {
    id: 'void',       name: 'Void',       emoji: '⬛',
    backgroundColor: '#000000',
    cssFilter: 'contrast(2) brightness(0.85)',
    nodeColors: {
      song: '#e8e8e8', keyword: '#383838', album: '#d0d0d0',
      artist: '#ffffff', theme: '#b8b8b8', tag: '#c8c8c8', emotion: '#a0a0ff',
    },
    linkColor: 'rgba(220,220,220,0.25)', linkWidthMultiplier: 1.5, nodeOpacity: 0.9, nodeValMultiplier: 1,
  },
  {
    id: 'acid',       name: 'Acid',       emoji: '🧪',
    backgroundColor: '#04000a',
    cssFilter: 'saturate(2) contrast(1.2) brightness(1.1)',
    nodeColors: {
      song: '#b5ff00', keyword: '#1a0030', album: '#00ffcc',
      artist: '#ff00ff', theme: '#7700ff', tag: '#00ff55', emotion: '#ff3300',
    },
    linkColor: 'rgba(150,255,0,0.2)', linkWidthMultiplier: 1.4, nodeOpacity: 0.96, nodeValMultiplier: 1,
  },
  {
    id: 'rose-gold',  name: 'Rose Gold',  emoji: '💅',
    backgroundColor: '#080406',
    cssFilter: 'saturate(1.4) brightness(1.05)',
    nodeColors: {
      song: '#e8968c', keyword: '#2a1218', album: '#c06080',
      artist: '#f8c8b8', theme: '#b04868', tag: '#d87890', emotion: '#a83858',
    },
    linkColor: 'rgba(200,100,120,0.2)', linkWidthMultiplier: 1.2, nodeOpacity: 0.94, nodeValMultiplier: 1,
  },
  {
    id: 'arctic',     name: 'Arctic',     emoji: '🧊',
    backgroundColor: '#02050c',
    cssFilter: 'saturate(0.8) brightness(1.1) hue-rotate(200deg)',
    nodeColors: {
      song: '#a8d8f0', keyword: '#102030', album: '#70b8e8',
      artist: '#e8f4ff', theme: '#5898c8', tag: '#88c0d8', emotion: '#b090e8',
    },
    linkColor: 'rgba(140,200,240,0.2)', linkWidthMultiplier: 1, nodeOpacity: 0.88, nodeValMultiplier: 1,
  },
  {
    id: 'jungle',     name: 'Jungle',     emoji: '🌿',
    backgroundColor: '#010801',
    cssFilter: 'saturate(1.5) brightness(1.0)',
    nodeColors: {
      song: '#55cc44', keyword: '#0a1a05', album: '#33aa22',
      artist: '#aaffaa', theme: '#22881a', tag: '#44bb33', emotion: '#ff6b44',
    },
    linkColor: 'rgba(60,180,40,0.18)', linkWidthMultiplier: 1, nodeOpacity: 0.92, nodeValMultiplier: 1,
  },
  {
    id: 'vintage-noir',name:'Vintage Noir',emoji:'🎞️',
    backgroundColor: '#06050a',
    cssFilter: 'sepia(0.45) contrast(1.3) saturate(0.7)',
    nodeColors: {
      song: '#c8a870', keyword: '#2a1a10', album: '#a88850',
      artist: '#e8d090', theme: '#806840', tag: '#b09060', emotion: '#a06050',
    },
    linkColor: 'rgba(180,140,80,0.22)', linkWidthMultiplier: 1.2, nodeOpacity: 0.9, nodeValMultiplier: 1,
  },

  // ── New themes ────────────────────────────────────────────────────────────
  {
    id: 'solarized-light', name: 'Sol. Light',  emoji: '🌤',
    backgroundColor: '#fdf6e3',
    cssFilter: '',
    nodeColors: { song: '#268bd2', album: '#2aa198', artist: '#cb4b16', theme: '#859900', tag: '#6c71c4', keyword: '#657b83', emotion: '#d33682' },
    linkColor: 'rgba(7,54,66,0.25)', linkWidthMultiplier: 1, nodeOpacity: 0.95, nodeValMultiplier: 1,
  },
  {
    id: 'dracula',         name: 'Dracula',      emoji: '🧛',
    backgroundColor: '#282a36',
    cssFilter: '',
    nodeColors: { song: '#8be9fd', album: '#bd93f9', artist: '#ff79c6', theme: '#50fa7b', tag: '#f1fa8c', keyword: '#44475a', emotion: '#ff5555' },
    linkColor: 'rgba(189,147,249,0.22)', linkWidthMultiplier: 1.2, nodeOpacity: 0.94, nodeValMultiplier: 1,
  },
  {
    id: 'tokyo-night',     name: 'Tokyo Night',  emoji: '🗼',
    backgroundColor: '#1a1b26',
    cssFilter: '',
    nodeColors: { song: '#7aa2f7', album: '#bb9af7', artist: '#e0af68', theme: '#9ece6a', tag: '#2ac3de', keyword: '#565f89', emotion: '#f7768e' },
    linkColor: 'rgba(122,162,247,0.18)', linkWidthMultiplier: 1, nodeOpacity: 0.93, nodeValMultiplier: 1,
  },
  {
    id: 'catppuccin',      name: 'Catppuccin',   emoji: '🐱',
    backgroundColor: '#1e1e2e',
    cssFilter: '',
    nodeColors: { song: '#89b4fa', album: '#cba6f7', artist: '#fab387', theme: '#a6e3a1', tag: '#89dceb', keyword: '#585b70', emotion: '#f38ba8' },
    linkColor: 'rgba(137,180,250,0.18)', linkWidthMultiplier: 1, nodeOpacity: 0.93, nodeValMultiplier: 1,
  },
  {
    id: 'gruvbox',         name: 'Gruvbox',      emoji: '🪵',
    backgroundColor: '#1d2021',
    cssFilter: 'saturate(0.9)',
    nodeColors: { song: '#83a598', album: '#d3869b', artist: '#fabd2f', theme: '#b8bb26', tag: '#8ec07c', keyword: '#504945', emotion: '#fb4934' },
    linkColor: 'rgba(168,153,132,0.22)', linkWidthMultiplier: 1.1, nodeOpacity: 0.92, nodeValMultiplier: 1,
  },
  {
    id: 'nord-ice',        name: 'Nord Ice',     emoji: '❄️',
    backgroundColor: '#2e3440',
    cssFilter: '',
    nodeColors: { song: '#88c0d0', album: '#81a1c1', artist: '#eceff4', theme: '#a3be8c', tag: '#5e81ac', keyword: '#3b4252', emotion: '#b48ead' },
    linkColor: 'rgba(136,192,208,0.2)', linkWidthMultiplier: 1, nodeOpacity: 0.92, nodeValMultiplier: 1,
  },
  {
    id: 'monokai',         name: 'Monokai',      emoji: '🖥',
    backgroundColor: '#272822',
    cssFilter: '',
    nodeColors: { song: '#66d9e8', album: '#ae81ff', artist: '#e6db74', theme: '#a6e22e', tag: '#f8f8f2', keyword: '#75715e', emotion: '#f92672' },
    linkColor: 'rgba(166,226,46,0.2)', linkWidthMultiplier: 1.1, nodeOpacity: 0.94, nodeValMultiplier: 1,
  },
  {
    id: 'synthwave',       name: 'Synthwave',    emoji: '🕹',
    backgroundColor: '#0d0221',
    cssFilter: 'saturate(1.5) brightness(1.1)',
    nodeColors: { song: '#ff6ec7', album: '#b967ff', artist: '#fffb96', theme: '#05ffa1', tag: '#01cdfe', keyword: '#2d1b69', emotion: '#ff2975' },
    linkColor: 'rgba(255,110,199,0.22)', linkWidthMultiplier: 1.5, nodeOpacity: 0.96, nodeValMultiplier: 1,
  },
  {
    id: 'sakura',          name: 'Sakura',       emoji: '🌸',
    backgroundColor: '#0a0610',
    cssFilter: 'saturate(1.3) brightness(1.05)',
    nodeColors: { song: '#f9a8c9', album: '#e879a0', artist: '#fce4ec', theme: '#c0ca33', tag: '#ab47bc', keyword: '#2d1b32', emotion: '#ef5350' },
    linkColor: 'rgba(233,121,160,0.2)', linkWidthMultiplier: 1, nodeOpacity: 0.93, nodeValMultiplier: 1,
  },
  {
    id: 'lava',            name: 'Lava Lamp',    emoji: '🫧',
    backgroundColor: '#07000d',
    cssFilter: 'saturate(1.6) contrast(1.15)',
    nodeColors: { song: '#ff6d00', album: '#ff3d00', artist: '#ffcc02', theme: '#dd2c00', tag: '#ff9100', keyword: '#1a0500', emotion: '#e64a19' },
    linkColor: 'rgba(255,109,0,0.22)', linkWidthMultiplier: 1.3, nodeOpacity: 0.95, nodeValMultiplier: 1,
    bokehOverlay: true,
  },
  {
    id: 'twilight',        name: 'Twilight',     emoji: '🌆',
    backgroundColor: '#0d0a1a',
    cssFilter: 'saturate(1.2)',
    nodeColors: { song: '#9d8cf7', album: '#6c63d4', artist: '#f4a261', theme: '#56cfe1', tag: '#80ffdb', keyword: '#1c1630', emotion: '#ff6b9d' },
    linkColor: 'rgba(157,140,247,0.18)', linkWidthMultiplier: 1, nodeOpacity: 0.93, nodeValMultiplier: 1,
  },
  {
    id: 'watercolor',      name: 'Watercolor',   emoji: '🎨',
    backgroundColor: '#0e1f2f',
    cssFilter: 'saturate(0.75) brightness(1.1)',
    nodeColors: { song: '#76c8e0', album: '#a0d8b3', artist: '#f0c27f', theme: '#b0a4e3', tag: '#89d4cf', keyword: '#2a4a5e', emotion: '#e8a0a0' },
    linkColor: 'rgba(118,200,224,0.18)', linkWidthMultiplier: 1, nodeOpacity: 0.88, nodeValMultiplier: 1,
  },
];

export const DEFAULT_THEME_ID = 'default';

export function getTheme(id: string): CinemaTheme {
  return CINEMA_THEMES.find(t => t.id === id) ?? CINEMA_THEMES[0]!;
}
