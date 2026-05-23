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
import okhttp3.RequestBody.Companion.toRequestBody
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
                val cacheDir = reactApplicationContext.cacheDir.absolutePath + "/rnlogs"
                nativeInstall(jsiRuntimePtr, cacheDir)

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
                // 1. 优先检测并上报挂起的崩溃报告
                if (nativeHasPendingCrashReport()) {
                    val crashJson = nativeConsumeCrashReport()
                    if (crashJson != null) {
                        uploadCrashReport(crashJson)
                    }
                }

                // 2. 处理常规日志块上报
                if (uploadEndpoint.contains("grpc")) {
                    val packet = nativeFetchPbBatchToUpload()
                    if (packet != null && packet.size >= 4) {
                        val len0 = packet[0].toInt() and 0xFF
                        val len1 = packet[1].toInt() and 0xFF
                        val len2 = packet[2].toInt() and 0xFF
                        val len3 = packet[3].toInt() and 0xFF
                        val batchIdLen = (len0 shl 24) or (len1 shl 16) or (len2 shl 8) or len3
                        
                        val batchId = String(packet, 4, batchIdLen, Charsets.UTF_8)
                        val pbData = packet.copyOfRange(4 + batchIdLen, packet.size)

                        // 拼装 5 字节 gRPC 头 (1字节压缩标识 + 4字节大端长度) + pb 数据
                        val pbLen = pbData.size
                        val grpcFrame = ByteArray(5 + pbLen)
                        grpcFrame[0] = 0 // 未压缩
                        grpcFrame[1] = ((pbLen ushr 24) and 0xFF).toByte()
                        grpcFrame[2] = ((pbLen ushr 16) and 0xFF).toByte()
                        grpcFrame[3] = ((pbLen ushr 8) and 0xFF).toByte()
                        grpcFrame[4] = (pbLen and 0xFF).toByte()
                        System.arraycopy(pbData, 0, grpcFrame, 5, pbLen)

                        val mediaType = "application/grpc".toMediaType()
                        val body = grpcFrame.toRequestBody(mediaType)
                        val request = Request.Builder()
                            .url(uploadEndpoint)
                            .post(body)
                            .build()

                        client.newCall(request).enqueue(object : Callback {
                            override fun onFailure(call: Call, e: IOException) {
                                android.util.Log.e("RNLogsModule", "Failed to upload log batch (gRPC): $batchId due to network error", e)
                                nativeConfirmUpload(batchId, false)
                                isUploading = false
                            }

                            override fun onResponse(call: Call, response: Response) {
                                response.use {
                                    val code = response.code
                                    if (response.isSuccessful) {
                                        android.util.Log.i("RNLogsModule", "Successfully uploaded log batch (gRPC): $batchId")
                                        nativeConfirmUpload(batchId, true)
                                        isUploading = false
                                        performUpload()
                                    } else {
                                        android.util.Log.w("RNLogsModule", "gRPC server rejected logs: $code for $batchId")
                                        if (code in 400..499) {
                                            nativeConfirmUpload(batchId, true)
                                        } else {
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
                } else {
                    val batchJson = nativeFetchBatchToUpload()
                    if (batchJson != null) {
                        val jsonObject = JSONObject(batchJson)
                        val batchId = jsonObject.getString("batchId")
                        val logsArray = jsonObject.getJSONArray("logs")

                        val payload = JSONObject()
                        payload.put("sdk", "rnlogs")
                        payload.put("sdkVersion", "1.0.0")
                        payload.put("batchId", batchId)
                        payload.put("sessionId", uploadSessionId)
                        payload.put("timestamp", System.currentTimeMillis())
                        payload.put("batchSize", logsArray.length())
                        payload.put("events", logsArray)

                        val mediaType = "application/json; charset=utf-8".toMediaType()
                        val body = payload.toString().toRequestBody(mediaType)
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
                                        performUpload()
                                    } else {
                                        android.util.Log.w("RNLogsModule", "Server rejected logs: $code for $batchId")
                                        if (code in 400..499) {
                                            nativeConfirmUpload(batchId, true)
                                        } else {
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
                }
            } catch (e: Exception) {
                android.util.Log.e("RNLogsModule", "Exception in Native Uploader thread", e)
                isUploading = false
            }
        }.start()
    }

    private fun uploadCrashReport(crashJson: String) {
        try {
            val crashObj = JSONObject(crashJson)
            val payload = JSONObject()
            payload.put("sdk", "rnlogs")
            payload.put("sdkVersion", "1.0.0")
            payload.put("batchId", "crash-" + System.currentTimeMillis())
            payload.put("sessionId", uploadSessionId)
            payload.put("timestamp", System.currentTimeMillis())
            payload.put("batchSize", 1)
            
            val eventsArray = org.json.JSONArray()
            eventsArray.put(crashObj)
            payload.put("events", eventsArray)

            val mediaType = "application/json; charset=utf-8".toMediaType()
            val body = payload.toString().toRequestBody(mediaType)
            val request = Request.Builder()
                .url(uploadEndpoint)
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    android.util.Log.i("RNLogsModule", "Successfully uploaded native crash report.")
                } else {
                    android.util.Log.w("RNLogsModule", "Server rejected native crash report: ${response.code}")
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("RNLogsModule", "Failed to upload native crash report", e)
        }
    }

    private external fun nativeInstall(jsiRuntimePtr: Long, cacheDir: String)
    private external fun nativeFetchBatchToUpload(): String?
    private external fun nativeConfirmUpload(batchId: String, success: Boolean)
    private external fun nativeHasPendingCrashReport(): Boolean
    private external fun nativeConsumeCrashReport(): String?
    private external fun nativeFetchPbBatchToUpload(): ByteArray?
}
