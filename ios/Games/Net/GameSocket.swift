import Foundation
import Observation

// ————— عقد السلك —————
//
// الأشكال هنا منقولة حرفيًا من الخادم:
//   · الرسائل الصادرة من الخادم  → النوع `Outgoing` في `src/api/table.ts`
//   · المشهد داخل رسالة `scene`  → النوع `Scene`    في `src/scenes/scene.ts`
//   · الرسائل الواردة للخادم     → النوع `Incoming` في `src/api/ws.ts`
//
// **المفكّك هنا لا يحوّل snake_case** خلافًا لـ `API.swift`: الخادم يرسل
// camelCase كما هو موثّق في رأس `src/api/routes.ts`، وتحويل الحالة يكسر
// `sceneId` و`totalVotes` و`howTo` بصمت.
//
// كل بنية أدناه تفكّ **تسامحًا**: أي حقل ناقص يأخذ قيمة افتراضية بدل أن يرمي.
// السبب عملي لا تجميلي — حقل واحد يتغيّر اسمه في الخادم كان سيحوّل الشاشة كلها
// إلى خطأ فكّ، بينما الناقص الحقيقي سطر واحد في البطاقة.

/// لاعب كما يُعرض — يقابل `PlayerView`.
public struct ScenePlayer: Identifiable, Hashable, Sendable, Decodable {
    public let id: String
    public let name: String
    /// رابط الأفتار كما أرسله الخادم (CDN). قد يكون غائبًا أو غير قابل للتحميل.
    public let avatar: String?

    public init(id: String, name: String, avatar: String? = nil) {
        self.id = id
        self.name = name
        self.avatar = avatar
    }

    private enum Key: String, CodingKey { case id, name, avatar }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        let raw = c.string(.id) ?? ""
        id = raw
        name = c.string(.name) ?? (raw.isEmpty ? "لاعب" : raw)
        avatar = c.string(.avatar)
    }

    /// `data:` URI لا يُحمَّل في `AsyncImage`، فيُرفض هنا وتظهر بدل الصورة حرفٌ.
    public var avatarURL: URL? {
        guard let avatar, avatar.hasPrefix("http") else { return nil }
        return URL(string: avatar)
    }

    public static let unknown = ScenePlayer(id: "", name: "—", avatar: nil)
}

/// زر يرافق المشهد — يقابل `ButtonDef`.
public struct SceneButton: Hashable, Sendable, Decodable {
    public let id: String
    public let label: String
    /// `start` · `join` · `stop` · `plain`
    public let style: String
    public let disabled: Bool

    public init(id: String, label: String, style: String = "plain", disabled: Bool = false) {
        self.id = id
        self.label = label
        self.style = style
        self.disabled = disabled
    }

    private enum Key: String, CodingKey { case id, label, style, disabled }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        id = c.string(.id) ?? ""
        label = c.string(.label) ?? "…"
        style = c.string(.style) ?? "plain"
        disabled = c.bool(.disabled) ?? false
    }
}

/// بطاقة اللعبة داخل المشهد — يقابل `GameBrief`.
public struct SceneBrief: Equatable, Sendable, Decodable {
    public let key: String
    public let name: String
    public let tagline: String
    public let howTo: String

    public init(key: String = "", name: String = "", tagline: String = "", howTo: String = "") {
        self.key = key
        self.name = name
        self.tagline = tagline
        self.howTo = howTo
    }

    private enum Key: String, CodingKey { case key, name, tagline, howTo }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        key = c.string(.key) ?? ""
        name = c.string(.name) ?? ""
        tagline = c.string(.tagline) ?? ""
        howTo = c.string(.howTo) ?? ""
    }
}

// ————— المشاهد —————

public struct LobbyScene: Equatable, Sendable, Decodable {
    public let game: SceneBrief
    public let host: ScenePlayer?
    public let players: [ScenePlayer]
    public let min: Int
    public let max: Int

    private enum Key: String, CodingKey { case game, host, players, min, max }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        game = c.brief(.game)
        host = c.player(.host)
        players = c.playerList(.players)
        min = c.int(.min) ?? 0
        max = c.int(.max) ?? 0
    }

    public init(game: SceneBrief, host: ScenePlayer?, players: [ScenePlayer], min: Int, max: Int) {
        self.game = game
        self.host = host
        self.players = players
        self.min = min
        self.max = max
    }
}

public struct RoundScene: Equatable, Sendable, Decodable {
    public let game: SceneBrief
    public let prompt: String
    public let hint: String?
    public let index: Int
    public let total: Int

    private enum Key: String, CodingKey { case game, prompt, hint, index, total }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        game = c.brief(.game)
        prompt = c.string(.prompt) ?? ""
        hint = c.string(.hint)
        index = c.int(.index) ?? 0
        total = c.int(.total) ?? 0
    }
}

public struct StandingsRow: Equatable, Sendable, Decodable {
    public let player: ScenePlayer
    public let score: Int

    private enum Key: String, CodingKey { case player, score }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        player = c.player(.player) ?? .unknown
        score = c.int(.score) ?? 0
    }
}

public struct StandingsScene: Equatable, Sendable, Decodable {
    public let game: SceneBrief
    public let rows: [StandingsRow]
    public let heading: String?

    private enum Key: String, CodingKey { case game, rows, heading }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        game = c.brief(.game)
        rows = c.list(StandingsRow.self, .rows)
        heading = c.string(.heading)
    }
}

