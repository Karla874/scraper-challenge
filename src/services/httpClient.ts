import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import logger from '../utils/logger';
import { ScraperConfig } from '../types';
import * as https from 'https';

export class HttpClient {
  private client: AxiosInstance;
  private config: ScraperConfig;
  private cookies: string = '';

  constructor(config: ScraperConfig) {
    this.config = config;
    this.client = axios.create({
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      withCredentials: true,
    });

    // Configurar headers de forma simple
    this.client.defaults.headers.common['User-Agent'] = config.userAgent;
    this.client.defaults.headers.common['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    this.client.defaults.headers.common['Accept-Language'] = 'es-ES,es;q=0.9,en;q=0.8';
    this.client.defaults.headers.common['Accept-Encoding'] = 'gzip, deflate, br';
    this.client.defaults.headers.common['Connection'] = 'keep-alive';
    this.client.defaults.headers.common['Cache-Control'] = 'no-cache';
    this.client.defaults.headers.common['Pragma'] = 'no-cache';
    this.client.defaults.headers.common['Upgrade-Insecure-Requests'] = '1';

    if (config.site === 'PJ') {
      this.client.defaults.headers.common['Referer'] = 'https://jurisprudencia.pj.gob.pe/';
      this.client.defaults.headers.common['Origin'] = 'https://jurisprudencia.pj.gob.pe';
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        if (this.cookies) {
          config.headers['Cookie'] = this.cookies;
        }
        logger.debug(`Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        const setCookie = response.headers['set-cookie'];
        if (setCookie) {
          this.cookies = setCookie.join('; ');
        }
        logger.debug(`Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        if (axios.isAxiosError(error)) {
          logger.error(`Error ${error.response?.status}: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  async get(url: string, config?: AxiosRequestConfig) {
    try {
      const response = await this.client.get(url, config);
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async post(url: string, data?: any, config?: AxiosRequestConfig) {
    try {
      const response = await this.client.post(url, data, config);
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 'Unknown';
      
      if (status === 403) {
        const message = this.config.site === 'PJ' 
          ? 'HTTP 403: Acceso denegado. Asegurate de tener VPN activa para Peru'
          : 'HTTP 403: El sitio OEFA esta bloqueando el acceso';
        return new Error(message);
      }
      
      if (status === 429) {
        return new Error(`Rate limit exceeded (429): ${error.message}`);
      }
      
      return new Error(`HTTP ${status}: ${error.message}`);
    }
    return new Error(`Unknown error: ${error}`);
  }

  async retryableRequest<T>(
    requestFn: () => Promise<T>,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      const shouldRetry = 
        errorMessage.includes('429') || 
        errorMessage.includes('403') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ECONNREFUSED');

      if (shouldRetry && retryCount < this.config.maxRetries) {
        const delay = this.config.retryDelay * Math.pow(2, retryCount);
        logger.warn(`Error detectado, reintentando en ${delay}ms (intento ${retryCount + 1}/${this.config.maxRetries})`);
        await this.delay(delay);
        return this.retryableRequest(requestFn, retryCount + 1);
      }
      
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default HttpClient;