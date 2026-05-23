/**
 * 共享 UI 组件、工具函数和样式常量
 */

import {View, Pressable, StyleSheet, Text, Platform} from 'react-native';

export const UPLOAD_ENDPOINT = 'http://192.168.5.130:8080/api/v1/logs';

export type LogItem = {
  id: number;
  label: string;
  color: string;
  onPress: () => void;
};

export function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

export function renderButtons(items: LogItem[]) {
  return chunk(items, 2).map((row, i) => (
    <View key={i} style={sharedStyles.buttonRow}>
      {row.map(a => (
        <View key={a.id} style={sharedStyles.buttonCell}>
          <ActionButton item={a} />
        </View>
      ))}
    </View>
  ));
}

export function ActionButton({item}: {item: LogItem}) {
  return (
    <Pressable
      style={({pressed}) => [
        sharedStyles.button,
        {backgroundColor: item.color},
        pressed && sharedStyles.buttonPressed,
      ]}
      onPress={item.onPress}>
      <Text style={sharedStyles.buttonText}>{item.label}</Text>
    </Pressable>
  );
}

export const sharedStyles = StyleSheet.create({
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