public struct BoardSide: Equatable, Sendable, Decodable {
    public let mark: String
    public let player: ScenePlayer?

    private enum Key: String, CodingKey { case mark, player }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        mark = c.string(.mark) ?? ""
        player = c.player(.player)
    }
}

public struct BoardScene: Equatable, Sendable, Decodable {
    public let game: SceneBrief
    /// الخانات بالترتيب صفًا بعد صف؛ `nil` = فارغة.
    public let cells: [String?]
    public let cols: Int
    public let sides: [BoardSide]
    public let turnOf: ScenePlayer?
    public let winning: [Int]
    public let note: String?

    private enum Key: String, CodingKey { case game, cells, cols, sides, turnOf, winning, note }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        game = c.brief(.game)
        if let raw = try? c.decodeIfPresent([String?].self, forKey: .cells), let list = raw {
            cells = list
        } else {
            cells = []
        }
        cols = Swift.max(1, c.int(.cols) ?? 3)
        sides = c.list(BoardSide.self, .sides)
        turnOf = c.player(.turnOf)
        winning = c.intList(.winning)
        note = c.string(.note)
    }

    /// عدد الصفوف مشتق لا مُرسل — الخادم يرسل الأعمدة وحدها.
    public var rows: Int {
        cells.isEmpty ? 0 : Int(ceil(Double(cells.count) / Double(cols)))
    }
}

public struct DuelSide: Equatable, Sendable, Decodable {
    public let player: ScenePlayer
    public let label: String
    public let score: Int?

    private enum Key: String, CodingKey { case player, label, score }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        player = c.player(.player) ?? .unknown
        label = c.string(.label) ?? ""
        score = c.int(.score)
    }
}

public struct DuelRound: Equatable, Sendable, Decodable {
    public let index: Int
    public let total: Int

    private enum Key: String, CodingKey { case index, total }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        index = c.int(.index) ?? 0
        total = c.int(.total) ?? 0
    }
}

public struct DuelScene: Equatable, Sendable, Decodable {
    public let game: SceneBrief
    /// طرفا المواجهة. الخادم يسمّيهما `left`/`right` لأن ديسكورد يرسمهما صورة
    /// ثابتة، أما هنا فالتخطيط منطقي (RTL) فالاسم `leading`/`trailing` — نفس
    /// السبب الذي يمنع `.left` في أي مقاس أو محاذاة في هذا المشروع.
    public let leadingSide: DuelSide?
    public let trailingSide: DuelSide?
    public let verdict: String?
    public let round: DuelRound?

    private enum Key: String, CodingKey {
        case game
        case leadingSide = "left"
        case trailingSide = "right"
        case verdict, round
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        game = c.brief(.game)
        leadingSide = c.one(DuelSide.self, .leadingSide)
        trailingSide = c.one(DuelSide.self, .trailingSide)
        verdict = c.string(.verdict)
        round = c.one(DuelRound.self, .round)
    }
}

public struct WheelScene: Equatable, Sendable, Decodable {
    public let game: SceneBrief
    public let players: [ScenePlayer]
    public let picked: ScenePlayer?
    public let note: String?

    private enum Key: String, CodingKey { case game, players, picked, note }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        game = c.brief(.game)
        players = c.playerList(.players)
        picked = c.player(.picked)
        note = c.string(.note)
    }
}

public struct RolesScene: Equatable, Sendable, Decodable {
    /// `night` · `day` · `result`
    public let phase: String
    public let game: SceneBrief
    public let headline: String
    public let detail: String?
    public let alive: [ScenePlayer]
    public let dead: [ScenePlayer]
    public let spotlight: ScenePlayer?

    private enum Key: String, CodingKey { case game, phase, headline, detail, alive, dead, spotlight }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        game = c.brief(.game)
        phase = c.string(.phase) ?? "day"
        headline = c.string(.headline) ?? ""
        detail = c.string(.detail)
        alive = c.playerList(.alive)
        dead = c.playerList(.dead)
        spotlight = c.player(.spotlight)
    }
}

public struct HuntScene: Equatable, Sendable, Decodable {
    public let game: SceneBrief
    /// عدد الخانات — أرقامها تبدأ من 1 (انظر `cellButtons` في `src/games/hide/game.ts`).
    public let total: Int
    public let cleared: [Int]
    public let seeker: ScenePlayer?
    public let headline: String
    public let note: String?

    private enum Key: String, CodingKey { case game, total, cleared, seeker, headline, note }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        game = c.brief(.game)
        total = Swift.max(0, c.int(.total) ?? 0)
        cleared = c.intList(.cleared)
        seeker = c.player(.seeker)
        headline = c.string(.headline) ?? ""
        note = c.string(.note)
    }
}

public struct PollOption: Equatable, Sendable, Decodable {
    public let id: String
    public let label: String
    public let votes: Int
    public let player: ScenePlayer?

    private enum Key: String, CodingKey { case id, label, votes, player }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        id = c.string(.id) ?? ""
        label = c.string(.label) ?? ""
        votes = c.int(.votes) ?? 0
        player = c.player(.player)
    }
}

public struct PollScene: Equatable, Sendable, Decodable {
    public let game: SceneBrief
    public let question: String
    public let options: [PollOption]
    public let totalVotes: Int
    public let note: String?

