import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  install(endpoint: string, sessionId: string): boolean;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNLogsModule');
