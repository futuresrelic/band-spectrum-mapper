import { api } from '../lib/api';

export type NodeType = 'song' | 'album' | 'artist' | 'theme' | 'tag' | 'keyword' | 'emotion';
export type EdgeType =
  | 'same_artist' | 'same_album' | 'shared_tag'
  | 'similar_radar' | 'conceptual' | 'shared_word';

export type GraphLayoutPreset =
  | 'artist-universe' | 'album-cluster' | 'theme-constellation'
  | 'maynard-universe' | 'emotional-similarity' | 'lyrical-dna'
  | 'fibonacci-spiral' | 'fractal-tree';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: {
    bandId?: string;
    albumId?: string;
    bandName?: string;
    albumTitle?: string;
    scores?: Record<string, number>;
    color?: string;
    size?: number;
    count?: number;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  preset: GraphLayoutPreset;
  label: string;
}

export interface NodeScopes {
  bands: { id: string; name: string }[];
  albums: { id: string; title: string; year: number | null; band: { id: string; name: string } }[];
}

export const LAYOUT_PRESETS: { id: GraphLayoutPreset; label: string; description: string }[] = [
  { id: 'artist-universe',      label: 'Artist Universe',       description: 'Songs, albums, and tags for selected bands' },
  { id: 'album-cluster',        label: 'Album Cluster',         description: 'Songs in an album with theme/tag satellites' },
  { id: 'theme-constellation',  label: 'Theme Constellation',   description: 'Songs grouped around shared AI themes' },
  { id: 'maynard-universe',     label: 'Maynard Universe',      description: 'TOOL · A Perfect Circle · Puscifer' },
  { id: 'emotional-similarity', label: 'Emotional Similarity',  description: 'Songs connected by matching radar profiles' },
  { id: 'lyrical-dna',          label: 'Lyrical DNA',           description: 'Songs bridged by shared lyric keywords' },
  { id: 'fibonacci-spiral',    label: 'Fibonacci Spiral',      description: 'All nodes in a golden-angle phyllotaxis spiral' },
  { id: 'fractal-tree',        label: 'Fractal Tree',          description: 'Band → album → song recursive golden-ratio branching' },
];

export const songNodesApi = {
  getGraph(params: {
    preset: GraphLayoutPreset;
    bandIds?: string[];
    albumId?: string;
  }): Promise<GraphData> {
    const qs = new URLSearchParams({ preset: params.preset });
    if (params.bandIds?.length) qs.set('bandIds', params.bandIds.join(','));
    if (params.albumId) qs.set('albumId', params.albumId);
    return api.get(`/api/song-nodes?${qs}`);
  },

  getScopes(): Promise<NodeScopes> {
    return api.get('/api/song-nodes/scopes');
  },
};