    private enum Key: String, CodingKey { case game, question, options, totalVotes, note }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        game = c.brief(.game)
        question = c.string(.question) ?? ""
        options = c.list(PollOption.self, .options)
        totalVotes = c.int(.totalVotes) ?? 0
        note = c.string(.note)
    }
}

public struct ProfileScene: Equatable, Sendable, Decodable {
    public let player: ScenePlayer
    public let roulette: Int
    public let team: Int
    public let solo: Int
    public let total: Int
    public let gamesPlayed: Int
    public let wins: Int
    public let rank: Int?

    private enum Key: String, CodingKey {
        case player, roulette, team, solo, total, gamesPlayed, wins, rank
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        player = c.player(.player) ?? .unknown
        roulette = c.int(.roulette) ?? 0
        team = c.int(.team) ?? 0
        solo = c.int(.solo) ?? 0
        total = c.int(.total) ?? 0
        gamesPlayed = c.int(.gamesPlayed) ?? 0
        wins = c.int(.wins) ?? 0
        rank = c.int(.rank)
    }
}

public struct LeadersRow: Equatable, Sendable, Decodable {
    public let player: ScenePlayer
    public let points: Int

    private enum Key: String, CodingKey { case player, points }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        player = c.player(.player) ?? .unknown
        points = c.int(.points) ?? 0
    }
}

public struct LeadersScene: Equatable, Sendable, Decodable {
    public let title: String
    public let rows: [LeadersRow]

    private enum Key: String, CodingKey { case title, rows }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        title = c.string(.title) ?? ""
        rows = c.list(LeadersRow.self, .rows)
    }
}

public struct PanelItem: Equatable, Sendable, Decodable {
    public let label: String
    public let value: String
    public let on: Bool?

    private enum Key: String, CodingKey { case label, value, on }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        label = c.string(.label) ?? ""
        value = c.string(.value) ?? ""
        on = c.bool(.on)
    }
}

public struct PanelScene: Equatable, Sendable, Decodable {
    public let title: String
    public let subtitle: String?
    public let items: [PanelItem]
    public let footer: String?

    private enum Key: String, CodingKey { case title, subtitle, items, footer }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        title = c.string(.title) ?? ""
        subtitle = c.string(.subtitle)
        items = c.list(PanelItem.self, .items)
        footer = c.string(.footer)
    }
}

public struct NoticeScene: Equatable, Sendable, Decodable {
    /// `ok` · `warn` · `info`
    public let tone: String
    public let title: String
    public let detail: String?

    private enum Key: String, CodingKey { case tone, title, body }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        tone = c.string(.tone) ?? "info"
        title = c.string(.title) ?? ""
        detail = c.string(.body)
    }
}

/// المشهد الواصل — اتحاد مميّز بالحقل `kind`.
///
/// `unknown` ليست حالة خطأ بل جزء من العقد: الخادم قد يضيف مشهدًا قبل أن يعرفه
/// التطبيق المنشور على الأجهزة، والواجب حينها بطاقة مفهومة لا شاشة فارغة.
public enum GameScene: Equatable, Sendable, Decodable {
    case lobby(LobbyScene)
    case round(RoundScene)
    case standings(StandingsScene)
    case board(BoardScene)
    case duel(DuelScene)
    case wheel(WheelScene)
    case roles(RolesScene)
    case hunt(HuntScene)
    case poll(PollScene)
    case profile(ProfileScene)
    case leaders(LeadersScene)
    case panel(PanelScene)
    case notice(NoticeScene)
    case unknown(String)

    private enum Key: String, CodingKey { case kind }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: Key.self)
        let kind = container.string(.kind) ?? ""

        switch kind {
        case "lobby":
            self = (try? LobbyScene(from: decoder)).map(GameScene.lobby) ?? .unknown(kind)
        case "round":
            self = (try? RoundScene(from: decoder)).map(GameScene.round) ?? .unknown(kind)
        case "standings":
            self = (try? StandingsScene(from: decoder)).map(GameScene.standings) ?? .unknown(kind)
        case "board":
            self = (try? BoardScene(from: decoder)).map(GameScene.board) ?? .unknown(kind)
        case "duel":
            self = (try? DuelScene(from: decoder)).map(GameScene.duel) ?? .unknown(kind)
        case "wheel":
            self = (try? WheelScene(from: decoder)).map(GameScene.wheel) ?? .unknown(kind)
        case "roles":
            self = (try? RolesScene(from: decoder)).map(GameScene.roles) ?? .unknown(kind)
        case "hunt":
            self = (try? HuntScene(from: decoder)).map(GameScene.hunt) ?? .unknown(kind)
        case "poll":
            self = (try? PollScene(from: decoder)).map(GameScene.poll) ?? .unknown(kind)
        case "profile":
            self = (try? ProfileScene(from: decoder)).map(GameScene.profile) ?? .unknown(kind)
        case "leaders":
            self = (try? LeadersScene(from: decoder)).map(GameScene.leaders) ?? .unknown(kind)
        case "panel":
            self = (try? PanelScene(from: decoder)).map(GameScene.panel) ?? .unknown(kind)
        case "notice":
            self = (try? NoticeScene(from: decoder)).map(GameScene.notice) ?? .unknown(kind)
        default:
            self = .unknown(kind)
        }
    }

    /// اسم النوع كما وصل — يُعرض في بطاقة المشهد المجهول.
    public var kindName: String {
        switch self {
        case .lobby: return "lobby"
        case .round: return "round"
        case .standings: return "standings"
        case .board: return "board"
        case .duel: return "duel"
        case .wheel: return "wheel"
        case .roles: return "roles"
        case .hunt: return "hunt"
        case .poll: return "poll"
        case .profile: return "profile"
        case .leaders: return "leaders"
        case .panel: return "panel"
        case .notice: return "notice"
        case .unknown(let raw): return raw
        }
    }

    /// بطاقة اللعبة إن حملها المشهد.
    public var brief: SceneBrief? {
        switch self {
        case .lobby(let s): return s.game
        case .round(let s): return s.game
        case .standings(let s): return s.game
        case .board(let s): return s.game
        case .duel(let s): return s.game
        case .wheel(let s): return s.game
        case .roles(let s): return s.game
        case .hunt(let s): return s.game
        case .poll(let s): return s.game
        case .profile, .leaders, .panel, .notice, .unknown: return nil
        }
    }

    /// اللاعبون الظاهرون في المشهد — مصدر قائمة الغرفة الحيّة.
    public var roster: [ScenePlayer] {
        switch self {
        case .lobby(let s): return s.players
        case .wheel(let s): return s.players
        case .roles(let s): return s.alive + s.dead
        case .standings(let s): return s.rows.map(\.player)
        case .duel(let s): return [s.leadingSide?.player, s.trailingSide?.player].compactMap { $0 }
        case .board(let s): return s.sides.compactMap(\.player)
        default: return []
        }
    }
}

