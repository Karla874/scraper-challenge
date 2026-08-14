import { ScraperConfig, SiteSelectors, JsfConfig } from '../types';

// Selectores CSS genéricos (fila/columna). Solo se usan para OEFA: la
// estructura de PJ (divs anidados con labels, no una tabla) se extrae con
// lógica dedicada en scraper.ts (extractPjDocuments), no con selectores simples.
const selectors: Record<string, SiteSelectors> = {
  OEFA: {
    rows: 'tr[data-ri]', // filas de listarDetalleInfraccionRAAForm:dt_data
    id: 'td:nth-child(2)', // Numero de expediente
    title: 'td:nth-child(3)', // Administrado
    court: 'td:nth-child(5)', // Sector
    date: 'td:nth-child(6)', // Nro. Resolucion de Apelacion (no hay columna de fecha real)
    pdfLink: 'td:nth-child(7) a', // link "Archivo" -> postback mojarra.jsfcljs, no href directo
    totalPages: '.ui-paginator-current',
  },
};

const jsfConfig: Record<string, JsfConfig> = {
  // Confirmado con el payload real capturado en DevTools.
  OEFA: {
    formName: 'listarDetalleInfraccionRAAForm',
    searchMode: 'ajax',
    search: {
      ajaxSource: 'listarDetalleInfraccionRAAForm:btnBuscar',
      execute: '@all',
      render: 'listarDetalleInfraccionRAAForm:pgLista listarDetalleInfraccionRAAForm:txtNroexp',
      buttonField: 'listarDetalleInfraccionRAAForm:btnBuscar',
      // buttonValue omitido a propósito: por convención de PrimeFaces toma el mismo valor que buttonField.
      extraFields: [
        'listarDetalleInfraccionRAAForm:txtNroexp',
        'listarDetalleInfraccionRAAForm:j_idt21',
        'listarDetalleInfraccionRAAForm:j_idt25',
        'listarDetalleInfraccionRAAForm:idsector',
        'listarDetalleInfraccionRAAForm:j_idt34',
      ],
    },
    paginationSourceField: 'listarDetalleInfraccionRAAForm:dt', // confirmado (widget id del data-table)
    paginationRenderField: 'listarDetalleInfraccionRAAForm:pgLista', // contenedor completo (trae la tabla entera, no solo <tr>)
    rowsPerPage: 10, // confirmado
  },
  // Confirmado con el HTML real de inicio.xhtml/resultado.xhtml (via VPN).
  // IMPORTANTE: entrar directo a resultado.xhtml por URL da pagina en blanco
  // y NO dispara ningun request (confirmado por el usuario). El flujo real es:
  // GET inicio.xhtml (formulario "vacio" pero funcional) -> click en la lupa
  // de "Filtro de texto" -> submit normal (no AJAX) del <form action="resultado.xhtml">
  // -> esa respuesta trae el listado completo (sin filtros = todos los registros).
  PJ: {
    formName: 'formBuscador',
    searchMode: 'fullpage',
    search: { ajaxSource: '', execute: '', render: '', buttonField: '', extraFields: [] }, // no aplica (searchMode='fullpage')
    fullPageSearchFields: {
      // Extraidos directamente del onclick="mojarra.jsfcljs(...)" del boton
      // de busqueda (la lupa) en el HTML real de inicio.xhtml.
      'formBuscador:j_idt49': 'formBuscador:j_idt49',
      'formBuscador:j_idt50': '21',
      'formBuscador:j_idt51': 'DESC',
      'formBuscador:j_idt52': 'Principal',
    },
    searchActionUrl: 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/resultado.xhtml',
    paginationSourceField: undefined,
    rowsPerPage: 10,
    // RichFaces: paginación via submit normal del formulario (no AJAX),
    // seteando el numero de pagina en el "spinner" y click en "IR".
    pagination: {
      spinnerField: 'formBuscador:spinner',
      submitButtonField: 'formBuscador:j_idt447',
      submitButtonValue: 'IR',
    },
  }
};

// Configuración compartida entre sitios.
const baseConfig = {
  maxRetries: 5,
  retryDelay: 2000,
  maxConcurrentRequests: 3,
  requestDelay: 1000,
  pdfDownloadDelay: 1500,
  maxPages: 50, // límite de seguridad para no paginar infinitamente si algo sale mal
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
    // OJO: NO es resultado.xhtml. Entrar ahi directo por URL da pagina en
    // blanco y no dispara ningun request (confirmado). El punto de entrada
    // real es inicio.xhtml; desde ahi se dispara la busqueda hacia resultado.xhtml
    // (ver jsf.searchActionUrl).
    initialUrl: 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml',
    selectors: undefined, // PJ usa extraccion dedicada (extractPjDocuments), no selectores genericos
    jsf: jsfConfig.PJ,
    pdfOutputDir: 'data/pdfs/PJ',
    ...baseConfig
  }
};

const SITE = (process.env.SCRAPER_SITE || 'OEFA') as 'OEFA' | 'PJ';
export const config: ScraperConfig = sites[SITE];

export { SITE };
