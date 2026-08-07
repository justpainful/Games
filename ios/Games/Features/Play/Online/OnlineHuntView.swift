import SwiftUI

/// شبكة بحث أونلاين — مشهد `hunt` (هايد).
///
/// أرقام الخانات تبدأ من **1** لا من 0، ومعرّف الضغطة `cell:n` — مطابق لـ
/// `cellButtons` في `src/games/hide/game.ts`. الخانة المستبعدة تبقى ظاهرة
/// ومقفلة: إخفاؤها يفقد اللاعب إحساس تقلّص الاحتمالات وهو نصف اللعبة.
struct OnlineHuntView: View {
    let scene: HuntScene
    let socket: GameSocket

    private let columns = [GridItem(.adaptive(minimum: 62), spacing: 8)]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Card(shadow: Ink.redDeep) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        Image(systemName: "eye.slash.fill")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(Ink.red)
                        Text(scene.headline.bidiIsolated)
                            .font(.displaySoft(Type.body))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(2)
                            .minimumScaleFactor(0.6)
                        Spacer(minLength: 0)
                    }

                    if let seeker = scene.seeker {
                        HStack(spacing: 10) {
                            OnlineAvatar(player: seeker, size: 34)
                            Text("الدور على \(seeker.name.bidiIsolated)")
                                .font(.bodyArBold(Type.label))
                                .foregroundStyle(Ink.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                            Spacer(minLength: 0)
                        }
                    }

                    if let note = scene.note, !note.isEmpty {
                        Text(note.bidiIsolated)
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineSpacing(Type.lineSpacing)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            if scene.total <= 0 {
                NoticeCard(
                    symbol: "square.grid.3x3",
                    title: "لم تُفتح الشبكة بعد",
                    body: "ينتظر الخادم بدء الجولة. ستظهر الخانات هنا فور فتحها."
                )
            } else {
                grid
            }
        }
    }

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(Array(1...max(scene.total, 1)), id: \.self) { number in
                Button {
                    tap(number)
                } label: {
                    OnlineHuntCell(
                        number: number,
                        cleared: scene.cleared.contains(number),
                        enabled: isOpen(number)
                    )
                }
                .buttonStyle(.plain)
                .disabled(!isOpen(number))
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Ink.paperTint))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 6, radius: 20)
    }

    private func button(_ number: Int) -> SceneButton? {
        (socket.current?.buttons ?? []).first { $0.id == "cell:\(number)" }
    }

    private func isOpen(_ number: Int) -> Bool {
        guard socket.canAct, !scene.cleared.contains(number) else { return false }
        guard let button = button(number) else { return false }
        return !button.disabled
    }

    private func tap(_ number: Int) {
        guard let button = button(number), !button.disabled else { return }
        socket.press(button.id)
    }
}

/// خانة بحث واحدة.
private struct OnlineHuntCell: View {
    let number: Int
    let cleared: Bool
    let enabled: Bool

    var body: some View {
        ZStack {
            shape.fill(cleared ? Ink.paperTint : (enabled ? Ink.surface : Ink.cream))
            shape.strokeBorder(Ink.ink, lineWidth: 3)
            if cleared {
                Image(systemName: "xmark")
                    .font(.system(size: 20, weight: .heavy))
                    .foregroundStyle(Ink.redDeep)
            } else {
                Text(onlineNumber(number))
                    .font(.displaySoft(20))
                    .foregroundStyle(Ink.ink)
                    .monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
        .opacity(cleared ? 0.6 : 1)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
    }
}
