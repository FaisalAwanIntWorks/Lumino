export type RingStyle = 'solitaire' | 'three-stone' | 'halo' | 'pave-rail' | string;
export type RingShank = 'high-polish' | 'castel-pave' | '3-row-pave' | string;
export type RingMetal = '14k-yellow' | '14k-rose' | '18k-yellow' | '18k-white' | 'platinum' | string;
export type RingShape = 'round' | 'oval' | 'princess' | 'radiant' | 'emerald' | 'cushion' | 'pear' | 'marquise' | string;
export type CaratRange = number;
export type StoneType = 'natural' | 'lab';

export interface Stone {
  id: string;
  type: StoneType;
  price: number;
  carat: number;
  color: string;
  clarity: string;
  reportNo?: string | null;
}

export interface RingConfiguration {
  style: RingStyle | null;
  shank: RingShank | null;
  metal: RingMetal | null;
  shape: RingShape | null;
  caratRange: CaratRange | null;
  stone: Stone | null;
  engraving: {
    enabled: boolean;
    text: string;
    bandWidth: string;
    otherRequest: string;
  };
  size: string;
}

export interface StyleOption {
  id: string;
  name: string;
  description: string;
  price?: number;
}

export interface ShankOption {
  id: string;
  name: string;
  description: string;
  price?: number;
}

export interface MetalOption {
  id: string;
  name: string;
  color: string;
  price: number;
  colorFamily?: string;
}

export interface ShapeOption {
  id: string;
  name: string;
}
