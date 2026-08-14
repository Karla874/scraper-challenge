import type { Cheerio, CheerioAPI } from 'cheerio';
import logger from '../utils/logger';
import { Document } from '../types';

/**
 * Extracción de los resultados del Poder Judicial (RichFaces): cada resultado
 * es un <div class="rf-p" id*=":repeat:"> con un header (tipo de recurso +
 * nro de expediente) y un cuerpo con campos rotulados (Pretensión/Delito,
 * Tipo Resolución, Fecha Resolución, Sala Suprema, Norma de Derecho Interno,
 * Sumilla, Palabras Clave). El PDF es un link directo a un servlet.
 *
 * Es una función pura (sin red ni estado) a propósito, para poder validarla
 * contra un fixture HTML guardado sin necesidad de VPN (ver test:pj:offline).
 */
export function extractPjDocuments($: CheerioAPI, baseUrl: string): {
  documents: Document[];
  rowCount: number;
} {
  const documents: Document[] = [];
  const rows = $('div.rf-p[id*=":repeat:"]');
  logger.info(`Encontradas ${rows.length} filas`);

  rows.each((index: number, element: any) => {
    const row = $(element);

    const headerCells = row.find('.rf-p-hdr td');
    const tipoRecurso = $(headerCells[1]).text().trim();
    const nroExpediente = $(headerCells[2]).text().trim();

    const pretension = getLabeledValue($, row, 'Pretensión/Delito');
    const tipoResolucion = getLabeledValue($, row, 'Tipo Resolución');
    const fechaResolucion = getLabeledValue($, row, 'Fecha Resolución');
    const sala = getLabeledValue($, row, 'Sala Suprema');
    const normaDI = getLabeledValue($, row, 'Norma de Derecho Interno');
    const sumilla = getLabeledValue($, row, 'Sumilla');
    const palabrasClave = getLabeledValue($, row, 'Palabras Clave');

    const link = row.find('a[href*="ServletDescarga"]');
    const href = link.attr('href');
    const pdfUrl = href ? (href.startsWith('http') ? href : `${baseUrl}${href}`) : '';

    documents.push({
      id: nroExpediente || `DOC-${index + 1}`,
      title: tipoRecurso || 'Sin titulo',
      court: sala || 'PJ',
      date: fechaResolucion || 'No especificada',
      summary: sumilla,
      category: pretension,
      pdfUrl,
      raw: { tipoRecurso, nroExpediente, pretension, tipoResolucion, fechaResolucion, sala, normaDI, sumilla, palabrasClave },
    });
  });

  return { documents, rowCount: rows.length };
}

/** Busca un div.txtbold cuyo texto empiece con `label` y devuelve el texto de su siguiente hermano. */
function getLabeledValue($: CheerioAPI, container: Cheerio<any>, label: string): string {
  let value = '';
  container.find('.txtbold').each((_: number, el: any) => {
    if ($(el).text().trim().startsWith(label)) {
      value = $(el).next().text().trim();
    }
  });
  return value;
}