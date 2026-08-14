import fs from 'fs/promises';
import path from 'path';
import HttpClient from './httpClient';
import JsfSession from './jsfSession';
import logger from '../utils/logger';
import { Document } from '../types';

export interface DownloadResult {
  documentId: string;
  success: boolean;
  filePath?: string;
  error?: string;
}

export class PdfDownloader {
  constructor(
    private httpClient: HttpClient,
    private outputDir: string
  ) {}

  private sanitizeFilename(name: string): string {
    return name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 120) || 'documento';
  }

  private async saveBuffer(doc: Document, data: Buffer): Promise<DownloadResult> {
    await fs.mkdir(this.outputDir, { recursive: true });
    const filename = `${this.sanitizeFilename(doc.id)}_${this.sanitizeFilename(doc.title)}.pdf`;
    const filePath = path.join(this.outputDir, filename);

    // Sanity check: si el servidor devolvió HTML/XML en vez de un PDF (ej. sesión
    // vencida o ViewState inválido), lo detectamos por la firma %PDF- al inicio.
    const looksLikePdf = data.slice(0, 5).toString('ascii') === '%PDF-';
    if (!looksLikePdf) {
      const preview = data.slice(0, 200).toString('utf-8');
      throw new Error(`La respuesta no parece un PDF (¿ViewState vencido o sesión expirada?): ${preview.slice(0, 120)}`);
    }

    await fs.writeFile(filePath, data);
    logger.info(`PDF descargado: ${filename}`);
    return { documentId: doc.id, success: true, filePath };
  }

  /**
   * Descarga un documento. Soporta dos mecanismos:
   * 1. pdfUrl directa (GET simple) — si el sitio expone un link real al PDF.
   * 2. downloadAction (POST postback JSF, caso OEFA) — requiere la sesión JSF
   *    vigente (con el ViewState de la página donde está ese link) y la URL
   *    del formulario al que hay que volver a postear.
   */
  async downloadOne(doc: Document, session?: JsfSession, postUrl?: string): Promise<DownloadResult> {
    try {
      if (doc.downloadAction && session && postUrl) {
        const { componentField, paramUuid } = doc.downloadAction;
        const body = session.buildBody({
          [componentField]: componentField,
          param_uuid: paramUuid,
        });

        const response = await this.httpClient.retryableRequest(async () => {
          return this.httpClient.post(postUrl, body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            responseType: 'arraybuffer',
          });
        });

        return await this.saveBuffer(doc, Buffer.from(response.data));
      }

      if (doc.pdfUrl) {
        const response = await this.httpClient.retryableRequest(async () => {
          return this.httpClient.get(doc.pdfUrl, { responseType: 'arraybuffer' });
        });
        return await this.saveBuffer(doc, Buffer.from(response.data));
      }

      logger.warn(`Documento "${doc.id}" no tiene pdfUrl ni downloadAction, se omite`);
      return { documentId: doc.id, success: false, error: 'Sin metodo de descarga disponible' };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`No se pudo descargar el PDF de "${doc.id}" tras los reintentos: ${message}`);
      return { documentId: doc.id, success: false, error: message };
    }
  }

  /**
   * Descarga en serie (no en paralelo) con una pausa entre cada PDF, tanto
   * para no saturar el servidor como para reducir la probabilidad de 429.
   * IMPORTANTE: session/postUrl deben corresponder a la página donde esos
   * documentos fueron listados (el ViewState de esa página, no uno más nuevo).
   */
  async downloadAll(
    docs: Document[],
    delayMs: number,
    session?: JsfSession,
    postUrl?: string
  ): Promise<DownloadResult[]> {
    const results: DownloadResult[] = [];
    for (const doc of docs) {
      results.push(await this.downloadOne(doc, session, postUrl));
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return results;
  }
}

export default PdfDownloader;
