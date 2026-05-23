/**
 * RNLogs SDK 测试 App — Tab 导航壳
 */

import {useEffect, useState} from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Pressable,
  Text,
  Platform,
} from 'react-native';
import {RNLogs, LogLevel} from './src';
import {UPLOAD_ENDPOINT} from './screens/shared';
import Phase1Screen from './screens/Phase1Screen';
import Phase2Screen from './screens/Phase2Screen';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [activeTab, setActiveTab] = useState<'phase1' | 'phase2'>('phase1');

  useEffect(() => {
    RNLogs.init({
      enablePerformanceCollector: false,
      environment: 'development',
      release: '1.0.0',
      device: {
        deviceId: `dev-${Platform.OS}`,
        platform: Platform.OS,
        osVersion: Platform.Version?.toString() ?? 'unknown',
      },
      maxBatchSize: 5,
      flushIntervalMs: 3000,
      tags: {platform: 'android', version: '1.0.0'},
      beforeSend: event => {
        if (event.level === LogLevel.VERBOSE) {
          return null;
        }
        return event;
      },
      upload: {
        endpoint: UPLOAD_ENDPOINT,
        maxRetries: 2,
        retryDelayMs: 1000,
        batchSize: 5,
      },
    });

    return () => {
      RNLogs.destroy();
    };
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabItem, activeTab === 'phase1' && styles.tabActive]}
          onPress={() => setActiveTab('phase1')}>
          <Text
            style={[
              styles.tabText,
              activeTab === 'phase1' && styles.tabActiveText,
            ]}>
            Phase 1 (JS MVP)
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabItem, activeTab === 'phase2' && styles.tabActive]}
          onPress={() => setActiveTab('phase2')}>
          <Text
            style={[
              styles.tabText,
              activeTab === 'phase2' && styles.tabActiveText,
            ]}>
            Phase 2 (JSI C++)
          </Text>
        </Pressable>
      </View>

      {activeTab === 'phase1' ? <Phase1Screen /> : <Phase2Screen />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 44 : 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  tabActiveText: {
    color: '#2563eb',
  },
});

export default App;
