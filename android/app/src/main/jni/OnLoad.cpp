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
Java_com_rnlogss_RNLogsModule_nativeInstall(JNIEnv* env, jobject thiz, jlong jsiRuntimePtr, jstring jCacheDir) {
    auto runtime = reinterpret_cast<facebook::jsi::Runtime*>(jsiRuntimePtr);
    if (runtime) {
        facebook::jsi::RNLogsJSIBinding::install(*runtime);
    }

    if (jCacheDir != nullptr) {
        const char* cacheDirChars = env->GetStringUTFChars(jCacheDir, nullptr);
        if (cacheDirChars != nullptr) {
            std::string cacheDir(cacheDirChars);
            facebook::jsi::RNLogsJSIBinding::getQueue()->setCacheDir(cacheDir);
            env->ReleaseStringUTFChars(jCacheDir, cacheDirChars);
        }
    }
}

extern "C" JNIEXPORT __attribute__((visibility("default"))) jstring JNICALL
Java_com_rnlogss_RNLogsModule_nativeFetchBatchToUpload(JNIEnv* env, jobject thiz) {
    auto batch = facebook::jsi::RNLogsJSIBinding::getQueue()->fetchNextBatch();
    if (batch.first.empty() || batch.second.empty()) {
        return nullptr;
    }
    // 打包成 JSON 格式回传给 Java 层，结构为：{"batchId": "xxx", "logs": [...]}
    std::string jsonResult = "{\"batchId\":\"" + batch.first + "\",\"logs\":" + batch.second + "}";
    return env->NewStringUTF(jsonResult.c_str());
}

extern "C" JNIEXPORT __attribute__((visibility("default"))) void JNICALL
Java_com_rnlogss_RNLogsModule_nativeConfirmUpload(JNIEnv* env, jobject thiz, jstring jBatchId, jboolean jSuccess) {
    if (jBatchId != nullptr) {
        const char* batchIdChars = env->GetStringUTFChars(jBatchId, nullptr);
        if (batchIdChars != nullptr) {
            std::string batchId(batchIdChars);
            facebook::jsi::RNLogsJSIBinding::getQueue()->confirmBatch(batchId, jSuccess == JNI_TRUE);
            env->ReleaseStringUTFChars(jBatchId, batchIdChars);
        }
    }
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return facebook::jni::initialize(vm, [] {
    facebook::react::DefaultTurboModuleManagerDelegate::cxxModuleProvider = &facebook::react::cxxModuleProvider;
    facebook::react::DefaultTurboModuleManagerDelegate::javaModuleProvider = &facebook::react::javaModuleProvider;
    facebook::react::DefaultComponentsRegistry::registerComponentDescriptorsFromEntryPoint = &facebook::react::registerComponents;
  });
}
