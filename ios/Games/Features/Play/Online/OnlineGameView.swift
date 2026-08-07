import SwiftUI

/// موزّع شاشات اللعب الأونلاين حسب `scene.kind`.
///
/// الشاشة كلها مدفوعة بالمشهد القادم من الخادم: لا محرّك محلي ولا حالة موازية.
/// السبب أن نفس المشهد يُرسم في ديسكورد صورةً وهنا مكوّنات أصلية، وأي منطق
/// يُعاد بناؤه هنا يصير مصدر حقيقة ثانيًا يختلف عن الأول بعد أول تعديل.
struct OnlineGameView: View {
    let game: GameInfo
    let socket: GameSocket
    var onLeave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if socket.joinedRunning && socket.stage == .playing {
                joinedRunningCard
            }

            if let message = socket.lastError {
                errorCard(message)
            }

            if case .closed(let reason) = socket.state {
                lostCard(reason)
            }

            sceneView

            if let text = socket.current?.text {
                OnlineTextCard(text: text)
            }

            let extras = extraButtons
            if !extras.isEmpty {
                OnlineButtonsRow(buttons: extras, enabled: socket.canAct) { id in
                    socket.press(id)
                }
            }

            OnlineLogCard(messages: socket.log)

            if socket.stage == .ended {
                resultSection
            } else {
                ActionButton("مغادرة الجولة", systemImage: "rectangle.portrait.and.arrow.right",
                             kind: .quiet) {
                    socket.leave()
                    onLeave()
                }
            }
        }
    }

    // ————— توزيع المشهد —————

    @ViewBuilder
    private var sceneView: some View {
        switch socket.current?.scene {
        case .some(.round(let data)):
            OnlineTypingView(scene: data, socket: socket)
        case .some(.board(let data)):
            OnlineBoardView(scene: data, socket: socket)
        case .some(.duel(let data)):
            OnlineDuelView(scene: data, socket: socket)
        case .some(.wheel(let data)):
            OnlineWheelView(scene: data, socket: socket)
        case .some(.poll(let data)):
            OnlinePollView(scene: data, socket: socket)
        case .some(.roles(let data)):
            OnlineRolesView(scene: data, socket: socket)
        case .some(.hunt(let data)):
            OnlineHuntView(scene: data, socket: socket)
        case .some(.standings(let data)):
            OnlineStandingsCard(
                heading: data.heading ?? "الترتيب",
                rows: data.rows.map { row -> (player: ScenePlayer, score: Int) in
                    (player: row.player, score: row.score)
                }
            )
        case .some(.lobby(let data)):
            OnlineLobbyCard(scene: data, socket: socket)
        case .some(.notice(let data)):
            NoticeCard(symbol: noticeSymbol(data.tone),
                       title: (data.title.isEmpty ? "تنبيه" : data.title).bidiIsolated,
                       body: (data.detail ?? "").bidiIsolated)
        case .some(.panel(let data)):
            OnlinePanelCard(scene: data)
        case .some(.leaders(let data)):
            OnlineStandingsCard(
                heading: data.title.isEmpty ? "الصدارة" : data.title,
                rows: data.rows.map { row -> (player: ScenePlayer, score: Int) in
                    (player: row.player, score: row.points)
                }
            )
        case .some(.profile(let data)):
            OnlineProfileCard(scene: data)
        case .some(.unknown(let kind)):
            OnlineUnknownCard(kind: kind, text: socket.current?.text)
        case .none:
            waitingCard
        }
    }

    private func noticeSymbol(_ tone: String) -> String {
        switch tone {
        case "ok": return "checkmark.seal.fill"
        case "warn": return "exclamationmark.triangle.fill"
        default: return "info.circle.fill"
        }
    }

    /// الأزرار التي لم تستهلكها شاشة المشهد — «إيقاف» مثلًا يبقى ظاهرًا دائمًا.
    private var extraButtons: [SceneButton] {
        let all = socket.current?.buttons ?? []
        guard let scene = socket.current?.scene else { return all }
        switch scene {
        case .board:
            return all.filter { !$0.id.hasPrefix("cell:") && !$0.id.hasPrefix("col:") }
        case .hunt:
            return all.filter { !$0.id.hasPrefix("cell:") }
        case .poll(let data):
            let taken = Set(data.options.map(\.id))
            return all.filter { !taken.contains($0.id) }
        default:
            return all
        }
    }

    // ————— بطاقات الحالة —————

    private var waitingCard: some View {
        Card(padding: 24) {
            VStack(spacing: 12) {
                ProgressView().tint(Ink.ink)
                Text("بانتظار أول مشهد من الخادم…")
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var joinedRunningCard: some View {
        Card(shadow: Ink.redDeep, padding: 14) {
            HStack(spacing: 12) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Ink.red)
                VStack(alignment: .leading, spacing: 4) {
                    Text("دخلت جولة جارية")
                        .font(.displaySoft(Type.body))
                        .foregroundStyle(Ink.ink)
                    Text("«\(game.title)» بدأت في قناة السيرفر، وأنت تتابعها وتلعبها من هنا.")
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink)
                        .lineSpacing(Type.lineSpacing)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func errorCard(_ message: String) -> some View {
        Card(shadow: Ink.redDeep, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Pill("رسالة من الخادم", fill: Ink.red, textColor: Ink.cream)
                    Spacer(minLength: 0)
                    Button {
                        socket.lastError = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Ink.ink)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("إخفاء الرسالة")
                }
                Text(SceneCopy.plain(message).bidiIsolated)
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func lostCard(_ reason: String?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            NoticeCard(
                symbol: "wifi.exclamationmark",
                title: "انقطع الاتصال",
                body: reason ?? "انتهت الوصلة بالخادم. الجولة قد تكون مستمرة في السيرفر — أعد الاتصال لتتابعها."
            )
            ActionButton("أعد الاتصال", systemImage: "arrow.clockwise", kind: .hero) {
                socket.retry()
            }
            ActionButton("رجوع للغرف", systemImage: "chevron.backward", kind: .quiet) {
                socket.leave()
                onLeave()
            }
        }
    }

    // ————— النتيجة —————

    private var resultSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Card(shadow: Ink.redDeep) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        Image(systemName: winnerIsMe ? "crown.fill" : "flag.checkered")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(Ink.red)
                        Text(verdict)
                            .font(.display(Type.title))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(2)
                            .minimumScaleFactor(0.6)
                        Spacer(minLength: 0)
                    }
                    Text("انتهت «\(game.title)». النقاط أُضيفت إلى محفظتك في هذا السيرفر.")
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)
                        .lineSpacing(Type.lineSpacing)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if !ranked.isEmpty {
                OnlineStandingsCard(heading: "النتيجة النهائية",
                                    rows: ranked,
                                    winnerID: socket.result?.winnerId)
            }

            ActionButton("رجوع للغرف", systemImage: "chevron.backward", kind: .hero) {
                socket.leave()
                onLeave()
            }
        }
    }

    private var winnerIsMe: Bool {
        guard let winner = socket.result?.winnerId, let meID = socket.meID else { return false }
        return winner == meID
    }

    private var verdict: String {
        guard let result = socket.result else { return "انتهت الجولة" }
        guard let winner = result.winnerId else { return "انتهت الجولة بلا فائز" }
        if winner == socket.meID { return "فزت!" }
        let name = socket.players.first { $0.id == winner }?.name ?? winner
        return "فاز \(name.bidiIsolated)"
    }

    /// نقاط النهاية مرتّبة تنازليًا، وكل معرّف يُترجم إلى لاعب معروف إن أمكن.
    private var ranked: [(player: ScenePlayer, score: Int)] {
        guard let scores = socket.result?.scores, !scores.isEmpty else { return [] }
        return scores
            .map { entry -> (player: ScenePlayer, score: Int) in
                let player = socket.players.first { $0.id == entry.key }
                    ?? ScenePlayer(id: entry.key, name: entry.key)
                return (player: player, score: entry.value)
            }
            // ترتيب ثابت: القاموس بلا ترتيب، والتساوي بلا فاصل يعيد ترتيب
            // الصفوف عشوائيًا في كل إعادة رسم
            .sorted { $0.score == $1.score ? $0.player.id < $1.player.id : $0.score > $1.score }
    }
}

