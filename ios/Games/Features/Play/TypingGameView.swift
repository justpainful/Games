import SwiftUI
import Observation

/// محرّك جولات الكتابة ضد الخصم الآلي.
///
/// المؤقّت `Task` قابل للإلغاء لا `Timer.publish`: الخروج من الشاشة يجب أن
/// يُسكت الجولة فورًا، وإلا استمرّت النقاط تتغيّر في الخلفية وعاد اللاعب إلى
/// مباراة انتهت بلا أن يلعبها.
@MainActor
@Observable
final class TypingEngine {
    enum Side: Equatable { case me, bot, nobody }
    enum Phase: Equatable {
        case playing
        case reveal(Side)
        case done
    }

    let game: GameInfo
    let skill: Skill
    let roundSeconds: Double
    let roundCount: Int

    private(set) var questions: [LocalQuestion] = []
    private(set) var index = 0
    private(set) var myScore = 0
    private(set) var botScore = 0
    private(set) var elapsed: Double = 0
    private(set) var phase: Phase = .playing
    private(set) var notice: String?
    /// آخر جولة: هل ردّ البوت قبل اللاعب؟ يُعرض عند الكشف.
    private(set) var lastWinner: Side = .nobody

    /// ما يكتبه اللاعب — الحقل يربط به مباشرة.
    var typed = ""

    private var botAt: Double?
    private var started = false
    private var ticker: Task<Void, Never>?
    private var advance: Task<Void, Never>?

    /// `nonisolated` عمدًا: `View.init` غير معزول، وبناء المحرّك يحدث فيه.
    // `@Observable` يحوّل الخصائص المخزّنة إلى setters معزولة بـ MainActor،
    // فـ `nonisolated init` لا يستطيع إسنادها. الحل عزل المُهيّئ لا نزع العزل.
    init(game: GameInfo, skill: Skill) {
        self.game = game
        self.skill = skill
        self.roundCount = game.id == "event" ? 10 : 7
        self.roundSeconds = game.id == "khammen" ? 24 : 20
    }

    // ————— قراءة —————

    var current: LocalQuestion? {
        index < questions.count ? questions[index] : nil
    }

    var remaining: Double { max(0, roundSeconds - elapsed) }

    var roundNumber: Int { min(index + 1, max(questions.count, 1)) }

    var isOver: Bool { phase == .done }

    /// تلميحات التخمين تُكشف تباعًا مع الوقت — ثلاثة دفعة واحدة تلغي اللعبة.
    var visibleHints: [String] {
        guard let question = current, !question.hints.isEmpty else { return [] }
        if case .reveal = phase { return question.hints }
        let step = roundSeconds / Double(question.hints.count + 1)
        guard step > 0 else { return question.hints }
        let shown = min(question.hints.count, Int(elapsed / step) + 1)
        return Array(question.hints.prefix(shown))
    }

    var result: GameResult {
        GameResult(gameTitle: game.title,
                   mine: myScore,
                   rival: botScore,
                   note: "انتهت \(questions.count) جولات.")
    }

    // ————— دورة الحياة —————

    func appear() {
        if !started {
            started = true
            questions = LocalQuestions.rounds(for: game, count: roundCount)
            guard !questions.isEmpty else {
                phase = .done
                return
            }
            beginRound()
        } else if phase == .playing, ticker == nil {
            // عودة من شاشة أخرى فوقها — تُستأنف الجولة بدل أن تتجمّد
            startTicker()
        }
    }

    func stop() {
        ticker?.cancel()
        ticker = nil
        advance?.cancel()
        advance = nil
    }

    func replay() {
        stop()
        questions = LocalQuestions.rounds(for: game, count: roundCount)
        index = 0
        myScore = 0
        botScore = 0
        lastWinner = .nobody
        guard !questions.isEmpty else {
            phase = .done
            return
        }
        beginRound()
    }

    // ————— اللعب —————

    func submit() {
        guard phase == .playing, let question = current else { return }
        let raw = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else {
            notice = "اكتب إجابتك أولًا"
            return
        }
        if LocalQuestions.matches(raw, question: question) {
            myScore += 1
            finish(.me)
        } else {
            notice = "ليست الإجابة الصحيحة — حاول مرة أخرى"
            typed = ""
        }
    }

    private func beginRound() {
        elapsed = 0
        typed = ""
        notice = nil
        phase = .playing
        botAt = Bots.quiz.attempt(skill: skill, roundSeconds: roundSeconds)
        startTicker()
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 100_000_000)
                if Task.isCancelled { return }
                self?.tick()
            }
        }
    }

    private func tick() {
        guard phase == .playing else { return }
        elapsed += 0.1
        if let botAt, elapsed >= botAt {
            botScore += 1
            finish(.bot)
            return
        }
        if elapsed >= roundSeconds { finish(.nobody) }
    }

    private func finish(_ winner: Side) {
        ticker?.cancel()
        ticker = nil
        lastWinner = winner
        phase = .reveal(winner)
        notice = nil
        advance?.cancel()
        advance = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_900_000_000)
            if Task.isCancelled { return }
            self?.next()
        }
    }

    private func next() {
        advance = nil
        index += 1
        if index >= questions.count {
            phase = .done
            stop()
        } else {
            beginRound()
        }
    }
}

