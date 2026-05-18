/**
 * RNLogs SDK Phase 1 测试页面（含上报系统）
 */

import {useEffect, useState, useCallback} from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Pressable,
  ScrollView,
  Text,
} from 'react-native';
import {RNLogs, LogLevel} from './src';
import {Platform} from 'react-native';

type LogItem = {
  id: number;
  label: string;
  color: string;
  onPress: () => void;
};

const UPLOAD_ENDPOINT = 'http://192.168.5.67:8080/api/v1/logs';

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

function renderButtons(items: LogItem[]) {
  return chunk(items, 2).map((row, i) => (
    <View key={i} style={styles.buttonRow}>
      {row.map(a => (
        <View key={a.id} style={styles.buttonCell}>
          <ActionButton item={a} />
        </View>
      ))}
    </View>
  ));
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [logCount, setLogCount] = useState(0);
  const [offlineSize, setOfflineSize] = useState(0);

  const refreshOfflineSize = useCallback(async () => {
    const size = await RNLogs.getOfflineSize();
    setOfflineSize(size);
  }, []);

  useEffect(() => {
    RNLogs.init({
      enablePerformanceCollector: false, // 是否开启定时性能指标采集（默认 true）
      environment: 'development', // 运行环境，如 development / staging / production
      release: '1.0.0', // 应用版本号，用于日志归档和筛选
      device: {
        deviceId: `dev-${Platform.OS}`,
        platform: Platform.OS,
        osVersion: Platform.Version?.toString() ?? 'unknown',
      },
      maxBatchSize: 5, // 每批最大日志条数，达到即触发 flush
      flushIntervalMs: 3000, // 定时 flush 间隔（毫秒）
      tags: {platform: 'android', version: '1.0.0'}, // 全局标签，每条日志都会携带
      beforeSend: event => {
        // 日志发送前的拦截钩子，返回 null 则丢弃该条
        if (event.level === LogLevel.VERBOSE) {
          return null;
        }
        return event;
      },
      upload: {
        endpoint: UPLOAD_ENDPOINT, // 日志上报的服务端地址
        maxRetries: 2, // 上报失败后最大重试次数
        retryDelayMs: 1000, // 重试间隔（毫秒）
        batchSize: 5, // 单次上报的日志条数
      },
    });

    RNLogs.setUser({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    });

    RNLogs.addBreadcrumb('App launched', 'lifecycle');
    RNLogs.trackScreen('HomeScreen');
    RNLogs.log(LogLevel.INFO, 'App started', {foo: 'bar'});
    RNLogs.log(LogLevel.DEBUG, 'Debug info', {detail: 42});

    // 定时刷新离线队列大小
    const timer = setInterval(refreshOfflineSize, 3000);

    return () => {
      clearInterval(timer);
      RNLogs.destroy();
    };
  }, [refreshOfflineSize]);

  const bump = () => setLogCount(c => c + 1);

  const actions: LogItem[] = [
    {
      id: 1,
      label: '打手动日志',
      color: '#2563eb',
      onPress: () => {
        RNLogs.log(LogLevel.INFO, '手动点击日志', {button: 'manualLog'});
        RNLogs.trackAction('button_click', {buttonId: 'manualLog'});
        bump();
      },
    },
    {
      id: 2,
      label: '访问 undefined 属性',
      color: '#dc2626',
      onPress: () => {
        bump();
        setTimeout(() => {
          const obj: any = undefined;
          obj.someProperty.toString();
        }, 0);
      },
    },
    {
      id: 3,
      label: '调用 undefined 函数',
      color: '#dc2626',
      onPress: () => {
        bump();
        setTimeout(() => {
          const fn: any = undefined;
          fn();
        }, 0);
      },
    },
    {
      id: 4,
      label: 'JSON.parse 无效字符串',
      color: '#dc2626',
      onPress: () => {
        bump();
        setTimeout(() => {
          JSON.parse('not valid json {{');
        }, 0);
      },
    },
    {
      id: 5,
      label: '数组越界访问',
      color: '#dc2626',
      onPress: () => {
        bump();
        setTimeout(() => {
          const arr: number[] = [1, 2, 3];
          (arr as any)[10].toFixed(2);
        }, 0);
      },
    },
    {
      id: 6,
      label: '类型错误：null 调用方法',
      color: '#dc2626',
      onPress: () => {
        bump();
        setTimeout(() => {
          const data: any = null;
          data.split(',');
        }, 0);
      },
    },
    {
      id: 7,
      label: '触发异步异常',
      color: '#ea580c',
      onPress: () => {
        bump();
        setTimeout(() => {
          Promise.reject(new Error('异步 Promise 异常'));
        }, 0);
      },
    },
    {
      id: 8,
      label: '模拟网络 404 请求',
      color: '#7c3aed',
      onPress: async () => {
        try {
          await fetch('https://httpbin.org/status/404');
        } catch {
          // ignore
        }
        bump();
      },
    },
    {
      id: 9,
      label: '模拟网络超时',
      color: '#7c3aed',
      onPress: async () => {
        try {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 500);
          await fetch('https://httpbin.org/delay/10', {
            signal: ctrl.signal,
          });
        } catch {
          // ignore
        }
        bump();
      },
    },
    {
      id: 13,
      label: '正常请求并上报日志',
      color: '#7c3aed',
      onPress: async () => {
        const params = {
          requestId: `req-${Date.now()}`,
          action: 'fetch_user',
          userId: 'user-123',
        };
        const startTime = Date.now();
        try {
          const res = await fetch(
            `https://httpbin.org/get?userId=${params.userId}&action=${params.action}`,
          );
          const duration = Date.now() - startTime;
          const data = await res.json();
          RNLogs.log(LogLevel.INFO, '网络请求成功', {
            ...params,
            statusCode: res.status,
            durationMs: duration,
            responseUrl: data.url,
          });
        } catch (err) {
          RNLogs.log(LogLevel.ERROR, '网络请求失败', {
            ...params,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
        bump();
      },
    },
    {
      id: 10,
      label: '切换页面',
      color: '#059669',
      onPress: () => {
        const params = {
          from: 'HomeScreen',
          to: `DetailScreen_${Date.now()}`,
          tab: 'profile',
          userId: 'user-123',
        };
        RNLogs.trackScreen(params.to, params);
        RNLogs.log(LogLevel.INFO, '页面切换', params);
        bump();
      },
    },
    {
      id: 11,
      label: '添加面包屑',
      color: '#059669',
      onPress: () => {
        RNLogs.addBreadcrumb(`用户操作 #${logCount + 1}`, 'user_action', {
          index: logCount + 1,
        });
        bump();
      },
    },
    {
      id: 12,
      label: '立即 Flush',
      color: '#0891b2',
      onPress: () => {
        RNLogs.flush();
        refreshOfflineSize();
        bump();
      },
    },
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>RNLogs Phase 1</Text>
          <Text style={styles.subtitle}>JS 层功能验证 + 上报系统</Text>
        </View>

        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <Text style={styles.statusValue}>{logCount}</Text>
            <Text style={styles.statusLabel}>已触发操作</Text>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <Text style={styles.statusValue}>{offlineSize}</Text>
            <Text style={styles.statusLabel}>离线队列</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>手动日志</Text>
          {renderButtons([actions[0]])}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>JS 常见错误</Text>
          {renderButtons(actions.slice(1, 7))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>网络与异步</Text>
          {renderButtons(actions.slice(7, 10))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>操作与面包屑</Text>
          {renderButtons(actions.slice(10, 12))}
        </View>

        <View style={styles.section}>
          {renderButtons([actions[11]])}
        </View>

        <Text style={styles.endpoint}>上报接口: {UPLOAD_ENDPOINT}</Text>
      </ScrollView>
    </View>
  );
}

function ActionButton({item}: {item: LogItem}) {
  return (
    <Pressable
      style={({pressed}) => [
        styles.button,
        {backgroundColor: item.color},
        pressed && styles.buttonPressed,
      ]}
      onPress={item.onPress}>
      <Text style={styles.buttonText}>{item.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
  },
  statusValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  statusDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e2e8f0',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 10,
  },
  buttonCell: {
    flex: 1,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{scale: 0.98}],
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  endpoint: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 20,
  },
});

export default App;
