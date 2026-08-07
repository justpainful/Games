import SwiftUI
import Observation

/// محرّك المواجهات: حجرة ورقة مقص، والنرد.
///
/// الاختيار يُخفى ثم يُكشف: كشف اختيار اللاعب قبل ردّ الخصم يحوّل اللعبة إلى
/// اختبار سرعة قراءة، ويُفقد المواجهة معناها كاملًا.
@MainActor
@Observable
final class DuelEngine {
    enum Kind { case rps, dice }
    enum Stage: Equatable { case choosing, revealing, roundOver, done }

    let game: GameInfo
    let skill: Skill
    let kind: Kind
    /// حجرة ورقة مقص: أفضل من خمس جولات. النرد: ثلاث رميات.
    let totalRounds: Int
    let options = ["حجرة", "ورقة", "مقص"]

    private(set) var stage: Stage = .choosing
    private(set) var round = 1
    private(set) var myScore = 0
    private(set) var botScore = 0
    private(set) var myPick: String?
    private(set) var botPick: String?
    private(set) var myFace: Int?
    private(set) var botFace: Int?
    private(set) var myTotal = 0
    private(set) var botTotal = 0
    private(set) var roundNote: String?

    /// تاريخ اختيارات اللاعب — هذا ما يقرأه `Bots.duel` ليتعلّم النمط.
    private var history: [String] = []
    private var work: Task<Void, Never>?

    nonisolated init(game: GameInfo, skill: Skill) {
        self.game = game
        self.skill = skill
        self.kind = game.id == "nard" ? .dice : .rps
        self.totalRounds = game.id == "nard" ? 3 : 5
    }

    // ————— قراءة —————

    var isOver: Bool { stage == .done }

    var isBusy: Bool { stage == .revealing }

    var statusText: String {
        switch stage {
        case .choosing:
            return kind == .rps ? "اختر سرًا" : "ارمِ النرد"
        case .revealing:
            return "\(Bots.displayName) يختار…"
        case .roundOver:
            return roundNote ?? "انتهت الجولة"
        case .done:
            return "انتهت المواجهة"
        }
    }

    var result: GameResult {
        if kind == .dice {
            return GameResult(gameTitle: game.title,
                              mine: myTotal,
                              rival: botTotal,
                              note: "مجموع ثلاث رميات لكل طرف.")
        }
        return GameResult(gameTitle: game.title,
                          mine: myScore,
                          rival: botScore,
                          note: "أفضل من \(totalRounds) جولات.")
    }

    // ————— دورة الحياة —————

    func stop() {
        work?.cancel()
        work = nil
    }

    func replay() {
        stop()
        stage = .choosing
        round = 1
        myScore = 0
        botScore = 0
        myTotal = 0
        botTotal = 0
        myPick = nil
        botPick = nil
        myFace = nil
        botFace = nil
        roundNote = nil
        history = []
    }

    // ————— حجرة ورقة مقص —————

    func choose(_ option: String) {
        guard kind == .rps, stage == .choosing, options.contains(option) else { return }
        myPick = option
        botPick = nil
        stage = .revealing
        work?.cancel()
        work = Task { [weak self] in
            guard let self else { return }
            let delay = Double.random(in: self.skill.thinkRange)
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            if Task.isCancelled { return }
            self.revealRPS(myChoice: option)
        }
    }

    private func revealRPS(myChoice: String) {
        let raw = Bots.duel.choose(history: history, options: options, skill: skill)
        let theirs = options.contains(raw) ? raw : (options.randomElement() ?? "حجرة")
        botPick = theirs
        history.append(myChoice)

        if myChoice == theirs {
            roundNote = "تعادل هذه الجولة"
        } else if beats(myChoice, theirs) {
            myScore += 1
            roundNote = "الجولة لك"
        } else {
            botScore += 1
            roundNote = "الجولة لـ\(Bots.displayName)"
        }
        stage = .roundOver
        scheduleNext()
    }

    private func beats(_ first: String, _ second: String) -> Bool {
        (first == "حجرة" && second == "مقص")
        || (first == "مقص" && second == "ورقة")
        || (first == "ورقة" && second == "حجرة")
    }

    // ————— النرد —————

    func roll() {
        guard kind == .dice, stage == .choosing else { return }
        stage = .revealing
        work?.cancel()
        work = Task { [weak self] in
            guard let self else { return }
            for _ in 0..<8 {
                try? await Task.sleep(nanoseconds: 70_000_000)
                if Task.isCancelled { return }
                self.myFace = Int.random(in: 1...6)
            }
            let mine = Int.random(in: 1...6)
            self.myFace = mine
            self.myTotal += mine

            let delay = Double.random(in: self.skill.thinkRange)
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            if Task.isCancelled { return }

            for _ in 0..<8 {
                try? await Task.sleep(nanoseconds: 70_000_000)
                if Task.isCancelled { return }
                self.botFace = Int.random(in: 1...6)
            }
            let theirs = Int.random(in: 1...6)
            self.botFace = theirs
            self.botTotal += theirs
            self.settleDice(mine: mine, theirs: theirs)
        }
    }

    private func settleDice(mine: Int, theirs: Int) {
        if mine > theirs {
            myScore += 1
            roundNote = "الرمية لك"
        } else if theirs > mine {
            botScore += 1
            roundNote = "الرمية لـ\(Bots.displayName)"
        } else {
            roundNote = "رميتان متساويتان"
        }
        stage = .roundOver
        scheduleNext()
    }

