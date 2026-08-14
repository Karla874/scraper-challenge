/**
 * Datos necesarios para "clickear" el link de descarga de un documento cuando
 * el sitio no expone una URL directa al PDF, sino un postback JSF
 * (onclick="mojarra.jsfcljs(...)"). Ver PdfDownloader.
 */
export interface PdfDownloadAction {
  /** nombre del campo hidden que identifica el link clickeado, ej: "form:dt:0:j_idt63" */
  componentField: string;
  /** valor de "param_uuid" que el servidor usa para saber qué archivo stremear */
  paramUuid: string;
}

export interface Document {
  id: string;
  title: string;
  court: string;
  date: string;
  summary: string;
  category: string;
  /** URL directa al PDF, si el sitio la expone así (ej: PJ podría ser distinto a OEFA). */
  pdfUrl: string;
  /** Mecanismo de descarga vía postback JSF, cuando no hay pdfUrl directa (caso OEFA). */
  downloadAction?: PdfDownloadAction;
  /** Columnas adicionales capturadas tal cual, para no perder info del sitio. */
  raw?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface ScraperConfig {
  site: 'PJ' | 'OEFA';
  baseUrl: string;
  initialUrl: string;
  maxRetries: number;
  retryDelay: number;
  maxConcurrentRequests: number;
  requestDelay: number;
  userAgent: string;
  selectors?: SiteSelectors;
  pdfOutputDir: string;
  pdfDownloadDelay: number;
  maxPages: number;
  jsf: JsfConfig;
}

/**
 * Nombres exactos de los campos del formulario JSF/PrimeFaces del sitio.
 * Para OEFA ya están confirmados a partir de una respuesta real capturada en
 * DevTools. Para PJ siguen siendo TODO: confirmar en DevTools > Network,
 * haciendo click en "Buscar" y viendo el payload del POST. Ver README.
 */
export type JsfSearchMode = 'none' | 'ajax' | 'fullpage';

export interface JsfConfig {
  /** id/name del <form> (prefijo común de todos los campos), ej: "listarDetalleInfraccionRAAForm" */
  formName: string;
  /** cómo se dispara la búsqueda: 'ajax' (OEFA, PrimeFaces), 'fullpage' (PJ, RichFaces, submit normal), o 'none' si el GET inicial ya trae resultados. */
  searchMode: JsfSearchMode;
  /** parámetros del POST AJAX que dispara la búsqueda. Solo se usa si searchMode === 'ajax'. */
  search: JsfSearchConfig;
  /**
   * Campos exactos (name=value) que hay que agregar al formulario para un
   * submit normal de busqueda (searchMode === 'fullpage'). Se extraen del
   * onclick="mojarra.jsfcljs(...)" del botón de búsqueda real del sitio.
   */
  fullPageSearchFields?: Record<string, string>;
  /**
   * URL a la que se postea el submit de búsqueda, si es distinta de
   * initialUrl (ej: PJ se entra por inicio.xhtml pero el <form> tiene
   * action="resultado.xhtml"). Si no se especifica, se usa initialUrl.
   */
  searchActionUrl?: string;
  /** id del componente que dispara la paginación AJAX estilo PrimeFaces (caso OEFA). */
  paginationSourceField?: string;
  /**
   * id del contenedor a renderizar al paginar (javax.faces.partial.render).
   * En OEFA hay que apuntar al contenedor completo (pgLista): si se apunta al
   * data-table directamente, el servidor manda solo los <tr> sueltos y cheerio
   * los descarta al parsearlos (las filas necesitan estar dentro de un <table>).
   */
  paginationRenderField?: string;
  /** parámetro que indica el índice de la primera fila a mostrar (paginación PrimeFaces) */
  paginationFirstField?: string;
  /** cantidad de filas por página */
  rowsPerPage: number;
  /** selector CSS del <a> que dispara la descarga del PDF (mojarra.jsfcljs), si aplica */
  pdfLinkSelector?: string;
  /** paginación tipo "ir a la pagina N" via submit normal de formulario (caso PJ/RichFaces). */
  pagination?: PjPaginationConfig;
}

/**
 * PJ pagina con un input numérico ("spinner") + un botón submit normal
 * (no AJAX): se manda el número de página deseado y el form entero se
 * reenvía, devolviendo una página HTML completa (no partial-response).
 */
export interface PjPaginationConfig {
  spinnerField: string;
  submitButtonField: string;
  submitButtonValue: string;
}

export interface JsfSearchConfig {
  /** javax.faces.source: el componente que originó el evento (el botón "Buscar") */
  ajaxSource: string;
  /** javax.faces.partial.execute, ej: "@all" */
  execute: string;
  /** javax.faces.partial.render, ej: "form:pgLista form:txtNroexp" */
  render: string;
  /** name del campo del botón, ej: "listarDetalleInfraccionRAAForm:btnBuscar" */
  buttonField: string;
  /**
   * Valor que se envía junto al botón. En PrimeFaces (p:commandButton) suele
   * ser el mismo nombre del campo (convención name=value), así que si se omite
   * se usa automáticamente el valor de buttonField. Solo hace falta setearlo
   * distinto si el sitio usa un h:commandButton clásico que manda el texto
   * visible (ej. "Buscar") en vez del clientId.
   */
  buttonValue?: string;
  /** otros campos del formulario de filtros que el navegador envía vacíos junto con la búsqueda */
  extraFields: string[];
}

export interface SiteSelectors {
  rows: string;
  id: string;
  title: string;
  court: string;
  date: string;
  pdfLink: string;
  totalPages: string;
  nextPage?: string;
  pageInput?: string;
}

export interface ScraperResult {
  documents: Document[];
  failedDocuments: string[];
  totalPages: number;
  processedCount: number;
  startTime: Date;
  endTime: Date;
  site: string;
}

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug'
}