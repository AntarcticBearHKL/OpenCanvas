cmake_minimum_required(VERSION 3.25)

project(vst-host LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---------------------------------------------------------------------------
# VST3 SDK (host side only).
#
# The SDK is NOT vendored in git. Clone it into external/vst3sdk, or point
# -DVST3_SDK_DIR at an existing checkout:
#   git clone --depth 1 --recurse-submodules --shallow-submodules \
#       https://github.com/steinbergmedia/vst3sdk.git external/vst3sdk
# ---------------------------------------------------------------------------
set(VST3_SDK_DIR "${CMAKE_SOURCE_DIR}/external/vst3sdk" CACHE PATH "Path to the VST3 SDK checkout")

if(NOT EXISTS "${VST3_SDK_DIR}/CMakeLists.txt")
    message(FATAL_ERROR
        "VST3 SDK not found at '${VST3_SDK_DIR}'.\n"
        "Clone it (shallow, with submodules):\n"
        "  git clone --depth 1 --recurse-submodules --shallow-submodules "
        "https://github.com/steinbergmedia/vst3sdk.git \"${CMAKE_SOURCE_DIR}/external/vst3sdk\"\n"
        "or configure with -DVST3_SDK_DIR=<path-to-vst3sdk>.")
endif()

# Force the SDK to build only the host-side static libraries: no vstgui, no
# plug-in/hosting examples, no validator and no plug-in links. This is what
# keeps the build fast and dependency-free.
set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SMTG_CREATE_PLUGIN_LINK OFF CACHE BOOL "" FORCE)
set(SMTG_RUN_VST_VALIDATOR OFF CACHE BOOL "" FORCE)

# EXCLUDE_FROM_ALL: only build the SDK targets our executable links against
# (sdk_hosting -> sdk_common -> base, pluginterfaces); skip the sample apps.
add_subdirectory("${VST3_SDK_DIR}" "${CMAKE_BINARY_DIR}/vst3sdk" EXCLUDE_FROM_ALL)

# ---------------------------------------------------------------------------
# cpp-httplib (single header, MIT) - chunked content providers back GET /audio.
# ---------------------------------------------------------------------------
include(FetchContent)
FetchContent_Declare(httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.58.0
)
FetchContent_MakeAvailable(httplib)

# ---------------------------------------------------------------------------
# Host executable
# ---------------------------------------------------------------------------
add_executable(vst-host
    src/main.cpp
    src/config.cpp
    src/lifecycle.cpp
    src/scan.cpp
    src/instance.cpp
    src/server.cpp
    src/worker.cpp
    src/worker_child.cpp
    # SDK hosting pieces that sdk_hosting does not compile in.
    "${VST3_SDK_DIR}/public.sdk/source/vst/hosting/module_win32.cpp"
    "${VST3_SDK_DIR}/public.sdk/source/vst/hosting/plugprovider.cpp"
    "${VST3_SDK_DIR}/public.sdk/source/common/memorystream.cpp"
)

target_include_directories(vst-host PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src" "${VST3_SDK_DIR}")
target_link_libraries(vst-host PRIVATE sdk_hosting httplib::httplib)
target_compile_features(vst-host PRIVATE cxx_std_17)

if(MSVC)
    target_compile_options(vst-host PRIVATE /utf-8 /EHsc /permissive-)
    target_compile_definitions(vst-host PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN _CRT_SECURE_NO_WARNINGS)
    target_link_options(vst-host PRIVATE /SUBSYSTEM:CONSOLE)
    # GetExtendedTcpTable: report who holds the port before binding over it.
    target_link_libraries(vst-host PRIVATE iphlpapi)
endif()

# Predictable output path for both single- and multi-config generators:
# vst-host/build/bin/vst-host.exe
set_target_properties(vst-host PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
    RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_BINARY_DIR}/bin"
    RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}/bin"
    RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO "${CMAKE_BINARY_DIR}/bin"
)