/// شاشة ألعاب الكتابة: سؤال كبير، حقل عربي، مؤقّت، ونقاط.
struct TypingGameView: View {
    @State private var engine: TypingEngine
    @FocusState private var fieldFocused: Bool

    @MainActor
    init(game: GameInfo, skill: Skill = BotSettings.skill) {
        _engine = State(initialValue: TypingEngine(game: game, skill: skill))
    }

    var body: some View {
        GameScreen(title: engine.game.title, trailing: engine.skill.title) {
            if engine.questions.isEmpty && engine.isOver {
                NoticeCard(symbol: "tray.fill",
                           title: "لا توجد أسئلة محلية",
                           body: "هذه اللعبة لا تملك مجموعة أسئلة على الجهاز بعد. جرّب لعبة أخرى من قسم «منفرد».")
            } else if engine.isOver {
                ResultView(result: engine.result) { engine.replay() }
            } else {
                scoreRow
                TimerBar(remaining: engine.remaining, total: engine.roundSeconds)
                questionCard
                answerRow
                revealBanner
            }
        }
        .onAppear {
            engine.appear()
            fieldFocused = true
        }
        .onDisappear { engine.stop() }
        .navigationBarTitleDisplayMode(.inline)
    }

    // ————— أجزاء —————

    private var scoreRow: some View {
        HStack(spacing: 12) {
            ScoreTile(name: "أنت", score: engine.myScore,
                      highlighted: engine.myScore > engine.botScore)
            ScoreTile(name: Bots.displayName, score: engine.botScore,
                      highlighted: engine.botScore > engine.myScore)
        }
    }

    private var questionCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Text("الجولة")
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink)
                    Text("\(engine.roundNumber)")
                        .font(.bodyArBold(Type.meta))
                        .foregroundStyle(Ink.red)
                    Text("من")
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink)
                    Text("\(engine.questions.count)")
                        .font(.bodyArBold(Type.meta))
                        .foregroundStyle(Ink.ink)
                    Spacer(minLength: 0)
                }

                if let question = engine.current {
                    Text(question.lead)
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)

                    // العزل الاتجاهي إلزامي: «12 - 5» بلا عزل تُعرض «5 - 12».
                    Text(question.prompt.bidiIsolated)
                        .font(.display(promptSize(for: question.prompt)))
                        .foregroundStyle(Ink.red)
                        .lineSpacing(Type.lineSpacing)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .minimumScaleFactor(0.5)

                    if !engine.visibleHints.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(engine.visibleHints.enumerated()), id: \.offset) { _, hint in
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "lightbulb.fill")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(Ink.red)
                                    Text(hint)
                                        .font(.bodyAr(Type.label))
                                        .foregroundStyle(Ink.ink)
                                        .lineSpacing(Type.lineSpacing)
                                    Spacer(minLength: 0)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private var answerRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                TextField("اكتب إجابتك", text: $engine.typed)
                    .textFieldStyle(.plain)
                    .font(.bodyAr(Type.body))
                    .foregroundStyle(Ink.ink)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .submitLabel(.send)
                    .focused($fieldFocused)
                    .onSubmit { engine.submit() }
                    .disabled(engine.phase != .playing)
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

                Button {
                    engine.submit()
                } label: {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Ink.ink)
                        .frame(width: 54, height: 52)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(engine.phase == .playing ? Ink.yellow : Ink.paperTint)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .strokeBorder(Ink.ink, lineWidth: 3)
                        )
                        .hardShadow(Ink.redDeep, lift: 4, radius: 16)
                }
                .buttonStyle(.plain)
                .disabled(engine.phase != .playing)
            }

            if let notice = engine.notice {
                Text(notice)
                    .font(.bodyArBold(Type.meta))
                    .foregroundStyle(Ink.redDeep)
            }
        }
    }

    @ViewBuilder
    private var revealBanner: some View {
        if case .reveal(let side) = engine.phase, let question = engine.current {
            VStack(alignment: .leading, spacing: 8) {
                Text(revealTitle(side))
                    .font(.bodyArBold(Type.body))
                    .foregroundStyle(Ink.cream)
                HStack(spacing: 8) {
                    Text("الإجابة:")
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.cream)
                    Text(question.shownAnswer.bidiIsolated)
                        .font(.bodyArBold(Type.label))
                        .foregroundStyle(Ink.cream)
                        .lineLimit(2)
                        .minimumScaleFactor(0.6)
                    Spacer(minLength: 0)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            // شريط محتوى لا كروم: يبقى مسطّحًا بحدّ وظل صلبين، بلا زجاج.
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(side == .me ? Ink.redDeep : Ink.ink)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Ink.ink, lineWidth: 3)
            )
            .hardShadow(Ink.ink, lift: 5, radius: 18)
        }
    }

    private func revealTitle(_ side: TypingEngine.Side) -> String {
        switch side {
        case .me: return "إجابة صحيحة — نقطة لك"
        case .bot: return "سبقك \(Bots.displayName)"
        case .nobody: return "انتهى وقت الجولة"
        }
    }

    /// السؤال الطويل يحتاج حجمًا أصغر وإلا خرج عن البطاقة في الشاشات الصغيرة.
    private func promptSize(for prompt: String) -> CGFloat {
        switch prompt.count {
        case 0...6: return Type.display
        case 7...18: return 27
        default: return Type.title
        }
    }
}
