import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { extractPjDocuments } from './services/pjParser';
import { sites } from './config';
import { Document } from './types';

const DEFAULT_FIXTURE = 'test/fixtures/Prueba_Jurisprudencia_Nacional_Sistematizada.html';
const PJ_BASE = sites.PJ.baseUrl;

// Para testear: npm run test:pj:offline
function validatePdfUrls(documents: Document[]): string[] {
  const issues: string[] = [];
  const seenUuids = new Map<string, number>();

  documents.forEach((d, i) => {
    if (!d.pdfUrl) {
      issues.push(`#${i + 1}: sin pdfUrl`);
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(d.pdfUrl);
    } catch {
      issues.push(`#${i + 1}: URL inválida -> ${d.pdfUrl}`);
      return;
    }

    if (parsed.protocol !== 'https:') issues.push(`#${i + 1}: protocolo no HTTPS -> ${d.pdfUrl}`);
    if (!parsed.hostname.endsWith('pj.gob.pe')) issues.push(`#${i + 1}: dominio inesperado -> ${parsed.hostname}`);
    if (!parsed.pathname.includes('ServletDescarga')) issues.push(`#${i + 1}: path sin ServletDescarga -> ${parsed.pathname}`);

    const uuid = parsed.searchParams.get('uuid');
    if (!uuid) {
      issues.push(`#${i + 1}: falta el parámetro uuid -> ${d.pdfUrl}`);
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(uuid)) issues.push(`#${i + 1}: uuid con formato raro -> ${uuid}`);
      const prev = seenUuids.get(uuid);
      if (prev !== undefined) issues.push(`#${i + 1}: uuid duplicado (también en #${prev}) -> ${uuid}`);
      else seenUuids.set(uuid, i + 1);
    }
  });

  return issues;
}

async function main() {
  const fixturePath = process.argv[2] || DEFAULT_FIXTURE;
  const abs = path.resolve(process.cwd(), fixturePath);

  if (!fs.existsSync(abs)) {
    console.error(`❌ No existe el fixture: ${abs}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(abs, 'utf-8');
  console.log(`Fixture cargado: ${abs} (${raw.length} bytes)`);

  const $ = cheerio.load(raw);
  const { documents, rowCount } = extractPjDocuments($, PJ_BASE);

  console.log(`\n Filas encontradas: ${rowCount}`);
  console.log(`Documentos extraídos: ${documents.length}\n`);

  documents.forEach((d, i) => {
    console.log(`#${i + 1}`);
    console.log(` Expediente : ${d.id}`);
    console.log(` Recurso    : ${d.title}`);
    console.log(` Sala       : ${d.court}`);
    console.log(` Fecha      : ${d.date}`);
    console.log(` Pretensión : ${d.category}`);
    console.log(` Sumilla    : ${d.summary.slice(0, 120)}${d.summary.length > 120 ? '...' : ''}`);
    console.log(` PDF        : ${d.pdfUrl}`);
    console.log('');
  });

  const issues: string[] = [];
  if (rowCount === 0) issues.push('No se encontraron filas (selector div.rf-p[id*=":repeat:"] no coincide)');
  if (rowCount !== 10) issues.push(`Se esperaban 10 filas, se obtuvieron ${rowCount}`);
  if (documents.length !== rowCount) issues.push('Cantidad de documentos distinta a las filas');

  const sinPdf = documents.filter(d => !d.pdfUrl).length;
  if (sinPdf > 0) issues.push(`${sinPdf} documento(s) sin link ServletDescarga`);

  const conIdInvalido = documents.filter(d => d.id.startsWith('DOC-')).length;
  if (conIdInvalido > 0) issues.push(`${conIdInvalido} documento(s) sin número de expediente`);

  issues.push(...validatePdfUrls(documents));

  if (issues.length > 0) {
    console.log('❌ Problemas detectados:');
    issues.forEach(i => console.log(`  - ${i}`));
    process.exit(1);
  }

  console.log('La extracción y las URLs de descarga son correctas en este HTML.');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