/// نتيجة نهاية اللعبة — يقابل جسم رسالة `ended`.
public struct OnlineResult: Equatable, Sendable, Decodable {
    public let winnerId: String?
    public let scores: [String: Int]

    private enum Key: String, CodingKey { case winnerId, scores }

    public init(winnerId: String?, scores: [String: Int]) {
        self.winnerId = winnerId
        self.scores = scores
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        winnerId = c.string(.winnerId)
        if let raw = try? c.decodeIfPresent([String: Int].self, forKey: .scores), let map = raw {
            scores = map
        } else if let raw = try? c.decodeIfPresent([String: Double].self, forKey: .scores), let map = raw {
            scores = map.mapValues { Int($0) }
        } else {
            scores = [:]
        }
    }
}

/// المغلّف الكامل لرسالة `scene`.
public struct SceneEnvelope: Equatable, Sendable {
    public let scene: GameScene
    /// النص المرافق (DESIGN.md §6) — يصل بترميز ديسكورد ويُنظَّف قبل العرض.
    public let text: String?
    public let buttons: [SceneButton]
    public let replace: Bool
    /// يتغيّر مع كل مشهد — عليه تُقاس الضغطات المتأخّرة.
    public let sceneId: String
}

/// سطر في سجل الرسائل النصية.
public struct GameMessage: Identifiable, Equatable, Sendable {
    public enum Kind: Sendable, Equatable { case say, whisper, error }

    public let id = UUID()
    public let kind: Kind
    public let text: String
    public let at: Date
}

/// غرفة لعب في السيرفر.
///
/// **افتراض موثّق:** `GET /rooms?guildId=` لم يكن موجودًا في `src/api/routes.ts`
/// وقت كتابة هذا الملف (وكيل آخر يضيفه). لذلك الفكّ هنا يقبل أكثر من تسمية
/// لكل حقل، وأي غياب يأخذ افتراضًا — غرفة ناقصة تُعرض ناقصة ولا تُسقط القائمة.
public struct GameRoom: Identifiable, Equatable, Sendable, Decodable {
    public let id: String
    public let gameId: String
    public let gameName: String
    public let players: Int
    public let maxPlayers: Int
    public let hostName: String
    public let hostId: String
    /// اللعبة جارية الآن (بدأت في ديسكورد أو من التطبيق) لا في انتظار اللاعبين.
    public let running: Bool

    public init(id: String, gameId: String, gameName: String, players: Int,
                maxPlayers: Int, hostName: String, hostId: String, running: Bool) {
        self.id = id
        self.gameId = gameId
        self.gameName = gameName
        self.players = players
        self.maxPlayers = maxPlayers
        self.hostName = hostName
        self.hostId = hostId
        self.running = running
    }

    private enum Key: String, CodingKey {
        case id, roomId, gameId, gameKey, game, gameName, name
        case players, playerCount, maxPlayers, max, hostName, hostId, host
        case state, status, running, started
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)

        let key = c.string(.gameId) ?? c.string(.gameKey) ?? c.string(.game) ?? ""
        // المعرّف البديل مشتق لا عشوائي: `UUID()` جديد في كل جلب يجعل SwiftUI
        // يرى كل صف صفًّا جديدًا فيومض الجدول كله عند كل تحديث.
        id = c.string(.id) ?? c.string(.roomId) ?? "\(key)#\(c.string(.hostId) ?? "-")"
        gameId = key
        gameName = c.string(.gameName) ?? c.string(.name) ?? Catalog.game(key)?.title ?? key

        // `players` قد يصل عددًا أو قائمة لاعبين — الشكلان مقبولان
        if let count = c.int(.players) {
            players = count
        } else {
            let list = c.playerList(.players)
            players = list.isEmpty ? (c.int(.playerCount) ?? 0) : list.count
        }

        maxPlayers = c.int(.maxPlayers) ?? c.int(.max) ?? Catalog.game(key)?.maxPlayers ?? 0

        let host = c.player(.host)
        hostId = c.string(.hostId) ?? host?.id ?? ""
        hostName = c.string(.hostName) ?? host?.name ?? ""

