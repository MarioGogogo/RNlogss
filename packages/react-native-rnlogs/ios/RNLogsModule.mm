#import "RNLogsModule.h"
#import <React/RCTBridge+Private.h>
#include "RNLogsJSIBinding.h"
#import "CrashHandlerIOS.h"

@interface RCTCXXBridge : RCTBridge
- (void *)runtime;
@end

@implementation RNLogsModule

RCT_EXPORT_MODULE(RNLogsModule);

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

- (void)installJSIBindingsWithRuntime:(facebook::jsi::Runtime &)runtime
                          callInvoker:(const std::shared_ptr<facebook::react::CallInvoker> &)callInvoker {
    NSLog(@"[RNLogsModule] installJSIBindingsWithRuntime called.");
    
    // 安装 JSI 绑定
    facebook::jsi::RNLogsJSIBinding::install(runtime);
    
    // 确定 iOS 本地缓存私有目录并初始化崩溃处理
    NSString *cacheDir = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) firstObject];
    NSString *rnlogsCacheDir = [cacheDir stringByAppendingPathComponent:@"rnlogs"];
    [[CrashHandlerIOS sharedInstance] initializeWithCacheDir:rnlogsCacheDir];
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install:(NSString *)endpoint sessionId:(NSString *)sessionId) {
    NSLog(@"[RNLogsModule] Legacy install call bypassed in Bridgeless (handled by installJSIBindingsWithRuntime)");
    return @YES;
}

RCT_EXPORT_METHOD(hasPendingCrashReport:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    BOOL has = [[CrashHandlerIOS sharedInstance] hasPendingCrashReport];
    resolve(@(has));
}

RCT_EXPORT_METHOD(consumeCrashReport:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    NSString *report = [[CrashHandlerIOS sharedInstance] consumeCrashReport];
    resolve(report);
}

@end
