#!/bin/bash

# ============================================
# Android APK 构建脚本
# 用法: ./scripts/build-android.sh [debug|release]
# ============================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# 加载 nvm 并使用 Node.js v20（如果已安装）
if [ -f "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    # 尝试使用 Node.js v20
    if nvm use 20 >/dev/null 2>&1; then
        echo -e "${GREEN}[Node] 已切换到 Node.js v20${NC}"
    else
        echo -e "${YELLOW}[Node] Node.js v20 未安装，使用当前版本: $(node -v)${NC}"
    fi
fi

# 构建类型 (默认 release)
BUILD_TYPE="${1:-release}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  React Native Android APK 构建脚本${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}构建类型: ${BUILD_TYPE}${NC}"
echo -e "${YELLOW}项目路径: ${PROJECT_ROOT}${NC}"
echo ""

# Step 1: 清理旧的打包文件
echo -e "${GREEN}[1/5] 清理旧的 bundle 文件...${NC}"
rm -rf android/app/src/main/assets/*.bundle*
rm -rf build/outputs
mkdir -p android/app/src/main/assets

# Step 2: 打包 JS Bundle
echo -e "${GREEN}[2/5] 打包 JS Bundle...${NC}"

# 检查 Node.js 版本（Re.Pack 5.x 需要 Node.js v19+）
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$BUILD_TYPE" = "release" ] && [ "$NODE_VERSION" -lt 19 ]; then
    echo -e "${RED}  ⚠️  警告：Re.Pack 5.x 需要 Node.js v19 或更高版本${NC}"
    echo -e "${YELLOW}  当前 Node.js 版本：v$(node -v)${NC}"
    echo -e "${YELLOW}  将使用 Metro 打包（不支持远程代码分割）${NC}"
    echo ""
    echo -e "${BLUE}  💡 升级建议：${NC}"
    echo -e "     nvm install 20        # 安装 Node.js v20"
    echo -e "     nvm use 20            # 使用 Node.js v20"
    echo ""

    # 直接使用 Metro CLI，绕过 Re.Pack
    # Metro 输出 .bundle.js 文件，需要重命名为 .bundle
    NODE_ENV=production npx metro build index.js \
        --platform android \
        --dev false \
        --minify true \
        --out android/app/build/generated/assets/react/release/index.android.bundle.js \
        --project-roots . \
        --reset-cache

    # 重命名 bundle 文件
    if [ -f "android/app/build/generated/assets/react/release/index.android.bundle.js" ]; then
        mv android/app/build/generated/assets/react/release/index.android.bundle.js \
           android/app/build/generated/assets/react/release/index.android.bundle
    fi
elif [ "$BUILD_TYPE" = "debug" ]; then
    echo -e "${YELLOW}  Debug 模式：从 DevServer 加载${NC}"
    # 直接使用 Metro CLI
    npx metro build index.js \
        --platform android \
        --dev true \
        --out android/app/src/main/assets/index.android.bundle \
        --project-roots . \
        --reset-cache
else
    echo -e "${YELLOW}  Release 模式：使用 Re.Pack webpack (支持远程代码分割)${NC}"
    # 使用 Re.Pack 的 webpack-bundle 命令构建主包和远程分包
    # 远程分包会输出到 build/outputs/android/remotes/ 目录
    NODE_ENV=production npx react-native webpack-bundle \
        --entry-file index.js \
        --platform android \
        --dev false \
        --bundle-output android/app/build/generated/assets/react/release/index.android.bundle \
        --assets-dest android/app/src/main/res
fi

# Step 3: 显示打包结果
echo -e "${GREEN}[3/5] Bundle 打包完成，检查生成的文件...${NC}"
echo -e "${YELLOW}主包文件:${NC}"

if [ -f "android/app/build/generated/assets/react/release/index.android.bundle" ]; then
    ls -lh android/app/build/generated/assets/react/release/index.android.bundle
elif [ -f "android/app/src/main/assets/index.android.bundle" ]; then
    ls -lh android/app/src/main/assets/index.android.bundle
else
    echo "  无主 bundle 文件"
fi

echo ""
echo -e "${YELLOW}远程分包输出:${NC}"
if [ -d "build/outputs/android/remotes" ]; then
    find build/outputs/android/remotes -name "*.bundle" 2>/dev/null | while read file; do
        echo "  $(basename "$file"): $(ls -lh "$file" | awk '{print $5}')"
    done
else
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$BUILD_TYPE" = "release" ] && [ "$NODE_VERSION" -lt 19 ]; then
        echo "  ⚠️  Node.js v$(node -v) 不支持 Re.Pack 远程分包"
        echo "  📌 所有页面已打包到主包中"
    else
        echo "  无远程分包（可能需要检查配置）"
    fi
fi
echo ""

# Step 4: 生成 Codegen 并构建 APK
echo -e "${GREEN}[4/5] 生成 Codegen 并构建 Android APK...${NC}"
cd android

# 先确保 codegen 生成（New Architecture 需要）
echo -e "${YELLOW}  -> 运行 codegen...${NC}"
./gradlew generateCodegenArtifactsFromSchema --quiet

if [ "$BUILD_TYPE" = "debug" ]; then
    ./gradlew assembleDebug
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
else
    ./gradlew assembleRelease
    APK_PATH="app/build/outputs/apk/release/app-release.apk"
fi

cd ..

# Step 5: 显示结果
echo ""
echo -e "${GREEN}[5/5] 构建完成!${NC}"
echo -e "${BLUE}========================================${NC}"

if [ -f "android/$APK_PATH" ]; then
    APK_SIZE=$(ls -lh "android/$APK_PATH" | awk '{print $5}')
    echo -e "${GREEN}✅ APK 生成成功!${NC}"
    echo -e "   路径: ${YELLOW}android/$APK_PATH${NC}"
    echo -e "   大小: ${YELLOW}$APK_SIZE${NC}"
    echo ""
    
    # 询问是否安装到设备
    echo -e "${BLUE}安装到设备: ${NC}"
    echo -e "   adb install -r android/$APK_PATH"
    echo ""
    
    # 复制 APK 到项目根目录方便访问
    cp "android/$APK_PATH" "./HotelRepack-${BUILD_TYPE}.apk"
    echo -e "${GREEN}已复制 APK 到项目根目录: HotelRepack-${BUILD_TYPE}.apk${NC}"
else
    echo -e "${RED}❌ APK 生成失败，请检查错误日志${NC}"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
