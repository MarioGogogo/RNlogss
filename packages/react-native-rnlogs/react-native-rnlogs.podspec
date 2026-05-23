require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-rnlogs"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/yourcompany/react-native-rnlogs"
  s.license      = "MIT"
  s.authors      = { "Your Name" => "yourname@company.com" }
  s.platforms    = { :ios => "13.4" }
  s.source       = { :git => "https://github.com/yourcompany/react-native-rnlogs.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}", "cpp/**/*.{h,cpp}"
  
  s.xcconfig     = {
    "HEADER_SEARCH_PATHS" => "\"$(PODS_TARGET_SRCROOT)/cpp/core\" \"$(PODS_TARGET_SRCROOT)/cpp/utils\" \"$(PODS_TARGET_SRCROOT)/cpp/jsi\""
  }

  s.dependency "React-Core"
  s.dependency "PLCrashReporter", "~> 1.11.0"
  
  s.libraries = "z"
end
