import { ScraperConfig, SiteSelectors, JsfConfig } from '../types';

// Selectores CSS genéricos para OEFA.
const selectors: Record<string, SiteSelectors> = {
  OEFA: {
    rows: 'tr[data-ri]', // filas de listarDetalleInfraccionRAAForm:dt_data
    id: 'td:nth-child(2)', // Nro de expediente
    title: 'td:nth-child(3)', // Administrado
    court: 'td:nth-child(5)', // Sector
    date: 'td:nth-child(6)', // Nro. Resolucion de Apelación
    pdfLink: 'td:nth-child(7) a', // link Archivo -> postback mojarra.jsfcljs
    totalPages: '.ui-paginator-current',
  },
};

const jsfConfig: Record<string, JsfConfig> = {
  OEFA: {
    formName: 'listarDetalleInfraccionRAAForm',
    searchMode: 'ajax',
    search: {
      ajaxSource: 'listarDetalleInfraccionRAAForm:btnBuscar',
      execute: '@all',
      render: 'listarDetalleInfraccionRAAForm:pgLista listarDetalleInfraccionRAAForm:txtNroexp',
      buttonField: 'listarDetalleInfraccionRAAForm:btnBuscar',
      extraFields: [
        'listarDetalleInfraccionRAAForm:txtNroexp',
        'listarDetalleInfraccionRAAForm:j_idt21',
        'listarDetalleInfraccionRAAForm:j_idt25',
        'listarDetalleInfraccionRAAForm:idsector',
        'listarDetalleInfraccionRAAForm:j_idt34',
      ],
    },
    paginationSourceField: 'listarDetalleInfraccionRAAForm:dt',
    paginationRenderField: 'listarDetalleInfraccionRAAForm:pgLista',
    rowsPerPage: 10,
  },
  
  // Nota: esta respuesta trae el listado completo sin filtros.
  PJ: {
    formName: 'formBuscador',
    searchMode: 'fullpage',
    search: { ajaxSource: '', execute: '', render: '', buttonField: '', extraFields: [] },
    fullPageSearchFields: {
      'formBuscador:j_idt49': 'formBuscador:j_idt49',
      'formBuscador:j_idt50': '21',
      'formBuscador:j_idt51': 'DESC',
      'formBuscador:j_idt52': 'Principal',
    },
    searchActionUrl: 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/resultado.xhtml',
    paginationSourceField: undefined,
    rowsPerPage: 10,
    pagination: {
      spinnerField: 'formBuscador:spinner',
      submitButtonField: 'formBuscador:j_idt447',
      submitButtonValue: 'IR',
    },
  }
};

// Configuración compartida entre OEFA y PJ.
const baseConfig = {
  maxRetries: 5,
  retryDelay: 2000,
  maxConcurrentRequests: 3,
  requestDelay: 1000,
  pdfDownloadDelay: 1500,
  maxPages: 50,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

export const sites = {
  OEFA: {
    site: 'OEFA' as const,
    baseUrl: 'https://publico.oefa.gob.pe',
    initialUrl: 'https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml',
    selectors: selectors.OEFA,
    jsf: jsfConfig.OEFA,
    pdfOutputDir: 'data/pdfs/OEFA',
    ...baseConfig
  },
  PJ: {
    site: 'PJ' as const,
    baseUrl: 'https://jurisprudencia.pj.gob.pe',
    initialUrl: 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml',
    selectors: undefined, // Nota: PJ no selectores genericos
    jsf: jsfConfig.PJ,
    pdfOutputDir: 'data/pdfs/PJ',
    ...baseConfig
  }
};

const SITE = (process.env.SCRAPER_SITE || 'OEFA') as 'OEFA' | 'PJ';
export const config: ScraperConfig = sites[SITE];

export { SITE };