        let state = c.string(.state) ?? c.string(.status) ?? ""
        running = c.bool(.running) ?? c.bool(.started) ?? (state == "playing" || state == "running")
    }

    public var isFull: Bool { maxPlayers > 0 && players >= maxPlayers }

    /// غرف وضع العرض — لقطات الـ CI تجري بلا خادم.
    public static func demoRooms(for game: GameInfo) -> [GameRoom] {
        [
            GameRoom(id: "demo-1", gameId: game.id, gameName: game.title,
                     players: 3, maxPlayers: game.maxPlayers,
                     hostName: "عبدالرحمن", hostId: "308994132968210433", running: false),
            GameRoom(id: "demo-2", gameId: "mafia", gameName: "المافيا",
                     players: 7, maxPlayers: 15,
                     hostName: ".zja6", hostId: "3", running: true),
            GameRoom(id: "demo-3", gameId: "roulette", gameName: "الروليت",
                     players: 20, maxPlayers: 20,
                     hostName: "اسم طويل جدا يتجاوز عرض الصف بكثير", hostId: "5", running: false),
        ]
    }
}

/// رد `GET /rooms` — يقبل مصفوفة مباشرة أو كائنًا يلفّها.
public struct RoomsResponse: Decodable, Sendable {
    public let rooms: [GameRoom]

    private enum Key: String, CodingKey { case rooms, items }

    public init(from decoder: Decoder) throws {
        if let list = try? [GameRoom](from: decoder) {
            rooms = list
            return
        }
        guard let c = try? decoder.container(keyedBy: Key.self) else {
            rooms = []
            return
        }
        rooms = c.list(GameRoom.self, .rooms) + c.list(GameRoom.self, .items)
    }
}

// ————— حالة الوصلة —————

public enum SocketState: Equatable, Sendable {
    case idle
    case connecting
    case open
    /// انقطعت والمحاولة جارية.
    case retrying(attempt: Int)
    /// أُغلقت: بطلبنا، أو بعد استنفاد المحاولات.
    case closed(reason: String?)

    public var isOpen: Bool {
        if case .open = self { return true }
        return false
    }

    public var isBusy: Bool {
        switch self {
        case .connecting, .retrying: return true
        default: return false
        }
    }

    public var label: String {
        switch self {
        case .idle: return "غير متصل"
        case .connecting: return "جارٍ الاتصال…"
        case .open: return "متصل"
        case .retrying: return "انقطع الاتصال — نعيد المحاولة"
        case .closed(let reason): return reason ?? "انتهت الجلسة"
        }
    }

    public var symbol: String {
        switch self {
        case .idle: return "bolt.horizontal.circle"
        case .connecting, .retrying: return "arrow.triangle.2.circlepath"
        case .open: return "bolt.horizontal.fill"
        case .closed: return "exclamationmark.triangle.fill"
        }
    }
}

/// طور الجلسة كما يراه المستخدم.
public enum SessionStage: Equatable, Sendable {
    /// لم ننضم بعد — تُعرض قائمة الغرف.
    case browsing
    /// أُرسل `join` ولم يصل مشهد بعد.
    case joining
    /// داخل غرفة تنتظر البدء.
    case lobby
    /// اللعبة جارية.
    case playing
    /// انتهت وظهرت النتيجة.
    case ended
}

// ————— العميل —————

/// عميل اللعب الجماعي على WebSocket.
///
/// المسؤوليات ثلاث ولا رابعة لها: يفتح الوصلة ويحرسها (نبض + إعادة اتصال)،
/// ويفكّ ما يصل إلى أنواع Swift، ويرسل نيّة اللاعب. لا يرسم شيئًا ولا يعرف
/// أي شاشة — الشاشات تقرأ منه.
///
/// **النبض ليس ترفًا:** الوسائط ومزوّدو الجوال يغلقون الوصلة الصامتة بعد دقائق
/// بلا إشعار، فتبقى الشاشة معلّقة تنتظر مشهدًا لن يصل. الخادم يردّ `pong` على
/// `ping` (انظر `parse` في `src/api/ws.ts`)، وغياب الردّ دليل انقطاع صامت.
@Observable
@MainActor
public final class GameSocket {

    // ————— ما تقرأه الشاشات —————

    public private(set) var state: SocketState = .idle
    public private(set) var stage: SessionStage = .browsing
    /// اللاعبون في الغرفة — يُحدَّث من `started` ومن كل مشهد يحمل قائمة.
    public private(set) var players: [ScenePlayer] = []
    public private(set) var host: ScenePlayer?
    public private(set) var current: SceneEnvelope?
    public private(set) var log: [GameMessage] = []
    public private(set) var result: OnlineResult?
    /// آخر خطأ صريح من الخادم — يُعرض ويُمسح بيد المستخدم.
    public var lastError: String?
    /// انضممنا إلى جولة كانت جارية أصلًا (بدأت في ديسكورد).
    public private(set) var joinedRunning = false
    /// معرّف المشهد الذي أرسلنا عليه ضغطة أو إجابة — لمنع التكرار.
    public private(set) var actedSceneId: String?
    /// معرّف اللاعب نفسه — تضبطه الشاشة من `AppState`.
    public var meID: String?

    public var isHost: Bool {
        guard let meID, let host else { return false }
        return host.id == meID
    }

    public var canAct: Bool {
        state.isOpen && actedSceneId != current?.sceneId
    }

