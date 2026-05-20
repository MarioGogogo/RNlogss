import {EventType, EventSource} from '../src/types';

// Mock promise/setimmediate/rejection-tracking
const mockRejectionTrackingEnable = jest.fn();
jest.mock(
  'promise/setimmediate/rejection-tracking',
  () => ({
    enable: mockRejectionTrackingEnable,
  }),
  {virtual: true},
);

// Mock RN promiseRejectionTrackingOptions
const mockRnOnUnhandled = jest.fn();
const mockRnOnHandled = jest.fn();
jest.mock(
  'react-native/Libraries/promiseRejectionTrackingOptions',
  () => ({
    default: {
      onUnhandled: mockRnOnUnhandled,
      onHandled: mockRnOnHandled,
    },
  }),
  {virtual: true},
);

describe('ExceptionCollector', () => {
  let ExceptionCollector: any;
  let originalHermesInternal: any;
  let originalAddEventListener: any;

  beforeAll(() => {
    // Dynamically require after mocks are established
    const mod = require('../src/collectors/ExceptionCollector');
    ExceptionCollector = mod.ExceptionCollector;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    originalHermesInternal = (global as any).HermesInternal;
    originalAddEventListener = (global as any).addEventListener;
    delete (global as any).HermesInternal;
    (global as any).addEventListener = jest.fn();
  });

  afterEach(() => {
    (global as any).HermesInternal = originalHermesInternal;
    (global as any).addEventListener = originalAddEventListener;
  });

  test('should use Hermes rejection tracker if available', () => {
    const mockEnable = jest.fn();
    (global as any).HermesInternal = {
      enablePromiseRejectionTracker: mockEnable,
    };

    const onLog = jest.fn();
    const collector = new ExceptionCollector(onLog);
    collector.start();

    expect(mockEnable).toHaveBeenCalledWith({
      allRejections: true,
      onUnhandled: expect.any(Function),
      onHandled: expect.any(Function),
    });

    const {onUnhandled} = mockEnable.mock.calls[0][0];
    const testError = new Error('Test Hermes rejection');
    onUnhandled(1, testError);

    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EventType.EXCEPTION,
        source: EventSource.EXCEPTION,
        message: 'Test Hermes rejection',
        exception: expect.objectContaining({
          name: 'Error',
          isFatal: false,
        }),
      }),
    );

    // Should forward to RN's default handler
    expect(mockRnOnUnhandled).toHaveBeenCalledWith(1, testError);
  });

  test('should fallback to promise/setimmediate/rejection-tracking if Hermes not available', () => {
    const onLog = jest.fn();
    const collector = new ExceptionCollector(onLog);
    collector.start();

    expect(mockRejectionTrackingEnable).toHaveBeenCalledWith({
      allRejections: true,
      onUnhandled: expect.any(Function),
      onHandled: expect.any(Function),
    });

    const {onUnhandled, onHandled} = mockRejectionTrackingEnable.mock.calls[0][0];
    const testError = new Error('Test JSC rejection');
    onUnhandled(2, testError);

    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Test JSC rejection',
      }),
    );
    expect(mockRnOnUnhandled).toHaveBeenCalledWith(2, testError);

    onHandled(2);
    expect(mockRnOnHandled).toHaveBeenCalledWith(2);
  });

  test('should fallback to addEventListener if other methods fail', () => {
    // Make require of promise rejection tracking fail
    mockRejectionTrackingEnable.mockImplementationOnce(() => {
      throw new Error('Not available');
    });

    const onLog = jest.fn();
    const collector = new ExceptionCollector(onLog);
    collector.start();

    expect((global as any).addEventListener).toHaveBeenCalledWith(
      'unhandledRejection',
      expect.any(Function),
    );

    const eventListener = (global as any).addEventListener.mock.calls[0][1];
    eventListener({
      reason: new Error('Event listener rejection'),
    });

    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Event listener rejection',
      }),
    );
  });

  test('should not log if disabled (stopped)', () => {
    const mockEnable = jest.fn();
    (global as any).HermesInternal = {
      enablePromiseRejectionTracker: mockEnable,
    };

    const onLog = jest.fn();
    const collector = new ExceptionCollector(onLog);
    collector.start();

    const {onUnhandled} = mockEnable.mock.calls[0][0];
    collector.stop();

    onUnhandled(1, new Error('Should not log'));
    expect(onLog).not.toHaveBeenCalled();
  });
});
