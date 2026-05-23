export interface UploadConfig {
  endpoint: string;
  apiKey?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  batchSize?: number;
  compress?: boolean;
  headers?: Record<string, string>;
}

export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  endpoint: '',
  maxRetries: 3,
  retryDelayMs: 1000,
  batchSize: 50,
  compress: false,
};