    // ————— الداخل —————

    private struct Join: Equatable {
        let gameId: String
        let guildId: String
        let roomId: String?
    }

    private static let maxAttempts = 6
    private static let beatSeconds: UInt64 = 25
    private static let silenceLimit: TimeInterval = 75

    @ObservationIgnored private let bin = SocketBin()
    @ObservationIgnored private let decoder = JSONDecoder()
    @ObservationIgnored private let encoder = JSONEncoder()
    @ObservationIgnored private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        config.timeoutIntervalForRequest = 30
        return URLSession(configuration: config)
    }()

    @ObservationIgnored private var pending: Join?
    @ObservationIgnored private var wanted = false
    @ObservationIgnored private var attempt = 0
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var awaitingRetry = false
    @ObservationIgnored private var lastInbound = Date()
    @ObservationIgnored private var backgrounded = false

    public init() {}

    deinit {
        // الوصلة مورد نظام: تركها مفتوحة بعد اختفاء الشاشة يُبقي جلسة على
        // الخادم بلا صاحب. `SocketBin` صنف مستقل غير معزول فيمكن إغلاقه هنا.
        bin.closeAll()
    }

    // ————— الأوامر —————

    /// يفتح الوصلة وينضم. `roomId` غائبًا = أنشئ غرفة جديدة لهذه اللعبة.
    public func join(gameId: String, guildId: String, roomId: String? = nil, running: Bool = false) {
        pending = Join(gameId: gameId, guildId: guildId, roomId: roomId)
        wanted = true
        attempt = 0
        awaitingRetry = false
        joinedRunning = running
        result = nil
        lastError = nil
        actedSceneId = nil
        current = nil
        players = []
        host = nil
        log = []
        stage = .joining

        if Demo.isOn {
            openDemo(gameId: gameId)
            return
        }
        open()
    }

    /// بدء اللعبة — للقائد وحده. الخادم هو من يفرض ذلك، والزر هنا يخفيه فقط.
    public func start() {
        guard state.isOpen else { return }
        transmit(Frame(type: "start"))
    }

    public func answer(_ text: String) {
        let clean = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        guard !clean.isEmpty, state.isOpen else { return }
        transmit(Frame(type: "answer", text: clean))
        actedSceneId = current?.sceneId
    }

    public func press(_ id: String) {
        guard state.isOpen else { return }
        transmit(Frame(type: "press", id: id))
        actedSceneId = current?.sceneId
    }

    /// مغادرة الغرفة والعودة إلى القائمة.
    public func leave() {
        if state.isOpen { transmit(Frame(type: "leave")) }
        wanted = false
        pending = nil
        awaitingRetry = false
        bin.closeAll()
        reset(to: .browsing)
        state = .idle
    }

    /// إعادة محاولة يدوية بعد استنفاد المحاولات التلقائية.
    public func retry() {
        guard pending != nil else { return }
        wanted = true
        attempt = 0
        awaitingRetry = false
        if Demo.isOn { return }
        open()
    }

    /// تُستدعى من `scenePhase` — لا من إشعارات UIKit.
    public func enterBackground() {
        backgrounded = true
    }

    public func enterForeground() {
        guard backgrounded else { return }
        backgrounded = false
        guard wanted, !Demo.isOn else { return }
        // النظام يقتل الوصلات في الخلفية بصمت: بدل الثقة بحالتنا القديمة نتحقق
        // بنبضة، وإن لم يصل شيء خلال المهلة أُعيد الفتح.
        if state.isOpen {
            lastInbound = Date()
            transmit(Frame(type: "ping"))
        } else if !awaitingRetry {
            attempt = 0
            open()
        }
    }

    // ————— الوصلة —————

    private func open() {
        guard wanted, !Demo.isOn else { return }
        guard let token = Session.shared.token, !token.isEmpty else {
            state = .closed(reason: "انتهت جلستك. سجّل الدخول مرة أخرى.")
            return
        }
        guard let url = Self.socketURL(token: token) else {
            state = .closed(reason: "عنوان الخادم غير صالح.")
            return
        }

        bin.stopJobs()
        awaitingRetry = false
        generation &+= 1
        let mine = generation
        state = attempt == 0 ? .connecting : .retrying(attempt: attempt)
        lastInbound = Date()

        let task = session.webSocketTask(with: url)
        bin.hold(task)
        task.resume()

        // الإرسال قبل اكتمال المصافحة يُصفّ في الطابور ويخرج عند الفتح، فلا
        // حاجة إلى مندوب ينتظر `didOpen`.
        if let pending {
            transmit(Frame(type: "join",
                           gameId: pending.gameId,
                           guildId: pending.guildId,
                           roomId: pending.roomId))
        }
        transmit(Frame(type: "ping"))

        listen(generation: mine)
        beat(generation: mine)
    }

    private func listen(generation mine: Int) {
        guard let task = bin.current, mine == generation else { return }
        task.receive { [weak self] result in
            switch result {
            case .success(let message):
                let text: String?
                switch message {
                case .string(let value):
                    text = value
                case .data(let data):
                    text = String(data: data, encoding: .utf8)
                @unknown default:
                    text = nil
                }
                Task { @MainActor in self?.received(text, generation: mine) }
            case .failure:
                Task { @MainActor in self?.dropped(generation: mine) }
            }
        }
    }

    private func beat(generation mine: Int) {
        let job = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.beatSeconds * 1_000_000_000)
                guard !Task.isCancelled, let self else { return }
                if !self.pulse(generation: mine) { return }
            }
        }
        bin.hold(job: job)
    }

    /// نبضة واحدة. تعيد `false` إذا انتهت مهمة هذه الوصلة.
    private func pulse(generation mine: Int) -> Bool {
        guard mine == generation, wanted else { return false }
        // في الخلفية لا نبض: النظام يجمّد المهام أصلًا، والنبض عند العودة
        // يجري في `enterForeground`.
        if backgrounded { return true }
        if Date().timeIntervalSince(lastInbound) > Self.silenceLimit {
            dropped(generation: mine)
            return false
        }
        transmit(Frame(type: "ping"))
        return true
    }

    private func transmit(_ frame: Frame) {
        guard let task = bin.current else { return }
        guard let data = try? encoder.encode(frame),
              let text = String(data: data, encoding: .utf8) else { return }
        let mine = generation
        task.send(.string(text)) { [weak self] error in
            guard error != nil else { return }
            Task { @MainActor in self?.dropped(generation: mine) }
        }
    }

    private func dropped(generation mine: Int) {
        guard mine == generation, wanted, !awaitingRetry else { return }
        bin.stopJobs()
        bin.hold(nil)

        guard attempt < Self.maxAttempts else {
            state = .closed(reason: "تعذّر الاتصال بالخادم بعد عدة محاولات.")
            return
        }

        attempt += 1
        awaitingRetry = true
        state = .retrying(attempt: attempt)

        // تراجع أسّي بعشوائية صغيرة: عودة الشبكة تُعيد كل الأجهزة دفعة واحدة،
        // والعشوائية وحدها تمنع موجة اتصالات متزامنة على الخادم.
        let wait = Swift.min(pow(2.0, Double(attempt - 1)), 16.0) + Double.random(in: 0...0.75)
        let job = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.open()
        }
        bin.hold(job: job)
    }

    // ————— الوارد —————

    private func received(_ text: String?, generation mine: Int) {
        guard mine == generation else { return }
        lastInbound = Date()
        if !state.isOpen {
            state = .open
            attempt = 0
            awaitingRetry = false
        }
        listen(generation: mine)

        guard let text, let data = text.data(using: .utf8) else { return }
        guard let inbound = try? decoder.decode(Inbound.self, from: data) else {
            // رسالة تالفة: تُهمَل ولا تُسقط الوصلة. إسقاط الجلسة لأجل رسالة
            // واحدة معطوبة يخرج اللاعب من مباراة سليمة.
            note(.error, "وصلت رسالة غير مفهومة من الخادم.")
            return
        }
        apply(inbound)
    }

    private func apply(_ inbound: Inbound) {
        switch inbound.type {
        case "scene":
            guard let scene = inbound.scene else {
                note(.error, "وصل مشهد بلا محتوى.")
                return
            }
            let envelope = SceneEnvelope(
                scene: scene,
                text: inbound.text,
                buttons: inbound.buttons ?? [],
                replace: inbound.replace ?? false,
                sceneId: inbound.sceneId ?? UUID().uuidString
            )
            current = envelope
            actedSceneId = nil

            let roster = scene.roster
            if !roster.isEmpty { players = roster }
            if case .lobby(let lobby) = scene {
                host = lobby.host ?? host
                stage = .lobby
            } else if stage != .ended {
                stage = .playing
            }

        case "started":
            if let list = inbound.players, !list.isEmpty {
                players = list
                host = host ?? list.first
            }
            result = nil
            stage = .playing

        case "ended":
            result = inbound.result ?? OnlineResult(winnerId: nil, scores: [:])
            stage = .ended

        case "say":
            if let text = inbound.text { note(.say, text) }

        case "whisper":
            if let text = inbound.text { note(.whisper, text) }

        case "error":
            let message = inbound.message ?? inbound.text ?? "خطأ من الخادم."
            lastError = message
            note(.error, message)
            // خطأ الانضمام يعيدنا للقائمة بدل انتظار مشهد لن يأتي
            if stage == .joining { stage = .browsing }

        case "pong":
            break

        default:
            // نوع لا نعرفه — الخادم يتقدّم علينا، ولا داعي لإزعاج اللاعب
            break
        }
    }

    private func note(_ kind: GameMessage.Kind, _ text: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        log.append(GameMessage(kind: kind, text: clean, at: Date()))
        if log.count > 20 { log.removeFirst(log.count - 20) }
    }

    private func reset(to newStage: SessionStage) {
        stage = newStage
        lastError = nil
        current = nil
        players = []
        host = nil
        result = nil
        actedSceneId = nil
        joinedRunning = false
        log = []
    }

    // ————— العنوان —————

    /// يبني عنوان الوصلة من عنوان الـ HTTP: `http`→`ws` و`https`→`wss`.
    static func socketURL(token: String) -> URL? {
        guard var parts = URLComponents(url: Backend.baseURL, resolvingAgainstBaseURL: false) else {
            return nil
        }
        let scheme = (parts.scheme ?? "http").lowercased()
        parts.scheme = (scheme == "https" || scheme == "wss") ? "wss" : "ws"
        var path = parts.path
        while path.hasSuffix("/") { path.removeLast() }
        parts.path = path + "/ws"
        parts.queryItems = [URLQueryItem(name: "token", value: token)]
        return parts.url
    }

    // ————— وضع العرض —————

    /// لوبي جاهز بلا خادم — لقطات الـ CI تجري على ماك بلا خلفية ولا حساب.
    private func openDemo(gameId: String) {
        let info = Catalog.game(gameId)
        let brief = SceneBrief(
            key: gameId,
            name: info?.title ?? gameId,
            tagline: info?.tagline ?? "",
            howTo: info?.howTo ?? ""
        )
        let roster = Demo.leaders.prefix(4).map {
            ScenePlayer(id: $0.id, name: $0.displayName, avatar: $0.avatarURL(size: 128)?.absoluteString)
        }
        let me = ScenePlayer(
            id: Demo.account.id,
            name: Demo.account.shownName,
            avatar: Demo.account.avatarURL(size: 128)?.absoluteString
        )
        let all = [me] + roster.filter { $0.id != me.id }

        meID = me.id
        host = me
        players = all
        state = .open
        stage = .lobby
        current = SceneEnvelope(
            scene: .lobby(LobbyScene(game: brief, host: me, players: all,
                                     min: info?.minPlayers ?? 2, max: info?.maxPlayers ?? 25)),
            text: nil,
            buttons: [],
            replace: false,
            sceneId: "demo"
        )
    }
}

