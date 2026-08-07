import SwiftUI

/// لوبي اللعب في السيرفر.
///
/// الشاشة ثلاث حالات لا تلتبس: **تصفّح** الغرف النشطة، **انتظار** داخل غرفة،
/// و**لعب** مدفوع بمشاهد الخادم. الانتقال بينها يقرّره `GameSocket` لا الشاشة —
/// وصول مشهد غير `lobby` يعني أن اللعبة بدأت، سواء بدأها القائد من هنا أو
/// بدأت أصلًا في قناة ديسكورد ودخلنا عليها.
///
/// **افتراضان يحتاجان تأكيدًا** (وكيل آخر يوسّع `src/api/`):
/// 1. `GET /rooms?guildId=` يعيد الغرف النشطة. الفكّ متسامح ويقبل عدة تسميات،
///    وفشل المسار يُعرض تنبيهًا لا شاشة خطأ — إنشاء الغرفة يبقى متاحًا.
/// 2. «إنشاء غرفة» = `join` بلا `roomId` (وهو ما يفعله الخادم اليوم: يفتح جلسة
///    جديدة)، و«انضمام» = نفس الرسالة ومعها `roomId`.
struct LobbyView: View {
    let game: GameInfo

    @Environment(AppState.self) private var app
    @Environment(\.scenePhase) private var scenePhase

    @State private var socket = GameSocket()
    @State private var rooms: [GameRoom] = []
    @State private var roomsPhase: RoomsPhase = .loading

    enum RoomsPhase: Equatable {
        case loading
        case ready
        case failed(String)
    }

