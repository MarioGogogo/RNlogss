#include "LogSerializer.h"
#include <chrono>
#include <map>
#include <algorithm>

namespace rnlogs {

namespace {

// ==================== Protobuf 基础二进制编码工具 ====================

void writeVarint(uint64_t val, std::string& buf) {
    while (val >= 0x80) {
        buf.push_back(static_cast<char>((val & 0x7F) | 0x80));
        val >>= 7;
    }
    buf.push_back(static_cast<char>(val & 0x7F));
}

void writeTag(uint32_t fieldNumber, uint32_t wireType, std::string& buf) {
    writeVarint((fieldNumber << 3) | wireType, buf);
}

void writeString(uint32_t fieldNumber, const std::string& str, std::string& buf) {
    if (str.empty()) return;
    writeTag(fieldNumber, 2, buf);
    writeVarint(str.length(), buf);
    buf.append(str);
}

void writeVarintField(uint32_t fieldNumber, uint64_t val, std::string& buf) {
    writeTag(fieldNumber, 0, buf);
    writeVarint(val, buf);
}

void writeMessage(uint32_t fieldNumber, const std::string& serializedSubMsg, std::string& buf) {
    if (serializedSubMsg.empty()) return;
    writeTag(fieldNumber, 2, buf);
    writeVarint(serializedSubMsg.length(), buf);
    buf.append(serializedSubMsg);
}

// ==================== 自包含轻量级 JSON 提取工具 ====================

std::string extractString(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\"";
    size_t pos = json.find(searchKey);
    if (pos == std::string::npos) return "";
    
    pos = json.find(":", pos + searchKey.length());
    if (pos == std::string::npos) return "";
    
    size_t start = json.find("\"", pos);
    if (start == std::string::npos) return "";
    
    size_t end = json.find("\"", start + 1);
    while (end != std::string::npos && json[end - 1] == '\\') {
        end = json.find("\"", end + 1);
    }
    if (end == std::string::npos) return "";
    
    return json.substr(start + 1, end - start - 1);
}

long long extractInt(const std::string& json, const std::string& key, long long defaultVal = 0) {
    std::string searchKey = "\"" + key + "\"";
    size_t pos = json.find(searchKey);
    if (pos == std::string::npos) return defaultVal;
    
    pos = json.find(":", pos + searchKey.length());
    if (pos == std::string::npos) return defaultVal;
    
    size_t start = json.find_first_not_of(" \t\r\n", pos + 1);
    if (start == std::string::npos) return defaultVal;
    
    size_t end = json.find_first_of(",} \t\r\n", start);
    if (end == std::string::npos) end = json.length();
    
    try {
        return std::stoll(json.substr(start, end - start));
    } catch (...) {
        return defaultVal;
    }
}

std::string extractObject(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\"";
    size_t pos = json.find(searchKey);
    if (pos == std::string::npos) return "";
    
    pos = json.find(":", pos + searchKey.length());
    if (pos == std::string::npos) return "";
    
    size_t start = json.find("{", pos);
    if (start == std::string::npos) return "";
    
    int braceCount = 1;
    bool inString = false;
    for (size_t i = start + 1; i < json.length(); i++) {
        char c = json[i];
        if (c == '"' && json[i - 1] != '\\') {
            inString = !inString;
        }
        if (!inString) {
            if (c == '{') braceCount++;
            else if (c == '}') {
                braceCount--;
                if (braceCount == 0) {
                    return json.substr(start, i - start + 1);
                }
            }
        }
    }
    return "";
}

std::string extractArray(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\"";
    size_t pos = json.find(searchKey);
    if (pos == std::string::npos) return "";
    
    pos = json.find(":", pos + searchKey.length());
    if (pos == std::string::npos) return "";
    
    size_t start = json.find("[", pos);
    if (start == std::string::npos) return "";
    
    int bracketCount = 1;
    bool inString = false;
    for (size_t i = start + 1; i < json.length(); i++) {
        char c = json[i];
        if (c == '"' && json[i - 1] != '\\') {
            inString = !inString;
        }
        if (!inString) {
            if (c == '[') bracketCount++;
            else if (c == ']') {
                bracketCount--;
                if (bracketCount == 0) {
                    return json.substr(start, i - start + 1);
                }
            }
        }
    }
    return "";
}

std::map<std::string, std::string> parseMap(const std::string& json) {
    std::map<std::string, std::string> m;
    size_t pos = json.find("{");
    if (pos == std::string::npos) return m;
    pos++;
    while (pos < json.length()) {
        size_t kStart = json.find("\"", pos);
        if (kStart == std::string::npos) break;
        size_t kEnd = json.find("\"", kStart + 1);
        if (kEnd == std::string::npos) break;
        std::string key = json.substr(kStart + 1, kEnd - kStart - 1);
        
        size_t colon = json.find(":", kEnd);
        if (colon == std::string::npos) break;
        
        size_t vStart = json.find("\"", colon);
        if (vStart == std::string::npos) break;
        size_t vEnd = json.find("\"", vStart + 1);
        while (vEnd != std::string::npos && json[vEnd - 1] == '\\') {
            vEnd = json.find("\"", vEnd + 1);
        }
        if (vEnd == std::string::npos) break;
        std::string val = json.substr(vStart + 1, vEnd - vStart - 1);
        
        m[key] = val;
        pos = vEnd + 1;
    }
    return m;
}

std::vector<std::string> parseArrayOfObjects(const std::string& arrayJson) {
    std::vector<std::string> result;
    size_t start = arrayJson.find("[");
    if (start == std::string::npos) return result;
    
    int braceCount = 0;
    size_t objStart = 0;
    bool inString = false;
    for (size_t i = start + 1; i < arrayJson.length(); i++) {
        char c = arrayJson[i];
        if (c == '"' && arrayJson[i - 1] != '\\') {
            inString = !inString;
        }
        if (!inString) {
            if (c == '{') {
                if (braceCount == 0) {
                    objStart = i;
                }
                braceCount++;
            } else if (c == '}') {
                braceCount--;
                if (braceCount == 0) {
                    result.push_back(arrayJson.substr(objStart, i - objStart + 1));
                }
            }
        }
    }
    return result;
}

// ==================== 单个子消息的 Protobuf 序列化 ====================

std::string serializeUserInfo(const std::string& userJson) {
    if (userJson.empty()) return "";
    std::string id = extractString(userJson, "id");
    std::string name = extractString(userJson, "name");
    std::string email = extractString(userJson, "email");
    
    std::string buf;
    writeString(1, id, buf);
    writeString(2, name, buf);
    writeString(3, email, buf);
    return buf;
}

std::string serializeLogContext(const std::string& contextJson) {
    if (contextJson.empty()) return "";
    std::string env = extractString(contextJson, "environment");
    std::string rel = extractString(contextJson, "release");
    
    std::string buf;
    writeString(1, env, buf);
    writeString(2, rel, buf);
    return buf;
}

std::string serializeBreadcrumb(const std::string& bcJson) {
    uint64_t ts = extractInt(bcJson, "timestamp", 0);
    std::string cat = extractString(bcJson, "category");
    std::string msg = extractString(bcJson, "message");
    
    std::string buf;
    writeVarintField(1, ts, buf);
    writeString(2, cat, buf);
    writeString(3, msg, buf);
    return buf;
}

std::string serializeMapEntry(const std::string& key, const std::string& value) {
    std::string buf;
    writeString(1, key, buf);
    writeString(2, value, buf);
    return buf;
}

std::string serializeLogEvent(const std::string& eventJson) {
    std::string id = extractString(eventJson, "id");
    std::string type = extractString(eventJson, "type");
    std::string source = extractString(eventJson, "source");
    long long level = extractInt(eventJson, "level", 0);
    std::string levelName = extractString(eventJson, "levelName");
    std::string message = extractString(eventJson, "message");
    uint64_t timestamp = extractInt(eventJson, "timestamp", 0);
    
    // 整个 data 对象转为 JSON 字符串
    std::string dataJson = extractObject(eventJson, "data");
    
    std::string userJson = extractObject(eventJson, "user");
    std::string tagsJson = extractObject(eventJson, "tags");
    std::string contextJson = extractObject(eventJson, "context");
    std::string breadcrumbsJson = extractArray(eventJson, "breadcrumbs");

    std::string buf;
    writeString(1, id, buf);
    writeString(2, type, buf);
    writeString(3, source, buf);
    writeVarintField(4, level, buf);
    writeString(5, levelName, buf);
    writeString(6, message, buf);
    writeVarintField(7, timestamp, buf);
    writeString(8, dataJson, buf);

    // 序列化子对象
    std::string serializedUser = serializeUserInfo(userJson);
    writeMessage(9, serializedUser, buf);

    // 序列化 map tags
    if (!tagsJson.empty()) {
        auto tags = parseMap(tagsJson);
        for (const auto& pair : tags) {
            std::string entryBuf = serializeMapEntry(pair.first, pair.second);
            writeMessage(10, entryBuf, buf);
        }
    }

    std::string serializedContext = serializeLogContext(contextJson);
    writeMessage(11, serializedContext, buf);

    // 序列化 repeated breadcrumbs
    if (!breadcrumbsJson.empty()) {
        auto bcList = parseArrayOfObjects(breadcrumbsJson);
        for (const auto& bcStr : bcList) {
            std::string bcBuf = serializeBreadcrumb(bcStr);
            writeMessage(12, bcBuf, buf);
        }
    }

    return buf;
}

} // namespace

// ==================== 主入口：serializeBatch ====================

std::string LogSerializer::serializeBatch(const std::vector<std::string>& jsonLogs, 
                                          const std::string& batchId, 
                                          const std::string& sessionId) {
    uint64_t nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    std::string buf;
    writeString(1, batchId, buf);
    writeString(2, sessionId, buf);
    writeVarintField(3, nowMs, buf);

    for (const auto& jsonStr : jsonLogs) {
        std::string eventBuf = serializeLogEvent(jsonStr);
        writeMessage(4, eventBuf, buf);
    }

    return buf;
}

} // namespace rnlogs
