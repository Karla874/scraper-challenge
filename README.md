# Scraper Challenge

Scraper en TypeScript para extraer jurisprudencia y descargar los PDFs asociados,
con manejo de rate limiting (429) vía retry + backoff exponencial.

## Sitios soportados

- **OEFA** (sin VPN) - `SCRAPER_SITE=OEFA`
- **Poder Judicial** (requiere VPN a Perú) - `SCRAPER_SITE=PJ`

## Instalar dependencias

```bash
npm install
```

Nota: Requiere **Node.js 20+**.

## Ejecución

```bash
# Desarrollo con OEFA (sin VPN)
npm run dev

# Producción con PJ (con VPN)
npm run dev:pj

# Pruebas de conectividad
npm run test:oefa
npm run test:pj

# Sin VPN: valida la extracción de PJ contra un HTML real guardado
npm run test:pj:offline
# (usa por defecto test/fixtures/Prueba_Jurisprudencia_Nacional_Sistematizada.html;
# se puede pasar otra ruta como argumento: npx ts-node src/test-pj-offline.ts "ruta.html")
```

## Salidas

- `data/output/<SITIO>-results-<timestamp>.json` — listado de documentos extraídos.
- `data/output/<SITIO>-failed-<timestamp>.json` — documentos cuyo PDF falló tras agotar
  los reintentos. Sirve para poder reintentarlo después.
- `data/pdfs/<SITIO>/` — PDFs descargados, nombrados como `<id>_<titulo>.pdf`.

## Manejo de errores 429 / 403

`HttpClient.retryableRequest()` reintenta automáticamente con backoff exponencial
(`retryDelay * 2^intento`, hasta `maxRetries`) ante 429, 403 y errores de red/timeout.
Se usa tanto para las páginas de listado como para cada descarga de PDF. Si un PDF
sigue fallando después de todos los reintentos, el scraper continúa con el siguiente
documento y registra el fallo en `data/output/<SITIO>-failed-*.json`.
