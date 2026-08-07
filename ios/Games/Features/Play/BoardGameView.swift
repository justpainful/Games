import SwiftUI
import Observation

/// محرّك ألعاب اللوحة: إكس أو (3×3) وأربعة في صف (7×6).
///
/// اللوحة مصفوفة مسطّحة صفًا بعد صف — نفس شكل ما يتوقّعه `Bots.board`. الفهرس
/// وحده هو لغة التخاطب مع الخصم، فانعكاس العرض تحت RTL لا يمسّ المنطق.
@MainActor
@Observable
final class BoardEngine {
    enum Turn: Equatable { case me, bot, over }

    let game: GameInfo
    let skill: Skill
    let cols: Int
    let rows: Int
    /// كم علامة متتالية تفوز.
    let connect: Int
    let myMark = "X"
    let botMark = "O"
    /// أربعة في صف: القطعة تسقط في العمود ولا تُوضع في أي خانة.
    var isDrop: Bool { connect == 4 }

    private(set) var cells: [String?]
    private(set) var turn: Turn = .me
    private(set) var winner: String?
    private(set) var winningLine: [Int] = []
    private(set) var myWins = 0
    private(set) var botWins = 0
    private(set) var draws = 0

    private var botTask: Task<Void, Never>?

    nonisolated init(game: GameInfo, skill: Skill) {
        self.game = game
        self.skill = skill
        if game.id == "eshbek" {
            self.cols = 7
            self.rows = 6
            self.connect = 4
        } else {
            self.cols = 3
            self.rows = 3
            self.connect = 3
        }
        self.cells = Array(repeating: nil, count: (game.id == "eshbek" ? 42 : 9))
    }

    // ————— قراءة —————

    var isOver: Bool { turn == .over }

    var statusText: String {
        switch turn {
        case .me: return "دورك"
        case .bot: return "يفكّر \(Bots.displayName)…"
        case .over:
            if winner == myMark { return "فزت بهذه الجولة" }
            if winner == botMark { return "فاز \(Bots.displayName) بهذه الجولة" }
            return "تعادل"
        }
    }

    var result: GameResult {
        GameResult(gameTitle: game.title,
                   mine: myWins,
                   rival: botWins,
                   note: draws > 0 ? "تعادلات: \(draws)" : nil)
    }

    func mark(at index: Int) -> String? {
        guard index >= 0, index < cells.count else { return nil }
        return cells[index]
    }

    // ————— دورة الحياة —————

    func stop() {
        botTask?.cancel()
        botTask = nil
    }

    func replay() {
        stop()
        cells = Array(repeating: nil, count: rows * cols)
        winner = nil
        winningLine = []
        turn = .me
    }

    // ————— اللعب —————

    /// ضغطة اللاعب على خانة. الضغط المزدوج السريع لا يضرّ: الدور يتحوّل فورًا.
    func play(_ index: Int) {
        guard turn == .me, winner == nil else { return }
        guard let target = landing(for: index) else { return }
        cells[target] = myMark
        if settle() { return }
        turn = .bot
        scheduleBot()
    }

    private func landing(for index: Int) -> Int? {
        guard index >= 0, index < cells.count else { return nil }
        if isDrop { return lowestEmpty(inColumn: index % cols) }
        return cells[index] == nil ? index : nil
    }

    private func lowestEmpty(inColumn column: Int) -> Int? {
        guard column >= 0, column < cols else { return nil }
        var row = rows - 1
        while row >= 0 {
            let index = row * cols + column
            if cells[index] == nil { return index }
            row -= 1
        }
        return nil
    }

    private func scheduleBot() {
        botTask?.cancel()
        botTask = Task { [weak self] in
            guard let self else { return }
            let delay = Double.random(in: self.skill.thinkRange)
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            if Task.isCancelled { return }
            self.playBot()
        }
    }

    private func playBot() {
        guard turn == .bot, winner == nil else { return }
        let raw = Bots.board.move(board: cells, cols: cols, me: botMark, rival: myMark, skill: skill)
        // نقلة الخصم تُصفّى دائمًا: خانة مشغولة أو فهرس خارج اللوحة تُجمّد اللعبة.
        let chosen = raw.flatMap { landing(for: $0) } ?? anyLegalMove()
        guard let target = chosen else {
            turn = .over
            draws += 1
            return
        }
        cells[target] = botMark
        if settle() { return }
        turn = .me
    }

    private func anyLegalMove() -> Int? {
        if isDrop {
            let columns = (0..<cols).shuffled()
            for column in columns {
                if let index = lowestEmpty(inColumn: column) { return index }
            }
            return nil
        }
        return cells.indices.filter { cells[$0] == nil }.randomElement()
    }

