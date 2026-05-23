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

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install:(NSString *)endpoint sessionId:(NSString *)sessionId) {
    RCTBridge *bridge = [RCTBridge currentBridge];
    // 使用 RCTCXXBridge 强转获取 jsi::Runtime 指针
    RCTCXXBridge *cxxBridge = (RCTCXXBridge *)bridge;
    if (!cxxBridge) {
        return @NO;
    }
    
    facebook::jsi::Runtime *runtime = (facebook::jsi::Runtime *)cxxBridge.runtime;
    if (!runtime) {
        return @NO;
    }
    
    // 安装 JSI 绑定
    facebook::jsi::RNLogsJSIBinding::install(*runtime);
    
    // 确定 iOS 本地缓存私有目录
    NSString *cacheDir = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) firstObject];
    NSString *rnlogsCacheDir = [cacheDir stringByAppendingPathComponent:@"rnlogs"];
    
    [[CrashHandlerIOS sharedInstance] initializeWithCacheDir:rnlogsCacheDir];
    
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
