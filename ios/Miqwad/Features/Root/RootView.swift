import SwiftUI

/// جذر التطبيق: إمّا شاشة الوصل وإمّا الألسنة.
///
/// الفصل حادّ عمدًا. لسان تحكّم مفتوح بلا وصلة يعرض أزرارًا لا تفعل شيئًا، ولا
/// يفهم المستخدم أن العطل في الوصلة لا في الزرّ.
struct RootView: View {
    @State private var hub = Hub()

    var body: some View {
        Group {
            switch hub.stage {
            case .connect:
                ConnectView()
            case .ready:
                shell
            }
        }
        .environment(hub)
        .tint(Ink.red)
        .task { await hub.restore() }
    }

    private var shell: some View {
        TabView {
            Tab("الرئيسية", systemImage: "gauge.with.dots.needle.bottom.50percent") {
                HomeView()
            }
            Tab("السيرفرات", systemImage: "server.rack") {
                GuildsView()
            }
            Tab("الإعدادات", systemImage: "gearshape") {
                SettingsView()
            }
        }
    }
}
