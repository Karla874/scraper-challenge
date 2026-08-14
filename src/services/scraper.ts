import * as cheerio from 'cheerio';
import type { Cheerio, CheerioAPI } from 'cheerio';
import HttpClient from './httpClient';
import PdfDownloader from './pdfDownloader';
import JsfSession from './jsfSession';
import logger from '../utils/logger';
import { Document, ScraperConfig, ScraperResult, SiteSelectors } from '../types';
import { extractJsfCljsParams, isPartialResponse, extractPartialResponseUpdates } from './jsfHelper';
import { extractPjDocuments } from './pjParser';
import fs from 'fs/promises';
import path from 'path';

export class Scraper {
  private httpClient: HttpClient;
  private pdfDownloader: PdfDownloader;
  private config: ScraperConfig;
  private selectors?: SiteSelectors;
  private session = new JsfSession();
  private documents: Document[] = [];
  private failedDocuments: Array<{ id: string; reason: string }> = [];
  private totalPages: number = 1;
  private lastRawResponse: string = '';
  private lastRawContentType: string | undefined;

  constructor(config: ScraperConfig) {
    this.config = config;
    this.selectors = config.selectors;
    this.httpClient = new HttpClient(config);
    this.pdfDownloader = new PdfDownloader(this.httpClient, config.pdfOutputDir);
  }

  async scrape(): Promise<ScraperResult> {
    const startTime = new Date();
    logger.info(`Iniciando scraping del sitio: ${this.config.site}`);
    logger.info(`URL: ${this.config.initialUrl}`);

    try {
      const initial = await this.httpClient.retryableRequest(() => this.httpClient.get(this.config.initialUrl));
      const initialContentType = initial.headers?.['content-type'] as string | undefined;
      this.session.update(initial.data, initialContentType);

      // OEFA: el GET inicial trae la tabla vacia, hay hacer la busqueda (AJAX).
      let html: string;
      switch (this.config.jsf.searchMode) {
        case 'none':
          html = JsfSession.toUsableHtml(initial.data, initialContentType);
          break;
        case 'fullpage':
          html = await this.submitFullPageSearch();
          break;
        case 'ajax':
        default:
          html = await this.submitSearch();
          break;
      }

      let pageNumber = 1;
      while (pageNumber <= this.config.maxPages) {
        const docs = this.extractDocuments(html);

        if (docs.length === 0) {
          if (pageNumber === 1) {
            await this.saveDebugSnapshot(html);
          }
          break;
        }

        this.documents.push(...docs);
        logger.info(`Pagina ${pageNumber}: ${docs.length} documentos encontrados`);

        await this.downloadPdfsForPage(docs);

        const nextHtml = await this.fetchNextPage(pageNumber);
        if (!nextHtml) break;
        html = nextHtml;
        pageNumber++;

        await this.delay(this.config.requestDelay);
      }

      this.totalPages = pageNumber;
      logger.info(`Scraping completado. Documentos: ${this.documents.length} en ${pageNumber} pagina(s)`);

    } catch (error) {
      logger.error(`Error durante el scraping: ${error}`);
    }

    const endTime = new Date();
    await this.saveResults();
    await this.saveFailedDocuments();

    return {
      documents: this.documents,
      failedDocuments: this.failedDocuments.map(f => f.id),
      totalPages: this.totalPages,
      processedCount: this.documents.length,
      startTime,
      endTime,
      site: this.config.site
    };
  }

