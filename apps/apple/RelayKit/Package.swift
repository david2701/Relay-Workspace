// swift-tools-version: 5.10
// RelayKit — shared models, API client, and design tokens for macOS + iOS.
// No SwiftUI in this package (UI apps land in a follow-up PR on a Mac with Xcode).
// tools-version 5.10 keeps the package building on Linux CI and on Apple without
// requiring Swift 6 language mode or Xcode 27.
import PackageDescription

let package = Package(
    name: "RelayKit",
    platforms: [
        .macOS(.v14),
        .iOS(.v17),
    ],
    products: [
        .library(name: "RelayKit", targets: ["RelayKit"]),
    ],
    targets: [
        .target(
            name: "RelayKit",
            path: "Sources/RelayKit"
        ),
        .testTarget(
            name: "RelayKitTests",
            dependencies: ["RelayKit"],
            path: "Tests/RelayKitTests",
            resources: [
                .copy("Fixtures"),
            ]
        ),
    ]
)
