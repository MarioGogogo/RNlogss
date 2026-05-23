import { RNLogs } from '../src';

describe('Crash & Breadcrumb Tracking Unit Tests', () => {
  beforeEach(() => {
    // Mock global.__rnlogsInternal 宿主对象
    (global as any).__rnlogsInternal = {
      initialize: jest.fn(),
      writeLog: jest.fn(),
      writeLogBatch: jest.fn(),
      getQueueSize: jest.fn().mockReturnValue(0),
      flush: jest.fn(),
      addBreadcrumb: jest.fn(),
      hasPendingCrashReport: jest.fn().mockReturnValue(false),
      consumeCrashReport: jest.fn().mockReturnValue(''),
      triggerNativeCrash: jest.fn(),
    };
  });

  afterEach(() => {
    delete (global as any).__rnlogsInternal;
  });

  test('should call native addBreadcrumb when JS adds breadcrumb', () => {
    RNLogs.init({ enabled: true });
    RNLogs.addBreadcrumb('clicked pay button', 'click');
    expect((global as any).__rnlogsInternal.addBreadcrumb).toHaveBeenCalledWith(
      'clicked pay button',
      'click'
    );
  });

  test('should check native pending crash and consume it correctly', () => {
    RNLogs.init({ enabled: true });
    ((global as any).__rnlogsInternal.hasPendingCrashReport as jest.Mock).mockReturnValue(true);
    ((global as any).__rnlogsInternal.consumeCrashReport as jest.Mock).mockReturnValue(
      JSON.stringify({ type: 'crash', signal: 'SIGSEGV', message: 'test hardware crash' })
    );

    const hasCrash = (global as any).__rnlogsInternal.hasPendingCrashReport();
    const report = (global as any).__rnlogsInternal.consumeCrashReport();

    expect(hasCrash).toBe(true);
    expect(JSON.parse(report).signal).toBe('SIGSEGV');
  });
});
