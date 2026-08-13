import SwiftUI

/// هذا الجهاز: بمن هو موصول، وكيف يُفصل.
struct SettingsView: View {
    @Environment(Hub.self) private var hub

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Metric.spaceSm) {
                TopBar("الإعدادات")

                Card {
                    VStack(spacing: 0) {
                        row("موصول بـ", hub.base ?? "لا شيء")
                        line
                        row("الدخول", hub.who.map { $0.via == "code" ? "رمز اقتران" : "ديسكورد" } ?? "—")
                        line
                        row("الحساب", hub.who?.name ?? "—")
                    }
                }

                Text("عن مِقود")
                    .font(.displaySoft(Type.title))
                    .foregroundStyle(Ink.ink)
                    .padding(.top, 6)

                Card {
                    Text("""
                    التطبيق يتكلّم مع البوت على شبكتك مباشرة، بلا خادم في الإنترنت وبلا نفق. \
                    فإن كان البوت مطفأ أو كنت خارج البيت لن يجد شيئًا، وهذا هو المقصود.
                    """)
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink.opacity(0.75))
                    .lineSpacing(Type.lineSpacing)
                }

                Button("فصل هذا الجهاز") { hub.signOut() }
                    .buttonStyle(BigButton(fill: Ink.red, ink: Ink.cream))
                    .padding(.top, 6)
            }
            .padding(Metric.spaceSm)
        }
        .background(Ink.paper)
    }

    private var line: some View {
        Rectangle().fill(Ink.ink.opacity(0.12)).frame(height: 1).padding(.vertical, 8)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.bodyAr(Type.label))
                .foregroundStyle(Ink.ink.opacity(0.7))
            Spacer(minLength: 12)
            Text(value.bidiIsolated)
                .font(.bodyArBold(Type.label))
                .foregroundStyle(Ink.ink)
                .multilineTextAlignment(.trailing)
        }
    }
}
