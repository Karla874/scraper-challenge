# Scraper Challenge

Scraper en TypeScript (sin automatización de navegador) para extraer jurisprudencia
y descargar los PDFs asociados, con manejo de rate limiting (429) vía retry + backoff
exponencial.

## Sitios soportados

- **OEFA** (sin VPN) - `SCRAPER_SITE=OEFA`
- **Poder Judicial** (requiere VPN a Perú) - `SCRAPER_SITE=PJ`

Ambos sitios son aplicaciones **JSF/PrimeFaces** (`.xhtml`): la página inicial
solo trae el formulario de búsqueda vacío; los resultados se obtienen enviando
un POST con el token `javax.faces.ViewState` del formulario. Ver más abajo
cómo confirmar los nombres exactos de los campos.

## Instalar dependencias

```bash
npm install
```

Requiere **Node.js 20+** (las dependencias actuales, ej. `cheerio` 1.2, no
funcionan en Node 16). En Windows, si los binarios de `node_modules/.bin`
quedaron vacíos (p. ej. al copiar la carpeta desde WSL), elimina `node_modules`
y `package-lock.json` y vuelve a ejecutar `npm install`.

## ⚠️ Antes de correr contra el sitio real: confirmar campos JSF

Los campos de **OEFA** ya están confirmados y el sitio funciona sin ajustes
(`npm run dev`). Para **PJ** sigue siendo necesario confirmarlos con VPN;
`src/config/index.ts` tiene los valores reales de OEFA y los de PJ ya
verificados contra `inicio.xhtml`/`resultado.xhtml`, pero conviene
reconfirmarlos si PJ cambia:

1. Abre el sitio en el navegador con **DevTools > Network** abierto (filtro: Fetch/XHR).
2. Llena el formulario y haz click en **"Buscar"**.
3. En la request que aparece, revisa la pestaña **Payload/Form Data**:
   - Busca el campo cuyo nombre termina en algo como `btnBuscar` o similar → es `searchButtonField`.
   - Copia el `name` del `<form>` (o el prefijo común de todos los campos, ej. `formConsulta:...`) → es `formSelector`/prefijo.
4. Si hay más de una página de resultados, haz click en "página siguiente" y repite el paso 3
   para identificar `paginationSourceField` (el `id` del data-table, generalmente termina en
   `_pagination`, `_first`, `_rows` en los parámetros del POST).
5. Reemplaza los `TODO:` en `src/config/index.ts` con los valores reales.
6. Verifica también los selectores CSS de `selectors.OEFA`/`selectors.PJ` contra
   una fila real de la tabla de resultados (botón derecho > Inspeccionar sobre la fila).

Sin este paso, el scraper solo va a traer el formulario vacío (0 resultados).

## Ejecución

```bash
# Desarrollo con OEFA (sin VPN)
npm run dev

# Producción con PJ (con VPN)
npm run dev:pj

# Para ejecutar una vez (sin watch)
npm run start          # OEFA
npm run start:pj       # PJ

# Pruebas rápidas de conectividad
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
  los reintentos (para poder reintentarlos después).
- `data/pdfs/<SITIO>/` — PDFs descargados, nombrados como `<id>_<titulo>.pdf`.

## Manejo de errores 429 / 403

`HttpClient.retryableRequest()` reintenta automáticamente con backoff exponencial
(`retryDelay * 2^intento`, hasta `maxRetries`) ante 429, 403 y errores de red/timeout.
Se usa tanto para las páginas de listado como para cada descarga de PDF. Si un PDF
sigue fallando después de todos los reintentos, el scraper continúa con el siguiente
documento y registra el fallo en `data/output/<SITIO>-failed-*.json`.

## Estructura del proyecto

```
src/
  config/       # Configuración por sitio (URLs, selectores, campos JSF)
  services/
    httpClient.ts    # Cliente HTTP con manejo de cookies, headers y retry/backoff
    jsfHelper.ts      # Utilidades para formularios JSF (ViewState, partial-response)
    pdfDownloader.ts  # Descarga de PDFs con reintentos
    scraper.ts        # Orquestación: búsqueda, paginación, extracción, descarga
  types/        # Interfaces TypeScript
  utils/        # Logger
```

## Limitaciones conocidas

- Los selectores CSS y campos JSF son un punto de partida; deben confirmarse
  contra el sitio real (ver sección de arriba).
- `rejectUnauthorized: false` está activo en el agente HTTPS por posibles
  problemas de certificado en los sitios gubernamentales; si no es necesario,
  se recomienda quitarlo.
