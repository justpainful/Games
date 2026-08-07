import SwiftUI

/// شريط التنقّل الرئيسي.
///
/// أربعة أقسام لا أكثر: الألعاب، اللعب المنفرد، الصدارة، حسابي. زيادة الأقسام
/// تدفع النصوص العربية إلى القصّ في الشريط، وكل قسم إضافي يقلّل احتمال وصول
/// اللاعب للقسم الذي جاء من أجله.
struct RootTabView: View {
    var body: some View {
        // أيقونات المشروع لا SF Symbols: هندسة آبل رفيعة وحادة، وهويتنا سميكة
        // مدوّرة (DESIGN.md §5) — أيقونة النظام وسط بطاقاتنا القصاصية تبدو
        // مستعارة. الأصول مولّدة بـ `npm run gen:navicons` ومعلّمة `template`،
        // فيصبغها النظام بالأحمر عند الاختيار ويبقى سلوك iOS كما هو.
        TabView {
            Tab("الألعاب", image: "NavGames") {
                CatalogView()
            }
            Tab("منفرد", image: "NavSolo") {
                SoloView()
            }
            Tab("الصدارة", image: "NavLeaders") {
                LeadersView()
            }
            Tab("حسابي", image: "NavProfile") {
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
