import SwiftUI

/// شريط التنقّل الرئيسي.
///
/// أربعة أقسام لا أكثر: الألعاب، اللعب المنفرد، الصدارة، حسابي. زيادة الأقسام
/// تدفع النصوص العربية إلى القصّ في الشريط، وكل قسم إضافي يقلّل احتمال وصول
/// اللاعب للقسم الذي جاء من أجله.
struct RootTabView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        TabView {
            Tab("الألعاب", systemImage: "gamecontroller.fill") {
                CatalogView()
            }
            Tab("منفرد", systemImage: "cpu.fill") {
                SoloView()
            }
            Tab("الصدارة", systemImage: "trophy.fill") {
                LeadersView()
            }
            Tab("حسابي", systemImage: "person.crop.circle.fill") {
                ProfileView()
            }
        }
        .tint(Ink.red)
        // الشريط يُترك لطبقة النظام: iOS 26 يكسوه زجاجًا تلقائيًا، والهوية
        // تُحمل في المحتوى لا في الكروم (انظر التعليق في Style.swift).
    }
}

/// جذر التطبيق: يقرّر بين شاشة الدخول والتطبيق حسب حالة الجلسة.
struct RootView: View {
    @State private var app = AppState()

    var body: some View {
        Group {
            switch app.phase {
            case .loading:
                SplashView()
            case .signedOut:
                LoginView()
            case .signedIn:
                RootTabView()
            }
        }
        .environment(app)
        .environment(\.layoutDirection, .rightToLeft)
        .task { await app.restore() }
    }
}

private struct SplashView: View {
    var body: some View {
        ZStack {
            Ink.paper.ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "gamecontroller.fill")
                    .font(.system(size: 54))
                    .foregroundStyle(Ink.red)
                ProgressView().tint(Ink.ink)
            }
        }
    }
}
