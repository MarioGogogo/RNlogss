/**
 * RNLogs SDK 测试页面（支持 Phase 1 & Phase 2）
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
  Platform,
} from 'react-native';
import {RNLogs, LogLevel} from './src';

type LogItem = {
  id: number;
  label: string;
  color: string;
  onPress: () => void;
};

const UPLOAD_ENDPOINT = 'http://172.20.10.3:8080/api/v1/logs';

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
  const [activeTab, setActiveTab] = useState<'phase1' | 'phase2'>('phase1');
  const [logCount, setLogCount] = useState(0);
  const [offlineSize, setOfflineSize] = useState(0);

  // Phase 2 State
  const [jsiAvailable, setJsiAvailable] = useState(false);
  const [cppQueueSize, setCppQueueSize] = useState(0);
  const [perfTime, setPerfTime] = useState<number | null>(null);
  const [lastLogWritten, setLastLogWritten] = useState<string>('');

  const refreshOfflineSize = useCallback(async () => {
    const size = await RNLogs.getOfflineSize();
    setOfflineSize(size);
  }, []);

  const refreshCppQueueSize = useCallback(() => {
    if (global.__rnlogsInternal) {
      setCppQueueSize(global.__rnlogsInternal.getQueueSize());
      setJsiAvailable(true);
    } else {
      setJsiAvailable(false);
    }
  }, []);

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

    RNLogs.setUser({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    });

    RNLogs.log(LogLevel.INFO, 'App初始化加载', {foo: 'bar'});

    const timer = setInterval(() => {
      refreshOfflineSize();
      refreshCppQueueSize();
    }, 1000);

    return () => {
      clearInterval(timer);
      RNLogs.destroy();
    };
  }, [refreshOfflineSize, refreshCppQueueSize]);

  const bump = () => setLogCount(c => c + 1);

  // Phase 1 Actions
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
        RNLogs.log(LogLevel.DEBUG, '调试信息', {detail: 42});
        setTimeout(() => {
          Promise.reject(new Error('触发异步异常,错误信息'));
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

  // Phase 2 JSI Actions
  const writeJsiSingleLog = () => {
    if (!global.__rnlogsInternal) {
      alert('JSI 接口未安装');
      return;
    }
    const logMsg = `JSI 手动单条日志: ${Date.now()}`;
    const event = {
      level: 'INFO',
      message: logMsg,
      timestamp: Date.now(),
      tag: 'jsi_manual',
    };
    const str = JSON.stringify(event);
    global.__rnlogsInternal.writeLog(str);
    setLastLogWritten(str);
    refreshCppQueueSize();
  };

  const writeJsiLogBatch = () => {
    if (!global.__rnlogsInternal) {
      alert('JSI 接口未安装');
      return;
    }
    const batchData = [
      {level: 'DEBUG', message: `Batch log 1 at ${Date.now()}`, timestamp: Date.now()},
      {level: 'INFO', message: `Batch log 2 at ${Date.now()}`, timestamp: Date.now()},
      {level: 'WARN', message: `Batch log 3 at ${Date.now()}`, timestamp: Date.now()},
    ];
    const str = JSON.stringify(batchData);
    global.__rnlogsInternal.writeLogBatch(str);
    setLastLogWritten(str);
    refreshCppQueueSize();
  };

  const runJsiPerformanceTest = () => {
    if (!global.__rnlogsInternal) {
      alert('JSI 接口未安装');
      return;
    }
    const startTime = Date.now();
    const count = 500;
    for (let i = 0; i < count; i++) {
      global.__rnlogsInternal.writeLog(
        JSON.stringify({
          level: 'DEBUG',
          message: `Performance test log #${i}`,
          timestamp: Date.now(),
        }),
      );
    }
    const duration = Date.now() - startTime;
    setPerfTime(duration);
    refreshCppQueueSize();
  };

  const clearJsiQueue = () => {
    if (!global.__rnlogsInternal) {
      alert('JSI 接口未安装');
      return;
    }
    global.__rnlogsInternal.flush();
    setLastLogWritten('');
    setPerfTime(null);
    refreshCppQueueSize();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      
      {/* 头部 Tab 导航栏 */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabItem, activeTab === 'phase1' && styles.tabActive]}
          onPress={() => setActiveTab('phase1')}>
          <Text style={[styles.tabText, activeTab === 'phase1' && styles.tabActiveText]}>
            Phase 1 (JS MVP)
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabItem, activeTab === 'phase2' && styles.tabActive]}
          onPress={() => setActiveTab('phase2')}>
          <Text style={[styles.tabText, activeTab === 'phase2' && styles.tabActiveText]}>
            Phase 2 (JSI C++)
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {activeTab === 'phase1' ? (
          /* =================== Tab 1: Phase 1 =================== */
          <View>
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
              {renderButtons([actions[12]])}
            </View>

            <Text style={styles.endpoint}>上报接口: {UPLOAD_ENDPOINT}</Text>
          </View>
        ) : (
          /* =================== Tab 2: Phase 2 =================== */
          <View>
            <View style={styles.header}>
              <Text style={styles.title}>RNLogs Phase 2</Text>
              <Text style={styles.subtitle}>JSI 高性能通信通道验证（JS → C++）</Text>
            </View>

            {/* JSI & C++ 状态面板 */}
            <View style={styles.jsiDashboard}>
              <View style={styles.jsiRow}>
                <Text style={styles.jsiLabel}>JSI 注入状态:</Text>
                <Text style={[styles.jsiValue, jsiAvailable ? styles.statusSuccess : styles.statusFail]}>
                  {jsiAvailable ? '已注入 (Available)' : '未挂载 (Unavailable)'}
                </Text>
              </View>
              <View style={styles.jsiRow}>
                <Text style={styles.jsiLabel}>C++ 内存队列长度:</Text>
                <Text style={styles.jsiHighlight}>{cppQueueSize} 条</Text>
              </View>
              {perfTime !== null && (
                <View style={styles.jsiRow}>
                  <Text style={styles.jsiLabel}>500条压测耗时:</Text>
                  <Text style={styles.jsiHighlightSuccess}>{perfTime} ms</Text>
                </View>
              )}
            </View>

            {/* C++ JSI 测试操作区 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>JSI 同步交互接口</Text>
              
              <View style={styles.buttonRow}>
                <View style={styles.buttonCell}>
                  <Pressable style={[styles.button, {backgroundColor: '#2563eb'}]} onPress={writeJsiSingleLog}>
                    <Text style={styles.buttonText}>单条同步写入 C++</Text>
                  </Pressable>
                </View>
                <View style={styles.buttonCell}>
                  <Pressable style={[styles.button, {backgroundColor: '#7c3aed'}]} onPress={writeJsiLogBatch}>
                    <Text style={styles.buttonText}>批量同步写入 C++</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.buttonRow}>
                <View style={styles.buttonCell}>
                  <Pressable style={[styles.button, {backgroundColor: '#ea580c'}]} onPress={runJsiPerformanceTest}>
                    <Text style={styles.buttonText}>500 条高频压测</Text>
                  </Pressable>
                </View>
                <View style={styles.buttonCell}>
                  <Pressable style={[styles.button, {backgroundColor: '#64748b'}]} onPress={clearJsiQueue}>
                    <Text style={styles.buttonText}>清空 C++ 内存队列</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* 最近写入的内容监控 */}
            {lastLogWritten ? (
              <View style={styles.monitorSection}>
                <Text style={styles.monitorTitle}>最近发送的日志报文 (JS 侧展示):</Text>
                <Text style={styles.monitorContent} numberOfLines={6}>
                  {lastLogWritten}
                </Text>
              </View>
            ) : null}

            <View style={[styles.section, {marginTop: 20}]}>
              <Text style={[styles.sectionTitle, {textAlign: 'center'}]}>
                C++ 层直接托管于 LogQueue 内存 RingBuffer
              </Text>
            </View>
          </View>
        )}
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
  container: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
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
  jsiDashboard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  jsiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  jsiLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  jsiValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  jsiHighlight: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '800',
  },
  jsiHighlightSuccess: {
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '800',
  },
  statusSuccess: {
    color: '#4ade80',
  },
  statusFail: {
    color: '#f87171',
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
    paddingHorizontal: 12,
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
    fontSize: 14,
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
  monitorSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  monitorTitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 6,
  },
  monitorContent: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 12,
    color: '#334155',
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 8,
  },
});

export default App;
