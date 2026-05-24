#!/usr/bin/env node

/**
 * Node.js v16 兼容性修复 - 作为 Node.js 的 -r 参数使用
 * 用法: node -r ./scripts/fix-nodejs.js [其他命令]
 */

const Module = require('module');
const os = require('os');

// 为 Node.js v16 添加 availableParallelism polyfill
if (!os.availableParallelism) {
  Object.defineProperty(os, 'availableParallelism', {
    value: () => {
      const cpus = os.cpus();
      return cpus ? cpus.length : 4;
    },
    writable: true,
    enumerable: false,
    configurable: true
  });

  // Hook into module loading to fix node:os imports
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function(request, parent) {
    const filename = originalResolveFilename.call(this, request, parent);
    if (request === 'node:os') {
      // Redirect node:os to os (with our polyfill)
      return Module._resolveFilename.call(this, 'os', parent);
    }
    return filename;
  };

  console.error('[fix-nodejs] Applied availableParallelism polyfill for Node.js v16');
}

