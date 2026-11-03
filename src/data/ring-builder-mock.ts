import { StyleOption, ShankOption, MetalOption, ShapeOption, Stone } from '@/types/ring-builder';

export const MOCK_STYLES: StyleOption[] = [
  { id: 'solitaire', name: 'Solitaire', description: 'Classic single stone setting' },
  { id: 'three-stone', name: 'Three Stone', description: 'Past, present, and future' },
  { id: 'halo', name: 'Halo', description: 'Center stone surrounded by smaller diamonds' },
  { id: 'pave-rail', name: 'Pavé Rail', description: 'Diamonds set along the band' },
];

export const MOCK_SHANKS: ShankOption[] = [
  { id: 'high-polish', name: 'High Polish', description: 'Smooth, reflective finish' },
  { id: 'castel-pave', name: 'Castel Pavé', description: 'Castle-style pavé setting' },
  { id: '3-row-pave', name: '3 Row Pavé', description: 'Three rows of pavé diamonds' },
  { id: 'tapered', name: 'Tapered', description: 'Tapered shank style' },
  { id: 'eternity', name: 'Eternity', description: 'Eternity shank style' },
  { id: 'marquise-cut', name: 'Marquise Cut', description: 'Marquise cut shank style' },
];

export const MOCK_METALS: MetalOption[] = [
  { id: '14k-yellow', name: '14K Yellow Gold', color: '#FFD700', price: 200, colorFamily: 'yellow' },
  { id: '14k-rose', name: '14K Rose Gold', color: '#E0BFB8', price: 250, colorFamily: 'rose' },
  { id: '18k-yellow', name: '18K Yellow Gold', color: '#FFDF00', price: 350, colorFamily: 'yellow' },
  { id: '18k-white', name: '18K White Gold', color: '#E8E8E8', price: 300, colorFamily: 'white' },
  { id: 'platinum', name: 'Platinum', color: '#C0C0C0', price: 500, colorFamily: 'platinum' },
  { id: 'sterling-silver', name: 'Sterling Silver', color: '#B8B8B8', price: 30, colorFamily: 'silver' },
];

export const MOCK_SHAPES: ShapeOption[] = [
  { id: 'round', name: 'Round' },
  { id: 'oval', name: 'Oval' },
  { id: 'princess', name: 'Princess' },
  { id: 'radiant', name: 'Radiant' },
  { id: 'emerald', name: 'Emerald' },
  { id: 'cushion', name: 'Cushion' },
];

export const MOCK_CARAT_RANGES = [
  { value: 0.5, label: '0.50 - 0.99 ct', price: 400 },
  { value: 1, label: '1.00 - 1.49 ct', price: 800 },
  { value: 1.5, label: '1.50 - 1.99 ct', price: 1200 },
  { value: 2, label: '2.00 - 2.49 ct', price: 1600 },
  { value: 2.5, label: '2.50 - 2.99 ct', price: 2000 },
  { value: 3, label: '3.00 - 3.49 ct', price: 2400 },
  { value: 3.5, label: '3.50 - 3.99 ct', price: 2800 },
  { value: 4, label: '4.00 - 4.49 ct', price: 3200 },
  { value: 4.5, label: '4.50 - 4.99 ct', price: 3600 },
];

export const MOCK_NATURAL_STONES: Stone[] = [
  { id: 'nat-1', type: 'natural', price: 1500, carat: 0.50, color: 'H', clarity: 'VS2' },
  { id: 'nat-2', type: 'natural', price: 1800, carat: 0.55, color: 'G', clarity: 'VS1' },
  { id: 'nat-3', type: 'natural', price: 2100, carat: 0.60, color: 'F', clarity: 'VVS2' },
  { id: 'nat-4', type: 'natural', price: 2400, carat: 0.65, color: 'E', clarity: 'VVS1' },
  { id: 'nat-5', type: 'natural', price: 2700, carat: 0.70, color: 'D', clarity: 'IF' },
  { id: 'nat-6', type: 'natural', price: 3000, carat: 0.75, color: 'H', clarity: 'VS2' },
];

export const MOCK_LAB_STONES: Stone[] = [
  { id: 'lab-1', type: 'lab', price: 1200, carat: 0.50, color: 'H', clarity: 'VS2' },
  { id: 'lab-2', type: 'lab', price: 1450, carat: 0.55, color: 'G', clarity: 'VS1' },
  { id: 'lab-3', type: 'lab', price: 1700, carat: 0.60, color: 'F', clarity: 'VVS2' },
  { id: 'lab-4', type: 'lab', price: 1950, carat: 0.65, color: 'E', clarity: 'VVS1' },
  { id: 'lab-5', type: 'lab', price: 2200, carat: 0.70, color: 'D', clarity: 'IF' },
  { id: 'lab-6', type: 'lab', price: 2450, carat: 0.75, color: 'H', clarity: 'VS2' },
];

export const MOCK_SIZES = [
  '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', 
  '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'
];
