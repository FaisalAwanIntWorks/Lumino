// Ring size conversion used by the Ring OS "Find your ring size" guide (eye icon
// on the Ring Size section). Values match the printable Aurezo Ring Size Guide PDF
// so the on-screen table and the printed chart never disagree.

export interface RingSizeRow {
  /** US & Canada size, as stored in the configuration (e.g. '7.5'). */
  us: string;
  /** UK & Australia letter size. */
  uk: string;
  /** EU / ISO size (inside circumference in mm, rounded to the half). */
  eu: string;
  /** Inside diameter in mm. */
  diameterMm: string;
  /** Inside circumference in mm (paper-strip measurement). */
  aroundMm: string;
}

export const RING_SIZE_GUIDE: RingSizeRow[] = [
  { us: '3',    uk: 'F½', eu: '44',   diameterMm: '14.1', aroundMm: '44.2' },
  { us: '3.5',  uk: 'G½', eu: '45.5', diameterMm: '14.5', aroundMm: '45.5' },
  { us: '4',    uk: 'H½', eu: '47',   diameterMm: '14.9', aroundMm: '46.8' },
  { us: '4.5',  uk: 'I½', eu: '48',   diameterMm: '15.3', aroundMm: '48.0' },
  { us: '5',    uk: 'J½', eu: '49.5', diameterMm: '15.7', aroundMm: '49.3' },
  { us: '5.5',  uk: 'K½', eu: '50.5', diameterMm: '16.1', aroundMm: '50.6' },
  { us: '6',    uk: 'L½', eu: '52',   diameterMm: '16.5', aroundMm: '51.9' },
  { us: '6.5',  uk: 'M½', eu: '53',   diameterMm: '16.9', aroundMm: '53.1' },
  { us: '7',    uk: 'N½', eu: '54.5', diameterMm: '17.3', aroundMm: '54.4' },
  { us: '7.5',  uk: 'O½', eu: '55.5', diameterMm: '17.7', aroundMm: '55.7' },
  { us: '8',    uk: 'P½', eu: '57',   diameterMm: '18.1', aroundMm: '57.0' },
  { us: '8.5',  uk: 'Q½', eu: '58',   diameterMm: '18.5', aroundMm: '58.2' },
  { us: '9',    uk: 'R½', eu: '59.5', diameterMm: '18.9', aroundMm: '59.5' },
  { us: '9.5',  uk: 'S½', eu: '61',   diameterMm: '19.4', aroundMm: '60.8' },
  { us: '10',   uk: 'T½', eu: '62',   diameterMm: '19.8', aroundMm: '62.1' },
  { us: '10.5', uk: 'U½', eu: '63.5', diameterMm: '20.2', aroundMm: '63.3' },
  { us: '11',   uk: 'V½', eu: '64.5', diameterMm: '20.6', aroundMm: '64.6' },
  { us: '11.5', uk: 'W½', eu: '66',   diameterMm: '21.0', aroundMm: '65.9' },
  { us: '12',   uk: 'X½', eu: '67',   diameterMm: '21.4', aroundMm: '67.2' },
  { us: '12.5', uk: 'Y½', eu: '68.5', diameterMm: '21.8', aroundMm: '68.5' },
  { us: '13',   uk: 'Z½', eu: '69.5', diameterMm: '22.2', aroundMm: '69.7' },
];

export const RING_SIZE_OPTIONS_US: string[] = RING_SIZE_GUIDE.map((r) => r.us);

/** Printable guide served from /public (Letter size, 2 pages). */
export const RING_SIZE_GUIDE_PDF_URL = '/guides/Aurezo_Ring_Size_Guide.pdf';
export const RING_SIZE_GUIDE_PDF_FILENAME = 'Aurezo_Ring_Size_Guide.pdf';

/** '7.5' -> '7½' for display; whole sizes are returned unchanged. */
export const formatUsRingSize = (us: string): string => us.replace(/\.5$/, '½');
