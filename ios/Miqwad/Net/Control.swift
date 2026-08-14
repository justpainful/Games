import Foundation

// ————————————————————— ما يرسله الخادم —————————————————————
//
// الأشكال هنا مقيّدة بـ `src/panel/status.ts` و`src/panel/mount.ts` حرفيًا.
// أي إعادة تسمية حقل هناك تكسر الفكّ هنا بصمت وتنتهي برسالة «رد غير متوقّع»
// أمام المستخدم. والمفاتيح camelCase على الطرفين بلا تحويل، فلا استراتيجية
// أسماء تُخمّن ما لم يُكتب.

struct Hello: Decodable, Sendable {
    let service: String
    let bot: String?
    let online: Bool
    let guilds: Int
    let discordLogin: Bool
}

struct Who: Decodable, Sendable, Equatable {
    let id: String
    let via: String
    let name: String
}

struct PairReply: Decodable, Sendable {
    let token: String
    let user: Who
}

struct BotFacts: Decodable, Sendable {
    let online: Bool
    let tag: String?
    let id: String?
    let avatar: String?
    let pingMs: Int?
    let upSeconds: Int?
    let guilds: Int
    let members: Int
}

struct GameFacts: Decodable, Sendable {
    let count: Int
    let running: Int
}

struct DbFacts: Decodable, Sendable {
    let ok: Bool
    let ms: Int?
    let error: String?
}

struct HostFacts: Decodable, Sendable {
    let node: String
    let platform: String
    let rssMb: Int
    let upSeconds: Int
    let pid: Int
}

struct LiveSession: Decodable, Sendable, Identifiable {
    let game: String
    let guildId: String
    let guildName: String?
    let channelId: String
    let hostId: String
    let startedAt: Double
    let attempts: Int

    var id: String { channelId }
}

struct Status: Decodable, Sendable {
    let bot: BotFacts
    let games: GameFacts
    let db: DbFacts
    let host: HostFacts
    let live: [LiveSession]
}

struct GuildBrief: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let name: String
    let icon: String?
    let members: Int
}

struct Choice: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let name: String
    let color: Int?
}

struct Knob: Decodable, Sendable, Identifiable, Equatable {
    let key: String
    let name: String
    let about: String
    let min: Int
    let max: Int
    let unit: String
    let value: Int

    var id: String { key }
}

struct GameSetting: Decodable, Sendable, Identifiable, Equatable {
    let key: String
    let name: String
    let tagline: String
    let enabled: Bool
    let minPlayers: Int
    let maxPlayers: Int
    /// ما تقبل هذه اللعبة ضبطه. الفارغ يعني لعبة بلا مقابض، فلا يُفتح لها شيء.
    let tuning: [Knob]

    var id: String { key }
}

struct GuildRoles: Decodable, Sendable, Equatable {
    let ADMIN: [String]
    let GAMES: [String]
    let POINTS: [String]

    func of(_ kind: String) -> [String] {
        switch kind {
        case "ADMIN": ADMIN
        case "GAMES": GAMES
        default: POINTS
        }
    }
}

struct GuildView: Decodable, Sendable, Equatable {
    let guild: GuildBrief
    let prefix: String
    let prefixEnabled: Bool
    let bareCommands: Bool
    let gamesChannel: String?
    let leadersChannel: String?
    let nickname: String?
    let roles: GuildRoles
    let authorized: [String]
    let games: [GameSetting]
    let allRoles: [Choice]
    let allChannels: [Choice]
}

struct Applied: Decodable, Sendable {
    let said: String
    let guild: GuildView?
}

/// تعديل واحد على سيرفر.
///
/// نوع واحد لكل التعديلات لا نوع لكل واحد: الحقول الزائدة تُحذف عند الترميز،
/// والخادم يقرأ `kind` ويتحقّق مما يخصّه. وإضافة تعديل هنا سطر واحد.
struct Change: Encodable, Sendable {
    let kind: String
    var value: Value?
    var role: String?
    var roleId: String?
    var userId: String?
    var field: String?
    var gameKey: String?

    /// `value` قد يكون نصًّا أو منطقيًّا أو فراغًا، و`Encodable` لا يقبل `Any`.
    enum Value: Encodable, Sendable {
        case text(String)
        case flag(Bool)
        case number(Int)
        case none

        func encode(to encoder: Encoder) throws {
            var out = encoder.singleValueContainer()
            switch self {
            case .text(let text): try out.encode(text)
            case .flag(let flag): try out.encode(flag)
            case .number(let number): try out.encode(number)
            case .none: try out.encodeNil()
            }
        }
    }

    static func text(_ kind: String, _ value: String) -> Change {
        Change(kind: kind, value: .text(value))
    }
    static func flag(_ kind: String, _ value: Bool) -> Change {
        Change(kind: kind, value: .flag(value))
    }
    static func pick(_ kind: String, _ id: String?) -> Change {
        Change(kind: kind, value: id.map(Value.text) ?? .none)
    }
    static func role(_ kind: String, _ roleId: String, _ on: Bool) -> Change {
        Change(kind: "role", value: .flag(on), role: kind, roleId: roleId)
    }
    static func game(_ key: String, _ on: Bool) -> Change {
        Change(kind: "game", value: .flag(on), gameKey: key)
    }
    static func knob(_ gameKey: String, _ field: String, _ value: Int) -> Change {
        Change(kind: "knob", value: .number(value), field: field, gameKey: gameKey)
    }
    static func authorized(_ userId: String, _ on: Bool) -> Change {
        Change(kind: "authorized", value: .flag(on), userId: userId)
    }
}

// ————————————————————— العميل —————————————————————

/// عميل التحكّم.
///
/// عنوان الخادم ليس ثابتًا في الحزمة كما في تطبيق الألعاب: هو ما وجده
/// `Finder` على الشبكة أو ما أدخله المستخدم، ويتبدّل بين تشغيل وآخر. ولذلك
/// يُمرَّر مع كل طلب بدل أن يُقرأ من `Info.plist`.
struct Control: Sendable {
    let base: String
    var token: String?

    enum Failure: Error, LocalizedError {
        case unreachable
        case unauthorized
        case server(Int, String)
        case malformed(String)

        var errorDescription: String? {
            switch self {
            case .unreachable: "ما وصلت للجهاز. تأكّد أن البوت شغّال وأنك على نفس الواي فاي."
            case .unauthorized: "انتهت الجلسة. أعد الاقتران."
            case .server(let code, let why): why.isEmpty ? "خطأ من الخادم (\(code))" : why
            case .malformed(let what): "رد غير متوقّع: \(what)"
            }
        }
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(path, method: "GET", body: nil)
    }

    func post<T: Decodable, B: Encodable>(_ path: String, _ body: B) async throws -> T {
        try await send(path, method: "POST", body: try JSONEncoder().encode(body))
    }

    private func send<T: Decodable>(_ path: String, method: String, body: Data?) async throws -> T {
        guard let url = URL(string: base + path) else { throw Failure.malformed(path) }

        var request = URLRequest(url: url)
        request.httpMethod = method
        // ثوانٍ قليلة عمدًا: الجهاز على نفس الشبكة يردّ في مللي ثانية، ومهلة
        // طويلة تعني شاشة تدور نصف دقيقة قبل أن تقول «ما وصلت»
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = body

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw Failure.unreachable
        }

        guard let http = response as? HTTPURLResponse else { throw Failure.malformed("بلا حالة HTTP") }
        if http.statusCode == 401 { throw Failure.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let why = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? ""
            throw Failure.server(http.statusCode, why)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw Failure.malformed(String(describing: T.self))
        }
    }
}
