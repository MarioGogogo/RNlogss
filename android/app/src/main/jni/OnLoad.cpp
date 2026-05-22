#include <jni.h>
#include <jsi/jsi.h>
#include <DefaultComponentsRegistry.h>
#include <DefaultTurboModuleManagerDelegate.h>
#include <fbjni/fbjni.h>
#include <autolinking.h>

#include <FBReactNativeSpec.h>

#include "../../../../../cpp/jsi/RNLogsJSIBinding.h"

namespace facebook::react {

void registerComponents(std::shared_ptr<const ComponentDescriptorProviderRegistry> registry) {
  autolinking_registerProviders(registry);
}

std::shared_ptr<TurboModule> cxxModuleProvider(const std::string &name, const std::shared_ptr<CallInvoker> &jsInvoker) {
  return autolinking_cxxModuleProvider(name, jsInvoker); 
}

std::shared_ptr<TurboModule> javaModuleProvider(const std::string &name, const JavaTurboModule::InitParams &params) {
  if (auto module = FBReactNativeSpec_ModuleProvider(name, params)) {
    return module;
  }
  return autolinking_ModuleProvider(name, params);
}

} // namespace facebook::react

extern "C" JNIEXPORT __attribute__((visibility("default"))) void JNICALL
Java_com_rnlogss_RNLogsModule_nativeInstall(JNIEnv* env, jobject thiz, jlong jsiRuntimePtr) {
    auto runtime = reinterpret_cast<facebook::jsi::Runtime*>(jsiRuntimePtr);
    if (runtime) {
        facebook::jsi::RNLogsJSIBinding::install(*runtime);
    }
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return facebook::jni::initialize(vm, [] {
    facebook::react::DefaultTurboModuleManagerDelegate::cxxModuleProvider = &facebook::react::cxxModuleProvider;
    facebook::react::DefaultTurboModuleManagerDelegate::javaModuleProvider = &facebook::react::javaModuleProvider;
    facebook::react::DefaultComponentsRegistry::registerComponentDescriptorsFromEntryPoint = &facebook::react::registerComponents;
  });
}
