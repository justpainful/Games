import SwiftUI

@main
struct MiqwadApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                // التطبيق عربي بالكامل ولا يتبع لغة الجهاز: عناوينه ونصوصه
                // مكتوبة عربية، وقلبها إلى LTR يترك أرقامًا وعلامات في الطرف
                // الخطأ من كل سطر
                .environment(\.layoutDirection, .rightToLeft)
                .preferredColorScheme(.light)
        }
    }
}
