import SwiftUI

#if DEBUG
enum RelayScreenshotAppearance {
    static var preferredColorScheme: ColorScheme? {
        let args = ProcessInfo.processInfo.arguments
        if let index = args.firstIndex(of: "-RelayAppearance"),
           args.index(after: index) < args.count {
            switch args[args.index(after: index)].lowercased() {
            case "dark": return .dark
            case "light": return .light
            default: break
            }
        }
        if let env = ProcessInfo.processInfo.environment["RELAY_APPEARANCE"]?.lowercased() {
            switch env {
            case "dark": return .dark
            case "light": return .light
            default: break
            }
        }
        return nil
    }
}
#endif
