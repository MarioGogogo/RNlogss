package com.rnlogss

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RNLogsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "RNLogsModule"
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun install(): Boolean {
        try {
            val jsContext = reactApplicationContext.javaScriptContextHolder
            val jsiRuntimePtr = jsContext?.get() ?: 0L
            if (jsiRuntimePtr != 0L) {
                nativeInstall(jsiRuntimePtr)
                return true
            } else {
                android.util.Log.w("RNLogsModule", "javaScriptContextHolder returned null pointer")
            }
        } catch (e: Throwable) {
            android.util.Log.e("RNLogsModule", "Failed to load/install RNLogs JSI", e)
        }
        return false
    }

    private external fun nativeInstall(jsiRuntimePtr: Long)
}