    // ————— الانتقال —————

    private func scheduleNext() {
        work?.cancel()
        work = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_700_000_000)
            if Task.isCancelled { return }
            self?.advance()
        }
    }

    private func advance() {
        work = nil
        let decided = kind == .rps && (myScore > totalRounds / 2 || botScore > totalRounds / 2)
        if decided || round >= totalRounds {
            stage = .done
            return
        }
        round += 1
        myPick = nil
        botPick = nil
        myFace = nil
        botFace = nil
        roundNote = nil
        stage = .choosing
    }
}

/// شاشة المواجهات: اختيار مخفي ثم كشف.
struct DuelGameView: View {
    @State private var engine: DuelEngine

    init(game: GameInfo, skill: Skill = BotSettings.skill) {
        _engine = State(initialValue: DuelEngine(game: game, skill: skill))
    }

    var body: some View {
        GameScreen(title: engine.game.title, trailing: engine.skill.title) {
            HStack(spacing: 12) {
                ScoreTile(name: "أنت",
                          score: engine.kind == .dice ? engine.myTotal : engine.myScore,
                          highlighted: engine.myScore > engine.botScore)
                ScoreTile(name: Bots.displayName,
                          score: engine.kind == .dice ? engine.botTotal : engine.botScore,
                          highlighted: engine.botScore > engine.myScore)
            }

            statusCard
            arena

            if engine.isOver {
                ResultView(result: engine.result) { engine.replay() }
            } else if engine.kind == .rps {
                rpsChoices
            } else {
                ActionButton("ارمِ النرد", systemImage: "dice.fill", kind: .hero,
                             isEnabled: engine.stage == .choosing) {
                    engine.roll()
                }
            }
        }
        .onDisappear { engine.stop() }
        .navigationBarTitleDisplayMode(.inline)
    }

    private var statusCard: some View {
        Card {
            HStack(spacing: 10) {
                Image(systemName: engine.isBusy ? "hourglass" : "flag.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Ink.red)
                Text(engine.statusText)
                    .font(.bodyArBold(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    Text("الجولة")
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink)
                    Text("\(engine.round)")
                        .font(.bodyArBold(Type.meta))
                        .foregroundStyle(Ink.red)
                }
            }
        }
    }

    private var arena: some View {
        HStack(spacing: 12) {
            PickTile(title: "أنت",
                     symbol: mySymbol,
                     caption: myCaption,
                     highlighted: true)
            PickTile(title: Bots.displayName,
                     symbol: botSymbol,
                     caption: botCaption,
                     highlighted: false)
        }
    }

    private var rpsChoices: some View {
        VStack(spacing: 10) {
            ForEach(engine.options, id: \.self) { option in
                ActionButton(option,
                             systemImage: DuelGameView.symbol(for: option),
                             kind: option == engine.myPick ? .hero : .quiet,
                             isEnabled: engine.stage == .choosing) {
                    engine.choose(option)
                }
            }
        }
    }

    // ————— عرض الاختيارات —————

    private var mySymbol: String {
        if engine.kind == .dice { return DuelGameView.diceSymbol(engine.myFace) }
        guard let pick = engine.myPick else { return "questionmark" }
        // قبل الكشف يبقى اختيار اللاعب مقفلًا في الواجهة أيضًا
        return engine.stage == .revealing ? "lock.fill" : DuelGameView.symbol(for: pick)
    }

    private var botSymbol: String {
        if engine.kind == .dice { return DuelGameView.diceSymbol(engine.botFace) }
        guard let pick = engine.botPick else { return "questionmark" }
        return DuelGameView.symbol(for: pick)
    }

    private var myCaption: String {
        if engine.kind == .dice {
            return engine.myFace.map { "\($0)" } ?? "—"
        }
        guard let pick = engine.myPick else { return "لم تختر بعد" }
        return engine.stage == .revealing ? "اختيارك مخفي" : pick
    }

    private var botCaption: String {
        if engine.kind == .dice {
            return engine.botFace.map { "\($0)" } ?? "—"
        }
        return engine.botPick ?? "ينتظر"
    }

    static func symbol(for option: String) -> String {
        switch option {
        case "حجرة": return "circle.fill"
        case "ورقة": return "doc.fill"
        case "مقص": return "scissors"
        default: return "questionmark"
        }
    }

    static func diceSymbol(_ face: Int?) -> String {
        guard let face, (1...6).contains(face) else { return "dice.fill" }
        return "die.face.\(face).fill"
    }
}

/// بطاقة اختيار طرف واحد.
private struct PickTile: View {
    let title: String
    let symbol: String
    let caption: String
    let highlighted: Bool

    var body: some View {
        VStack(spacing: 10) {
            Text(title.bidiIsolated)
                .font(.bodyArBold(Type.meta))
                .foregroundStyle(Ink.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Image(systemName: symbol)
                .font(.system(size: 40, weight: .bold))
                .foregroundStyle(highlighted ? Ink.red : Ink.ink)
                .frame(height: 52)
            Text(caption)
                .font(.bodyAr(Type.meta))
                .foregroundStyle(Ink.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Ink.surface))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(highlighted ? Ink.redDeep : Ink.ink, lift: 5, radius: 18)
    }
}
