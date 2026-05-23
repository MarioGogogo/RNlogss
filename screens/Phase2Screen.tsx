/**
 * Phase 2 页面 — JSI 高性能通信通道验证（JS → C++）
 */

import {useEffect, useState, useCallback} from 'react';
import {ScrollView, View, Text} from 'react-native';
import {RNLogs} from '../src';
import {
  sharedStyles,
  UPLOAD_ENDPOINT,
  renderButtons,
  type LogItem,
} from './shared';

const genId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

function Phase2Screen() {
  const [jsiAvailable, setJsiAvailable] = useState(false);
  const [cppQueueSize, setCppQueueSize] = useState(0);
  const [perfTime, setPerfTime] = useState<number | null>(null);
  const [lastLogWritten, setLastLogWritten] = useState('');

  const refreshCppQueueSize = useCallback(() => {
    if (global.__rnlogsInternal) {
      setCppQueueSize(global.__rnlogsInternal.getQueueSize());
      setJsiAvailable(true);
    } else {
      setJsiAvailable(false);
    }
  }, []);

  useEffect(() => {
    refreshCppQueueSize();
    const timer = setInterval(refreshCppQueueSize, 1000);
    return () => clearInterval(timer);
  }, [refreshCppQueueSize]);

  const jsiWrite = (logs: Record<string, any>[]) => {
    if (!global.__rnlogsInternal) {
      alert('JSI 接口未安装');
      return;
    }
    const patched = logs.map(e => ({
      data: {},
      user: {},
      breadcrumbs: [],
      tags: {},
      context: {environment: 'development', release: '1.0.0'},
      ...e,
    }));
    const str = JSON.stringify(patched);
    global.__rnlogsInternal.writeLogBatch(str);
    setLastLogWritten(str);
    refreshCppQueueSize();
  };

  const actions: LogItem[] = [
    {
      id: 101,
      label: '打手动日志',
      color: '#2563eb',
      onPress: () => {
        jsiWrite([{
          id: genId(), level: 2, message: 'JSI 手动点击日志', timestamp: Date.now(),
          tag: 'jsi_manual', data: {button: 'manualLog'},
        }]);
      },
    },
    {
      id: 102,
      label: '模拟 undefined 属性错误',
      color: '#dc2626',
      onPress: () => {
        jsiWrite([{
          id: genId(), level: 4, message: 'TypeError: Cannot read property "someProperty" of undefined', timestamp: Date.now(),
          tag: 'jsi_error', data: {errorType: 'TypeError', stack: 'obj.someProperty.toString()'},
        }]);
      },
    },
    {
      id: 103,
      label: '模拟 undefined 函数错误',
      color: '#dc2626',
      onPress: () => {
        jsiWrite([{
          id: genId(), level: 4, message: 'TypeError: fn is not a function', timestamp: Date.now(),
          tag: 'jsi_error', data: {errorType: 'TypeError', stack: 'fn()'},
        }]);
      },
    },
    {
      id: 104,
      label: '模拟 JSON.parse 错误',
      color: '#dc2626',
      onPress: () => {
        jsiWrite([{
          id: genId(), level: 4, message: 'SyntaxError: JSON Parse error: Unexpected character', timestamp: Date.now(),
          tag: 'jsi_error', data: {errorType: 'SyntaxError', stack: 'JSON.parse("not valid json")'},
        }]);
      },
    },
    {
      id: 105,
      label: '模拟数组越界错误',
      color: '#dc2626',
      onPress: () => {
        jsiWrite([{
          id: genId(), level: 4, message: 'TypeError: Cannot read property "toFixed" of undefined', timestamp: Date.now(),
          tag: 'jsi_error', data: {errorType: 'TypeError', stack: 'arr[10].toFixed(2)'},
        }]);
      },
    },
    {
      id: 106,
      label: '模拟 null 调用方法错误',
      color: '#dc2626',
      onPress: () => {
        jsiWrite([{
          id: genId(), level: 4, message: 'TypeError: Cannot read property "split" of null', timestamp: Date.now(),
          tag: 'jsi_error', data: {errorType: 'TypeError', stack: 'data.split(",")'},
        }]);
      },
    },
    {
      id: 107,
      label: '模拟异步异常',
      color: '#ea580c',
      onPress: () => {
        jsiWrite([{
          id: genId(), level: 4, message: 'Error: 触发异步异常,错误信息', timestamp: Date.now(),
          tag: 'jsi_error', data: {errorType: 'UnhandledPromiseRejection', stack: 'Promise.reject(new Error(...))'},
        }]);
      },
    },
    {
      id: 108,
      label: '模拟网络 404 请求',
      color: '#7c3aed',
      onPress: async () => {
        const startTime = Date.now();
        try {
          const res = await fetch('https://httpbin.org/status/404');
          const duration = Date.now() - startTime;
          jsiWrite([{
            id: genId(), level: 3, message: 'JSI 网络请求: 404', timestamp: Date.now(),
            tag: 'jsi_network', data: {statusCode: res.status, durationMs: duration, url: 'httpbin.org/status/404'},
          }]);
        } catch (err) {
          jsiWrite([{
            id: genId(), level: 4, message: 'JSI 网络请求失败', timestamp: Date.now(),
            tag: 'jsi_network', data: {errorMessage: err instanceof Error ? err.message : String(err)},
          }]);
        }
      },
    },
    {
      id: 109,
      label: '模拟网络超时',
      color: '#7c3aed',
      onPress: async () => {
        const startTime = Date.now();
        try {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 500);
          await fetch('https://httpbin.org/delay/10', {signal: ctrl.signal});
        } catch (err) {
          const duration = Date.now() - startTime;
          jsiWrite([{
            id: genId(), level: 4, message: 'JSI 网络超时', timestamp: Date.now(),
            tag: 'jsi_network', data: {durationMs: duration, errorMessage: err instanceof Error ? err.message : String(err)},
          }]);
        }
      },
    },
    {
      id: 110,
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
          jsiWrite([{
            id: genId(), level: 2, message: 'JSI 网络请求成功', timestamp: Date.now(),
            tag: 'jsi_network', data: {...params, statusCode: res.status, durationMs: duration, responseUrl: data.url},
          }]);
        } catch (err) {
          jsiWrite([{
            id: genId(), level: 4, message: 'JSI 网络请求失败', timestamp: Date.now(),
            tag: 'jsi_network', data: {...params, errorMessage: err instanceof Error ? err.message : String(err)},
          }]);
        }
      },
    },
    {
      id: 111,
      label: '切换页面',
      color: '#059669',
      onPress: () => {
        const target = `DetailScreen_${Date.now()}`;
        jsiWrite([{
          id: genId(), level: 2, message: 'JSI 页面切换', timestamp: Date.now(),
          tag: 'jsi_navigation', data: {from: 'HomeScreen', to: target, tab: 'profile', userId: 'user-123'},
        }]);
      },
    },
    {
      id: 112,
      label: '添加面包屑',
      color: '#059669',
      onPress: () => {
        jsiWrite([{
          id: genId(), level: 1, message: 'JSI 用户操作', timestamp: Date.now(),
          tag: 'jsi_breadcrumb', data: {category: 'user_action'},
        }]);
      },
    },
    {
      id: 113,
      label: '立即 Flush',
      color: '#0891b2',
      onPress: () => {
        if (!global.__rnlogsInternal) {
          alert('JSI 接口未安装');
          return;
        }
        global.__rnlogsInternal.flush();
        refreshCppQueueSize();
      },
    },
    {
      id: 114,
      label: '500 条高频压测',
      color: '#ea580c',
      onPress: () => {
        if (!global.__rnlogsInternal) {
          alert('JSI 接口未安装');
          return;
        }
        const startTime = Date.now();
        const count = 500;
        for (let i = 0; i < count; i++) {
          global.__rnlogsInternal.writeLog(
            JSON.stringify({
              id: genId(), level: 1, message: `Performance test log #${i}`, timestamp: Date.now(),
            }),
          );
        }
        const duration = Date.now() - startTime;
        setPerfTime(duration);
        refreshCppQueueSize();
      },
    },
    {
      id: 115,
      label: '清空 C++ 内存队列',
      color: '#64748b',
      onPress: () => {
        if (!global.__rnlogsInternal) {
          alert('JSI 接口未安装');
          return;
        }
        if (typeof global.__rnlogsInternal.clear === 'function') {
          global.__rnlogsInternal.clear();
        } else {
          alert('检测到原生 JSI 尚未支持 clear()。因为修改了 C++ 源代码，请在终端重新运行 npm run android / npm run ios 编译安装原生应用！');
          // 优雅降级使用原有的 flush
          global.__rnlogsInternal.flush();
        }
        setLastLogWritten('');
        setPerfTime(null);
        refreshCppQueueSize();
      },
    },
    {
      id: 116,
      label: '💥 触发 C++ Native Crash',
      color: '#b91c1c',
      onPress: () => {
        if (!global.__rnlogsInternal) {
          alert('JSI 接口未安装');
          return;
        }
        RNLogs.addBreadcrumb('即将发生 C++ Native 硬件崩溃', 'system_event');
        global.__rnlogsInternal.triggerNativeCrash();
      },
    },
    {
      id: 117,
      label: '🔍 查看并消费挂起的崩溃报告',
      color: '#d97706',
      onPress: () => {
        if (!global.__rnlogsInternal) {
          alert('JSI 接口未安装');
          return;
        }
        const has = global.__rnlogsInternal.hasPendingCrashReport();
        if (!has) {
          alert('当前无挂起的本地崩溃日志');
        } else {
          const report = global.__rnlogsInternal.consumeCrashReport();
          alert(`检测到崩溃数据，已读取并清空：\n\n${report}`);
        }
      },
    },
  ];

  return (
    <ScrollView contentContainerStyle={sharedStyles.container}>
      <View style={sharedStyles.header}>
        <Text style={sharedStyles.title}>RNLogs Phase 2</Text>
        <Text style={sharedStyles.subtitle}>
          JSI 高性能通信通道验证（JS → C++）
        </Text>
      </View>

      {/* JSI & C++ 状态面板 */}
      <View style={sharedStyles.jsiDashboard}>
        <View style={sharedStyles.jsiRow}>
          <Text style={sharedStyles.jsiLabel}>JSI 注入状态:</Text>
          <Text
            style={[
              sharedStyles.jsiValue,
              jsiAvailable
                ? sharedStyles.statusSuccess
                : sharedStyles.statusFail,
            ]}>
            {jsiAvailable ? '已注入 (Available)' : '未挂载 (Unavailable)'}
          </Text>
        </View>
        <View style={sharedStyles.jsiRow}>
          <Text style={sharedStyles.jsiLabel}>C++ 内存队列长度:</Text>
          <Text style={sharedStyles.jsiHighlight}>{cppQueueSize} 条</Text>
        </View>
        {perfTime !== null && (
          <View style={sharedStyles.jsiRow}>
            <Text style={sharedStyles.jsiLabel}>500条压测耗时:</Text>
            <Text style={sharedStyles.jsiHighlightSuccess}>
              {perfTime} ms
            </Text>
          </View>
        )}
      </View>

      {/* 手动日志 */}
      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>手动日志</Text>
        {renderButtons([actions[0]])}
      </View>

      {/* JS 常见错误 */}
      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>
          JS 常见错误 (JSI 记录)
        </Text>
        {renderButtons(actions.slice(1, 7))}
      </View>

      {/* 网络与异步 */}
      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>
          网络与异步 (JSI 记录)
        </Text>
        {renderButtons(actions.slice(7, 10))}
      </View>

      {/* 操作与面包屑 */}
      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>
          操作与面包屑 (JSI 记录)
        </Text>
        {renderButtons(actions.slice(10, 12))}
      </View>

      {/* JSI 工具 */}
      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>JSI 工具</Text>
        {renderButtons(actions.slice(12))}
      </View>

      {/* 最近写入的内容监控 */}
      {lastLogWritten ? (
        <View style={sharedStyles.monitorSection}>
          <Text style={sharedStyles.monitorTitle}>
            最近发送的日志报文 (JS 侧展示):
          </Text>
          <Text style={sharedStyles.monitorContent} numberOfLines={6}>
            {lastLogWritten}
          </Text>
        </View>
      ) : null}

      <Text style={sharedStyles.endpoint}>
        上报接口: {UPLOAD_ENDPOINT}
      </Text>
    </ScrollView>
  );
}

export default Phase2Screen;
