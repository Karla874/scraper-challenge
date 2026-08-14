import axios, { AxiosError } from 'axios';
import * as https from 'https';

async function testOEFA() {
  console.log('🔍 Probando conexión a OEFA...');
  
  try {
    const response = await axios.get(
      'https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml',
      {
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
        timeout: 10000,
      }
    );
    
    console.log('✅ Conexión exitosa!');
    console.log('📊 Status:', response.status);
    console.log('📄 HTML length:', response.data.length);
    console.log('🍪 Cookies:', response.headers['set-cookie']);
    
    // Verificar si contiene la estructura esperada
    if (response.data.includes('consultaTfa')) {
      console.log('✅ Sitio OEFA accesible correctamente');
    } else {
      console.log('⚠️ El sitio responde pero la estructura es diferente');
    }
    
  } catch (error) {
    // ✅ Manejo correcto de error de tipo 'unknown'
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error('❌ Error de Axios:');
      console.error('   Status:', axiosError.response?.status);
      console.error('   Mensaje:', axiosError.message);
      if (axiosError.response?.data) {
        console.error('   Data:', axiosError.response.data);
      }
    } else if (error instanceof Error) {
      console.error('❌ Error:', error.message);
    } else {
      console.error('❌ Error desconocido:', error);
    }
  }
}

// Ejecutar la prueba
testOEFA();