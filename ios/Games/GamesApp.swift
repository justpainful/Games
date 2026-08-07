import SwiftUI

@main
struct GamesApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                // التطبيق عربي بالكامل، فالاتجاه يُفرض على الجذر مرة واحدة
                // بدل الاعتماد على لغة الجهاز (DESIGN.md §4).
                .environment(\.layoutDirection, .rightToLeft)
        }
    }
}
