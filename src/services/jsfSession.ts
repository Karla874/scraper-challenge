import {
  extractHiddenFieldsAnywhere,
  extractViewStateFromPartial,
  extractPartialResponseHtml,
  isPartialResponse,
} from './jsfHelper';

export class JsfSession {
  private fields: Record<string, string> = {};

  // Actualiza el estado interno a partir de una respuesta cruda del servidor.
  update(responseBody: string, contentType?: string | null): void {
    if (isPartialResponse(contentType, responseBody)) {
      const viewState = extractViewStateFromPartial(responseBody);
      if (viewState) this.fields['javax.faces.ViewState'] = viewState;
      
      const html = extractPartialResponseHtml(responseBody);
      Object.assign(this.fields, extractHiddenFieldsAnywhere(html));
    } else {
      Object.assign(this.fields, extractHiddenFieldsAnywhere(responseBody));
    }
  }

  // HTML de la última respuesta.
  static toUsableHtml(responseBody: string, contentType?: string | null): string {
    return isPartialResponse(contentType, responseBody)
      ? extractPartialResponseHtml(responseBody)
      : responseBody;
  }

  // Body x-www-form-urlencoded para el próximo POST.
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
