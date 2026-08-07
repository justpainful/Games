import SwiftUI

/// جولة كتابة أونلاين — مشهد `round`.
///
/// الحقل يبقى مفتوحًا بعد الإرسال: في اللعب الجماعي الإجابة الخاطئة لا تُقصي،
/// وإقفال الحقل بعد أول محاولة يحرم اللاعب من الثانية بينما الجولة ما زالت
/// مفتوحة على الخادم.
struct OnlineTypingView: View {
    let scene: RoundScene
    let socket: GameSocket

    @State private var typed = ""
    @State private var sent = false
    @FocusState private var focused: Bool

    private var canSend: Bool {
        socket.state.isOpen && !typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            promptCard
            answerRow
        }
        .onChange(of: scene.index) { _, _ in
            typed = ""
            sent = false
        }
        .onChange(of: scene.prompt) { _, _ in
            typed = ""
            sent = false
        }
    }

    // ————— أجزاء —————

    private var promptCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Text("الجولة")
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink)
                    Text(onlineNumber(max(scene.index, 1)))
                        .font(.bodyArBold(Type.meta))
                        .foregroundStyle(Ink.red)
                        .monospacedDigit()
                    if scene.total > 0 {
                        Text("من")
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink)
                        Text(onlineNumber(scene.total))
                            .font(.bodyArBold(Type.meta))
                            .foregroundStyle(Ink.ink)
                            .monospacedDigit()
                    }
                    Spacer(minLength: 0)
                    if sent { Pill("أُرسلت") }
                }

                // العزل إلزامي: «12 - 5» بلا عزل تُعرض «5 - 12».
                Text(scene.prompt.bidiIsolated)
                    .font(.display(promptSize))
                    .foregroundStyle(Ink.red)
                    .lineSpacing(Type.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .minimumScaleFactor(0.5)
                    .fixedSize(horizontal: false, vertical: true)

                if let hint = scene.hint, !hint.isEmpty {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "lightbulb.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Ink.red)
                        Text(hint.bidiIsolated)
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineSpacing(Type.lineSpacing)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private var answerRow: some View {
        HStack(spacing: 10) {
            TextField("اكتب إجابتك", text: $typed)
                .textFieldStyle(.plain)
                .font(.bodyAr(Type.body))
                .foregroundStyle(Ink.ink)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.send)
                .focused($focused)
                .onSubmit(send)
                .disabled(!socket.state.isOpen)
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Ink.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(Ink.ink, lineWidth: 3)
                )
                .hardShadow(Ink.ink, lift: 4, radius: 16)

            Button(action: send) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Ink.ink)
                    .frame(width: 54, height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(canSend ? Ink.yellow : Ink.paperTint)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(Ink.ink, lineWidth: 3)
                    )
                    .hardShadow(Ink.redDeep, lift: 4, radius: 16)
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
        }
    }

    private func send() {
        guard canSend else { return }
        socket.answer(typed)
        typed = ""
        sent = true
    }

    /// السؤال الطويل يحتاج حجمًا أصغر وإلا خرج عن البطاقة في الشاشات الصغيرة.
    private var promptSize: CGFloat {
        switch scene.prompt.count {
        case 0...6: return Type.display
        case 7...18: return 27
        default: return Type.title
        }
    }
}