// ————— أدوات داخلية —————

/// حامل الموارد الحيّة.
///
/// موجود لسبب واحد: `deinit` سياق غير معزول، ولمس حالة `@MainActor` منه ممنوع.
/// هذا الصنف مستقل بقفله الخاص، فيمكن إغلاق الوصلة من `deinit` بلا حيلة.
private final class SocketBin: @unchecked Sendable {
    private let lock = NSLock()
    private var socket: URLSessionWebSocketTask?
    private var jobs: [Task<Void, Never>] = []

    var current: URLSessionWebSocketTask? {
        lock.lock()
        defer { lock.unlock() }
        return socket
    }

    func hold(_ task: URLSessionWebSocketTask?) {
        lock.lock()
        let old = socket
        socket = task
        lock.unlock()
        old?.cancel(with: .goingAway, reason: nil)
    }

    func hold(job: Task<Void, Never>) {
        lock.lock()
        jobs.append(job)
        lock.unlock()
    }

    func stopJobs() {
        lock.lock()
        let running = jobs
        jobs = []
        lock.unlock()
        for job in running { job.cancel() }
    }

    func closeAll() {
        stopJobs()
        hold(nil)
    }
}

/// إطار صادر إلى الخادم — يقابل `Incoming` في `src/api/ws.ts`.
///
/// الحقول الاختيارية تُحذف عند الترميز، فرسالة `leave` تخرج `{"type":"leave"}`
/// بلا حقول فارغة تربك المفكّك هناك.
private struct Frame: Encodable {
    let type: String
    var gameId: String? = nil
    var guildId: String? = nil
    var roomId: String? = nil
    var text: String? = nil
    var id: String? = nil
}

