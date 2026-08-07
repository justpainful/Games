import SwiftUI

/// لوحة خانات أونلاين — مشهد `board` (إكس أو، أربعة في صف).
///
/// الضغطة تُترجم إلى **معرّف زر من الخادم** لا إلى فهرس مخترع: إكس أو يرسل
/// `cell:index` وأربعة في صف يرسل `col:column` (انظر `gridButtons` في
/// `src/games/turns.ts` و`src/games/eshbek/game.ts`). الشاشة تبحث عن الزر
/// المطابق، وإن لم تجده لم تُفعّل الخانة — أفضل من إرسال معرّف يُرفض بصمت.
struct OnlineBoardView: View {
    let scene: BoardScene
    let socket: GameSocket

    private var rows: Int { scene.rows }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            statusCard
            board
            if let note = scene.note, !note.isEmpty {
                Text(note.bidiIsolated)
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
            }
        }
    }

    // ————— أجزاء —————

    private var statusCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: scene.winning.isEmpty ? "hand.tap.fill" : "flag.checkered")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Ink.red)
                    Text(turnText)
                        .font(.bodyArBold(Type.label))
                        .foregroundStyle(Ink.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Spacer(minLength: 0)
                }

                if !scene.sides.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(scene.sides.enumerated()), id: \.offset) { pair in
                            HStack(spacing: 10) {
                                Text(pair.element.mark.bidiIsolated)
                                    .font(.displaySoft(Type.body))
                                    .foregroundStyle(Ink.red)
                                    .frame(width: 30)
                                OnlinePlayerRow(player: pair.element.player ?? .unknown)
                            }
                        }
                    }
                }
            }
        }
    }

    private var turnText: String {
        if !scene.winning.isEmpty { return "انتهت اللوحة" }
        guard let turn = scene.turnOf else { return "في انتظار الخادم…" }
        if turn.id == socket.meID { return "دورك" }
        return "دور \(turn.name.bidiIsolated)"
    }

    private var board: some View {
        VStack(spacing: 8) {
            ForEach(Array(0..<max(rows, 0)), id: \.self) { row in
                HStack(spacing: 8) {
                    ForEach(Array(0..<scene.cols), id: \.self) { column in
                        let index = row * scene.cols + column
                        Button {
                            tap(index: index, column: column)
                        } label: {
                            OnlineBoardCell(
                                mark: mark(at: index),
                                highlighted: scene.winning.contains(index)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(!isPlayable(index: index, column: column))
                    }
                }
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Ink.paperTint))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 6, radius: 20)
        .frame(maxWidth: 460)
    }

    // ————— المنطق —————

    private func mark(at index: Int) -> String? {
        guard index >= 0, index < scene.cells.count else { return nil }
        return scene.cells[index]
    }

    /// الزر المطابق للخانة، إن وُجد.
    private func button(index: Int, column: Int) -> SceneButton? {
        let buttons = socket.current?.buttons ?? []
        if let cell = buttons.first(where: { $0.id == "cell:\(index)" }) { return cell }
        return buttons.first { $0.id == "col:\(column)" }
    }

    private func isPlayable(index: Int, column: Int) -> Bool {
        guard socket.canAct else { return false }
        guard let button = button(index: index, column: column) else { return false }
        return !button.disabled
    }

    private func tap(index: Int, column: Int) {
        guard let button = button(index: index, column: column), !button.disabled else { return }
        socket.press(button.id)
    }
}

/// خانة واحدة — مربّعة دائمًا مهما ضاقت الشاشة.
private struct OnlineBoardCell: View {
    let mark: String?
    let highlighted: Bool

    var body: some View {
        ZStack {
            shape.fill(highlighted ? Ink.yellow : Ink.surface)
            shape.strokeBorder(Ink.ink, lineWidth: 3)
            content
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
    }

    /// العلامات المعروفة رموز، وما عداها يُعرض كما أرسله الخادم — لعبة جديدة
    /// بعلامة لم نرَها من قبل تبقى مقروءة بدل خانة فارغة.
    @ViewBuilder
    private var content: some View {
        if let mark, !mark.isEmpty {
            switch mark {
            case "X", "x":
                Image(systemName: "xmark")
                    .font(.system(size: 26, weight: .heavy))
                    .foregroundStyle(Ink.red)
            case "O", "o":
                Image(systemName: "circle")
                    .font(.system(size: 24, weight: .heavy))
                    .foregroundStyle(Ink.ink)
            default:
                Text(mark.bidiIsolated)
                    .font(.displaySoft(22))
                    .foregroundStyle(Ink.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .padding(4)
            }
        }
    }
}
