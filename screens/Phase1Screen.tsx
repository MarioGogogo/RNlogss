/**
 * Phase 1 页面 — JS 层功能验证 + 上报系统
 */

import {useEffect, useState, useCallback} from 'react';
import {ScrollView, View, Text} from 'react-native';
import {RNLogs, LogLevel} from '../src';
import {
  sharedStyles,
  UPLOAD_ENDPOINT,
  renderButtons,
  type LogItem,
} from './shared';

function Phase1Screen() {
  const [logCount, setLogCount] = useState(0);
  const [offlineSize, setOfflineSize] = useState(0);

  const refreshOfflineSize = useCallback(async () => {
    const size = await RNLogs.getOfflineSize();
    setOfflineSize(size);
  }, []);

  useEffect(() => {
    const timer = setInterval(refreshOfflineSize, 1000);
    return () => clearInterval(timer);
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

  return (
    <ScrollView contentContainerStyle={sharedStyles.container}>
      <View style={sharedStyles.header}>
        <Text style={sharedStyles.title}>RNLogs Phase 1</Text>
        <Text style={sharedStyles.subtitle}>JS 层功能验证 + 上报系统</Text>
      </View>

      <View style={sharedStyles.statusBar}>
        <View style={sharedStyles.statusItem}>
          <Text style={sharedStyles.statusValue}>{logCount}</Text>
          <Text style={sharedStyles.statusLabel}>已触发操作</Text>
        </View>
        <View style={sharedStyles.statusDivider} />
        <View style={sharedStyles.statusItem}>
          <Text style={sharedStyles.statusValue}>{offlineSize}</Text>
          <Text style={sharedStyles.statusLabel}>离线队列</Text>
        </View>
      </View>

      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>手动日志</Text>
        {renderButtons([actions[0]])}
      </View>

      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>JS 常见错误</Text>
        {renderButtons(actions.slice(1, 7))}
      </View>

      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>网络与异步</Text>
        {renderButtons(actions.slice(7, 10))}
      </View>

      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>操作与面包屑</Text>
        {renderButtons(actions.slice(10, 12))}
      </View>

      <View style={sharedStyles.section}>
        {renderButtons([actions[12]])}
      </View>

      <Text style={sharedStyles.endpoint}>上报接口: {UPLOAD_ENDPOINT}</Text>
    </ScrollView>
  );
}

export default Phase1Screen;
