#import "CrashHandlerIOS.h"
#import <CrashReporter/CrashReporter.h>
#include "CrashReporter.h"
#include "BreadcrumbTracker.h"

@interface CrashHandlerIOS () {
    PLCrashReporter *_crashReporter;
    NSString *_cacheDir;
}
@end

@implementation CrashHandlerIOS

+ (instancetype)sharedInstance {
    static CrashHandlerIOS *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[CrashHandlerIOS alloc] init];
    });
    return instance;
}

- (void)initializeWithCacheDir:(NSString *)cacheDir {
    _cacheDir = cacheDir;
    
    // 初始化 C++ CrashReporter
    rnlogs::CrashReporter::getInstance().initialize([cacheDir UTF8String]);
    
    PLCrashReporterConfig *config = [[PLCrashReporterConfig alloc] initWithSignalHandlerType:PLCrashReporterSignalHandlerTypeBSD
                                                                      symbolicationStrategy:PLCrashReporterSymbolicationStrategyAll];
    _crashReporter = [[PLCrashReporter alloc] initWithConfiguration:config];
    
    NSError *error = nil;
    if ([_crashReporter enableCrashReporterAndReturnError:&error]) {
        NSLog(@"[RNLogs] PLCrashReporter enabled successfully.");
    } else {
        NSLog(@"[RNLogs] Failed to enable PLCrashReporter: %@", error);
    }
}

- (BOOL)hasPendingCrashReport {
    return [_crashReporter hasPendingCrashReport];
}

- (NSString *)consumeCrashReport {
    if (![_crashReporter hasPendingCrashReport]) {
        return @"";
    }
    
    NSData *crashData = [_crashReporter loadPendingCrashReportData];
    if (!crashData) {
        return @"";
    }
    
    NSError *error = nil;
    PLCrashReport *report = [[PLCrashReport alloc] initWithData:crashData error:&error];
    if (!report) {
        [_crashReporter purgePendingCrashReport];
        return @"";
    }
    
    // 基础属性
    NSString *signalName = report.signalInfo.name ?: @"UNKNOWN";
    NSString *errorMsg = @"iOS hardware exception or crash";
    
    NSMutableDictionary *jsonDict = [NSMutableDictionary dictionary];
    jsonDict[@"type"] = @"crash";
    jsonDict[@"timestamp"] = @((uint64_t)([report.systemInfo.timestamp timeIntervalSince1970] * 1000));
    jsonDict[@"signal"] = signalName;
    jsonDict[@"message"] = errorMsg;
    
    // 注入 C++ 层的 Breadcrumb 历史
    std::vector<std::string> bcs = rnlogs::BreadcrumbTracker::getInstance().getBreadcrumbsJson();
    NSMutableArray *bcArray = [NSMutableArray array];
    for (const auto& bc : bcs) {
        NSString *bcStr = [NSString stringWithUTF8String:bc.c_str()];
        NSData *bcData = [bcStr dataUsingEncoding:NSUTF8StringEncoding];
        if (bcData) {
            NSDictionary *bcDict = [NSJSONSerialization JSONObjectWithData:bcData options:0 error:nil];
            if (bcDict) [bcArray addObject:bcDict];
        }
    }
    jsonDict[@"breadcrumbs"] = bcArray;
    jsonDict[@"logs"] = @[];
    
    NSData *resultData = [NSJSONSerialization dataWithJSONObject:jsonDict options:0 error:nil];
    NSString *resultStr = [[NSString alloc] initWithData:resultData encoding:NSUTF8StringEncoding];
    
    [_crashReporter purgePendingCrashReport];
    return resultStr;
}

@end