    var body: some View {
        GameScreen(title: game.title, trailing: "في السيرفر") {
            switch socket.stage {
            case .browsing:
                browse
            case .joining:
                joiningCard
            case .lobby:
                roomStage
            case .playing, .ended:
                OnlineGameView(game: game, socket: socket) {
                    Task { await loadRooms(spinner: false) }
                }
            }
        }
        .overlay(alignment: .top) { banner }
        .navigationBarTitleDisplayMode(.inline)
        .task { await prepare() }
        // دورة حياة التطبيق من `scenePhase` لا من إشعارات UIKit: هذه هي الحالة
        // التي تراها الشاشة فعلًا، ولا تحتاج مراقبًا يعيش خارجها.
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: socket.enterForeground()
            case .background, .inactive: socket.enterBackground()
            @unknown default: break
            }
        }
        .onDisappear {
            // الخروج من الشاشة يغلق الوصلة: جلسة مفتوحة بلا شاشة تُبقي اللاعب
            // «داخل اللعبة» على الخادم بينما هو في تبويب آخر.
            socket.leave()
        }
    }

    // ————— الشريط الطافي —————

    @ViewBuilder
    private var banner: some View {
        if socket.stage != .browsing && !socket.state.isOpen {
            OnlineStatusBanner(state: socket.state) { socket.retry() }
                .padding(.top, 6)
        }
    }

    // ————— حالة التصفّح —————

    @ViewBuilder
    private var browse: some View {
        guildCard

        // رفض الخادم يجب أن يُقرأ هنا: بلا هذه البطاقة يعود اللاعب إلى القائمة
        // كأن ضغطته ضاعت. الخادم اليوم يرفض ألعابًا بعينها برسالة صريحة.
        if let message = socket.lastError {
            NoticeCard(symbol: "exclamationmark.triangle.fill",
                       title: "تعذّر فتح الغرفة",
                       body: SceneCopy.plain(message).bidiIsolated)
        }

        if let live = runningRoom {
            discordCard(live)
        }

        roomsCard

        ActionButton("افتح غرفة جديدة", systemImage: "plus.circle.fill", kind: .hero,
                     isEnabled: activeGuild != nil) {
            create()
        }

        if activeGuild == nil {
            Text("النقاط والغرف مفصولة لكل سيرفر. أضف البوت إلى سيرفرك ثم اختره من «حسابي».")
                .font(.bodyAr(Type.meta))
                .foregroundStyle(Ink.ink)
                .lineSpacing(Type.lineSpacing)
        }

        if game.soloable {
            NavigationLink(value: PlayRoute.solo(game.id)) {
                soloLabel
            }
            .buttonStyle(.plain)
        }

        howToCard
    }

    private var guildCard: some View {
        Card(padding: 14) {
            HStack(spacing: 12) {
                if let guild = activeGuild {
                    guildIcon(guild)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("السيرفر")
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink)
                        Text(guild.name.bidiIsolated)
                            .font(.bodyArBold(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    Spacer(minLength: 8)
                    Button {
                        Task { await loadRooms(spinner: true) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(Ink.ink)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(Ink.yellow))
                            .overlay(Circle().strokeBorder(Ink.ink, lineWidth: 3))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("تحديث الغرف")
                } else {
                    Image(systemName: "server.rack")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Ink.red)
                    Text("لم تختر سيرفرًا")
                        .font(.bodyArBold(Type.label))
                        .foregroundStyle(Ink.ink)
                    Spacer(minLength: 0)
                }
            }
        }
    }

    @ViewBuilder
    private var roomsCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    SmallHeading("الغرف النشطة")
                    Spacer(minLength: 8)
                    if case .ready = roomsPhase, !rooms.isEmpty {
                        Pill("\(onlineNumber(rooms.count)) غرفة")
                    }
                }

                switch roomsPhase {
                case .loading:
                    HStack(spacing: 10) {
                        ProgressView().tint(Ink.ink)
                        Text("جارٍ جلب الغرف…")
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                        Spacer(minLength: 0)
                    }
                case .failed(let message):
                    VStack(alignment: .leading, spacing: 10) {
                        // نص الخطأ قد يحمل جسم رد الخادم — يُعزل كأي نص خارجي
                        Text(message.bidiIsolated)
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineSpacing(Type.lineSpacing)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("يمكنك فتح غرفة جديدة رغم ذلك.")
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink)
                        Button {
                            Task { await loadRooms(spinner: true) }
                        } label: {
                            Text("إعادة المحاولة")
                                .font(.bodyArBold(Type.label))
                                .foregroundStyle(Ink.ink)
                                .padding(.horizontal, 18)
                                .padding(.vertical, 10)
                                .background(Capsule().fill(Ink.yellow))
                                .overlay(Capsule().strokeBorder(Ink.ink, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                    }
                case .ready:
                    if sortedRooms.isEmpty {
                        Text("لا توجد غرفة مفتوحة الآن في هذا السيرفر. افتح واحدة وسيراها بقية اللاعبين.")
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                            .lineSpacing(Type.lineSpacing)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        ForEach(sortedRooms) { room in
                            RoomRow(room: room) { join(room) }
                        }
                    }
                }
            }
        }
    }

    /// غرفة جارية في ديسكورد لنفس اللعبة — الحالة التي يدخل فيها لاعب الجوال
    /// على جولة بدأت هناك.
    private func discordCard(_ room: GameRoom) -> some View {
        Card(shadow: Ink.redDeep) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(Ink.red)
                    Text("اللعبة بدأت في ديسكورد")
                        .font(.displaySoft(Type.body))
                        .foregroundStyle(Ink.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Spacer(minLength: 8)
                    Pill("جارية", fill: Ink.red, textColor: Ink.cream)
                }

                Text("«\(room.gameName.bidiIsolated)» تعمل الآن في قناة السيرفر مع \(onlineNumber(room.players)) لاعبًا. تقدر تدخلها من هنا وتلعب معهم.")
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)

                // `forward` لا `right`: الرمز يُعكس تلقائيًا مع اتجاه التخطيط
                ActionButton("ادخل الجولة الجارية", systemImage: "arrow.forward.circle.fill",
                             kind: .hero, isEnabled: !room.isFull) {
                    join(room)
                }

                if room.isFull {
                    Text("الغرفة ممتلئة الآن. انتظر خروج أحدهم أو افتح غرفة جديدة.")
                        .font(.bodyArBold(Type.meta))
                        .foregroundStyle(Ink.redDeep)
                }
            }
        }
    }

    private var soloLabel: some View {
        HStack(spacing: 10) {
            Image(systemName: "cpu.fill")
                .font(.system(size: 17, weight: .bold))
            Text("العب ضد \(Bots.displayName) بدل الانتظار")
                .font(.bodyArBold(Type.body))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .foregroundStyle(Ink.ink)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Ink.surface))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 5, radius: 16)
    }

    private var howToCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                SmallHeading("طريقة اللعب")
                Text(game.howTo)
                    .font(.bodyAr(Type.label))
                    .foregroundStyle(Ink.ink)
                    .lineSpacing(Type.lineSpacing)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // ————— حالة الانضمام —————

    private var joiningCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Card(padding: 24) {
                VStack(spacing: 12) {
                    ProgressView().tint(Ink.ink)
                    Text("جارٍ الدخول إلى الغرفة…")
                        .font(.bodyAr(Type.label))
                        .foregroundStyle(Ink.ink)
                }
                .frame(maxWidth: .infinity)
            }
            ActionButton("إلغاء", systemImage: "xmark", kind: .quiet) {
                socket.leave()
            }
        }
    }

    // ————— حالة الغرفة —————

    @ViewBuilder
    private var roomStage: some View {
        if let message = socket.lastError {
            NoticeCard(symbol: "exclamationmark.triangle.fill",
                       title: "رسالة من الخادم",
                       body: SceneCopy.plain(message).bidiIsolated)
        }

        Card(shadow: Ink.redDeep) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    SmallHeading("اللاعبون")
                    Spacer(minLength: 8)
                    Pill("\(onlineNumber(socket.players.count))/\(onlineNumber(roomMax))".bidiIsolated)
                }

                if socket.players.isEmpty {
                    HStack(spacing: 12) {
                        ProgressView().tint(Ink.ink)
                        Text("بانتظار قائمة اللاعبين من الخادم…")
                            .font(.bodyAr(Type.label))
                            .foregroundStyle(Ink.ink)
                        Spacer(minLength: 0)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(socket.players.enumerated()), id: \.offset) { pair in
                            OnlinePlayerRow(
                                player: pair.element,
                                isHost: pair.element.id == socket.host?.id,
                                isMe: pair.element.id == socket.meID
                            )
                        }
                    }
                }

                if missing > 0 {
                    Text("ينقص \(onlineNumber(missing)) لاعبًا لتبدأ «\(game.title)».")
                        .font(.bodyArBold(Type.meta))
                        .foregroundStyle(Ink.redDeep)
                } else if socket.players.count == 1 {
                    Text("أنت وحدك في الغرفة. ادعُ أصدقاءك من قناة السيرفر.")
                        .font(.bodyArBold(Type.meta))
                        .foregroundStyle(Ink.redDeep)
                }
            }
        }

        if socket.isHost {
            ActionButton("ابدأ اللعبة", systemImage: "play.fill", kind: .hero,
                         isEnabled: socket.state.isOpen && missing == 0) {
                socket.start()
            }
        } else {
            Card(padding: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "hourglass")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Ink.red)
                    Text("بانتظار أن يبدأ القائد الجولة.")
                        .font(.bodyArBold(Type.label))
                        .foregroundStyle(Ink.ink)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                }
            }
        }

        if let buttons = socket.current?.buttons, !buttons.isEmpty {
            OnlineButtonsRow(buttons: buttons, enabled: socket.state.isOpen) { id in
                socket.press(id)
            }
        }

        ActionButton("مغادرة الغرفة", systemImage: "rectangle.portrait.and.arrow.right",
                     kind: .quiet) {
            socket.leave()
            Task { await loadRooms(spinner: false) }
        }

        howToCard
    }

    // ————— أفعال —————

    private func create() {
        guard let guildID = activeGuild?.id else { return }
        socket.join(gameId: game.id, guildId: guildID)
    }

    private func join(_ room: GameRoom) {
        guard let guildID = activeGuild?.id, !room.isFull else { return }
        socket.join(gameId: room.gameId.isEmpty ? game.id : room.gameId,
                    guildId: guildID,
                    roomId: room.id,
                    running: room.running)
    }

    @MainActor
    private func prepare() async {
        socket.meID = app.account?.id
        await loadRooms(spinner: true)
    }

    @MainActor
    private func loadRooms(spinner: Bool) async {
        guard let guildID = activeGuild?.id, !guildID.isEmpty else {
            rooms = []
            roomsPhase = .ready
            return
        }
        if AppState.isDemo {
            rooms = GameRoom.demoRooms(for: game)
            roomsPhase = .ready
            return
        }
        if spinner { roomsPhase = .loading }

        let encoded = guildID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? guildID
        do {
            let response: RoomsResponse = try await API.shared.get("/rooms?guildId=\(encoded)")
            rooms = response.rooms
            roomsPhase = .ready
        } catch {
            rooms = []
            roomsPhase = .failed(
                (error as? LocalizedError)?.errorDescription ?? "تعذّر جلب الغرف من الخادم."
            )
        }
    }

    // ————— اشتقاقات —————

    private var activeGuild: Guild? {
        guard let id = app.activeGuildID else { return app.guilds.first }
        return app.guilds.first { $0.id == id } ?? app.guilds.first
    }

    /// غرف هذه اللعبة أولًا، ثم البقية — اللاعب جاء من بطاقة لعبة بعينها.
    private var sortedRooms: [GameRoom] {
        rooms.sorted { first, second in
            let mineFirst = first.gameId == game.id
            let mineSecond = second.gameId == game.id
            if mineFirst != mineSecond { return mineFirst }
            if first.running != second.running { return second.running }
            return first.players > second.players
        }
    }

    private var runningRoom: GameRoom? {
        rooms.first { $0.gameId == game.id && $0.running }
    }

    private var roomMax: Int {
        if case .lobby(let lobby) = socket.current?.scene, lobby.max > 0 { return lobby.max }
        return game.maxPlayers
    }

    private var roomMin: Int {
        if case .lobby(let lobby) = socket.current?.scene, lobby.min > 0 { return lobby.min }
        return game.minPlayers
    }

    private var missing: Int {
        max(0, roomMin - socket.players.count)
    }

    private func guildIcon(_ guild: Guild) -> some View {
        ZStack {
            Circle().fill(Ink.cream)
            AsyncImage(url: guild.iconURL()) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Image(systemName: "person.3.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Ink.ink)
            }
            .clipShape(Circle())
            Circle().strokeBorder(Ink.ink, lineWidth: 3)
        }
        .frame(width: 40, height: 40)
        .accessibilityHidden(true)
    }
}

