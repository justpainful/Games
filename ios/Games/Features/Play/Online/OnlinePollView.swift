import SwiftUI

/// تصويت أونلاين — مشهد `poll`.
///
/// الخيار زرّ ونتيجة في آن: الشريط يمتلئ من جهة بداية السطر (اليمين تحت RTL)،
/// والضغط يرسل معرّف الخيار نفسه (`opt:i`) وهو المعرّف الذي يتوقّعه الخادم
/// في `collectPresses` (انظر `src/games/tasweet/game.ts`).
struct OnlinePollView: View {
    let scene: PollScene
    let socket: GameSocket

    /// الخيار الذي ضغطناه في هذا المشهد — يُبرز حتى يصل التحديث.
    @State private var chosen: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Card(shadow: Ink.redDeep) {
                VStack(alignment: .leading, spacing: 10) {
                    SmallHeading("السؤال")
                    Text(scene.question.isEmpty ? "بانتظار سؤال القائد" : scene.question.bidiIsolated)
                        .font(.displaySoft(Type.title))
                        .foregroundStyle(Ink.ink)
                        .lineSpacing(Type.lineSpacing)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if scene.options.isEmpty {
                NoticeCard(
                    symbol: "hourglass",
                    title: "لم تفتح الخيارات بعد",
                    body: "ينتظر الخادم أن يكتب القائد السؤال وخياراته. ستظهر أزرار التصويت هنا فور جاهزيتها."
                )
            } else {
                VStack(spacing: 10) {
                    ForEach(Array(scene.options.enumerated()), id: \.offset) { pair in
                        OnlinePollOptionRow(
                            option: pair.element,
                            total: scene.totalVotes,
                            picked: chosen == pair.element.id,
                            enabled: isEnabled(pair.element)
                        ) {
                            chosen = pair.element.id
                            socket.press(pair.element.id)
                        }
                    }
                }
            }

            HStack(spacing: 8) {
                Pill("\(onlineNumber(scene.totalVotes)) صوتًا")
                if let note = scene.note, !note.isEmpty {
                    Text(note.bidiIsolated)
                        .font(.bodyArBold(Type.meta))
                        .foregroundStyle(Ink.redDeep)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                }
                Spacer(minLength: 0)
            }
        }
        .onChange(of: scene.question) { _, _ in chosen = nil }
    }

    /// الخيار قابل للضغط ما دام له زر مفعّل في المشهد ولم نصوّت بعد.
    private func isEnabled(_ option: PollOption) -> Bool {
        guard socket.canAct else { return false }
        let buttons = socket.current?.buttons ?? []
        guard !buttons.isEmpty else { return false }
        guard let button = buttons.first(where: { $0.id == option.id }) else { return false }
        return !button.disabled
    }
}

/// صف خيار: شريط نسبة + عدد أصوات.
private struct OnlinePollOptionRow: View {
    let option: PollOption
    let total: Int
    let picked: Bool
    let enabled: Bool
    let tap: () -> Void

    private var fraction: Double {
        guard total > 0 else { return 0 }
        return min(1, max(0, Double(option.votes) / Double(total)))
    }

    var body: some View {
        Button(action: tap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    if let player = option.player {
                        OnlineAvatar(player: player, size: 30)
                    }
                    Text(option.label.bidiIsolated)
                        .font(.bodyArBold(Type.label))
                        .foregroundStyle(Ink.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 8)
                    Text(onlineNumber(option.votes))
                        .font(.displaySoft(Type.body))
                        .foregroundStyle(picked ? Ink.red : Ink.ink)
                        .monospacedDigit()
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Ink.paperTint)
                        Capsule()
                            .fill(picked ? Ink.red : Ink.yellow)
                            .frame(width: max(0, geo.size.width * fraction))
                    }
                }
                .frame(height: 10)
                .overlay(Capsule().strokeBorder(Ink.ink, lineWidth: 2))
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(enabled ? Ink.surface : Ink.paperTint)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Ink.ink, lineWidth: 3)
            )
            .hardShadow(picked ? Ink.redDeep : Ink.ink, lift: 5, radius: 16)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityElement(children: .combine)
    }
}
