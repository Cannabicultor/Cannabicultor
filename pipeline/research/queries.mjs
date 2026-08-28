// queries.mjs — Lista de búsquedas del agente de investigación semanal.
// Editable: añade/quita/rota queries cada semana sin tocar el resto del código.
// Cada entrada: { q: '<búsqueda>', categoria: '<Cultivo|Genetica|Farmacologia|Plagas|Legislacion|Cultura>' }

export const QUERIES = [
  // --- Cultivo técnico ---
  { q: 'VPD vapor pressure deficit cannabis cultivo estudio',           categoria: 'Cultivo' },
  { q: 'fotoperiodo floración cannabis investigación',                  categoria: 'Cultivo' },
  { q: 'déficit nutrientes cannabis diagnóstico visual',                categoria: 'Cultivo' },
  { q: 'sustratos coco vs tierra cannabis comparativa científica',      categoria: 'Cultivo' },
  { q: 'espectro LED cultivo cannabis research',                        categoria: 'Cultivo' },
  { q: 'riego y EC cannabis cultivo interior estudio',                  categoria: 'Cultivo' },

  // --- Genética y variedades ---
  { q: 'genética landrace cannabis origen paper',                       categoria: 'Genetica' },
  { q: 'cannabis terpenos perfil genético estudio',                     categoria: 'Genetica' },
  { q: 'fenotipos cannabis selección genética breeding',                categoria: 'Genetica' },
  { q: 'historia banco de semillas cannabis',                           categoria: 'Genetica' },
  { q: 'Cannabis sativa genomics breeding production Frontiers',        categoria: 'Genetica' },

  // --- Farmacología y salud ---
  { q: 'cannabinoides THC CBD farmacología estudio',                    categoria: 'Farmacologia' },
  { q: 'entourage effect cannabis investigación científica',           categoria: 'Farmacologia' },
  { q: 'cannabis salud pública revisión sistemática',                   categoria: 'Farmacologia' },

  // --- Plagas y enfermedades ---
  { q: 'plagas cannabis cultivo interior identificación',               categoria: 'Plagas' },
  { q: 'hongos moho cannabis cultivo prevención estudio',               categoria: 'Plagas' },
  { q: 'Cannabis sativa pathogen pest control research',                categoria: 'Plagas' },

  // --- Legislación y mercado ---
  { q: 'legislación cannabis España cultivo asociativo',                categoria: 'Legislacion' },
  { q: 'mercado cannabis Europa informe anual',                         categoria: 'Legislacion' },
  { q: 'regulación cannabis medicinal Latinoamérica',                   categoria: 'Legislacion' },

  // --- Cultura y comunidad ---
  { q: 'historia cultivo cannabis España asociaciones',                 categoria: 'Cultura' },
  { q: 'libro cultivo cannabis referencia clásico',                     categoria: 'Cultura' },
];

// Dominios a excluir (comercial/spam/sin autoría). Se filtra por substring del host.
export const EXCLUIR_DOMINIOS = [
  'reddit.com', 'pinterest.', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com',
  'amazon.', 'ebay.', 'aliexpress.', 'mercadolibre.',
];

// Dominios de alta autoridad: reciben +1 de calidad automáticamente.
export const DOMINIOS_AUTORIDAD = [
  'journalofcannabisresearch.biomedcentral.com', 'frontiersin.org', 'mdpi.com',
  'ncbi.nlm.nih.gov', 'pubmed', 'nature.com', 'sciencedirect.com', 'springer.com',
  'wiley.com', 'scholar.google', 'biomedcentral.com', 'plos.org',
];
