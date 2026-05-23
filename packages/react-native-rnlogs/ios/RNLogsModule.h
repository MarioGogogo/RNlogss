#import <React/RCTBridgeModule.h>
#if __has_include(<ReactCommon/RCTTurboModuleWithJSIBindings.h>)
#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>
#elif __has_include(<React/RCTTurboModuleWithJSIBindings.h>)
#import <React/RCTTurboModuleWithJSIBindings.h>
#else
#import "RCTTurboModuleWithJSIBindings.h"
#endif

@interface RNLogsModule : NSObject <RCTBridgeModule, RCTTurboModuleWithJSIBindings>
@end
