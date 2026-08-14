import * as cheerio from 'cheerio';

/**
 * Extrae todos los bloques <update id="..."> ... </update> de un
 * partial-response de JSF/PrimeFaces (AJAX). Soporta tanto contenido
 * envuelto en <![CDATA[ ]]> como texto plano (algunos servidores, como
 * OEFA, no usan CDATA).
 */
export function extractPartialResponseUpdates(xml: string): Record<string, string> {
  const updateRegex = /<update id="([^"]*)">([\s\S]*?)<\/update>/g;
  const result: Record<string, string> = {};
  let match: RegExpExecArray | null;

  while ((match = updateRegex.exec(xml)) !== null) {
    let content = match[2];
    const cdataMatch = content.match(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/);
    if (cdataMatch) content = cdataMatch[1];
    result[match[1]] = content;
  }

  return result;
}

/** Concatena el HTML de todos los <update> para poder parsearlo con cheerio. */
export function extractPartialResponseHtml(xml: string): string {
  const updates = extractPartialResponseUpdates(xml);
  return Object.values(updates).join('\n');
}

/**
 * El ViewState en una respuesta AJAX viene en su propio <update> (id que
 * contiene "javax.faces.ViewState"), como texto plano, NO dentro de un <input>.
 */
export function extractViewStateFromPartial(xml: string): string | undefined {
  const updates = extractPartialResponseUpdates(xml);
  for (const [id, content] of Object.entries(updates)) {
    if (id.includes('ViewState')) return content.trim();
  }
  return undefined;
}

/**
 * true si la respuesta es un partial-response XML de JSF/PrimeFaces (AJAX).
 * OJO: no basta con que el body empiece en "<?xml" (muchas páginas XHTML
 * completas empiezan así); un partial-response real SIEMPRE contiene el
 * elemento raíz <partial-response>. Basarse solo en el content-type o en el
 * prefijo "<?xml" hace que una página completa se confunda con un fragmento
 * AJAX y se pierda el ViewState (bug "0 filas").
 */
export function isPartialResponse(contentType: string | null | undefined, body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  return /<partial-response(\s|>)/.test(trimmed);
}

/**
 * Busca TODOS los <input type="hidden"> presentes en el HTML/fragmento dado,
 * sin exigir que estén dentro de un <form> (en una respuesta parcial de AJAX
 * el fragmento no incluye el <form> que lo envuelve en el navegador real).
 */
export function extractHiddenFieldsAnywhere(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const fields: Record<string, string> = {};

  $('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr('name');
    const value = $(el).attr('value') ?? '';
    if (name) fields[name] = value;
  });

  return fields;
}

/**
 * Extrae del atributo onclick de un link tipo:
 *   onclick="mojarra.jsfcljs(document.getElementById('form'), {'a':'a','param_uuid':'xxx'}, '')"
 * los pares clave/valor que hay que agregar al formulario antes de enviarlo,
 * tal como hace mojarra.jsfcljs en el navegador (crea/actualiza esos hidden
 * inputs y hace un submit normal del formulario).
 */
export function extractJsfCljsParams(onclick: string | undefined | null): Record<string, string> | null {
  if (!onclick) return null;
  const call = onclick.match(/mojarra\.jsfcljs\([^,]+,\s*\{([^}]*)\}/);
  if (!call) return null;

  const pairs = [...call[1].matchAll(/'([^']+)'\s*:\s*'([^']*)'/g)];
  if (pairs.length === 0) return null;

  const result: Record<string, string> = {};
  for (const [, key, value] of pairs) {
    result[key] = value;
  }
  return result;
}
