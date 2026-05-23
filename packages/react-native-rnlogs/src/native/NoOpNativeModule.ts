import type {NativeModule} from '../types';

export const NoOpNativeModule: NativeModule = {
  async init(): Promise<void> {
    // Phase 1: no-op
  },
  async sendBatch(): Promise<void> {
    // Phase 1: no-op
  },
  async setUser(): Promise<void> {
    // Phase 1: no-op
  },
  async flush(): Promise<void> {
    // Phase 1: no-op
  },
};
