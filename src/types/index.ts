export interface PdfDownloadAction {
  // Nombre del campo hidden identifica el link clickeado.
  componentField: string;
  paramUuid: string; // -> Atributo ID
}

export interface Document {
  id: string;
  title: string;
  court: string;
  date: string;
  summary: string;
  category: string;
  pdfUrl: string;
  downloadAction?: PdfDownloadAction;
  // Columnas adicionales.
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

//Nombres exactos de los campos del formulario del sitio.
export type JsfSearchMode = 'none' | 'ajax' | 'fullpage';

export interface JsfConfig {
  // id/name del <form>.
  formName: string;
  searchMode: JsfSearchMode;
  search: JsfSearchConfig;
  // Campos exactos (name=value) que hay que agregar al formulario.
  fullPageSearchFields?: Record<string, string>;
  // URL a la que se postea el submit de búsqueda.
  searchActionUrl?: string;
  paginationSourceField?: string;
  // En OEFA hay que apuntar al contenedor completo (pgLista).
  paginationRenderField?: string;
  // Parámetro que indica el índice de la primera fila a mostrar.
  paginationFirstField?: string;
  rowsPerPage: number;
  pdfLinkSelector?: string;
  pagination?: PjPaginationConfig;
}

// Para PJ.
export interface PjPaginationConfig {
  spinnerField: string;
  submitButtonField: string;
  submitButtonValue: string;
}

export interface JsfSearchConfig {
  // javax.faces.source: el componente que originó el evento (botón "Buscar").
  ajaxSource: string;
  execute: string;
  render: string;
  buttonField: string;
  // Valor que se envía junto al botón.
  buttonValue?: string;
  // Campos del formulario de filtros que el navegador envía vacíos.
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
