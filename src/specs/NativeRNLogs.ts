declare global {
  var __rnlogsInternal: {
    initialize: (configJson: string) => void;
    writeLog: (logData: string) => void;
    writeLogBatch: (batchJson: string) => void;
    getQueueSize: () => number;
    flush: () => void;
  } | undefined;
}

export const isJsiAvailable = (): boolean => {
  return typeof global.__rnlogsInternal !== 'undefined';
};