/// رسالة واردة قبل التوزيع على الأنواع.
private struct Inbound: Decodable {
    let type: String
    let scene: GameScene?
    let text: String?
    let message: String?
    let buttons: [SceneButton]?
    let replace: Bool?
    let sceneId: String?
    let players: [ScenePlayer]?
    let result: OnlineResult?

    private enum Key: String, CodingKey {
        case type, scene, text, message, buttons, replace, sceneId, players, result
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        type = c.string(.type) ?? ""
        scene = c.one(GameScene.self, .scene)
        text = c.string(.text)
        message = c.string(.message)
        if let raw = try? c.decodeIfPresent([SceneButton].self, forKey: .buttons) {
            buttons = raw
        } else {
            buttons = nil
        }
        replace = c.bool(.replace)
        sceneId = c.string(.sceneId)
        let list = c.playerList(.players)
        players = list.isEmpty ? nil : list
        result = c.one(OnlineResult.self, .result)
    }
}

/// فكّ متسامح: الحقل الناقص أو المخالف للنوع يعيد `nil` بدل أن يرمي.
private extension KeyedDecodingContainer {
    func string(_ key: Key) -> String? {
        guard let value = try? decodeIfPresent(String.self, forKey: key), let text = value else {
            return nil
        }
        return text.isEmpty ? nil : text
    }

    func int(_ key: Key) -> Int? {
        if let value = try? decodeIfPresent(Int.self, forKey: key), let number = value {
            return number
        }
        if let value = try? decodeIfPresent(Double.self, forKey: key), let number = value {
            return Int(number)
        }
        return nil
    }

    func bool(_ key: Key) -> Bool? {
        guard let value = try? decodeIfPresent(Bool.self, forKey: key), let flag = value else {
            return nil
        }
        return flag
    }

    func one<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
        guard let value = try? decodeIfPresent(T.self, forKey: key), let item = value else {
            return nil
        }
        return item
    }

    func list<T: Decodable>(_ type: T.Type, _ key: Key) -> [T] {
        guard let value = try? decodeIfPresent([T].self, forKey: key), let items = value else {
            return []
        }
        return items
    }

    func intList(_ key: Key) -> [Int] {
        list(Int.self, key)
    }

    func player(_ key: Key) -> ScenePlayer? {
        one(ScenePlayer.self, key)
    }

    func playerList(_ key: Key) -> [ScenePlayer] {
        list(ScenePlayer.self, key)
    }

    func brief(_ key: Key) -> SceneBrief {
        one(SceneBrief.self, key) ?? SceneBrief()
    }
}