/// مشهد لوبي وصل أثناء اللعب — تُعرض بطاقته كما هي.
struct OnlineLobbyCard: View {
    let scene: LobbyScene
    let socket: GameSocket

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    SmallHeading("في الغرفة")
                    Spacer(minLength: 8)
                    // المدى معزول: رقمان يفصلهما محرف محايد ينقلب ترتيبهما تحت RTL
                    Pill("\(onlineNumber(scene.players.count))/\(onlineNumber(max(scene.max, scene.players.count)))".bidiIsolated)
                }
                if scene.players.isEmpty {
                    Text("لا لاعبين بعد.")
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)
                } else {
                    OnlineRoster(players: scene.players,
                                 hostID: scene.host?.id,
                                 meID: socket.meID)
                }
            }
        }
    }
}

/// لوحة بنود — مشهد `panel` (تقسيم الفرق، الإعدادات).
struct OnlinePanelCard: View {
    let scene: PanelScene

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                SmallHeading(scene.title.isEmpty ? "لوحة" : scene.title)

                if let subtitle = scene.subtitle, !subtitle.isEmpty {
                    Text(subtitle.bidiIsolated)
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)
                        .lineSpacing(Type.lineSpacing)
                }

                ForEach(Array(scene.items.enumerated()), id: \.offset) { pair in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: (pair.element.on ?? true) ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Ink.red)
                        Text(pair.element.label.bidiIsolated)
                            .font(.bodyArBold(Type.label))
                            .foregroundStyle(Ink.ink)
                        Spacer(minLength: 8)
                        Text(pair.element.value.bidiIsolated)
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                            .minimumScaleFactor(0.7)
                    }
                }

                if let footer = scene.footer, !footer.isEmpty {
                    Text(footer.bidiIsolated)
                        .font(.bodyAr(Type.meta))
                        .foregroundStyle(Ink.ink)
                        .lineSpacing(Type.lineSpacing)
                }
            }
        }
    }
}

/// بطاقة نقاط لاعب — مشهد `profile`.
struct OnlineProfileCard: View {
    let scene: ProfileScene

    var body: some View {
        Card(shadow: Ink.redDeep) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    OnlineAvatar(player: scene.player, size: 52, ringed: true)
                    Text(scene.player.name.bidiIsolated)
                        .font(.displaySoft(Type.body))
                        .foregroundStyle(Ink.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Spacer(minLength: 0)
                    if let rank = scene.rank, rank > 0 {
                        Pill("المركز \(onlineNumber(rank))")
                    }
                }

                HStack(spacing: 12) {
                    ScoreTile(name: "فردية", score: scene.solo, highlighted: false)
                    ScoreTile(name: "جماعية", score: scene.team, highlighted: false)
                    ScoreTile(name: "روليت", score: scene.roulette, highlighted: false)
                }

                HStack(spacing: 12) {
                    ScoreTile(name: "المجموع", score: scene.total, highlighted: true)
                    ScoreTile(name: "فوز", score: scene.wins, highlighted: false)
                    ScoreTile(name: "لعبت", score: scene.gamesPlayed, highlighted: false)
                }
            }
        }
    }
}
