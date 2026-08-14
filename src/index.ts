import Scraper from './services/scraper';
import { config } from './config';
import logger from './utils/logger';

async function main() {
  try {
    logger.info('Iniciando scraper...');
    const scraper = new Scraper(config);
    const results = await scraper.scrape();
    
    logger.info('Scraping completado exitosamente');
    logger.info(`Resumen:`);
    logger.info(` Documentos extraidos: ${results.documents.length}`);
    logger.info(` Sitio: ${results.site}`);
    
  } catch (error) {
    logger.error(`Error en la ejecucin: ${error}`);
    process.exit(1);
  }
}

main();
