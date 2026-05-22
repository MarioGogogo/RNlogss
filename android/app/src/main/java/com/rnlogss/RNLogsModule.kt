package com.rnlogss

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import android.os.Handler
import android.os.Looper
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class RNLogsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    // 默认测试 Endpoint，也可以动态获取
    private var uploadEndpoint = "https://httpbin.org/post"
    private var uploadSessionId = "sess-${System.currentTimeMillis()}"
    private val handler = Handler(Looper.getMainLooper())
    private var isUploading = false
    private var pollerStarted = false

    private val uploadRunnable = object : Runnable {
        override fun run() {
            try {
                performUpload()
            } finally {
                // 每 5 秒轮询拉取并上报一次
                handler.postDelayed(this, 5000)
            }
        }
    }

    override fun getName(): String {
        return "RNLogsModule"
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun install(endpoint: String, sessionId: String): Boolean {
        try {
            val jsContext = reactApplicationContext.javaScriptContextHolder
            val jsiRuntimePtr = jsContext?.get() ?: 0L
            if (jsiRuntimePtr != 0L) {
                if (endpoint.isNotEmpty()) {
                    uploadEndpoint = endpoint
                }
                if (sessionId.isNotEmpty()) {
                    uploadSessionId = sessionId
                }
                // 获取 Android App 本地缓存私有目录并传入 C++
                val cacheDir = reactApplicationContext.cacheDir.absolutePath + "/rnlogs"
                nativeInstall(jsiRuntimePtr, cacheDir)

                // 初始化成功后启动原生轮询上报器
                startPoller()
                return true
            } else {
                android.util.Log.w("RNLogsModule", "javaScriptContextHolder returned null pointer")
            }
        } catch (e: Throwable) {
            android.util.Log.e("RNLogsModule", "Failed to load/install RNLogs JSI", e)
        }
        return false
    }

    @Synchronized
    private fun startPoller() {
        if (pollerStarted) return
        pollerStarted = true
        handler.post(uploadRunnable)
        android.util.Log.i("RNLogsModule", "Native polling uploader started successfully.")
    }

    private fun performUpload() {
        if (isUploading) return
        isUploading = true

        Thread {
            try {
                val batchJson = nativeFetchBatchToUpload()
                if (batchJson != null) {
                    val jsonObject = JSONObject(batchJson)
                    val batchId = jsonObject.getString("batchId")
                    val logsArray = jsonObject.getJSONArray("logs")

                    // 构造统一的上报 Payload 结构，补齐必填字段
                    val payload = JSONObject()
                    payload.put("sdk", "rnlogs")
                    payload.put("sdkVersion", "1.0.0")
                    payload.put("batchId", batchId)
                    payload.put("sessionId", uploadSessionId)
                    payload.put("timestamp", System.currentTimeMillis())
                    payload.put("batchSize", logsArray.length())
                    payload.put("events", logsArray)

                    val mediaType = "application/json; charset=utf-8".toMediaType()
                    val body = RequestBody.create(
                        mediaType,
                        payload.toString()
                    )

                    val request = Request.Builder()
                        .url(uploadEndpoint)
                        .post(body)
                        .build()

                    client.newCall(request).enqueue(object : Callback {
                        override fun onFailure(call: Call, e: IOException) {
                            android.util.Log.e("RNLogsModule", "Failed to upload log batch: $batchId due to network error", e)
                            nativeConfirmUpload(batchId, false)
                            isUploading = false
                        }

                        override fun onResponse(call: Call, response: Response) {
                            response.use {
                                val code = response.code
                                if (response.isSuccessful) {
                                    android.util.Log.i("RNLogsModule", "Successfully uploaded log batch: $batchId")
                                    nativeConfirmUpload(batchId, true)
                                    isUploading = false
                                    // 递归调用继续拉取下一批积压文件，快速清空磁盘
                                    performUpload()
                                } else {
                                    android.util.Log.w("RNLogsModule", "Server rejected logs: $code for $batchId")
                                    if (code in 400..499) {
                                        // 4xx 视为不可恢复的客户端/格式错误，直接丢弃以防队头阻塞
                                        nativeConfirmUpload(batchId, true)
                                    } else {
                                        // 5xx 或其他暂时性服务错误，重试
                                        nativeConfirmUpload(batchId, false)
                                    }
                                    isUploading = false
                                }
                            }
                        }
                    })
                } else {
                    isUploading = false
                }
            } catch (e: Exception) {
                android.util.Log.e("RNLogsModule", "Exception in Native Uploader thread", e)
                isUploading = false
            }
        }.start()
    }

    private external fun nativeInstall(jsiRuntimePtr: Long, cacheDir: String)
    private external fun nativeFetchBatchToUpload(): String?
    private external fun nativeConfirmUpload(batchId: String, success: Boolean)
}
