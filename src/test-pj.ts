import axios, { AxiosError } from 'axios';
import * as https from 'https';

/**
 * Prueba de conectividad al sitio del Poder Judicial.
 * Se necesita VPN.
 */
async function testPJ() {
  console.log('🔍 Probando conexión a Poder Judicial (requiere VPN a Peru)...');

  try {
    const response = await axios.get(
      'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/resultado.xhtml',
      {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
        timeout: 10000,
      }
    );

    console.log('Conexión exitosa!');
    console.log('Status:', response.status);
    console.log('HTML length:', response.data.length);
    console.log('Cookies:', response.headers['set-cookie']);

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error('Error de Axios:');
      console.error('Status:', axiosError.response?.status);
      console.error('Mensaje:', axiosError.message);
      if (axiosError.response?.status === 403) {
        console.error('   -> Revisa que tu VPN a Peru este activa');
      }
    } else if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Error desconocido:', error);
    }
  }
}

testPJ();