  /**
   * Se hace la búsqueda mencionada.
   * "Buscar"). Solo para a sitios con jsf.searchMode === 'ajax' (OEFA).
   */
  private async submitSearch(): Promise<string> {
    const { jsf } = this.config;
    const { search } = jsf;

    const extraFieldsEmpty = Object.fromEntries(search.extraFields.map(f => [f, '']));

    const body = this.session.buildBody({
      'javax.faces.partial.ajax': 'true',
      'javax.faces.source': search.ajaxSource,
      'javax.faces.partial.execute': search.execute,
      'javax.faces.partial.render': search.render,
      [search.buttonField]: search.buttonValue ?? search.buttonField,
      [jsf.formName]: jsf.formName,
      ...extraFieldsEmpty,
    });

    const response = await this.httpClient.retryableRequest(() =>
      this.httpClient.post(this.config.initialUrl, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Faces-Request': 'partial/ajax',
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
    );

    const contentType = response.headers?.['content-type'] as string | undefined;
    this.lastRawResponse = response.data;
    this.lastRawContentType = contentType;
    this.session.update(response.data, contentType);
    return JsfSession.toUsableHtml(response.data, contentType);
  }

  // Submit del formulario completo para la búsqueda, usando los campos extraídos del botón.
  private async submitFullPageSearch(): Promise<string> {
    const { jsf } = this.config;
    const body = this.session.buildBody(jsf.fullPageSearchFields ?? {});
    const targetUrl = jsf.searchActionUrl ?? this.config.initialUrl;

    const response = await this.httpClient.retryableRequest(() =>
      this.httpClient.post(targetUrl, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );

    const contentType = response.headers?.['content-type'] as string | undefined;
    this.lastRawResponse = response.data;
    this.lastRawContentType = contentType;
    this.session.update(response.data, contentType);
    return JsfSession.toUsableHtml(response.data, contentType);
  }

  // Pide la siguiente página.
  private async fetchNextPage(currentPageNumber: number): Promise<string | null> {
    if (this.config.jsf.pagination) {
      return this.fetchPjPage(currentPageNumber + 1);
    }
    if (this.config.jsf.paginationSourceField) {
      return this.fetchOefaPage(currentPageNumber);
    }
    return null; // Nos quedamos en la página 1.
  }

  // Paginación AJAX estilo PrimeFaces (OEFA).
  private async fetchOefaPage(pageIndex: number): Promise<string | null> {
    const { jsf } = this.config;
    if (!jsf.paginationSourceField) return null;

    const firstRow = pageIndex * jsf.rowsPerPage;
    const renderTarget = jsf.paginationRenderField ?? jsf.paginationSourceField;
    const body = this.session.buildBody({
      'javax.faces.partial.ajax': 'true',
      'javax.faces.source': jsf.paginationSourceField,
      'javax.faces.partial.execute': jsf.paginationSourceField,
      'javax.faces.partial.render': renderTarget,
      [`${jsf.paginationSourceField}_pagination`]: 'true',
      [`${jsf.paginationSourceField}_first`]: String(firstRow),
      [`${jsf.paginationSourceField}_rows`]: String(jsf.rowsPerPage),
    });

    try {
      const response = await this.httpClient.retryableRequest(() =>
        this.httpClient.post(this.config.initialUrl, body, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Faces-Request': 'partial/ajax',
            'X-Requested-With': 'XMLHttpRequest',
          },
        })
      );
      const contentType = response.headers?.['content-type'] as string | undefined;
      this.session.update(response.data, contentType);
      return JsfSession.toUsableHtml(response.data, contentType);
    } catch (error) {
      logger.warn(`No se pudo obtener la pagina (OEFA) indice ${pageIndex}: ${error}`);
      return null;
    }
  }

