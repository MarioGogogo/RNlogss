#!/bin/bash

# ============================================
# Android APK 构建脚本 - 使用 Re.Pack (支持代码分割)
# 用法: ./scripts/build-android-repack.sh [debug|release]
# ============================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# 构建类型 (默认 release)
BUILD_TYPE="${1:-release}"

# 记录开始时间
START_TIME=$(date +%s)

# ============================================
# 辅助函数
# ============================================

# 打印带颜色的步骤标题
print_step() {
    local step=$1
    local total=$2
    local message=$3
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${GREEN}  [$step/$total]${NC} ${BOLD}$message${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 打印子步骤
print_substep() {
    echo -e "  ${DIM}→${NC} $1"
}

# 打印成功消息
print_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

# 打印警告消息
print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

# 打印信息
print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

# 简单的旋转动画（用于后台任务）
spinner() {
    local pid=$1
    local message=$2
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0
    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) % 10 ))
        printf "\r  ${CYAN}${spin:$i:1}${NC} ${message}..."
        sleep 0.1
    done
    printf "\r"
}

# 显示进度条
show_progress() {
    local current=$1
    local total=$2
    local width=40
    local percentage=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))
    
    printf "\r  ${CYAN}["
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    printf "]${NC} ${BOLD}%3d%%${NC}" $percentage
}

# 格式化时间
format_time() {
    local seconds=$1
    if [ $seconds -lt 60 ]; then
        echo "${seconds}秒"
    else
        local minutes=$((seconds / 60))
        local secs=$((seconds % 60))
        echo "${minutes}分${secs}秒"
    fi
}

# 格式化文件大小
format_size() {
    local size=$1
    if [ $size -lt 1024 ]; then
        echo "${size}B"
    elif [ $size -lt 1048576 ]; then
        echo "$((size / 1024))KB"
    else
        echo "$((size / 1048576))MB"
    fi
}

# ============================================
# 构建开始
# ============================================

clear
echo ""
echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║${NC}  ${BOLD}🚀 React Native Android APK 构建脚本${NC}                       ${MAGENTA}║${NC}"
echo -e "${MAGENTA}║${NC}     ${DIM}Using Re.Pack (Rspack) with Code Splitting${NC}              ${MAGENTA}║${NC}"
echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}📦${NC} 项目: ${BOLD}HotelRepack${NC}"
echo -e "  ${BLUE}🔧${NC} 模式: ${BOLD}${BUILD_TYPE}${NC}"
echo -e "  ${BLUE}📁${NC} 路径: ${DIM}${PROJECT_ROOT}${NC}"
echo ""

# ============================================
# 版本号管理
# ============================================
BUILD_GRADLE="android/app/build.gradle"

# 读取当前版本信息
CURRENT_VERSION_NAME=$(grep -E "versionName\s+" "$BUILD_GRADLE" | head -1 | sed 's/.*"\(.*\)".*/\1/')
CURRENT_VERSION_CODE=$(grep -E "versionCode\s+" "$BUILD_GRADLE" | head -1 | awk '{print $2}')

# 解析版本号 (major.minor.patch)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION_NAME"
MAJOR=${MAJOR:-1}
MINOR=${MINOR:-0}
PATCH=${PATCH:-0}

