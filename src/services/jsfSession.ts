import {
  extractHiddenFieldsAnywhere,
  extractViewStateFromPartial,
  extractPartialResponseHtml,
  isPartialResponse,
} from './jsfHelper';

/**
 * Los sitios JSF invalidan el ViewState si se reenvía uno viejo, y cada
 * respuesta (sea página completa o partial-response AJAX) puede traer uno
 * nuevo. Esta clase concentra ese estado para que scraper.ts no tenga que
 * repetir la lógica de "¿de dónde saco el ViewState esta vez?" en cada método.
 */
export class JsfSession {
  private fields: Record<string, string> = {};

  /** Actualiza el estado interno a partir de una respuesta cruda del servidor. */
  update(responseBody: string, contentType?: string | null): void {
    if (isPartialResponse(contentType, responseBody)) {
      const viewState = extractViewStateFromPartial(responseBody);
      if (viewState) this.fields['javax.faces.ViewState'] = viewState;

      // Otros hidden inputs (ej. dt_scrollState) también pueden venir dentro
      // de los bloques <update>, así que los buscamos sobre el HTML ya extraído.
      const html = extractPartialResponseHtml(responseBody);
      Object.assign(this.fields, extractHiddenFieldsAnywhere(html));
    } else {
      Object.assign(this.fields, extractHiddenFieldsAnywhere(responseBody));
    }
  }

  /** HTML "usable" de la última respuesta (ya desempaquetado si era partial-response). */
  static toUsableHtml(responseBody: string, contentType?: string | null): string {
    return isPartialResponse(contentType, responseBody)
      ? extractPartialResponseHtml(responseBody)
      : responseBody;
  }

  /** Arma el body x-www-form-urlencoded para el próximo POST. */
  buildBody(overrides: Record<string, string>): string {
    const merged = { ...this.fields, ...overrides };
    return Object.entries(merged)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }

  getFields(): Readonly<Record<string, string>> {
    return { ...this.fields };
  }
}

export default JsfSession;