  // Paginación (PJ): submit del formulario completo.
  private async fetchPjPage(pageNumber: number): Promise<string | null> {
    const { pagination } = this.config.jsf;
    if (!pagination) return null;

    const body = this.session.buildBody({
      [pagination.spinnerField]: String(pageNumber),
      [pagination.submitButtonField]: pagination.submitButtonValue,
    });

    try {
      const response = await this.httpClient.retryableRequest(() =>
        this.httpClient.post(this.config.initialUrl, body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
      const contentType = response.headers?.['content-type'] as string | undefined;
      this.session.update(response.data, contentType);
      return JsfSession.toUsableHtml(response.data, contentType);
    } catch (error) {
      logger.warn(`No se pudo obtener la pagina (PJ) ${pageNumber}: ${error}`);
      return null;
    }
  }

  /**
   * Cuando la primera página no trae resultados, guarda la respuesta del servidor
     y el HTML ya "desempaquetado" para no volver a reproducir el request.
   */
  private async saveDebugSnapshot(processedHtml: string): Promise<void> {
    const debugDir = path.join(__dirname, '../../data/debug');
    await fs.mkdir(debugDir, { recursive: true });

    const stamp = Date.now();
    const rawPath = path.join(debugDir, `${this.config.site}-raw-${stamp}.txt`);
    const processedPath = path.join(debugDir, `${this.config.site}-processed-${stamp}.html`);

    await fs.writeFile(rawPath, this.lastRawResponse || '(sin respuesta capturada)');
    await fs.writeFile(processedPath, processedHtml);

    logger.warn('No se encontraron documentos en la primera pagina.');
    logger.warn(`Content-Type de la respuesta: ${this.lastRawContentType}`);
    logger.warn(`Respuesta cruda guardada en: ${rawPath}`);
    logger.warn(`HTML procesado guardado en: ${processedPath}`);

    // Si es un partial-response, listamos que bloques <update> llegaron y
    // mostramos el contenido del que nos interesa (pgLista) para saber si
    // el servidor mando la tabla vacia, un error, o algo inesperado.
    if (isPartialResponse(this.lastRawContentType, this.lastRawResponse)) {
      const updates = extractPartialResponseUpdates(this.lastRawResponse);
      const ids = Object.keys(updates);
      logger.warn(`Bloques <update> recibidos (${ids.length}): ${ids.join(', ')}`);

      const pgListaId = ids.find(id => id.includes('pgLista'));
      if (pgListaId) {
        logger.warn(`Contenido de "${pgListaId}" (primeros 800 caracteres):`);
        logger.warn(updates[pgListaId].slice(0, 800));
      } else {
        logger.warn('No vino ningun bloque <update> con "pgLista" en el id -> la busqueda probablemente no se disparo como esperabamos.');
      }
    } else {
      logger.warn('La respuesta NO es un partial-response XML (revisa si el servidor devolvio HTML de error, login, etc).');
      logger.warn(`Preview (primeros 500 caracteres):`);
      logger.warn((this.lastRawResponse || '').slice(0, 500));
    }
  }

  private extractDocuments(html: string): Document[] {
    const $ = cheerio.load(html);
    try {
      if (this.config.site === 'PJ') {
        const { documents, rowCount } = extractPjDocuments($, this.config.baseUrl);
        logger.info(`Encontradas ${rowCount} filas`);
        return documents;
      }
      return this.extractOefaDocuments($);
    } catch (error) {
      logger.error(`Error extrayendo documentos: ${error}`);
      return [];
    }
  }

  // OEFA: filas de tabla PrimeFaces, descarga via postback mojarra.jsfcljs.
  private extractOefaDocuments($: CheerioAPI): Document[] {
    const documents: Document[] = [];
    const { rows, id, title, court, date, pdfLink } = this.selectors!;
    const foundRows = $(rows);
    logger.info(`Encontradas ${foundRows.length} filas`);

    foundRows.each((index: number, element: any) => {
      const row = $(element);

      const docId = row.find(id).text().trim() || `DOC-${index + 1}`;
      const docTitle = row.find(title).text().trim() || 'Sin titulo';
      const docCourt = row.find(court).text().trim() || this.config.site;
      const docDate = row.find(date).text().trim() || 'No especificada';

      const raw: Record<string, string> = {};
      row.find('td').each((i: number, td: any) => {
        raw[`col_${i}`] = $(td).text().trim();
      });

      let pdfUrl = '';
      let downloadAction: Document['downloadAction'];
      const link = row.find(pdfLink);
      if (link.length > 0) {
        const href = link.attr('href');
        if (href && href !== '#' && !href.startsWith('javascript:')) {
          pdfUrl = href.startsWith('http') ? href : `${this.config.baseUrl}${href}`;
        } else {
          const params = extractJsfCljsParams(link.attr('onclick'));
          if (params) {
            const { param_uuid, ...rest } = params;
            const componentField = Object.keys(rest)[0];
            if (componentField && param_uuid) {
              downloadAction = { componentField, paramUuid: param_uuid };
            }
          }
        }
      }

      documents.push({
        id: docId, title: docTitle, court: docCourt, date: docDate,
        summary: '', category: '', pdfUrl, downloadAction, raw,
      });
    });

    return documents;
  }

  // Descarga los PDFs de una página.
  private async downloadPdfsForPage(docs: Document[]): Promise<void> {
    const downloadable = docs.filter(d => d.pdfUrl || d.downloadAction);
    if (downloadable.length === 0) return;

    logger.info(`Descargando ${downloadable.length} PDFs de esta pagina...`);
    const results = await this.pdfDownloader.downloadAll(
      downloadable,
      this.config.pdfDownloadDelay,
      this.session,
      this.config.initialUrl
    );

    for (const result of results) {
      if (!result.success) {
        this.failedDocuments.push({ id: result.documentId, reason: result.error || 'Error desconocido' });
      }
    }

    const okCount = results.filter(r => r.success).length;
    logger.info(`PDFs de esta pagina: ${okCount}/${downloadable.length} exitosos`);
  }

  private async saveResults(): Promise<void> {
    const results = {
      site: this.config.site,
      documents: this.documents,
      metadata: {
        timestamp: new Date().toISOString(),
        source: this.config.baseUrl,
        totalPages: this.totalPages,
        processedCount: this.documents.length,
      }
    };

    const outputDir = path.join(__dirname, '../../data/output');
    await fs.mkdir(outputDir, { recursive: true });

    const filepath = path.join(outputDir, `${this.config.site}-results-${Date.now()}.json`);
    await fs.writeFile(filepath, JSON.stringify(results, null, 2));
    logger.info(`Resultados guardados en: ${filepath}`);
  }

  private async saveFailedDocuments(): Promise<void> {
    if (this.failedDocuments.length === 0) return;

    const outputDir = path.join(__dirname, '../../data/output');
    await fs.mkdir(outputDir, { recursive: true });

    const filepath = path.join(outputDir, `${this.config.site}-failed-${Date.now()}.json`);
    await fs.writeFile(filepath, JSON.stringify(this.failedDocuments, null, 2));
    logger.warn(`${this.failedDocuments.length} documentos fallaron. Detalle en: ${filepath}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default Scraper;