# 计算建议的新版本（patch +1）
NEW_PATCH=$((PATCH + 1))
SUGGESTED_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"
SUGGESTED_CODE=$((CURRENT_VERSION_CODE + 1))

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  📋 版本管理${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  当前版本: ${YELLOW}${CURRENT_VERSION_NAME}${NC} (versionCode: ${CURRENT_VERSION_CODE})"
echo -e "  建议版本: ${GREEN}${SUGGESTED_VERSION}${NC} (versionCode: ${SUGGESTED_CODE})"
echo ""
echo -e "  ${DIM}按 Enter 使用建议版本，或输入新版本号 (如 1.2.0):${NC}"
echo ""
printf "  ${BOLD}新版本号${NC} [${GREEN}${SUGGESTED_VERSION}${NC}]: "
read -r USER_VERSION

# 使用用户输入或默认值
if [ -z "$USER_VERSION" ]; then
    NEW_VERSION="$SUGGESTED_VERSION"
else
    NEW_VERSION="$USER_VERSION"
fi

# 验证版本号格式
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "  ${YELLOW}⚠ 版本号格式不正确，使用建议版本: ${SUGGESTED_VERSION}${NC}"
    NEW_VERSION="$SUGGESTED_VERSION"
fi

# 计算新的 versionCode
IFS='.' read -r NEW_MAJOR NEW_MINOR NEW_PATCH <<< "$NEW_VERSION"
NEW_VERSION_CODE=$((NEW_MAJOR * 10000 + NEW_MINOR * 100 + NEW_PATCH))
# 确保 versionCode 至少比当前大
if [ $NEW_VERSION_CODE -le $CURRENT_VERSION_CODE ]; then
    NEW_VERSION_CODE=$((CURRENT_VERSION_CODE + 1))
fi

echo ""
echo -e "  ${GREEN}✓${NC} 将更新为: ${BOLD}${NEW_VERSION}${NC} (versionCode: ${NEW_VERSION_CODE})"

# 更新 build.gradle
sed -i '' "s/versionCode $CURRENT_VERSION_CODE/versionCode $NEW_VERSION_CODE/" "$BUILD_GRADLE"
sed -i '' "s/versionName \"$CURRENT_VERSION_NAME\"/versionName \"$NEW_VERSION\"/" "$BUILD_GRADLE"
echo -e "  ${GREEN}✓${NC} 已更新 ${DIM}android/app/build.gradle${NC}"

# 更新 package.json
PACKAGE_JSON="package.json"
CURRENT_PKG_VERSION=$(grep -E '"version"' "$PACKAGE_JSON" | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
sed -i '' "s/\"version\": \"$CURRENT_PKG_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
echo -e "  ${GREEN}✓${NC} 已更新 ${DIM}package.json${NC}"
echo ""

# ============================================
# Step 1: 清理
# ============================================
print_step 1 5 "清理旧的构建文件"

print_substep "删除旧 bundle 文件..."
rm -rf android/app/src/main/assets/*.bundle* 2>/dev/null || true
rm -rf android/app/build/generated/assets/react/release/* 2>/dev/null || true
rm -rf build/outputs 2>/dev/null || true
print_success "旧文件已清理"

print_substep "创建输出目录..."
mkdir -p android/app/src/main/assets
mkdir -p android/app/build/generated/assets/react/release
print_success "目录准备完成"

# ============================================
# Step 2: 打包 JS Bundle
# ============================================
print_step 2 5 "打包 JavaScript Bundle"

if [ "$BUILD_TYPE" = "debug" ]; then
    print_info "Debug 模式：使用 Metro 打包"
    npx react-native bundle \
        --entry-file index.js \
        --platform android \
        --dev true \
        --bundle-output android/app/src/main/assets/index.android.bundle \
        --assets-dest android/app/src/main/res
else
    print_info "Release 模式：使用 Re.Pack Rspack 打包 + Hermes 优化"
    echo ""
    HERMES_ENABLED=true NODE_ENV=production npx react-native webpack-bundle \
        --entry-file index.js \
        --platform android \
        --dev false \
        --bundle-output android/app/build/generated/assets/react/release/index.android.bundle \
        --assets-dest android/app/src/main/res \
        --config rspack.config.mjs 2>&1 | grep -E "(asset|compiled|error)" | head -20
fi

print_success "JavaScript Bundle 打包完成"

# ============================================
# Step 2.5: 分离远程分包（从主包目录剪切到独立输出目录）
# ============================================
print_info "分离远程分包..."
REMOTE_OUTPUT_DIR="build/outputs/android/remotes"
mkdir -p "$REMOTE_OUTPUT_DIR"

BUNDLE_DIR="android/app/build/generated/assets/react/release"
CHUNK_MOVED=0
for chunk_file in "$BUNDLE_DIR"/*.chunk.bundle; do
    [ -f "$chunk_file" ] || continue
    mv "$chunk_file" "$REMOTE_OUTPUT_DIR/"
    CHUNK_MOVED=$((CHUNK_MOVED + 1))
done
rm -f "$BUNDLE_DIR"/*.chunk.bundle.map 2>/dev/null || true

if [ $CHUNK_MOVED -gt 0 ]; then
    print_success "已将 $CHUNK_MOVED 个远程分包移至 $REMOTE_OUTPUT_DIR/"
else
    print_info "未发现分包文件（可能所有代码在主包中）"
fi

# ============================================
# Step 3: 检查打包结果
# ============================================
print_step 3 5 "检查打包结果"

# 检查主包
MAIN_BUNDLE=""
if [ -f "android/app/build/generated/assets/react/release/index.android.bundle" ]; then
    MAIN_BUNDLE="android/app/build/generated/assets/react/release/index.android.bundle"
elif [ -f "android/app/src/main/assets/index.android.bundle" ]; then
    MAIN_BUNDLE="android/app/src/main/assets/index.android.bundle"
fi

if [ -n "$MAIN_BUNDLE" ]; then
    BUNDLE_SIZE=$(ls -lh "$MAIN_BUNDLE" | awk '{print $5}')
    print_success "主包: ${BOLD}index.android.bundle${NC} (${YELLOW}$BUNDLE_SIZE${NC})"
else
    print_warning "未找到主包文件"
fi

# 检查分包
CHUNK_COUNT=$(find build/outputs/android/remotes -name "*.chunk.bundle" 2>/dev/null | wc -l | tr -d ' ')
if [ "$CHUNK_COUNT" -gt 0 ]; then
    print_success "分包数量: ${BOLD}$CHUNK_COUNT${NC} 个"
    find build/outputs/android/remotes -name "*.chunk.bundle" 2>/dev/null | while read file; do
        CHUNK_NAME=$(basename "$file")
        CHUNK_SIZE=$(ls -lh "$file" | awk '{print $5}')
        echo -e "      ${DIM}└─${NC} $CHUNK_NAME (${YELLOW}$CHUNK_SIZE${NC})"
    done
else
    print_info "无远程分包（所有代码在主包中）"
fi

# ============================================
# Step 4: 构建 APK
# ============================================
print_step 4 5 "构建 Android APK"

cd android

print_substep "运行 Codegen..."
./gradlew generateCodegenArtifactsFromSchema --quiet 2>/dev/null || true
print_success "Codegen 完成"

echo ""
print_substep "编译 APK..."
echo ""

# 预估构建时间（秒）- 根据历史经验设置
ESTIMATED_TIME=60

# 构建 APK（后台运行）
if [ "$BUILD_TYPE" = "debug" ]; then
    ./gradlew assembleDebug --console=plain > /tmp/gradle_build.log 2>&1 &
    GRADLE_PID=$!
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
else
    ./gradlew assembleRelease --console=plain > /tmp/gradle_build.log 2>&1 &
    GRADLE_PID=$!
fi

# 动画进度条
PROGRESS_WIDTH=50
BUILD_START=$(date +%s)
LAST_TASK=""

while kill -0 $GRADLE_PID 2>/dev/null; do
    ELAPSED=$(($(date +%s) - BUILD_START))
    
    # 计算进度百分比（使用非线性函数，避免卡在99%）
    if [ $ELAPSED -lt $ESTIMATED_TIME ]; then
        # 前期快速增长，后期缓慢增长
        PROGRESS=$((ELAPSED * 90 / ESTIMATED_TIME))
    else
        # 超过预估时间后缓慢增长到99%
        EXTRA=$((ELAPSED - ESTIMATED_TIME))
        PROGRESS=$((90 + EXTRA / 10))
        [ $PROGRESS -gt 99 ] && PROGRESS=99
    fi
    
    # 计算进度条填充
    FILLED=$((PROGRESS * PROGRESS_WIDTH / 100))
    EMPTY=$((PROGRESS_WIDTH - FILLED))
    
    # 获取最新的 Gradle 任务
    CURRENT_TASK=$(tail -1 /tmp/gradle_build.log 2>/dev/null | grep -oE "Task :[^[:space:]]+" | tail -1 | cut -d':' -f2- || echo "")
    [ -z "$CURRENT_TASK" ] && CURRENT_TASK="编译中..."
    
    # 限制任务名长度
    if [ ${#CURRENT_TASK} -gt 30 ]; then
        CURRENT_TASK="${CURRENT_TASK:0:27}..."
    fi
    
    # 格式化已用时间
    if [ $ELAPSED -lt 60 ]; then
        TIME_STR="${ELAPSED}s"
    else
        TIME_STR="$((ELAPSED / 60))m $((ELAPSED % 60))s"
    fi
    
    # 根据进度选择颜色（渐变效果：黄色 → 绿色）
    if [ $PROGRESS -lt 30 ]; then
        BAR_COLOR='\033[38;5;220m'  # 金黄色
    elif [ $PROGRESS -lt 60 ]; then
        BAR_COLOR='\033[38;5;178m'  # 橙黄色
    elif [ $PROGRESS -lt 80 ]; then
        BAR_COLOR='\033[38;5;106m'  # 黄绿色
    else
        BAR_COLOR='\033[38;5;40m'   # 亮绿色
    fi
    
    # 显示进度条
    printf "\r  ${BAR_COLOR}["
    for ((i=0; i<FILLED; i++)); do printf "█"; done
    printf "${DIM}"
    for ((i=0; i<EMPTY; i++)); do printf "░"; done
    printf "${NC}${BAR_COLOR}]${NC} ${BOLD}%3d%%${NC} ${DIM}${TIME_STR}${NC}  ${CYAN}${CURRENT_TASK}${NC}    " $PROGRESS
    
    sleep 0.3
done

# 等待 Gradle 完成并获取退出码
wait $GRADLE_PID
GRADLE_EXIT=$?

# 完成进度条
printf "\r  ${GREEN}["
for ((i=0; i<PROGRESS_WIDTH; i++)); do printf "█"; done
printf "]${NC} ${BOLD}100%%${NC}                                        \n"

# 检查构建结果
if [ $GRADLE_EXIT -ne 0 ]; then
    echo ""
    print_warning "Gradle 构建失败，显示错误日志："
    tail -20 /tmp/gradle_build.log
    cd ..
    exit 1
fi

# 查找 APK（release 模式）
if [ "$BUILD_TYPE" != "debug" ]; then
    if [ -f "app/build/outputs/apk/release/app-arm64-v8a-release.apk" ]; then
        APK_PATH="app/build/outputs/apk/release/app-arm64-v8a-release.apk"
    elif [ -f "app/build/outputs/apk/release/app-universal-release.apk" ]; then
        APK_PATH="app/build/outputs/apk/release/app-universal-release.apk"
    else
        APK_PATH=$(ls app/build/outputs/apk/release/*-release.apk 2>/dev/null | head -1)
    fi
fi

print_success "APK 编译完成"

cd ..

# ============================================
# Step 5: 显示结果
# ============================================
print_step 5 5 "构建完成"

# 计算耗时
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_STR=$(format_time $DURATION)

if [ -f "android/$APK_PATH" ]; then
    APK_SIZE=$(ls -lh "android/$APK_PATH" | awk '{print $5}')
    
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ${BOLD}✅ APK 构建成功!${NC}                                          ${GREEN}║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BLUE}📱${NC} APK 路径: ${DIM}android/$APK_PATH${NC}"
    echo -e "  ${BLUE}📦${NC} 文件大小: ${BOLD}${YELLOW}$APK_SIZE${NC}"
    echo -e "  ${BLUE}⏱${NC}  构建耗时: ${BOLD}$DURATION_STR${NC}"
    echo ""
    
    # 列出所有生成的 APK
    echo -e "  ${CYAN}生成的 APK 文件:${NC}"
    find "android/app/build/outputs/apk" -name "*.apk" 2>/dev/null | while read file; do
        APK_NAME=$(basename "$file")
        APK_FILE_SIZE=$(ls -lh "$file" | awk '{print $5}')
        echo -e "      ${DIM}├─${NC} $APK_NAME (${YELLOW}$APK_FILE_SIZE${NC})"
    done
    echo ""
    
    # 复制 APK 到项目根目录
    if [ -f "android/app/build/outputs/apk/release/app-arm64-v8a-release.apk" ]; then
        cp "android/app/build/outputs/apk/release/app-arm64-v8a-release.apk" "./HotelRepack-${BUILD_TYPE}-arm64-v8a.apk"
        print_success "已复制: HotelRepack-${BUILD_TYPE}-arm64-v8a.apk"
    fi
    
    if [ -f "android/app/build/outputs/apk/release/app-universal-release.apk" ]; then
        cp "android/app/build/outputs/apk/release/app-universal-release.apk" "./HotelRepack-${BUILD_TYPE}-universal.apk"
        print_success "已复制: HotelRepack-${BUILD_TYPE}-universal.apk"
    fi
    
    echo ""
    echo -e "  ${MAGENTA}💡 安装命令:${NC}"
    echo -e "     ${DIM}adb install -r android/$APK_PATH${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║${NC}  ${BOLD}❌ APK 构建失败${NC}                                            ${RED}║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${RED}请检查上方的错误日志${NC}"
    echo ""
    exit 1
fi

echo -e "${MAGENTA}══════════════════════════════════════════════════════════════${NC}"
