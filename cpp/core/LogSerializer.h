#pragma once
#include <string>
#include <vector>

namespace rnlogs {

class LogSerializer {
public:
    // 将一整批 JSON 格式的日志序列化为符合 protobuf 规则的二进制流 (对应 batch.proto 中的 LogBatch)
    static std::string serializeBatch(const std::vector<std::string>& jsonLogs, 
                                      const std::string& batchId, 
                                      const std::string& sessionId);
};

} // namespace rnlogs