/// صف غرفة واحدة في القائمة.
private struct RoomRow: View {
    let room: GameRoom
    let join: () -> Void

    private var symbol: String {
        Catalog.game(room.gameId)?.symbol ?? "gamecontroller.fill"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                GameIcon(symbol: symbol, size: 44)

                VStack(alignment: .leading, spacing: 6) {
                    Text(room.gameName.bidiIsolated)
                        .font(.displaySoft(Type.body))
                        .foregroundStyle(Ink.red)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    if !room.hostName.isEmpty {
                        Text("القائد: \(room.hostName.bidiIsolated)")
                            .font(.bodyAr(Type.meta))
                            .foregroundStyle(Ink.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 6) {
                    Pill(playersText)
                    if room.running {
                        Pill("جارية", fill: Ink.red, textColor: Ink.cream)
                    } else if room.isFull {
                        Pill("ممتلئة", fill: Ink.cream)
                    }
                }
            }

            Button(action: join) {
                Text(room.isFull ? "ممتلئة" : (room.running ? "تابع الجولة" : "انضم"))
                    .font(.bodyArBold(Type.label))
                    .foregroundStyle(Ink.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(room.isFull ? Ink.paperTint : Ink.yellow)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Ink.ink, lineWidth: 3)
                    )
            }
            .buttonStyle(.plain)
            .disabled(room.isFull)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Ink.cream))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Ink.ink, lineWidth: 3)
        )
        .hardShadow(Ink.ink, lift: 4, radius: 16)
    }

    /// العدد والحدّ في نص واحد معزول — «3/25» بلا عزل تُعرض «25/3».
    private var playersText: String {
        guard room.maxPlayers > 0 else { return "\(onlineNumber(room.players)) لاعبًا" }
        return "\(onlineNumber(room.players))/\(onlineNumber(room.maxPlayers))".bidiIsolated
    }
}

/// عنوان صغير داخل بطاقة.
///
/// يعيش هنا لا في `Style.swift` لأنه عنصر شاشة لا توكن تصميم — ويستعمله أيضًا
/// `GameDetailView` في الكتالوج.
struct SmallHeading: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        (Text("«").foregroundStyle(Ink.red)
         + Text(text).foregroundStyle(Ink.ink)
         + Text("»").foregroundStyle(Ink.red))
            .font(.displaySoft(Type.body))
    }
}