    /// يحسم الجولة إن انتهت. يعيد `true` إن لم يبقَ لعب.
    private func settle() -> Bool {
        if let line = findLine(for: myMark) {
            winner = myMark
            winningLine = line
            myWins += 1
            turn = .over
            return true
        }
        if let line = findLine(for: botMark) {
            winner = botMark
            winningLine = line
            botWins += 1
            turn = .over
            return true
        }
        if !cells.contains(where: { $0 == nil }) {
            winner = nil
            winningLine = []
            draws += 1
            turn = .over
            return true
        }
        return false
    }

    private func findLine(for mark: String) -> [Int]? {
        let directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
        for start in cells.indices {
            for direction in directions {
                if let line = line(from: start, dx: direction.0, dy: direction.1, mark: mark) {
                    return line
                }
            }
        }
        return nil
    }

    private func line(from start: Int, dx: Int, dy: Int, mark: String) -> [Int]? {
        var column = start % cols
        var row = start / cols
        var found: [Int] = []
        for _ in 0..<connect {
            guard row >= 0, row < rows, column >= 0, column < cols else { return nil }
            let index = row * cols + column
            guard cells[index] == mark else { return nil }
            found.append(index)
            column += dx
            row += dy
        }
        return found
    }
}

/// شاشة ألعاب اللوحة: شبكة تفاعلية وخط فائز مُبرز.
struct BoardGameView: View {
    @State private var engine: BoardEngine

    init(game: GameInfo, skill: Skill = BotSettings.skill) {
        _engine = State(initialValue: BoardEngine(game: game, skill: skill))
    }

    var body: some View {
        GameScreen(title: engine.game.title, trailing: engine.skill.title) {
            HStack(spacing: 12) {
                ScoreTile(name: "أنت", score: engine.myWins,
                          highlighted: engine.myWins > engine.botWins)
                ScoreTile(name: Bots.displayName, score: engine.botWins,
                          highlighted: engine.botWins > engine.myWins)
            }

            Card {
                HStack(spacing: 10) {
                    Image(systemName: engine.isOver ? "flag.checkered" : "hand.tap.fill")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Ink.red)
                    Text(engine.statusText)
                        .font(.bodyArBold(Type.label))
                        .foregroundStyle(Ink.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Spacer(minLength: 0)
                }
            }

            board

            if engine.isDrop {
                Text("اضغط على أي خانة في العمود لتسقط قطعتك فيه.")
                    .font(.bodyAr(Type.meta))
                    .foregroundStyle(Ink.ink)
            }

            if engine.isOver {
                ResultView(result: engine.result) { engine.replay() }
            }
        }
        .onDisappear { engine.stop() }
        .navigationBarTitleDisplayMode(.inline)
    }

    private var board: some View {
        VStack(spacing: 8) {
            ForEach(Array(0..<engine.rows), id: \.self) { row in
                HStack(spacing: 8) {
                    ForEach(Array(0..<engine.cols), id: \.self) { column in
                        let index = row * engine.cols + column
                        Button {
                            engine.play(index)
                        } label: {
                            BoardCell(mark: engine.mark(at: index),
                                      rounded: engine.isDrop,
                                      highlighted: engine.winningLine.contains(index))
                        }
                        .buttonStyle(.plain)
                        .disabled(engine.turn != .me)
                    }
                }
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Ink.surface))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 6, radius: 20)
        .frame(maxWidth: 460)
    }
}

/// خانة واحدة — مربّعة دائمًا مهما ضاقت الشاشة.
private struct BoardCell: View {
    let mark: String?
    /// أربعة في صف قطعه دائرية، وإكس أو خاناته مربّعة.
    let rounded: Bool
    let highlighted: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: rounded ? 999 : 12, style: .continuous)
                .fill(fill)
            RoundedRectangle(cornerRadius: rounded ? 999 : 12, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
            if !rounded, let symbol {
                Image(systemName: symbol)
                    .font(.system(size: 26, weight: .heavy))
                    .foregroundStyle(mark == "X" ? Ink.red : Ink.ink)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
    }

    private var symbol: String? {
        switch mark {
        case "X": return "xmark"
        case "O": return "circle"
        default: return nil
        }
    }

    private var fill: Color {
        if highlighted { return Ink.yellow }
        guard rounded else { return Ink.surface }
        switch mark {
        case "X": return Ink.red
        case "O": return Ink.yellow
        default: return Ink.paperTint
        }
    }
}
