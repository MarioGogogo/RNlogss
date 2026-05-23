#import <Foundation/Foundation.h>

@interface CrashHandlerIOS : NSObject

+ (instancetype)sharedInstance;
- (void)initializeWithCacheDir:(NSString *)cacheDir;
- (BOOL)hasPendingCrashReport;
- (NSString *)consumeCrashReport;

@end
