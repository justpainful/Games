import SwiftUI

/// شاشة الدخول — أول ما يراه اللاعب.
///
/// لا اسم ولا شعار مطبوع (DESIGN.md §5): العلامة شكل ولون وظل، والزر الأصفر
/// بظلّه الأحمر هو توقيع الهوية وهو الفعل الوحيد في الشاشة.
struct LoginView: View {
    @Environment(AppState.self) private var app

    /// حالة محلية لا في `AppState`: الانتظار يخصّ هذه الشاشة وحدها، ووضعه في
    /// الحالة المشتركة يجعل كل شاشة أخرى تُعاد رسمها بلا سبب.
    @State private var busy = false

    var body: some View {
        ZStack {
            Ink.paper.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 26) {
                    Spacer(minLength: 48)
                    mark
                    heading
                    if let error = app.lastError, !error.isEmpty {
                        errorCard(error)
                    }
                    signInButton
                    hint
                    Spacer(minLength: 32)
                }
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize)
        }
    }

    // ————— أجزاء الشاشة —————

    /// علامة شكلية: قصاصة دائرية حمراء بظل صلب — لا حروف ولا اسم.
    private var mark: some View {
        Image(systemName: "gamecontroller.fill")
            .font(.system(size: 52, weight: .black))
            .foregroundStyle(Ink.cream)
            .frame(width: 124, height: 124)
            .background(Circle().fill(Ink.red))
            .overlay(Circle().strokeBorder(Ink.ink, lineWidth: 4))
            .hardShadow(Ink.ink, lift: 7, radius: 999)
            .accessibilityHidden(true)
    }

    private var heading: some View {
        VStack(spacing: 8) {
            Text("«العب مع سيرفرك»")
                .font(.display(Type.display))
                .foregroundStyle(Ink.red)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.6)

            Text("جولات قصيرة داخل قنواتك الصوتية، ونقاطك محفوظة لكل سيرفر على حدة.")
                .font(.bodyAr(Type.body))
                .foregroundStyle(Ink.ink.opacity(0.75))
                .multilineTextAlignment(.center)
                .lineSpacing(Type.lineSpacing)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
    }

    private func errorCard(_ message: String) -> some View {
        Card(shadow: Ink.redDeep, padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Pill("تعذّر الدخول", fill: Ink.red, textColor: Ink.cream)
                Text(message)
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    /// الزر البطل: أصفر بظل أحمر — اندماج لوني الهوية (DESIGN.md §5).
    private var signInButton: some View {
        Button {
            Task { await start() }
        } label: {
            HStack(spacing: 10) {
                if busy {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Ink.ink)
                } else {
                    Image(systemName: "arrow.left.circle.fill")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Ink.ink)
                }
                Text(busy ? "جارٍ فتح ديسكورد…" : "تسجيل الدخول بديسكورد")
                    .font(.bodyArBold(Type.body))
                    .foregroundStyle(Ink.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 18)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Ink.yellow)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Ink.ink, lineWidth: 3)
            )
            .hardShadow(Ink.redDeep, lift: 6, radius: 18)
        }
        .buttonStyle(.plain)
        .disabled(busy)
        // الزر لا يختفي أثناء الانتظار — اختفاؤه يجعل الشاشة تبدو معطّلة
        .opacity(busy ? 0.9 : 1)
        .accessibilityLabel(busy ? "جارٍ تسجيل الدخول" : "تسجيل الدخول بديسكورد")
    }

    private var hint: some View {
        Text("يتم الدخول عبر ديسكورد نفسه — لا نطلب كلمة مرور أبدًا.")
            .font(.bodyAr(Type.meta))
            .foregroundStyle(Ink.ink.opacity(0.55))
            .multilineTextAlignment(.center)
            .lineSpacing(Type.lineSpacing)
            .fixedSize(horizontal: false, vertical: true)
    }

    // ————— السلوك —————

    @MainActor
    private func start() async {
        guard !busy else { return }
        busy = true
        app.lastError = nil
        await app.signIn()
        // `signIn` لا يرمي: ينجح فيبدّل الطور، أو يضع `lastError`، أو يبتلع
        // إلغاء المستخدم بلا رسالة. الشاشة تُستبدل من الجذر عند النجاح.
        busy = false
    }
}
